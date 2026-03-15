"""Unit tests for Slack Search Agent main.py — TDD."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

from main import handle_invocation_body


# --- /ping and /.well-known/agent-card.json ---

def test_ping_endpoint_returns_200():
    """GET /ping health check returns Healthy status."""
    from main import app
    # Verify ping route registered
    assert ("GET", "/ping") in app._routes


def test_agent_card_endpoint_registered():
    """GET /.well-known/agent-card.json route is registered."""
    from main import app
    assert ("GET", "/.well-known/agent-card.json") in app._routes


# --- JSON-RPC error handling ---

def test_invalid_json_returns_parse_error():
    """Invalid JSON body → JSON-RPC -32700 Parse error."""
    result = handle_invocation_body(b"not valid json{{{")
    assert result["jsonrpc"] == "2.0"
    assert result["error"]["code"] == -32700
    assert result["id"] is None


def test_unknown_method_returns_method_not_found():
    """Unknown JSON-RPC method → -32601 Method not found."""
    body = json.dumps({
        "jsonrpc": "2.0",
        "method": "unknown_method",
        "id": "test-1",
        "params": {},
    }).encode()
    result = handle_invocation_body(body)
    assert result["error"]["code"] == -32601


def test_missing_text_returns_invalid_params():
    """execute_task without text param → -32602 Invalid params."""
    body = json.dumps({
        "jsonrpc": "2.0",
        "method": "execute_task",
        "id": "test-2",
        "params": {
            "channel": "C123",
            "bot_token": "xoxb-test",
        },
    }).encode()
    result = handle_invocation_body(body)
    assert result["error"]["code"] == -32602
    assert "text" in result["error"]["data"]["missing"]


def test_missing_channel_returns_invalid_params():
    """execute_task without channel param → -32602 Invalid params."""
    body = json.dumps({
        "jsonrpc": "2.0",
        "method": "execute_task",
        "id": "test-3",
        "params": {
            "text": "search for something",
            "bot_token": "xoxb-test",
        },
    }).encode()
    result = handle_invocation_body(body)
    assert result["error"]["code"] == -32602
    assert "channel" in result["error"]["data"]["missing"]


def test_missing_bot_token_returns_invalid_params():
    """execute_task without bot_token param → -32602 Invalid params."""
    body = json.dumps({
        "jsonrpc": "2.0",
        "method": "execute_task",
        "id": "test-4",
        "params": {
            "text": "search for something",
            "channel": "C123",
        },
    }).encode()
    result = handle_invocation_body(body)
    assert result["error"]["code"] == -32602
    assert "bot_token" in result["error"]["data"]["missing"]


def test_not_jsonrpc_20_returns_invalid_request():
    """Request without jsonrpc=2.0 → -32600 Invalid Request."""
    body = json.dumps({
        "method": "execute_task",
        "id": "test-5",
        "params": {},
    }).encode()
    result = handle_invocation_body(body)
    assert result["error"]["code"] == -32600


def test_execute_task_with_valid_params_returns_result():
    """execute_task with valid params returns a result (mocked agent)."""
    import unittest.mock as mock
    with mock.patch("main.create_agent") as mock_create_agent:
        mock_agent = mock.MagicMock()
        mock_agent.return_value = mock.MagicMock(
            message={"content": [{"text": "テスト結果"}], "role": "assistant"}
        )
        mock_create_agent.return_value = mock_agent

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "id": "test-6",
            "params": {
                "text": "search for something",
                "channel": "C123",
                "bot_token": "xoxb-test",
            },
        }).encode()
        result = handle_invocation_body(body)

    assert result["jsonrpc"] == "2.0"
    assert result["id"] == "test-6"
    assert "result" in result


# --- US1: Channel search acceptance tests ---

def test_execute_task_search_returns_success_status():
    """execute_task with search intent returns status=success."""
    import unittest.mock as mock
    with mock.patch("main.create_agent") as mock_create_agent:
        mock_agent = mock.MagicMock()
        mock_agent.return_value = mock.MagicMock(
            message={"content": [{"text": "検索結果: メッセージが見つかりました"}], "role": "assistant"}
        )
        mock_create_agent.return_value = mock_agent

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "id": "us1-test-1",
            "params": {
                "text": "#general でリリース計画について検索して",
                "channel": "C_CALLING",
                "bot_token": "xoxb-test",
            },
        }).encode()
        result = handle_invocation_body(body)

    assert result["jsonrpc"] == "2.0"
    assert "result" in result
    assert result["result"]["status"] == "success"
    assert result["result"]["channel"] == "C_CALLING"


def test_execute_task_search_result_has_response_text():
    """execute_task search result contains response_text."""
    import unittest.mock as mock
    with mock.patch("main.create_agent") as mock_create_agent:
        mock_agent = mock.MagicMock()
        mock_agent.return_value = mock.MagicMock(
            message={"content": [{"text": "3件のメッセージが見つかりました"}], "role": "assistant"}
        )
        mock_create_agent.return_value = mock_agent

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "id": "us1-test-2",
            "params": {
                "text": "Search for release planning",
                "channel": "C_CALLING",
                "bot_token": "xoxb-test",
            },
        }).encode()
        result = handle_invocation_body(body)

    assert "response_text" in result["result"]
    assert len(result["result"]["response_text"]) > 0


# --- US2: Thread retrieval acceptance tests ---

def test_execute_task_with_slack_url_returns_success():
    """execute_task with Slack URL intent returns status=success."""
    import unittest.mock as mock
    with mock.patch("main.create_agent") as mock_create_agent:
        mock_agent = mock.MagicMock()
        mock_agent.return_value = mock.MagicMock(
            message={"content": [{"text": "スレッド取得結果: 3件のメッセージ"}], "role": "assistant"}
        )
        mock_create_agent.return_value = mock_agent

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "id": "us2-test-1",
            "params": {
                "text": "Get the thread from https://workspace.slack.com/archives/C123/p1706123456789012",
                "channel": "C_CALLING",
                "bot_token": "xoxb-test",
            },
        }).encode()
        result = handle_invocation_body(body)

    assert result["result"]["status"] == "success"
    assert "response_text" in result["result"]


# --- US3: Channel history acceptance tests ---

def test_execute_task_channel_history_returns_success():
    """execute_task with channel history intent returns status=success."""
    import unittest.mock as mock
    with mock.patch("main.create_agent") as mock_create_agent:
        mock_agent = mock.MagicMock()
        mock_agent.return_value = mock.MagicMock(
            message={"content": [{"text": "#general の最新10件のメッセージです"}], "role": "assistant"}
        )
        mock_create_agent.return_value = mock_agent

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "id": "us3-test-1",
            "params": {
                "text": "#general の最新10件のメッセージを取得して",
                "channel": "C_CALLING",
                "bot_token": "xoxb-test",
            },
        }).encode()
        result = handle_invocation_body(body)

    assert result["result"]["status"] == "success"
    assert "response_text" in result["result"]
