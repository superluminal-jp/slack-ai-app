"""
Doc Search Agent A2A Server — FastAPI on port 9000.

Receives JSON-RPC 2.0 requests from Verification Agent, processes with
Strands Agent (Bedrock) using search_docs and fetch_url tools, and returns
text-only responses. No attachment or file artifact support.

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

from agent_factory import create_agent
from agent_card import get_agent_card, get_health_status
from logger_util import get_logger, log

# Track active processing for health status
_active_tasks = 0
_active_tasks_lock = threading.Lock()

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="doc-search-agent")


def handle_message_tool(payload_json: str) -> str:
    """A2A メッセージを処理し、Bedrock でドキュメント検索・回答を行い、レスポンスを返す。

    Args:
        payload_json: JSON 文字列。期待する構造:
            - "prompt": タスクペイロード（JSON 文字列またはオブジェクト）。以下を含む:
                - channel (str): Slack チャンネル ID
                - text (str): ユーザーメッセージ本文
                - bot_token (str): Slack Bot Token
                - thread_ts (str, optional): スレッドタイムスタンプ
                - correlation_id (str, optional): トレース用 ID

    Returns:
        JSON 文字列。成功時: {"status": "success", "response_text": "...", ...}
        エラー時: {"status": "error", "error_code": "...", "error_message": "...", ...}
    """
    global _active_tasks
    correlation_id = str(uuid.uuid4())
    start_time = time.time()

    try:
        try:
            payload = (
                json.loads(payload_json)
                if isinstance(payload_json, str)
                else payload_json
            )
        except (json.JSONDecodeError, TypeError):
            payload = {"prompt": payload_json}

        raw_prompt = payload.get("prompt", "{}")
        task_payload = (
            json.loads(raw_prompt) if isinstance(raw_prompt, str) else raw_prompt
        )

        correlation_id = task_payload.get("correlation_id", correlation_id)
        channel = task_payload.get("channel", "")
        text = task_payload.get("text", "")
        bot_token = task_payload.get("bot_token", "")
        thread_ts = task_payload.get("thread_ts")

        _log(
            "INFO",
            "a2a_message_received",
            {
                "correlation_id": correlation_id,
                "channel": channel,
                "text_length": len(text) if text else 0,
            },
        )

        if not channel:
            return json.dumps({
                "status": "error",
                "error_code": "missing_channel",
                "error_message": "Missing channel",
                "correlation_id": correlation_id,
            })

        if not text:
            return json.dumps({
                "status": "error",
                "error_code": "missing_text",
                "error_message": "Missing text",
                "channel": channel,
                "thread_ts": thread_ts,
                "correlation_id": correlation_id,
            })

        with _active_tasks_lock:
            _active_tasks += 1

        try:
            agent = create_agent()
            agent_result = agent(text)

            # Extract response text from agent result
            msg = agent_result.message
            content_blocks = msg.get("content", []) if isinstance(msg, dict) else []
            ai_response = ""
            for block in content_blocks:
                if isinstance(block, dict) and "text" in block:
                    ai_response += block.get("text", "") or ""

            if not ai_response.strip():
                ai_response = "（応答がありませんでした）"

            duration_ms = (time.time() - start_time) * 1000
            _log(
                "INFO",
                "doc_search_response",
                {
                    "correlation_id": correlation_id,
                    "channel": channel,
                    "response_length": len(ai_response),
                    "duration_ms": round(duration_ms, 2),
                },
            )

            return json.dumps({
                "status": "success",
                "response_text": ai_response,
                "channel": channel,
                "bot_token": bot_token,
                "thread_ts": thread_ts,
                "correlation_id": correlation_id,
            })

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            _log(
                "ERROR",
                "processing_error",
                {
                    "correlation_id": correlation_id,
                    "channel": channel,
                    "error_type": type(e).__name__,
                    "error_message": str(e),
                    "duration_ms": round(duration_ms, 2),
                    "traceback": traceback.format_exc(),
                },
            )
            return json.dumps({
                "status": "error",
                "error_code": "generic",
                "error_message": "エラーが発生しました。後ほどお試しください。",
                "channel": channel,
                "thread_ts": thread_ts,
                "correlation_id": correlation_id,
            })

        finally:
            with _active_tasks_lock:
                _active_tasks = max(0, _active_tasks - 1)

    except Exception as e:
        _log(
            "ERROR",
            "unhandled_exception",
            {
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc(),
            },
        )
        return json.dumps({
            "status": "error",
            "error_code": "internal_error",
            "error_message": "エラーが発生しました。後ほどお試しください。",
            "correlation_id": correlation_id,
        })


# ─── JSON-RPC 2.0 ───

def handle_invocation_body(body: bytes) -> dict:
    """Parse request body as JSON-RPC 2.0 Request and return JSON-RPC 2.0 Response."""
    try:
        data = json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        _log("ERROR", "jsonrpc_parse_error", {"error": str(e)})
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

    if method != "execute_task":
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32601, "message": "Method not found"},
            "id": req_id,
        }

    params = data.get("params") if isinstance(data.get("params"), dict) else {}
    _REQUIRED_PARAMS = ("channel", "text", "bot_token")
    missing = [k for k in _REQUIRED_PARAMS if not (params.get(k) and str(params.get(k)).strip())]
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
        _log("ERROR", "jsonrpc_execute_task_error", {"error": str(e)})
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
    """Handle invoke_agent_runtime payload as JSON-RPC 2.0."""
    body = await request.body()
    content = handle_invocation_body(body)
    return JSONResponse(content=content)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000)
