"""
Unit tests for Web Fetch Agent main.py (A2A entrypoint).

Tests:
- /ping returns SlackAI-WebFetchAgent health status
- /.well-known/agent-card.json returns correct card
- POST / handles JSON-RPC 2.0 requests
- handle_invocation_body parses JSON-RPC correctly
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


class TestPingEndpoint:
    """Test health check endpoint."""

    def test_ping_returns_healthy(self):
        """GET /ping returns Healthy status for SlackAI-WebFetchAgent."""
        from main import app
        ping_handler = app._routes.get(("GET", "/ping"))
        assert ping_handler is not None, "GET /ping route not registered"
        result = ping_handler()
        assert result["status"] in ("Healthy", "HealthyBusy")
        assert result["agent"] == "SlackAI-WebFetchAgent"

    def test_ping_returns_version(self):
        from main import app
        ping_handler = app._routes.get(("GET", "/ping"))
        result = ping_handler()
        assert "version" in result


class TestAgentCardEndpoint:
    """Test agent card discovery endpoint."""

    def test_agent_card_returns_web_fetch_agent(self):
        """GET /.well-known/agent-card.json returns SlackAI-WebFetchAgent card."""
        from main import app
        card_handler = app._routes.get(("GET", "/.well-known/agent-card.json"))
        assert card_handler is not None, "GET /.well-known/agent-card.json route not registered"
        card = card_handler()
        assert card["name"] == "SlackAI-WebFetchAgent"

    def test_agent_card_has_fetch_url_skill(self):
        from main import app
        card_handler = app._routes.get(("GET", "/.well-known/agent-card.json"))
        card = card_handler()
        skill_ids = [s["id"] for s in card["skills"]]
        assert "fetch_url" in skill_ids

    def test_agent_card_is_json_serializable(self):
        from main import app
        card_handler = app._routes.get(("GET", "/.well-known/agent-card.json"))
        card = card_handler()
        serialized = json.dumps(card)
        assert "SlackAI-WebFetchAgent" in serialized


class TestHandleInvocationBody:
    """Test JSON-RPC 2.0 request handling."""

    def test_invalid_json_returns_parse_error(self):
        from main import handle_invocation_body
        result = handle_invocation_body(b"not json")
        assert result["error"]["code"] == -32700

    def test_missing_method_returns_invalid_request(self):
        from main import handle_invocation_body
        body = json.dumps({"jsonrpc": "2.0", "id": "1"}).encode()
        result = handle_invocation_body(body)
        assert result["error"]["code"] == -32600

    def test_unknown_method_returns_method_not_found(self):
        from main import handle_invocation_body
        body = json.dumps({"jsonrpc": "2.0", "method": "unknown", "id": "1"}).encode()
        result = handle_invocation_body(body)
        assert result["error"]["code"] == -32601

    def test_get_agent_card_method_returns_card(self):
        from main import handle_invocation_body
        body = json.dumps({"jsonrpc": "2.0", "method": "get_agent_card", "id": "1"}).encode()
        result = handle_invocation_body(body)
        assert "result" in result
        assert result["result"]["name"] == "SlackAI-WebFetchAgent"

    def test_execute_task_missing_params_returns_invalid_params(self):
        from main import handle_invocation_body
        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "id": "1",
            "params": {}
        }).encode()
        result = handle_invocation_body(body)
        assert result["error"]["code"] == -32602

    def test_post_route_is_registered(self):
        from main import app
        assert ("POST", "/") in app._routes, "POST / route must be registered"
