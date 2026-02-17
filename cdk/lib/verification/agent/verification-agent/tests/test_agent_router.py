"""
Unit tests for agent_router.py (A2A agent selection via Strands Agent / Claude Haiku 4.5).

Tests:
- Routing to doc_search agent for documentation queries
- Routing to general agent for non-documentation queries
- Fallback to general agent when DOC_SEARCH_AGENT_ARN is not set
- Fallback to general agent on routing errors (fail-open)
- Fallback to general agent for empty text
"""

import json
import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestRouteRequest:
    """Test the main route_request function."""

    def test_returns_general_when_doc_search_arn_not_set(self):
        """When DOC_SEARCH_AGENT_ARN is not set, skip routing and return general."""
        from agent_router import route_request, AGENT_GENERAL

        with patch.dict(os.environ, {}, clear=True):
            result = route_request("デプロイ手順を教えて")
            assert result == AGENT_GENERAL

    def test_returns_general_for_empty_text(self):
        """Empty or whitespace text should return general (no routing needed)."""
        from agent_router import route_request, AGENT_GENERAL

        with patch.dict(os.environ, {"DOC_SEARCH_AGENT_ARN": "arn:aws:test"}, clear=False):
            assert route_request("") == AGENT_GENERAL
            assert route_request("  ") == AGENT_GENERAL

    @patch("agent_router._create_router_agent")
    def test_routes_to_doc_search_for_documentation_query(self, mock_create):
        """Documentation-related query should route to doc_search agent."""
        from agent_router import route_request, AGENT_DOC_SEARCH

        mock_agent = MagicMock()
        mock_agent.return_value.message = {
            "content": [{"text": f"doc_search エージェントを選択しました。"}]
        }
        mock_create.return_value = mock_agent

        with patch.dict(os.environ, {"DOC_SEARCH_AGENT_ARN": "arn:aws:test"}, clear=False):
            result = route_request("アーキテクチャのドキュメントを教えて")
            assert result == AGENT_DOC_SEARCH

    @patch("agent_router._create_router_agent")
    def test_routes_to_general_for_file_generation_query(self, mock_create):
        """File generation query should route to general agent."""
        from agent_router import route_request, AGENT_GENERAL

        mock_agent = MagicMock()
        mock_agent.return_value.message = {
            "content": [{"text": "general エージェントを選択しました。"}]
        }
        mock_create.return_value = mock_agent

        with patch.dict(os.environ, {"DOC_SEARCH_AGENT_ARN": "arn:aws:test"}, clear=False):
            result = route_request("Excelファイルを作成して")
            assert result == AGENT_GENERAL

    @patch("agent_router._create_router_agent")
    def test_fallback_to_general_on_agent_error(self, mock_create):
        """Routing errors should fail-open to general agent."""
        from agent_router import route_request, AGENT_GENERAL

        mock_create.side_effect = RuntimeError("Model error")

        with patch.dict(os.environ, {"DOC_SEARCH_AGENT_ARN": "arn:aws:test"}, clear=False):
            result = route_request("デプロイ手順を教えて")
            assert result == AGENT_GENERAL

    @patch("agent_router._create_router_agent")
    def test_fallback_to_general_when_no_text_in_response(self, mock_create):
        """If agent response has no recognizable routing, default to general."""
        from agent_router import route_request, AGENT_GENERAL

        mock_agent = MagicMock()
        mock_agent.return_value.message = {"content": []}
        mock_create.return_value = mock_agent

        with patch.dict(os.environ, {"DOC_SEARCH_AGENT_ARN": "arn:aws:test"}, clear=False):
            result = route_request("何かの質問")
            assert result == AGENT_GENERAL

    @patch("agent_router._create_router_agent")
    def test_correlation_id_passed_to_log(self, mock_create):
        """Correlation ID should be logged for tracing."""
        from agent_router import route_request

        mock_agent = MagicMock()
        mock_agent.return_value.message = {
            "content": [{"text": "general"}]
        }
        mock_create.return_value = mock_agent

        with patch.dict(os.environ, {"DOC_SEARCH_AGENT_ARN": "arn:aws:test"}, clear=False):
            with patch("agent_router._log") as mock_log:
                route_request("テスト", correlation_id="corr-123")
                # Verify _log was called with correlation_id
                assert any(
                    call[0][1] == "routing_decision" and call[0][2].get("correlation_id") == "corr-123"
                    for call in mock_log.call_args_list
                )


class TestExtractRoutingFromResult:
    """Test _extract_routing_from_result function."""

    def test_extracts_doc_search_from_text(self):
        from agent_router import _extract_routing_from_result, AGENT_DOC_SEARCH

        mock_result = MagicMock()
        mock_result.message = {
            "content": [{"text": "doc_search agent selected"}]
        }
        assert _extract_routing_from_result(mock_result) == AGENT_DOC_SEARCH

    def test_defaults_to_general_when_no_match(self):
        from agent_router import _extract_routing_from_result, AGENT_GENERAL

        mock_result = MagicMock()
        mock_result.message = {
            "content": [{"text": "I'll help you with that."}]
        }
        assert _extract_routing_from_result(mock_result) == AGENT_GENERAL

    def test_handles_empty_content(self):
        from agent_router import _extract_routing_from_result, AGENT_GENERAL

        mock_result = MagicMock()
        mock_result.message = {"content": []}
        assert _extract_routing_from_result(mock_result) == AGENT_GENERAL

    def test_handles_malformed_message(self):
        from agent_router import _extract_routing_from_result, AGENT_GENERAL

        mock_result = MagicMock()
        mock_result.message = None
        assert _extract_routing_from_result(mock_result) == AGENT_GENERAL


class TestTools:
    """Test the routing tool functions."""

    def test_select_doc_search_agent_returns_correct_id(self):
        from agent_router import select_doc_search_agent, AGENT_DOC_SEARCH

        # Strands @tool wraps as DecoratedFunctionTool; access underlying via _tool_func
        result = select_doc_search_agent._tool_func()
        assert result == AGENT_DOC_SEARCH

    def test_select_general_agent_returns_correct_id(self):
        from agent_router import select_general_agent, AGENT_GENERAL

        result = select_general_agent._tool_func()
        assert result == AGENT_GENERAL


class TestCreateRouterAgent:
    """Test router agent creation."""

    @patch("agent_router.BedrockModel")
    @patch("agent_router.Agent")
    def test_creates_agent_with_haiku_model(self, mock_agent_cls, mock_model_cls):
        from agent_router import _create_router_agent, _DEFAULT_ROUTER_MODEL_ID

        with patch.dict(os.environ, {"AWS_REGION_NAME": "ap-northeast-1"}, clear=False):
            _create_router_agent()

        mock_model_cls.assert_called_once()
        call_kwargs = mock_model_cls.call_args[1]
        assert call_kwargs["model_id"] == _DEFAULT_ROUTER_MODEL_ID
        assert call_kwargs["temperature"] == 0.0
        assert call_kwargs["max_tokens"] == 256

    @patch("agent_router.BedrockModel")
    @patch("agent_router.Agent")
    def test_custom_model_id_via_env(self, mock_agent_cls, mock_model_cls):
        from agent_router import _create_router_agent

        with patch.dict(os.environ, {
            "ROUTER_MODEL_ID": "custom-model-id",
            "AWS_REGION_NAME": "us-east-1",
        }, clear=False):
            _create_router_agent()

        call_kwargs = mock_model_cls.call_args[1]
        assert call_kwargs["model_id"] == "custom-model-id"
        assert call_kwargs["region_name"] == "us-east-1"

    @patch("agent_router.BedrockModel")
    @patch("agent_router.Agent")
    def test_agent_has_two_routing_tools(self, mock_agent_cls, mock_model_cls):
        from agent_router import _create_router_agent

        _create_router_agent()

        call_kwargs = mock_agent_cls.call_args[1]
        tools = call_kwargs["tools"]
        assert len(tools) == 2
