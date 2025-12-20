"""
Unit tests for whitelist_loader module.

Tests whitelist configuration loading from DynamoDB, Secrets Manager,
and environment variables, including cache TTL and fail-closed error handling.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import os
import json
import time

# Import module to test
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from whitelist_loader import (
    AuthorizationError,
    load_whitelist_config,
    get_whitelist_from_dynamodb,
    get_whitelist_from_secrets_manager,
    get_whitelist_from_env,
    _is_cache_valid,
    _whitelist_cache,
    _cache_ttl,
)


class TestDynamoDBLoading:
    """Test DynamoDB whitelist loading."""
    
    @patch('whitelist_loader._get_dynamodb_client')
    @patch.dict(os.environ, {'WHITELIST_TABLE_NAME': 'test-whitelist-table'})
    def test_get_whitelist_from_dynamodb_success(self, mock_get_client):
        """Test successful DynamoDB loading with all entity types."""
        # Mock DynamoDB client
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock query responses for each entity type
        mock_client.query.side_effect = [
            {
                "Items": [
                    {"entity_id": {"S": "T123ABC"}},
                    {"entity_id": {"S": "T456DEF"}},
                ]
            },
            {
                "Items": [
                    {"entity_id": {"S": "U111"}},
                    {"entity_id": {"S": "U222"}},
                ]
            },
            {
                "Items": [
                    {"entity_id": {"S": "C001"}},
                    {"entity_id": {"S": "C002"}},
                ]
            },
        ]
        
        result = get_whitelist_from_dynamodb()
        
        assert "team_ids" in result
        assert "user_ids" in result
        assert "channel_ids" in result
        assert "T123ABC" in result["team_ids"]
        assert "T456DEF" in result["team_ids"]
        assert "U111" in result["user_ids"]
        assert "U222" in result["user_ids"]
        assert "C001" in result["channel_ids"]
        assert "C002" in result["channel_ids"]
        assert len(result["team_ids"]) == 2
        assert len(result["user_ids"]) == 2
        assert len(result["channel_ids"]) == 2
    
    @patch('whitelist_loader._get_dynamodb_client')
    @patch.dict(os.environ, {'WHITELIST_TABLE_NAME': 'test-whitelist-table'})
    def test_get_whitelist_from_dynamodb_empty(self, mock_get_client):
        """Test DynamoDB loading with empty whitelist (fail-closed)."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock empty responses
        mock_client.query.side_effect = [
            {"Items": []},  # team_id
            {"Items": []},  # user_id
            {"Items": []},  # channel_id
        ]
        
        with pytest.raises(AuthorizationError, match="Whitelist is empty"):
            get_whitelist_from_dynamodb()
    
    @patch('whitelist_loader._get_dynamodb_client')
    @patch.dict(os.environ, {'WHITELIST_TABLE_NAME': 'test-whitelist-table'})
    def test_get_whitelist_from_dynamodb_table_not_found(self, mock_get_client):
        """Test DynamoDB loading when table doesn't exist."""
        from botocore.exceptions import ClientError
        
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock ResourceNotFoundException
        error_response = {
            "Error": {
                "Code": "ResourceNotFoundException",
                "Message": "Table not found",
            }
        }
        mock_client.query.side_effect = ClientError(error_response, "Query")
        
        # Should not raise error for missing table (treated as empty)
        # But will eventually raise AuthorizationError when all entity types are empty
        with pytest.raises(AuthorizationError, match="Whitelist is empty"):
            get_whitelist_from_dynamodb()
    
    @patch('whitelist_loader._get_dynamodb_client')
    def test_get_whitelist_from_dynamodb_missing_env_var(self, mock_get_client):
        """Test DynamoDB loading when environment variable is missing."""
        if "WHITELIST_TABLE_NAME" in os.environ:
            del os.environ["WHITELIST_TABLE_NAME"]
        
        with pytest.raises(AuthorizationError, match="WHITELIST_TABLE_NAME environment variable not set"):
            get_whitelist_from_dynamodb()


class TestSecretsManagerLoading:
    """Test Secrets Manager whitelist loading."""
    
    @patch('whitelist_loader._get_secrets_manager_client')
    @patch.dict(os.environ, {'WHITELIST_SECRET_NAME': 'test-whitelist-secret'})
    def test_get_whitelist_from_secrets_manager_success(self, mock_get_client):
        """Test successful Secrets Manager loading."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock secret value
        secret_data = {
            "team_ids": ["T123ABC", "T456DEF"],
            "user_ids": ["U111", "U222"],
            "channel_ids": ["C001", "C002"],
        }
        mock_client.get_secret_value.return_value = {
            "SecretString": json.dumps(secret_data)
        }
        
        result = get_whitelist_from_secrets_manager()
        
        assert "team_ids" in result
        assert "user_ids" in result
        assert "channel_ids" in result
        assert "T123ABC" in result["team_ids"]
        assert "T456DEF" in result["team_ids"]
        assert "U111" in result["user_ids"]
        assert "U222" in result["user_ids"]
        assert "C001" in result["channel_ids"]
        assert "C002" in result["channel_ids"]
    
    @patch('whitelist_loader._get_secrets_manager_client')
    @patch.dict(os.environ, {'WHITELIST_SECRET_NAME': 'test-whitelist-secret'})
    def test_get_whitelist_from_secrets_manager_empty(self, mock_get_client):
        """Test Secrets Manager loading with empty whitelist (fail-closed)."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock empty secret
        mock_client.get_secret_value.return_value = {
            "SecretString": json.dumps({
                "team_ids": [],
                "user_ids": [],
                "channel_ids": [],
            })
        }
        
        with pytest.raises(AuthorizationError, match="Whitelist is empty"):
            get_whitelist_from_secrets_manager()
    
    @patch('whitelist_loader._get_secrets_manager_client')
    @patch.dict(os.environ, {'WHITELIST_SECRET_NAME': 'test-whitelist-secret'})
    def test_get_whitelist_from_secrets_manager_invalid_json(self, mock_get_client):
        """Test Secrets Manager loading with invalid JSON."""
        from botocore.exceptions import ClientError
        
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock invalid JSON
        mock_client.get_secret_value.return_value = {
            "SecretString": "invalid json {"
        }
        
        with pytest.raises(AuthorizationError, match="Invalid JSON format"):
            get_whitelist_from_secrets_manager()
    
    @patch('whitelist_loader._get_secrets_manager_client')
    def test_get_whitelist_from_secrets_manager_missing_env_var(self, mock_get_client):
        """Test Secrets Manager loading when environment variable is missing."""
        if "WHITELIST_SECRET_NAME" in os.environ:
            del os.environ["WHITELIST_SECRET_NAME"]
        
        with pytest.raises(AuthorizationError, match="WHITELIST_SECRET_NAME environment variable not set"):
            get_whitelist_from_secrets_manager()


class TestEnvironmentVariableLoading:
    """Test environment variable whitelist loading."""
    
    @patch.dict(os.environ, {
        'WHITELIST_TEAM_IDS': 'T123ABC,T456DEF',
        'WHITELIST_USER_IDS': 'U111,U222',
        'WHITELIST_CHANNEL_IDS': 'C001,C002',
    })
    def test_get_whitelist_from_env_success(self):
        """Test successful environment variable loading."""
        result = get_whitelist_from_env()
        
        assert "team_ids" in result
        assert "user_ids" in result
        assert "channel_ids" in result
        assert "T123ABC" in result["team_ids"]
        assert "T456DEF" in result["team_ids"]
        assert "U111" in result["user_ids"]
        assert "U222" in result["user_ids"]
        assert "C001" in result["channel_ids"]
        assert "C002" in result["channel_ids"]
    
    @patch.dict(os.environ, {
        'WHITELIST_TEAM_IDS': '',
        'WHITELIST_USER_IDS': '',
        'WHITELIST_CHANNEL_IDS': '',
    }, clear=False)
    def test_get_whitelist_from_env_empty(self):
        """Test environment variable loading with empty values (fail-closed)."""
        with pytest.raises(AuthorizationError, match="Whitelist is empty"):
            get_whitelist_from_env()
    
    @patch.dict(os.environ, {}, clear=True)
    def test_get_whitelist_from_env_missing(self):
        """Test environment variable loading when variables are missing (fail-closed)."""
        with pytest.raises(AuthorizationError, match="Whitelist is empty"):
            get_whitelist_from_env()


class TestCacheOperations:
    """Test cache TTL and invalidation logic."""
    
    def test_cache_valid_within_ttl(self):
        """Test cache is valid when within TTL."""
        import whitelist_loader
        
        # Set cache with recent timestamp
        whitelist_loader._whitelist_cache = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
            "cached_at": int(time.time()),
            "ttl": whitelist_loader._cache_ttl,
        }
        
        assert whitelist_loader._is_cache_valid() is True
    
    def test_cache_invalid_expired(self):
        """Test cache is invalid when TTL expired."""
        import whitelist_loader
        
        # Set cache with old timestamp (beyond TTL)
        whitelist_loader._whitelist_cache = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
            "cached_at": int(time.time()) - whitelist_loader._cache_ttl - 1,  # Expired
            "ttl": whitelist_loader._cache_ttl,
        }
        
        assert whitelist_loader._is_cache_valid() is False
    
    def test_cache_invalid_none(self):
        """Test cache is invalid when None."""
        import whitelist_loader
        whitelist_loader._whitelist_cache = None
        
        assert whitelist_loader._is_cache_valid() is False


class TestFailClosedErrorHandling:
    """Test fail-closed error handling."""
    
    @patch('whitelist_loader.get_whitelist_from_dynamodb')
    @patch('whitelist_loader.get_whitelist_from_secrets_manager')
    @patch('whitelist_loader.get_whitelist_from_env')
    def test_load_whitelist_all_sources_fail(self, mock_env, mock_secrets, mock_dynamodb):
        """Test fail-closed when all sources fail."""
        # Mock all sources to fail
        mock_dynamodb.side_effect = AuthorizationError("DynamoDB failed")
        mock_secrets.side_effect = AuthorizationError("Secrets Manager failed")
        mock_env.side_effect = AuthorizationError("Environment variables failed")
        
        with pytest.raises(AuthorizationError, match="Failed to load whitelist from all sources"):
            load_whitelist_config()
    
    @patch('whitelist_loader.get_whitelist_from_dynamodb')
    @patch('whitelist_loader.get_whitelist_from_secrets_manager')
    @patch('whitelist_loader.get_whitelist_from_env')
    def test_load_whitelist_fallback_to_secrets_manager(self, mock_env, mock_secrets, mock_dynamodb):
        """Test fallback from DynamoDB to Secrets Manager."""
        # DynamoDB fails, Secrets Manager succeeds
        mock_dynamodb.side_effect = AuthorizationError("DynamoDB failed")
        mock_secrets.return_value = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
        }
        
        result = load_whitelist_config()
        
        assert "team_ids" in result
        assert "T123ABC" in result["team_ids"]
        mock_dynamodb.assert_called_once()
        mock_secrets.assert_called_once()
        mock_env.assert_not_called()  # Should not be called if Secrets Manager succeeds
    
    @patch('whitelist_loader.get_whitelist_from_dynamodb')
    @patch('whitelist_loader.get_whitelist_from_secrets_manager')
    @patch('whitelist_loader.get_whitelist_from_env')
    def test_load_whitelist_fallback_to_env(self, mock_env, mock_secrets, mock_dynamodb):
        """Test fallback from DynamoDB and Secrets Manager to environment variables."""
        import whitelist_loader
        
        # Clear cache first
        whitelist_loader._whitelist_cache = None
        
        # DynamoDB and Secrets Manager fail, environment variables succeed
        mock_dynamodb.side_effect = AuthorizationError("DynamoDB failed")
        mock_secrets.side_effect = AuthorizationError("Secrets Manager failed")
        mock_env.return_value = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
        }
        
        result = load_whitelist_config()
        
        assert "team_ids" in result
        assert "T123ABC" in result["team_ids"]
        mock_dynamodb.assert_called_once()
        mock_secrets.assert_called_once()
        mock_env.assert_called_once()
    
    @patch('whitelist_loader.get_whitelist_from_dynamodb')
    def test_load_whitelist_cache_hit(self, mock_dynamodb):
        """Test cache hit - should not call DynamoDB."""
        import whitelist_loader
        
        # Set valid cache
        whitelist_loader._whitelist_cache = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
            "cached_at": int(time.time()),
            "ttl": whitelist_loader._cache_ttl,
        }
        
        result = load_whitelist_config()
        
        assert "team_ids" in result
        assert "T123ABC" in result["team_ids"]
        mock_dynamodb.assert_not_called()  # Should use cache
    
    @patch('whitelist_loader.get_whitelist_from_dynamodb')
    def test_load_whitelist_cache_miss_reloads(self, mock_dynamodb):
        """Test cache miss - should reload from source."""
        import whitelist_loader
        
        # Clear cache first
        whitelist_loader._whitelist_cache = None
        
        # Mock DynamoDB to return whitelist
        mock_dynamodb.return_value = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
        }
        
        result = load_whitelist_config()
        
        assert "team_ids" in result
        assert "T123ABC" in result["team_ids"]
        mock_dynamodb.assert_called_once()  # Should call DynamoDB
        
        # Verify cache was set
        assert whitelist_loader._whitelist_cache is not None
        assert "T123ABC" in whitelist_loader._whitelist_cache["team_ids"]


class TestWhitelistManagement:
    """Test whitelist management and update reflection."""
    
    @patch('whitelist_loader.get_whitelist_from_dynamodb')
    def test_dynamodb_update_reflected_after_cache_expiry(self, mock_dynamodb):
        """Test DynamoDB whitelist update is reflected after cache TTL expires."""
        import whitelist_loader
        
        # Clear cache
        whitelist_loader._whitelist_cache = None
        
        # Initial whitelist
        mock_dynamodb.return_value = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
        }
        
        # First load - should cache
        result1 = load_whitelist_config()
        assert "T123ABC" in result1["team_ids"]
        assert mock_dynamodb.call_count == 1
        
        # Update DynamoDB whitelist (add new team_id)
        mock_dynamodb.return_value = {
            "team_ids": set(["T123ABC", "T456DEF"]),  # New team_id added
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
        }
        
        # Expire cache by setting old timestamp
        whitelist_loader._whitelist_cache = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
            "cached_at": int(time.time()) - whitelist_loader._cache_ttl - 1,  # Expired
            "ttl": whitelist_loader._cache_ttl,
        }
        
        # Second load - should reload from DynamoDB and get updated whitelist
        result2 = load_whitelist_config()
        assert "T123ABC" in result2["team_ids"]
        assert "T456DEF" in result2["team_ids"]  # New team_id should be present
        assert mock_dynamodb.call_count == 2  # Should call DynamoDB again
    
    @patch('whitelist_loader.get_whitelist_from_dynamodb')
    def test_dynamodb_update_not_reflected_within_cache_ttl(self, mock_dynamodb):
        """Test DynamoDB whitelist update is NOT reflected within cache TTL (5 minutes)."""
        import whitelist_loader
        
        # Clear cache
        whitelist_loader._whitelist_cache = None
        
        # Initial whitelist
        mock_dynamodb.return_value = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
        }
        
        # First load - should cache
        result1 = load_whitelist_config()
        assert "T123ABC" in result1["team_ids"]
        assert mock_dynamodb.call_count == 1
        
        # Update DynamoDB whitelist (remove team_id)
        mock_dynamodb.return_value = {
            "team_ids": set([]),  # T123ABC removed
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
        }
        
        # Cache still valid (within TTL)
        # Second load - should use cache (not call DynamoDB)
        result2 = load_whitelist_config()
        assert "T123ABC" in result2["team_ids"]  # Still in cache
        assert mock_dynamodb.call_count == 1  # Should NOT call DynamoDB again
    
    @patch('whitelist_loader.get_whitelist_from_secrets_manager')
    @patch('whitelist_loader.get_whitelist_from_dynamodb')
    def test_secrets_manager_update_reflected_after_cache_expiry(self, mock_dynamodb, mock_secrets):
        """Test Secrets Manager whitelist update is reflected after cache TTL expires."""
        import whitelist_loader
        
        # Clear cache
        whitelist_loader._whitelist_cache = None
        
        # DynamoDB fails, use Secrets Manager
        mock_dynamodb.side_effect = AuthorizationError("DynamoDB failed")
        
        # Initial whitelist from Secrets Manager
        mock_secrets.return_value = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
        }
        
        # First load - should cache
        result1 = load_whitelist_config()
        assert "T123ABC" in result1["team_ids"]
        assert mock_secrets.call_count == 1
        
        # Update Secrets Manager whitelist (add new user_id)
        mock_secrets.return_value = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111", "U222"]),  # New user_id added
            "channel_ids": set(["C001"]),
        }
        
        # Expire cache
        whitelist_loader._whitelist_cache = {
            "team_ids": set(["T123ABC"]),
            "user_ids": set(["U111"]),
            "channel_ids": set(["C001"]),
            "cached_at": int(time.time()) - whitelist_loader._cache_ttl - 1,  # Expired
            "ttl": whitelist_loader._cache_ttl,
        }
        
        # Second load - should reload from Secrets Manager and get updated whitelist
        result2 = load_whitelist_config()
        assert "U111" in result2["user_ids"]
        assert "U222" in result2["user_ids"]  # New user_id should be present
        assert mock_secrets.call_count == 2  # Should call Secrets Manager again
    
    @patch('whitelist_loader.get_whitelist_from_env')
    @patch('whitelist_loader.get_whitelist_from_secrets_manager')
    @patch('whitelist_loader.get_whitelist_from_dynamodb')
    def test_env_update_requires_redeploy(self, mock_dynamodb, mock_secrets, mock_env):
        """Test environment variable whitelist update requires redeploy (cache persists)."""
        import whitelist_loader
        
        # Clear cache
        whitelist_loader._whitelist_cache = None
        
        # DynamoDB and Secrets Manager fail, use environment variables
        mock_dynamodb.side_effect = AuthorizationError("DynamoDB failed")
        mock_secrets.side_effect = AuthorizationError("Secrets Manager failed")
        
        # Initial whitelist from environment variables
        with patch.dict(os.environ, {
            'WHITELIST_TEAM_IDS': 'T123ABC',
            'WHITELIST_USER_IDS': 'U111',
            'WHITELIST_CHANNEL_IDS': 'C001',
        }, clear=False):
            mock_env.return_value = {
                "team_ids": set(["T123ABC"]),
                "user_ids": set(["U111"]),
                "channel_ids": set(["C001"]),
            }
            
            # First load - should cache
            result1 = load_whitelist_config()
            assert "T123ABC" in result1["team_ids"]
            assert mock_env.call_count == 1
            
            # Update environment variables (simulated - would require redeploy in real scenario)
            # Note: In real scenario, environment variable changes require Lambda redeploy
            # This test verifies that cache persists until TTL expires
            # Cache still valid (within TTL)
            result2 = load_whitelist_config()
            assert "T123ABC" in result2["team_ids"]  # Still in cache
            assert mock_env.call_count == 1  # Should NOT call get_whitelist_from_env again

