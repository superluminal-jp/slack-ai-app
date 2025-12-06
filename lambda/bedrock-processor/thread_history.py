"""
Slack thread history retrieval module.

This module provides functionality to retrieve conversation history from Slack threads
for context-aware AI responses.
"""

from typing import List, Dict, Optional
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


def get_thread_history(
    client: WebClient,
    channel: str,
    thread_ts: str,
    limit: int = 20
) -> List[Dict[str, str]]:
    """
    Retrieve thread conversation history from Slack.
    
    This function fetches messages from a Slack thread using the conversations.replies API.
    Messages are returned in chronological order (oldest first).
    
    Args:
        client: Slack WebClient instance (authenticated with bot token)
        channel: Slack channel ID (e.g., "C01234567")
        thread_ts: Thread timestamp (parent message timestamp)
        limit: Maximum number of messages to retrieve (default: 20)
        
    Returns:
        List of message dictionaries with 'role' and 'content' keys:
        [
            {"role": "user", "content": "First message"},
            {"role": "assistant", "content": "Bot response"},
            {"role": "user", "content": "Second message"},
        ]
        
    Raises:
        SlackApiError: If Slack API call fails
        
    Example:
        >>> client = WebClient(token="xoxb-...")
        >>> history = get_thread_history(client, "C01234567", "1234567890.123456")
        >>> print(history)
        [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi!"}]
    """
    try:
        # Call Slack API to get thread replies
        response = client.conversations_replies(
            channel=channel,
            ts=thread_ts,
            limit=limit
        )
        
        if not response["ok"]:
            error = response.get("error", "Unknown error")
            raise SlackApiError(f"Slack API error: {error}", response=response)
        
        messages = response.get("messages", [])
        
        # Convert Slack messages to conversation history format
        # Include both user messages and bot responses (assistant role)
        history = []
        for msg in messages:
            # Extract message text
            text = msg.get("text", "").strip()
            if not text:
                continue
            
            # Determine role based on message type
            # Bot messages (our responses) -> "assistant"
            # User messages -> "user"
            if msg.get("bot_id") or msg.get("subtype") == "bot_message":
                # This is a bot message (assistant response)
                history.append({
                    "role": "assistant",
                    "content": text
                })
            else:
                # This is a user message
                history.append({
                    "role": "user",
                    "content": text
                })
        
        return history
        
    except SlackApiError:
        # Re-raise Slack API errors
        raise
    except Exception as e:
        # Wrap unexpected errors
        raise SlackApiError(f"Unexpected error retrieving thread history: {str(e)}", response={})


def build_conversation_context(
    thread_history: List[Dict[str, str]],
    current_message: str
) -> List[Dict[str, str]]:
    """
    Build conversation context for Bedrock API from thread history and current message.
    
    This function combines thread history with the current user message to create
    a complete conversation context for the AI model. The current message is added
    at the end as a new user message.
    
    Args:
        thread_history: List of previous messages in the thread (from get_thread_history)
                       Includes both user messages and assistant (bot) responses
        current_message: Current user message text (to be added at the end)
        
    Returns:
        List of messages in Bedrock API format:
        [
            {"role": "user", "content": "Previous message"},
            {"role": "assistant", "content": "Bot response"},
            {"role": "user", "content": "Current message"},
        ]
        
    Example:
        >>> history = [
        ...     {"role": "user", "content": "Hello"},
        ...     {"role": "assistant", "content": "Hi there!"}
        ... ]
        >>> context = build_conversation_context(history, "How are you?")
        >>> print(context)
        [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "How are you?"}
        ]
    """
    # Combine history with current message
    conversation = thread_history.copy()
    
    # Add current message as user message at the end
    if current_message.strip():
        conversation.append({
            "role": "user",
            "content": current_message.strip()
        })
    
    return conversation

