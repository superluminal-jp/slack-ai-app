"""
Execution Agent A2A Server Entry Point.

Receives A2A messages from Verification Agent, processes with Bedrock,
and returns AI-generated responses. Supports asynchronous task management
via AgentCore's add_async_task / complete_async_task for long-running operations.

Port: 9000 (A2A protocol)
Protocol: JSON-RPC 2.0

Async Model:
  - @app.entrypoint returns immediately with "accepted" status
  - Background thread processes Bedrock request
  - complete_async_task called on completion (success or failure)
"""

import json
import os
import threading
import time
import traceback
import uuid

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_client_converse import invoke_bedrock
from response_formatter import format_success_response, format_error_response
from attachment_processor import process_attachments, get_processing_summary
from agent_card import get_agent_card, get_health_status

app = BedrockAgentCoreApp()

# Track active processing threads for health status
_active_tasks = 0
_active_tasks_lock = threading.Lock()

# Error message catalog
ERROR_MESSAGES = {
    "bedrock_timeout": "AI サービスが応答に時間がかかっています。しばらくしてからお試しください。",
    "bedrock_throttling": "AI サービスが混雑しています。1分後にお試しください。",
    "bedrock_access_denied": "AI サービスへの接続に問題があります。管理者にお問い合わせください。",
    "invalid_response": "AI サービスから予期しない応答を受信しました。再度お試しください。",
    "attachment_download_failed": "添付ファイルのダウンロードに失敗しました。ファイルを再アップロードしてお試しください。",
    "generic": "エラーが発生しました。問題は記録され、修正に取り組んでいます。後ほどお試しください。",
}


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log_entry = {
        "level": level,
        "event_type": event_type,
        "service": "execution-agent",
        "timestamp": time.time(),
        **data,
    }
    print(json.dumps(log_entry, default=str))


def _map_error_to_response(error: Exception) -> tuple:
    """
    Map an exception to a user-friendly error code and message.

    Args:
        error: The exception to map

    Returns:
        Tuple of (error_code, user_message)
    """
    error_type = type(error).__name__
    error_msg = str(error)

    if "Timeout" in error_type or "timeout" in error_msg.lower():
        return "bedrock_timeout", ERROR_MESSAGES["bedrock_timeout"]
    elif "Throttling" in error_msg or "ThrottlingException" in error_msg:
        return "bedrock_throttling", ERROR_MESSAGES["bedrock_throttling"]
    elif "AccessDenied" in error_msg or "AccessDeniedException" in error_msg:
        return "bedrock_access_denied", ERROR_MESSAGES["bedrock_access_denied"]
    elif "ValidationException" in error_msg:
        return "invalid_response", ERROR_MESSAGES["invalid_response"]
    else:
        return "generic", ERROR_MESSAGES["generic"]


def _increment_active_tasks() -> None:
    """Increment active task counter (thread-safe)."""
    global _active_tasks
    with _active_tasks_lock:
        _active_tasks += 1


def _decrement_active_tasks() -> None:
    """Decrement active task counter (thread-safe)."""
    global _active_tasks
    with _active_tasks_lock:
        _active_tasks = max(0, _active_tasks - 1)


# ─── A2A Discovery Endpoints ───

@app.route("/.well-known/agent-card.json", methods=["GET"])
def agent_card_endpoint():
    """
    A2A Agent Card endpoint for Agent Discovery.

    Returns the agent's metadata, capabilities, and skills in JSON format.
    Standard A2A discovery endpoint as per the A2A protocol specification.
    """
    return json.dumps(get_agent_card())


@app.route("/ping", methods=["GET"])
def ping_endpoint():
    """
    Health check endpoint for A2A protocol.

    Returns Healthy or HealthyBusy status based on active processing threads.
    """
    with _active_tasks_lock:
        is_busy = _active_tasks > 0
    return json.dumps(get_health_status(is_busy=is_busy))


# ─── Background Processing ───

def _process_bedrock_request(
    task_id: str,
    text: str,
    channel: str,
    bot_token: str,
    thread_ts: str,
    correlation_id: str,
    attachments: list,
) -> None:
    """
    Background thread: process Bedrock request and complete the async task.

    This function runs in a separate thread to avoid blocking the A2A entrypoint.
    It processes the AI request (with optional attachments), then calls
    complete_async_task to signal completion.

    Args:
        task_id: AgentCore async task ID
        text: User's message text
        channel: Slack channel ID
        bot_token: Slack bot token
        thread_ts: Thread timestamp for reply
        correlation_id: Correlation ID for tracing
        attachments: List of attachment metadata from Slack
    """
    start_time = time.time()
    _increment_active_tasks()

    try:
        _log("INFO", "async_processing_started", {
            "correlation_id": correlation_id,
            "task_id": task_id,
            "channel": channel,
            "text_length": len(text) if text else 0,
            "attachment_count": len(attachments) if attachments else 0,
        })

        # Process attachments if present
        processed_attachments = []
        attachment_context = ""

        if attachments:
            try:
                processed_attachments = process_attachments(
                    attachments, bot_token, correlation_id
                )
                summary = get_processing_summary(processed_attachments)

                _log("INFO", "attachments_processed", {
                    "correlation_id": correlation_id,
                    "task_id": task_id,
                    **summary,
                })

                # Build attachment context for Bedrock prompt
                doc_texts = []
                for att in processed_attachments:
                    if att.get("processing_status") == "success" and att.get("content_type") == "document":
                        doc_texts.append(
                            f"[Document: {att.get('file_name', 'unknown')}]\n{att.get('content', '')}"
                        )

                if doc_texts:
                    attachment_context = (
                        "\n\n--- Attached Documents ---\n"
                        + "\n\n".join(doc_texts)
                        + "\n--- End of Documents ---\n"
                    )

            except Exception as e:
                _log("ERROR", "attachment_processing_error", {
                    "correlation_id": correlation_id,
                    "task_id": task_id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                })
                # Continue with text-only processing

        # Build full prompt with attachment context
        full_prompt = text
        if attachment_context:
            full_prompt = text + attachment_context

        # Invoke Bedrock for AI response
        ai_response = invoke_bedrock(full_prompt)

        duration_ms = (time.time() - start_time) * 1000

        _log("INFO", "bedrock_response_received", {
            "correlation_id": correlation_id,
            "task_id": task_id,
            "channel": channel,
            "response_length": len(ai_response),
            "duration_ms": round(duration_ms, 2),
            "had_attachments": bool(attachments),
        })

        result = format_success_response(
            channel=channel,
            response_text=ai_response,
            bot_token=bot_token,
            thread_ts=thread_ts,
            correlation_id=correlation_id,
        )

        # Complete the async task with success result
        try:
            app.complete_async_task(task_id, json.dumps(result))
            _log("INFO", "async_task_completed", {
                "correlation_id": correlation_id,
                "task_id": task_id,
                "status": "success",
                "duration_ms": round(duration_ms, 2),
            })
        except Exception as complete_err:
            _log("ERROR", "complete_async_task_failed", {
                "correlation_id": correlation_id,
                "task_id": task_id,
                "error": str(complete_err),
                "error_type": type(complete_err).__name__,
            })
        finally:
            _decrement_active_tasks()

    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        error_code, user_message = _map_error_to_response(e)

        _log("ERROR", "async_processing_error", {
            "correlation_id": correlation_id,
            "task_id": task_id,
            "channel": channel,
            "error_type": type(e).__name__,
            "error_code": error_code,
            "error_message": str(e),
            "duration_ms": round(duration_ms, 2),
            "traceback": traceback.format_exc(),
        })

        error_result = format_error_response(
            channel=channel,
            error_code=error_code,
            error_message=user_message,
            bot_token=bot_token,
            thread_ts=thread_ts,
            correlation_id=correlation_id,
        )

        # Always call complete_async_task, even on failure
        try:
            app.complete_async_task(task_id, json.dumps(error_result))
            _log("INFO", "async_task_completed_with_error", {
                "correlation_id": correlation_id,
                "task_id": task_id,
                "error_code": error_code,
            })
        except Exception as complete_err:
            _log("ERROR", "complete_async_task_failed_on_error", {
                "correlation_id": correlation_id,
                "task_id": task_id,
                "original_error": str(e),
                "complete_error": str(complete_err),
            })
        finally:
            _decrement_active_tasks()


@app.entrypoint
def handle_message(payload):
    """
    A2A entrypoint: receive message from Verification Agent.

    Returns immediately with "accepted" status after creating an async task.
    The actual Bedrock processing happens in a background thread to avoid
    blocking the A2A response path.

    Args:
        payload: A2A message payload containing prompt field with JSON task data

    Returns:
        str: JSON with "accepted" status and task_id for async tracking
    """
    correlation_id = str(uuid.uuid4())

    try:
        # Parse task payload from A2A message
        raw_prompt = payload.get("prompt", "{}")
        task_payload = json.loads(raw_prompt) if isinstance(raw_prompt, str) else raw_prompt

        correlation_id = task_payload.get("correlation_id", correlation_id)
        channel = task_payload.get("channel", "")
        text = task_payload.get("text", "")
        bot_token = task_payload.get("bot_token", "")
        thread_ts = task_payload.get("thread_ts")
        team_id = task_payload.get("team_id", "")
        user_id = task_payload.get("user_id", "")
        attachments = task_payload.get("attachments", [])

        _log("INFO", "a2a_message_received", {
            "correlation_id": correlation_id,
            "channel": channel,
            "text_length": len(text) if text else 0,
            "has_thread_ts": bool(thread_ts),
            "attachment_count": len(attachments),
        })

        # Structured security audit log for A2A authentication
        _log("INFO", "a2a_auth_event", {
            "correlation_id": correlation_id,
            "action": "InvokeAgentRuntime",
            "result": "allowed",
            "source_team_id": team_id[:4] + "***" if team_id else "",
            "source_user_id": user_id[:4] + "***" if user_id else "",
            "channel": channel,
            "auth_method": "SigV4",
        })

        # Validate required fields
        if not channel:
            return json.dumps(format_error_response(
                channel="unknown", error_code="missing_channel",
                error_message="Missing channel", bot_token=bot_token or "unknown",
                correlation_id=correlation_id,
            ))

        if not text:
            return json.dumps(format_error_response(
                channel=channel, error_code="missing_text",
                error_message="Missing text", bot_token=bot_token or "unknown",
                correlation_id=correlation_id,
            ))

        # Create async task for background processing
        task_id = app.add_async_task("bedrock_processing")

        _log("INFO", "async_task_created", {
            "correlation_id": correlation_id,
            "task_id": task_id,
            "channel": channel,
        })

        # Launch background thread for Bedrock processing
        thread = threading.Thread(
            target=_process_bedrock_request,
            args=(
                task_id,
                text,
                channel,
                bot_token,
                thread_ts,
                correlation_id,
                attachments,
            ),
            daemon=True,
            name=f"bedrock-{correlation_id[:8]}",
        )
        thread.start()

        # Return immediately — don't block A2A response
        return json.dumps({
            "status": "accepted",
            "task_id": task_id,
            "correlation_id": correlation_id,
            "message": "Request accepted for async processing",
        })

    except Exception as e:
        _log("ERROR", "unhandled_exception", {
            "correlation_id": correlation_id,
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc(),
        })
        return json.dumps({
            "status": "error",
            "error_code": "internal_error",
            "error_message": ERROR_MESSAGES["generic"],
            "correlation_id": correlation_id,
        })


if __name__ == "__main__":
    app.run()
