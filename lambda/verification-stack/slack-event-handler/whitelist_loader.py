"""
Whitelist configuration loader module.

This module loads whitelist configuration from multiple sources with priority:
1. DynamoDB (preferred) - dynamic updates, immediate reflection
2. AWS Secrets Manager (secondary) - secure, encrypted, rotation support
3. Environment variables (fallback) - simple, requires redeploy

Configuration is cached in memory for 5 minutes to minimize latency.
The system follows fail-closed principle: all requests are rejected when
configuration cannot be loaded or whitelist is empty.
"""

import os
import json
import time
import boto3
from typing import Dict, Set, Optional, Any
from botocore.exceptions import ClientError
from logger import log_info, log_warn, log_error

# CloudWatch client for metrics
_cloudwatch_client = None


def _get_cloudwatch_client():
    """Get CloudWatch client (singleton pattern)."""
    global _cloudwatch_client
    if _cloudwatch_client is None:
        _cloudwatch_client = boto3.client("cloudwatch", region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"))
    return _cloudwatch_client


def _emit_metric(metric_name: str, value: float, unit: str = "Count") -> None:
    """
    Emit CloudWatch custom metric.
    
    Args:
        metric_name: Metric name (e.g., "WhitelistConfigLoadErrors")
        value: Metric value
        unit: Metric unit (default: "Count")
    """
    try:
        client = _get_cloudwatch_client()
        client.put_metric_data(
            Namespace="SlackEventHandler",
            MetricData=[
                {
                    "MetricName": metric_name,
                    "Value": value,
                    "Unit": unit,
                }
            ],
        )
    except Exception as e:
        # Log but don't fail on metric emission errors
        log_warn("cloudwatch_metric_emission_failed", {
            "metric_name": metric_name,
            "error": str(e),
        })

# In-memory cache for whitelist configuration
_whitelist_cache: Optional[Dict[str, Any]] = None
_cache_ttl: int = 300  # 5 minutes in seconds


class AuthorizationError(Exception):
    """Raised when whitelist configuration cannot be loaded or is invalid."""
    pass


def _get_dynamodb_client():
    """Get DynamoDB client (singleton pattern)."""
    return boto3.client("dynamodb", region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"))


def _get_secrets_manager_client():
    """Get Secrets Manager client (singleton pattern)."""
    return boto3.client("secretsmanager", region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"))


def _is_cache_valid() -> bool:
    """
    Check if cache is still valid (within TTL).
    
    Returns:
        True if cache exists and is within TTL, False otherwise
    """
    global _whitelist_cache
    if _whitelist_cache is None:
        return False
    
    cached_at = _whitelist_cache.get("cached_at", 0)
    current_time = int(time.time())
    return (current_time - cached_at) < _cache_ttl


def get_whitelist_from_dynamodb() -> Dict[str, Set[str]]:
    """
    Load whitelist configuration from DynamoDB table.
    
    Queries DynamoDB table for all entity types (team_id, user_id, channel_id)
    and returns a dictionary with sets of allowed IDs.
    
    Returns:
        Dictionary with keys: "team_ids", "user_ids", "channel_ids"
        Each value is a set of allowed entity IDs
        
    Raises:
        AuthorizationError: If DynamoDB access fails or table is empty
    """
    table_name = os.environ.get("WHITELIST_TABLE_NAME")
    if not table_name:
        raise AuthorizationError("WHITELIST_TABLE_NAME environment variable not set")
    
    try:
        dynamodb = _get_dynamodb_client()
        whitelist: Dict[str, Set[str]] = {
            "team_ids": set(),
            "user_ids": set(),
            "channel_ids": set(),
        }
        
        # Query each entity type
        for entity_type in ["team_id", "user_id", "channel_id"]:
            try:
                response = dynamodb.query(
                    TableName=table_name,
                    KeyConditionExpression="entity_type = :entity_type",
                    ExpressionAttributeValues={
                        ":entity_type": {"S": entity_type}
                    }
                )
                
                # Extract entity IDs from response
                for item in response.get("Items", []):
                    entity_id = item.get("entity_id", {}).get("S")
                    if entity_id:
                        # Map entity_type to dictionary key
                        if entity_type == "team_id":
                            whitelist["team_ids"].add(entity_id)
                        elif entity_type == "user_id":
                            whitelist["user_ids"].add(entity_id)
                        elif entity_type == "channel_id":
                            whitelist["channel_ids"].add(entity_id)
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                if error_code == "ResourceNotFoundException":
                    # Table doesn't exist - treat as empty whitelist
                    log_warn("whitelist_dynamodb_table_not_found", {
                        "table_name": table_name,
                        "entity_type": entity_type,
                    })
                else:
                    raise
        
        log_info("whitelist_loaded_from_dynamodb", {
            "table_name": table_name,
            "team_ids_count": len(whitelist["team_ids"]),
            "user_ids_count": len(whitelist["user_ids"]),
            "channel_ids_count": len(whitelist["channel_ids"]),
        })
        
        return whitelist
        
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        error_message = e.response.get("Error", {}).get("Message", str(e))
        log_error("whitelist_dynamodb_error", {
            "table_name": table_name,
            "error_code": error_code,
            "error_message": error_message,
        })
        raise AuthorizationError(f"Failed to load whitelist from DynamoDB: {error_message}")
    except Exception as e:
        log_error("whitelist_dynamodb_unexpected_error", {
            "table_name": table_name,
        }, e)
        raise AuthorizationError(f"Unexpected error loading whitelist from DynamoDB: {str(e)}")


def get_whitelist_from_secrets_manager() -> Dict[str, Set[str]]:
    """
    Load whitelist configuration from AWS Secrets Manager.
    
    Reads JSON secret with format:
    {
        "team_ids": ["T123ABC", "T456DEF"],
        "user_ids": ["U111", "U222"],
        "channel_ids": ["C001", "C002"]
    }
    
    Returns:
        Dictionary with keys: "team_ids", "user_ids", "channel_ids"
        Each value is a set of allowed entity IDs
        
    Raises:
        AuthorizationError: If Secrets Manager access fails or secret is invalid
    """
    secret_name = os.environ.get("WHITELIST_SECRET_NAME")
    if not secret_name:
        raise AuthorizationError("WHITELIST_SECRET_NAME environment variable not set")
    
    try:
        secrets_client = _get_secrets_manager_client()
        response = secrets_client.get_secret_value(SecretId=secret_name)
        secret_string = response.get("SecretString", "{}")
        
        # Parse JSON
        try:
            secret_data = json.loads(secret_string)
        except json.JSONDecodeError as e:
            raise AuthorizationError(f"Invalid JSON format in whitelist secret: {str(e)}")
        
        # Convert lists to sets
        whitelist: Dict[str, Set[str]] = {
            "team_ids": set(secret_data.get("team_ids", [])),
            "user_ids": set(secret_data.get("user_ids", [])),
            "channel_ids": set(secret_data.get("channel_ids", [])),
        }
        
        log_info("whitelist_loaded_from_secrets_manager", {
            "secret_name": secret_name,
            "team_ids_count": len(whitelist["team_ids"]),
            "user_ids_count": len(whitelist["user_ids"]),
            "channel_ids_count": len(whitelist["channel_ids"]),
        })
        
        return whitelist
        
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        error_message = e.response.get("Error", {}).get("Message", str(e))
        
        if error_code == "ResourceNotFoundException":
            # Secret doesn't exist - try next source
            log_warn("whitelist_secret_not_found", {
                "secret_name": secret_name,
            })
            raise AuthorizationError(f"Whitelist secret not found: {secret_name}")
        else:
            log_error("whitelist_secrets_manager_error", {
                "secret_name": secret_name,
                "error_code": error_code,
                "error_message": error_message,
            })
            raise AuthorizationError(f"Failed to load whitelist from Secrets Manager: {error_message}")
    except Exception as e:
        log_error("whitelist_secrets_manager_unexpected_error", {
            "secret_name": secret_name,
        }, e)
        raise AuthorizationError(f"Unexpected error loading whitelist from Secrets Manager: {str(e)}")


def get_whitelist_from_env() -> Dict[str, Set[str]]:
    """
    Load whitelist configuration from environment variables.
    
    Reads comma-separated values from:
    - WHITELIST_TEAM_IDS
    - WHITELIST_USER_IDS
    - WHITELIST_CHANNEL_IDS
    
    Returns:
        Dictionary with keys: "team_ids", "user_ids", "channel_ids"
        Each value is a set of allowed entity IDs
        
    Raises:
        AuthorizationError: If environment variables are not set or whitelist is empty
    """
    team_ids_str = os.environ.get("WHITELIST_TEAM_IDS", "")
    user_ids_str = os.environ.get("WHITELIST_USER_IDS", "")
    channel_ids_str = os.environ.get("WHITELIST_CHANNEL_IDS", "")
    
    # Parse comma-separated values
    whitelist: Dict[str, Set[str]] = {
        "team_ids": set([id.strip() for id in team_ids_str.split(",") if id.strip()]),
        "user_ids": set([id.strip() for id in user_ids_str.split(",") if id.strip()]),
        "channel_ids": set([id.strip() for id in channel_ids_str.split(",") if id.strip()]),
    }
    
    log_info("whitelist_loaded_from_env", {
        "team_ids_count": len(whitelist["team_ids"]),
        "user_ids_count": len(whitelist["user_ids"]),
        "channel_ids_count": len(whitelist["channel_ids"]),
    })
    
    return whitelist


def load_whitelist_config() -> Dict[str, Set[str]]:
    """
    Load whitelist configuration with priority order and caching.
    
    Priority order:
    1. DynamoDB (preferred)
    2. AWS Secrets Manager (secondary)
    3. Environment variables (fallback)
    
    Configuration is cached in memory for 5 minutes (300 seconds).
    Cache is invalidated after TTL expires.
    
    Returns:
        Dictionary with keys: "team_ids", "user_ids", "channel_ids"
        Each value is a set of allowed entity IDs
        
    Raises:
        AuthorizationError: If all sources fail or whitelist is empty
    """
    global _whitelist_cache
    
    # Check cache first
    if _is_cache_valid():
        log_info("whitelist_cache_hit", {
            "cached_at": _whitelist_cache.get("cached_at"),
        })
        return {
            "team_ids": _whitelist_cache["team_ids"],
            "user_ids": _whitelist_cache["user_ids"],
            "channel_ids": _whitelist_cache["channel_ids"],
        }
    
    # Cache miss or expired - load from source
    log_info("whitelist_cache_miss", {})
    
    whitelist: Optional[Dict[str, Set[str]]] = None
    last_error: Optional[str] = None
    
    # Try DynamoDB first (priority 1)
    try:
        whitelist = get_whitelist_from_dynamodb()
        log_info("whitelist_source_dynamodb", {})
    except AuthorizationError as e:
        last_error = str(e)
        log_warn("whitelist_dynamodb_failed", {
            "error": str(e),
        })
    
    # Try Secrets Manager if DynamoDB failed (priority 2)
    if whitelist is None:
        try:
            whitelist = get_whitelist_from_secrets_manager()
            log_info("whitelist_source_secrets_manager", {})
        except AuthorizationError as e:
            last_error = str(e)
            log_warn("whitelist_secrets_manager_failed", {
                "error": str(e),
            })
    
    # Try environment variables if both failed (priority 3)
    if whitelist is None:
        try:
            whitelist = get_whitelist_from_env()
            log_info("whitelist_source_env", {})
        except AuthorizationError as e:
            last_error = str(e)
            log_error("whitelist_env_failed", {
                "error": str(e),
            })
    
    # If all sources failed, raise error (fail-closed)
    if whitelist is None:
        error_message = f"Failed to load whitelist from all sources. Last error: {last_error}"
        log_error("whitelist_all_sources_failed", {
            "last_error": last_error,
        })
        # Emit metric for config load error
        _emit_metric("WhitelistConfigLoadErrors", 1.0)
        raise AuthorizationError(error_message)
    
    # Cache the whitelist
    _whitelist_cache = {
        "team_ids": whitelist["team_ids"],
        "user_ids": whitelist["user_ids"],
        "channel_ids": whitelist["channel_ids"],
        "cached_at": int(time.time()),
        "ttl": _cache_ttl,
    }
    
    log_info("whitelist_loaded_and_cached", {
        "team_ids_count": len(whitelist["team_ids"]),
        "user_ids_count": len(whitelist["user_ids"]),
        "channel_ids_count": len(whitelist["channel_ids"]),
        "cached_at": _whitelist_cache["cached_at"],
    })
    
    return whitelist

