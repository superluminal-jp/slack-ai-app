"""Loop control and observability hooks for the agentic orchestration loop."""
import time

try:
    from strands.hooks import HookProvider, HookRegistry
    from strands.hooks.events import (
        AfterToolCallEvent,
        BeforeInvocationEvent,
        BeforeToolCallEvent,
    )
except ImportError:  # pragma: no cover
    HookProvider = object
    HookRegistry = None
    AfterToolCallEvent = None
    BeforeInvocationEvent = None
    BeforeToolCallEvent = None

from logger_util import get_logger, log

_logger = get_logger()


def _log(level, event_type, data):
    log(_logger, level, event_type, data, service="verification-agent")


class MaxTurnsHook(HookProvider):
    """Enforces maximum agentic loop turns (tool calls) per request (FR-006)."""

    def __init__(self, max_turns: int = 5):
        self.max_turns = max_turns
        self._tool_call_count = 0
        self._fired = False

    @property
    def fired(self) -> bool:
        return self._fired

    def register_hooks(self, registry) -> None:
        registry.add_callback(BeforeInvocationEvent, self._reset)
        registry.add_callback(BeforeToolCallEvent, self._check)

    def _reset(self, event) -> None:
        self._tool_call_count = 0
        self._fired = False

    def _check(self, event) -> None:
        self._tool_call_count += 1
        if self._tool_call_count >= self.max_turns:
            self._fired = True
            event.cancel_tool = (
                "Maximum reasoning turns reached. "
                "Synthesize a final answer from results collected so far."
            )


class ToolLoggingHook(HookProvider):
    """Emits structured log entry for every tool call (FR-009)."""

    def __init__(self, correlation_id: str = ""):
        self.correlation_id = correlation_id
        self._agents_called: list = []
        self._call_starts: dict = {}

    @property
    def agents_called(self) -> list:
        """Deduplicated list of execution agent IDs called during the loop."""
        seen = []
        for a in self._agents_called:
            if a not in seen:
                seen.append(a)
        return seen

    def register_hooks(self, registry) -> None:
        registry.add_callback(BeforeInvocationEvent, self._reset)
        registry.add_callback(BeforeToolCallEvent, self._before_tool)
        registry.add_callback(AfterToolCallEvent, self._after_tool)

    def _reset(self, event) -> None:
        self._agents_called = []
        self._call_starts = {}

    def _before_tool(self, event) -> None:
        tool_use_id = event.tool_use.get("toolUseId", event.tool_use.get("name", ""))
        self._call_starts[tool_use_id] = time.time()

    def _after_tool(self, event) -> None:
        tool_name = event.tool_use.get("name", "unknown")
        tool_use_id = event.tool_use.get("toolUseId", tool_name)
        tool_input = event.tool_use.get("input", {})

        start = self._call_starts.pop(tool_use_id, time.time())
        duration_ms = int((time.time() - start) * 1000)

        result = event.result
        if isinstance(result, dict):
            status = "error" if result.get("status") == "error" else "success"
        elif isinstance(result, str) and result.startswith("ERROR:"):
            status = "error"
        else:
            status = "success"

        if tool_name.startswith("invoke_"):
            agent_id = tool_name[len("invoke_"):].replace("_", "-")
            self._agents_called.append(agent_id)

        _log("INFO", "tool_call_record", {
            "tool_name": tool_name,
            "tool_input": tool_input if isinstance(tool_input, dict) else {},
            "status": status,
            "duration_ms": duration_ms,
            "correlation_id": self.correlation_id,
        })
