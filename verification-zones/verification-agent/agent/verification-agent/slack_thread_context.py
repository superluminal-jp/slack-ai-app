"""
Slack thread context retrieval for Verification Agent preprocessing.

Fetches the current Slack thread (conversations.replies) and formats it into
an instruction-safe context block that can be prepended to user text.
"""

from typing import Optional

import requests

from logger_util import get_logger, log

_logger = get_logger()

MAX_THREAD_MESSAGES = 20


def _log(level: str, event_type: str, data: dict) -> None:
    log(_logger, level, event_type, data, service="verification-agent")


def build_current_thread_context(
    bot_token: str,
    channel_id: str,
    thread_ts: str,
    correlation_id: str,
    current_message_ts: Optional[str] = None,
    limit: int = MAX_THREAD_MESSAGES,
) -> str:
    """
    Fetch and format current thread context.

    Returns an empty string when context is unavailable so callers can fail-open.
    """
    if not bot_token or not channel_id or not thread_ts:
        return ""

    try:
        resp = requests.get(
            "https://slack.com/api/conversations.replies",
            headers={"Authorization": f"Bearer {bot_token}"},
            params={"channel": channel_id, "ts": thread_ts, "limit": str(limit)},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            _log(
                "WARN",
                "thread_context_fetch_failed",
                {
                    "correlation_id": correlation_id,
                    "channel_id": channel_id,
                    "thread_ts": thread_ts,
                    "error": data.get("error", "unknown"),
                },
            )
            return ""

        messages = data.get("messages", [])
        lines = []
        for msg in messages:
            ts = msg.get("ts")
            if current_message_ts and ts == current_message_ts:
                # Skip current inbound message to avoid duplicate injection.
                continue
            text = (msg.get("text") or "").strip()
            if not text:
                continue
            role = (
                "Assistant"
                if msg.get("bot_id") or msg.get("subtype") == "bot_message"
                else "User"
            )
            lines.append(f"{role}: {text}")

        if not lines:
            return ""

        _log(
            "INFO",
            "thread_context_fetched",
            {
                "correlation_id": correlation_id,
                "channel_id": channel_id,
                "thread_ts": thread_ts,
                "message_count": len(lines),
            },
        )
        return (
            "[Current Slack Thread Context]\n"
            + "\n".join(lines)
            + "\n[End Current Slack Thread Context]"
        )
    except Exception as e:
        _log(
            "WARN",
            "thread_context_fetch_error",
            {
                "correlation_id": correlation_id,
                "channel_id": channel_id,
                "thread_ts": thread_ts,
                "error": str(e),
                "error_type": type(e).__name__,
            },
        )
        return ""
