"""
Slack Poster Lambda (019, 028): consumes SQS messages from Verification Agent and posts to Slack.

Verification Agent no longer calls Slack API; it sends a structured "post request" to this
queue. This Lambda performs the actual chat.postMessage and files.upload.

Message body (JSON): channel, thread_ts?, text?, file_artifact?, bot_token, correlation_id?
See specs/019-slack-poster-separation/contracts/slack-post-request.md.
028: file_artifact supports s3PresignedUrl (fetch) or contentBase64 (inline).
"""

import base64
import json
import re
import time
import traceback
import urllib.request
from typing import Any, List, Optional
from urllib.parse import urlparse

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


def _log(level: str, event: str, data: Optional[dict] = None) -> None:
    entry = {"level": level, "event": event, "service": "slack-poster"}
    if data:
        entry.update(data)
    print(json.dumps(entry, default=str, ensure_ascii=False))


def _is_valid_timestamp(ts: Optional[str]) -> bool:
    if not ts or not isinstance(ts, str):
        return False
    return bool(re.match(r"^\d+\.\d+$", ts))


def _split_message(text: str, max_length: int = 4000) -> List[str]:
    if len(text) <= max_length:
        return [text]
    chunks: List[str] = []
    remaining = text
    pattern = r"([.!?])\s+"
    while len(remaining) > max_length:
        match = re.search(pattern, remaining[: max_length + 100])
        if match:
            split_pos = match.end()
            chunk = remaining[:split_pos].rstrip()
            remaining = remaining[split_pos:].lstrip()
        else:
            chunk = remaining[:max_length]
            remaining = remaining[max_length:]
        chunks.append(chunk)
    if remaining:
        chunks.append(remaining)
    return chunks


def _post_text(
    client: WebClient,
    channel: str,
    text: str,
    thread_ts: Optional[str],
) -> None:
    for chunk in _split_message(text):
        params: dict = {"channel": channel, "text": chunk}
        if thread_ts and _is_valid_timestamp(thread_ts):
            params["thread_ts"] = thread_ts
        client.chat_postMessage(**params)


# Max file size for S3-fetched artifacts (Lambda memory guard: 10 MB matches Slack workspace limit)
_MAX_S3_FILE_FETCH_BYTES = 10 * 1024 * 1024

FILE_POST_ERROR_MESSAGE = "ファイルの投稿に失敗しました。しばらくしてからお試しください。"


def _post_file(
    client: WebClient,
    channel: str,
    file_bytes: bytes,
    file_name: str,
    mime_type: str,
    thread_ts: Optional[str],
) -> None:
    """Post file bytes to Slack via files.upload_v2."""
    params: dict = {
        "channel": channel,
        "filename": file_name,
        "content": file_bytes,
        "title": file_name,
    }
    if thread_ts and _is_valid_timestamp(thread_ts):
        params["thread_ts"] = thread_ts
    try:
        client.files_upload_v2(**params)
    except SlackApiError:
        _post_text(client, channel, FILE_POST_ERROR_MESSAGE, thread_ts)
        raise


def _swap_reaction_to_checkmark(
    client: WebClient,
    channel: str,
    message_ts: str,
) -> None:
    """
    Remove eyes reaction and add white_check_mark on the message.
    Non-blocking: logs and continues on failure (e.g. reaction already removed).
    """
    if not channel or not message_ts or not _is_valid_timestamp(message_ts):
        return
    try:
        client.reactions_remove(channel=channel, name="eyes", timestamp=message_ts)
        _log("INFO", "reaction_removed", {"channel": channel, "emoji": "eyes"})
    except SlackApiError as e:
        err = e.response.get("error", "")
        if err == "no_reaction":
            pass  # Eyes already removed or never added
        else:
            _log("WARN", "reaction_remove_failed", {"channel": channel, "error": err})
    except Exception as e:
        _log("WARN", "reaction_remove_error", {"channel": channel, "error": str(e)})
    try:
        client.reactions_add(channel=channel, name="white_check_mark", timestamp=message_ts)
        _log("INFO", "reaction_added", {"channel": channel, "emoji": "white_check_mark"})
    except SlackApiError as e:
        err = e.response.get("error", "")
        if err == "already_reacted":
            pass
        else:
            _log("WARN", "reaction_add_failed", {"channel": channel, "error": err})
    except Exception as e:
        _log("WARN", "reaction_add_error", {"channel": channel, "error": str(e)})


def _process_one(body: dict) -> None:
    channel = (body.get("channel") or "").strip()
    bot_token = (body.get("bot_token") or "").strip()
    if not channel or not bot_token or not bot_token.startswith("xoxb-"):
        raise ValueError("channel and bot_token (xoxb-*) are required")

    thread_ts = body.get("thread_ts")
    if thread_ts is not None and not isinstance(thread_ts, str):
        thread_ts = None
    message_ts = body.get("message_ts")
    if message_ts is not None and not isinstance(message_ts, str):
        message_ts = None
    # Fallback: for root messages, thread_ts equals the message with eyes
    reaction_ts = message_ts if _is_valid_timestamp(message_ts or "") else (thread_ts if _is_valid_timestamp(thread_ts or "") else None)

    text = body.get("text")
    file_artifact = body.get("file_artifact")
    if not text and not file_artifact:
        raise ValueError("at least one of text or file_artifact is required")

    client = WebClient(token=bot_token)
    if text and isinstance(text, str) and text.strip():
        _post_text(client, channel, text.strip(), thread_ts)
    if file_artifact and isinstance(file_artifact, dict):
        name = file_artifact.get("fileName")
        mime = file_artifact.get("mimeType")
        if not name or not mime:
            raise ValueError("file_artifact must have fileName and mimeType")
        s3_url = file_artifact.get("s3PresignedUrl")
        b64 = file_artifact.get("contentBase64")
        correlation_id = body.get("correlation_id", "")
        if s3_url:
            # Validate URL scheme and host to prevent SSRF
            parsed = urlparse(s3_url)
            if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".amazonaws.com"):
                raise ValueError(f"s3PresignedUrl must be an HTTPS URL on amazonaws.com, got: {parsed.scheme}://{parsed.hostname}")
            try:
                with urllib.request.urlopen(s3_url, timeout=60) as resp:
                    file_bytes = resp.read(_MAX_S3_FILE_FETCH_BYTES + 1)
                if len(file_bytes) > _MAX_S3_FILE_FETCH_BYTES:
                    raise ValueError(
                        f"S3 file exceeds max size ({_MAX_S3_FILE_FETCH_BYTES} bytes)"
                    )
                _log("INFO", "file_artifact_fetched_from_s3", {
                    "artifact_type": "s3",
                    "correlation_id": correlation_id,
                    "size_bytes": len(file_bytes),
                })
                _post_file(client, channel, file_bytes, name, mime, thread_ts)
            except Exception as e:
                _log("ERROR", "file_artifact_s3_fetch_failed", {
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "artifact_type": "s3",
                    "correlation_id": correlation_id,
                })
                _post_text(client, channel, FILE_POST_ERROR_MESSAGE, thread_ts)
                raise
        elif b64:
            try:
                file_bytes = base64.b64decode(b64)
            except Exception as decode_err:
                _log("ERROR", "file_artifact_inline_decode_failed", {
                    "error": str(decode_err),
                    "correlation_id": correlation_id,
                })
                _post_text(client, channel, FILE_POST_ERROR_MESSAGE, thread_ts)
                raise ValueError(f"Failed to decode contentBase64: {decode_err}") from decode_err
            _log("INFO", "file_artifact_inline_used", {
                "artifact_type": "inline",
                "correlation_id": correlation_id,
                "size_bytes": len(file_bytes),
            })
            _post_file(client, channel, file_bytes, name, mime, thread_ts)
        else:
            raise ValueError("file_artifact must have s3PresignedUrl or contentBase64")

    # Swap eyes -> checkmark on the original message (done after successful post)
    if reaction_ts:
        _swap_reaction_to_checkmark(client, channel, reaction_ts)


def lambda_handler(event: dict, context: Any) -> dict:
    """
    Process SQS records: each record body is a Slack post request (JSON).
    Returns batchItemFailures for failed message IDs.
    """
    batch_item_failures: List[dict] = []
    for record in event.get("Records", []):
        msg_id = record.get("messageId", "")
        correlation_id = ""
        channel = ""
        try:
            body_str = record.get("body", "{}")
            try:
                body = json.loads(body_str)
            except json.JSONDecodeError as e:
                _log("ERROR", "slack_post_body_parse_error", {
                    "message_id": msg_id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                })
                batch_item_failures.append({"itemIdentifier": msg_id})
                continue
            correlation_id = body.get("correlation_id", "")
            channel = body.get("channel", "")
            text = body.get("text")
            file_artifact = body.get("file_artifact")

            _log("INFO", "slack_post_started", {
                "message_id": msg_id,
                "channel": channel,
                "correlation_id": correlation_id,
                "text_length": len(text) if text else 0,
                "has_file_artifact": file_artifact is not None,
                "has_thread_ts": bool(body.get("thread_ts")),
            })

            post_start = time.time()
            _process_one(body)
            post_duration_ms = (time.time() - post_start) * 1000

            _log("INFO", "slack_post_success", {
                "message_id": msg_id,
                "channel": channel,
                "correlation_id": correlation_id,
                "duration_ms": round(post_duration_ms, 2),
            })
        except Exception as e:
            _log("ERROR", "slack_post_failed", {
                "message_id": msg_id,
                "channel": channel,
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc(),
            })
            batch_item_failures.append({"itemIdentifier": msg_id})
    return {"batchItemFailures": batch_item_failures}
