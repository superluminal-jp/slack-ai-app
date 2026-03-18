"""
Usage history persistence module.

Writes usage records for every Verification Agent request.
Fail-open: any exception is logged as WARNING and silently swallowed —
write failures must never block user responses (Constitution IV).

Architecture (confidentiality separation):
  S3 content/ prefix  — input/output text (sensitive; write-only from agent)
  S3 attachments/     — attachment files copied from temp exchange bucket
  DynamoDB            — metadata + s3_content_prefix pointer (no text content)
"""

import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import boto3

_logger = logging.getLogger(__name__)

# Default retention period in days (aligned with DynamoDB TTL and S3 lifecycle)
_DEFAULT_TTL_DAYS = 90


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass
class PipelineResult:
    existence_check: bool = True
    authorization: bool = True
    rate_limited: bool = False
    rejection_stage: str = ""
    rejection_reason: str = ""


@dataclass
class OrchestrationResult:
    agents_called: List[str] = field(default_factory=list)
    turns_used: int = 0
    success: bool = True


@dataclass
class UsageRecord:
    channel_id: str
    correlation_id: str
    team_id: str = ""
    user_id: str = ""
    # Written to S3 only — NEVER stored in DynamoDB (confidentiality separation)
    input_text: str = ""
    output_text: str = ""
    pipeline_result: PipelineResult = field(default_factory=PipelineResult)
    orchestration: Optional[OrchestrationResult] = None
    duration_ms: int = 0
    # Temp S3 keys from s3_file_manager to copy into history bucket
    attachment_keys: List[str] = field(default_factory=list)
    skipped_attachments: List[dict] = field(default_factory=list)
    ttl_days: int = _DEFAULT_TTL_DAYS


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _date_path() -> str:
    """Return YYYY/MM/DD for today (UTC)."""
    return datetime.now(timezone.utc).strftime("%Y/%m/%d")


def _content_prefix(channel_id: str, correlation_id: str) -> str:
    return f"content/{channel_id}/{_date_path()}/{correlation_id}/"


def _attachment_dest_key(channel_id: str, correlation_id: str, src_key: str) -> str:
    """Derive destination key preserving original filename from source key."""
    filename = src_key.split("/")[-1]
    return f"attachments/{channel_id}/{_date_path()}/{correlation_id}/{filename}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def save(
    table_name: str,
    history_bucket: str,
    temp_bucket: str,
    record: UsageRecord,
) -> None:
    """
    Write usage history. Fail-open — never raises.

    Steps:
    1. s3.put_object content/.../input.json   (if input_text non-empty)
    2. s3.put_object content/.../output.json  (if output_text non-empty)
    3. s3.copy_object per attachment key      (temp_bucket → history_bucket)
    4. dynamodb.put_item metadata + s3_content_prefix (NO input_text/output_text)
    """
    try:
        # Ensure correlation_id is non-empty
        correlation_id = record.correlation_id
        if not correlation_id:
            correlation_id = str(uuid.uuid4())
            _logger.warning(
                "usage_history.save: correlation_id was empty, generated fallback",
                extra={"correlation_id": correlation_id},
            )

        region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION", "ap-northeast-1")
        s3 = boto3.client("s3", region_name=region)
        dynamodb = boto3.client("dynamodb", region_name=region)

        channel_id = record.channel_id
        prefix = _content_prefix(channel_id, correlation_id)

        # ------------------------------------------------------------------
        # 1+2. Write text content to S3 (confidentiality separation)
        # ------------------------------------------------------------------
        if record.input_text:
            try:
                s3.put_object(
                    Bucket=history_bucket,
                    Key=f"{prefix}input.json",
                    Body=json.dumps({"text": record.input_text}).encode("utf-8"),
                    ContentType="application/json",
                )
            except Exception as exc:
                _logger.warning(
                    "usage_history: failed to write input.json to S3",
                    extra={
                        "correlation_id": correlation_id,
                        "error": str(exc),
                        "error_type": type(exc).__name__,
                    },
                )

        if record.output_text:
            try:
                s3.put_object(
                    Bucket=history_bucket,
                    Key=f"{prefix}output.json",
                    Body=json.dumps({"text": record.output_text}).encode("utf-8"),
                    ContentType="application/json",
                )
            except Exception as exc:
                _logger.warning(
                    "usage_history: failed to write output.json to S3",
                    extra={
                        "correlation_id": correlation_id,
                        "error": str(exc),
                        "error_type": type(exc).__name__,
                    },
                )

        # ------------------------------------------------------------------
        # 3. Copy attachments from temp exchange bucket to history bucket
        # ------------------------------------------------------------------
        saved_attachment_keys: List[str] = []
        skipped: List[dict] = []

        for src_key in record.attachment_keys:
            dest_key = _attachment_dest_key(channel_id, correlation_id, src_key)
            try:
                s3.copy_object(
                    CopySource={"Bucket": temp_bucket, "Key": src_key},
                    Bucket=history_bucket,
                    Key=dest_key,
                )
                saved_attachment_keys.append(dest_key)
            except Exception as exc:
                reason = f"{type(exc).__name__}: {exc}"
                _logger.warning(
                    "usage_history: failed to copy attachment",
                    extra={
                        "correlation_id": correlation_id,
                        "src_key": src_key,
                        "error": str(exc),
                        "error_type": type(exc).__name__,
                    },
                )
                skipped.append({"key": src_key, "reason": reason})

        record.skipped_attachments = skipped

        # ------------------------------------------------------------------
        # 4. Write metadata to DynamoDB (NO input_text / output_text)
        # ------------------------------------------------------------------
        now = datetime.now(timezone.utc)
        ttl_epoch = int((now + timedelta(days=record.ttl_days)).timestamp())
        request_id = f"{int(now.timestamp() * 1000)}#{correlation_id}"

        pipeline = record.pipeline_result
        pipeline_item = {
            "M": {
                "existence_check": {"BOOL": pipeline.existence_check},
                "authorization": {"BOOL": pipeline.authorization},
                "rate_limited": {"BOOL": pipeline.rate_limited},
                "rejection_stage": {"S": pipeline.rejection_stage},
                "rejection_reason": {"S": pipeline.rejection_reason},
            }
        }

        item: dict = {
            "channel_id": {"S": channel_id},
            "request_id": {"S": request_id},
            "correlation_id": {"S": correlation_id},
            "team_id": {"S": record.team_id},
            "user_id": {"S": record.user_id},
            "created_at": {"S": now.isoformat()},
            "s3_content_prefix": {"S": prefix},
            "pipeline_result": pipeline_item,
            "duration_ms": {"N": str(record.duration_ms)},
            "attachment_keys": {
                "L": [{"S": k} for k in saved_attachment_keys]
            },
            "skipped_attachments": {
                "L": [
                    {"M": {"key": {"S": s["key"]}, "reason": {"S": s["reason"]}}}
                    for s in skipped
                ]
            },
            "ttl": {"N": str(ttl_epoch)},
        }

        if record.orchestration:
            orch = record.orchestration
            item["orchestration"] = {
                "M": {
                    "agents_called": {
                        "L": [{"S": a} for a in orch.agents_called]
                    },
                    "turns_used": {"N": str(orch.turns_used)},
                    "success": {"BOOL": orch.success},
                }
            }

        try:
            dynamodb.put_item(TableName=table_name, Item=item)
        except Exception as exc:
            _logger.warning(
                "usage_history: failed to write DynamoDB record",
                extra={
                    "correlation_id": correlation_id,
                    "error": str(exc),
                    "error_type": type(exc).__name__,
                },
            )

    except Exception as exc:
        _logger.warning(
            "usage_history.save: unexpected error (fail-open)",
            extra={
                "error": str(exc),
                "error_type": type(exc).__name__,
            },
        )
