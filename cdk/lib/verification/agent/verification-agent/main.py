"""
Verification Agent A2A Server Entry Point.

Receives A2A messages from SlackEventHandler Lambda, runs security
verification pipeline, delegates to Execution Agent via A2A, and
posts results to Slack.

Port: 9000 (A2A protocol)
Protocol: JSON-RPC 2.0
"""

import json
import os
import time
import uuid

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from slack_verifier import verify_signature
from existence_check import check_entity_existence, ExistenceCheckError
from authorization import authorize_request
from rate_limiter import check_rate_limit, RateLimitExceededError
from event_dedupe import is_duplicate_event, mark_event_processed
from a2a_client import invoke_execution_agent
from slack_poster import post_to_slack
from agent_card import get_agent_card, get_health_status

app = BedrockAgentCoreApp()

# Track active processing state for health status
_is_processing = False

# User-friendly error message mapping for Execution Agent error codes
# Maps error_code from Execution Agent to messages posted to Slack
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


def _get_user_friendly_error(error_code: str, fallback_message: str = "") -> str:
    """
    Get a user-friendly Slack message for an error code.

    Args:
        error_code: Error code from Execution Agent response
        fallback_message: Fallback message if error code not mapped

    Returns:
        User-friendly error message string for Slack
    """
    if error_code in ERROR_MESSAGE_MAP:
        return ERROR_MESSAGE_MAP[error_code]
    if fallback_message:
        return fallback_message
    return DEFAULT_ERROR_MESSAGE


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log_entry = {
        "level": level,
        "event_type": event_type,
        "service": "verification-agent",
        "timestamp": time.time(),
        **data,
    }
    print(json.dumps(log_entry, default=str))


# ─── A2A Discovery Endpoints ───

@app.route("/.well-known/agent-card.json", methods=["GET"])
def agent_card_endpoint():
    """
    A2A Agent Card endpoint for Agent Discovery.

    Returns the agent's metadata, capabilities, and skills in JSON format.
    """
    return json.dumps(get_agent_card())


@app.route("/ping", methods=["GET"])
def ping_endpoint():
    """
    Health check endpoint for A2A protocol.

    Returns Healthy or HealthyBusy status based on current processing state.
    """
    return json.dumps(get_health_status(is_busy=_is_processing))


# ─── Main A2A Entrypoint ───

@app.entrypoint
def handle_message(payload):
    """
    A2A entrypoint: receive task from SlackEventHandler, verify, delegate, and respond.

    Args:
        payload: A2A message payload containing prompt field with JSON task data

    Returns:
        dict: A2A response with processing status
    """
    correlation_id = str(uuid.uuid4())
    start_time = time.time()

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

        _log("INFO", "a2a_task_received", {
            "correlation_id": correlation_id,
            "channel": channel,
            "text_length": len(text) if text else 0,
            "attachment_count": len(attachments),
            "has_thread_ts": bool(thread_ts),
        })

        # Structured security audit log for A2A authentication
        _log("INFO", "a2a_auth_event", {
            "correlation_id": correlation_id,
            "action": "ReceiveTask",
            "result": "allowed",
            "source_team_id": team_id[:4] + "***" if team_id else "",
            "source_user_id": user_id[:4] + "***" if user_id else "",
            "channel": channel,
            "auth_method": "SigV4",
        })

        # --- Security Verification Pipeline ---

        # 1. Existence Check (verify entities exist in Slack)
        if bot_token and (team_id or user_id or channel):
            try:
                check_entity_existence(
                    bot_token=bot_token,
                    team_id=team_id,
                    user_id=user_id,
                    channel_id=channel,
                )
                _log("INFO", "existence_check_passed", {
                    "correlation_id": correlation_id,
                    "team_id": team_id,
                })
            except ExistenceCheckError as e:
                _log("ERROR", "existence_check_failed", {
                    "correlation_id": correlation_id,
                    "team_id": team_id,
                    "error": str(e),
                })
                return json.dumps({
                    "status": "error",
                    "error_code": "existence_check_failed",
                    "error_message": "Entity verification failed",
                    "correlation_id": correlation_id,
                })

        # 2. Whitelist Authorization
        try:
            auth_result = authorize_request(
                team_id=team_id,
                user_id=user_id,
                channel_id=channel,
            )
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
                is_allowed, remaining = check_rate_limit(
                    team_id=team_id,
                    user_id=user_id,
                )
                if not is_allowed:
                    _log("ERROR", "rate_limit_exceeded", {
                        "correlation_id": correlation_id,
                        "team_id": team_id,
                        "user_id": user_id,
                    })
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
            # Rate limiting failure - continue (fail-open for availability)
            _log("WARN", "rate_limit_check_error", {
                "correlation_id": correlation_id,
                "error": str(e),
            })

        # --- Delegate to Execution Agent via A2A ---
        global _is_processing
        _is_processing = True

        _log("INFO", "delegating_to_execution_agent", {
            "correlation_id": correlation_id,
            "channel": channel,
        })

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
            result_data = json.loads(execution_result) if isinstance(execution_result, str) else execution_result

            _log("INFO", "execution_result_received", {
                "correlation_id": correlation_id,
                "status": result_data.get("status"),
                "channel": channel,
            })

            # --- Post result to Slack ---
            if result_data.get("status") == "success":
                response_text = result_data.get("response_text", "")
                if response_text and bot_token and channel:
                    post_to_slack(
                        channel=channel,
                        text=response_text,
                        bot_token=bot_token,
                        thread_ts=thread_ts,
                    )
                    _log("INFO", "slack_response_posted", {
                        "correlation_id": correlation_id,
                        "channel": channel,
                        "response_length": len(response_text),
                    })
            elif result_data.get("status") == "error":
                error_code = result_data.get("error_code", "generic")
                raw_error_message = result_data.get("error_message", "")
                user_friendly_message = _get_user_friendly_error(
                    error_code, raw_error_message
                )

                if bot_token and channel:
                    post_to_slack(
                        channel=channel,
                        text=user_friendly_message,
                        bot_token=bot_token,
                        thread_ts=thread_ts,
                    )
                    _log("INFO", "slack_error_posted", {
                        "correlation_id": correlation_id,
                        "channel": channel,
                        "error_code": error_code,
                        "user_friendly_message_used": user_friendly_message != raw_error_message,
                    })

            duration_ms = (time.time() - start_time) * 1000
            _is_processing = False
            _log("INFO", "a2a_task_completed", {
                "correlation_id": correlation_id,
                "duration_ms": round(duration_ms, 2),
                "status": result_data.get("status"),
            })

            return json.dumps({
                "status": "completed",
                "correlation_id": correlation_id,
            })

        except Exception as e:
            _is_processing = False
            _log("ERROR", "execution_agent_error", {
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
            })

            # Post error to Slack
            if bot_token and channel:
                try:
                    post_to_slack(
                        channel=channel,
                        text="エラーが発生しました。しばらくしてからお試しください。",
                        bot_token=bot_token,
                        thread_ts=thread_ts,
                    )
                except Exception:
                    pass

            return json.dumps({
                "status": "error",
                "error_code": "execution_error",
                "error_message": str(e),
                "correlation_id": correlation_id,
            })

    except Exception as e:
        _log("ERROR", "unhandled_exception", {
            "correlation_id": correlation_id,
            "error": str(e),
            "error_type": type(e).__name__,
        })
        return json.dumps({
            "status": "error",
            "error_code": "internal_error",
            "error_message": "Internal server error",
            "correlation_id": correlation_id,
        })


if __name__ == "__main__":
    app.run()
