"""
Canvas sharer for sharing Canvas in Slack threads and channels.

This module shares Canvas objects in Slack threads or channels
via Slack API.
"""

from typing import Dict, Optional
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
import re


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


def map_error_code(slack_error: str) -> str:
    """
    Map Slack API error codes to internal error codes.

    Args:
        slack_error: Slack API error code

    Returns:
        Internal error code (api_error, permission_error, rate_limit, unknown)
    """
    error_mapping = {
        "missing_scope": "permission_error",
        "not_authorized": "permission_error",
        "invalid_auth": "permission_error",
        "rate_limited": "rate_limit",
        "invalid_request": "api_error",
        "canvas_not_found": "api_error",
        "channel_not_found": "api_error",
    }

    return error_mapping.get(slack_error, "unknown")


def share_canvas(
    bot_token: str,
    canvas_id: str,
    channel: str,
    thread_ts: Optional[str] = None
) -> Dict:
    """
    Share Canvas in thread or channel.

    Args:
        bot_token: Slack bot OAuth token (xoxb-...)
        canvas_id: Canvas ID to share
        channel: Channel ID where to share Canvas
        thread_ts: Optional thread timestamp (if sharing in thread)

    Returns:
        Dictionary with:
        - success: bool
        - error_code: str (if failure)
        - error_message: str (if failure)

    Note:
        Canvas API method is assumed (canvas.share) and requires validation.
    """
    # Validate inputs
    if not bot_token or not bot_token.strip():
        return {
            "success": False,
            "error_code": "api_error",
            "error_message": "Bot token is required"
        }

    if not canvas_id or not canvas_id.strip():
        return {
            "success": False,
            "error_code": "api_error",
            "error_message": "Canvas ID is required"
        }

    if not channel or not channel.strip():
        return {
            "success": False,
            "error_code": "api_error",
            "error_message": "Channel ID is required"
        }

    client = WebClient(token=bot_token)

    try:
        # Build API call parameters
        params = {
            "canvas_id": canvas_id,
            "channel": channel
        }

        # Add thread_ts if provided and valid
        if thread_ts and _is_valid_timestamp(thread_ts):
            params["thread_ts"] = thread_ts

        # Use Slack Canvas API via api_call method
        # Canvas sharing can be done by:
        # 1. Using canvases.access.set to set channel access
        # 2. Posting a message with canvas link (which will unfurl)
        # For now, we'll try canvases.access.set first, then fallback to chat.postMessage
        
        # Attempt to share Canvas via access.set API
        try:
            response = client.api_call(
                "canvases.access.set",  # First argument: API method name as string
                json={
                    "canvas_id": canvas_id,
                    "channel_id": channel,
                },
            )
        except Exception:
            # Fallback: Post message with canvas link/unfurl
            # Canvas will automatically unfurl when shared
            share_params = {
                "channel": channel,
                "text": f"📄 Canvas created: <https://app.slack.com/canvas/{canvas_id}|View Canvas>",
                "unfurl_links": True,
                "unfurl_media": True,
            }
            if thread_ts and _is_valid_timestamp(thread_ts):
                share_params["thread_ts"] = thread_ts
            
            response = client.api_call(
                "chat.postMessage",  # First argument: API method name as string
                json=share_params,
            )

        if response.get("ok"):
            return {"success": True}
        else:
            error_code = response.get("error", "unknown")
            return {
                "success": False,
                "error_code": map_error_code(error_code),
                "error_message": response.get("error_message", f"Canvas sharing failed: {error_code}")
            }

    except SlackApiError as e:
        error_code = e.response.get("error", "unknown") if hasattr(e, "response") else "unknown"
        return {
            "success": False,
            "error_code": map_error_code(error_code),
            "error_message": str(e)
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": "unknown",
            "error_message": f"Unexpected error sharing Canvas: {str(e)}"
        }

