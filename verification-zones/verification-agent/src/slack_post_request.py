"""
Send Slack post requests to SQS for Slack Poster Lambda (019, 028).

Verification Agent does not call Slack API directly. It enqueues a structured
message to SLACK_POST_REQUEST_QUEUE_URL. Slack Poster Lambda consumes and posts.

file_artifact supports two delivery modes (028):
  - inline: contentBase64 + fileName + mimeType (files <= 200 KB)
  - s3: s3PresignedUrl + fileName + mimeType (files > 200 KB)
"""

import base64
import json
import os
import traceback
from typing import Optional

import boto3

from logger_util import get_logger, log

_logger = get_logger()


def _log(level: str, event: str, data: Optional[dict] = None) -> None:
    log(_logger, level, event, data or {}, service="verification-agent")


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
    """Build inline file_artifact dict for SQS message (contentBase64, fileName, mimeType).

    Args:
        file_bytes: Raw file content. Must be non-empty bytes.
        file_name: Display filename (e.g. "report.csv").
        mime_type: MIME type (e.g. "text/csv").

    Raises:
        ValueError: If any required field is missing or invalid.
    """
    if not isinstance(file_bytes, bytes) or not file_bytes:
        raise ValueError("file_bytes must be non-empty bytes")
    if not file_name or not isinstance(file_name, str):
        raise ValueError("file_name must be a non-empty string")
    if not mime_type or not isinstance(mime_type, str):
        raise ValueError("mime_type must be a non-empty string")
    return {
        "contentBase64": base64.b64encode(file_bytes).decode("utf-8"),
        "fileName": file_name,
        "mimeType": mime_type,
    }


def build_file_artifact_s3(
    s3_presigned_url: str, file_name: str, mime_type: str
) -> dict:
    """Build S3-backed file_artifact dict for SQS message (028).

    Used for large files (> 200 KB) to bypass SQS 256 KB limit.
    Contains s3PresignedUrl instead of contentBase64.

    Args:
        s3_presigned_url: Pre-signed HTTPS URL for the S3 object.
        file_name: Display filename (e.g. "report.xlsx").
        mime_type: MIME type (e.g. "application/vnd.openxmlformats-...").

    Raises:
        ValueError: If any required field is missing or invalid.
    """
    if not s3_presigned_url or not isinstance(s3_presigned_url, str):
        raise ValueError("s3_presigned_url must be a non-empty string")
    if not s3_presigned_url.startswith("https://"):
        raise ValueError("s3_presigned_url must be an HTTPS URL")
    if not file_name or not isinstance(file_name, str):
        raise ValueError("file_name must be a non-empty string")
    if not mime_type or not isinstance(mime_type, str):
        raise ValueError("mime_type must be a non-empty string")
    return {
        "s3PresignedUrl": s3_presigned_url,
        "fileName": file_name,
        "mimeType": mime_type,
    }
