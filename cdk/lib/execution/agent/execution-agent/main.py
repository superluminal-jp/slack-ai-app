"""
Execution Agent A2A Server — FastAPI on port 9000.

Receives raw payloads from invoke_agent_runtime (Verification Agent),
processes with Bedrock, and returns AI-generated responses.

Port: 9000 (AgentCore A2A protocol)
"""

import json
import os
import time
import threading
import traceback
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn

from bedrock_client_converse import invoke_bedrock
from response_formatter import format_success_response, format_error_response
from attachment_processor import process_attachments, get_processing_summary
from agent_card import get_agent_card, get_health_status

# Track active processing for health status
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
    """Map an exception to a user-friendly error code and message."""
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


# ─── strands-agents Tool: Bedrock processing entrypoint ───

def handle_message_tool(payload_json: str) -> str:
    """Process an A2A message: parse, invoke Bedrock, return formatted response.

    Args:
        payload_json: JSON string containing the task payload with prompt field.

    Returns:
        JSON string with processing result.
    """
    global _active_tasks
    correlation_id = str(uuid.uuid4())
    start_time = time.time()

    try:
        try:
            payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
        except (json.JSONDecodeError, TypeError):
            payload = {"prompt": payload_json}

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

        # Process request (synchronous — strands executor handles async)
        with _active_tasks_lock:
            _active_tasks += 1

        try:
            _log("INFO", "processing_started", {
                "correlation_id": correlation_id,
                "channel": channel,
                "text_length": len(text) if text else 0,
                "attachment_count": len(attachments) if attachments else 0,
            })

            # Process attachments if present
            attachment_context = ""
            if attachments:
                try:
                    processed_attachments = process_attachments(
                        attachments, bot_token, correlation_id
                    )
                    summary = get_processing_summary(processed_attachments)
                    _log("INFO", "attachments_processed", {
                        "correlation_id": correlation_id,
                        **summary,
                    })

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
                        "error": str(e),
                        "error_type": type(e).__name__,
                    })

            # Build full prompt and invoke Bedrock
            full_prompt = text + attachment_context if attachment_context else text
            ai_response = invoke_bedrock(full_prompt)

            duration_ms = (time.time() - start_time) * 1000
            _log("INFO", "bedrock_response_received", {
                "correlation_id": correlation_id,
                "channel": channel,
                "response_length": len(ai_response),
                "duration_ms": round(duration_ms, 2),
                "had_attachments": bool(attachments),
            })

            result, file_artifact = format_success_response(
                channel=channel,
                response_text=ai_response,
                bot_token=bot_token,
                thread_ts=thread_ts,
                correlation_id=correlation_id,
            )
            if file_artifact is not None:
                result["file_artifact"] = file_artifact

            return json.dumps(result)

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            error_code, user_message = _map_error_to_response(e)

            _log("ERROR", "processing_error", {
                "correlation_id": correlation_id,
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
            return json.dumps(error_result)

        finally:
            with _active_tasks_lock:
                _active_tasks = max(0, _active_tasks - 1)

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


# Backward-compatible entrypoint for existing tests
def handle_message(payload):
    """Legacy entrypoint wrapper — used by existing tests."""
    return handle_message_tool(json.dumps(payload) if isinstance(payload, dict) else payload)


# ─── FastAPI app ───

app = FastAPI()


@app.get("/ping")
def ping_endpoint():
    """Health check (required by AgentCore service contract)."""
    with _active_tasks_lock:
        is_busy = _active_tasks > 0
    return get_health_status(is_busy=is_busy)


@app.get("/.well-known/agent-card.json")
def agent_card_endpoint():
    """Agent Card endpoint (A2A discovery)."""
    return get_agent_card()


@app.post("/")
async def handle_invocation(request: Request):
    """Handle invoke_agent_runtime payload — parse and process."""
    start_time = time.time()
    body = await request.body()
    payload = json.loads(body)

    # Extract correlation_id from nested prompt for tracing
    raw_prompt = payload.get("prompt", "{}")
    task_payload = json.loads(raw_prompt) if isinstance(raw_prompt, str) else raw_prompt
    correlation_id = task_payload.get("correlation_id", "")

    _log("INFO", "request_received", {
        "correlation_id": correlation_id,
        "channel": task_payload.get("channel", ""),
        "text_length": len(task_payload.get("text", "")),
        "has_thread_ts": bool(task_payload.get("thread_ts")),
        "attachment_count": len(task_payload.get("attachments", [])),
        "payload_bytes": len(body),
    })

    result = handle_message_tool(json.dumps(payload))
    duration_ms = (time.time() - start_time) * 1000

    result_data = json.loads(result) if isinstance(result, str) else result
    _log("INFO", "request_completed", {
        "correlation_id": correlation_id,
        "status": result_data.get("status", ""),
        "duration_ms": round(duration_ms, 2),
    })

    return JSONResponse(content=result_data)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000)
