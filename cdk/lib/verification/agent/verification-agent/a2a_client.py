"""
A2A Client for invoking the Execution Agent via AgentCore Runtime.

Uses the InvokeAgentRuntime API with SigV4 authentication to send
JSON-RPC 2.0 messages to the Execution Agent.

Supports both synchronous and asynchronous response patterns:
- Synchronous: Execution Agent returns final result directly
- Asynchronous: Execution Agent returns "accepted" with task_id,
  then client polls for completion via GetAsyncTaskResult

Security: SigV4 authentication is handled automatically by boto3.
Tracing: correlation_id is passed through for end-to-end tracing.
"""

import json
import os
import time
import traceback
import uuid
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import ClientError

try:
    from error_debug import log_execution_error
except ImportError:
    log_execution_error = None

from logger_util import get_logger, log

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="verification-agent-a2a-client")


# Singleton boto3 client
_agentcore_client = None

# Async polling configuration
POLL_INTERVAL_SECONDS = 2.0
POLL_MAX_WAIT_SECONDS = 120.0  # Maximum total wait time for async tasks
POLL_BACKOFF_FACTOR = 1.5  # Increase interval after each poll

# InvokeAgentRuntime retry on ThrottlingException (AWS best practice)
INVOKE_RETRY_MAX_ATTEMPTS = 3
INVOKE_RETRY_BASE_DELAY_SECONDS = 1.0
INVOKE_RETRY_BACKOFF_FACTOR = 2.0


def _get_agentcore_client():
    """
    Get or create bedrock-agentcore boto3 client (singleton).

    Uses Data Plane client per InvokeAgentRuntime API:
    https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html
    """
    global _agentcore_client
    if _agentcore_client is None:
        region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
        _agentcore_client = boto3.client(
            "bedrock-agentcore",
            region_name=region,
        )
    return _agentcore_client


def _read_invoke_response(response: dict) -> str:
    """
    Read response body from InvokeAgentRuntime API response.

    API returns "response" (StreamingBody or chunks) and "contentType".
    See: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html
    """
    body = response.get("response")
    if body is None:
        return ""
    if hasattr(body, "read"):
        return body.read().decode("utf-8")
    if isinstance(body, (list, tuple)):
        return "".join(chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk) for chunk in body)
    if isinstance(body, str):
        return body
    return str(body)


def build_jsonrpc_request(task_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build a JSON-RPC 2.0 Request for execute_task (032-jsonrpc-zone-connection).

    Args:
        task_payload: Task payload (channel, text, bot_token, correlation_id, etc.)

    Returns:
        dict: JSON-RPC 2.0 Request with jsonrpc "2.0", method "execute_task", params, id (string UUID).
    """
    return {
        "jsonrpc": "2.0",
        "method": "execute_task",
        "params": task_payload,
        "id": str(uuid.uuid4()),
    }


def parse_jsonrpc_response(response_body: str, correlation_id: str = "") -> str:
    """
    Parse JSON-RPC 2.0 Response body and return the same JSON string shape as before (for pipeline).

    On success (result): returns json.dumps(result) so pipeline sees status, response_text, etc.
    On error (error): returns json.dumps({ status "error", error_code, error_message, correlation_id }).

    Args:
        response_body: Raw response body string (JSON-RPC 2.0 Response).
        correlation_id: Correlation ID to include in error payload when response has error.

    Returns:
        str: JSON string suitable for pipeline (result payload or error payload).
    """
    if not response_body or not response_body.strip():
        return json.dumps({
            "status": "error",
            "error_code": "invalid_response",
            "error_message": "空の応答を受信しました。",
            "correlation_id": correlation_id,
        })
    try:
        obj = json.loads(response_body)
    except (json.JSONDecodeError, ValueError):
        return json.dumps({
            "status": "error",
            "error_code": "invalid_response",
            "error_message": "応答の解析に失敗しました。",
            "correlation_id": correlation_id,
        })
    if "error" in obj:
        err = obj["error"]
        code = err.get("code", -32603)
        message = err.get("message", "Internal error")
        data = err.get("data") or {}
        cid = correlation_id or (data.get("correlation_id") if isinstance(data, dict) else "") or ""
        return json.dumps({
            "status": "error",
            "error_code": str(code),
            "error_message": message,
            "correlation_id": cid,
        })
    if "result" in obj:
        return json.dumps(obj["result"])
    return json.dumps({
        "status": "error",
        "error_code": "invalid_response",
        "error_message": "応答に result も error も含まれません。",
        "correlation_id": correlation_id,
    })


def _poll_async_task_result(
    agent_arn: str,
    task_id: str,
    correlation_id: str,
    max_wait_seconds: float = POLL_MAX_WAIT_SECONDS,
) -> str:
    """
    Poll for the result of an async task from the Execution Agent.

    Uses exponential backoff polling to wait for the background Bedrock
    processing to complete. The Execution Agent calls complete_async_task
    when done, which makes the result available via GetAsyncTaskResult.

    Args:
        agent_arn: ARN of the Execution Agent Runtime
        task_id: Async task ID returned by the Execution Agent
        correlation_id: Correlation ID for tracing
        max_wait_seconds: Maximum time to wait before giving up

    Returns:
        str: JSON string with the final task result
    """
    client = _get_agentcore_client()
    start_time = time.time()
    poll_interval = POLL_INTERVAL_SECONDS
    poll_count = 0

    _log("INFO", "async_poll_started", {
        "correlation_id": correlation_id,
        "task_id": task_id,
        "max_wait_seconds": max_wait_seconds,
    })

    while (time.time() - start_time) < max_wait_seconds:
        poll_count += 1
        time.sleep(poll_interval)

        try:
            result = client.get_async_task_result(
                agentRuntimeArn=agent_arn,
                taskId=task_id,
            )

            task_status = result.get("status", "")
            task_result = ""

            if "result" in result:
                body = result["result"]
                if hasattr(body, "read"):
                    task_result = body.read().decode("utf-8")
                elif isinstance(body, str):
                    task_result = body
                else:
                    task_result = str(body)

            if task_status == "completed":
                duration_ms = (time.time() - start_time) * 1000
                _log("INFO", "async_poll_completed", {
                    "correlation_id": correlation_id,
                    "task_id": task_id,
                    "poll_count": poll_count,
                    "duration_ms": round(duration_ms, 2),
                    "result_length": len(task_result),
                })
                return task_result

            elif task_status == "failed":
                _log("ERROR", "async_task_failed", {
                    "correlation_id": correlation_id,
                    "task_id": task_id,
                    "poll_count": poll_count,
                    "result": task_result[:500] if task_result else "",
                })
                return task_result if task_result else json.dumps({
                    "status": "error",
                    "error_code": "async_task_failed",
                    "error_message": "バックグラウンド処理が失敗しました。",
                    "correlation_id": correlation_id,
                })

            # Task still in progress — increase poll interval (backoff)
            poll_interval = min(poll_interval * POLL_BACKOFF_FACTOR, 10.0)

        except ClientError as e:
            error_code = e.response["Error"]["Code"]

            # Task not ready yet — keep polling
            if error_code in ("ResourceNotFoundException", "TaskNotReadyException"):
                poll_interval = min(poll_interval * POLL_BACKOFF_FACTOR, 10.0)
                continue

            _log("ERROR", "async_poll_api_error", {
                "correlation_id": correlation_id,
                "task_id": task_id,
                "error_code": error_code,
                "poll_count": poll_count,
            })
            return json.dumps({
                "status": "error",
                "error_code": "poll_error",
                "error_message": "非同期タスクの結果取得に失敗しました。",
                "correlation_id": correlation_id,
            })

        except Exception as e:
            _log("ERROR", "async_poll_unexpected_error", {
                "correlation_id": correlation_id,
                "task_id": task_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "poll_count": poll_count,
                "traceback": traceback.format_exc(),
            })
            return json.dumps({
                "status": "error",
                "error_code": "poll_error",
                "error_message": "非同期タスクの結果取得中にエラーが発生しました。",
                "correlation_id": correlation_id,
            })

    # Timeout — max wait exceeded
    duration_ms = (time.time() - start_time) * 1000
    _log("ERROR", "async_poll_timeout", {
        "correlation_id": correlation_id,
        "task_id": task_id,
        "poll_count": poll_count,
        "duration_ms": round(duration_ms, 2),
        "max_wait_seconds": max_wait_seconds,
    })
    return json.dumps({
        "status": "error",
        "error_code": "async_timeout",
        "error_message": "AI サービスの処理がタイムアウトしました。しばらくしてからお試しください。",
        "correlation_id": correlation_id,
    })


def invoke_execution_agent(
    task_payload: Dict[str, Any],
    execution_agent_arn: Optional[str] = None,
    timeout_seconds: int = 120,
) -> str:
    """
    Invoke the Execution Agent via AgentCore InvokeAgentRuntime API.

    Sends a JSON-RPC 2.0 message/send to the Execution Agent containing
    the task payload (channel, text, bot_token, etc.). Handles both
    synchronous and asynchronous response patterns:

    1. Synchronous: Agent returns final result directly (status = "success" or "error")
    2. Asynchronous: Agent returns "accepted" with task_id, then this function
       polls for the final result using GetAsyncTaskResult

    Args:
        task_payload: Task data to send to the Execution Agent.
            Must contain: channel, text, bot_token, correlation_id
            Optional: thread_ts, attachments, team_id, user_id
        execution_agent_arn: ARN of the Execution Agent Runtime.
            Defaults to EXECUTION_AGENT_ARN environment variable.
        timeout_seconds: Total request timeout in seconds (default: 120)

    Returns:
        str: JSON string with ExecutionResponse (status, response_text, etc.)

    Security:
        - SigV4 authentication is handled automatically by boto3
        - Cross-account access requires resource-based policy on Execution Agent
    """
    # Get Execution Agent ARN
    agent_arn = execution_agent_arn or os.environ.get("EXECUTION_AGENT_ARN", "")
    if not agent_arn:
        raise ValueError(
            "EXECUTION_AGENT_ARN environment variable is required. "
            "Set it to the ARN of the Execution Agent Runtime."
        )

    correlation_id = task_payload.get("correlation_id", str(uuid.uuid4()))
    start_time = time.time()

    _log("INFO", "invoke_execution_agent_started", {
        "correlation_id": correlation_id,
        "execution_agent_arn": agent_arn,
        "channel": task_payload.get("channel"),
        "text_length": len(task_payload.get("text", "")),
        "attachment_count": len(task_payload.get("attachments", [])),
    })

    try:
        client = _get_agentcore_client()

        # Unique session ID per invocation (UUID recommended by AWS for InvokeAgentRuntime)
        session_id = str(uuid.uuid4())

        # JSON-RPC 2.0 Request (032-jsonrpc-zone-connection): execute_task with task_payload as params
        payload_bytes = json.dumps(build_jsonrpc_request(task_payload)).encode("utf-8")

        for attempt in range(1, INVOKE_RETRY_MAX_ATTEMPTS + 1):
            try:
                # Invoke the Execution Agent via AgentCore Runtime (A2A API: runtimeSessionId + payload)
                response = client.invoke_agent_runtime(
                    agentRuntimeArn=agent_arn,
                    runtimeSessionId=session_id,
                    payload=payload_bytes,
                )
            except ClientError as e:
                if e.response["Error"]["Code"] == "ThrottlingException" and attempt < INVOKE_RETRY_MAX_ATTEMPTS:
                    delay = INVOKE_RETRY_BASE_DELAY_SECONDS * (
                        INVOKE_RETRY_BACKOFF_FACTOR ** (attempt - 1)
                    )
                    _log("WARN", "invoke_throttled_retry", {
                        "correlation_id": correlation_id,
                        "attempt": attempt,
                        "max_attempts": INVOKE_RETRY_MAX_ATTEMPTS,
                        "delay_seconds": round(delay, 2),
                    })
                    time.sleep(delay)
                    continue
                raise

            # Parse response body (API returns "response" as StreamingBody, "contentType")
            try:
                response_body = _read_invoke_response(response)
            except Exception as read_err:
                _log("ERROR", "invoke_response_read_error", {
                    "correlation_id": correlation_id,
                    "execution_agent_arn": agent_arn,
                    "error": str(read_err),
                    "error_type": type(read_err).__name__,
                    "traceback": traceback.format_exc(),
                })
                if log_execution_error:
                    log_execution_error(correlation_id, read_err, traceback.format_exc())
                return json.dumps({
                    "status": "error",
                    "error_code": "response_read_error",
                    "error_message": "エラーが発生しました。しばらくしてからお試しください。",
                    "correlation_id": correlation_id,
                })

            # Parse as JSON-RPC 2.0 Response (032-jsonrpc-zone-connection)
            try:
                response_data = json.loads(response_body) if response_body else {}
            except (json.JSONDecodeError, ValueError):
                response_data = {}

            # JSON-RPC error → return user-facing error JSON via parse_jsonrpc_response
            if "error" in response_data:
                duration_ms = (time.time() - start_time) * 1000
                _log("INFO", "invoke_execution_agent_completed", {
                    "correlation_id": correlation_id,
                    "execution_agent_arn": agent_arn,
                    "duration_ms": round(duration_ms, 2),
                    "response_mode": "sync",
                    "jsonrpc_error": True,
                })
                return parse_jsonrpc_response(response_body, correlation_id=correlation_id)

            # JSON-RPC result: check for async (status "accepted", task_id)
            result = response_data.get("result") if isinstance(response_data.get("result"), dict) else {}
            if result.get("status") == "accepted" and result.get("task_id"):
                task_id = result["task_id"]
                elapsed = time.time() - start_time
                remaining_timeout = max(timeout_seconds - elapsed, 30)

                _log("INFO", "async_response_received", {
                    "correlation_id": correlation_id,
                    "task_id": task_id,
                    "remaining_timeout": round(remaining_timeout, 2),
                })

                return _poll_async_task_result(
                    agent_arn=agent_arn,
                    task_id=task_id,
                    correlation_id=correlation_id,
                    max_wait_seconds=remaining_timeout,
                )

            # Synchronous JSON-RPC result — return same shape as before (result payload only)
            duration_ms = (time.time() - start_time) * 1000
            _log("INFO", "invoke_execution_agent_completed", {
                "correlation_id": correlation_id,
                "execution_agent_arn": agent_arn,
                "duration_ms": round(duration_ms, 2),
                "response_length": len(response_body),
                "response_mode": "sync",
            })
            return parse_jsonrpc_response(response_body, correlation_id=correlation_id)

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"].get("Message", "")
        duration_ms = (time.time() - start_time) * 1000

        _log("ERROR", "invoke_execution_agent_failed", {
            "correlation_id": correlation_id,
            "execution_agent_arn": agent_arn,
            "error_code": error_code,
            "error_message": error_message,
            "duration_ms": round(duration_ms, 2),
        })

        # Map AWS errors to user-friendly responses (include execution_agent_arn for errors log debugging)
        if error_code == "ThrottlingException":
            return json.dumps({
                "status": "error",
                "error_code": "throttling",
                "error_message": "AI サービスが混雑しています。しばらくしてからお試しください。",
                "correlation_id": correlation_id,
                "execution_agent_arn": agent_arn,
            })
        elif error_code == "AccessDeniedException":
            return json.dumps({
                "status": "error",
                "error_code": "access_denied",
                "error_message": "AI サービスへのアクセスが拒否されました。管理者にお問い合わせください。",
                "correlation_id": correlation_id,
                "execution_agent_arn": agent_arn,
                "aws_error_code": error_code,
                "aws_error_message": error_message,
            })
        else:
            return json.dumps({
                "status": "error",
                "error_code": error_code.lower(),
                "error_message": "エラーが発生しました。しばらくしてからお試しください。",
                "correlation_id": correlation_id,
                "execution_agent_arn": agent_arn,
            })

    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        tb_str = traceback.format_exc()

        _log("ERROR", "invoke_execution_agent_unexpected_error", {
            "correlation_id": correlation_id,
            "execution_agent_arn": agent_arn,
            "error": str(e),
            "error_type": type(e).__name__,
            "duration_ms": round(duration_ms, 2),
        })
        if log_execution_error:
            log_execution_error(correlation_id, e, tb_str)

        return json.dumps({
            "status": "error",
            "error_code": "internal_error",
            "error_message": "エラーが発生しました。しばらくしてからお試しください。",
            "correlation_id": correlation_id,
            "execution_agent_arn": agent_arn,
        })
