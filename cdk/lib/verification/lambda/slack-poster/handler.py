"""
Slack Poster Lambda (019): consumes SQS messages from Verification Agent and posts to Slack.

Verification Agent no longer calls Slack API; it sends a structured "post request" to this
queue. This Lambda performs the actual chat.postMessage and files.upload.

Message body (JSON): channel, thread_ts?, text?, file_artifact?, bot_token, correlation_id?
See specs/019-slack-poster-separation/contracts/slack-post-request.md.
"""

import base64
import json
import re
import time
import traceback
from typing import Any, List, Optional

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


def _log(level: str, event: str, data: Optional[dict] = None) -> None:
    entry = {"level": level, "event": event, "service": "slack-poster"}
    if data:
        entry.update(data)
    print(json.dumps(entry, default=str))


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


FILE_POST_ERROR_MESSAGE = "ファイルの投稿に失敗しました。しばらくしてからお試しください。"


def _post_file(
    client: WebClient,
    channel: str,
    content_base64: str,
    file_name: str,
    mime_type: str,
    thread_ts: Optional[str],
) -> None:
    file_bytes = base64.b64decode(content_base64)
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


def _process_one(body: dict) -> None:
    channel = (body.get("channel") or "").strip()
    bot_token = (body.get("bot_token") or "").strip()
    if not channel or not bot_token or not bot_token.startswith("xoxb-"):
        raise ValueError("channel and bot_token (xoxb-*) are required")

    thread_ts = body.get("thread_ts")
    if thread_ts is not None and not isinstance(thread_ts, str):
        thread_ts = None
    text = body.get("text")
    file_artifact = body.get("file_artifact")
    if not text and not file_artifact:
        raise ValueError("at least one of text or file_artifact is required")

    client = WebClient(token=bot_token)
    if text and isinstance(text, str) and text.strip():
        _post_text(client, channel, text.strip(), thread_ts)
    if file_artifact and isinstance(file_artifact, dict):
        b64 = file_artifact.get("contentBase64")
        name = file_artifact.get("fileName")
        mime = file_artifact.get("mimeType")
        if b64 and name and mime:
            _post_file(client, channel, b64, name, mime, thread_ts)


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
