"""
Slack API client wrapper for Slack Search Agent.

Provides a thin wrapper around slack_sdk.WebClient with:
- 10-second timeout
- SlackApiError catch + logging
- Consistent return types for channel info, history, and thread replies
"""

from typing import Any, Dict, List, Optional

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from logger_util import get_logger, log

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    log(_logger, level, event_type, data, service="slack-search-agent")


class SlackClient:
    """Wrapper around slack_sdk.WebClient for Slack Search Agent operations."""

    def __init__(self, bot_token: str, timeout: int = 10) -> None:
        self._client = WebClient(token=bot_token, timeout=timeout)

    def get_channel_info(self, channel_id: str) -> Optional[Dict[str, Any]]:
        """
        Get channel information via conversations.info.

        Returns:
            Channel dict with at minimum {"id": ..., "is_private": ...},
            or None if the API call fails.

        Raises:
            SlackApiError: If the API returns an error
        """
        try:
            response = self._client.conversations_info(channel=channel_id)
            return response.get("channel")
        except SlackApiError as e:
            _log("ERROR", "conversations_info_error", {
                "channel_id": channel_id,
                "error": str(e),
            })
            raise

    def get_channel_history(
        self,
        channel_id: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Get recent messages from a channel via conversations.history.

        Args:
            channel_id: Slack channel ID
            limit: Maximum number of messages to retrieve (1-20)

        Returns:
            List of message dicts (newest first)

        Raises:
            SlackApiError: If the API returns an error
        """
        try:
            response = self._client.conversations_history(
                channel=channel_id,
                limit=min(limit, 20),
            )
            return response.get("messages", [])
        except SlackApiError as e:
            _log("ERROR", "conversations_history_error", {
                "channel_id": channel_id,
                "error": str(e),
            })
            raise

    def get_thread_replies(
        self,
        channel_id: str,
        thread_ts: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Get all messages in a thread via conversations.replies.

        Args:
            channel_id: Slack channel ID containing the thread
            thread_ts: Timestamp of the parent message
            limit: Maximum number of messages to retrieve (1-20)

        Returns:
            List of message dicts (parent first, then replies)

        Raises:
            SlackApiError: If the API returns an error
        """
        try:
            response = self._client.conversations_replies(
                channel=channel_id,
                ts=thread_ts,
                limit=min(limit, 20),
            )
            return response.get("messages", [])
        except SlackApiError as e:
            _log("ERROR", "conversations_replies_error", {
                "channel_id": channel_id,
                "thread_ts": thread_ts,
                "error": str(e),
            })
            raise
