"""
S3 file manager for temporary file exchange between verification and execution zones.

Two prefixes:
  - attachments/{correlation_id}/{file_id}/{file_name} — Slack → Execution Agent (024)
  - generated_files/{correlation_id}/{file_name} — Execution Agent → Slack (028)

028: Large file artifacts (> 200 KB) are uploaded under generated_files/ and delivered
to Slack Poster via pre-signed URL in the SQS message (bypasses SQS 256 KB limit).

Pre-signed URL expiry: 15 min (default). Lifecycle: 1-day safety net on both prefixes.
"""

import os
import re
import time

import boto3
from botocore.exceptions import ClientError

from logger_util import get_logger, log

# Default prefix and expiry; overridable via env (set by CDK)
FILE_EXCHANGE_PREFIX = os.environ.get("FILE_EXCHANGE_PREFIX", "attachments/")
PRESIGNED_URL_EXPIRY_DEFAULT = int(os.environ.get("PRESIGNED_URL_EXPIRY", "900"))

# 028: Prefix for generated files (Execution → Slack, large file artifact)
GENERATED_FILES_PREFIX = "generated_files/"

# 027: Windows forbidden chars for S3 key sanitization
_FORBIDDEN_CHARS_RE = re.compile(r'[\\/:*?"<>|]')

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging with correlation_id when available."""
    log(_logger, level, event_type, data, service="verification-agent-s3-file-manager")


def _get_bucket_name() -> str:
    """Return FILE_EXCHANGE_BUCKET from environment (set by CDK)."""
    name = os.environ.get("FILE_EXCHANGE_BUCKET", "").strip()
    if not name:
        raise ValueError(
            "FILE_EXCHANGE_BUCKET environment variable is required for S3 file exchange."
        )
    return name


def _s3_client():
    """Get boto3 S3 client (new each time to avoid thread/env issues)."""
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"))


def _sanitize_filename_for_s3(filename: str) -> str:
    """
    Sanitize filename for S3 key (028, per 027: control chars, Windows forbidden chars).

    Removes control chars (0x00–0x1F), replaces \\ / : * ? " < > | with _,
    strips leading/trailing spaces and dots. Fallback to generated_file_{timestamp} when empty.
    """
    if not filename or not isinstance(filename, str):
        return f"generated_file_{int(time.time())}"
    sanitized = "".join(c for c in filename if ord(c) >= 0x20)
    sanitized = _FORBIDDEN_CHARS_RE.sub("_", sanitized)
    sanitized = sanitized.strip(" \t\n\r.")
    if not sanitized:
        return f"generated_file_{int(time.time())}"
    return sanitized


def upload_generated_file_to_s3(
    file_bytes: bytes,
    correlation_id: str,
    file_name: str,
    mime_type: str,
) -> str:
    """
    Upload generated file bytes to S3 under generated_files/{correlation_id}/{sanitized_file_name}.

    Used for large file artifacts (> 200 KB) to bypass SQS 256 KB limit (028).

    Args:
        file_bytes: Raw file content.
        correlation_id: Request correlation ID for grouping and lifecycle.
        file_name: Original filename (sanitized for S3 key).
        mime_type: MIME type for ContentType.

    Returns:
        S3 object key (e.g. generated_files/corr-uuid/report.pdf).

    Raises:
        ValueError: If FILE_EXCHANGE_BUCKET is not set.
        ClientError: On S3 PutObject failure.
    """
    if not file_bytes:
        raise ValueError("file_bytes must not be empty")
    if not correlation_id or not isinstance(correlation_id, str):
        raise ValueError("correlation_id must be a non-empty string")

    bucket = _get_bucket_name()
    safe_name = _sanitize_filename_for_s3(file_name)
    key = f"{GENERATED_FILES_PREFIX}{correlation_id}/{safe_name}"

    try:
        client = _s3_client()
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=file_bytes,
            ContentType=mime_type or "application/octet-stream",
        )
    except ClientError as e:
        _log("ERROR", "s3_upload_generated_file_failed", {
            "correlation_id": correlation_id,
            "key": key,
            "size": len(file_bytes),
            "error": str(e),
            "error_code": e.response.get("Error", {}).get("Code"),
        })
        raise

    _log("INFO", "s3_upload_generated_file_success", {
        "correlation_id": correlation_id,
        "key": key,
        "size": len(file_bytes),
    })

    return key


def generate_presigned_url_for_generated_file(
    s3_key: str,
    expiry: int = PRESIGNED_URL_EXPIRY_DEFAULT,
) -> str:
    """
    Generate a pre-signed GET URL for a generated file in S3 (028).

    Reuses generate_presigned_url logic; same expiry (15 min default).

    Args:
        s3_key: S3 object key from upload_generated_file_to_s3.
        expiry: URL validity in seconds (default 900).

    Returns:
        HTTPS pre-signed URL string.
    """
    return generate_presigned_url(s3_key, expiry)


def upload_file_to_s3(
    file_bytes: bytes,
    correlation_id: str,
    file_id: str,
    file_name: str,
    mimetype: str,
) -> str:
    """
    Upload file bytes to S3 under attachments/{correlation_id}/{file_id}/{file_name}.

    Args:
        file_bytes: Raw file content.
        correlation_id: Request correlation ID for grouping and cleanup.
        file_id: Slack file ID (e.g. F01234567).
        file_name: Original filename.
        mimetype: MIME type for ContentType.

    Returns:
        S3 object key (e.g. attachments/corr-uuid/F1/report.pdf).

    Raises:
        ValueError: If FILE_EXCHANGE_BUCKET is not set.
        ClientError: On S3 PutObject failure.
    """
    bucket = _get_bucket_name()
    prefix = FILE_EXCHANGE_PREFIX.rstrip("/")
    key = f"{prefix}/{correlation_id}/{file_id}/{file_name}"

    try:
        client = _s3_client()
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=file_bytes,
            ContentType=mimetype or "application/octet-stream",
        )
    except ClientError as e:
        _log("ERROR", "s3_upload_failed", {
            "correlation_id": correlation_id,
            "file_id": file_id,
            "key": key,
            "size": len(file_bytes),
            "error": str(e),
            "error_code": e.response.get("Error", {}).get("Code"),
        })
        raise

    _log("INFO", "s3_upload_success", {
        "correlation_id": correlation_id,
        "file_id": file_id,
        "key": key,
        "size": len(file_bytes),
    })

    return key


def generate_presigned_url(s3_key: str, expiry: int = PRESIGNED_URL_EXPIRY_DEFAULT) -> str:
    """
    Generate a pre-signed GET URL for the S3 object.

    Args:
        s3_key: S3 object key returned by upload_file_to_s3.
        expiry: URL validity in seconds (default from PRESIGNED_URL_EXPIRY env, else 900).

    Returns:
        HTTPS pre-signed URL string.

    Raises:
        ValueError: If FILE_EXCHANGE_BUCKET is not set or s3_key is empty.
    """
    if not s3_key or not isinstance(s3_key, str):
        raise ValueError("s3_key must be a non-empty string")
    bucket = _get_bucket_name()
    client = _s3_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": s3_key},
        ExpiresIn=expiry,
    )
    return url


def cleanup_request_files(correlation_id: str) -> None:
    """
    List and delete all S3 objects under attachments/{correlation_id}/.

    Idempotent: no error if prefix has no objects. Logs and continues on delete failure.

    Args:
        correlation_id: Request correlation ID used during upload.
    """
    bucket = _get_bucket_name()
    prefix = FILE_EXCHANGE_PREFIX.rstrip("/")
    list_prefix = f"{prefix}/{correlation_id}/"

    client = _s3_client()

    try:
        paginator = client.get_paginator("list_objects_v2")
        keys_to_delete = []
        for page in paginator.paginate(Bucket=bucket, Prefix=list_prefix):
            for obj in page.get("Contents") or []:
                keys_to_delete.append({"Key": obj["Key"]})

        if not keys_to_delete:
            _log("INFO", "s3_cleanup_no_objects", {
                "correlation_id": correlation_id,
                "prefix": list_prefix,
            })
            return

        # delete_objects accepts up to 1000 keys per request
        for i in range(0, len(keys_to_delete), 1000):
            batch = keys_to_delete[i : i + 1000]
            client.delete_objects(
                Bucket=bucket,
                Delete={"Objects": batch, "Quiet": True},
            )

        _log("INFO", "s3_cleanup_success", {
            "correlation_id": correlation_id,
            "deleted_count": len(keys_to_delete),
        })

    except ClientError as e:
        _log("ERROR", "s3_cleanup_error", {
            "correlation_id": correlation_id,
            "error": str(e),
            "error_code": e.response.get("Error", {}).get("Code"),
        })
        raise
