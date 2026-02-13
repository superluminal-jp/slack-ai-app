"""
Whitelist authorization module for Verification Agent.

This module implements flexible whitelist-based authorization for Slack requests.
It checks if team_id, user_id, and channel_id are present in the whitelist
before allowing requests to proceed. This implements layer 3c in the multi-layer
defense architecture (after signature verification 3a and Existence Check 3b).

The authorization follows a conditional AND condition:
- Only configured entities (non-empty whitelist sets) are checked
- If all entities are unset (empty whitelist), all requests are allowed
- If an entity is configured, it must be authorized
- If any configured entity is missing or unauthorized, the request is rejected with 403 Forbidden

This version includes an inline whitelist loader (reads from DynamoDB, Secrets
Manager, or environment variables) so it is self-contained without importing
from the Lambda-specific whitelist_loader module.
"""

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

import boto3
from botocore.exceptions import ClientError

from logger_util import get_logger, log

_logger = get_logger()


def _log(
    level: str,
    event_type: str,
    data: Optional[dict] = None,
    exc: Optional[Exception] = None,
) -> None:
    d = dict(data) if data else {}
    if exc:
        d["exception"] = str(exc)
    log(_logger, level, event_type, d, service="verification-agent")


def log_info(event_type: str, data: Optional[dict] = None) -> None:
    _log("INFO", event_type, data)


def log_warn(event_type: str, data: Optional[dict] = None, exc: Optional[Exception] = None) -> None:
    _log("WARN", event_type, data, exc)


def log_error(
    event_type: str,
    data: Optional[dict] = None,
    exc: Optional[Exception] = None,
    include_stack_trace: bool = True,
) -> None:
    _log("ERROR", event_type, data, exc)


# ---------------------------------------------------------------------------
# CloudWatch metrics
# ---------------------------------------------------------------------------
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
        metric_name: Metric name (e.g., "WhitelistAuthorizationSuccess")
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
        log_error("cloudwatch_metric_emission_failed", {
            "metric_name": metric_name,
            "error": str(e),
        }, include_stack_trace=False)


# ---------------------------------------------------------------------------
# Inline Whitelist Loader (replaces whitelist_loader module)
# ---------------------------------------------------------------------------

# In-memory cache for whitelist configuration
_whitelist_cache: Optional[Dict[str, Any]] = None
_cache_ttl: int = 300  # 5 minutes in seconds


class WhitelistLoaderError(Exception):
    """Raised when whitelist configuration cannot be loaded or is invalid."""
    pass


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


def _get_whitelist_from_dynamodb() -> Dict[str, Set[str]]:
    """
    Load whitelist configuration from DynamoDB table.

    Queries DynamoDB table for all entity types (team_id, user_id, channel_id)
    and returns a dictionary with sets of allowed IDs.

    Returns:
        Dictionary with keys: "team_ids", "user_ids", "channel_ids"
        Each value is a set of allowed entity IDs

    Raises:
        WhitelistLoaderError: If DynamoDB access fails or table is empty
    """
    table_name = os.environ.get("WHITELIST_TABLE_NAME")
    if not table_name:
        raise WhitelistLoaderError("WHITELIST_TABLE_NAME environment variable not set")

    try:
        dynamodb = boto3.client("dynamodb", region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"))
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
        raise WhitelistLoaderError(f"Failed to load whitelist from DynamoDB: {error_message}")
    except Exception as e:
        log_error("whitelist_dynamodb_unexpected_error", {
            "table_name": table_name,
        }, e)
        raise WhitelistLoaderError(f"Unexpected error loading whitelist from DynamoDB: {str(e)}")


def _get_whitelist_from_secrets_manager() -> Dict[str, Set[str]]:
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
        WhitelistLoaderError: If Secrets Manager access fails or secret is invalid
    """
    secret_name = os.environ.get("WHITELIST_SECRET_NAME")
    if not secret_name:
        raise WhitelistLoaderError("WHITELIST_SECRET_NAME environment variable not set")

    try:
        secrets_client = boto3.client("secretsmanager", region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"))
        response = secrets_client.get_secret_value(SecretId=secret_name)
        secret_string = response.get("SecretString", "{}")

        # Parse JSON
        try:
            secret_data = json.loads(secret_string)
        except json.JSONDecodeError as e:
            raise WhitelistLoaderError(f"Invalid JSON format in whitelist secret: {str(e)}")

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
            raise WhitelistLoaderError(f"Whitelist secret not found: {secret_name}")
        else:
            log_error("whitelist_secrets_manager_error", {
                "secret_name": secret_name,
                "error_code": error_code,
                "error_message": error_message,
            })
            raise WhitelistLoaderError(f"Failed to load whitelist from Secrets Manager: {error_message}")
    except Exception as e:
        log_error("whitelist_secrets_manager_unexpected_error", {
            "secret_name": secret_name,
        }, e)
        raise WhitelistLoaderError(f"Unexpected error loading whitelist from Secrets Manager: {str(e)}")


def _get_whitelist_from_env() -> Dict[str, Set[str]]:
    """
    Load whitelist configuration from environment variables.

    Reads comma-separated values from:
    - WHITELIST_TEAM_IDS
    - WHITELIST_USER_IDS
    - WHITELIST_CHANNEL_IDS

    Returns:
        Dictionary with keys: "team_ids", "user_ids", "channel_ids"
        Each value is a set of allowed entity IDs
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
        WhitelistLoaderError: If all sources fail
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
        whitelist = _get_whitelist_from_dynamodb()
        log_info("whitelist_source_dynamodb", {})
    except WhitelistLoaderError as e:
        last_error = str(e)
        log_warn("whitelist_dynamodb_failed", {
            "error": str(e),
        })

    # Try Secrets Manager if DynamoDB failed (priority 2)
    if whitelist is None:
        try:
            whitelist = _get_whitelist_from_secrets_manager()
            log_info("whitelist_source_secrets_manager", {})
        except WhitelistLoaderError as e:
            last_error = str(e)
            log_warn("whitelist_secrets_manager_failed", {
                "error": str(e),
            })

    # Try environment variables if both failed (priority 3)
    if whitelist is None:
        try:
            whitelist = _get_whitelist_from_env()
            log_info("whitelist_source_env", {})
        except WhitelistLoaderError as e:
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
        _emit_metric("WhitelistConfigLoadErrors", 1.0)
        raise WhitelistLoaderError(error_message)

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


# ---------------------------------------------------------------------------
# Authorization logic
# ---------------------------------------------------------------------------

class AuthorizationError(Exception):
    """Raised when authorization fails."""
    pass


@dataclass
class AuthorizationResult:
    """
    Result of authorization check.

    Attributes:
        authorized: True if request is authorized, False otherwise
        team_id: Team ID that was checked
        user_id: User ID that was checked
        channel_id: Channel ID that was checked
        unauthorized_entities: List of entity types that were not authorized
            (only present if authorized is False)
        error_message: Error message if configuration load failed
        timestamp: Unix timestamp when authorization check was performed
    """
    authorized: bool
    team_id: Optional[str] = None
    user_id: Optional[str] = None
    channel_id: Optional[str] = None
    unauthorized_entities: Optional[List[str]] = None
    error_message: Optional[str] = None
    timestamp: int = 0

    def __post_init__(self):
        """Set timestamp if not provided."""
        if self.timestamp == 0:
            self.timestamp = int(time.time())


def authorize_request(
    team_id: Optional[str],
    user_id: Optional[str],
    channel_id: Optional[str],
) -> AuthorizationResult:
    """
    Authorize request using flexible whitelist.

    Checks if team_id, user_id, and channel_id are present in the whitelist.
    Only configured entities (non-empty whitelist sets) are checked.
    If all entities are unset (empty whitelist), all requests are allowed.
    If an entity is configured, it must be authorized (conditional AND condition).
    If any configured entity is missing or unauthorized, the request is rejected.

    Args:
        team_id: Slack team ID (optional)
        user_id: Slack user ID (optional)
        channel_id: Slack channel ID (optional)

    Returns:
        AuthorizationResult with authorization status and details

    Raises:
        AuthorizationError: If whitelist configuration cannot be loaded
    """
    timestamp = int(time.time())
    start_time = time.time()

    # Load whitelist configuration (with caching)
    try:
        whitelist = load_whitelist_config()
    except WhitelistLoaderError as e:
        # Configuration load failed - fail-closed
        error_message = f"Failed to load whitelist configuration: {str(e)}"
        log_error("whitelist_config_load_failed", {
            "error": error_message,
        })
        # Emit metric for authorization failure
        _emit_metric("WhitelistAuthorizationFailed", 1.0)
        elapsed_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        _emit_metric("WhitelistAuthorizationLatency", elapsed_time, "Milliseconds")
        return AuthorizationResult(
            authorized=False,
            team_id=team_id,
            user_id=user_id,
            channel_id=channel_id,
            error_message=error_message,
            timestamp=timestamp,
        )

    # Check if whitelist is completely empty (all entities unset) - allow all requests
    total_entries = len(whitelist["team_ids"]) + len(whitelist["user_ids"]) + len(whitelist["channel_ids"])
    if total_entries == 0:
        # Empty whitelist means allow all requests
        log_info("whitelist_authorization_success_empty_whitelist", {
            "team_id": team_id,
            "user_id": user_id,
            "channel_id": channel_id,
        })
        _emit_metric("WhitelistAuthorizationSuccess", 1.0)
        elapsed_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        _emit_metric("WhitelistAuthorizationLatency", elapsed_time, "Milliseconds")
        return AuthorizationResult(
            authorized=True,
            team_id=team_id,
            user_id=user_id,
            channel_id=channel_id,
            timestamp=timestamp,
        )

    # Check each entity against whitelist (conditional AND condition - only check configured entities)
    unauthorized_entities: List[str] = []

    # Track which entities were checked vs skipped for logging
    checked_entities: List[str] = []
    skipped_entities: List[str] = []

    # Check team_id (only if whitelist has team_ids configured)
    if len(whitelist["team_ids"]) > 0:
        checked_entities.append("team_id")
        if not team_id:
            unauthorized_entities.append("team_id")
        elif team_id not in whitelist["team_ids"]:
            unauthorized_entities.append("team_id")
    else:
        skipped_entities.append("team_id")

    # Check user_id (only if whitelist has user_ids configured)
    if len(whitelist["user_ids"]) > 0:
        checked_entities.append("user_id")
        if not user_id:
            unauthorized_entities.append("user_id")
        elif user_id not in whitelist["user_ids"]:
            unauthorized_entities.append("user_id")
    else:
        skipped_entities.append("user_id")

    # Check channel_id (only if whitelist has channel_ids configured)
    if len(whitelist["channel_ids"]) > 0:
        checked_entities.append("channel_id")
        if not channel_id:
            unauthorized_entities.append("channel_id")
        elif channel_id not in whitelist["channel_ids"]:
            unauthorized_entities.append("channel_id")
    else:
        skipped_entities.append("channel_id")

    # Calculate latency
    elapsed_time = (time.time() - start_time) * 1000  # Convert to milliseconds

    # Determine authorization result
    if len(unauthorized_entities) == 0:
        # All checked entities are authorized
        log_info("whitelist_authorization_success", {
            "team_id": team_id,
            "user_id": user_id,
            "channel_id": channel_id,
            "checked_entities": checked_entities,
            "skipped_entities": skipped_entities if skipped_entities else None,
        })
        # Emit metrics for authorization success
        _emit_metric("WhitelistAuthorizationSuccess", 1.0)
        _emit_metric("WhitelistAuthorizationLatency", elapsed_time, "Milliseconds")
        return AuthorizationResult(
            authorized=True,
            team_id=team_id,
            user_id=user_id,
            channel_id=channel_id,
            timestamp=timestamp,
        )
    else:
        # One or more entities are unauthorized
        log_error("whitelist_authorization_failed", {
            "team_id": team_id,
            "user_id": user_id,
            "channel_id": channel_id,
            "unauthorized_entities": unauthorized_entities,
            "checked_entities": checked_entities,
            "skipped_entities": skipped_entities if skipped_entities else None,
        })
        # Emit metrics for authorization failure
        _emit_metric("WhitelistAuthorizationFailed", 1.0)
        _emit_metric("WhitelistAuthorizationLatency", elapsed_time, "Milliseconds")
        return AuthorizationResult(
            authorized=False,
            team_id=team_id,
            user_id=user_id,
            channel_id=channel_id,
            unauthorized_entities=unauthorized_entities,
            timestamp=timestamp,
        )
