"""
search_messages Strands tool for Slack Search Agent.

Searches Slack channel messages by keyword using conversations.history
and client-side text filtering. Access is restricted to the calling
channel and public channels.
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
    except (ValueError, OSError):
        return ts


@tool
def search_messages(
    query: str,
    channel_id: str,
    calling_channel: str,
    bot_token: str,
    limit: int = 20,
) -> str:
    """
    Search for messages containing a keyword in a Slack channel.

    Args:
        query: Keyword or phrase to search for
        channel_id: Slack channel ID to search in
        calling_channel: The channel ID that originated the request (always accessible)
        bot_token: Slack bot token (xoxb-) for API calls
        limit: Maximum number of matching messages to return (1-20)

    Returns:
        Formatted string with matching messages, or an error/not-found message
    """
    if not query or not query.strip():
        return "検索クエリが空です。検索キーワードを指定してください。"

    limit = max(1, min(limit, 20))

    # Check channel access
    try:
        access = is_accessible(channel_id, calling_channel, bot_token)
    except SlackApiError as e:
        return f"チャンネル情報の取得に失敗しました: {e}"

    if not access.allowed:
        return (
            f"指定のチャンネル（{channel_id}）はアクセス対象外です（プライベートチャンネル）。"
            "呼び出し元チャンネルと公開チャンネルのみ検索できます。"
        )

    # Fetch messages and filter by keyword
    client = SlackClient(bot_token=bot_token)
    try:
        messages = client.get_channel_history(channel_id=channel_id, limit=100)
    except SlackApiError as e:
        return f"Slack APIへのアクセスに失敗しました: {e}"

    query_lower = query.lower()
    matched = [
        msg for msg in messages
        if query_lower in (msg.get("text") or "").lower()
    ][:limit]

    if not matched:
        return f"「{query}」に一致するメッセージは見つかりませんでした。"

    lines = [f"「{query}」の検索結果（{len(matched)}件）:\n"]
    for msg in matched:
        ts = msg.get("ts", "")
        user = msg.get("user") or "bot"
        text = (msg.get("text") or "").strip()
        lines.append(f"[{_ts_to_jst(ts)}] {user}: {text}")

    return "\n".join(lines)
