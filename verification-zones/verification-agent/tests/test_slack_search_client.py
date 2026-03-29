"""Unit tests for slack_search_client.py — uses S3 agent registry."""

import json
import sys
from unittest.mock import MagicMock, patch

# conftest.py already adds src/ to sys.path

from slack_search_client import SlackSearchClient


SLACK_SEARCH_AGENT_ARN = "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/SlackAI_SlackSearch_Dev"


def _make_success_result(response_text: str = "検索結果") -> str:
    """JSON-RPC 2.0 success response as a string."""
    return json.dumps({
        "jsonrpc": "2.0",
        "id": "test-id",
        "result": {
            "status": "success",
            "channel": "C_CALLING",
            "response_text": response_text,
        }
    })


def _make_error_result(error_code: str = "slack_api_error") -> str:
    """JSON-RPC 2.0 error response as a string."""
    return json.dumps({
        "jsonrpc": "2.0",
        "id": "test-id",
        "error": {
            "code": -32603,
            "message": "Internal error",
        }
    })


def test_search_calls_invoke_execution_agent():
    """SlackSearchClient.search invokes the execution agent via A2A."""
    with patch("slack_search_client.invoke_execution_agent") as mock_invoke, \
         patch("slack_search_client.agent_registry") as mock_registry:
        mock_registry.get_agent_arn.return_value = SLACK_SEARCH_AGENT_ARN
        mock_invoke.return_value = _make_success_result("3件のメッセージが見つかりました")

        client = SlackSearchClient()
        result = client.search(
            text="Search for release planning",
            channel="C_CALLING",
            bot_token="xoxb-test",
        )

    mock_invoke.assert_called_once()
    call_kwargs = mock_invoke.call_args
    payload = call_kwargs[0][0]
    assert payload["text"] == "Search for release planning"
    assert payload["channel"] == "C_CALLING"
    assert payload["bot_token"] == "xoxb-test"
    assert call_kwargs[0][1] == SLACK_SEARCH_AGENT_ARN
    assert "3件" in result


def test_missing_arn_raises_value_error():
    """SlackSearchClient raises ValueError when slack-search is not in registry."""
    with patch("slack_search_client.agent_registry") as mock_registry:
        mock_registry.get_agent_arn.return_value = ""

        client = SlackSearchClient()
        try:
            client.search(text="test", channel="C123", bot_token="xoxb-test")
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "slack-search" in str(e)


def test_a2a_error_returns_graceful_message():
    """A2A invocation error returns a graceful error string, not raises."""
    with patch("slack_search_client.invoke_execution_agent") as mock_invoke, \
         patch("slack_search_client.agent_registry") as mock_registry:
        mock_registry.get_agent_arn.return_value = SLACK_SEARCH_AGENT_ARN
        mock_invoke.return_value = _make_error_result()

        client = SlackSearchClient()
        result = client.search(
            text="Search for something",
            channel="C_CALLING",
            bot_token="xoxb-test",
        )

    # Should return graceful error string (not raise)
    assert isinstance(result, str)
    assert len(result) > 0


def test_search_passes_thread_ts():
    """SlackSearchClient.search passes thread_ts when provided."""
    with patch("slack_search_client.invoke_execution_agent") as mock_invoke, \
         patch("slack_search_client.agent_registry") as mock_registry:
        mock_registry.get_agent_arn.return_value = SLACK_SEARCH_AGENT_ARN
        mock_invoke.return_value = _make_success_result()

        client = SlackSearchClient()
        client.search(
            text="Find something",
            channel="C_CALLING",
            bot_token="xoxb-test",
            thread_ts="1706123456.789012",
        )

    payload = mock_invoke.call_args[0][0]
    assert payload.get("thread_ts") == "1706123456.789012"


def test_search_passes_correlation_id():
    """SlackSearchClient.search passes correlation_id when provided."""
    with patch("slack_search_client.invoke_execution_agent") as mock_invoke, \
         patch("slack_search_client.agent_registry") as mock_registry:
        mock_registry.get_agent_arn.return_value = SLACK_SEARCH_AGENT_ARN
        mock_invoke.return_value = _make_success_result()

        client = SlackSearchClient()
        client.search(
            text="Find something",
            channel="C_CALLING",
            bot_token="xoxb-test",
            correlation_id="test-correlation-id",
        )

    payload = mock_invoke.call_args[0][0]
    assert payload.get("correlation_id") == "test-correlation-id"
