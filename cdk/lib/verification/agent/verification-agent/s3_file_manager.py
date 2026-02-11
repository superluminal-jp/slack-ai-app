"""
S3 file manager for temporary file exchange (verification zone → execution zone).

Uploads files to S3 after download from Slack; generates pre-signed GET URLs
for the execution agent. Cleans up objects after request completion.

S3 key structure: attachments/{correlation_id}/{file_id}/{file_name}
Per data-model and research: 15-min pre-signed URL expiry, 1-day lifecycle safety net.
"""

import json
import os
import time
from typing import Optional

import boto3
from botocore.exceptions import ClientError

# Default prefix and expiry; overridable via env (set by CDK)
FILE_EXCHANGE_PREFIX = os.environ.get("FILE_EXCHANGE_PREFIX", "attachments/")
PRESIGNED_URL_EXPIRY_DEFAULT = int(os.environ.get("PRESIGNED_URL_EXPIRY", "900"))


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging with correlation_id when available."""
    log_entry = {
        "level": level,
        "event_type": event_type,
        "service": "verification-agent-s3-file-manager",
        "timestamp": time.time(),
        **data,
    }
    print(json.dumps(log_entry, default=str))


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

    client = _s3_client()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=file_bytes,
        ContentType=mimetype or "application/octet-stream",
    )

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
        ValueError: If FILE_EXCHANGE_BUCKET is not set.
    """
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
