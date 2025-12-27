"""
Response handler for parsing ExecutionResponse from SQS messages.

This module parses and validates ExecutionResponse messages from the execution zone.
"""

from typing import Dict, Any, Optional
import re


def parse_execution_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse and validate ExecutionResponse from execution zone.

    Args:
        response: ExecutionResponse dictionary from SQS message

    Returns:
        Parsed response dictionary with validated fields

    Raises:
        ValueError: If response format is invalid
    """
    if not isinstance(response, dict):
        raise ValueError("response must be a dictionary")

    status = response.get("status")
    if status not in ["success", "error"]:
        raise ValueError(f"Invalid status: {status}. Must be 'success' or 'error'")

    channel = response.get("channel")
    if not channel or not isinstance(channel, str) or not channel.strip():
        raise ValueError("channel must be a non-empty string")

    bot_token = response.get("bot_token")
    if not bot_token or not isinstance(bot_token, str) or not bot_token.strip():
        raise ValueError("bot_token must be a non-empty string")
    if not bot_token.startswith("xoxb-"):
        raise ValueError("bot_token must be a valid Slack bot token (starts with xoxb-)")

    parsed: Dict[str, Any] = {
        "status": status,
        "channel": channel,
        "bot_token": bot_token,
    }

    # Optional fields
    if "thread_ts" in response and response["thread_ts"]:
        thread_ts = response["thread_ts"]
        if not isinstance(thread_ts, str):
            raise ValueError("thread_ts must be a string")
        if not _is_valid_timestamp(thread_ts):
            raise ValueError("thread_ts must be a valid Slack timestamp format")
        parsed["thread_ts"] = thread_ts

    if "correlation_id" in response and response["correlation_id"]:
        correlation_id = response["correlation_id"]
        if not isinstance(correlation_id, str):
            raise ValueError("correlation_id must be a string")
        parsed["correlation_id"] = correlation_id

    # Status-specific required fields
    if status == "success":
        response_text = response.get("response_text")
        if not response_text or not isinstance(response_text, str) or not response_text.strip():
            raise ValueError("response_text must be a non-empty string for success status")
        parsed["response_text"] = response_text
    elif status == "error":
        error_code = response.get("error_code")
        if not error_code or not isinstance(error_code, str) or not error_code.strip():
            raise ValueError("error_code must be a non-empty string for error status")
        error_message = response.get("error_message")
        if not error_message or not isinstance(error_message, str) or not error_message.strip():
            raise ValueError("error_message must be a non-empty string for error status")
        parsed["error_code"] = error_code
        parsed["error_message"] = error_message

    return parsed


def validate_execution_response(response: Dict[str, Any]) -> bool:
    """
    Validate that a response dictionary conforms to ExecutionResponse format.

    Args:
        response: Dictionary to validate

    Returns:
        True if valid, False otherwise
    """
    try:
        parse_execution_response(response)
        return True
    except (ValueError, TypeError, KeyError):
        return False


def _is_valid_timestamp(ts: Optional[str]) -> bool:
    """
    Validate Slack timestamp format.

    Slack timestamps are in format: "1234567890.123456" (Unix timestamp with microseconds).

    Args:
        ts: Timestamp string to validate (can be None)

    Returns:
        True if timestamp is valid format, False otherwise
    """
    if not ts or not isinstance(ts, str):
        return False

    # Slack timestamp format: digits, dot, digits (e.g., "1234567890.123456")
    pattern = r"^\d+\.\d+$"
    return bool(re.match(pattern, ts))

