"""
Response formatter for Execution Zone to Verification Zone communication.

This module formats responses from the execution zone into the ExecutionResponse
format that will be sent to the verification zone via SQS.
"""

from typing import Dict, Any, Optional
import uuid


def format_success_response(
    channel: str,
    response_text: str,
    bot_token: str,
    thread_ts: Optional[str] = None,
    correlation_id: Optional[str] = None,
    original_message_ts: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Format a successful AI response into ExecutionResponse format.

    Args:
        channel: Slack channel ID where the response should be posted
        response_text: AI-generated response text
        bot_token: Slack bot OAuth token for posting the response
        thread_ts: Optional thread timestamp for thread replies
        correlation_id: Optional correlation ID for tracing

    Returns:
        Dictionary representing ExecutionResponse with status "success"

    Raises:
        ValueError: If required fields are missing or invalid
    """
    if not channel or not isinstance(channel, str) or not channel.strip():
        raise ValueError("channel must be a non-empty string")
    if not response_text or not isinstance(response_text, str) or not response_text.strip():
        raise ValueError("response_text must be a non-empty string")
    if not bot_token or not isinstance(bot_token, str) or not bot_token.strip():
        raise ValueError("bot_token must be a non-empty string")
    if not bot_token.startswith("xoxb-"):
        raise ValueError("bot_token must be a valid Slack bot token (starts with xoxb-)")

    response: Dict[str, Any] = {
        "status": "success",
        "channel": channel,
        "bot_token": bot_token,
        "response_text": response_text,
    }

    if thread_ts:
        response["thread_ts"] = thread_ts

    if correlation_id:
        response["correlation_id"] = correlation_id

    if original_message_ts:
        response["original_message_ts"] = original_message_ts

    return response


def format_error_response(
    channel: str,
    error_code: str,
    error_message: str,
    bot_token: str,
    thread_ts: Optional[str] = None,
    correlation_id: Optional[str] = None,
    original_message_ts: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Format an error response into ExecutionResponse format.

    Args:
        channel: Slack channel ID where the error message should be posted
        error_code: Machine-readable error code (e.g., "bedrock_timeout", "bedrock_throttling")
        error_message: User-friendly error message
        bot_token: Slack bot OAuth token for posting the error message
        thread_ts: Optional thread timestamp for thread replies
        correlation_id: Optional correlation ID for tracing

    Returns:
        Dictionary representing ExecutionResponse with status "error"

    Raises:
        ValueError: If required fields are missing or invalid
    """
    if not channel or not isinstance(channel, str) or not channel.strip():
        raise ValueError("channel must be a non-empty string")
    if not error_code or not isinstance(error_code, str) or not error_code.strip():
        raise ValueError("error_code must be a non-empty string")
    if not error_message or not isinstance(error_message, str) or not error_message.strip():
        raise ValueError("error_message must be a non-empty string")
    if not bot_token or not isinstance(bot_token, str) or not bot_token.strip():
        raise ValueError("bot_token must be a non-empty string")
    if not bot_token.startswith("xoxb-"):
        raise ValueError("bot_token must be a valid Slack bot token (starts with xoxb-)")

    response: Dict[str, Any] = {
        "status": "error",
        "channel": channel,
        "bot_token": bot_token,
        "error_code": error_code,
        "error_message": error_message,
    }

    if thread_ts:
        response["thread_ts"] = thread_ts

    if correlation_id:
        response["correlation_id"] = correlation_id

    if original_message_ts:
        response["original_message_ts"] = original_message_ts

    return response


def validate_execution_response(response: Dict[str, Any]) -> bool:
    """
    Validate that a response dictionary conforms to ExecutionResponse format.

    Args:
        response: Dictionary to validate

    Returns:
        True if valid, False otherwise
    """
    if not isinstance(response, dict):
        return False

    # Check required fields
    status = response.get("status")
    if status not in ["success", "error"]:
        return False

    if not response.get("channel") or not isinstance(response.get("channel"), str):
        return False

    if not response.get("bot_token") or not isinstance(response.get("bot_token"), str):
        return False

    if not response.get("bot_token", "").startswith("xoxb-"):
        return False

    # Check status-specific required fields
    if status == "success":
        if not response.get("response_text") or not isinstance(response.get("response_text"), str):
            return False
    elif status == "error":
        if not response.get("error_code") or not isinstance(response.get("error_code"), str):
            return False
        if not response.get("error_message") or not isinstance(response.get("error_message"), str):
            return False

    # Validate optional fields if present
    if "thread_ts" in response and response["thread_ts"]:
        if not isinstance(response["thread_ts"], str):
            return False

    if "correlation_id" in response and response["correlation_id"]:
        if not isinstance(response["correlation_id"], str):
            return False
        # Basic UUID format check (not strict validation)
        try:
            uuid.UUID(response["correlation_id"])
        except (ValueError, TypeError):
            return False

    return True

