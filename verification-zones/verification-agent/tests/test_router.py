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
    def test_router_failure_falls_back_to_unrouted(self, _mock_arn, _mock_get_agent_ids, _mock_multi, _mock_route_model, _mock_refresh):
        """Router errors should fail-safe to unrouted to avoid unintended tool calls."""
        from router import route_request

        assert route_request("anything", correlation_id="corr-3") == "unrouted"

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
    def test_docs_selected_but_missing_arn_falls_back_to_unrouted(
        self, mock_log, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, _mock_refresh
    ):
        """If docs agent ARN is unavailable, routing should abstain with unrouted."""
        from router import route_request

        assert route_request("docs question", correlation_id="corr-4") == "unrouted"
        assert any(
            c.args[1] == "router_decision"
            and c.args[2].get("fallback_reason") == "missing_agent_arn"
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

    def test_router_system_prompt_includes_unrouted_abstain_instruction(self):
        """Routing prompt should instruct unrouted abstain when confidence is low."""
        from router import _build_router_system_prompt

        prompt = _build_router_system_prompt(
            {"file-creator", "docs", "time"},
            {"file-creator": None, "docs": None, "time": None},
        )
        assert "unrouted" in prompt.lower()
        assert "confidence" in prompt.lower() or "small-talk" in prompt.lower()

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
    def test_invalid_agent_id_falls_back_to_unrouted(
        self, mock_log, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, _mock_refresh
    ):
        """If router model returns an invalid agent id, abstain with unrouted."""
        from router import route_request, UNROUTED_AGENT_ID

        assert route_request("generate weekly report", correlation_id="corr-6") == UNROUTED_AGENT_ID
        assert any(
            c.args[1] == "router_decision"
            and c.args[2].get("fallback_reason") == "invalid_agent_id"
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

        route_request("generate weekly report", correlation_id="corr-7")
        mock_refresh.assert_called_once()

    @patch("router.refresh_missing_cards")
    @patch("router._route_with_router_model", return_value="unrouted")
    @patch("router.is_multi_agent", return_value=True)
    @patch("router.get_agent_ids", return_value=["file-creator", "docs", "time"])
    def test_model_can_select_unrouted_for_smalltalk(
        self, _mock_get_agent_ids, _mock_multi, _mock_route_model, mock_refresh
    ):
        """Smalltalk can be abstained by router model selection (no heuristic routing)."""
        from router import route_request, UNROUTED_AGENT_ID

        result = route_request("hey", correlation_id="corr-s1")
        assert result == UNROUTED_AGENT_ID
        mock_refresh.assert_called_once()

    def test_router_system_prompt_includes_unrouted_option(self):
        """Routing prompt should include 'unrouted' as an abstain option."""
        from router import _build_router_system_prompt

        prompt = _build_router_system_prompt(
            {"file-creator", "docs"},
            {"file-creator": None, "docs": None},
        )
        assert "unrouted" in prompt


class TestListAgentsRoute:
    """Tests for the list_agents special route (034-router-list-agents)."""

    def test_list_agents_constant_exists_with_correct_value(self):
        """LIST_AGENTS_AGENT_ID constant must exist and equal 'list_agents'."""
        from router import LIST_AGENTS_AGENT_ID

        assert LIST_AGENTS_AGENT_ID == "list_agents"

    def test_router_system_prompt_includes_list_agents_option(self):
        """Router system prompt must describe list_agents as a routing option."""
        from router import _build_router_system_prompt

        prompt = _build_router_system_prompt(
            {"file-creator", "docs"},
            {"file-creator": None, "docs": None},
        )
        assert "list_agents" in prompt

    def test_router_system_prompt_must_constraint_includes_list_agents(self):
        """The MUST constraint line must enumerate list_agents as a valid selection."""
        from router import _build_router_system_prompt

        prompt = _build_router_system_prompt(
            {"file-creator"},
            {"file-creator": None},
        )
        # The constraint line that tells the model which IDs are valid MUST include list_agents
        must_line = next((l for l in prompt.splitlines() if "MUST call select_agent" in l), "")
        assert "list_agents" in must_line, (
            "list_agents must appear in the MUST constraint so the LLM knows it is a valid choice"
        )

    # --- Positive: route_request returns "list_agents" when model selects it ---

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router._route_with_router_model", return_value="list_agents")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_returned_for_capability_query(
        self, _mock_multi, _mock_route_model, _mock_get_agent_ids, _mock_refresh
    ):
        """route_request returns 'list_agents' when model selects it for capability discovery."""
        from router import route_request

        assert route_request("何ができる？", correlation_id="la-1") == "list_agents"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router._route_with_router_model", return_value="list_agents")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_returned_for_agent_list_request(
        self, _mock_multi, _mock_route_model, _mock_get_agent_ids, _mock_refresh
    ):
        """route_request returns 'list_agents' when model selects it for 'agent list' phrasing."""
        from router import route_request

        assert route_request("agent list", correlation_id="la-2") == "list_agents"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router._route_with_router_model", return_value="list_agents")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_returned_for_japanese_capability_overview_request(
        self, _mock_multi, _mock_route_model, _mock_get_agent_ids, _mock_refresh
    ):
        """route_request returns 'list_agents' for 利用可能なエージェント一覧."""
        from router import route_request

        assert route_request("利用可能なエージェント一覧", correlation_id="la-3") == "list_agents"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router._route_with_router_model", return_value="list_agents")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_returned_for_what_can_you_do(
        self, _mock_multi, _mock_route_model, _mock_get_agent_ids, _mock_refresh
    ):
        """route_request returns 'list_agents' for 'What can you do?' phrasing."""
        from router import route_request

        assert route_request("What can you do?", correlation_id="la-4") == "list_agents"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router._route_with_router_model", return_value="list_agents")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_returned_for_japanese_list_request(
        self, _mock_multi, _mock_route_model, _mock_get_agent_ids, _mock_refresh
    ):
        """route_request returns 'list_agents' for エージェント一覧を教えて phrasing."""
        from router import route_request

        assert route_request("エージェント一覧を教えて", correlation_id="la-5") == "list_agents"

    # --- Negative: route_request does NOT return "list_agents" for unrelated queries ---

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router.get_agent_arn", return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator")
    @patch("router._route_with_router_model", return_value="file-creator")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_not_returned_for_file_creation_request(
        self, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, _mock_refresh
    ):
        """Explicit file creation request should NOT route to list_agents."""
        from router import route_request

        result = route_request("Excelを作って", correlation_id="la-neg-1")
        assert result != "list_agents"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router._route_with_router_model", return_value="unrouted")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_not_returned_for_greeting(
        self, _mock_multi, _mock_route_model, _mock_get_agent_ids, _mock_refresh
    ):
        """Greeting should NOT route to list_agents."""
        from router import route_request

        result = route_request("こんにちは", correlation_id="la-neg-2")
        assert result != "list_agents"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router.get_agent_arn", return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/docs")
    @patch("router._route_with_router_model", return_value="docs")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_not_returned_for_docs_query(
        self, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, _mock_refresh
    ):
        """Documentation query should route to docs, not list_agents."""
        from router import route_request

        result = route_request("アーキテクチャについて教えて", correlation_id="la-neg-3")
        assert result != "list_agents"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "time"])
    @patch("router.get_agent_arn", return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/time")
    @patch("router._route_with_router_model", return_value="time")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_not_returned_for_time_query(
        self, _mock_multi, _mock_route_model, _mock_get_agent_arn, _mock_get_agent_ids, _mock_refresh
    ):
        """Time query should route to time, not list_agents."""
        from router import route_request

        result = route_request("今何時？", correlation_id="la-neg-4")
        assert result != "list_agents"

    @patch("router.refresh_missing_cards")
    @patch("router.get_agent_ids", return_value=["file-creator", "docs"])
    @patch("router._route_with_router_model", return_value="unrouted")
    @patch("router.is_multi_agent", return_value=True)
    def test_list_agents_not_returned_for_unrelated_smalltalk(
        self, _mock_multi, _mock_route_model, _mock_get_agent_ids, _mock_refresh
    ):
        """Unrelated small-talk should go to unrouted, not list_agents."""
        from router import route_request

        result = route_request("今日はいい天気ですね", correlation_id="la-neg-5")
        assert result != "list_agents"
