"""
Verification pipeline: security checks, delegation to Execution Agent, Slack post request enqueue.

This module contains all business logic that runs on AgentCore Runtime.
Invoked by main.py entrypoint only; main.py is the minimal A2A contract shell.
"""

import base64
import json
import os
import time
import traceback
import uuid
from typing import Optional, Tuple

from existence_check import check_entity_existence, ExistenceCheckError
from authorization import authorize_request
from rate_limiter import check_rate_limit, RateLimitExceededError
from a2a_client import invoke_execution_agent
from slack_post_request import send_slack_post_request, build_file_artifact
from error_debug import log_execution_error

# Used by main.py for /ping HealthyBusy
is_processing = False

ERROR_MESSAGE_MAP = {
    "bedrock_timeout": ":hourglass: AI サービスが応答に時間がかかっています。しばらくしてからお試しください。",
    "bedrock_throttling": ":warning: AI サービスが混雑しています。1分後にお試しください。",
    "bedrock_access_denied": ":lock: AI サービスへの接続に問題があります。管理者にお問い合わせください。",
    "invalid_response": ":x: AI サービスから予期しない応答を受信しました。再度お試しください。",
    "attachment_download_failed": ":paperclip: 添付ファイルのダウンロードに失敗しました。ファイルを再アップロードしてお試しください。",
    "async_timeout": ":hourglass: AI サービスの処理がタイムアウトしました。しばらくしてからお試しください。",
    "async_task_failed": ":x: バックグラウンド処理が失敗しました。再度お試しください。",
    "throttling": ":warning: AI サービスが混雑しています。しばらくしてからお試しください。",
    "access_denied": ":lock: AI サービスへのアクセスが拒否されました。管理者にお問い合わせください。",
    "generic": ":warning: エラーが発生しました。しばらくしてからお試しください。",
}
DEFAULT_ERROR_MESSAGE = ":warning: エラーが発生しました。しばらくしてからお試しください。"


def _log(level: str, event_type: str, data: dict) -> None:
    log_entry = {
        "level": level,
        "event_type": event_type,
        "service": "verification-agent",
        "timestamp": time.time(),
        **data,
    }
    print(json.dumps(log_entry, default=str))


def _get_user_friendly_error(error_code: str, fallback_message: str = "") -> str:
    if error_code in ERROR_MESSAGE_MAP:
        return ERROR_MESSAGE_MAP[error_code]
    if fallback_message:
        return fallback_message
    return DEFAULT_ERROR_MESSAGE


def parse_file_artifact(result_data: dict) -> Optional[Tuple[bytes, str, str]]:
    artifact = result_data.get("file_artifact")
    if not artifact or not isinstance(artifact, dict):
        return None
    parts = artifact.get("parts")
    if not parts or not isinstance(parts, list) or len(parts) < 1:
        return None
    part = parts[0]
    if not isinstance(part, dict):
        return None
    b64 = part.get("contentBase64")
    name = part.get("fileName")
    mime = part.get("mimeType")
    if not b64 or not name or not mime:
        return None
    try:
        file_bytes = base64.b64decode(b64)
    except Exception as e:
        _log("WARN", "file_artifact_decode_error", {
            "error": str(e),
            "fileName": name,
            "mimeType": mime,
        })
        return None
    return (file_bytes, name, mime)


def run(payload: dict) -> str:
    """
    Run the full verification pipeline. Called from main.py entrypoint only.

    Args:
        payload: A2A payload with "prompt" key (JSON string or dict of task_payload).

    Returns:
        JSON string: {"status": "completed"|"error", "correlation_id": ..., ...}
    """
    global is_processing
    correlation_id = str(uuid.uuid4())
    start_time = time.time()

    try:
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

        _log("INFO", "a2a_task_received", {
            "correlation_id": correlation_id,
            "channel": channel,
            "text_length": len(text) if text else 0,
            "attachment_count": len(attachments),
            "has_thread_ts": bool(thread_ts),
        })
        _log("INFO", "a2a_auth_event", {
            "correlation_id": correlation_id,
            "action": "ReceiveTask",
            "result": "allowed",
            "source_team_id": team_id[:4] + "***" if team_id else "",
            "source_user_id": user_id[:4] + "***" if user_id else "",
            "channel": channel,
            "auth_method": "SigV4",
        })

        # 1. Existence Check
        if bot_token and (team_id or user_id or channel):
            try:
                check_entity_existence(
                    bot_token=bot_token,
                    team_id=team_id,
                    user_id=user_id,
                    channel_id=channel,
                )
                _log("INFO", "existence_check_passed", {"correlation_id": correlation_id, "team_id": team_id})
            except ExistenceCheckError as e:
                _log("ERROR", "existence_check_failed", {"correlation_id": correlation_id, "team_id": team_id, "error": str(e)})
                return json.dumps({
                    "status": "error",
                    "error_code": "existence_check_failed",
                    "error_message": "Entity verification failed",
                    "correlation_id": correlation_id,
                })

        # 2. Whitelist Authorization
        try:
            auth_result = authorize_request(team_id=team_id, user_id=user_id, channel_id=channel)
            if not auth_result.authorized:
                _log("ERROR", "authorization_failed", {
                    "correlation_id": correlation_id,
                    "team_id": team_id,
                    "unauthorized_entities": auth_result.unauthorized_entities,
                })
                return json.dumps({
                    "status": "error",
                    "error_code": "authorization_failed",
                    "error_message": "Authorization failed",
                    "correlation_id": correlation_id,
                })
        except Exception as e:
            _log("ERROR", "authorization_error", {
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc(),
            })
            return json.dumps({
                "status": "error",
                "error_code": "authorization_error",
                "error_message": "Authorization check failed",
                "correlation_id": correlation_id,
            })

        # 3. Rate Limiting
        try:
            if team_id or user_id:
                is_allowed, _ = check_rate_limit(team_id=team_id, user_id=user_id)
                if not is_allowed:
                    _log("ERROR", "rate_limit_exceeded", {"correlation_id": correlation_id, "team_id": team_id, "user_id": user_id})
                    return json.dumps({
                        "status": "error",
                        "error_code": "rate_limit_exceeded",
                        "error_message": "Rate limit exceeded. Please try again in a moment.",
                        "correlation_id": correlation_id,
                    })
        except RateLimitExceededError:
            return json.dumps({
                "status": "error",
                "error_code": "rate_limit_exceeded",
                "error_message": "Rate limit exceeded. Please try again in a moment.",
                "correlation_id": correlation_id,
            })
        except Exception as e:
            _log("WARN", "rate_limit_check_error", {
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
            })

        # 018: Echo mode
        if (os.environ.get("VALIDATION_ZONE_ECHO_MODE") or "").strip().lower() == "true":
            echo_text = "[Echo] " + text if text else "[Echo]"
            send_slack_post_request(
                channel=channel,
                thread_ts=thread_ts,
                text=echo_text,
                bot_token=bot_token,
                correlation_id=correlation_id,
            )
            _log("INFO", "echo_mode_response", {"correlation_id": correlation_id, "channel": channel, "thread_ts": thread_ts})
            return json.dumps({"status": "completed", "correlation_id": correlation_id})

        # Delegate to Execution Agent
        is_processing = True
        _log("INFO", "delegating_to_execution_agent", {"correlation_id": correlation_id, "channel": channel})

        execution_payload = {
            "channel": channel,
            "text": text,
            "bot_token": bot_token,
            "thread_ts": thread_ts,
            "attachments": attachments,
            "correlation_id": correlation_id,
            "team_id": team_id,
            "user_id": user_id,
        }

        try:
            execution_result = invoke_execution_agent(execution_payload)
            try:
                result_data = json.loads(execution_result) if isinstance(execution_result, str) else execution_result
            except (json.JSONDecodeError, TypeError) as e:
                _log("ERROR", "execution_result_parse_error", {
                    "correlation_id": correlation_id,
                    "error": str(e),
                    "raw_result_preview": str(execution_result)[:200] if execution_result else "",
                })
                is_processing = False
                send_slack_post_request(
                    channel=channel,
                    thread_ts=thread_ts,
                    text=DEFAULT_ERROR_MESSAGE,
                    bot_token=bot_token,
                    correlation_id=correlation_id,
                )
                return json.dumps({
                    "status": "error",
                    "error_code": "invalid_response",
                    "error_message": "Failed to parse execution result",
                    "correlation_id": correlation_id,
                })

            _log("INFO", "execution_result_received", {
                "correlation_id": correlation_id,
                "status": result_data.get("status"),
                "channel": channel,
            })

            if result_data.get("status") == "success":
                response_text = result_data.get("response_text", "")
                file_tuple = parse_file_artifact(result_data)
                file_artifact = (
                    build_file_artifact(file_tuple[0], file_tuple[1], file_tuple[2]) if file_tuple else None
                )
                send_slack_post_request(
                    channel=channel,
                    thread_ts=thread_ts,
                    text=response_text if response_text else None,
                    file_artifact=file_artifact,
                    bot_token=bot_token,
                    correlation_id=correlation_id,
                )
                _log("INFO", "slack_post_request_sent", {
                    "correlation_id": correlation_id,
                    "channel": channel,
                    "has_text": bool(response_text),
                    "has_file": file_artifact is not None,
                })
            elif result_data.get("status") == "error":
                error_code = result_data.get("error_code", "generic")
                raw_error_message = result_data.get("error_message", "")
                user_friendly_message = _get_user_friendly_error(error_code, raw_error_message)
                send_slack_post_request(
                    channel=channel,
                    thread_ts=thread_ts,
                    text=user_friendly_message,
                    bot_token=bot_token,
                    correlation_id=correlation_id,
                )
                _log("INFO", "slack_error_post_request_sent", {
                    "correlation_id": correlation_id,
                    "channel": channel,
                    "error_code": error_code,
                })

            duration_ms = (time.time() - start_time) * 1000
            is_processing = False
            _log("INFO", "a2a_task_completed", {
                "correlation_id": correlation_id,
                "duration_ms": round(duration_ms, 2),
                "status": result_data.get("status"),
            })
            return json.dumps({"status": "completed", "correlation_id": correlation_id})

        except Exception as e:
            is_processing = False
            tb_str = traceback.format_exc()
            _log("ERROR", "execution_agent_error", {
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": tb_str,
            })
            log_execution_error(correlation_id, e, tb_str)
            send_slack_post_request(
                channel=channel,
                thread_ts=thread_ts,
                text="エラーが発生しました。しばらくしてからお試しください。",
                bot_token=bot_token,
                correlation_id=correlation_id,
            )
            return json.dumps({
                "status": "error",
                "error_code": "execution_error",
                "error_message": str(e),
                "correlation_id": correlation_id,
            })

    except Exception as e:
        tb_str = traceback.format_exc()
        _log("ERROR", "unhandled_exception", {
            "correlation_id": correlation_id,
            "error": str(e),
            "error_type": type(e).__name__,
            "stack_trace": tb_str,
        })
        log_execution_error(correlation_id, e, tb_str)
        return json.dumps({
            "status": "error",
            "error_code": "internal_error",
            "error_message": "Internal server error",
            "correlation_id": correlation_id,
        })
