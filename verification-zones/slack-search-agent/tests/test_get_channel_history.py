"""Unit tests for get_channel_history tool — TDD (RED phase)."""

import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

from tools.get_channel_history import get_channel_history

CALLING_CHANNEL = "C_CALLING"
PUBLIC_CHANNEL = "C_PUBLIC"
PRIVATE_CHANNEL = "C_PRIVATE"
BOT_TOKEN = "xoxb-test-token"


def _make_message(text: str, ts: str = "1706123456.789012", user: str = "U123") -> dict:
    return {"text": text, "ts": ts, "user": user}


def _mock_accessible(channel_id: str, allowed: bool, reason: str = "public_channel"):
    from channel_access import ChannelAccessDecision
    return ChannelAccessDecision(channel_id=channel_id, allowed=allowed, reason=reason)


def test_public_channel_returns_messages():
    """Public channel returns latest messages."""
    messages = [
        _make_message("Latest message", ts="1706123460.000000"),
        _make_message("Older message", ts="1706123450.000000"),
    ]
    with patch("tools.get_channel_history.SlackClient") as MockClient, \
         patch("tools.get_channel_history.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(PUBLIC_CHANNEL, True)

        result = get_channel_history(
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "Latest message" in result
    assert "Older message" in result


def test_timestamps_formatted_as_jst():
    """Timestamps are formatted as JST datetime strings, not raw Unix values."""
    messages = [_make_message("hello", ts="1706123456.789012")]
    with patch("tools.get_channel_history.SlackClient") as MockClient, \
         patch("tools.get_channel_history.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(PUBLIC_CHANNEL, True)

        result = get_channel_history(
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    # Raw Unix timestamp must NOT appear in output
    assert "1706123456.789012" not in result
    # JST marker must appear
    assert "JST" in result


def test_invalid_ts_falls_back_without_raising():
    """OverflowError, TypeError, and invalid values fall back to raw ts, never raise."""
    from tools.get_channel_history import _ts_to_jst
    assert _ts_to_jst("9" * 40) == "9" * 40   # OverflowError
    assert _ts_to_jst(None) is None             # TypeError
    assert _ts_to_jst("not-a-number") == "not-a-number"  # ValueError


def test_calling_channel_allowed():
    """The calling channel is always accessible."""
    messages = [_make_message("calling channel message")]
    with patch("tools.get_channel_history.SlackClient") as MockClient, \
         patch("tools.get_channel_history.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(CALLING_CHANNEL, True, "calling_channel")

        result = get_channel_history(
            channel_id=CALLING_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "calling channel message" in result


def test_private_channel_denied():
    """Private channel (non-calling) returns access denied message."""
    with patch("tools.get_channel_history.SlackClient"), \
         patch("tools.get_channel_history.is_accessible") as mock_access:
        mock_access.return_value = _mock_accessible(PRIVATE_CHANNEL, False, "private_channel")

        result = get_channel_history(
            channel_id=PRIVATE_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "アクセス" in result or "access" in result.lower() or "プライベート" in result or "private" in result.lower()


def test_bot_not_in_channel_error():
    """Bot not in channel returns appropriate error message."""
    from slack_sdk.errors import SlackApiError
    with patch("tools.get_channel_history.SlackClient") as MockClient, \
         patch("tools.get_channel_history.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.side_effect = SlackApiError(
            "not_in_channel", {"error": "not_in_channel"}
        )
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(PUBLIC_CHANNEL, True)

        result = get_channel_history(
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert "エラー" in result or "error" in result.lower() or "失敗" in result


def test_limit_default_is_20():
    """Default limit returns up to 20 messages."""
    messages = [_make_message(f"message {i}") for i in range(20)]
    with patch("tools.get_channel_history.SlackClient") as MockClient, \
         patch("tools.get_channel_history.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(PUBLIC_CHANNEL, True)

        result = get_channel_history(
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
        )

    assert result is not None
    assert len(result) > 0
    # Verify limit was passed as 20
    mock_client.get_channel_history.assert_called_once_with(channel_id=PUBLIC_CHANNEL, limit=20)


def test_limit_capped_at_20():
    """Limit is capped at 20 even if higher value specified."""
    messages = [_make_message(f"message {i}") for i in range(20)]
    with patch("tools.get_channel_history.SlackClient") as MockClient, \
         patch("tools.get_channel_history.is_accessible") as mock_access:
        mock_client = MagicMock()
        mock_client.get_channel_history.return_value = messages
        MockClient.return_value = mock_client
        mock_access.return_value = _mock_accessible(PUBLIC_CHANNEL, True)

        result = get_channel_history(
            channel_id=PUBLIC_CHANNEL,
            calling_channel=CALLING_CHANNEL,
            bot_token=BOT_TOKEN,
            limit=50,
        )

    # Should cap at 20
    call_args = mock_client.get_channel_history.call_args
    assert call_args[1]["limit"] <= 20
    assert result is not None
