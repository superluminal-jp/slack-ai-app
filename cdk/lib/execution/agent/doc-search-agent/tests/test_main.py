"""
Unit tests for Doc Search Agent main.py (JSON-RPC 2.0 A2A protocol).
"""

import json
import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestHandleInvocationBody:
    """Test JSON-RPC 2.0 protocol handling."""

    def test_invalid_json_returns_parse_error(self):
        from main import handle_invocation_body

        result = handle_invocation_body(b"not json")
        assert result["jsonrpc"] == "2.0"
        assert result["error"]["code"] == -32700
        assert result["id"] is None

    def test_missing_jsonrpc_version_returns_invalid_request(self):
        from main import handle_invocation_body

        body = json.dumps({"method": "execute_task", "id": "1"}).encode()
        result = handle_invocation_body(body)
        assert result["error"]["code"] == -32600

    def test_wrong_method_returns_method_not_found(self):
        from main import handle_invocation_body

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "unknown_method",
            "id": "1",
        }).encode()
        result = handle_invocation_body(body)
        assert result["error"]["code"] == -32601
        assert result["id"] == "1"

    def test_missing_required_params_returns_invalid_params(self):
        from main import handle_invocation_body

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "params": {"channel": "C01", "text": "hello"},  # missing bot_token
            "id": "2",
        }).encode()
        result = handle_invocation_body(body)
        assert result["error"]["code"] == -32602
        assert "bot_token" in result["error"]["data"]["missing"]

    @patch("main.create_agent")
    def test_valid_request_returns_success(self, mock_create_agent):
        mock_agent = MagicMock()
        mock_agent.return_value.message = {
            "content": [{"text": "Found in docs: deployment guide..."}]
        }
        mock_create_agent.return_value = mock_agent

        from main import handle_invocation_body

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "params": {
                "channel": "C01234",
                "text": "デプロイ手順を教えて",
                "bot_token": "xoxb-test",
                "correlation_id": "corr-001",
            },
            "id": "3",
        }).encode()
        result = handle_invocation_body(body)
        assert result["jsonrpc"] == "2.0"
        assert result["id"] == "3"
        assert result["result"]["status"] == "success"
        assert "deployment guide" in result["result"]["response_text"]


class TestHandleMessageTool:
    """Test the message processing function."""

    def test_missing_channel_returns_error(self):
        from main import handle_message_tool

        payload = json.dumps({"prompt": json.dumps({"text": "hello", "bot_token": "xoxb"})})
        result = json.loads(handle_message_tool(payload))
        assert result["status"] == "error"
        assert result["error_code"] == "missing_channel"

    def test_missing_text_returns_error(self):
        from main import handle_message_tool

        payload = json.dumps({"prompt": json.dumps({"channel": "C01", "bot_token": "xoxb"})})
        result = json.loads(handle_message_tool(payload))
        assert result["status"] == "error"
        assert result["error_code"] == "missing_text"

    @patch("main.create_agent")
    def test_successful_doc_search(self, mock_create_agent):
        mock_agent = MagicMock()
        mock_agent.return_value.message = {
            "content": [{"text": "アーキテクチャの概要: ..."}]
        }
        mock_create_agent.return_value = mock_agent

        from main import handle_message_tool

        payload = json.dumps({
            "prompt": json.dumps({
                "channel": "C01",
                "text": "アーキテクチャについて教えて",
                "bot_token": "xoxb-test",
                "correlation_id": "corr-001",
            })
        })
        result = json.loads(handle_message_tool(payload))
        assert result["status"] == "success"
        assert "アーキテクチャ" in result["response_text"]

    @patch("main.create_agent")
    def test_agent_exception_returns_generic_error(self, mock_create_agent):
        mock_create_agent.return_value.side_effect = RuntimeError("Model error")

        from main import handle_message_tool

        payload = json.dumps({
            "prompt": json.dumps({
                "channel": "C01",
                "text": "test",
                "bot_token": "xoxb-test",
            })
        })
        result = json.loads(handle_message_tool(payload))
        assert result["status"] == "error"
        assert result["error_code"] == "generic"


class TestAgentCard:
    """Test agent card endpoint."""

    def test_agent_card_returns_doc_search_info(self):
        from agent_card import get_agent_card

        card = get_agent_card()
        assert card["name"] == "SlackAI-DocSearchAgent"
        assert card["protocol"] == "A2A"
        assert len(card["skills"]) == 2
        skill_ids = [s["id"] for s in card["skills"]]
        assert "doc-search" in skill_ids
        assert "url-fetch" in skill_ids

    def test_health_status_healthy(self):
        from agent_card import get_health_status

        status = get_health_status(is_busy=False)
        assert status["status"] == "Healthy"
        assert status["agent"] == "SlackAI-DocSearchAgent"

    def test_health_status_busy(self):
        from agent_card import get_health_status

        status = get_health_status(is_busy=True)
        assert status["status"] == "HealthyBusy"
