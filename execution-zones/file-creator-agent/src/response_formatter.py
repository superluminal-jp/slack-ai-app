"""
Response formatter for Execution Zone to Verification Zone communication.

This module formats responses from the execution zone into the ExecutionResponse
format that will be sent to the verification zone via A2A (and historically SQS).
Includes 014 support for generated_file artifact (contracts/a2a-file-artifact.yaml).
"""

from typing import Dict, Any, Optional, Tuple
import uuid

# A2A file artifact constants (contracts/a2a-file-artifact.yaml)
GENERATED_FILE_ARTIFACT_NAME: str = "generated_file"
FILE_PART_KEY_CONTENT_BASE64: str = "contentBase64"
FILE_PART_KEY_FILE_NAME: str = "fileName"
FILE_PART_KEY_MIME_TYPE: str = "mimeType"
FILE_PART_KIND: str = "file"


def validate_file_for_artifact(
    file_bytes: bytes,
    file_name: str,
    mime_type: str,
) -> Tuple[bool, Optional[str]]:
    """
    Validate that a file can be sent as a generated_file artifact (size and MIME).

    Uses file_config limits (get_max_file_size_bytes, is_allowed_mime).

    Returns:
        (True, None) if valid; (False, error_message) if over size or disallowed MIME.
    """
    try:
        import file_config as fc
    except ImportError:
        return (False, "file_config not available")

    if not isinstance(file_bytes, bytes):
        return (False, "file_bytes must be bytes")
    size = len(file_bytes)
    if not fc.is_within_size_limit(size):
        return (False, "ファイルが大きすぎます")
    if not fc.is_allowed_mime(mime_type):
        return (False, "許可されていないファイル形式です")
    if not file_name or not isinstance(file_name, str) or not file_name.strip():
        return (False, "ファイル名を指定してください")
    return (True, None)


def build_file_artifact(
    file_bytes: bytes,
    file_name: str,
    mime_type: str,
) -> Dict[str, Any]:
    """
    Build an A2A generated_file artifact dict (contracts/a2a-file-artifact.yaml).

    Caller must have already validated with validate_file_for_artifact.

    Returns:
        Dict with artifactId, name "generated_file", parts with one file part
        (contentBase64, fileName, mimeType).
    """
    import base64
    return {
        "artifactId": str(uuid.uuid4()),
        "name": GENERATED_FILE_ARTIFACT_NAME,
        "parts": [
            {
                "kind": FILE_PART_KIND,
                FILE_PART_KEY_CONTENT_BASE64: base64.b64encode(file_bytes).decode("utf-8"),
                FILE_PART_KEY_FILE_NAME: file_name,
                FILE_PART_KEY_MIME_TYPE: mime_type,
            }
        ],
    }


def format_success_response(
    channel: str,
    response_text: str,
    bot_token: str,
    thread_ts: Optional[str] = None,
    correlation_id: Optional[str] = None,
    original_message_ts: Optional[str] = None,
    file_bytes: Optional[bytes] = None,
    file_name: Optional[str] = None,
    mime_type: Optional[str] = None,
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    """
    Format a successful AI response into ExecutionResponse format.
    When file_bytes, file_name, mime_type are provided and valid, returns file_artifact too.

    Returns:
        (response_dict, file_artifact_dict or None). Caller can set result["file_artifact"].
    """
    if not channel or not isinstance(channel, str) or not channel.strip():
        raise ValueError("channel must be a non-empty string")
    if response_text is None or not isinstance(response_text, str):
        raise ValueError("response_text must be a string")
    if not (response_text or "").strip() and not (file_bytes and file_name and mime_type):
        raise ValueError("response_text must be non-empty when no file is provided")
    if not bot_token or not isinstance(bot_token, str) or not bot_token.strip():
        raise ValueError("bot_token must be a non-empty string")
    if not bot_token.startswith("xoxb-"):
        raise ValueError("bot_token must be a valid Slack bot token (starts with xoxb-)")

    response: Dict[str, Any] = {
        "status": "success",
        "channel": channel,
        "bot_token": bot_token,
        "response_text": (response_text or "").strip(),
    }

    if thread_ts:
        response["thread_ts"] = thread_ts

    if correlation_id:
        response["correlation_id"] = correlation_id

    if original_message_ts:
        response["original_message_ts"] = original_message_ts

    file_artifact: Optional[Dict[str, Any]] = None
    if file_bytes is not None and file_name and mime_type:
        ok, err_msg = validate_file_for_artifact(file_bytes, file_name, mime_type)
        if ok:
            file_artifact = build_file_artifact(file_bytes, file_name, mime_type)
        elif err_msg:
            # FR-005, FR-006: include user-facing message when file rejected (size/MIME)
            current = (response_text or "").strip()
            response["response_text"] = f"{current}\n{err_msg}".strip() if current else err_msg

    return (response, file_artifact)


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
        rt = response.get("response_text")
        if not isinstance(rt, str):
            return False
        # Allow empty response_text when file_artifact is present (014 file-only response)
        if not (rt.strip() or response.get("file_artifact")):
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
