"""
Channel access control for Slack Search Agent.

Determines whether a given channel is accessible based on:
- The calling channel (always allowed)
- Public channels (allowed)
- Other private channels (denied)
"""

from dataclasses import dataclass

from slack_sdk import WebClient


@dataclass
class ChannelAccessDecision:
    """Result of a channel access check."""
    channel_id: str
    allowed: bool
    reason: str  # "calling_channel" | "public_channel" | "private_channel"


def is_accessible(
    channel_id: str,
    calling_channel: str,
    bot_token: str,
) -> ChannelAccessDecision:
    """
    Determine whether channel_id is accessible from calling_channel.

    Access rules:
    - The calling channel itself: always allowed (reason: "calling_channel")
    - Public channels: allowed (reason: "public_channel")
    - Other private channels: denied (reason: "private_channel")

    Args:
        channel_id: The channel to check access for
        calling_channel: The channel that originated the request
        bot_token: Slack bot token for conversations.info API call

    Returns:
        ChannelAccessDecision with allowed flag and reason

    Raises:
        SlackApiError: If conversations.info API call fails
    """
    # The calling channel is always accessible
    if channel_id == calling_channel:
        return ChannelAccessDecision(
            channel_id=channel_id,
            allowed=True,
            reason="calling_channel",
        )

    # Check channel privacy via conversations.info
    client = WebClient(token=bot_token)
    response = client.conversations_info(channel=channel_id)

    channel_info = response.get("channel", {})
    is_private = channel_info.get("is_private", True)  # Default to private if unknown

    if is_private:
        return ChannelAccessDecision(
            channel_id=channel_id,
            allowed=False,
            reason="private_channel",
        )

    return ChannelAccessDecision(
        channel_id=channel_id,
        allowed=True,
        reason="public_channel",
    )
