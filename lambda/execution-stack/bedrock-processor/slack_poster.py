"""
Slack message posting utility.

This module provides a simple wrapper around the Slack Web API
for posting messages to Slack channels or threads.
"""

import re
from typing import Optional
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


def _is_valid_timestamp(ts: Optional[str]) -> bool:
    """
    Validate Slack timestamp format.
    
    Slack timestamps are in format: "1234567890.123456" (Unix timestamp with microseconds).
    This function validates that the timestamp matches the expected format.
    
    Args:
        ts: Timestamp string to validate (can be None)
        
    Returns:
        True if timestamp is valid format, False otherwise
        
    Examples:
        >>> _is_valid_timestamp("1234567890.123456")
        True
        >>> _is_valid_timestamp("invalid")
        False
        >>> _is_valid_timestamp(None)
        False
        >>> _is_valid_timestamp("")
        False
    """
    if not ts or not isinstance(ts, str):
        return False
    
    # Slack timestamp format: digits, dot, digits (e.g., "1234567890.123456")
    pattern = r"^\d+\.\d+$"
    return bool(re.match(pattern, ts))


def post_to_slack(channel: str, text: str, bot_token: str, thread_ts: Optional[str] = None) -> None:
    """
    Post a message to a Slack channel or thread.

    Args:
        channel: Slack channel ID (e.g., "C01234567" or "D01234567")
        text: Message text to post
        bot_token: Slack bot OAuth token (xoxb-...)
        thread_ts: Optional timestamp of parent message for thread replies.
                   If provided and valid, message is posted as thread reply.
                   If None or invalid, message is posted as new channel message.

    Raises:
        SlackApiError: If Slack API call fails
        ValueError: If channel or text is empty

    Example:
        >>> post_to_slack("C01234567", "Hello!", "xoxb-...")
        # Message posted to channel
        
        >>> post_to_slack("C01234567", "Reply!", "xoxb-...", thread_ts="1234567890.123456")
        # Message posted as thread reply
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

    # Build API call parameters
    params = {
        "channel": channel,
        "text": text,
    }
    
    # Add thread_ts if provided and valid
    if thread_ts and _is_valid_timestamp(thread_ts):
        params["thread_ts"] = thread_ts
        print(f"Posting message as thread reply to channel: {channel}, thread_ts: {thread_ts}")
    elif thread_ts:
        # Invalid timestamp format - log warning and fall back to channel message
        print(f"WARNING: Invalid thread_ts format '{thread_ts}', falling back to channel message")
        print(f"Posting message to channel: {channel}")
    else:
        print(f"Posting message to channel: {channel}")
    
    print(f"Message length: {len(text)} characters")

    try:
        # Post message to Slack (as thread reply if thread_ts provided, otherwise as channel message)
        response = client.chat_postMessage(**params)

        if response["ok"]:
            if thread_ts and _is_valid_timestamp(thread_ts):
                print(f"Message posted successfully as thread reply to channel: {channel}, thread_ts: {thread_ts}")
            else:
                print(f"Message posted successfully to channel: {channel}")
        else:
            error = response.get("error", "Unknown error")
            raise SlackApiError(f"Slack API error: {error}", response=response)

    except SlackApiError as e:
        # Slack API errors
        error_code = e.response.get("error", "") if hasattr(e, "response") else ""
        
        # Handle thread reply specific errors - fall back to channel message
        if error_code in ["message_not_found", "invalid_thread_ts"]:
            print(f"WARNING: Thread reply failed ({error_code}), falling back to channel message")
            print(f"Error: {e.response.get('error') if hasattr(e, 'response') else str(e)}")
            
            # Retry as channel message (without thread_ts)
            try:
                fallback_params = {
                    "channel": channel,
                    "text": text,
                }
                response = client.chat_postMessage(**fallback_params)
                if response["ok"]:
                    print(f"Message posted successfully to channel (fallback): {channel}")
                    return  # Successfully posted as channel message
                else:
                    # Fallback also failed - raise original error
                    raise SlackApiError(f"Slack API error: {error_code}", response=e.response)
            except Exception as fallback_error:
                # Fallback failed - raise original error
                raise SlackApiError(f"Slack API error: {error_code}", response=e.response)
        
        # Re-raise other errors (channel_not_found, not_in_channel, etc.)
        print(f"Slack API error: {e.response.get('error') if hasattr(e, 'response') else str(e)}")
        raise

    except Exception as e:
        # Unexpected errors
        print(f"Unexpected error posting to Slack: {str(e)}")
        raise

