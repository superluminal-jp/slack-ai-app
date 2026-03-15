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

import requests

from existence_check import check_entity_existence, ExistenceCheckError
from authorization import authorize_request
from rate_limiter import check_rate_limit, RateLimitExceededError
from a2a_client import invoke_execution_agent
from agent_registry import (
    initialize_registry,
    get_agent_arn,
    get_all_cards,
)
from router import route_request, UNROUTED_AGENT_ID, LIST_AGENTS_AGENT_ID  # kept for backward-compat; not called in main flow
from orchestrator import OrchestrationRequest, run_orchestration_loop
from slack_post_request import (
    send_slack_post_request,
    build_file_artifact,
    build_file_artifact_s3,
)
from error_debug import log_execution_error, log_execution_agent_error_response
from logger_util import get_logger, log
from slack_url_resolver import resolve_slack_urls
from slack_thread_context import build_current_thread_context
from s3_file_manager import (
    upload_file_to_s3,
    generate_presigned_url,
    generate_presigned_url_for_generated_file,
    upload_generated_file_to_s3,
    cleanup_request_files,
)

try:
    from strands import Agent
    from strands.models.bedrock import BedrockModel
except ImportError:  # pragma: no cover
    Agent = None
    BedrockModel = None

# 028: Threshold for SQS message size; files > 200KB use S3-backed delivery
SQS_FILE_ARTIFACT_SIZE_THRESHOLD = 200 * 1024

# Used by main.py for /ping HealthyBusy
is_processing = False

_logger = get_logger()
_FALLBACK_MODEL_ID = os.environ.get(
    "VERIFICATION_FALLBACK_MODEL_ID",
    os.environ.get(
        "ROUTER_MODEL_ID",
        "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
    ),
)

ERROR_MESSAGE_MAP = {
    "bedrock_timeout": ":hourglass: AI サービスが応答に時間がかかっています。しばらくしてからお試しください。",
    "bedrock_throttling": ":warning: AI サービスが混雑しています。1分後にお試しください。",
    "bedrock_access_denied": ":lock: AI サービスへの接続に問題があります。管理者にお問い合わせください。",
    "invalid_response": ":x: AI サービスから予期しない応答を受信しました。再度お試しください。",
    "attachment_download_failed": ":paperclip: 添付ファイルのダウンロードに失敗しました。ファイルを再アップロードしてお試しください。",
    "download_failed": ":paperclip: 添付ファイルのダウンロードに失敗しました。ファイルを再アップロードしてお試しください。",
    "url_not_available": ":paperclip: 添付ファイルのダウンロードに失敗しました。ファイルを再アップロードしてお試しください。",
    "file_too_large": ":floppy_disk: ファイルサイズが上限を超えています。画像は10MB、ドキュメントは5MBまでです。",
    "unsupported_file_type": ":page_facing_up: サポートされていないファイル形式です。画像: PNG, JPEG, GIF, WebP。ドキュメント: PDF, DOCX, XLSX, CSV, TXT, PPTX。",
    "unsupported_image_type": ":page_facing_up: サポートされていない画像形式です。PNG, JPEG, GIF, WebP をご利用ください。",
    "unsupported_type": ":page_facing_up: サポートされていないファイル形式です。",
    "extraction_failed": ":lock: ファイルの内容を読み取れませんでした。破損しているか、パスワード保護されている可能性があります。",
    "async_timeout": ":hourglass: AI サービスの処理がタイムアウトしました。しばらくしてからお試しください。",
    "async_task_failed": ":x: バックグラウンド処理が失敗しました。再度お試しください。",
    "throttling": ":warning: AI サービスが混雑しています。しばらくしてからお試しください。",
    "access_denied": ":lock: AI サービスへのアクセスが拒否されました。管理者にお問い合わせください。",
    "generic": ":warning: エラーが発生しました。しばらくしてからお試しください。",
}
DEFAULT_ERROR_MESSAGE = (
    ":warning: エラーが発生しました。しばらくしてからお試しください。"
)


def _log(level: str, event_type: str, data: dict) -> None:
    log(_logger, level, event_type, data, service="verification-agent")


# Initialize execution agent registry once at module import (container startup path).
# Fail-open: keep pipeline runnable even when discovery fails.
try:
    initialize_registry()
except Exception as e:
    _log(
        "WARN",
        "agent_registry_init_failed",
        {
            "error": str(e),
            "error_type": type(e).__name__,
        },
    )

# Initialize BedrockModel for orchestration loop (fail-open).
_bedrock_model = BedrockModel(model_id=_FALLBACK_MODEL_ID) if BedrockModel else None


def _get_user_friendly_error(error_code: str, fallback_message: str = "") -> str:
    if error_code in ERROR_MESSAGE_MAP:
        return ERROR_MESSAGE_MAP[error_code]
    if fallback_message:
        return fallback_message
    return DEFAULT_ERROR_MESSAGE


def _build_agent_attribution(agent_id: str, agent_cards: dict) -> str:
    """Build a Slack-formatted attribution footer for the called execution agent (rule-based)."""
    card = agent_cards.get(agent_id) or {}
    name = card.get("name", "") if isinstance(card, dict) else ""
    display = name if name else agent_id
    return f"_担当エージェント: {display}_"


def _extract_text_from_model_output(result) -> str:
    """Best-effort extraction of plain text from strands agent output."""
    if result is None:
        return ""
    if isinstance(result, str):
        return result.strip()
    message = getattr(result, "message", None)
    if isinstance(message, str):
        return message.strip()
    output_text = getattr(result, "output_text", None)
    if isinstance(output_text, str):
        return output_text.strip()
    text = str(result).strip()
    return "" if text == "None" else text


def _build_agent_list_message(agent_cards: dict) -> str:
    """Build a Slack mrkdwn-formatted list of registered agents from the card cache."""
    available = {aid: card for aid, card in agent_cards.items() if isinstance(card, dict)}
    if not available:
        return "現在、利用可能なエージェントは登録されていません。"
    lines = ["*利用可能なエージェント一覧*\n"]
    for agent_id in sorted(available):
        card = available[agent_id]
        name = str(card.get("name", agent_id)).strip() or agent_id
        desc = str(card.get("description", "")).strip()
        skills = card.get("skills", [])
        skill_names = [s.get("name", "") for s in skills if isinstance(s, dict) and s.get("name")]
        line = f"• *{name}*"
        if desc:
            line += f"\n  {desc}"
        if skill_names:
            line += f"\n  スキル: {', '.join(skill_names)}"
        lines.append(line)
    return "\n".join(lines)


def _generate_unrouted_fallback_response(user_text: str, correlation_id: str) -> str:
    """Generate a direct response from verification-agent's own LLM when no execution agent is selected."""
    if Agent is None or BedrockModel is None:
        _log(
            "WARN",
            "unrouted_llm_unavailable",
            {
                "correlation_id": correlation_id,
                "reason": "strands_dependencies_missing",
            },
        )
        return ""

    try:
        model = BedrockModel(
            model_id=_FALLBACK_MODEL_ID,
            region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"),
        )
        agent = Agent(
            model=model,
            system_prompt=(
                "You are the SlackAI verification agent. "
                "No execution agent is available for this request, so answer directly. "
                "Respond in Japanese, be concise, and avoid mentioning internal routing."
            ),
        )
        result = agent(
            user_text or "ユーザーからの入力が空です。補助的に案内してください。"
        )
        response_text = _extract_text_from_model_output(result)
        if response_text:
            return response_text
    except Exception as e:
        _log(
            "WARN",
            "unrouted_llm_failed",
            {
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
            },
        )
        return ""

    return ""


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
        _log(
            "WARN",
            "file_artifact_decode_error",
            {
                "error": str(e),
                "fileName": name,
                "mimeType": mime,
            },
        )
        return None
    return (file_bytes, name, mime)


def _get_slack_file_bytes(bot_token: str, file_id: str) -> Optional[bytes]:
    """
    Get file bytes from Slack: files.info for fresh download URL, then GET with bot token.

    Per Slack best practice: event payload URLs may be stale; use files.info for fresh URL.
    """
    if not bot_token or not file_id:
        return None
    try:
        info_resp = requests.get(
            "https://slack.com/api/files.info",
            headers={"Authorization": f"Bearer {bot_token}"},
            params={"file": file_id},
            timeout=10,
        )
        info_resp.raise_for_status()
        data = info_resp.json()
        if not data.get("ok"):
            return None
        file_info = data.get("file", {})
        download_url = file_info.get("url_private_download") or file_info.get(
            "url_private"
        )
        if not download_url:
            return None
        down_resp = requests.get(
            download_url,
            headers={"Authorization": f"Bearer {bot_token}"},
            timeout=30,
            stream=True,
        )
        down_resp.raise_for_status()
        return down_resp.content
    except Exception as e:
        _log(
            "WARN",
            "slack_file_download_failed",
            {
                "file_id": file_id,
                "error": str(e),
                "error_type": type(e).__name__,
            },
        )
        return None


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
        task_payload = (
            json.loads(raw_prompt) if isinstance(raw_prompt, str) else raw_prompt
        )

        correlation_id = task_payload.get("correlation_id", correlation_id)
        channel = task_payload.get("channel", "")
        text = task_payload.get("text", "")
        bot_token = task_payload.get("bot_token", "")
        thread_ts = task_payload.get("thread_ts")
        message_ts = task_payload.get(
            "message_ts"
        )  # For reaction swap (eyes -> checkmark)
        team_id = task_payload.get("team_id", "")
        user_id = task_payload.get("user_id", "")
        attachments = task_payload.get("attachments", [])
        current_message_ts = task_payload.get("message_ts")

        _log(
            "INFO",
            "a2a_task_received",
            {
                "correlation_id": correlation_id,
                "channel": channel,
                "text_length": len(text) if text else 0,
                "attachment_count": len(attachments),
                "has_thread_ts": bool(thread_ts),
            },
        )
        _log(
            "INFO",
            "a2a_auth_event",
            {
                "correlation_id": correlation_id,
                "action": "ReceiveTask",
                "result": "allowed",
                "source_team_id": team_id[:4] + "***" if team_id else "",
                "source_user_id": user_id[:4] + "***" if user_id else "",
                "channel": channel,
                "auth_method": "SigV4",
            },
        )

        # 1. Existence Check
        if bot_token and (team_id or user_id or channel):
            try:
                check_entity_existence(
                    bot_token=bot_token,
                    team_id=team_id,
                    user_id=user_id,
                    channel_id=channel,
                )
                _log(
                    "INFO",
                    "existence_check_passed",
                    {"correlation_id": correlation_id, "team_id": team_id},
                )
            except ExistenceCheckError as e:
                _log(
                    "ERROR",
                    "existence_check_failed",
                    {
                        "correlation_id": correlation_id,
                        "team_id": team_id,
                        "error": str(e),
                    },
                )
                return json.dumps(
                    {
                        "status": "error",
                        "error_code": "existence_check_failed",
                        "error_message": "Entity verification failed",
                        "correlation_id": correlation_id,
                    }
                )

        # 2. Whitelist Authorization
        try:
            auth_result = authorize_request(
                team_id=team_id, user_id=user_id, channel_id=channel
            )
            if not auth_result.authorized:
                _log(
                    "ERROR",
                    "authorization_failed",
                    {
                        "correlation_id": correlation_id,
                        "team_id": team_id,
                        "unauthorized_entities": auth_result.unauthorized_entities,
                    },
                )
                return json.dumps(
                    {
                        "status": "error",
                        "error_code": "authorization_failed",
                        "error_message": "Authorization failed",
                        "correlation_id": correlation_id,
                    }
                )
        except Exception as e:
            _log(
                "ERROR",
                "authorization_error",
                {
                    "correlation_id": correlation_id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "traceback": traceback.format_exc(),
                },
            )
            return json.dumps(
                {
                    "status": "error",
                    "error_code": "authorization_error",
                    "error_message": "Authorization check failed",
                    "correlation_id": correlation_id,
                }
            )

        # 3. Rate Limiting
        try:
            if team_id or user_id:
                is_allowed, _ = check_rate_limit(team_id=team_id, user_id=user_id)
                if not is_allowed:
                    _log(
                        "ERROR",
                        "rate_limit_exceeded",
                        {
                            "correlation_id": correlation_id,
                            "team_id": team_id,
                            "user_id": user_id,
                        },
                    )
                    return json.dumps(
                        {
                            "status": "error",
                            "error_code": "rate_limit_exceeded",
                            "error_message": "Rate limit exceeded. Please try again in a moment.",
                            "correlation_id": correlation_id,
                        }
                    )
        except RateLimitExceededError:
            return json.dumps(
                {
                    "status": "error",
                    "error_code": "rate_limit_exceeded",
                    "error_message": "Rate limit exceeded. Please try again in a moment.",
                    "correlation_id": correlation_id,
                }
            )
        except Exception as e:
            # Intentional fail-open: rate limit infra failure should not block user requests.
            _log(
                "WARN",
                "rate_limit_check_error",
                {
                    "correlation_id": correlation_id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
            )

        # 3.5. Fetch current Slack thread context and inject into prompt text
        thread_context = None
        if bot_token and channel and thread_ts:
            try:
                thread_context = build_current_thread_context(
                    bot_token=bot_token,
                    channel_id=channel,
                    thread_ts=thread_ts,
                    correlation_id=correlation_id,
                    current_message_ts=current_message_ts,
                )
                # thread_context is passed separately to OrchestrationRequest;
                # _build_prompt injects it as ## スレッドコンテキスト.
                # Do NOT prepend here to avoid duplication in the LLM prompt.
            except Exception as e:
                _log(
                    "WARN",
                    "thread_context_preprocess_error",
                    {
                        "correlation_id": correlation_id,
                        "error": str(e),
                        "error_type": type(e).__name__,
                    },
                )
                # Fail-open: continue with original text

        # 3.6. Resolve Slack message URLs in text
        if text and bot_token:
            try:
                text = resolve_slack_urls(text, bot_token, correlation_id)
            except Exception as e:
                _log(
                    "WARN",
                    "slack_url_resolution_error",
                    {
                        "correlation_id": correlation_id,
                        "error": str(e),
                        "error_type": type(e).__name__,
                    },
                )
                # Fail-open: continue with original text

        # Enrich attachments with S3 pre-signed URLs (US4): download from Slack, upload to S3
        # US3 (FR-012): max 5 files per request; excess are skipped with warning
        MAX_FILES_PER_REQUEST = 5
        execution_attachments = attachments
        did_s3_upload = False
        if attachments and bot_token:
            if len(attachments) > MAX_FILES_PER_REQUEST:
                _log(
                    "WARN",
                    "attachments_exceed_limit",
                    {
                        "correlation_id": correlation_id,
                        "attachment_count": len(attachments),
                        "max_allowed": MAX_FILES_PER_REQUEST,
                        "message": f"Only first {MAX_FILES_PER_REQUEST} files will be processed",
                    },
                )
                attachments = attachments[:MAX_FILES_PER_REQUEST]
            enriched = []
            for att in attachments:
                file_id = att.get("id")
                file_name = att.get("name", "unknown")
                mimetype = att.get("mimetype", "application/octet-stream")
                size = att.get("size", 0)
                file_bytes = _get_slack_file_bytes(bot_token, file_id)
                if not file_bytes:
                    _log(
                        "WARN",
                        "attachment_slack_download_failed",
                        {
                            "correlation_id": correlation_id,
                            "file_id": file_id,
                        },
                    )
                    continue
                try:
                    s3_key = upload_file_to_s3(
                        file_bytes, correlation_id, file_id, file_name, mimetype
                    )
                    presigned_url = generate_presigned_url(s3_key)
                    enriched.append(
                        {
                            "id": file_id,
                            "name": file_name,
                            "mimetype": mimetype,
                            "size": size,
                            "presigned_url": presigned_url,
                        }
                    )
                except Exception as e:
                    _log(
                        "ERROR",
                        "attachment_s3_upload_failed",
                        {
                            "correlation_id": correlation_id,
                            "file_id": file_id,
                            "error": str(e),
                        },
                    )
            if enriched:
                execution_attachments = enriched
                did_s3_upload = True

        # Orchestration loop — dispatches to multiple execution agents via A2A, iterates until done
        is_processing = True
        _log(
            "INFO",
            "delegating_to_orchestration_loop",
            {"correlation_id": correlation_id, "channel": channel},
        )

        max_turns = int(os.environ.get("MAX_AGENT_TURNS", "5"))
        orch_request = OrchestrationRequest(
            user_text=text,
            thread_context=thread_context,
            file_references=execution_attachments,
            available_agents=get_all_cards(),
            correlation_id=correlation_id,
            max_turns=max_turns,
            channel=channel,
            bot_token=bot_token,
        )

        try:
            orch_result = run_orchestration_loop(orch_request, get_all_cards(), _bedrock_model)
            response_text = orch_result.synthesized_text
            if orch_result.completion_status == "partial":
                response_text += "\n（注: 制限により一部のタスクを完了できませんでした）"

            file_artifact = None
            if orch_result.file_artifact:
                file_tuple = parse_file_artifact({"file_artifact": orch_result.file_artifact})
                if file_tuple:
                    file_bytes, file_name, mime_type = file_tuple
                    size_bytes = len(file_bytes)
                    if size_bytes > SQS_FILE_ARTIFACT_SIZE_THRESHOLD:
                        try:
                            s3_key = upload_generated_file_to_s3(
                                file_bytes, correlation_id, file_name, mime_type
                            )
                            presigned_url = generate_presigned_url_for_generated_file(s3_key)
                            file_artifact = build_file_artifact_s3(presigned_url, file_name, mime_type)
                            _log(
                                "INFO",
                                "file_artifact_s3_routed",
                                {
                                    "correlation_id": correlation_id,
                                    "size_bytes": size_bytes,
                                    "artifact_type": "s3",
                                },
                            )
                        except Exception as e:
                            _log(
                                "ERROR",
                                "file_artifact_s3_upload_failed",
                                {"correlation_id": correlation_id, "error": str(e)},
                            )
                            send_slack_post_request(
                                channel=channel,
                                thread_ts=thread_ts,
                                text=_get_user_friendly_error("generic"),
                                bot_token=bot_token,
                                correlation_id=correlation_id,
                                message_ts=message_ts,
                            )
                            is_processing = False
                            return json.dumps(
                                {
                                    "status": "error",
                                    "error_code": "file_upload_failed",
                                    "error_message": str(e),
                                    "correlation_id": correlation_id,
                                }
                            )
                    else:
                        file_artifact = build_file_artifact(file_bytes, file_name, mime_type)
                        _log(
                            "INFO",
                            "file_artifact_inline_routed",
                            {
                                "correlation_id": correlation_id,
                                "size_bytes": size_bytes,
                                "artifact_type": "inline",
                            },
                        )

            send_slack_post_request(
                channel=channel,
                thread_ts=thread_ts,
                text=response_text,
                file_artifact=file_artifact,
                bot_token=bot_token,
                correlation_id=correlation_id,
                message_ts=message_ts,
            )
            _log(
                "INFO",
                "slack_post_request_sent",
                {
                    "correlation_id": correlation_id,
                    "channel": channel,
                    "has_text": bool(response_text),
                    "has_file": file_artifact is not None,
                },
            )

            duration_ms = (time.time() - start_time) * 1000
            is_processing = False
            _log(
                "INFO",
                "orchestration_completed",
                {
                    "correlation_id": correlation_id,
                    "duration_ms": round(duration_ms, 2),
                    "status": orch_result.completion_status,
                    "agents_called": orch_result.agents_called,
                },
            )
            return json.dumps({"status": "completed", "correlation_id": correlation_id})

        except Exception as e:
            is_processing = False
            tb_str = traceback.format_exc()
            _log(
                "ERROR",
                "orchestration_loop_error",
                {
                    "correlation_id": correlation_id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "traceback": tb_str,
                },
            )
            log_execution_error(correlation_id, e, tb_str)
            send_slack_post_request(
                channel=channel,
                thread_ts=thread_ts,
                text="エラーが発生しました。しばらくしてからお試しください。",
                bot_token=bot_token,
                correlation_id=correlation_id,
                message_ts=message_ts,
            )
            return json.dumps(
                {
                    "status": "error",
                    "error_code": "orchestration_error",
                    "error_message": str(e),
                    "correlation_id": correlation_id,
                }
            )
        finally:
            if did_s3_upload:
                try:
                    cleanup_request_files(correlation_id)
                except Exception as cleanup_err:
                    _log(
                        "WARN",
                        "s3_cleanup_failed",
                        {
                            "correlation_id": correlation_id,
                            "error": str(cleanup_err),
                        },
                    )

    except Exception as e:
        is_processing = False
        tb_str = traceback.format_exc()
        _log(
            "ERROR",
            "unhandled_exception",
            {
                "correlation_id": correlation_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "stack_trace": tb_str,
            },
        )
        log_execution_error(correlation_id, e, tb_str)
        return json.dumps(
            {
                "status": "error",
                "error_code": "internal_error",
                "error_message": "Internal server error",
                "correlation_id": correlation_id,
            }
        )
