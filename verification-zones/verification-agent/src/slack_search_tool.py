"""
Slack Search Strands tool factory for verification-agent.

Creates a @tool function bound to the calling channel and bot token so the
orchestration LLM can search Slack without managing credentials itself.
"""

from typing import Any

try:
    from strands import tool
except ImportError:  # pragma: no cover
    def tool(func: Any) -> Any:
        return func

from slack_search_client import SlackSearchClient


def make_slack_search_tool(channel: str, bot_token: str, correlation_id: str = ""):
    """
    Create a Strands @tool that searches Slack via the Slack Search Agent.

    The returned tool closes over channel, bot_token, and correlation_id so
    the LLM only needs to supply the search query.

    Args:
        channel: Slack channel ID that originated the request.
        bot_token: Slack bot token for Slack API access.
        correlation_id: Optional trace ID passed through to the agent.

    Returns:
        A Strands @tool-decorated function with signature (query: str) -> str.
    """

    @tool
    def slack_search(query: str) -> str:
        """
        Search Slack channels for messages matching the query.

        Searches the calling channel and any accessible public channels.
        Use when the user requests a Slack search, references a Slack URL,
        or asks to retrieve channel history or thread content.

        Args:
            query: Natural language search query or instruction.

        Returns:
            Formatted search results, or an error message if the search fails.
        """
        client = SlackSearchClient()
        try:
            return client.search(
                text=query,
                channel=channel,
                bot_token=bot_token,
                correlation_id=correlation_id or None,
            )
        except Exception as e:
            return f"Slack 検索中にエラーが発生しました: {e}"

    return slack_search
