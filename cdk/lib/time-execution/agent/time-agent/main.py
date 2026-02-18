"""
Time Agent A2A Server — FastAPI on port 9000.

Receives JSON-RPC 2.0 payloads from Verification Agent and returns time-focused responses.
"""

import json
import threading
import traceback
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn

from agent_card import get_agent_card, get_health_status
from agent_factory import create_agent
from logger_util import get_logger, log
from response_formatter import format_error_response, format_success_response

_active_tasks = 0
_active_tasks_lock = threading.Lock()

_logger = get_logger()

ERROR_MESSAGES = {
    "missing_channel": "Missing channel",
    "missing_text": "Missing text",
    "internal_error": "エラーが発生しました。しばらくしてからお試しください。",
}


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="time-agent")


def handle_message_tool(payload_json: str) -> str:
    """Process A2A message with current time tool and return formatted response JSON."""
    global _active_tasks
    correlation_id = str(uuid.uuid4())

    try:
        payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
    except (json.JSONDecodeError, TypeError):
        payload = {"prompt": payload_json}

    raw_prompt = payload.get("prompt", "{}")
    task_payload = json.loads(raw_prompt) if isinstance(raw_prompt, str) else raw_prompt

    correlation_id = task_payload.get("correlation_id", correlation_id)
    channel = task_payload.get("channel", "")
    text = task_payload.get("text", "")
    bot_token = task_payload.get("bot_token", "")
    thread_ts = task_payload.get("thread_ts")

    if not channel:
        return json.dumps(
            {
                "status": "error",
                "error_code": "missing_channel",
                "error_message": ERROR_MESSAGES["missing_channel"],
                "correlation_id": correlation_id,
            }
        )

    if not text:
        return json.dumps(
            {
                "status": "error",
                "error_code": "missing_text",
                "error_message": ERROR_MESSAGES["missing_text"],
                "channel": channel,
                "thread_ts": thread_ts,
                "correlation_id": correlation_id,
            }
        )

    with _active_tasks_lock:
        _active_tasks += 1

    try:
        agent = create_agent()
        agent_result = agent(text)

        msg = agent_result.message
        content_blocks = msg.get("content", []) if isinstance(msg, dict) else []
        ai_response = ""
        for block in content_blocks:
            if isinstance(block, dict) and "text" in block:
                ai_response += block.get("text", "") or ""

        if not ai_response.strip():
            ai_response = "（応答がありませんでした）"

        result, _ = format_success_response(
            channel=channel,
            response_text=ai_response,
            bot_token=bot_token,
            thread_ts=thread_ts,
            correlation_id=correlation_id,
        )
        return json.dumps(result)

    except Exception as e:
        _log(
            "ERROR",
            "time_processing_error",
            {
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc(),
            },
        )

        if bot_token and bot_token.strip().startswith("xoxb-"):
            return json.dumps(
                format_error_response(
                    channel=channel,
                    error_code="internal_error",
                    error_message=ERROR_MESSAGES["internal_error"],
                    bot_token=bot_token,
                    thread_ts=thread_ts,
                    correlation_id=correlation_id,
                )
            )

        return json.dumps(
            {
                "status": "error",
                "error_code": "internal_error",
                "error_message": ERROR_MESSAGES["internal_error"],
                "correlation_id": correlation_id,
            }
        )

    finally:
        with _active_tasks_lock:
            _active_tasks = max(0, _active_tasks - 1)


def handle_message(payload):
    """Backward-compatible entrypoint wrapper for tests."""
    return handle_message_tool(json.dumps(payload) if isinstance(payload, dict) else payload)


def handle_invocation_body(body: bytes) -> dict:
    """Parse JSON-RPC 2.0 request body and return JSON-RPC 2.0 response body."""
    try:
        data = json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32700, "message": "Parse error"},
            "id": None,
        }

    if not isinstance(data, dict):
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32600, "message": "Invalid Request"},
            "id": None,
        }

    if data.get("jsonrpc") != "2.0" or "method" not in data or "id" not in data:
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32600, "message": "Invalid Request"},
            "id": None,
        }

    req_id = data.get("id")
    method = data.get("method")

    if method == "get_agent_card":
        return {"jsonrpc": "2.0", "result": get_agent_card(), "id": req_id}

    if method != "execute_task":
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32601, "message": "Method not found"},
            "id": req_id,
        }

    params = data.get("params") if isinstance(data.get("params"), dict) else {}
    required = ("channel", "text", "bot_token")
    missing = [k for k in required if not (params.get(k) and str(params.get(k)).strip())]
    if missing:
        return {
            "jsonrpc": "2.0",
            "error": {
                "code": -32602,
                "message": "Invalid params",
                "data": {"missing": missing},
            },
            "id": req_id,
        }

    payload = {"prompt": json.dumps(params)}
    try:
        result_str = handle_message_tool(json.dumps(payload))
    except Exception as e:
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32603, "message": "Internal error", "data": {"detail": str(e)}},
            "id": req_id,
        }

    try:
        result_data = json.loads(result_str) if isinstance(result_str, str) else result_str
    except (json.JSONDecodeError, TypeError):
        result_data = {"status": "error", "error_message": "Invalid response"}

    return {"jsonrpc": "2.0", "result": result_data, "id": req_id}


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
    """Handle invoke_agent_runtime payload as JSON-RPC 2.0."""
    body = await request.body()
    content = handle_invocation_body(body)
    return JSONResponse(content=content)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000)
