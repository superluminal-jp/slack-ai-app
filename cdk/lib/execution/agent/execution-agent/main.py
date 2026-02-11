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

from botocore.exceptions import ClientError

from bedrock_client_converse import invoke_bedrock
from response_formatter import format_success_response, format_error_response
from attachment_processor import process_attachments, get_processing_summary
from agent_card import get_agent_card, get_health_status

# Track active processing for health status
_active_tasks = 0
_active_tasks_lock = threading.Lock()

# Error message catalog (FR-013: user-friendly messages in user's language)
ERROR_MESSAGES = {
    "bedrock_timeout": "AI サービスが応答に時間がかかっています。しばらくしてからお試しください。",
    "bedrock_throttling": "AI サービスが混雑しています。1分後にお試しください。",
    "bedrock_access_denied": "AI サービスへの接続に問題があります。管理者にお問い合わせください。",
    "invalid_response": "AI サービスから予期しない応答を受信しました。再度お試しください。",
    "attachment_download_failed": "添付ファイルのダウンロードに失敗しました。ファイルを再アップロードしてお試しください。",
    "download_failed": "添付ファイルのダウンロードに失敗しました。ファイルを再アップロードしてお試しください。",
    "url_not_available": "添付ファイルのダウンロードに失敗しました。ファイルを再アップロードしてお試しください。",
    "file_too_large": "ファイルサイズが上限を超えています。画像は10MB、ドキュメントは5MBまでです。",
    "unsupported_file_type": "サポートされていないファイル形式です。画像: PNG, JPEG, GIF, WebP。ドキュメント: PDF, DOCX, XLSX, CSV, TXT, PPTX。",
    "unsupported_image_type": "サポートされていない画像形式です。PNG, JPEG, GIF, WebP をご利用ください。",
    "unsupported_type": "サポートされていないファイル形式です。",
    "extraction_failed": "ファイルの内容を読み取れませんでした。破損しているか、パスワード保護されている可能性があります。",
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
    print(json.dumps(log_entry, default=str, ensure_ascii=False))


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
    elif "resourcenotfound" in error_msg or "modelnotfound" in error_msg:
        return "bedrock_access_denied", ERROR_MESSAGES["bedrock_access_denied"]
    else:
        return "generic", ERROR_MESSAGES["generic"]


# ─── strands-agents Tool: Bedrock processing entrypoint ───

def handle_message_tool(payload_json: str) -> str:
    """A2A メッセージを処理し、Bedrock で AI 推論を行い、フォーマット済みレスポンスを返す。

    026 US3 (T014): ツール定義の明確化 — purpose、パラメータ、戻り値を明記。

    Purpose:
        Verification Agent から受け取った A2A ペイロードをパースし、Bedrock Converse API で
        AI 推論を実行。テキスト・添付ファイル（画像・ドキュメント）をマルチモーダル入力として
        処理し、Slack 投稿用の JSON レスポンスを返す。

    Args:
        payload_json: JSON 文字列。期待する構造:
            - "prompt": タスクペイロード（JSON 文字列またはオブジェクト）。以下を含む:
                - channel (str): Slack チャンネル ID
                - text (str): ユーザーメッセージ本文
                - bot_token (str): Slack Bot Token
                - thread_ts (str, optional): スレッドタイムスタンプ
                - attachments (list, optional): 024 添付ファイル情報のリスト
                - correlation_id (str, optional): トレース用 ID

    Returns:
        JSON 文字列。成功時: {"status": "success", "response_text": "...", "channel": "...", ...}
        エラー時: {"status": "error", "error_code": "...", "error_message": "...", ...}
        file_artifact を含む場合: 014 生成ファイルのメタデータ。
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
            err = {"status": "error", "error_code": "missing_channel", "error_message": "Missing channel", "correlation_id": correlation_id}
            if bot_token and bot_token.strip().startswith("xoxb-"):
                return json.dumps(format_error_response(channel="unknown", error_code="missing_channel", error_message="Missing channel", bot_token=bot_token, correlation_id=correlation_id))
            return json.dumps(err)

        if not text and not (attachments and len(attachments) > 0):
            err = {"status": "error", "error_code": "missing_text", "error_message": "Missing text", "channel": channel, "thread_ts": thread_ts, "correlation_id": correlation_id}
            if bot_token and bot_token.strip().startswith("xoxb-"):
                return json.dumps(format_error_response(channel=channel, error_code="missing_text", error_message="Missing text", bot_token=bot_token, thread_ts=thread_ts, correlation_id=correlation_id))
            return json.dumps(err)

        # Process request (synchronous — strands executor handles async)
        with _active_tasks_lock:
            _active_tasks += 1

        try:
            model_id = os.environ.get("BEDROCK_MODEL_ID", "not_set")
            _log("INFO", "processing_started", {
                "correlation_id": correlation_id,
                "channel": channel,
                "text_length": len(text) if text else 0,
                "attachment_count": len(attachments) if attachments else 0,
                "bedrock_model_id": model_id,
            })

            # Process attachments if present
            native_documents = []
            document_texts_fallback = []
            image_bytes_list = []
            image_formats_list = []
            skip_msg = ""
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

                    # FR-013: When all attachments failed, return user-friendly error
                    if attachments and summary.get("success", 0) == 0 and summary.get("failed", 0) > 0:
                        failed_att = next(
                            (a for a in processed_attachments if a.get("processing_status") == "failed"),
                            None,
                        )
                        if failed_att:
                            err_code = failed_att.get("error_code", "generic")
                            user_msg = ERROR_MESSAGES.get(
                                err_code, ERROR_MESSAGES["generic"]
                            )
                            _log("WARN", "all_attachments_failed", {
                                "correlation_id": correlation_id,
                                "error_code": err_code,
                                "failed_count": summary["failed"],
                            })
                            return json.dumps(
                                format_error_response(
                                    channel=channel,
                                    error_code=err_code,
                                    error_message=user_msg,
                                    bot_token=bot_token,
                                    thread_ts=thread_ts,
                                    correlation_id=correlation_id,
                                )
                            )

                    for att in processed_attachments:
                        if att.get("processing_status") != "success":
                            continue
                        if att.get("content_type") == "document":
                            if att.get("document_bytes") and att.get("document_format"):
                                native_documents.append({
                                    "bytes": att["document_bytes"],
                                    "format": att["document_format"],
                                    "name": att.get("file_name", "document"),
                                })
                            if att.get("content"):
                                document_texts_fallback.append(
                                    f"[Document: {att.get('file_name', 'unknown')}]\n{att.get('content', '')}"
                                )
                        elif att.get("content_type") == "image":
                            image_bytes_list.append(att["content"])
                            fmt = att.get("mimetype", "image/png").split("/")[-1].lower()
                            image_formats_list.append("jpeg" if fmt == "jpg" else fmt)

                    # US3 (FR-012): cap documents and images per Bedrock request; skip message if truncated
                    MAX_DOCUMENTS_PER_REQUEST = 5
                    MAX_IMAGES_PER_REQUEST = 20
                    original_n_docs = len(native_documents) + (
                        len(document_texts_fallback) if not native_documents else 0
                    )
                    original_n_images = len(image_bytes_list)
                    if len(native_documents) > MAX_DOCUMENTS_PER_REQUEST:
                        native_documents = native_documents[:MAX_DOCUMENTS_PER_REQUEST]
                    if len(document_texts_fallback) > MAX_DOCUMENTS_PER_REQUEST:
                        document_texts_fallback = document_texts_fallback[
                            :MAX_DOCUMENTS_PER_REQUEST
                        ]
                    if len(image_bytes_list) > MAX_IMAGES_PER_REQUEST:
                        image_bytes_list = image_bytes_list[:MAX_IMAGES_PER_REQUEST]
                        image_formats_list = image_formats_list[:MAX_IMAGES_PER_REQUEST]
                    skip_msg = ""
                    if original_n_docs > MAX_DOCUMENTS_PER_REQUEST or original_n_images > MAX_IMAGES_PER_REQUEST:
                        skip_msg = (
                            " (Note: Some files were not processed due to the limit of "
                            "5 documents and 20 images per request.)"
                        )
                    if skip_msg:
                        _log("WARN", "attachment_limit_truncation", {
                            "correlation_id": correlation_id,
                            "original_docs": original_n_docs,
                            "original_images": original_n_images,
                        })
                except Exception as e:
                    _log("ERROR", "attachment_processing_error", {
                        "correlation_id": correlation_id,
                        "error": str(e),
                        "error_type": type(e).__name__,
                    })

            # File-only message: default prompt for document summary
            prompt_for_bedrock = text.strip() if text and text.strip() else None
            if prompt_for_bedrock is None and (native_documents or document_texts_fallback):
                prompt_for_bedrock = "Please summarize the attached document(s)."
            if skip_msg:
                prompt_for_bedrock = (prompt_for_bedrock or "") + skip_msg

            document_texts_first = (
                document_texts_fallback if not native_documents else None
            )
            documents_first = native_documents if native_documents else None
            try:
                ai_response = invoke_bedrock(
                    prompt=prompt_for_bedrock or "",
                    document_texts=document_texts_first,
                    documents=documents_first,
                    images=image_bytes_list if image_bytes_list else None,
                    image_formats=image_formats_list if image_formats_list else None,
                )
            except ClientError as e:
                if (
                    e.response.get("Error", {}).get("Code") == "ValidationException"
                    and document_texts_fallback
                ):
                    _log("WARN", "bedrock_document_validation_fallback", {
                        "correlation_id": correlation_id,
                        "message": "Falling back to text extraction after ValidationException",
                    })
                    ai_response = invoke_bedrock(
                        prompt=prompt_for_bedrock or "",
                        document_texts=document_texts_fallback,
                        documents=None,
                        images=image_bytes_list if image_bytes_list else None,
                        image_formats=image_formats_list if image_formats_list else None,
                    )
                else:
                    raise

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
                "error_repr": repr(e),
                "duration_ms": round(duration_ms, 2),
                "bedrock_model_id": os.environ.get("BEDROCK_MODEL_ID", "not_set"),
                "traceback": traceback.format_exc(),
            })

            # When bot_token is missing, return minimal error (Verification Agent has its own context)
            if not bot_token or not bot_token.strip() or not bot_token.startswith("xoxb-"):
                return json.dumps({
                    "status": "error",
                    "error_code": error_code,
                    "error_message": user_message,
                    "channel": channel or "unknown",
                    "thread_ts": thread_ts,
                    "correlation_id": correlation_id,
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
            "error_repr": repr(e),
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
