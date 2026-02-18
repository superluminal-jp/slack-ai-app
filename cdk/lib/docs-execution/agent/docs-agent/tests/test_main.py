"""Unit tests for Docs Agent main.py JSON-RPC handling."""

import json
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestJsonRpc:
    def test_invalid_json_returns_parse_error(self):
        import main

        resp = main.handle_invocation_body(b"not valid json")
        assert resp["error"]["code"] == -32700
        assert resp["id"] is None

    def test_unknown_method_returns_method_not_found(self):
        import main

        resp = main.handle_invocation_body(b'{"jsonrpc":"2.0","method":"unknown","id":"1"}')
        assert resp["error"]["code"] == -32601
        assert resp["id"] == "1"

    def test_get_agent_card_returns_result(self):
        import main

        resp = main.handle_invocation_body(b'{"jsonrpc":"2.0","method":"get_agent_card","id":"card"}')
        assert resp["jsonrpc"] == "2.0"
        assert resp["id"] == "card"
        assert resp["result"]["name"] == "SlackAI-DocsAgent"

    def test_execute_task_missing_params_returns_32602(self):
        import main

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "params": {"text": "hello", "bot_token": "xoxb-test"},
            "id": "req-1",
        }).encode("utf-8")
        resp = main.handle_invocation_body(body)
        assert resp["error"]["code"] == -32602
        assert resp["id"] == "req-1"

    @patch("main.handle_message_tool")
    def test_execute_task_success_result(self, mock_tool):
        import main

        mock_tool.return_value = json.dumps({"status": "success", "response_text": "ok"})
        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "params": {"channel": "C01", "text": "hello", "bot_token": "xoxb-test"},
            "id": "req-2",
        }).encode("utf-8")
        resp = main.handle_invocation_body(body)
        assert resp["id"] == "req-2"
        assert resp["result"]["status"] == "success"
