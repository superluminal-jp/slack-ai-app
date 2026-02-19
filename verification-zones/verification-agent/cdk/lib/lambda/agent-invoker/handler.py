"""
Agent Invoker Lambda (016): consumes SQS messages and invokes Verification Agent via InvokeAgentRuntime.

Follows AWS documentation:
- Invoke an AgentCore Runtime agent: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html
- InvokeAgentRuntime API: https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html

Processes agent-invocation-request queue; builds payload with "prompt" (per doc example),
calls bedrock-agentcore invoke_agent_runtime with agentRuntimeArn, runtimeSessionId (UUID,
min 33 chars per API), and binary payload. Implements retry with exponential backoff for
ThrottlingException per AWS best practices.
"""

import json
import os
import time
import traceback
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

# Retry config for ThrottlingException (per InvokeAgentRuntime best practices)
_MAX_RETRIES = 3
_INITIAL_BACKOFF_SEC = 1.0
_BACKOFF_MULTIPLIER = 2.0


def lambda_handler(event, context):
    """
    Process SQS event: for each record, parse Body as AgentInvocationRequest, call InvokeAgentRuntime.

    Returns:
        dict with "batchItemFailures" list of { "itemIdentifier": message_id } for failed records.
    """
    batch_item_failures = []
    request_id = str(getattr(context, "aws_request_id", "") or "") if context else ""

    for record in event.get("Records", []):
        message_id = record.get("messageId", "")
        correlation_id = request_id
        try:
            body_str = record.get("body", "{}")
            try:
                task_data = json.loads(body_str)
            except (json.JSONDecodeError, TypeError) as e:
                _log("error", "payload_parse_error", {
                    "message_id": message_id,
                    "request_id": request_id,
                    "correlation_id": correlation_id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                })
                batch_item_failures.append({"itemIdentifier": message_id})
                continue

            channel = task_data.get("channel", "")
            text = task_data.get("text", "")
            thread_ts = task_data.get("thread_ts")
            bot_token = task_data.get("bot_token")
            attachments = task_data.get("attachments", [])
            correlation_id = task_data.get("correlation_id", request_id)
            team_id = task_data.get("team_id", "")
            user_id = task_data.get("user_id", "")
            event_id = task_data.get("event_id", "")

            # Payload format per AWS doc: {"prompt": ...} (binary-encoded)
            a2a_payload = {"prompt": json.dumps(task_data)}
            agent_arn = os.environ.get("VERIFICATION_AGENT_ARN", "").strip()
            if not agent_arn:
                raise ValueError("VERIFICATION_AGENT_ARN is not set")

            region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
            client = boto3.client("bedrock-agentcore", region_name=region)
            # Session ID: UUID recommended by AWS; API requires length 33–256
            session_id = str(uuid.uuid4())
            payload_bytes = json.dumps(a2a_payload).encode("utf-8")

            _log("info", "agent_invocation_started", {
                "message_id": message_id,
                "channel": channel,
                "text_length": len(text),
                "attachment_count": len(attachments),
                "has_thread_ts": bool(thread_ts),
                "session_id": session_id,
                "request_id": request_id,
                "correlation_id": correlation_id,
            })

            invoke_start = time.time()
            _invoke_with_retry(
                client=client,
                agent_runtime_arn=agent_arn,
                runtime_session_id=session_id,
                payload=payload_bytes,
                request_id=request_id,
                correlation_id=correlation_id,
            )
            invoke_duration_ms = (time.time() - invoke_start) * 1000

            _log("info", "agent_invocation_success", {
                "message_id": message_id,
                "channel": channel,
                "session_id": session_id,
                "request_id": request_id,
                "correlation_id": correlation_id,
                "duration_ms": round(invoke_duration_ms, 2),
            })

        except Exception as e:
            _log_invocation_failure(
                message_id=message_id,
                request_id=request_id,
                correlation_id=correlation_id,
                error=e,
            )
            batch_item_failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": batch_item_failures}


def _invoke_with_retry(
    client,
    agent_runtime_arn: str,
    runtime_session_id: str,
    payload: bytes,
    request_id: str = "",
    correlation_id: str = "",
) -> None:
    """
    Call InvokeAgentRuntime with exponential backoff on ThrottlingException.

    Per AWS: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html
    """
    last_error = None
    for attempt in range(_MAX_RETRIES):
        try:
            client.invoke_agent_runtime(
                agentRuntimeArn=agent_runtime_arn,
                runtimeSessionId=runtime_session_id,
                payload=payload,
            )
            return
        except ClientError as e:
            last_error = e
            if e.response["Error"]["Code"] != "ThrottlingException":
                raise
            if attempt == _MAX_RETRIES - 1:
                raise
            delay = _INITIAL_BACKOFF_SEC * (_BACKOFF_MULTIPLIER ** attempt)
            _log("warn", "invoke_retry_throttling", {
                "request_id": request_id,
                "correlation_id": correlation_id,
                "attempt": attempt + 1,
                "max_retries": _MAX_RETRIES,
                "delay_seconds": delay,
                "error_code": e.response["Error"]["Code"],
            })
            time.sleep(delay)
    if last_error:
        raise last_error


def _log_invocation_failure(
    message_id: str,
    request_id: str,
    correlation_id: str,
    error: Exception,
) -> None:
    """Log agent_invocation_failed with structured error details for CloudWatch/troubleshooting."""
    data = {
        "message_id": message_id,
        "request_id": request_id,
        "correlation_id": correlation_id,
        "error": str(error),
        "error_type": type(error).__name__,
        "traceback": traceback.format_exc(),
    }
    if isinstance(error, ClientError):
        err = error.response.get("Error", {})
        data["error_code"] = err.get("Code", "")
        data["error_message"] = err.get("Message", "")
        if "ResponseMetadata" in error.response:
            http = error.response["ResponseMetadata"].get("HTTPStatusCode")
            if http is not None:
                data["http_status"] = http
    _log("error", "agent_invocation_failed", data)


def _log(level: str, event: str, data: dict) -> None:
    """Structured JSON log for CloudWatch (correlation_id / request_id for traceability)."""
    entry = {
        "level": level.upper(),
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        **data,
    }
    print(json.dumps(entry, default=str))
