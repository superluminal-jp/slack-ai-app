"""
Web Fetch Agent A2A Server — FastAPI on port 9000.

Receives raw payloads from invoke_agent_runtime (Verification Agent),
processes with Bedrock + fetch_url tool, and returns text responses.

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

from bedrock_client_converse import build_content_blocks
from response_formatter import format_success_response, format_error_response
from agent_factory import create_agent
from agent_card import get_agent_card, get_health_status
from logger_util import get_logger, log

# Track active processing for health status
_active_tasks = 0
_active_tasks_lock = threading.Lock()

_logger = get_logger()

# Error message catalog
ERROR_MESSAGES = {
    "bedrock_timeout": "AI サービスが応答に時間がかかっています。しばらくしてからお試しください。",
    "bedrock_throttling": "AI サービスが混雑しています。1分後にお試しください。",
    "bedrock_access_denied": "AI サービスへの接続に問題があります。管理者にお問い合わせください。",
    "invalid_response": "AI サービスから予期しない応答を受信しました。再度お試しください。",
    "generic": "エラーが発生しました。問題は記録され、修正に取り組んでいます。後ほどお試しください。",
}


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="web-fetch-agent")


def _map_error_to_response(error: Exception) -> tuple:
    """Map an exception to a user-friendly error code and message."""
    error_type = type(error).__name__
    error_msg = str(error).lower()

    if "timeout" in error_type.lower() or "timeout" in error_msg:
        return "bedrock_timeout", ERROR_MESSAGES["bedrock_timeout"]
    elif "throttling" in error_msg or "throttlingexception" in error_msg:
        return "bedrock_throttling", ERROR_MESSAGES["bedrock_throttling"]
    elif "accessdenied" in error_msg or "accessdeniedexception" in error_msg:
        return "bedrock_access_denied", ERROR_MESSAGES["bedrock_access_denied"]
    elif "validationexception" in error_msg:
        return "invalid_response", ERROR_MESSAGES["invalid_response"]
    else:
        return "generic", ERROR_MESSAGES["generic"]


# ─── A2A message handler ───

def handle_message_tool(payload_json: str) -> str:
    """A2A メッセージを処理し、Bedrock で AI 推論を行い、フォーマット済みレスポンスを返す。

    Purpose:
        Verification Agent から受け取った A2A ペイロードをパースし、Bedrock Converse API で
        AI 推論を実行。テキスト入力のみ受け付け（添付ファイルなし）、URL コンテンツ取得に
        特化したテキストレスポンスを返す。

    Args:
        payload_json: JSON 文字列。期待する構造:
            - "prompt": タスクペイロード（JSON 文字列またはオブジェクト）。以下を含む:
                - channel (str): Slack チャンネル ID
                - text (str): ユーザーメッセージ本文（URL を含む）
                - bot_token (str): Slack Bot Token
                - thread_ts (str, optional): スレッドタイムスタンプ
                - correlation_id (str, optional): トレース用 ID

    Returns:
        JSON 文字列。成功時: {"status": "success", "response_text": "...", "channel": "...", ...}
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

        # Parse task payload from A2A message
        raw_prompt = payload.get("prompt", "{}")
        task_payload = (
            json.loads(raw_prompt) if isinstance(raw_prompt, str) else raw_prompt
        )

        correlation_id = task_payload.get("correlation_id", correlation_id)
        channel = task_payload.get("channel", "")
        text = task_payload.get("text", "")
        bot_token = task_payload.get("bot_token", "")
        thread_ts = task_payload.get("thread_ts")
        team_id = task_payload.get("team_id", "")
        user_id = task_payload.get("user_id", "")

        _log(
            "INFO",
            "a2a_message_received",
            {
                "correlation_id": correlation_id,
                "channel": channel,
                "text_length": len(text) if text else 0,
                "has_thread_ts": bool(thread_ts),
            },
        )

        _log(
            "INFO",
            "a2a_auth_event",
            {
                "correlation_id": correlation_id,
                "action": "InvokeAgentRuntime",
                "result": "allowed",
                "source_team_id": team_id[:4] + "***" if team_id else "",
                "source_user_id": user_id[:4] + "***" if user_id else "",
                "channel": channel,
                "auth_method": "SigV4",
            },
        )

        # Validate required fields
        if not channel:
            err = {
                "status": "error",
                "error_code": "missing_channel",
                "error_message": "Missing channel",
                "correlation_id": correlation_id,
            }
            if bot_token and bot_token.strip().startswith("xoxb-"):
                return json.dumps(
                    format_error_response(
                        channel="unknown",
                        error_code="missing_channel",
                        error_message="Missing channel",
                        bot_token=bot_token,
                        correlation_id=correlation_id,
                    )
                )
            return json.dumps(err)

        if not text or not text.strip():
            err = {
                "status": "error",
                "error_code": "missing_text",
                "error_message": "Missing text",
                "channel": channel,
                "thread_ts": thread_ts,
                "correlation_id": correlation_id,
            }
            if bot_token and bot_token.strip().startswith("xoxb-"):
                return json.dumps(
                    format_error_response(
                        channel=channel,
                        error_code="missing_text",
                        error_message="Missing text",
                        bot_token=bot_token,
                        thread_ts=thread_ts,
                        correlation_id=correlation_id,
                    )
                )
            return json.dumps(err)

        # Process request
        with _active_tasks_lock:
            _active_tasks += 1

        try:
            model_id = os.environ.get("BEDROCK_MODEL_ID", "not_set")
            _log(
                "INFO",
                "processing_started",
                {
                    "correlation_id": correlation_id,
                    "channel": channel,
                    "text_length": len(text),
                    "bedrock_model_id": model_id,
                },
            )

            content_blocks = build_content_blocks(prompt=text.strip())

            # Simple text: pass string. Otherwise pass messages with content blocks.
            if len(content_blocks) == 1 and "text" in content_blocks[0]:
                agent_input = content_blocks[0]["text"]
            else:
                agent_input = [{"role": "user", "content": content_blocks}]

            agent = create_agent()
            agent_result = agent(agent_input)

            # Extract response text from agent result
            msg = agent_result.message
            content_blocks_out = msg.get("content", []) if isinstance(msg, dict) else []
            ai_response = ""
            for block in content_blocks_out:
                if isinstance(block, dict) and "text" in block:
                    ai_response += block.get("text", "") or ""

            if not ai_response.strip():
                ai_response = "（応答がありませんでした）"

            duration_ms = (time.time() - start_time) * 1000
            _log(
                "INFO",
                "bedrock_response_received",
                {
                    "correlation_id": correlation_id,
                    "channel": channel,
                    "response_length": len(ai_response),
                    "duration_ms": round(duration_ms, 2),
                },
            )

            result, _ = format_success_response(
                channel=channel,
                response_text=ai_response,
                bot_token=bot_token,
                thread_ts=thread_ts,
                correlation_id=correlation_id,
            )

            return json.dumps(result)

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            error_code, user_message = _map_error_to_response(e)

            _log(
                "ERROR",
                "processing_error",
                {
                    "correlation_id": correlation_id,
                    "channel": channel,
                    "error_type": type(e).__name__,
                    "error_code": error_code,
                    "error_message": str(e),
                    "error_repr": repr(e),
                    "duration_ms": round(duration_ms, 2),
                    "bedrock_model_id": os.environ.get("BEDROCK_MODEL_ID", "not_set"),
                    "traceback": traceback.format_exc(),
                },
            )

            if (
                not bot_token
                or not bot_token.strip()
                or not bot_token.startswith("xoxb-")
            ):
                return json.dumps(
                    {
                        "status": "error",
                        "error_code": error_code,
                        "error_message": user_message,
                        "channel": channel or "unknown",
                        "thread_ts": thread_ts,
                        "correlation_id": correlation_id,
                    }
                )
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
        _log(
            "ERROR",
            "unhandled_exception",
            {
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "error_repr": repr(e),
                "traceback": traceback.format_exc(),
            },
        )
        return json.dumps(
            {
                "status": "error",
                "error_code": "internal_error",
                "error_message": ERROR_MESSAGES["generic"],
                "correlation_id": correlation_id,
            }
        )


# Backward-compatible entrypoint for tests
def handle_message(payload):
    """Legacy entrypoint wrapper — used by tests."""
    return handle_message_tool(
        json.dumps(payload) if isinstance(payload, dict) else payload
    )


# ─── JSON-RPC 2.0 (A2A) ───

def handle_invocation_body(body: bytes) -> dict:
    """
    Parse request body as JSON-RPC 2.0 Request and return JSON-RPC 2.0 Response.

    - Invalid JSON → error -32700 (Parse error), id null
    - Valid JSON but not a valid Request → error -32600 (Invalid Request), id null
    - method == "get_agent_card" → return Agent Card in result, request id
    - method != "execute_task" → error -32601 (Method not found), request id
    - method == "execute_task" → call handle_message_tool with params, wrap in result, request id
    """
    # Parse JSON
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

    # Required: jsonrpc, method, id
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

    # execute_task: validate required params
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
