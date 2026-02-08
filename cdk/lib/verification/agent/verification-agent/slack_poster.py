"""
Slack message posting utility for Verification Agent.

This module provides functionality to post messages to Slack channels or threads.
Includes message size splitting for messages exceeding Slack's 4000 character limit.
"""

import json
import re
import time
from typing import Optional, List
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


# ---------------------------------------------------------------------------
# Structured logging helpers (replaces Lambda logger module)
# ---------------------------------------------------------------------------
def _log(level, event_type, data=None, exc=None):
    entry = {"level": level, "event_type": event_type, "service": "verification-agent", "timestamp": time.time()}
    if data:
        entry.update(data)
    if exc:
        entry["exception"] = str(exc)
    print(json.dumps(entry, default=str))


def log_info(event_type, data):
    _log("INFO", event_type, data)


def log_warn(event_type, data, exc=None):
    _log("WARN", event_type, data, exc)


def log_error(event_type, data, exc=None, include_stack_trace=True):
    _log("ERROR", event_type, data, exc)


def log_exception(event_type, data, exc):
    _log("ERROR", event_type, data, exc)


def _is_valid_timestamp(ts: Optional[str]) -> bool:
    """
    Validate Slack timestamp format.

    Slack timestamps are in format: "1234567890.123456" (Unix timestamp with microseconds).
    This function validates that the timestamp matches the expected format.

    Args:
        ts: Timestamp string to validate (can be None)

    Returns:
        True if timestamp is valid format, False otherwise
    """
    if not ts or not isinstance(ts, str):
        return False

    # Slack timestamp format: digits, dot, digits (e.g., "1234567890.123456")
    pattern = r"^\d+\.\d+$"
    return bool(re.match(pattern, ts))


def split_message_if_needed(text: str, max_length: int = 4000) -> List[str]:
    """
    Split a message into chunks if it exceeds the maximum length.

    Attempts to split at sentence boundaries (periods, exclamation marks, question marks)
    to preserve readability. Falls back to character-based splitting if needed.

    Args:
        text: Message text to split
        max_length: Maximum length per chunk (default: 4000 for Slack)

    Returns:
        List of message chunks
    """
    if len(text) <= max_length:
        return [text]

    chunks: List[str] = []
    remaining = text

    while len(remaining) > max_length:
        # Try to split at sentence boundary
        # Look for sentence endings followed by space or newline
        sentence_end_pattern = r"([.!?])\s+"
        match = re.search(sentence_end_pattern, remaining[: max_length + 100])

        if match:
            # Split at sentence boundary
            split_pos = match.end()
            chunk = remaining[:split_pos].rstrip()
            remaining = remaining[split_pos:].lstrip()
        else:
            # No sentence boundary found, split at max_length
            chunk = remaining[:max_length]
            remaining = remaining[max_length:]

        chunks.append(chunk)

    # Add remaining text as final chunk
    if remaining:
        chunks.append(remaining)

    return chunks


def post_to_slack(
    channel: str,
    text: str,
    bot_token: str,
    thread_ts: Optional[str] = None,
) -> None:
    """
    Post a message to a Slack channel or thread.

    If the message exceeds 4000 characters, it will be split into multiple messages.
    All messages will be posted as thread replies if thread_ts is provided.

    Args:
        channel: Slack channel ID (e.g., "C01234567" or "D01234567")
        text: Message text to post
        bot_token: Slack bot OAuth token
        thread_ts: Optional thread timestamp for thread replies

    Raises:
        ValueError: If channel, text, or bot_token is invalid
        SlackApiError: If Slack API call fails
    """
    if not channel or not isinstance(channel, str) or not channel.strip():
        raise ValueError("channel must be a non-empty string")
    if not text or not isinstance(text, str) or not text.strip():
        raise ValueError("text must be a non-empty string")
    if not bot_token or not isinstance(bot_token, str) or not bot_token.strip():
        raise ValueError("bot_token must be a non-empty string")
    if not bot_token.startswith("xoxb-"):
        raise ValueError("bot_token must be a valid Slack bot token (starts with xoxb-)")

    if thread_ts and not _is_valid_timestamp(thread_ts):
        raise ValueError("thread_ts must be a valid Slack timestamp format")

    # Create Slack client
    client = WebClient(token=bot_token)

    # Split message if needed (Slack limit: 4000 characters)
    message_chunks = split_message_if_needed(text, max_length=4000)

    # Post each chunk
    for i, chunk in enumerate(message_chunks):
        try:
            params: dict = {
                "channel": channel,
                "text": chunk,
            }

            # Add thread_ts for thread replies (all chunks in same thread)
            if thread_ts:
                params["thread_ts"] = thread_ts

            # Post message to Slack
            response = client.chat_postMessage(**params)

            log_info(
                "slack_message_posted",
                {
                    "channel": channel,
                    "thread_ts": thread_ts,
                    "chunk_index": i + 1,
                    "total_chunks": len(message_chunks),
                    "chunk_length": len(chunk),
                    "message_ts": response.get("ts"),
                },
            )

        except SlackApiError as e:
            error = e.response.get("error", "")

            # Retry logic for transient errors
            retryable_errors = [
                "rate_limited",
                "internal_error",
                "request_timeout",
                "fatal_error",
            ]

            if error in retryable_errors and i == 0:
                # Only retry on first chunk to avoid duplicate messages
                # Retry with exponential backoff (simple implementation)
                max_retries = 2
                for retry_attempt in range(max_retries):
                    wait_time = (2 ** retry_attempt) * 1  # 1s, 2s
                    log_warn(
                        "slack_post_message_retry",
                        {
                            "channel": channel,
                            "thread_ts": thread_ts,
                            "chunk_index": i + 1,
                            "error": error,
                            "retry_attempt": retry_attempt + 1,
                            "wait_time": wait_time,
                        },
                    )
                    time.sleep(wait_time)
                    try:
                        response = client.chat_postMessage(**params)
                        log_info(
                            "slack_message_posted_after_retry",
                            {
                                "channel": channel,
                                "thread_ts": thread_ts,
                                "chunk_index": i + 1,
                                "retry_attempt": retry_attempt + 1,
                                "message_ts": response.get("ts"),
                            },
                        )
                        break  # Success, exit retry loop
                    except SlackApiError as retry_error:
                        if retry_attempt == max_retries - 1:
                            # Last retry failed, raise original error
                            log_exception(
                                "slack_post_message_failed_after_retries",
                                {
                                    "channel": channel,
                                    "thread_ts": thread_ts,
                                    "chunk_index": i + 1,
                                    "total_chunks": len(message_chunks),
                                    "error": error,
                                    "retry_attempts": max_retries,
                                },
                                e,
                            )
                            raise
                        # Continue to next retry
                        continue
            else:
                # Non-retryable error or not first chunk
                log_exception(
                    "slack_post_message_failed",
                    {
                        "channel": channel,
                        "thread_ts": thread_ts,
                        "chunk_index": i + 1,
                        "total_chunks": len(message_chunks),
                        "error": error,
                    },
                    e,
                )
                raise

        except Exception as e:
            log_exception(
                "slack_post_message_unexpected_error",
                {
                    "channel": channel,
                    "thread_ts": thread_ts,
                    "chunk_index": i + 1,
                    "total_chunks": len(message_chunks),
                },
                e,
            )
            raise


def post_file_to_slack(
    channel: str,
    file_bytes: bytes,
    file_name: str,
    mime_type: str,
    bot_token: str,
    thread_ts: Optional[str] = None,
) -> None:
    """
    Upload a file to a Slack channel or thread using files.getUploadURLExternal
    and files.completeUploadExternal (via WebClient.files_upload_v2).

    Args:
        channel: Slack channel ID (e.g., "C01234567" or "D01234567")
        file_bytes: Raw file content (binary)
        file_name: Filename for the upload (e.g., "export.csv")
        mime_type: MIME type (e.g., "text/csv", "application/json")
        bot_token: Slack bot OAuth token (xoxb-*)
        thread_ts: Optional thread timestamp for posting in a thread

    Raises:
        ValueError: If channel, file_name, or bot_token is invalid
        SlackApiError: If Slack API call fails (getUploadURLExternal / completeUploadExternal)
    """
    if not channel or not isinstance(channel, str) or not channel.strip():
        raise ValueError("channel must be a non-empty string")
    if not file_name or not isinstance(file_name, str) or not file_name.strip():
        raise ValueError("file_name must be a non-empty string")
    if not bot_token or not isinstance(bot_token, str) or not bot_token.strip():
        raise ValueError("bot_token must be a non-empty string")
    if not bot_token.startswith("xoxb-"):
        raise ValueError("bot_token must be a valid Slack bot token (starts with xoxb-)")
    if not isinstance(file_bytes, bytes):
        raise ValueError("file_bytes must be bytes")
    if not mime_type or not isinstance(mime_type, str) or not mime_type.strip():
        raise ValueError("mime_type must be a non-empty string")

    if thread_ts and not _is_valid_timestamp(thread_ts):
        raise ValueError("thread_ts must be a valid Slack timestamp format")

    client = WebClient(token=bot_token)

    try:
        response = client.files_upload_v2(
            channel=channel,
            filename=file_name,
            content=file_bytes,
            title=file_name,
            thread_ts=thread_ts if thread_ts else None,
        )
        log_info(
            "slack_file_posted",
            {
                "channel": channel,
                "thread_ts": thread_ts,
                "file_name": file_name,
                "file_id": response.get("file", {}).get("id") if isinstance(response, dict) else None,
            },
        )
    except SlackApiError as e:
        log_exception(
            "slack_post_file_failed",
            {
                "channel": channel,
                "thread_ts": thread_ts,
                "file_name": file_name,
                "error": e.response.get("error", "") if e.response else str(e),
            },
            e,
        )
        raise
