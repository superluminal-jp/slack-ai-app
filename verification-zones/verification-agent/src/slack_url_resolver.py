"""
Slack message URL resolver for Verification Agent pipeline.

Detects Slack message URLs in user text, validates referenced channels against
the whitelist, fetches thread context via conversations.replies, and injects
the thread context into the text before delegation to the Execution Agent.

Fail-open per URL: whitelist miss, API errors, or network failures skip the
URL with a warning log. Successfully resolved URLs are removed from the user
text so downstream agents do not fetch the same thread again.
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional

import requests

from authorization import load_whitelist_config
from logger_util import get_logger, log

_logger = get_logger()

MAX_URLS_PER_MESSAGE = 3
MAX_REPLIES_PER_THREAD = 20

# Matches URLs like https://workspace.slack.com/archives/C0ABC/p1706123456789012
_SLACK_URL_RE = re.compile(
    r"https?://[a-zA-Z0-9\-]+\.slack\.com/archives/([A-Z0-9]+)/p(\d{16})"
)


def _log(level: str, event_type: str, data: dict) -> None:
    log(_logger, level, event_type, data, service="verification-agent")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class SlackUrlMatch:
    """Parsed Slack message URL."""
    channel_id: str
    message_ts: str  # Slack API format: "1706123456.789012"
    original_url: str


@dataclass
class ResolvedThread:
    """Result of fetching a Slack thread."""
    channel_id: str
    messages: List[dict] = field(default_factory=list)
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# URL parsing
# ---------------------------------------------------------------------------

def parse_slack_urls(text: str) -> List[SlackUrlMatch]:
    """
    Extract Slack message URLs from text and convert timestamps.

    Args:
        text: User message text potentially containing Slack URLs.

    Returns:
        List of SlackUrlMatch (capped at MAX_URLS_PER_MESSAGE).
    """
    matches = []
    for m in _SLACK_URL_RE.finditer(text):
        channel_id = m.group(1)
        raw_ts = m.group(2)
        # Convert p1706123456789012 → 1706123456.789012
        message_ts = raw_ts[:10] + "." + raw_ts[10:]
        matches.append(SlackUrlMatch(
            channel_id=channel_id,
            message_ts=message_ts,
            original_url=m.group(0),
        ))
        if len(matches) >= MAX_URLS_PER_MESSAGE:
            break
    return matches


# ---------------------------------------------------------------------------
# Whitelist check
# ---------------------------------------------------------------------------

def check_channel_whitelisted(channel_id: str) -> bool:
    """
    Check if a channel is allowed by the whitelist.

    Returns True if:
    - channel_ids whitelist is empty (unconfigured → allow all)
    - channel_id is in the whitelist
    """
    whitelist = load_whitelist_config()
    channel_ids = whitelist.get("channel_ids", set())
    if not channel_ids:
        return True
    return channel_id in channel_ids


# ---------------------------------------------------------------------------
# Thread fetching
# ---------------------------------------------------------------------------

def fetch_thread_replies(
    bot_token: str,
    channel_id: str,
    thread_ts: str,
    limit: int = MAX_REPLIES_PER_THREAD,
) -> ResolvedThread:
    """
    Fetch thread replies from Slack using conversations.replies API.

    Uses requests (not slack_sdk WebClient) to match existing pipeline patterns.
    """
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
            return ResolvedThread(
                channel_id=channel_id,
                error=f"Slack API error: {data.get('error', 'unknown')}",
            )
        return ResolvedThread(
            channel_id=channel_id,
            messages=data.get("messages", []),
        )
    except Exception as e:
        return ResolvedThread(
            channel_id=channel_id,
            error=f"{type(e).__name__}: {e}",
        )


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

def format_thread_context(resolved: ResolvedThread) -> str:
    """
    Format resolved thread messages into human-readable context block.

    Bot messages (bot_id or subtype=="bot_message") → "Assistant: ..."
    Other messages → "User: ..."
    """
    lines = []
    for msg in resolved.messages:
        text = (msg.get("text") or "").strip()
        if not text:
            continue
        if msg.get("bot_id") or msg.get("subtype") == "bot_message":
            lines.append(f"Assistant: {text}")
        else:
            lines.append(f"User: {text}")

    header = f"[Referenced Slack Thread ({resolved.channel_id})]"
    footer = "[End Referenced Thread]"
    return f"{header}\n" + "\n".join(lines) + f"\n{footer}"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def resolve_slack_urls(text: str, bot_token: str, correlation_id: str) -> str:
    """
    Detect Slack message URLs, fetch threads, and prepend context to text.

    Fail-open: any per-URL failure is logged and skipped; unresolved URLs remain
    in the text while successfully resolved URLs are removed.

    Args:
        text: User message text.
        bot_token: Slack bot token for API calls.
        correlation_id: Request correlation ID for logging.

    Returns:
        Enriched text with thread context prepended. If no URL is resolved,
        returns original text unchanged.
    """
    urls = parse_slack_urls(text)
    if not urls:
        return text

    if len(urls) >= MAX_URLS_PER_MESSAGE:
        _log("WARN", "slack_url_limit_reached", {
            "correlation_id": correlation_id,
            "total_found": len(_SLACK_URL_RE.findall(text)),
            "max_processed": MAX_URLS_PER_MESSAGE,
        })

    context_blocks = []
    resolved_urls = []  # URLs successfully resolved (to remove from text)
    for url_match in urls:
        # Whitelist check
        try:
            if not check_channel_whitelisted(url_match.channel_id):
                _log("WARN", "slack_url_channel_not_whitelisted", {
                    "correlation_id": correlation_id,
                    "channel_id": url_match.channel_id,
                })
                continue
        except Exception as e:
            _log("WARN", "slack_url_whitelist_check_error", {
                "correlation_id": correlation_id,
                "channel_id": url_match.channel_id,
                "error": str(e),
            })
            continue

        # Fetch thread
        resolved = fetch_thread_replies(bot_token, url_match.channel_id, url_match.message_ts)
        if resolved.error:
            _log("WARN", "slack_url_fetch_error", {
                "correlation_id": correlation_id,
                "channel_id": url_match.channel_id,
                "error": resolved.error,
            })
            continue

        if not resolved.messages:
            _log("WARN", "slack_url_empty_thread", {
                "correlation_id": correlation_id,
                "channel_id": url_match.channel_id,
            })
            continue

        context_blocks.append(format_thread_context(resolved))
        resolved_urls.append(url_match.original_url)
        _log("INFO", "slack_url_resolved", {
            "correlation_id": correlation_id,
            "channel_id": url_match.channel_id,
            "message_count": len(resolved.messages),
        })

    if not context_blocks:
        return text

    # Remove resolved URLs from original text to prevent execution agent re-fetching
    cleaned_text = text
    for url in resolved_urls:
        cleaned_text = cleaned_text.replace(url, "")
    # Collapse multiple whitespace left by URL removal
    cleaned_text = re.sub(r"[ \t]+", " ", cleaned_text).strip()

    enriched = "\n\n".join(context_blocks)
    if not cleaned_text:
        return enriched
    return enriched + "\n\n" + cleaned_text
