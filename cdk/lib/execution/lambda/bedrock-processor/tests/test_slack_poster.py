"""
Unit tests for Slack poster module.

Tests thread reply functionality and fallback behavior.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from slack_sdk.errors import SlackApiError

# Import handler module to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from slack_poster import post_to_slack, _is_valid_timestamp


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
        assert _is_valid_timestamp("1234567890") is False  # Missing decimal part
        assert _is_valid_timestamp(".123456") is False  # Missing integer part
        assert _is_valid_timestamp("1234567890.") is False  # Missing decimal part
        assert _is_valid_timestamp("123.456.789") is False  # Multiple dots
    
    def test_empty_or_none_timestamp(self):
        """Test that empty string or None returns False."""
        assert _is_valid_timestamp("") is False
        assert _is_valid_timestamp(None) is False
    
    def test_non_string_timestamp(self):
        """Test that non-string types return False."""
        assert _is_valid_timestamp(1234567890.123456) is False
        assert _is_valid_timestamp(1234567890) is False
        assert _is_valid_timestamp([]) is False
        assert _is_valid_timestamp({}) is False


class TestThreadReplyPosting:
    """Test thread reply posting functionality."""
    
    @patch('slack_poster.WebClient')
    def test_successful_thread_reply(self, mock_web_client_class):
        """Test successful thread reply with valid thread_ts."""
        # Setup mock
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_response = {"ok": True, "ts": "1234567890.123457"}
        mock_client.chat_postMessage.return_value = mock_response
        
        # Call function
        post_to_slack("C01234567", "Hello!", "xoxb-test", "1234567890.123456")
        
        # Verify thread_ts was passed to API
        mock_client.chat_postMessage.assert_called_once()
        call_kwargs = mock_client.chat_postMessage.call_args[1]
        assert call_kwargs["channel"] == "C01234567"
        assert call_kwargs["text"] == "Hello!"
        assert call_kwargs["thread_ts"] == "1234567890.123456"
    
    @patch('slack_poster.WebClient')
    def test_fallback_to_channel_message_when_thread_ts_none(self, mock_web_client_class):
        """Test fallback to channel message when thread_ts is None."""
        # Setup mock
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_response = {"ok": True, "ts": "1234567890.123457"}
        mock_client.chat_postMessage.return_value = mock_response
        
        # Call function with None thread_ts
        post_to_slack("C01234567", "Hello!", "xoxb-test", None)
        
        # Verify thread_ts was NOT passed to API
        mock_client.chat_postMessage.assert_called_once()
        call_kwargs = mock_client.chat_postMessage.call_args[1]
        assert call_kwargs["channel"] == "C01234567"
        assert call_kwargs["text"] == "Hello!"
        assert "thread_ts" not in call_kwargs
    
    @patch('slack_poster.WebClient')
    def test_fallback_to_channel_message_when_thread_ts_invalid(self, mock_web_client_class):
        """Test fallback to channel message when thread_ts format is invalid."""
        # Setup mock
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_response = {"ok": True, "ts": "1234567890.123457"}
        mock_client.chat_postMessage.return_value = mock_response
        
        # Call function with invalid thread_ts format
        post_to_slack("C01234567", "Hello!", "xoxb-test", "invalid")
        
        # Verify thread_ts was NOT passed to API (fallback to channel message)
        mock_client.chat_postMessage.assert_called_once()
        call_kwargs = mock_client.chat_postMessage.call_args[1]
        assert call_kwargs["channel"] == "C01234567"
        assert call_kwargs["text"] == "Hello!"
        assert "thread_ts" not in call_kwargs
    
    @patch('slack_poster.WebClient')
    def test_error_handling_message_not_found_fallback(self, mock_web_client_class):
        """Test error handling: message_not_found error falls back to channel message."""
        # Setup mock
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        
        # First call fails with message_not_found
        error_response = Mock()
        error_response.get.return_value = "message_not_found"
        first_error = SlackApiError("message_not_found", response=error_response)
        first_error.response = {"error": "message_not_found"}
        
        # Second call (fallback) succeeds
        success_response = {"ok": True, "ts": "1234567890.123457"}
        
        mock_client.chat_postMessage.side_effect = [first_error, success_response]
        
        # Call function
        post_to_slack("C01234567", "Hello!", "xoxb-test", "1234567890.123456")
        
        # Verify two calls: first with thread_ts (failed), second without (succeeded)
        assert mock_client.chat_postMessage.call_count == 2
        
        # First call with thread_ts
        first_call_kwargs = mock_client.chat_postMessage.call_args_list[0][1]
        assert first_call_kwargs["thread_ts"] == "1234567890.123456"
        
        # Second call without thread_ts (fallback)
        second_call_kwargs = mock_client.chat_postMessage.call_args_list[1][1]
        assert "thread_ts" not in second_call_kwargs
        assert second_call_kwargs["channel"] == "C01234567"
        assert second_call_kwargs["text"] == "Hello!"
    
    @patch('slack_poster.WebClient')
    def test_error_handling_invalid_thread_ts_fallback(self, mock_web_client_class):
        """Test error handling: invalid_thread_ts error falls back to channel message."""
        # Setup mock
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        
        # First call fails with invalid_thread_ts
        error_response = Mock()
        error_response.get.return_value = "invalid_thread_ts"
        first_error = SlackApiError("invalid_thread_ts", response=error_response)
        first_error.response = {"error": "invalid_thread_ts"}
        
        # Second call (fallback) succeeds
        success_response = {"ok": True, "ts": "1234567890.123457"}
        
        mock_client.chat_postMessage.side_effect = [first_error, success_response]
        
        # Call function
        post_to_slack("C01234567", "Hello!", "xoxb-test", "1234567890.123456")
        
        # Verify two calls: first with thread_ts (failed), second without (succeeded)
        assert mock_client.chat_postMessage.call_count == 2
    
    @patch('slack_poster.WebClient')
    def test_error_handling_other_errors_re_raised(self, mock_web_client_class):
        """Test error handling: other errors (not message_not_found or invalid_thread_ts) are re-raised."""
        # Setup mock
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        
        # Call fails with channel_not_found (should not fall back)
        error_response = Mock()
        error_response.get.return_value = "channel_not_found"
        error = SlackApiError("channel_not_found", response=error_response)
        error.response = {"error": "channel_not_found"}
        
        mock_client.chat_postMessage.side_effect = error
        
        # Call function and expect error to be raised
        with pytest.raises(SlackApiError):
            post_to_slack("C01234567", "Hello!", "xoxb-test", "1234567890.123456")
        
        # Verify only one call (no fallback)
        assert mock_client.chat_postMessage.call_count == 1

