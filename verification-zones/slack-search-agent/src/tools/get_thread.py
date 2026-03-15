"""
get_thread Strands tool for Slack Search Agent.

Retrieves all messages in a Slack thread from a URL.
Parses the channel ID and thread timestamp from the URL,
checks channel access, then fetches with conversations.replies.
"""

import re
from datetime import datetime, timezone, timedelta

from strands import tool

from channel_access import is_accessible
from slack_client import SlackClient
from slack_sdk.errors import SlackApiError


_JST = timezone(timedelta(hours=9))


def _ts_to_jst(ts: str) -> str:
    """Convert a Slack Unix timestamp string to a JST datetime string."""
    try:
        dt = datetime.fromtimestamp(float(ts), tz=_JST)
        return dt.strftime("%Y年%m月%d日 %H:%M:%S JST")
    except (ValueError, OSError):
        return ts

# Slack message URL pattern:
# https://*.slack.com/archives/CHANNEL_ID/pTIMESTAMP
# Timestamp in URL: "p1706123456789012" → "1706123456.789012"
SLACK_URL_PATTERN = re.compile(
    r"https://[^/]+\.slack\.com/archives/([A-Z0-9_]+)/p(\d{10})(\d{6})"
)


def _parse_slack_url(url: str):
    """
    Parse a Slack message URL into (channel_id, thread_ts).

    Returns:
        (channel_id, thread_ts) tuple, or (None, None) if invalid.
    """
    match = SLACK_URL_PATTERN.search(url)
    if not match:
        return None, None
    channel_id = match.group(1)
    ts = f"{match.group(2)}.{match.group(3)}"
    return channel_id, ts


@tool
def get_thread(
    slack_url: str,
    calling_channel: str,
    bot_token: str,
    limit: int = 20,
) -> str:
    """
    Retrieve all messages in a Slack thread from a message URL.

    Args:
        slack_url: Slack message URL (https://*.slack.com/archives/CHANNEL/pTIMESTAMP)
        calling_channel: The channel ID that originated the request (always accessible)
        bot_token: Slack bot token (xoxb-) for API calls
        limit: Maximum number of messages to return (1-20)

    Returns:
        Formatted string with thread messages, or an error message
    """
    limit = max(1, min(limit, 20))

    # Parse the Slack URL
    channel_id, thread_ts = _parse_slack_url(slack_url)
    if channel_id is None:
        return (
            f"無効な Slack URL 形式です: {slack_url}\n"
            "正しい形式: https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP"
        )

    # Check channel access
    try:
        access = is_accessible(channel_id, calling_channel, bot_token)
    except SlackApiError as e:
        return f"チャンネル情報の取得に失敗しました: {e}"

    if not access.allowed:
        return (
            f"指定のチャンネル（{channel_id}）はアクセス対象外です（プライベートチャンネル）。"
            "呼び出し元チャンネルと公開チャンネルのみアクセスできます。"
        )

    # Fetch thread replies
    client = SlackClient(bot_token=bot_token)
    try:
        messages = client.get_thread_replies(
            channel_id=channel_id,
            thread_ts=thread_ts,
            limit=limit,
        )
    except SlackApiError as e:
        return f"Slack APIへのアクセスに失敗しました: {e}"

    if not messages:
        return f"スレッドにメッセージが見つかりませんでした（URL: {slack_url}）"

    lines = [f"スレッド（{len(messages)}件）:\n"]
    for i, msg in enumerate(messages):
        ts = msg.get("ts", "")
        user = msg.get("user") or "bot"
        text = (msg.get("text") or "").strip()
        label = "親メッセージ" if i == 0 else f"返信 {i}"
        lines.append(f"[{label}][{_ts_to_jst(ts)}] {user}: {text}")

    return "\n".join(lines)
