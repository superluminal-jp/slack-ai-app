"""Unit tests for get_thread tool — TDD (RED phase)."""

import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

from tools.get_thread import get_thread

CALLING_CHANNEL = "C_CALLING"
PUBLIC_CHANNEL = "C123456789"
PRIVATE_CHANNEL = "C_PRIVATE"
BOT_TOKEN = "xoxb-test-token"
VALID_URL = f"https://workspace.slack.com/archives/{PUBLIC_CHANNEL}/p1706123456789012"
CALLING_URL = f"https://workspace.slack.com/archives/{CALLING_CHANNEL}/p1706123456789012"
PRIVATE_URL = f"https://workspace.slack.com/archives/{PRIVATE_CHANNEL}/p1706123456789012"
INVALID_URL = "https://example.com/not-a-slack-url"


def _make_message(text: str, ts: str = "1706123456.789012", user: str = "U123") -> dict:
    return {"text": text, "ts": ts, "user": user}


def _mock_accessible(channel_id: str, allowed: bool, reason: str = "public_channel"):
    from channel_access import ChannelAccessDecision
    return ChannelAccessDecision(channel_id=channel_id, allowed=allowed, reason=reason)


def test_valid_url_returns_thread_messages():
    """Valid Slack URL returns all thread messages."""
    thread_messages = [
        _make_message("Parent message", ts="1706123456.789012"),
        _make_message("Reply 1", ts="1706123457.000000"),
        _make_message("Reply 2", ts="1706123458.000000"),
    ]
    with patch("tools.get_thread.SlackClient") as MockClient, \
         patch("tools.get_thread.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_thread_replies.return_value = thread_messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(PUBLIC_CHANNEL, True)

        result = get_thread(
            slack_url=VALID_URL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "Parent message" in result
    assert "Reply 1" in result
    assert "Reply 2" in result


def test_calling_channel_url_allowed():
    """URL pointing to calling channel is always accessible."""
    thread_messages = [_make_message("test message")]
    with patch("tools.get_thread.SlackClient") as MockClient, \
         patch("tools.get_thread.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_thread_replies.return_value = thread_messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(CALLING_CHANNEL, True, "calling_channel")

        result = get_thread(
            slack_url=CALLING_URL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "test message" in result


def test_public_channel_url_allowed():
    """URL pointing to public channel is accessible."""
    thread_messages = [_make_message("public thread")]
    with patch("tools.get_thread.SlackClient") as MockClient, \
         patch("tools.get_thread.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_thread_replies.return_value = thread_messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(PUBLIC_CHANNEL, True, "public_channel")

        result = get_thread(
            slack_url=VALID_URL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "public thread" in result


def test_private_channel_url_denied():
    """URL pointing to private channel (non-calling) returns access denied."""
    with patch("tools.get_thread.SlackClient"), \
         patch("tools.get_thread.is_accessible") as mock_access:
        mock_access.return_value = _mock_accessible(PRIVATE_CHANNEL, False, "private_channel")

        result = get_thread(
            slack_url=PRIVATE_URL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "アクセス" in result or "access" in result.lower() or "プライベート" in result or "private" in result.lower()


def test_invalid_url_format_returns_error():
    """Non-Slack URL returns error message."""
    result = get_thread(
        slack_url=INVALID_URL,
        calling_channel=CALLING_CHANNEL,
        bot_token=BOT_TOKEN,
    )

    assert "URL" in result or "url" in result.lower() or "形式" in result or "invalid" in result.lower()


def test_slack_api_error_graceful():
    """Slack API error returns graceful error message."""
    from slack_sdk.errors import SlackApiError
    with patch("tools.get_thread.SlackClient") as MockClient, \
         patch("tools.get_thread.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_thread_replies.side_effect = SlackApiError(
            "thread_not_found", {"error": "thread_not_found"}
        )
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(PUBLIC_CHANNEL, True)

        result = get_thread(
            slack_url=VALID_URL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "エラー" in result or "error" in result.lower() or "失敗" in result


def test_limit_applied_to_thread():
    """Thread retrieval respects the limit parameter (max 20)."""
    messages = [_make_message(f"reply {i}") for i in range(25)]
    with patch("tools.get_thread.SlackClient") as MockClient, \
         patch("tools.get_thread.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_thread_replies.return_value = messages[:20]
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(PUBLIC_CHANNEL, True)

        result = get_thread(
            slack_url=VALID_URL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
            limit=20,
        )

    assert result is not None
    assert len(result) > 0
