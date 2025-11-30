"""
Slack message posting utility.

This module provides a simple wrapper around the Slack Web API
for posting messages to Slack channels.
"""

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


def post_to_slack(channel: str, text: str, bot_token: str) -> None:
    """
    Post a message to a Slack channel.

    Args:
        channel: Slack channel ID (e.g., "C01234567" or "D01234567")
        text: Message text to post
        bot_token: Slack bot OAuth token (xoxb-...)

    Raises:
        SlackApiError: If Slack API call fails
        ValueError: If channel or text is empty

    Example:
        >>> post_to_slack("C01234567", "Hello!", "xoxb-...")
        # Message posted to channel
    """
    # Validate input
    if not channel or not channel.strip():
        raise ValueError("Channel cannot be empty")
    if not text or not text.strip():
        raise ValueError("Text cannot be empty")
    if not bot_token or not bot_token.strip():
        raise ValueError("Bot token cannot be empty")

    # Initialize Slack Web Client
    client = WebClient(token=bot_token)

    try:
        # Post message to Slack
        print(f"Posting message to channel: {channel}")
        print(f"Message length: {len(text)} characters")

        response = client.chat_postMessage(channel=channel, text=text)

        if response["ok"]:
            print(f"Message posted successfully to channel: {channel}")
        else:
            error = response.get("error", "Unknown error")
            raise SlackApiError(f"Slack API error: {error}", response=response)

    except SlackApiError as e:
        # Slack API errors
        print(f"Slack API error: {e.response.get('error') if hasattr(e, 'response') else str(e)}")
        raise

    except Exception as e:
        # Unexpected errors
        print(f"Unexpected error posting to Slack: {str(e)}")
        raise

