"""
Unit tests for hooks.py — MaxTurnsHook and ToolLoggingHook.

TDD: these tests are written BEFORE the implementation and MUST FAIL initially.
After implementing src/hooks.py they should all pass (GREEN).
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Mock event classes (stand-ins for strands.hooks.events types)
# ---------------------------------------------------------------------------

class MockBeforeToolCallEvent:
    def __init__(self, tool_name="test_tool", tool_input=None, tool_use_id="id-1"):
        self.tool_use = {
            "name": tool_name,
            "input": tool_input or {},
            "toolUseId": tool_use_id,
        }
        self.cancel_tool = None


class MockAfterToolCallEvent:
    def __init__(self, tool_name="test_tool", status="success", tool_use_id="id-1"):
        self.tool_use = {
            "name": tool_name,
            "input": {},
            "toolUseId": tool_use_id,
        }
        self.result = {"status": status, "content": [{"text": "result"}]}


class MockBeforeInvocationEvent:
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_registry():
    """Return a simple registry mock that stores callbacks by event type."""
    registry = MagicMock()
    registry._callbacks = {}

    def add_callback(event_type, fn):
        registry._callbacks.setdefault(event_type, []).append(fn)

    registry.add_callback.side_effect = add_callback
    return registry


# ---------------------------------------------------------------------------
# MaxTurnsHook tests
# ---------------------------------------------------------------------------

class TestMaxTurnsHook:
    def _get_hook(self):
        from src.hooks import MaxTurnsHook  # noqa: PLC0415
        return MaxTurnsHook

    def test_max_turns_hook_increments_on_before_tool_call(self):
        """Turn count increments on each BeforeToolCallEvent."""
        MaxTurnsHook = self._get_hook()
        hook = MaxTurnsHook(max_turns=10)
        assert hook._tool_call_count == 0

        event1 = MockBeforeToolCallEvent()
        hook._check(event1)
        assert hook._tool_call_count == 1

        event2 = MockBeforeToolCallEvent()
        hook._check(event2)
        assert hook._tool_call_count == 2

    def test_max_turns_hook_cancels_at_limit(self):
        """When tool_call_count reaches max_turns, event.cancel_tool is set."""
        MaxTurnsHook = self._get_hook()
        hook = MaxTurnsHook(max_turns=3)

        for _ in range(2):
            hook._check(MockBeforeToolCallEvent())

        # Third call hits limit (count becomes 3 == max_turns=3)
        event = MockBeforeToolCallEvent()
        hook._check(event)
        assert event.cancel_tool is not None
        assert isinstance(event.cancel_tool, str)
        assert len(event.cancel_tool) > 0

    def test_max_turns_hook_does_not_cancel_below_limit(self):
        """No cancel when under the limit."""
        MaxTurnsHook = self._get_hook()
        hook = MaxTurnsHook(max_turns=5)

        for _ in range(4):
            event = MockBeforeToolCallEvent()
            hook._check(event)
            assert event.cancel_tool is None, f"Unexpected cancel at count {hook._tool_call_count}"

    def test_max_turns_hook_resets_on_before_invocation(self):
        """_tool_call_count resets to 0 and fired resets to False on BeforeInvocationEvent."""
        MaxTurnsHook = self._get_hook()
        hook = MaxTurnsHook(max_turns=2)

        # Drive to limit so fired becomes True
        for _ in range(2):
            hook._check(MockBeforeToolCallEvent())
        assert hook._tool_call_count == 2
        assert hook.fired is True

        # Reset via BeforeInvocationEvent
        hook._reset(MockBeforeInvocationEvent())
        assert hook._tool_call_count == 0
        assert hook.fired is False

    def test_max_turns_hook_fired_property(self):
        """fired is False before limit, True after cancel fires."""
        MaxTurnsHook = self._get_hook()
        hook = MaxTurnsHook(max_turns=2)

        assert hook.fired is False

        hook._check(MockBeforeToolCallEvent())
        assert hook.fired is False  # count=1, limit=2 — no cancel yet

        hook._check(MockBeforeToolCallEvent())
        assert hook.fired is True   # count=2 == limit=2 — cancel fired

    def test_max_turns_hook_registers_hooks(self):
        """register_hooks registers callbacks for BeforeInvocationEvent and BeforeToolCallEvent."""
        MaxTurnsHook = self._get_hook()
        hook = MaxTurnsHook(max_turns=5)
        registry = _make_registry()
        hook.register_hooks(registry)

        assert registry.add_callback.call_count == 2

        # Verify both event types were registered
        registered_types = [call.args[0] for call in registry.add_callback.call_args_list]
        # We compare by string name to avoid needing real strands imports in tests
        type_names = [getattr(t, "__name__", str(t)) for t in registered_types]
        assert "BeforeInvocationEvent" in type_names
        assert "BeforeToolCallEvent" in type_names


# ---------------------------------------------------------------------------
# ToolLoggingHook tests
# ---------------------------------------------------------------------------

class TestToolLoggingHook:
    def _get_hook(self):
        from src.hooks import ToolLoggingHook  # noqa: PLC0415
        return ToolLoggingHook

    def test_tool_logging_hook_logs_on_after_tool_call(self):
        """Emits a structured log entry on AfterToolCallEvent."""
        ToolLoggingHook = self._get_hook()
        hook = ToolLoggingHook(correlation_id="corr-001")

        event = MockAfterToolCallEvent(tool_name="some_tool", status="success")

        with patch("src.hooks._log") as mock_log:
            hook._after_tool(event)

        mock_log.assert_called_once()
        call_args = mock_log.call_args
        assert call_args[0][0] == "INFO"
        assert call_args[0][1] == "tool_call_record"
        data = call_args[0][2]
        assert data["tool_name"] == "some_tool"
        assert data["status"] == "success"
        assert "duration_ms" in data
        assert data["correlation_id"] == "corr-001"

    def test_tool_logging_hook_tracks_agents_called(self):
        """When tool name starts with invoke_, the agent id is tracked in agents_called."""
        ToolLoggingHook = self._get_hook()
        hook = ToolLoggingHook(correlation_id="corr-002")

        with patch("src.hooks._log"):
            event1 = MockAfterToolCallEvent(tool_name="invoke_execution_agent", tool_use_id="id-2")
            hook._after_tool(event1)

            event2 = MockAfterToolCallEvent(tool_name="invoke_docs_agent", tool_use_id="id-3")
            hook._after_tool(event2)

        assert "execution-agent" in hook.agents_called
        assert "docs-agent" in hook.agents_called
        assert len(hook.agents_called) == 2

    def test_tool_logging_hook_resets_on_before_invocation(self):
        """agents_called clears on BeforeInvocationEvent."""
        ToolLoggingHook = self._get_hook()
        hook = ToolLoggingHook(correlation_id="corr-003")

        # Populate state
        with patch("src.hooks._log"):
            event = MockAfterToolCallEvent(tool_name="invoke_some_agent", tool_use_id="id-4")
            hook._after_tool(event)

        assert len(hook.agents_called) == 1

        hook._reset(MockBeforeInvocationEvent())
        assert hook.agents_called == []

    def test_tool_logging_hook_registers_hooks(self):
        """register_hooks registers callbacks for BeforeInvocationEvent, BeforeToolCallEvent, and AfterToolCallEvent."""
        ToolLoggingHook = self._get_hook()
        hook = ToolLoggingHook()
        registry = _make_registry()
        hook.register_hooks(registry)

        assert registry.add_callback.call_count == 3

        registered_types = [call.args[0] for call in registry.add_callback.call_args_list]
        type_names = [getattr(t, "__name__", str(t)) for t in registered_types]
        assert "BeforeInvocationEvent" in type_names
        assert "BeforeToolCallEvent" in type_names
        assert "AfterToolCallEvent" in type_names

    def test_tool_logging_hook_deduplicates_agents_called(self):
        """agents_called property returns deduplicated list."""
        ToolLoggingHook = self._get_hook()
        hook = ToolLoggingHook()

        with patch("src.hooks._log"):
            for i in range(3):
                hook._after_tool(
                    MockAfterToolCallEvent(tool_name="invoke_execution_agent", tool_use_id=f"id-{i}")
                )

        assert hook.agents_called == ["execution-agent"]
        assert len(hook.agents_called) == 1

    def test_status_is_error_when_tool_returns_error_string(self):
        """When tool returns a string starting with 'ERROR:', status in log entry must be 'error'."""
        ToolLoggingHook = self._get_hook()
        hook = ToolLoggingHook(correlation_id="corr-err")

        event = MagicMock()
        event.tool_use = {"name": "invoke_docs_agent", "input": {}, "toolUseId": "id-err"}
        event.result = "ERROR: agent_not_found — No ARN for docs-agent"

        with patch("src.hooks._log") as mock_log:
            hook._after_tool(event)

        data = mock_log.call_args[0][2]
        assert data["status"] == "error"

    def test_status_is_success_when_tool_returns_success_string(self):
        """When tool returns a non-error string, status in log entry must be 'success'."""
        ToolLoggingHook = self._get_hook()
        hook = ToolLoggingHook(correlation_id="corr-ok")

        event = MagicMock()
        event.tool_use = {"name": "invoke_time_agent", "input": {}, "toolUseId": "id-ok"}
        event.result = "現在時刻は 14:00 です。"

        with patch("src.hooks._log") as mock_log:
            hook._after_tool(event)

        data = mock_log.call_args[0][2]
        assert data["status"] == "success"
