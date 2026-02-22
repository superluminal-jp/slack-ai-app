"""Tests for orchestrator.py — dataclasses (Phase 2) and OrchestrationAgent.run() (Phase 3)."""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestOrchestrationRequest:
    def test_orchestration_request_required_fields(self):
        from src.orchestrator import OrchestrationRequest

        req = OrchestrationRequest(
            user_text="Hello",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="test-123",
        )
        assert req.user_text == "Hello"
        assert req.thread_context is None
        assert req.file_references == []
        assert req.available_agents == {}
        assert req.correlation_id == "test-123"

    def test_orchestration_request_max_turns_default(self):
        from src.orchestrator import OrchestrationRequest

        req = OrchestrationRequest(
            user_text="Hello",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="test-456",
        )
        assert req.max_turns == 5

    def test_orchestration_request_max_turns_out_of_range_clamped(self):
        from src.orchestrator import OrchestrationRequest

        # Below range: 0 -> clamped to 5
        req_low = OrchestrationRequest(
            user_text="Hello",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="test-low",
            max_turns=0,
        )
        assert req_low.max_turns == 5

        # Above range: 11 -> clamped to 5
        req_high = OrchestrationRequest(
            user_text="Hello",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="test-high",
            max_turns=11,
        )
        assert req_high.max_turns == 5

        # Boundary values should NOT be clamped
        req_min = OrchestrationRequest(
            user_text="Hello",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="test-min",
            max_turns=1,
        )
        assert req_min.max_turns == 1

        req_max = OrchestrationRequest(
            user_text="Hello",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="test-max",
            max_turns=10,
        )
        assert req_max.max_turns == 10


class TestOrchestrationResult:
    def test_orchestration_result_fields(self):
        from src.orchestrator import OrchestrationResult

        result = OrchestrationResult(
            synthesized_text="All done.",
            turns_used=3,
            agents_called=["agent-a", "agent-b"],
            file_artifact=None,
            completion_status="complete",
        )
        assert result.synthesized_text == "All done."
        assert result.turns_used == 3
        assert result.agents_called == ["agent-a", "agent-b"]
        assert result.file_artifact is None
        assert result.completion_status == "complete"

    def test_orchestration_result_valid_completion_status(self):
        from src.orchestrator import OrchestrationResult

        # Valid statuses must not raise
        for status in ("complete", "partial", "error"):
            r = OrchestrationResult(
                synthesized_text="text",
                turns_used=1,
                agents_called=[],
                file_artifact=None,
                completion_status=status,
            )
            assert r.completion_status == status

        # Invalid status must raise ValueError
        with pytest.raises(ValueError):
            OrchestrationResult(
                synthesized_text="text",
                turns_used=1,
                agents_called=[],
                file_artifact=None,
                completion_status="unknown",
            )


class TestToolCallRecord:
    def test_tool_call_record_fields(self):
        from src.orchestrator import ToolCallRecord

        record = ToolCallRecord(
            turn_number=1,
            tool_name="call_agent",
            tool_input={"agent_id": "agent-x"},
            status="success",
            duration_ms=120,
            timestamp="2026-02-21T00:00:00Z",
        )
        assert record.turn_number == 1
        assert record.tool_name == "call_agent"
        assert record.tool_input == {"agent_id": "agent-x"}
        assert record.status == "success"
        assert record.duration_ms == 120
        assert record.timestamp == "2026-02-21T00:00:00Z"

    def test_tool_call_record_status_valid(self):
        from src.orchestrator import ToolCallRecord

        # Valid statuses must not raise
        for status in ("success", "error"):
            r = ToolCallRecord(
                turn_number=1,
                tool_name="call_agent",
                tool_input={},
                status=status,
                duration_ms=10,
                timestamp="2026-02-21T00:00:00Z",
            )
            assert r.status == status

        # Invalid status must raise ValueError
        with pytest.raises(ValueError):
            ToolCallRecord(
                turn_number=1,
                tool_name="call_agent",
                tool_input={},
                status="pending",
                duration_ms=10,
                timestamp="2026-02-21T00:00:00Z",
            )


class TestOrchestrationAgentRun:
    """Phase 3 (US1) — T010, T011: OrchestrationAgent.run() behaviour."""

    def _make_request(self, **kwargs):
        from src.orchestrator import OrchestrationRequest

        defaults = dict(
            user_text="テスト質問",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="run-test-001",
            max_turns=5,
        )
        defaults.update(kwargs)
        return OrchestrationRequest(**defaults)

    def test_run_dispatches_and_returns_synthesized_result(self):
        """T010: run() returns synthesized_text, agents_called, completion_status='complete'."""
        from src.orchestrator import OrchestrationAgent, OrchestrationResult

        registry = {
            "docs-agent": {"name": "Docs Agent", "description": "Documentation", "skills": []},
            "time-agent": {"name": "Time Agent", "description": "Time queries", "skills": []},
        }
        mock_bedrock = MagicMock()

        with patch("src.orchestrator.Agent") as MockAgent, \
             patch("hooks.MaxTurnsHook") as MockMaxTurns, \
             patch("hooks.ToolLoggingHook") as MockLogging, \
             patch("agent_tools.build_agent_tools", return_value=[]):

            mock_max_hook = MagicMock()
            mock_max_hook.fired = False
            mock_max_hook._tool_call_count = 2
            MockMaxTurns.return_value = mock_max_hook

            mock_log_hook = MagicMock()
            mock_log_hook.agents_called = ["docs-agent", "time-agent"]
            MockLogging.return_value = mock_log_hook

            mock_agent_inst = MagicMock()
            mock_agent_inst.return_value = "ドキュメントとタイムゾーンの情報をまとめました。"
            MockAgent.return_value = mock_agent_inst

            orch = OrchestrationAgent(registry, mock_bedrock, max_turns=5)
            result = orch.run(self._make_request())

        assert isinstance(result, OrchestrationResult)
        assert result.synthesized_text == "ドキュメントとタイムゾーンの情報をまとめました。"
        assert "docs-agent" in result.agents_called
        assert "time-agent" in result.agents_called
        assert result.completion_status == "complete"
        assert result.turns_used == 2

    def test_run_returns_complete_when_one_agent_errors(self):
        """T011: When one agent returns ERROR: but synthesized_text is non-empty, status is 'complete'."""
        from src.orchestrator import OrchestrationAgent, OrchestrationResult

        registry = {"docs-agent": {"name": "Docs", "description": "d", "skills": []}}
        mock_bedrock = MagicMock()

        with patch("src.orchestrator.Agent") as MockAgent, \
             patch("hooks.MaxTurnsHook") as MockMaxTurns, \
             patch("hooks.ToolLoggingHook") as MockLogging, \
             patch("agent_tools.build_agent_tools", return_value=[]):

            mock_max_hook = MagicMock()
            mock_max_hook.fired = False
            mock_max_hook._tool_call_count = 1
            MockMaxTurns.return_value = mock_max_hook

            mock_log_hook = MagicMock()
            mock_log_hook.agents_called = ["docs-agent"]
            MockLogging.return_value = mock_log_hook

            mock_agent_inst = MagicMock()
            mock_agent_inst.return_value = "一部のエージェントでエラーが発生しましたが、回答を提供します。"
            MockAgent.return_value = mock_agent_inst

            orch = OrchestrationAgent(registry, mock_bedrock)
            result = orch.run(self._make_request())

        assert result.completion_status == "complete"
        assert result.synthesized_text != ""
        assert result.agents_called == ["docs-agent"]


class TestOrchestrationAgentUS2:
    """Phase 4 (US2) — T018, T019: Iterative loop behaviour."""

    def _make_request(self, max_turns=5):
        from src.orchestrator import OrchestrationRequest
        return OrchestrationRequest(
            user_text="複数ステップのタスク",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="us2-test-001",
            max_turns=max_turns,
        )

    def test_two_turn_loop_turns_used_equals_two(self):
        """T018: Two tool calls across turns → OrchestrationResult.turns_used == 2."""
        from src.orchestrator import OrchestrationAgent

        mock_bedrock = MagicMock()

        with patch("src.orchestrator.Agent") as MockAgent, \
             patch("hooks.MaxTurnsHook") as MockMaxTurns, \
             patch("hooks.ToolLoggingHook") as MockLogging, \
             patch("agent_tools.build_agent_tools", return_value=[]):

            mock_max_hook = MagicMock()
            mock_max_hook.fired = False
            mock_max_hook._tool_call_count = 2
            MockMaxTurns.return_value = mock_max_hook

            mock_log_hook = MagicMock()
            mock_log_hook.agents_called = ["docs-agent"]
            MockLogging.return_value = mock_log_hook

            mock_agent_inst = MagicMock()
            mock_agent_inst.return_value = "2ターンで完了しました。"
            MockAgent.return_value = mock_agent_inst

            orch = OrchestrationAgent({}, mock_bedrock, max_turns=5)
            result = orch.run(self._make_request())

        assert result.turns_used == 2
        assert result.completion_status == "complete"

    def test_max_turns_hook_firing_sets_partial_status(self):
        """T019: MaxTurnsHook fires at turn limit → completion_status == 'partial'."""
        from src.orchestrator import OrchestrationAgent

        mock_bedrock = MagicMock()

        with patch("src.orchestrator.Agent") as MockAgent, \
             patch("hooks.MaxTurnsHook") as MockMaxTurns, \
             patch("hooks.ToolLoggingHook") as MockLogging, \
             patch("agent_tools.build_agent_tools", return_value=[]):

            mock_max_hook = MagicMock()
            mock_max_hook.fired = True  # Hook fired at turn limit
            mock_max_hook._tool_call_count = 5
            MockMaxTurns.return_value = mock_max_hook

            mock_log_hook = MagicMock()
            mock_log_hook.agents_called = ["docs-agent"]
            MockLogging.return_value = mock_log_hook

            mock_agent_inst = MagicMock()
            mock_agent_inst.return_value = "ターン制限に達したため、収集した情報を基に回答します。"
            MockAgent.return_value = mock_agent_inst

            orch = OrchestrationAgent({}, mock_bedrock, max_turns=5)
            result = orch.run(self._make_request())

        assert result.completion_status == "partial"
        assert result.synthesized_text  # Non-empty


class TestOrchestrationAgentUS3:
    """Phase 5 (US3) — T024, T025: Self-correction and all-error detection."""

    def _make_request(self):
        from src.orchestrator import OrchestrationRequest
        return OrchestrationRequest(
            user_text="失敗してリトライするタスク",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="us3-test-001",
            max_turns=5,
        )

    def test_error_on_turn1_then_success_is_complete(self):
        """T024: Tool returns ERROR on turn 1, success on turn 2 → completion_status == 'complete'."""
        from src.orchestrator import OrchestrationAgent

        mock_bedrock = MagicMock()

        with patch("src.orchestrator.Agent") as MockAgent, \
             patch("hooks.MaxTurnsHook") as MockMaxTurns, \
             patch("hooks.ToolLoggingHook") as MockLogging, \
             patch("agent_tools.build_agent_tools", return_value=[]):

            mock_max_hook = MagicMock()
            mock_max_hook.fired = False
            mock_max_hook._tool_call_count = 2
            MockMaxTurns.return_value = mock_max_hook

            mock_log_hook = MagicMock()
            mock_log_hook.agents_called = ["docs-agent"]
            MockLogging.return_value = mock_log_hook

            mock_agent_inst = MagicMock()
            # Synthesized text is non-empty (LLM handled the retry internally)
            mock_agent_inst.return_value = "リトライ後に正常に回答できました。"
            MockAgent.return_value = mock_agent_inst

            orch = OrchestrationAgent({}, mock_bedrock)
            result = orch.run(self._make_request())

        assert result.completion_status == "complete"
        assert result.synthesized_text != ""

    def test_all_agent_errors_sets_error_status(self):
        """T025: All tool results are ERROR + no agents_called → completion_status == 'error'."""
        from src.orchestrator import OrchestrationAgent

        mock_bedrock = MagicMock()

        with patch("src.orchestrator.Agent") as MockAgent, \
             patch("hooks.MaxTurnsHook") as MockMaxTurns, \
             patch("hooks.ToolLoggingHook") as MockLogging, \
             patch("agent_tools.build_agent_tools", return_value=[]):

            mock_max_hook = MagicMock()
            mock_max_hook.fired = False
            mock_max_hook._tool_call_count = 5
            MockMaxTurns.return_value = mock_max_hook

            mock_log_hook = MagicMock()
            mock_log_hook.agents_called = []  # No agents succeeded
            MockLogging.return_value = mock_log_hook

            mock_agent_inst = MagicMock()
            # Strands returns empty when all tools errored and LLM can't synthesize
            mock_agent_inst.return_value = ""
            MockAgent.return_value = mock_agent_inst

            orch = OrchestrationAgent({}, mock_bedrock)
            result = orch.run(self._make_request())

        assert result.completion_status == "error"
        assert result.synthesized_text  # Non-empty fallback message


class TestOrchestrationFileArtifactPropagation:
    """Verify file_artifact propagates from _file_artifact_store through run()."""

    def _make_request(self):
        from src.orchestrator import OrchestrationRequest

        return OrchestrationRequest(
            user_text="ファイルを作成してください",
            thread_context=None,
            file_references=[],
            available_agents={},
            correlation_id="file-test-001",
            max_turns=5,
        )

    def test_run_propagates_file_artifact_when_store_populated(self):
        """OrchestrationResult.file_artifact is set when a tool writes to _file_artifact_store during run()."""
        from src.orchestrator import OrchestrationAgent, OrchestrationResult

        sample_artifact = {
            "artifactId": "test-artifact-001",
            "name": "generated_file",
            "parts": [{"contentBase64": "aGVsbG8=", "fileName": "output.txt", "mimeType": "text/plain"}],
        }
        mock_bedrock = MagicMock()

        with patch("src.orchestrator.Agent") as MockAgent, \
             patch("hooks.MaxTurnsHook") as MockMaxTurns, \
             patch("hooks.ToolLoggingHook") as MockLogging, \
             patch("agent_tools.build_agent_tools", return_value=[]):

            mock_max_hook = MagicMock()
            mock_max_hook.fired = False
            mock_max_hook._tool_call_count = 1
            MockMaxTurns.return_value = mock_max_hook

            mock_log_hook = MagicMock()
            mock_log_hook.agents_called = ["file-creator-agent"]
            MockLogging.return_value = mock_log_hook

            mock_agent_inst = MagicMock()
            MockAgent.return_value = mock_agent_inst

            orch = OrchestrationAgent({}, mock_bedrock, max_turns=5)

            # Simulate a tool writing file_artifact to the store during the agent loop
            def _agent_side_effect(prompt):
                orch._file_artifact_store["file_artifact"] = sample_artifact
                return "output.txt を作成しました。"

            mock_agent_inst.side_effect = _agent_side_effect

            result = orch.run(self._make_request())

        assert isinstance(result, OrchestrationResult)
        assert result.file_artifact == sample_artifact
        assert result.completion_status == "complete"
        assert result.synthesized_text == "output.txt を作成しました。"

    def test_run_returns_none_file_artifact_when_no_file_generated(self):
        """OrchestrationResult.file_artifact is None when no tool writes to _file_artifact_store."""
        from src.orchestrator import OrchestrationAgent

        mock_bedrock = MagicMock()

        with patch("src.orchestrator.Agent") as MockAgent, \
             patch("hooks.MaxTurnsHook") as MockMaxTurns, \
             patch("hooks.ToolLoggingHook") as MockLogging, \
             patch("agent_tools.build_agent_tools", return_value=[]):

            mock_max_hook = MagicMock()
            mock_max_hook.fired = False
            mock_max_hook._tool_call_count = 1
            MockMaxTurns.return_value = mock_max_hook

            mock_log_hook = MagicMock()
            mock_log_hook.agents_called = ["time-agent"]
            MockLogging.return_value = mock_log_hook

            mock_agent_inst = MagicMock()
            mock_agent_inst.return_value = "現在時刻は 14:00 です。"
            MockAgent.return_value = mock_agent_inst

            orch = OrchestrationAgent({}, mock_bedrock, max_turns=5)
            result = orch.run(self._make_request())

        assert result.file_artifact is None
        assert result.completion_status == "complete"
