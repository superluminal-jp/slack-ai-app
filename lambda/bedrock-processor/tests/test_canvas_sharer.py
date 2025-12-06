"""
Tests for canvas_sharer module.

Tests Canvas sharing functionality including:
- Sharing in thread (with thread_ts)
- Sharing in channel (without thread_ts)
- Error handling for sharing failures
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from slack_sdk.errors import SlackApiError

# Import handler module to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from canvas_sharer import (
    share_canvas,
    _is_valid_timestamp,
    map_error_code
)


class TestTimestampValidation:
    """Test timestamp validation helper function."""

    def test_valid_timestamp(self):
        """Test that valid Slack timestamp format returns True."""
        assert _is_valid_timestamp("1234567890.123456") is True
        assert _is_valid_timestamp("1234567890.123") is True
        assert _is_valid_timestamp("0.0") is True

    def test_invalid_timestamp_formats(self):
        """Test that invalid timestamp formats return False."""
        assert _is_valid_timestamp("invalid") is False
        assert _is_valid_timestamp("1234567890") is False
        assert _is_valid_timestamp(".123456") is False
        assert _is_valid_timestamp("1234567890.") is False
        assert _is_valid_timestamp("123.456.789") is False

    def test_empty_or_none_timestamp(self):
        """Test that empty string or None returns False."""
        assert _is_valid_timestamp("") is False
        assert _is_valid_timestamp(None) is False

    def test_non_string_timestamp(self):
        """Test that non-string types return False."""
        assert _is_valid_timestamp(1234567890.123456) is False
        assert _is_valid_timestamp(1234567890) is False


class TestMapErrorCode:
    """Test error code mapping."""

    def test_map_permission_errors(self):
        """Test mapping permission-related errors."""
        assert map_error_code("missing_scope") == "permission_error"
        assert map_error_code("not_authorized") == "permission_error"
        assert map_error_code("invalid_auth") == "permission_error"

    def test_map_rate_limit_error(self):
        """Test mapping rate limit error."""
        assert map_error_code("rate_limited") == "rate_limit"

    def test_map_api_errors(self):
        """Test mapping API errors."""
        assert map_error_code("invalid_request") == "api_error"
        assert map_error_code("canvas_not_found") == "api_error"
        assert map_error_code("channel_not_found") == "api_error"

    def test_map_unknown_error(self):
        """Test mapping unknown error."""
        assert map_error_code("unknown_error") == "unknown"


class TestShareCanvasInThread:
    """Test Canvas sharing in thread context."""

    @patch('canvas_sharer.WebClient')
    def test_share_canvas_in_thread_success(self, mock_web_client_class):
        """Test successful Canvas sharing in thread."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_share.return_value = {
            "ok": True,
            "canvas_id": "C01234567",
            "channel": "C01234567",
            "thread_ts": "1234567890.123456"
        }

        result = share_canvas(
            bot_token="xoxb-test",
            canvas_id="C01234567",
            channel="C01234567",
            thread_ts="1234567890.123456"
        )

        assert result["success"] == True
        mock_client.canvas_share.assert_called_once()
        call_kwargs = mock_client.canvas_share.call_args[1]
        assert call_kwargs["canvas_id"] == "C01234567"
        assert call_kwargs["channel"] == "C01234567"
        assert call_kwargs["thread_ts"] == "1234567890.123456"

    @patch('canvas_sharer.WebClient')
    def test_share_canvas_with_invalid_thread_ts(self, mock_web_client_class):
        """Test Canvas sharing with invalid thread_ts (should be ignored)."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_share.return_value = {"ok": True}

        result = share_canvas(
            bot_token="xoxb-test",
            canvas_id="C01234567",
            channel="C01234567",
            thread_ts="invalid"
        )

        assert result["success"] == True
        call_kwargs = mock_client.canvas_share.call_args[1]
        assert "thread_ts" not in call_kwargs  # Invalid timestamp should be ignored


class TestShareCanvasInChannel:
    """Test Canvas sharing in channel (no thread)."""

    @patch('canvas_sharer.WebClient')
    def test_share_canvas_in_channel_success(self, mock_web_client_class):
        """Test successful Canvas sharing in channel."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_share.return_value = {
            "ok": True,
            "canvas_id": "C01234567",
            "channel": "C01234567"
        }

        result = share_canvas(
            bot_token="xoxb-test",
            canvas_id="C01234567",
            channel="C01234567",
            thread_ts=None
        )

        assert result["success"] == True
        call_kwargs = mock_client.canvas_share.call_args[1]
        assert call_kwargs["canvas_id"] == "C01234567"
        assert call_kwargs["channel"] == "C01234567"
        assert "thread_ts" not in call_kwargs


class TestShareCanvasValidation:
    """Test Canvas sharing input validation."""

    def test_missing_bot_token(self):
        """Test Canvas sharing with missing bot token."""
        result = share_canvas(
            bot_token="",
            canvas_id="C01234567",
            channel="C01234567"
        )

        assert result["success"] == False
        assert result["error_code"] == "api_error"
        assert "token" in result["error_message"].lower()

    def test_missing_canvas_id(self):
        """Test Canvas sharing with missing canvas ID."""
        result = share_canvas(
            bot_token="xoxb-test",
            canvas_id="",
            channel="C01234567"
        )

        assert result["success"] == False
        assert result["error_code"] == "api_error"
        assert "canvas" in result["error_message"].lower()

    def test_missing_channel(self):
        """Test Canvas sharing with missing channel."""
        result = share_canvas(
            bot_token="xoxb-test",
            canvas_id="C01234567",
            channel=""
        )

        assert result["success"] == False
        assert result["error_code"] == "api_error"
        assert "channel" in result["error_message"].lower()


class TestShareCanvasErrors:
    """Test Canvas sharing error handling."""

    @patch('canvas_sharer.WebClient')
    def test_sharing_failure(self, mock_web_client_class):
        """Test handling of sharing failure."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_share.return_value = {
            "ok": False,
            "error": "canvas_not_found",
            "error_message": "Canvas not found"
        }

        result = share_canvas(
            bot_token="xoxb-test",
            canvas_id="C01234567",
            channel="C01234567"
        )

        assert result["success"] == False
        assert result["error_code"] == "api_error"

    @patch('canvas_sharer.WebClient')
    def test_permission_error(self, mock_web_client_class):
        """Test handling of permission error."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_share.return_value = {
            "ok": False,
            "error": "not_authorized",
            "error_message": "Not authorized"
        }

        result = share_canvas(
            bot_token="xoxb-test",
            canvas_id="C01234567",
            channel="C01234567"
        )

        assert result["success"] == False
        assert result["error_code"] == "permission_error"

    @patch('canvas_sharer.WebClient')
    def test_slack_api_exception(self, mock_web_client_class):
        """Test handling of SlackApiError exception."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_response = Mock()
        mock_response.get.return_value = "channel_not_found"
        mock_client.canvas_share.side_effect = SlackApiError(
            "API error",
            response=mock_response
        )

        result = share_canvas(
            bot_token="xoxb-test",
            canvas_id="C01234567",
            channel="C01234567"
        )

        assert result["success"] == False
        assert result["error_code"] in ["api_error", "unknown"]

    @patch('canvas_sharer.WebClient')
    def test_unexpected_exception(self, mock_web_client_class):
        """Test handling of unexpected exceptions."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_share.side_effect = Exception("Unexpected error")

        result = share_canvas(
            bot_token="xoxb-test",
            canvas_id="C01234567",
            channel="C01234567"
        )

        assert result["success"] == False
        assert result["error_code"] == "unknown"

