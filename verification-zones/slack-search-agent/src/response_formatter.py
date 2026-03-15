"""
Response formatter for Slack Search Agent A2A responses.

Formats responses into the JSON-RPC 2.0 result format defined in
contracts/a2a-execute-task.json.
"""

from typing import Any, Dict, Optional


def format_success_response(
    channel: str,
    response_text: str,
    thread_ts: Optional[str] = None,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Format a successful search/retrieval response.

    Args:
        channel: Slack channel ID (calling channel)
        response_text: Search or retrieval result as human-readable text
        thread_ts: Optional thread timestamp
        correlation_id: Optional request tracking ID

    Returns:
        Dict matching response_success contract

    Raises:
        ValueError: If required fields are missing or invalid
    """
    if not channel or not isinstance(channel, str) or not channel.strip():
        raise ValueError("channel must be a non-empty string")
    if response_text is None or not isinstance(response_text, str):
        raise ValueError("response_text must be a string")
    if not response_text.strip():
        raise ValueError("response_text must be non-empty")

    response: Dict[str, Any] = {
        "status": "success",
        "channel": channel,
        "response_text": response_text.strip(),
    }

    if thread_ts:
        response["thread_ts"] = thread_ts

    if correlation_id:
        response["correlation_id"] = correlation_id

    return response


def format_error_response(
    channel: str,
    error_code: str,
    response_text: str,
    thread_ts: Optional[str] = None,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Format an error response.

    Args:
        channel: Slack channel ID (calling channel)
        error_code: Machine-readable error code (e.g. "access_denied", "slack_api_error")
        response_text: User-facing error message
        thread_ts: Optional thread timestamp
        correlation_id: Optional request tracking ID

    Returns:
        Dict matching response_error contract

    Raises:
        ValueError: If required fields are missing or invalid
    """
    if not channel or not isinstance(channel, str) or not channel.strip():
        raise ValueError("channel must be a non-empty string")
    if not error_code or not isinstance(error_code, str) or not error_code.strip():
        raise ValueError("error_code must be a non-empty string")
    if not response_text or not isinstance(response_text, str) or not response_text.strip():
        raise ValueError("response_text must be a non-empty string")

    response: Dict[str, Any] = {
        "status": "error",
        "channel": channel,
        "response_text": response_text.strip(),
        "error_code": error_code,
    }

    if thread_ts:
        response["thread_ts"] = thread_ts

    if correlation_id:
        response["correlation_id"] = correlation_id

    return response
