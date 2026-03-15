"""
Verification Agent A2A Server — FastAPI on port 9000.

Amazon Bedrock AgentCore Runtime の A2A プロトコル契約に従う。
invoke_agent_runtime API は raw JSON ペイロードを POST / に送信するため、
FastAPI で直接ルーティングする。

- POST / : invoke_agent_runtime ペイロード受信 → pipeline.run()
- GET /.well-known/agent-card.json : Agent Card
- GET /ping : ヘルスチェック

ビジネスロジックは pipeline.run() に集約。
"""

import json
import time
import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn

from agent_card import get_agent_card, get_health_status
from logger_util import get_logger, log
from pipeline import run as run_pipeline, is_processing

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="verification-agent-main")


app = FastAPI()


@app.get("/ping")
def ping_endpoint():
    """Health check (required by AgentCore service contract)."""
    return get_health_status(is_busy=is_processing)


@app.get("/.well-known/agent-card.json")
def agent_card_endpoint():
    """Agent Card endpoint (A2A discovery)."""
    return get_agent_card()


@app.post("/")
async def handle_invocation(request: Request):
    """Handle invoke_agent_runtime payload — parse and run pipeline."""
    start_time = time.time()
    correlation_id = ""

    try:
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
            "payload_bytes": len(body),
        })

        result = run_pipeline(payload)
        duration_ms = (time.time() - start_time) * 1000

        result_data = json.loads(result) if isinstance(result, str) else result
        _log("INFO", "request_completed", {
            "correlation_id": correlation_id,
            "status": result_data.get("status", ""),
            "duration_ms": round(duration_ms, 2),
        })

        return JSONResponse(content=result_data)

    except json.JSONDecodeError as e:
        _log("ERROR", "payload_parse_error", {
            "correlation_id": correlation_id,
            "error": str(e),
            "error_type": type(e).__name__,
        })
        return JSONResponse(
            content={"status": "error", "error_code": "invalid_payload", "error_message": "Invalid JSON payload"},
        )
    except Exception as e:
        _log("ERROR", "invocation_error", {
            "correlation_id": correlation_id,
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc(),
        })
        return JSONResponse(
            content={"status": "error", "error_code": "internal_error", "error_message": "Internal server error"},
        )


# Backward-compatible entrypoint for tests (delegates to pipeline.run)
def handle_message(payload):
    """Legacy entrypoint wrapper — used by existing tests."""
    return run_pipeline(payload)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000)
