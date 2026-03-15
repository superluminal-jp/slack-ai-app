"""
Unit tests for authorization module.

Tests whitelist authorization logic, including authorized and unauthorized scenarios.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import os
import time

# Import module to test
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from authorization import (
    AuthorizationError,
    AuthorizationResult,
    authorize_request,
)
from whitelist_loader import AuthorizationError as LoaderError


class TestAuthorizationResult:
    """Test AuthorizationResult dataclass."""
    
    def test_authorization_result_authorized(self):
        """Test AuthorizationResult with authorized=True."""
        result = AuthorizationResult(
            authorized=True,
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        
        assert result.authorized is True
        assert result.team_id == "T123ABC"
        assert result.user_id == "U111"
        assert result.channel_id == "C001"
        assert result.unauthorized_entities is None
        assert result.error_message is None
        assert result.timestamp > 0
    
    def test_authorization_result_unauthorized(self):
        """Test AuthorizationResult with authorized=False."""
        result = AuthorizationResult(
            authorized=False,
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
            unauthorized_entities=["team_id"],
        )
        
        assert result.authorized is False
        assert result.team_id == "T123ABC"
        assert result.user_id == "U111"
        assert result.channel_id == "C001"
        assert result.unauthorized_entities == ["team_id"]
        assert result.timestamp > 0
    
    def test_authorization_result_timestamp_auto_set(self):
        """Test AuthorizationResult automatically sets timestamp."""
        result = AuthorizationResult(authorized=True)
        
        assert result.timestamp > 0
        assert result.timestamp <= int(time.time())


class TestAuthorizeRequest:
    """Test authorize_request function."""
    
    @patch('authorization.load_whitelist_config')
    def test_authorize_request_all_authorized(self, mock_load):
        """Test authorization succeeds when all entities are authorized."""
        # Mock whitelist with all entities authorized
        mock_load.return_value = {
            "team_ids": set(["T123ABC", "T456DEF"]),
            "user_ids": set(["U111", "U222"]),
            "channel_ids": set(["C001", "C002"]),
        }
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        
        assert result.authorized is True
        assert result.team_id == "T123ABC"
        assert result.user_id == "U111"
        assert result.channel_id == "C001"
        assert result.unauthorized_entities is None
        assert result.error_message is None
    
    @patch('authorization.load_whitelist_config')
    def test_authorize_request_unauthorized_team_id(self, mock_load):
        """Test authorization fails when team_id is not authorized."""
        mock_load.return_value = {
            "team_ids": set(["T456DEF"]),  # T123ABC not in whitelist
            "user_ids": set(["U111", "U222"]),
            "channel_ids": set(["C001", "C002"]),
        }
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        
        assert result.authorized is False
        assert result.unauthorized_entities == ["team_id"]
        assert result.error_message is None
    
    @patch('authorization.load_whitelist_config')
    def test_authorize_request_unauthorized_user_id(self, mock_load):
        """Test authorization fails when user_id is not authorized."""
        mock_load.return_value = {
            "team_ids": set(["T123ABC", "T456DEF"]),
            "user_ids": set(["U222"]),  # U111 not in whitelist
            "channel_ids": set(["C001", "C002"]),
        }
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        
        assert result.authorized is False
        assert result.unauthorized_entities == ["user_id"]
    
    @patch('authorization.load_whitelist_config')
    def test_authorize_request_unauthorized_channel_id(self, mock_load):
        """Test authorization fails when channel_id is not authorized."""
        mock_load.return_value = {
            "team_ids": set(["T123ABC", "T456DEF"]),
            "user_ids": set(["U111", "U222"]),
            "channel_ids": set(["C002"]),  # C001 not in whitelist
        }
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        
        assert result.authorized is False
        assert result.unauthorized_entities == ["channel_id"]
    
    @patch('authorization.load_whitelist_config')
    def test_authorize_request_multiple_unauthorized(self, mock_load):
        """Test authorization fails when multiple entities are not authorized."""
        mock_load.return_value = {
            "team_ids": set(["T456DEF"]),  # T123ABC not authorized
            "user_ids": set(["U222"]),  # U111 not authorized
            "channel_ids": set(["C001", "C002"]),
        }
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        
        assert result.authorized is False
        assert "team_id" in result.unauthorized_entities
        assert "user_id" in result.unauthorized_entities
        assert "channel_id" not in result.unauthorized_entities
    
    @patch('authorization.load_whitelist_config')
    def test_authorize_request_missing_team_id(self, mock_load):
        """Test authorization fails when team_id is missing (None)."""
        mock_load.return_value = {
            "team_ids": set(["T123ABC", "T456DEF"]),
            "user_ids": set(["U111", "U222"]),
            "channel_ids": set(["C001", "C002"]),
        }
        
        result = authorize_request(
            team_id=None,
            user_id="U111",
            channel_id="C001",
        )
        
        assert result.authorized is False
        assert "team_id" in result.unauthorized_entities
    
    @patch('authorization.load_whitelist_config')
    def test_authorize_request_missing_user_id(self, mock_load):
        """Test authorization fails when user_id is missing (None)."""
        mock_load.return_value = {
            "team_ids": set(["T123ABC", "T456DEF"]),
            "user_ids": set(["U111", "U222"]),
            "channel_ids": set(["C001", "C002"]),
        }
        
        result = authorize_request(
            team_id="T123ABC",
            user_id=None,
            channel_id="C001",
        )
        
        assert result.authorized is False
        assert "user_id" in result.unauthorized_entities
    
    @patch('authorization.load_whitelist_config')
    def test_authorize_request_missing_channel_id(self, mock_load):
        """Test authorization fails when channel_id is missing (None)."""
        mock_load.return_value = {
            "team_ids": set(["T123ABC", "T456DEF"]),
            "user_ids": set(["U111", "U222"]),
            "channel_ids": set(["C001", "C002"]),
        }
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id=None,
        )
        
        assert result.authorized is False
        assert "channel_id" in result.unauthorized_entities
    
    @patch('authorization.load_whitelist_config')
    def test_authorize_request_config_load_failure(self, mock_load):
        """Test authorization fails when whitelist configuration cannot be loaded."""
        # Mock configuration load failure
        mock_load.side_effect = LoaderError("Failed to load whitelist configuration")
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        
        assert result.authorized is False
        assert result.error_message is not None
        assert "Failed to load whitelist configuration" in result.error_message
        assert result.unauthorized_entities is None


class TestAuthorizationO1Lookup:
    """Test O(1) lookup performance using sets."""
    
    @patch('authorization.load_whitelist_config')
    def test_large_whitelist_performance(self, mock_load):
        """Test authorization performance with large whitelist (O(1) lookup)."""
        # Create large whitelist (1000 entries each)
        mock_load.return_value = {
            "team_ids": set([f"T{i:06d}" for i in range(1000)]),
            "user_ids": set([f"U{i:06d}" for i in range(1000)]),
            "channel_ids": set([f"C{i:06d}" for i in range(1000)]),
        }
        
        # Test lookup for entry in middle of set
        start_time = time.time()
        result = authorize_request(
            team_id="T000500",  # Fixed: use 6-digit format matching the set generation
            user_id="U000500",
            channel_id="C000500",
        )
        elapsed_time = time.time() - start_time
        
        assert result.authorized is True
        # Sanity check: lookup completes in reasonable time (p95 50ms is production target; test allows 2s for CI/slow env)
        assert elapsed_time < 2.0


class TestEdgeCases:
    """Test edge cases for authorization."""
    
    @patch('authorization.load_whitelist_config')
    def test_empty_whitelist_allows_all_requests(self, mock_load):
        """Test empty whitelist allows all requests (flexible whitelist feature)."""
        # Mock empty whitelist
        mock_load.return_value = {
            "team_ids": set([]),
            "user_ids": set([]),
            "channel_ids": set([]),
        }
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        
        # Should allow authorization (empty whitelist = allow all)
        assert result.authorized is True
        assert result.unauthorized_entities is None
        assert result.error_message is None
    
    @patch('authorization.load_whitelist_config')
    def test_empty_whitelist_allows_multiple_requests(self, mock_load):
        """Test empty whitelist allows multiple different requests."""
        # Mock empty whitelist
        mock_load.return_value = {
            "team_ids": set([]),
            "user_ids": set([]),
            "channel_ids": set([]),
        }
        
        # Test multiple different requests
        result1 = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        assert result1.authorized is True
        
        result2 = authorize_request(
            team_id="T999XXX",
            user_id="U888",
            channel_id="C999",
        )
        assert result2.authorized is True
        
        result3 = authorize_request(
            team_id="T000",
            user_id="U000",
            channel_id="C000",
        )
        assert result3.authorized is True
    
    @patch('authorization.load_whitelist_config')
    def test_config_load_failure_fail_closed(self, mock_load):
        """Test config load failure results in fail-closed (all requests rejected)."""
        # Mock configuration load failure
        mock_load.side_effect = LoaderError("Failed to load whitelist configuration")
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",
        )
        
        # Should fail authorization (fail-closed)
        assert result.authorized is False
        assert result.error_message is not None
        assert "Failed to load whitelist configuration" in result.error_message
        assert result.unauthorized_entities is None  # No entity check performed
    
    @patch('authorization.load_whitelist_config')
    def test_partial_authorization_rejected(self, mock_load):
        """Test partial authorization (some entities authorized, some not) results in rejection."""
        # Mock whitelist with partial authorization
        mock_load.return_value = {
            "team_ids": set(["T123ABC"]),  # Authorized
            "user_ids": set(["U111"]),  # Authorized
            "channel_ids": set(["C999XXX"]),  # NOT authorized (C001 not in whitelist)
        }
        
        result = authorize_request(
            team_id="T123ABC",
            user_id="U111",
            channel_id="C001",  # Not in whitelist
        )
        
        # Should fail authorization (AND condition - all must be authorized)
        assert result.authorized is False
        assert result.unauthorized_entities is not None
        assert "channel_id" in result.unauthorized_entities
        assert "team_id" not in result.unauthorized_entities
        assert "user_id" not in result.unauthorized_entities
    
    @patch('authorization.load_whitelist_config')
    def test_all_entities_missing_rejected(self, mock_load):
        """Test all entities missing (None) results in rejection."""
        mock_load.return_value = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
        }
        
        result = authorize_request(
            team_id=None,
            user_id=None,
            channel_id=None,
        )
        
        # Should fail authorization (all entities missing)
        assert result.authorized is False
        assert result.unauthorized_entities is not None
        assert "team_id" in result.unauthorized_entities
        assert "user_id" in result.unauthorized_entities
        assert "channel_id" in result.unauthorized_entities


class TestFlexibleWhitelist:
    """Test flexible whitelist behavior (partial configuration)."""
    
    @patch('authorization.load_whitelist_config')
    def test_channel_id_only_whitelist_allows_any_team_and_user(self, mock_load):
        """Test channel_id-only whitelist allows any team_id and user_id."""
        # Mock whitelist with only channel_id configured
        mock_load.return_value = {
            "team_ids": set([]),  # Not configured
            "user_ids": set([]),  # Not configured
            "channel_ids": set(["C001", "C002"]),  # Configured
        }
        
        # Test with different team_id and user_id - should all be allowed
        result1 = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C001",
        )
        assert result1.authorized is True
        
        result2 = authorize_request(
            team_id="T999",
            user_id="U888",
            channel_id="C001",
        )
        assert result2.authorized is True
    
    @patch('authorization.load_whitelist_config')
    def test_channel_id_only_whitelist_rejects_unauthorized_channel(self, mock_load):
        """Test channel_id-only whitelist rejects unauthorized channel_id."""
        # Mock whitelist with only channel_id configured
        mock_load.return_value = {
            "team_ids": set([]),  # Not configured
            "user_ids": set([]),  # Not configured
            "channel_ids": set(["C001"]),  # Configured
        }
        
        result = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C002",  # Not in whitelist
        )
        
        assert result.authorized is False
        assert result.unauthorized_entities == ["channel_id"]
    
    @patch('authorization.load_whitelist_config')
    def test_team_id_only_whitelist(self, mock_load):
        """Test team_id-only whitelist allows any user_id and channel_id."""
        # Mock whitelist with only team_id configured
        mock_load.return_value = {
            "team_ids": set(["T123"]),  # Configured
            "user_ids": set([]),  # Not configured
            "channel_ids": set([]),  # Not configured
        }
        
        # Test with different user_id and channel_id - should all be allowed
        result1 = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C001",
        )
        assert result1.authorized is True
        
        result2 = authorize_request(
            team_id="T123",
            user_id="U999",
            channel_id="C999",
        )
        assert result2.authorized is True
        
        # Test with unauthorized team_id - should be rejected
        result3 = authorize_request(
            team_id="T999",  # Not in whitelist
            user_id="U456",
            channel_id="C001",
        )
        assert result3.authorized is False
        assert result3.unauthorized_entities == ["team_id"]
    
    @patch('authorization.load_whitelist_config')
    def test_user_id_only_whitelist(self, mock_load):
        """Test user_id-only whitelist allows any team_id and channel_id."""
        # Mock whitelist with only user_id configured
        mock_load.return_value = {
            "team_ids": set([]),  # Not configured
            "user_ids": set(["U456"]),  # Configured
            "channel_ids": set([]),  # Not configured
        }
        
        # Test with different team_id and channel_id - should all be allowed
        result1 = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C001",
        )
        assert result1.authorized is True
        
        result2 = authorize_request(
            team_id="T999",
            user_id="U456",
            channel_id="C999",
        )
        assert result2.authorized is True
        
        # Test with unauthorized user_id - should be rejected
        result3 = authorize_request(
            team_id="T123",
            user_id="U999",  # Not in whitelist
            channel_id="C001",
        )
        assert result3.authorized is False
        assert result3.unauthorized_entities == ["user_id"]
    
    @patch('authorization.load_whitelist_config')
    def test_team_id_and_channel_id_combination_allows_any_user_id(self, mock_load):
        """Test team_id and channel_id combination allows any user_id."""
        # Mock whitelist with team_id and channel_id configured
        mock_load.return_value = {
            "team_ids": set(["T123"]),  # Configured
            "user_ids": set([]),  # Not configured
            "channel_ids": set(["C001"]),  # Configured
        }
        
        # Test with different user_id - should all be allowed
        result1 = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C001",
        )
        assert result1.authorized is True
        
        result2 = authorize_request(
            team_id="T123",
            user_id="U999",  # Not in whitelist, but user_id is not checked
            channel_id="C001",
        )
        assert result2.authorized is True
        
        # Test with unauthorized team_id - should be rejected
        result3 = authorize_request(
            team_id="T999",  # Not in whitelist
            user_id="U456",
            channel_id="C001",
        )
        assert result3.authorized is False
        assert "team_id" in result3.unauthorized_entities
    
    @patch('authorization.load_whitelist_config')
    def test_team_id_and_user_id_combination_allows_any_channel_id(self, mock_load):
        """Test team_id and user_id combination allows any channel_id."""
        # Mock whitelist with team_id and user_id configured
        mock_load.return_value = {
            "team_ids": set(["T123"]),  # Configured
            "user_ids": set(["U456"]),  # Configured
            "channel_ids": set([]),  # Not configured
        }
        
        # Test with different channel_id - should all be allowed
        result1 = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C001",
        )
        assert result1.authorized is True
        
        result2 = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C999",  # Not in whitelist, but channel_id is not checked
        )
        assert result2.authorized is True
    
    @patch('authorization.load_whitelist_config')
    def test_user_id_and_channel_id_combination_allows_any_team_id(self, mock_load):
        """Test user_id and channel_id combination allows any team_id."""
        # Mock whitelist with user_id and channel_id configured
        mock_load.return_value = {
            "team_ids": set([]),  # Not configured
            "user_ids": set(["U456"]),  # Configured
            "channel_ids": set(["C001"]),  # Configured
        }
        
        # Test with different team_id - should all be allowed
        result1 = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C001",
        )
        assert result1.authorized is True
        
        result2 = authorize_request(
            team_id="T999",  # Not in whitelist, but team_id is not checked
            user_id="U456",
            channel_id="C001",
        )
        assert result2.authorized is True
    
    @patch('authorization.load_whitelist_config')
    def test_rejecting_when_one_configured_entity_unauthorized(self, mock_load):
        """Test rejecting when one configured entity is unauthorized."""
        # Mock whitelist with team_id and channel_id configured
        mock_load.return_value = {
            "team_ids": set(["T123"]),  # Configured
            "user_ids": set([]),  # Not configured
            "channel_ids": set(["C001"]),  # Configured
        }
        
        # Test with unauthorized channel_id - should be rejected
        result = authorize_request(
            team_id="T123",  # Authorized
            user_id="U456",  # Not checked (not configured)
            channel_id="C999",  # Not authorized
        )
        
        assert result.authorized is False
        assert "channel_id" in result.unauthorized_entities
        assert "team_id" not in result.unauthorized_entities
    
    @patch('authorization.load_whitelist_config')
    def test_all_entities_configured_maintains_and_condition(self, mock_load):
        """Test all entities configured maintains AND condition (backward compatibility)."""
        # Mock whitelist with all entities configured
        mock_load.return_value = {
            "team_ids": set(["T123"]),
            "user_ids": set(["U456"]),
            "channel_ids": set(["C001"]),
        }
        
        # Test with all entities authorized - should be allowed
        result1 = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C001",
        )
        assert result1.authorized is True
        
        # Test with one entity unauthorized - should be rejected
        result2 = authorize_request(
            team_id="T123",
            user_id="U456",
            channel_id="C999",  # Not authorized
        )
        assert result2.authorized is False
        assert result2.unauthorized_entities == ["channel_id"]


class TestIntegrationScenarios:
    """Integration tests for end-to-end whitelist scenarios."""
    
    @patch('authorization.load_whitelist_config')
    def test_integration_empty_to_partial_whitelist_transition(self, mock_load):
        """Test integration: transitioning from empty to partial whitelist."""
        # Start with empty whitelist
        mock_load.return_value = {
            "team_ids": set([]),
            "user_ids": set([]),
            "channel_ids": set([]),
        }
        
        result1 = authorize_request("T123", "U456", "C001")
        assert result1.authorized is True  # Empty whitelist allows all
        
        # Transition to partial whitelist (channel_id only)
        mock_load.return_value = {
            "team_ids": set([]),
            "user_ids": set([]),
            "channel_ids": set(["C001"]),
        }
        
        result2 = authorize_request("T123", "U456", "C001")
        assert result2.authorized is True  # channel_id matches
        
        result3 = authorize_request("T123", "U456", "C999")
        assert result3.authorized is False  # channel_id doesn't match
    
    @patch('authorization.load_whitelist_config')
    def test_integration_partial_to_full_whitelist_transition(self, mock_load):
        """Test integration: transitioning from partial to full whitelist."""
        # Start with partial whitelist (channel_id only)
        mock_load.return_value = {
            "team_ids": set([]),
            "user_ids": set([]),
            "channel_ids": set(["C001"]),
        }
        
        result1 = authorize_request("T123", "U456", "C001")
        assert result1.authorized is True  # channel_id matches, others not checked
        
        # Transition to full whitelist
        mock_load.return_value = {
            "team_ids": set(["T123"]),
            "user_ids": set(["U456"]),
            "channel_ids": set(["C001"]),
        }
        
        result2 = authorize_request("T123", "U456", "C001")
        assert result2.authorized is True  # All match
        
        result3 = authorize_request("T999", "U456", "C001")
        assert result3.authorized is False  # team_id doesn't match
    
    @patch('authorization.load_whitelist_config')
    def test_integration_config_load_failure_maintains_fail_closed(self, mock_load):
        """Test integration: configuration load failure maintains fail-closed behavior."""
        # Mock configuration load failure
        mock_load.side_effect = LoaderError("Failed to load whitelist configuration")
        
        result = authorize_request("T123", "U456", "C001")
        
        # Should fail-closed (reject all requests)
        assert result.authorized is False
        assert result.error_message is not None
        assert "Failed to load whitelist configuration" in result.error_message

