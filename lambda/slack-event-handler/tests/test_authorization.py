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
        # Should complete in < 50ms (p95 requirement)
        assert elapsed_time < 0.1  # 100ms threshold for test (actual requirement is 50ms p95)


class TestEdgeCases:
    """Test edge cases for authorization."""
    
    @patch('authorization.load_whitelist_config')
    def test_empty_whitelist_fail_closed(self, mock_load):
        """Test empty whitelist results in fail-closed (all requests rejected)."""
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
        
        # Should fail authorization (fail-closed)
        assert result.authorized is False
        assert result.unauthorized_entities is not None
        assert "team_id" in result.unauthorized_entities
        assert "user_id" in result.unauthorized_entities
        assert "channel_id" in result.unauthorized_entities
    
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

