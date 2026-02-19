"""Unit tests for router.py."""

import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestRouter:
    @patch("router.get_agent_ids", return_value=["file-creator"])
    @patch("router.is_multi_agent", return_value=False)
    def test_single_agent_mode_returns_file_creator(self, _mock_multi, _mock_get_agent_ids):
        """Routing should be skipped in single-agent mode."""
        from router import route_request

        assert route_request("please check docs", correlation_id="corr-1") == "file-creator"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router.get_agent_arn", return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/docs")
    @patch("router._route_with_router_model", return_value="docs")
    @patch("router.is_multi_agent", return_value=True)
    @patch("router._log")
    def test_docs_query_routes_to_docs(
        self, mock_log, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, _mock_refresh
    ):
        """Docs route is returned when model selects docs and docs ARN exists."""
        from router import route_request

        assert route_request("architecture docs", correlation_id="corr-2") == "docs"
        assert any(
            c.args[1] == "router_decision" and c.args[2].get("selected_agent_id") == "docs"
            for c in mock_log.call_args_list
        )

    @patch("router.refresh_missing_cards")
    @patch("router._route_with_router_model", side_effect=RuntimeError("model down"))
    @patch("router.is_multi_agent", return_value=True)
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router.get_agent_arn", return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator")
    def test_router_failure_falls_back_to_file_creator(self, _mock_arn, _mock_get_agent_ids, _mock_multi, _mock_route_model, _mock_refresh):
        """Router errors should fail-safe to file-creator when available."""
        from router import route_request

        assert route_request("anything", correlation_id="corr-3") == "file-creator"

    @patch("router.refresh_missing_cards")
    @patch("router._route_with_router_model", side_effect=RuntimeError("model down"))
    @patch("router.is_multi_agent", return_value=True)
    @patch("router.get_agent_ids", return_value=["docs", "time"])
    def test_router_failure_falls_back_unrouted_when_no_file_creator(self, _mock_get_agent_ids, _mock_multi, _mock_route_model, _mock_refresh):
        """Router errors should fail-safe to unrouted when file-creator is not available."""
        from router import route_request

        assert route_request("anything", correlation_id="corr-3b") == "unrouted"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch(
        "router.get_agent_arn",
        side_effect=lambda agent_id: {
            "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
            "docs": "",
        }.get(agent_id, ""),
    )
    @patch("router._route_with_router_model", return_value="docs")
    @patch("router.is_multi_agent", return_value=True)
    @patch("router._log")
    def test_docs_selected_but_missing_arn_falls_back_to_file_creator(
        self, mock_log, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, _mock_refresh
    ):
        """If docs agent ARN is unavailable, routing should fall back to file-creator."""
        from router import route_request

        assert route_request("docs question", correlation_id="corr-4") == "file-creator"
        assert any(
            c.args[1] == "router_decision"
            and c.args[2].get("fallback_reason") == "missing_agent_arn_fallback_default"
            for c in mock_log.call_args_list
        )

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs", "time"])
    @patch(
        "router.get_agent_arn",
        side_effect=lambda agent_id: {
            "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
            "docs": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/docs",
            "time": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/time",
        }.get(agent_id, ""),
    )
    @patch("router._route_with_router_model", return_value="time")
    @patch("router.is_multi_agent", return_value=True)
    def test_time_query_routes_to_time(
        self, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, _mock_refresh
    ):
        from router import route_request

        assert route_request("現在時刻を教えて", correlation_id="corr-5") == "time"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs", "time"])
    @patch(
        "router.get_agent_arn",
        side_effect=lambda agent_id: {
            "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
            "docs": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/docs",
            "time": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/time",
        }.get(agent_id, ""),
    )
    @patch("router._route_with_router_model")
    @patch("router.is_multi_agent", return_value=True)
    def test_time_query_heuristic_bypasses_model(
        self, _mock_multi, mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, mock_refresh
    ):
        from router import route_request

        assert route_request("現在時刻を取得するエージェントを使って現在時刻を取得", correlation_id="corr-5b") == "time"
        mock_route_model.assert_not_called()
        mock_refresh.assert_not_called()

    def test_router_system_prompt_includes_agent_card_metadata(self):
        """Routing prompt should be composed from agent card metadata."""
        from router import _build_router_system_prompt

        prompt = _build_router_system_prompt(
            {"file-creator", "docs"},
            {
                "file-creator": {
                    "name": "SlackAI-FileCreatorAgent",
                    "description": "General AI processing",
                    "capabilities": {"attachments": True, "asyncProcessing": True},
                    "skills": [{"name": "Generate Excel", "description": "xlsx"}],
                },
                "docs": {
                    "name": "SlackAI-DocsAgent",
                    "description": "Docs search",
                    "capabilities": {"attachments": False, "asyncProcessing": False},
                    "skills": [{"name": "Project Docs Search", "description": "docs"}],
                },
            },
        )
        assert "SlackAI-FileCreatorAgent" in prompt
        assert "SlackAI-DocsAgent" in prompt
        assert "Project Docs Search" in prompt

    def test_router_system_prompt_includes_default_fallback_instruction(self):
        """Routing prompt should instruct file-creator as the default fallback."""
        from router import _build_router_system_prompt

        prompt = _build_router_system_prompt(
            {"file-creator", "docs", "time"},
            {"file-creator": None, "docs": None, "time": None},
        )
        assert "file-creator" in prompt.lower()
        assert "default" in prompt.lower() or "fallback" in prompt.lower()

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs", "time"])
    @patch(
        "router.get_agent_arn",
        side_effect=lambda agent_id: {
            "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
            "docs": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/docs",
            "time": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/time",
        }.get(agent_id, ""),
    )
    @patch("router._route_with_router_model", return_value="unknown_agent")
    @patch("router.is_multi_agent", return_value=True)
    @patch("router._log")
    def test_invalid_agent_id_falls_back_to_file_creator(
        self, mock_log, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, _mock_refresh
    ):
        """If router model returns an invalid agent id, fall back to file-creator."""
        from router import route_request

        assert route_request("hello", correlation_id="corr-6") == "file-creator"
        assert any(
            c.args[1] == "router_decision"
            and c.args[2].get("fallback_reason") == "invalid_agent_id_fallback_default"
            for c in mock_log.call_args_list
        )

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs", "time"])
    @patch("router.get_agent_arn", return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator")
    @patch("router._route_with_router_model", return_value="file-creator")
    @patch("router.is_multi_agent", return_value=True)
    def test_route_request_calls_refresh_missing_cards(
        self, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, mock_refresh
    ):
        """route_request should call refresh_missing_cards before routing."""
        from router import route_request

        route_request("hello", correlation_id="corr-7")
        mock_refresh.assert_called_once()
