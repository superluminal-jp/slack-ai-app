"""Unit tests for channel_access.py — TDD (RED phase)."""

import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

from channel_access import is_accessible, ChannelAccessDecision


CALLING_CHANNEL = "C_CALLING"
PUBLIC_CHANNEL = "C_PUBLIC"
PRIVATE_CHANNEL = "C_PRIVATE"
BOT_TOKEN = "xoxb-test-token"


def _mock_client_for_channel(is_private: bool):
    """Build a mock slack_sdk.WebClient that returns given is_private for conversations.info."""
    client = MagicMock()
    client.conversations_info.return_value = {
        "ok": True,
        "channel": {"id": PUBLIC_CHANNEL if not is_private else PRIVATE_CHANNEL, "is_private": is_private},
    }
    return client


def test_calling_channel_always_allowed():
    """The calling channel itself must always be accessible regardless of privacy."""
    with patch("channel_access.WebClient") as MockClient:
        MockClient.return_value = _mock_client_for_channel(is_private=True)
        result = is_accessible(CALLING_CHANNEL, CALLING_CHANNEL, BOT_TOKEN)
    assert isinstance(result, ChannelAccessDecision)
    assert result.channel_id == CALLING_CHANNEL
    assert result.allowed is True
    assert result.reason == "calling_channel"


def test_public_channel_allowed():
    """A public channel (is_private=False) must be accessible."""
    with patch("channel_access.WebClient") as MockClient:
        MockClient.return_value = _mock_client_for_channel(is_private=False)
        result = is_accessible(PUBLIC_CHANNEL, CALLING_CHANNEL, BOT_TOKEN)
    assert result.allowed is True
    assert result.reason == "public_channel"


def test_other_private_channel_denied():
    """A private channel that is not the calling channel must be denied."""
    with patch("channel_access.WebClient") as MockClient:
        MockClient.return_value = _mock_client_for_channel(is_private=True)
        result = is_accessible(PRIVATE_CHANNEL, CALLING_CHANNEL, BOT_TOKEN)
    assert result.allowed is False
    assert result.reason == "private_channel"


def test_slack_api_error_raises():
    """conversations.info error must raise SlackApiError (fail-open: propagate, not silently allow)."""
    from slack_sdk.errors import SlackApiError
    with patch("channel_access.WebClient") as MockClient:
        mock_client = MagicMock()
        mock_client.conversations_info.side_effect = SlackApiError(
            "channel_not_found", {"error": "channel_not_found"}
        )
        MockClient.return_value = mock_client
        try:
            is_accessible(PRIVATE_CHANNEL, CALLING_CHANNEL, BOT_TOKEN)
            assert False, "Should have raised SlackApiError"
        except SlackApiError:
            pass  # Expected


def test_channel_access_decision_fields():
    """ChannelAccessDecision must have channel_id, allowed, and reason fields."""
    decision = ChannelAccessDecision(channel_id="C123", allowed=True, reason="calling_channel")
    assert decision.channel_id == "C123"
    assert decision.allowed is True
    assert decision.reason == "calling_channel"
