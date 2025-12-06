"""
Canvas creator for Slack Canvas API integration.

This module creates Canvas objects via Slack API for long replies
and structured document content.
"""

from typing import Dict, Optional
import time
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


# Canvas content size limit (assumed, to be validated)
CANVAS_MAX_CONTENT_SIZE = 100000  # 100KB
CANVAS_MAX_TITLE_LENGTH = 100


def format_canvas_content(content: str) -> Dict:
    """
    Format reply content for Canvas document_content.

    Canvas API requires document_content as a structured object (ProseMirror format).
    According to Slack Canvas API docs: https://docs.slack.dev/reference/methods/canvases.create/
    
    The document_content must be a structured object with type "doc" and content array.
    Canvas supports various formatting elements, but for simplicity, we'll use
    a basic structure with heading and paragraph nodes.

    Args:
        content: The reply text content (may contain markdown)

    Returns:
        Dictionary with Canvas document_content structure:
        {
            "type": "doc",
            "content": [
                {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "AI Response"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": content}]}
            ]
        }
    """
    # Canvas document_content structure (ProseMirror format)
    # Basic structure: doc -> heading + paragraph
    # Note: This is a simplified structure. For full markdown support,
    # we would need to parse markdown and convert to ProseMirror nodes
    return {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "AI Response"}]
            },
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": content}]
            }
        ]
    }


def map_error_code(slack_error: str) -> str:
    """
    Map Slack API error codes to internal error codes.

    Args:
        slack_error: Slack API error code

    Returns:
        Internal error code (api_error, permission_error, rate_limit, content_too_large, unknown)
    """
    error_mapping = {
        "missing_scope": "permission_error",
        "not_authorized": "permission_error",
        "invalid_auth": "permission_error",
        "rate_limited": "rate_limit",
        "invalid_content": "content_too_large",
        "invalid_request": "api_error",
    }

    return error_mapping.get(slack_error, "unknown")


def create_canvas(bot_token: str, title: str, content: str) -> Dict:
    """
    Create Canvas via Slack API.

    Args:
        bot_token: Slack bot OAuth token (xoxb-...)
        title: Canvas title (max 100 characters)
        content: Canvas content (formatted text)

    Returns:
        Dictionary with:
        - success: bool
        - canvas_id: str (if success)
        - error_code: str (if failure)
        - error_message: str (if failure)

    Note:
        Canvas API method is assumed (canvas.create) and requires validation.
    """
    # Validate inputs
    if not bot_token or not bot_token.strip():
        return {
            "success": False,
            "error_code": "api_error",
            "error_message": "Bot token is required",
        }

    if not title or not title.strip():
        return {
            "success": False,
            "error_code": "api_error",
            "error_message": "Canvas title is required",
        }

    if len(title) > CANVAS_MAX_TITLE_LENGTH:
        return {
            "success": False,
            "error_code": "content_too_large",
            "error_message": f"Canvas title exceeds {CANVAS_MAX_TITLE_LENGTH} character limit",
        }

    if not content or not content.strip():
        return {
            "success": False,
            "error_code": "api_error",
            "error_message": "Canvas content is required",
        }

    # Validate content size
    content_size = len(content.encode("utf-8"))
    if content_size > CANVAS_MAX_CONTENT_SIZE:
        return {
            "success": False,
            "error_code": "content_too_large",
            "error_message": f"Canvas content exceeds {CANVAS_MAX_CONTENT_SIZE} byte limit",
        }

    client = WebClient(token=bot_token)

    try:
        # Track creation time for performance monitoring
        start_time = time.time()

        # Use Slack Canvas API via api_call method
        # Canvas API documentation: https://docs.slack.dev/reference/methods/canvases.create/
        # The API supports title and document_content parameters
        # document_content can be a markdown string or structured object
        # Canvas supports markdown formatting natively (headings, lists, code blocks, tables, etc.)
        formatted_content = format_canvas_content(content)
        
        # api_call usage: first argument is the API method name (string)
        # Parameters are passed via json parameter
        # document_content is formatted as ProseMirror structure (see format_canvas_content)
        
        # Build parameters dict
        api_params = {
            "title": title,
            "document_content": formatted_content,  # Pass markdown string - Canvas should render it
        }
        
        # api_call signature: api_call(api_method, json={...})
        response = client.api_call(
            "canvases.create",  # First argument: API method name as string
            json=api_params,  # Parameters passed via json parameter
        )

        creation_time_ms = (time.time() - start_time) * 1000

        if response.get("ok"):
            canvas_id = response.get("canvas", {}).get("id")
            if canvas_id:
                return {
                    "success": True,
                    "canvas_id": canvas_id,
                    "creation_time_ms": creation_time_ms,
                }
            else:
                return {
                    "success": False,
                    "error_code": "api_error",
                    "error_message": "Canvas created but ID not returned",
                }
        else:
            error_code = response.get("error", "unknown")
            return {
                "success": False,
                "error_code": map_error_code(error_code),
                "error_message": response.get(
                    "error_message", f"Canvas creation failed: {error_code}"
                ),
            }

    except SlackApiError as e:
        error_code = (
            e.response.get("error", "unknown") if hasattr(e, "response") else "unknown"
        )
        mapped_error = map_error_code(error_code)

        # Handle rate limit with retry logic (per FR-014)
        if mapped_error == "rate_limit":
            # Extract retry-after from response if available
            retry_after = (
                e.response.get("retry_after", 60) if hasattr(e, "response") else 60
            )
            return {
                "success": False,
                "error_code": "rate_limit",
                "error_message": f"Rate limit exceeded. Retry after {retry_after} seconds.",
                "retry_after": retry_after,
            }

        return {"success": False, "error_code": mapped_error, "error_message": str(e)}
    except AttributeError as e:
        # Canvas API not available in Slack SDK
        if "canvas_create" in str(e) or "Canvas API" in str(e):
            return {
                "success": False,
                "error_code": "api_error",
                "error_message": (
                    "Slack Canvas API is not currently available. "
                    "The reply has been posted as a regular message instead."
                ),
            }
        # Re-raise other AttributeErrors
        raise
    except Exception as e:
        # Log the actual exception for debugging
        error_msg = str(e)
        error_type = type(e).__name__
        
        # Handle timeout errors (per FR-014)
        if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            return {
                "success": False,
                "error_code": "api_error",
                "error_message": f"Canvas creation timed out: {error_msg}",
            }
        
        # Handle API call errors - provide more detail for debugging
        return {
            "success": False,
            "error_code": "unknown",
            "error_message": f"Unexpected error creating Canvas ({error_type}): {error_msg}",
        }
