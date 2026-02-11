"""
019: Send Slack post requests to SQS for Slack Poster Lambda.

Verification Agent does not call Slack API. It enqueues a structured message
(specs/019-slack-poster-separation/contracts/slack-post-request.md) to
SLACK_POST_REQUEST_QUEUE_URL. Slack Poster Lambda consumes and posts.
"""

import base64
import json
import os
import time
import traceback
from typing import Any, Optional

import boto3


def _log(level: str, event: str, data: Optional[dict] = None) -> None:
    entry = {
        "level": level,
        "event_type": event,
        "service": "verification-agent",
        "timestamp": time.time(),
    }
    if data:
        entry.update(data)
    print(json.dumps(entry, default=str))


def send_slack_post_request(
    channel: str,
    thread_ts: Optional[str],
    *,
    text: Optional[str] = None,
    file_artifact: Optional[dict] = None,
    bot_token: Optional[str] = None,
    correlation_id: str = "",
    message_ts: Optional[str] = None,
) -> None:
    """
    Enqueue a Slack post request to SQS. No-op if SLACK_POST_REQUEST_QUEUE_URL
    is unset or if channel/bot_token are missing for posting.
    """
    queue_url = (os.environ.get("SLACK_POST_REQUEST_QUEUE_URL") or "").strip()
    if not queue_url:
        _log("WARN", "slack_post_request_skipped", {"reason": "SLACK_POST_REQUEST_QUEUE_URL not set"})
        return
    if not channel or not bot_token or not bot_token.strip():
        _log("WARN", "slack_post_request_skipped", {"reason": "channel or bot_token missing"})
        return
    if not text and not file_artifact:
        _log("WARN", "slack_post_request_skipped", {"reason": "no text or file_artifact"})
        return

    body = {
        "channel": channel,
        "thread_ts": thread_ts,
        "message_ts": message_ts,
        "text": (text or "").strip() or None,
        "file_artifact": file_artifact,
        "bot_token": bot_token,
        "correlation_id": correlation_id,
    }
    if not body["text"] and not body["file_artifact"]:
        return
    try:
        region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
        sqs = boto3.client("sqs", region_name=region)
        sqs.send_message(QueueUrl=queue_url, MessageBody=json.dumps(body))
        _log("INFO", "slack_post_request_enqueued", {"channel": channel, "correlation_id": correlation_id})
    except Exception as e:
        _log("ERROR", "slack_post_request_enqueue_failed", {
            "channel": channel,
            "correlation_id": correlation_id,
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc(),
        })
        raise


def build_file_artifact(file_bytes: bytes, file_name: str, mime_type: str) -> dict:
    """Build file_artifact dict for SQS message (contentBase64, fileName, mimeType)."""
    return {
        "contentBase64": base64.b64encode(file_bytes).decode("utf-8"),
        "fileName": file_name,
        "mimeType": mime_type,
    }
