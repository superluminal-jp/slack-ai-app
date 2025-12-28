"""
Whitelist authorization module.

This module implements flexible whitelist-based authorization for Slack requests.
It checks if team_id, user_id, and channel_id are present in the whitelist
before allowing requests to proceed. This implements layer 3c in the multi-layer
defense architecture (after signature verification 3a and Existence Check 3b).

The authorization follows a conditional AND condition:
- Only configured entities (non-empty whitelist sets) are checked
- If all entities are unset (empty whitelist), all requests are allowed
- If an entity is configured, it must be authorized
- If any configured entity is missing or unauthorized, the request is rejected with 403 Forbidden

This flexible approach allows partial whitelist configuration while maintaining
backward compatibility when all entities are configured.
"""

import os
import time
import boto3
from dataclasses import dataclass
from typing import Optional, List
from whitelist_loader import load_whitelist_config, AuthorizationError as LoaderError
from logger import log_info, log_error

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
    except LoaderError as e:
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

