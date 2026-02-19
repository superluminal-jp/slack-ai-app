"""
Rate limiter module for user-level throttling.

This module implements DynamoDB-based rate limiting to prevent DDoS attacks
and control costs by limiting the number of requests per user per time window.

Rate limiting strategy:
- User-level throttling: {team_id}#{user_id} as the rate limit key
- Time window: 1 minute (60 seconds)
- Default limit: 10 requests per minute per user (configurable via environment variable)
- DynamoDB TTL: Automatic cleanup of expired entries
"""

import json
import os
import time
import boto3
from typing import Optional, Tuple

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


class RateLimitExceededError(Exception):
    """Raised when rate limit is exceeded."""

    pass


# CloudWatch client for metrics
_cloudwatch_client = None


def _get_cloudwatch_client():
    """Get CloudWatch client (singleton pattern)."""
    global _cloudwatch_client
    if _cloudwatch_client is None:
        _cloudwatch_client = boto3.client(
            "cloudwatch",
            region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"),
        )
    return _cloudwatch_client


def _emit_metric(metric_name: str, value: float, unit: str = "Count") -> None:
    """
    Emit CloudWatch custom metric.

    Args:
        metric_name: Metric name (e.g., "RateLimitExceeded")
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
        log_warn(
            "cloudwatch_metric_emission_failed",
            {
                "metric_name": metric_name,
                "error": str(e),
            },
        )


def _get_rate_limit_table():
    """
    Get DynamoDB table for rate limiting.

    Returns:
        DynamoDB table resource or None if table name not configured
    """
    table_name = os.environ.get("RATE_LIMIT_TABLE_NAME")
    if not table_name:
        return None

    dynamodb = boto3.resource(
        "dynamodb", region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
    )
    return dynamodb.Table(table_name)


def _generate_rate_limit_key(team_id: Optional[str], user_id: Optional[str]) -> str:
    """
    Generate rate limit key from team_id and user_id.

    Format: "{team_id}#{user_id}"
    Uses '#' separator which is not used in Slack IDs.

    Args:
        team_id: Slack team/workspace ID (can be None)
        user_id: Slack user ID (can be None)

    Returns:
        Rate limit key string in format "{team_id}#{user_id}"
    """
    # Use empty string for None values to ensure consistent key format
    team = team_id or ""
    user = user_id or ""
    return f"{team}#{user}"


def check_rate_limit(
    team_id: Optional[str],
    user_id: Optional[str],
    limit: Optional[int] = None,
    window_seconds: int = 60,
) -> Tuple[bool, Optional[int]]:
    """
    Check if request is within rate limit.

    Implements token bucket algorithm using DynamoDB:
    - Each user has a bucket with a maximum capacity (limit)
    - Each request consumes one token
    - Tokens are replenished at a fixed rate (window_seconds)
    - If bucket is empty, request is rejected

    Args:
        team_id: Slack team/workspace ID (optional)
        user_id: Slack user ID (optional)
        limit: Maximum requests per time window (default: from environment variable RATE_LIMIT_PER_MINUTE)
        window_seconds: Time window in seconds (default: 60 = 1 minute)

    Returns:
        Tuple of (is_allowed: bool, remaining_requests: Optional[int])
        - is_allowed: True if request is allowed, False if rate limit exceeded
        - remaining_requests: Number of remaining requests in current window (None if limit not configured)

    Raises:
        RateLimitExceededError: If rate limit is exceeded
    """
    # Get rate limit from environment variable if not provided
    if limit is None:
        limit_str = os.environ.get("RATE_LIMIT_PER_MINUTE", "10")
        try:
            limit = int(limit_str)
        except ValueError:
            log_warn(
                "rate_limit_config_invalid",
                {
                    "rate_limit_per_minute": limit_str,
                },
            )
            limit = 10  # Default fallback

    # If limit is 0 or negative, rate limiting is disabled
    if limit <= 0:
        return True, None

    # Generate rate limit key
    rate_limit_key = _generate_rate_limit_key(team_id, user_id)

    # Get current timestamp (seconds since epoch)
    current_time = int(time.time())
    window_start = (
        current_time // window_seconds
    ) * window_seconds  # Align to window boundary

    # Create item key with window timestamp
    item_key = f"{rate_limit_key}#{window_start}"

    try:
        table = _get_rate_limit_table()
        if not table:
            # Table not configured - allow all requests (graceful degradation)
            log_warn(
                "rate_limit_table_not_configured",
                {
                    "rate_limit_key": rate_limit_key,
                },
            )
            return True, None

        # Try to increment request count atomically
        # Use conditional update to ensure we don't exceed the limit
        # Note: 'ttl' is a reserved keyword in DynamoDB, so we use ExpressionAttributeNames to escape it
        try:
            response = table.update_item(
                Key={"rate_limit_key": item_key},
                UpdateExpression="SET request_count = if_not_exists(request_count, :zero) + :inc, #ttl = :ttl, window_start = :window_start",
                ConditionExpression="attribute_not_exists(request_count) OR request_count < :limit",
                ExpressionAttributeNames={
                    "#ttl": "ttl",  # Escape reserved keyword 'ttl'
                },
                ExpressionAttributeValues={
                    ":zero": 0,
                    ":inc": 1,
                    ":limit": limit,
                    ":ttl": current_time
                    + window_seconds
                    + 300,  # TTL = window_end + 5 minutes buffer
                    ":window_start": window_start,
                },
                ReturnValues="UPDATED_NEW",
            )

            # Successfully incremented - request is allowed
            new_count = response.get("Attributes", {}).get("request_count", 1)
            remaining = max(0, limit - new_count)

            log_info(
                "rate_limit_check_allowed",
                {
                    "rate_limit_key": rate_limit_key,
                    "request_count": new_count,
                    "limit": limit,
                    "remaining": remaining,
                    "window_start": window_start,
                },
            )

            # Emit metric for rate limit check
            _emit_metric("RateLimitRequests", 1.0)

            return True, remaining

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "ConditionalCheckFailedException":
                # Rate limit exceeded - request is rejected
                log_error(
                    "rate_limit_exceeded",
                    {
                        "rate_limit_key": rate_limit_key,
                        "limit": limit,
                        "window_start": window_start,
                    },
                )

                # Emit metric for rate limit exceeded
                _emit_metric("RateLimitExceeded", 1.0)

                raise RateLimitExceededError(
                    f"Rate limit exceeded: {limit} requests per {window_seconds} seconds"
                )
            else:
                # Other DynamoDB error - log and allow request (graceful degradation)
                log_error(
                    "rate_limit_dynamodb_error",
                    {
                        "rate_limit_key": rate_limit_key,
                        "error_code": error_code,
                    },
                    e,
                )
                return True, None

    except RateLimitExceededError:
        # Re-raise rate limit exceeded errors
        raise
    except Exception as e:
        # Unexpected error - log and allow request (graceful degradation)
        log_error(
            "rate_limit_unexpected_error",
            {
                "rate_limit_key": rate_limit_key,
            },
            e,
        )
        return True, None
