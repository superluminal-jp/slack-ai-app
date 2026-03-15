"""
get_channel_history Strands tool for Slack Search Agent.

Retrieves the latest messages from a Slack channel.
Access is restricted to the calling channel and public channels.
"""

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
    except (ValueError, OSError, OverflowError, TypeError):
        return ts


@tool
def get_channel_history(
    channel_id: str,
    calling_channel: str,
    bot_token: str,
    limit: int = 20,
) -> str:
    """
    Retrieve the latest messages from a Slack channel.

    Args:
        channel_id: Slack channel ID to retrieve history from
        calling_channel: The channel ID that originated the request (always accessible)
        bot_token: Slack bot token (xoxb-) for API calls
        limit: Maximum number of messages to return (1-20, default 20)

    Returns:
        Formatted string with latest messages (newest first), or an error message
    """
    limit = max(1, min(limit, 20))

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

    # Fetch channel history
    client = SlackClient(bot_token=bot_token)
    try:
        messages = client.get_channel_history(channel_id=channel_id, limit=limit)
    except SlackApiError as e:
        return f"Slack APIへのアクセスに失敗しました: {e}"

    if not messages:
        return f"チャンネル {channel_id} にメッセージが見つかりませんでした。"

    lines = [f"チャンネル {channel_id} の最新メッセージ（{len(messages)}件）:\n"]
    for msg in messages:
        ts = msg.get("ts", "")
        user = msg.get("user") or "bot"
        text = (msg.get("text") or "").strip()
        lines.append(f"[{_ts_to_jst(ts)}] {user}: {text}")

    return "\n".join(lines)
