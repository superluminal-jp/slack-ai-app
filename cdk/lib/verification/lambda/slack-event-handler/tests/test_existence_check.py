"""
Unit tests for existence_check module.

Tests entity verification (team_id, user_id, channel_id) via Slack API,
error handling, and cache operations.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import os
import time

# Import module to test
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from existence_check import (
    ExistenceCheckError,
    check_entity_existence,
    get_from_cache,
    save_to_cache,
    _generate_cache_key,
)


class TestCacheKeyGeneration:
    """Test cache key generation function."""
    
    def test_generate_cache_key_all_ids(self):
        """Test cache key generation with all IDs."""
        key = _generate_cache_key("T01234567", "U01234567", "C01234567")
        assert key == "T01234567#U01234567#C01234567"
    
    def test_generate_cache_key_partial_ids(self):
        """Test cache key generation with partial IDs."""
        key = _generate_cache_key("T01234567", None, "C01234567")
        assert key == "T01234567##C01234567"
        
        key = _generate_cache_key(None, "U01234567", None)
        assert key == "#U01234567#"
    
    def test_generate_cache_key_no_ids(self):
        """Test cache key generation with no IDs."""
        key = _generate_cache_key(None, None, None)
        assert key == "##"


class TestCacheOperations:
    """Test cache read/write operations."""
    
    @patch('existence_check._get_cache_table')
    def test_get_from_cache_hit(self, mock_get_table):
        """Test cache hit scenario."""
        # Mock DynamoDB table
        mock_table = MagicMock()
        mock_get_table.return_value = mock_table
        
        # Mock cache entry with valid TTL
        current_time = int(time.time())
        mock_table.get_item.return_value = {
            "Item": {
                "cache_key": "T01234567#U01234567#C01234567",
                "ttl": current_time + 300,  # Valid (not expired)
                "verified_at": current_time,
            }
        }
        
        result = get_from_cache("T01234567#U01234567#C01234567")
        assert result is not None
        assert result["cache_key"] == "T01234567#U01234567#C01234567"
        mock_table.get_item.assert_called_once_with(Key={"cache_key": "T01234567#U01234567#C01234567"})
    
    @patch('existence_check._get_cache_table')
    def test_get_from_cache_miss(self, mock_get_table):
        """Test cache miss scenario (no entry)."""
        mock_table = MagicMock()
        mock_get_table.return_value = mock_table
        mock_table.get_item.return_value = {}  # No Item
        
        result = get_from_cache("T01234567#U01234567#C01234567")
        assert result is None
    
    @patch('existence_check._get_cache_table')
    def test_get_from_cache_expired(self, mock_get_table):
        """Test expired cache entry."""
        mock_table = MagicMock()
        mock_get_table.return_value = mock_table
        
        # Mock cache entry with expired TTL
        current_time = int(time.time())
        mock_table.get_item.return_value = {
            "Item": {
                "cache_key": "T01234567#U01234567#C01234567",
                "ttl": current_time - 100,  # Expired
                "verified_at": current_time - 400,
            }
        }
        
        result = get_from_cache("T01234567#U01234567#C01234567")
        assert result is None  # Expired entry should return None
    
    @patch('existence_check._get_cache_table')
    def test_get_from_cache_table_not_configured(self, mock_get_table):
        """Test cache read when table not configured."""
        mock_get_table.return_value = None
        
        result = get_from_cache("T01234567#U01234567#C01234567")
        assert result is None
    
    @patch('existence_check._get_cache_table')
    def test_save_to_cache_success(self, mock_get_table):
        """Test successful cache write."""
        mock_table = MagicMock()
        mock_get_table.return_value = mock_table
        
        save_to_cache("T01234567#U01234567#C01234567", ttl=300)
        
        # Verify put_item was called with correct structure
        mock_table.put_item.assert_called_once()
        call_args = mock_table.put_item.call_args[1]["Item"]
        assert call_args["cache_key"] == "T01234567#U01234567#C01234567"
        assert call_args["ttl"] > int(time.time())  # TTL should be in the future
        assert "verified_at" in call_args


class TestEntityVerification:
    """Test entity verification via Slack API."""
    
    @patch('existence_check.WebClient')
    def test_team_id_verification_success(self, mock_webclient):
        """Test successful team_id verification."""
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        mock_client.team_info.return_value = {"ok": True, "team": {"id": "T01234567"}}
        
        result = check_entity_existence(
            bot_token="xoxb-test-token",
            team_id="T01234567",
        )
        assert result is True
        mock_client.team_info.assert_called_once_with(team="T01234567")
    
    @patch('existence_check.WebClient')
    def test_user_id_verification_success(self, mock_webclient):
        """Test successful user_id verification."""
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        mock_client.users_info.return_value = {"ok": True, "user": {"id": "U01234567"}}
        
        result = check_entity_existence(
            bot_token="xoxb-test-token",
            user_id="U01234567",
        )
        assert result is True
        mock_client.users_info.assert_called_once_with(user="U01234567")
    
    @patch('existence_check.WebClient')
    def test_channel_id_verification_success(self, mock_webclient):
        """Test successful channel_id verification."""
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        mock_client.conversations_info.return_value = {"ok": True, "channel": {"id": "C01234567"}}
        
        result = check_entity_existence(
            bot_token="xoxb-test-token",
            channel_id="C01234567",
        )
        assert result is True
        mock_client.conversations_info.assert_called_once_with(channel="C01234567")
    
    @patch('existence_check.WebClient')
    def test_team_id_verification_failure(self, mock_webclient):
        """Test team_id verification failure (team_not_found)."""
        from slack_sdk.errors import SlackApiError
        
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        
        # Mock SlackApiError for team_not_found
        error_response = {"error": "team_not_found"}
        mock_client.team_info.side_effect = SlackApiError(
            message="Team not found",
            response=error_response,
        )
        
        with pytest.raises(ExistenceCheckError) as exc_info:
            check_entity_existence(
                bot_token="xoxb-test-token",
                team_id="T_INVALID",
            )
        assert "Team not found" in str(exc_info.value)
    
    @patch('existence_check.WebClient')
    def test_user_id_verification_failure(self, mock_webclient):
        """Test user_id verification failure (user_not_found)."""
        from slack_sdk.errors import SlackApiError
        
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        
        # Mock SlackApiError for user_not_found
        error_response = {"error": "user_not_found"}
        mock_client.users_info.side_effect = SlackApiError(
            message="User not found",
            response=error_response,
        )
        
        with pytest.raises(ExistenceCheckError) as exc_info:
            check_entity_existence(
                bot_token="xoxb-test-token",
                user_id="U_INVALID",
            )
        assert "User not found" in str(exc_info.value)
    
    @patch('existence_check.WebClient')
    def test_channel_id_verification_failure(self, mock_webclient):
        """Test channel_id verification failure (channel_not_found)."""
        from slack_sdk.errors import SlackApiError
        
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        
        # Mock SlackApiError for channel_not_found
        error_response = {"error": "channel_not_found"}
        mock_client.conversations_info.side_effect = SlackApiError(
            message="Channel not found",
            response=error_response,
        )
        
        with pytest.raises(ExistenceCheckError) as exc_info:
            check_entity_existence(
                bot_token="xoxb-test-token",
                channel_id="C_INVALID",
            )
        assert "Channel not found" in str(exc_info.value)
    
    @patch('existence_check.WebClient')
    def test_all_entities_verification_success(self, mock_webclient):
        """Test verification of all entities (team, user, channel)."""
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        mock_client.team_info.return_value = {"ok": True}
        mock_client.users_info.return_value = {"ok": True}
        mock_client.conversations_info.return_value = {"ok": True}
        
        result = check_entity_existence(
            bot_token="xoxb-test-token",
            team_id="T01234567",
            user_id="U01234567",
            channel_id="C01234567",
        )
        assert result is True
        mock_client.team_info.assert_called_once()
        mock_client.users_info.assert_called_once()
        mock_client.conversations_info.assert_called_once()
    
    @patch('existence_check.WebClient')
    def test_verification_skips_none_values(self, mock_webclient):
        """Test that None values are skipped (not verified)."""
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        
        result = check_entity_existence(
            bot_token="xoxb-test-token",
            team_id=None,
            user_id=None,
            channel_id=None,
        )
        assert result is True
        # No API calls should be made when all IDs are None
        mock_client.team_info.assert_not_called()
        mock_client.users_info.assert_not_called()
        mock_client.conversations_info.assert_not_called()


class TestErrorHandling:
    """Test error handling (timeout, rate limits, retry logic)."""
    
    @patch('existence_check.WebClient')
    @patch('existence_check.get_from_cache', return_value=None)
    def test_timeout_handling(self, mock_get_cache, mock_webclient):
        """Test timeout handling (T051)."""
        import socket
        
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        
        # Mock timeout exception
        mock_client.team_info.side_effect = socket.timeout("Request timeout")
        
        with pytest.raises(ExistenceCheckError) as exc_info:
            check_entity_existence(
                bot_token="xoxb-test-token",
                team_id="T01234567",
            )
        assert "timeout" in str(exc_info.value).lower()
        assert "T01234567" in str(exc_info.value)
    
    @patch('existence_check.WebClient')
    @patch('existence_check.get_from_cache', return_value=None)
    @patch('time.sleep')  # Mock sleep to speed up test
    def test_rate_limit_retry_logic(self, mock_sleep, mock_get_cache, mock_webclient):
        """Test rate limit retry logic with exponential backoff (T052)."""
        from slack_sdk.errors import SlackApiError
        
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        
        # Mock 429 rate limit error for first 2 attempts, then success
        rate_limit_error = SlackApiError(
            message="Rate limit exceeded",
            response={"status_code": 429, "error": "rate_limited"},
        )
        mock_client.team_info.side_effect = [
            rate_limit_error,  # First attempt: 429
            rate_limit_error,  # Second attempt: 429
            {"ok": True},      # Third attempt: success
        ]
        
        result = check_entity_existence(
            bot_token="xoxb-test-token",
            team_id="T01234567",
        )
        
        assert result is True
        # Verify 3 attempts were made
        assert mock_client.team_info.call_count == 3
        # Verify exponential backoff delays: 1s, 2s
        assert mock_sleep.call_count == 2
        assert mock_sleep.call_args_list[0][0][0] == 1  # First delay: 1s
        assert mock_sleep.call_args_list[1][0][0] == 2  # Second delay: 2s
    
    @patch('existence_check.WebClient')
    @patch('existence_check.get_from_cache', return_value=None)
    @patch('time.sleep')  # Mock sleep to speed up test
    def test_rate_limit_exhaustion(self, mock_sleep, mock_get_cache, mock_webclient):
        """Test rate limit exhaustion after max retries (T053)."""
        from slack_sdk.errors import SlackApiError
        
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        
        # Mock 429 rate limit error for all 3 attempts
        rate_limit_error = SlackApiError(
            message="Rate limit exceeded",
            response={"status_code": 429, "error": "rate_limited"},
        )
        mock_client.team_info.side_effect = rate_limit_error
        
        with pytest.raises(ExistenceCheckError) as exc_info:
            check_entity_existence(
                bot_token="xoxb-test-token",
                team_id="T01234567",
            )
        assert "rate limit" in str(exc_info.value).lower()
        # Verify 3 attempts were made
        assert mock_client.team_info.call_count == 3
        # Verify exponential backoff: sleep before retry 2 and 3 only (2 sleeps: 1s, 2s)
        assert mock_sleep.call_count == 2
        assert mock_sleep.call_args_list[0][0][0] == 1
        assert mock_sleep.call_args_list[1][0][0] == 2
    
    @patch('existence_check.WebClient')
    @patch('existence_check.get_from_cache', return_value=None)
    def test_other_slack_api_errors(self, mock_get_cache, mock_webclient):
        """Test handling of other Slack API errors (T054)."""
        from slack_sdk.errors import SlackApiError
        
        mock_client = MagicMock()
        mock_webclient.return_value = mock_client
        
        # Mock other API error (not rate limit, not not_found)
        api_error = SlackApiError(
            message="Internal server error",
            response={"status_code": 500, "error": "internal_error"},
        )
        mock_client.team_info.side_effect = api_error
        
        with pytest.raises(ExistenceCheckError) as exc_info:
            check_entity_existence(
                bot_token="xoxb-test-token",
                team_id="T01234567",
            )
        assert "Slack API error" in str(exc_info.value)
        # Should not retry for non-rate-limit errors
        assert mock_client.team_info.call_count == 1

