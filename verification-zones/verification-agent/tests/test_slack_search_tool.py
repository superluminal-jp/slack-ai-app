"""Unit tests for slack_search_tool.py — TDD (RED phase)."""

import os
import sys
from unittest.mock import MagicMock, patch

# conftest.py already adds src/ to sys.path

from slack_search_tool import make_slack_search_tool


CALLING_CHANNEL = "C_CALLING"
BOT_TOKEN = "xoxb-test-token"
CORRELATION_ID = "corr-id-test"


def test_make_slack_search_tool_returns_callable():
    """make_slack_search_tool returns a callable (Strands tool)."""
    slack_search = make_slack_search_tool(CALLING_CHANNEL, BOT_TOKEN)
    assert callable(slack_search)


def test_slack_search_tool_calls_client_search():
    """slack_search tool calls SlackSearchClient.search with correct args."""
    with patch("slack_search_tool.SlackSearchClient") as MockClient:
        mock_instance = MagicMock()
        mock_instance.search.return_value = "3件のメッセージが見つかりました"
        MockClient.return_value = mock_instance

        slack_search = make_slack_search_tool(CALLING_CHANNEL, BOT_TOKEN, CORRELATION_ID)
        result = slack_search(query="リリース計画について")

    mock_instance.search.assert_called_once_with(
        text="リリース計画について",
        channel=CALLING_CHANNEL,
        bot_token=BOT_TOKEN,
        correlation_id=CORRELATION_ID,
    )
    assert "3件" in result


def test_slack_search_tool_passes_channel_in_closure():
    """slack_search tool closure captures channel correctly."""
    with patch("slack_search_tool.SlackSearchClient") as MockClient:
        mock_instance = MagicMock()
        mock_instance.search.return_value = "found"
        MockClient.return_value = mock_instance

        slack_search = make_slack_search_tool("C_DIFFERENT", BOT_TOKEN)
        slack_search(query="test")

    call_kwargs = mock_instance.search.call_args[1]
    assert call_kwargs["channel"] == "C_DIFFERENT"


def test_slack_search_tool_passes_bot_token_in_closure():
    """slack_search tool closure captures bot_token correctly."""
    with patch("slack_search_tool.SlackSearchClient") as MockClient:
        mock_instance = MagicMock()
        mock_instance.search.return_value = "found"
        MockClient.return_value = mock_instance

        slack_search = make_slack_search_tool(CALLING_CHANNEL, "xoxb-other")
        slack_search(query="test")

    call_kwargs = mock_instance.search.call_args[1]
    assert call_kwargs["bot_token"] == "xoxb-other"


def test_slack_search_tool_error_returns_graceful_message():
    """slack_search tool returns graceful message on SlackSearchClient error."""
    with patch("slack_search_tool.SlackSearchClient") as MockClient:
        mock_instance = MagicMock()
        mock_instance.search.side_effect = Exception("A2A call failed")
        MockClient.return_value = mock_instance

        slack_search = make_slack_search_tool(CALLING_CHANNEL, BOT_TOKEN)
        result = slack_search(query="test")

    assert isinstance(result, str)
    assert len(result) > 0
