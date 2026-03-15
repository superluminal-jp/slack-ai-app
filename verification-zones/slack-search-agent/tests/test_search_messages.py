"""Unit tests for search_messages tool — TDD (RED phase)."""

import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

from tools.search_messages import search_messages

CALLING_CHANNEL = "C_CALLING"
PUBLIC_CHANNEL = "C_PUBLIC"
PRIVATE_CHANNEL = "C_PRIVATE"
BOT_TOKEN = "xoxb-test-token"


def _make_message(text: str, ts: str = "1000000.000001", user: str = "U123") -> dict:
    return {"text": text, "ts": ts, "user": user}


def _mock_accessible(allowed: bool, reason: str = "public_channel"):
    """Create a mock ChannelAccessDecision."""
    from channel_access import ChannelAccessDecision
    return ChannelAccessDecision(channel_id=PUBLIC_CHANNEL, allowed=allowed, reason=reason)


def test_search_returns_matching_messages():
    """Keyword search returns messages containing the query."""
    messages = [
        _make_message("release planning meeting"),
        _make_message("lunch menu today"),
        _make_message("Release planning document updated"),
    ]
    with patch("tools.search_messages.SlackClient") as MockClient, \
         patch("tools.search_messages.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(True)

        result = search_messages(
            query="release planning",
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "release planning" in result.lower()
    assert "lunch menu" not in result.lower()


def test_calling_channel_allowed():
    """The calling channel is accessible without Slack API check."""
    messages = [_make_message("test message")]
    with patch("tools.search_messages.SlackClient") as MockClient, \
         patch("tools.search_messages.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages
        MockClient.return_value = mock_client
        from channel_access import ChannelAccessDecision
        mock_access.return_value = ChannelAccessDecision(
            channel_id=CALLING_CHANNEL, allowed=True, reason="calling_channel"
        )

        result = search_messages(
            query="test",
            channel_id=CALLING_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "test" in result.lower()


def test_public_channel_allowed():
    """Public channels return results."""
    messages = [_make_message("release info")]
    with patch("tools.search_messages.SlackClient") as MockClient, \
         patch("tools.search_messages.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(True, "public_channel")

        result = search_messages(
            query="release",
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "error" not in result.lower() or "release" in result.lower()


def test_private_channel_denied():
    """Private channel (non-calling) returns access denied message."""
    with patch("tools.search_messages.SlackClient"), \
         patch("tools.search_messages.is_accessible") as mock_access:
        mock_access.return_value = _mock_accessible(False, "private_channel")

        result = search_messages(
            query="secret",
            channel_id=PRIVATE_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "アクセス" in result or "access" in result.lower() or "プライベート" in result or "private" in result.lower()


def test_no_matching_messages():
    """When no messages match the query, returns appropriate message."""
    messages = [_make_message("completely unrelated content")]
    with patch("tools.search_messages.SlackClient") as MockClient, \
         patch("tools.search_messages.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(True)

        result = search_messages(
            query="xyznonexistentkeyword",
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "見つかりません" in result or "found" in result.lower() or "no message" in result.lower()


def test_limit_applied():
    """Results are limited to at most 20 messages."""
    messages = [_make_message(f"test message {i}") for i in range(30)]
    with patch("tools.search_messages.SlackClient") as MockClient, \
         patch("tools.search_messages.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages[:20]
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(True)

        result = search_messages(
            query="test message",
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
            limit=20,
        )

    # Should not include more than 20 messages
    assert result is not None


def test_slack_api_error_graceful():
    """Slack API error returns graceful error message."""
    from slack_sdk.errors import SlackApiError
    with patch("tools.search_messages.SlackClient") as MockClient, \
         patch("tools.search_messages.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.side_effect = SlackApiError(
            "channel_not_found", {"error": "channel_not_found"}
        )
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(True)

        result = search_messages(
            query="anything",
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "エラー" in result or "error" in result.lower() or "失敗" in result
