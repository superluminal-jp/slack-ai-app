"""
Error debug: write execution errors to CloudWatch Logs for troubleshooting.

When EXECUTION_AGENT_ERROR_LOG_GROUP is set, execution_agent_error details
(traceback, error type) are written to the specified log group so we can
diagnose failures even when container stdout is not visible.
"""

import json
import os
import time

import boto3
from botocore.exceptions import ClientError


def _get_logs_client():
    """Get CloudWatch Logs client."""
    region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
    return boto3.client("logs", region_name=region)


def log_execution_error(
    correlation_id: str,
    error: BaseException,
    traceback_str: str,
) -> None:
    """
    Write execution error details to CloudWatch Logs for debugging.

    Fails silently - does not raise. Uses EXECUTION_AGENT_ERROR_LOG_GROUP env.
    Uses unique stream per error to avoid sequence token races.
    """
    log_group = (os.environ.get("EXECUTION_AGENT_ERROR_LOG_GROUP") or "").strip()
    if not log_group:
        return

    try:
        client = _get_logs_client()
        ts_ms = int(time.time() * 1000)
        # Unique stream per error to avoid sequence token management
        stream_name = f"err-{correlation_id[:8]}-{ts_ms}"

        client.create_log_stream(
            logGroupName=log_group,
            logStreamName=stream_name,
        )

        event = {
            "correlation_id": correlation_id,
            "error_type": type(error).__name__,
            "error_message": str(error),
            "traceback": traceback_str,
        }
        message = json.dumps(event, ensure_ascii=False, default=str)

        client.put_log_events(
            logGroupName=log_group,
            logStreamName=stream_name,
            logEvents=[{"timestamp": ts_ms, "message": message}],
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceAlreadyExistsException":
            pass  # Ignore
    except Exception:
        pass  # Fail silently
