"""
Existence Check module for Two-Key Defense security model.

This module verifies that team_id, user_id, and channel_id exist in Slack
by calling Slack API (team.info, users.info, conversations.info) before
processing requests. This implements the second key in the two-key defense
model (Signing Secret + Bot Token).

When Signing Secret is leaked, attackers can forge request signatures,
but they cannot call Slack API without Bot Token. This feature verifies
that entities exist in Slack, preventing attackers from creating fake
requests with made-up IDs.

Verification results are cached in DynamoDB for 5 minutes to minimize
performance impact. The system fails securely (rejects requests) when
Slack API is unavailable, prioritizing security over availability.
"""

import json
import os
import socket
import time
from typing import Any, Dict, Optional

import boto3
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
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
        _cloudwatch_client = boto3.client("cloudwatch")
    return _cloudwatch_client


def _emit_metric(metric_name: str, value: float, unit: str = "Count") -> None:
    """
    Emit CloudWatch custom metric.

    Args:
        metric_name: Metric name (e.g., "ExistenceCheckFailed")
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


class ExistenceCheckError(Exception):
    """Raised when entity existence check fails."""
    pass


def _get_cache_table():
    """
    Get DynamoDB table for Existence Check cache.

    Returns:
        DynamoDB table resource or None if table name not configured
    """
    table_name = os.environ.get("EXISTENCE_CHECK_CACHE_TABLE")
    if not table_name:
        return None

    dynamodb = boto3.resource("dynamodb")
    return dynamodb.Table(table_name)


def get_from_cache(cache_key: str) -> Optional[Dict[str, Any]]:
    """
    Get cached verification result from DynamoDB.

    Args:
        cache_key: Cache key in format "{team_id}#{user_id}#{channel_id}"

    Returns:
        Cached entry dictionary if found and valid, None otherwise
    """
    try:
        table = _get_cache_table()
        if not table:
            return None

        response = table.get_item(Key={"cache_key": cache_key})
        item = response.get("Item")

        if item:
            # Check if cache entry is still valid (TTL not expired)
            ttl = item.get("ttl", 0)
            current_time = int(time.time())
            if ttl > current_time:
                return item

        return None
    except ClientError as e:
        log_warn(
            "existence_check_cache_read_failed",
            {"cache_key": cache_key, "error_code": e.response.get("Error", {}).get("Code")},
            e,
        )
        return None
    except Exception as e:
        log_warn(
            "existence_check_cache_read_failed",
            {"cache_key": cache_key},
            e,
        )
        return None


def save_to_cache(cache_key: str, ttl: int = 300) -> None:
    """
    Save verification result to DynamoDB cache.

    Args:
        cache_key: Cache key in format "{team_id}#{user_id}#{channel_id}"
        ttl: Time to live in seconds (default: 300 = 5 minutes)
    """
    try:
        table = _get_cache_table()
        if not table:
            return

        current_time = int(time.time())
        table.put_item(
            Item={
                "cache_key": cache_key,
                "ttl": current_time + ttl,
                "verified_at": current_time,
            }
        )
    except ClientError as e:
        log_warn(
            "existence_check_cache_save_failed",
            {"cache_key": cache_key, "error_code": e.response.get("Error", {}).get("Code")},
            e,
        )
    except Exception as e:
        log_warn(
            "existence_check_cache_save_failed",
            {"cache_key": cache_key},
            e,
        )


def _verify_entity_with_retry(
    client: WebClient,
    entity_type: str,
    entity_id: str,
    verify_func,
    max_retries: int = 3,
) -> None:
    """
    Verify entity existence with retry logic for rate limits.

    Implements exponential backoff retry (1s, 2s, 4s) for rate limit errors (429).
    Fails securely (rejects request) on all other errors or after retries exhausted.

    Args:
        client: Slack WebClient instance
        entity_type: Entity type ("team", "user", "channel")
        entity_id: Entity ID to verify
        verify_func: Function to call for verification (lambda that calls Slack API)
        max_retries: Maximum number of retry attempts (default: 3)

    Raises:
        ExistenceCheckError: If entity verification fails or Slack API error occurs
    """
    for attempt in range(max_retries):
        try:
            result = verify_func()
            if not result.get("ok"):
                error = result.get("error", "unknown")
                if error == f"{entity_type}_not_found":
                    raise ExistenceCheckError(f"{entity_type.capitalize()} not found: {entity_id}")
                elif result.get("status_code") == 429:
                    # Rate limit error - retry with exponential backoff
                    if attempt < max_retries - 1:
                        delay = 2 ** attempt  # 1s, 2s, 4s
                        log_warn("existence_check_rate_limit_retry", {
                            "entity_type": entity_type,
                            "entity_id": entity_id,
                            "attempt": attempt + 1,
                            "max_retries": max_retries,
                            "delay_seconds": delay,
                        })
                        time.sleep(delay)
                        continue
                    else:
                        raise ExistenceCheckError(f"Slack API rate limit exceeded for {entity_type}: {entity_id}")
                else:
                    raise ExistenceCheckError(f"Slack API error verifying {entity_type}: {error}")
            # Success - break out of retry loop
            break
        except SlackApiError as e:
            error_code = e.response.get("error", "unknown")
            status_code = e.response.get("status_code")

            if error_code == f"{entity_type}_not_found":
                # Emit failure metric
                _emit_metric("ExistenceCheckFailed", 1.0)
                raise ExistenceCheckError(f"{entity_type.capitalize()} not found: {entity_id}")
            elif status_code == 429:
                # Rate limit error - retry with exponential backoff
                if attempt < max_retries - 1:
                    delay = 2 ** attempt  # 1s, 2s, 4s
                    log_warn("existence_check_rate_limit_retry", {
                        "entity_type": entity_type,
                        "entity_id": entity_id,
                        "attempt": attempt + 1,
                        "max_retries": max_retries,
                        "delay_seconds": delay,
                    })
                    time.sleep(delay)
                    continue
                else:
                    # Emit failure metric after retries exhausted
                    _emit_metric("ExistenceCheckFailed", 1.0)
                    raise ExistenceCheckError(f"Slack API rate limit exceeded for {entity_type}: {entity_id}")
            else:
                # Emit failure metric for other API errors
                _emit_metric("ExistenceCheckFailed", 1.0)
                raise ExistenceCheckError(f"Slack API error verifying {entity_type}: {error_code}")
        except (socket.timeout, TimeoutError) as e:
            # Timeout error - fail closed (reject request)
            log_error("existence_check_timeout", {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "attempt": attempt + 1,
            })
            # Emit timeout metric
            _emit_metric("ExistenceCheckFailed", 1.0)
            raise ExistenceCheckError(f"Existence check timeout for {entity_type}: {entity_id}")
        except Exception as e:
            # Other errors - fail closed (reject request)
            log_error("existence_check_api_error", {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "error": str(e),
                "attempt": attempt + 1,
            })
            # Emit failure metric
            _emit_metric("ExistenceCheckFailed", 1.0)
            raise ExistenceCheckError(f"Existence check failed for {entity_type}: {str(e)}")


def _generate_cache_key(team_id: Optional[str], user_id: Optional[str], channel_id: Optional[str]) -> str:
    """
    Generate cache key from team_id, user_id, and channel_id.

    Format: "{team_id}#{user_id}#{channel_id}"
    Uses '#' separator which is not used in Slack IDs.

    Args:
        team_id: Slack team/workspace ID (can be None)
        user_id: Slack user ID (can be None)
        channel_id: Slack channel ID (can be None)

    Returns:
        Cache key string in format "{team_id}#{user_id}#{channel_id}"
    """
    # Use empty string for None values to ensure consistent key format
    team = team_id or ""
    user = user_id or ""
    channel = channel_id or ""
    return f"{team}#{user}#{channel}"


def check_entity_existence(
    bot_token: str,
    team_id: Optional[str] = None,
    user_id: Optional[str] = None,
    channel_id: Optional[str] = None,
) -> bool:
    """
    Verify that team_id, user_id, and channel_id exist in Slack.

    This function implements the second key in the two-key defense model.
    It verifies entities exist in Slack by calling Slack API before processing
    requests. This prevents attackers who have stolen only the Signing Secret
    from creating fake requests with made-up IDs.

    Args:
        bot_token: Slack Bot Token (xoxb-...) for API authentication
        team_id: Slack team/workspace ID to verify (optional)
        user_id: Slack user ID to verify (optional)
        channel_id: Slack channel ID to verify (optional)

    Returns:
        True if all provided entities exist in Slack, False otherwise

    Raises:
        ExistenceCheckError: If entity verification fails or Slack API error occurs

    Note:
        - If team_id, user_id, or channel_id is None, that entity is skipped
        - Verification results are cached in DynamoDB for 5 minutes
        - System fails securely (rejects requests) when Slack API is unavailable
    """
    # Generate cache key
    cache_key = _generate_cache_key(team_id, user_id, channel_id)

    # Check cache first
    cached_result = get_from_cache(cache_key)
    if cached_result:
        log_info("existence_check_cache_hit", {
            "cache_key": cache_key,
        })
        # Emit cache hit metric
        _emit_metric("ExistenceCheckCacheHit", 1.0)
        return True  # Cache hit - skip Slack API calls

    log_info("existence_check_cache_miss", {
        "cache_key": cache_key,
    })
    # Emit cache miss metric
    _emit_metric("ExistenceCheckCacheMiss", 1.0)

    # Create Slack API client with 2-second timeout
    client = WebClient(token=bot_token, timeout=2)

    # Track API latency
    api_start_time = time.time()

    # Verify team_id if provided (with retry logic for rate limits)
    if team_id:
        _verify_entity_with_retry(
            client=client,
            entity_type="team",
            entity_id=team_id,
            verify_func=lambda: client.team_info(team=team_id),
        )

    # Verify user_id if provided (with retry logic for rate limits)
    if user_id:
        _verify_entity_with_retry(
            client=client,
            entity_type="user",
            entity_id=user_id,
            verify_func=lambda: client.users_info(user=user_id),
        )

    # Verify channel_id if provided (with retry logic for rate limits)
    if channel_id:
        _verify_entity_with_retry(
            client=client,
            entity_type="channel",
            entity_id=channel_id,
            verify_func=lambda: client.conversations_info(channel=channel_id),
        )

    # Emit API latency metric
    api_latency_ms = (time.time() - api_start_time) * 1000
    _emit_metric("SlackAPILatency", api_latency_ms, "Milliseconds")

    # All verifications passed
    # Save to cache
    save_to_cache(cache_key, ttl=300)  # 5 minutes TTL

    return True
