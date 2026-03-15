"""Strands agentic loop orchestrator for multi-agent iterative reasoning."""
from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass, field
from typing import Literal, Optional

try:
    from strands import Agent
    from strands.models.bedrock import BedrockModel
except ImportError:  # pragma: no cover
    Agent = None
    BedrockModel = None

from logger_util import get_logger, log

_logger = get_logger()


def _log(level, event_type, data):
    log(_logger, level, event_type, data, service="verification-agent")


def _clamp_max_turns(value: int) -> int:
    """Clamp max_turns to valid range 1-10, defaulting to 5 if out of range."""
    if isinstance(value, int) and 1 <= value <= 10:
        return value
    return 5


@dataclass
class OrchestrationRequest:
    user_text: str
    thread_context: Optional[str]
    file_references: list
    available_agents: dict
    correlation_id: str
    max_turns: int = 5
    channel: str = ""
    bot_token: str = ""

    def __post_init__(self):
        self.max_turns = _clamp_max_turns(self.max_turns)


VALID_COMPLETION_STATUSES = {"complete", "partial", "error"}
VALID_TOOL_STATUSES = {"success", "error"}


@dataclass
class OrchestrationResult:
    synthesized_text: str
    turns_used: int
    agents_called: list
    file_artifact: Optional[dict]
    completion_status: str

    def __post_init__(self):
        if self.completion_status not in VALID_COMPLETION_STATUSES:
            raise ValueError(
                f"completion_status must be one of {VALID_COMPLETION_STATUSES}, "
                f"got '{self.completion_status}'"
            )


@dataclass
class ToolCallRecord:
    turn_number: int
    tool_name: str
    tool_input: dict
    status: str
    duration_ms: int
    timestamp: str

    def __post_init__(self):
        if self.status not in VALID_TOOL_STATUSES:
            raise ValueError(
                f"status must be one of {VALID_TOOL_STATUSES}, got '{self.status}'"
            )


ORCHESTRATOR_SYSTEM_PROMPT = """\
You are an orchestration agent for a Slack AI assistant. Your role is to decompose \
user requests and dispatch them to the most capable specialist agents.

## Instructions

1. **Analyze** the user request and identify all domains/tasks involved.
2. **Dispatch** to multiple specialist agents simultaneously when the request spans multiple domains.
3. **Synthesize** all results into a single, comprehensive, coherent Japanese response.
4. **Attribute** which information came from which specialist when relevant.
5. **Retry** — If a tool returns a result starting with "ERROR:", reason about the failure and \
retry with different parameters or try an alternative approach in the next turn.
6. **Fail gracefully** — If all agents return errors, explain clearly which parts succeeded \
and which failed.

## Slack Search
When the user requests a Slack search, references a Slack message URL, or asks to retrieve \
channel history or thread content, use the `slack_search` tool. \
Pass the full user request as the query so the Slack Search Agent can interpret the intent.

## Response guidelines
- Respond in Japanese.
- Be comprehensive but concise.
- Do not mention internal routing or agent names unless directly relevant.
- Synthesize results into a flowing answer, not a bulleted list of raw outputs.
"""


class OrchestrationAgent:
    """Strands agentic loop orchestrator for multi-agent iterative reasoning."""

    def __init__(
        self,
        agent_registry: dict,
        bedrock_model,
        max_turns: int = 5,
        channel: str = "",
        bot_token: str = "",
        correlation_id: str = "",
    ):
        from agent_tools import build_agent_tools
        from hooks import MaxTurnsHook, ToolLoggingHook

        self._max_turns = _clamp_max_turns(max_turns)
        self._registry = agent_registry
        self._model = bedrock_model
        self._file_artifact_store: dict = {}
        self._tools = build_agent_tools(agent_registry, self._file_artifact_store)

        # Add Slack Search tool when ARN is configured and request context is available
        if channel and bot_token and os.environ.get("SLACK_SEARCH_AGENT_ARN"):
            from slack_search_tool import make_slack_search_tool
            slack_tool = make_slack_search_tool(channel, bot_token, correlation_id)
            self._tools.append(slack_tool)

        self._max_turns_hook = MaxTurnsHook(self._max_turns)
        self._logging_hook = ToolLoggingHook()

        if Agent is not None:
            self._agent = Agent(
                model=bedrock_model,
                tools=self._tools,
                system_prompt=ORCHESTRATOR_SYSTEM_PROMPT,
                hooks=[self._max_turns_hook, self._logging_hook],
            )
        else:  # pragma: no cover
            self._agent = None

    def run(self, request: OrchestrationRequest) -> OrchestrationResult:
        """Execute the agentic loop for the given orchestration request."""
        self._logging_hook.correlation_id = request.correlation_id

        prompt = _build_prompt(request)

        if self._agent is None:  # pragma: no cover
            return OrchestrationResult(
                synthesized_text="エラー: AI エンジンが利用できません。",
                turns_used=0,
                agents_called=[],
                file_artifact=None,
                completion_status="error",
            )

        try:
            result = self._agent(prompt)
            file_artifact = self._file_artifact_store.get("file_artifact")
            return _parse_result(result, self._max_turns_hook, self._logging_hook, file_artifact)
        except Exception as e:
            _log("ERROR", "orchestration_loop_error", {
                "correlation_id": request.correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
            })
            return OrchestrationResult(
                synthesized_text="エラーが発生しました。しばらくしてからお試しください。",
                turns_used=0,
                agents_called=self._logging_hook.agents_called,
                file_artifact=None,
                completion_status="error",
            )


def _build_prompt(request: OrchestrationRequest) -> str:
    """Construct the LLM prompt from an OrchestrationRequest."""
    parts = []
    if request.thread_context:
        parts.append(f"## スレッドコンテキスト\n{request.thread_context}")
    if request.file_references:
        refs = "\n".join(
            f"- {r.get('name', r.get('filename', 'file'))} ({r.get('presigned_url', '')})"
            if isinstance(r, dict) else str(r)
            for r in request.file_references
        )
        parts.append(f"## 添付ファイル\n{refs}")
    parts.append(f"## ユーザーリクエスト\n{request.user_text}")
    return "\n\n".join(parts)


def _extract_text(result) -> str:
    """Best-effort extraction of plain text from Strands agent output."""
    if result is None:
        return ""
    if isinstance(result, str):
        return result.strip()
    message = getattr(result, "message", None)
    if isinstance(message, str):
        return message.strip()
    output_text = getattr(result, "output_text", None)
    if isinstance(output_text, str):
        return output_text.strip()
    text = str(result).strip()
    return "" if text == "None" else text


def _parse_result(result, max_turns_hook, logging_hook, file_artifact=None) -> OrchestrationResult:
    """Convert Strands agent result to OrchestrationResult."""
    synthesized_text = _extract_text(result)
    agents_called = logging_hook.agents_called

    # Determine completion_status
    if max_turns_hook.fired:
        completion_status = "partial"
    elif not synthesized_text or (not agents_called and "ERROR" in (synthesized_text or "")):
        completion_status = "error"
    else:
        completion_status = "complete"

    if not synthesized_text:
        synthesized_text = "処理を完了できませんでした。もう一度お試しください。"

    return OrchestrationResult(
        synthesized_text=synthesized_text,
        turns_used=max_turns_hook._tool_call_count,
        agents_called=agents_called,
        file_artifact=file_artifact,
        completion_status=completion_status,
    )


def run_orchestration_loop(
    request: OrchestrationRequest,
    agent_registry: dict,
    bedrock_model,
) -> OrchestrationResult:
    """Thin wrapper used by pipeline.py to run the orchestration loop."""
    orchestrator = OrchestrationAgent(
        agent_registry,
        bedrock_model,
        request.max_turns,
        channel=request.channel,
        bot_token=request.bot_token,
        correlation_id=request.correlation_id,
    )
    return orchestrator.run(request)
