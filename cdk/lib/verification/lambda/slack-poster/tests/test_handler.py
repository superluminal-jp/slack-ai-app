"""Tests for Slack Poster Lambda (019)."""

import json
from unittest.mock import patch, MagicMock

import pytest


@patch("handler.WebClient")
def test_lambda_handler_post_text_only(mock_webclient):
    """Post request with text only enqueues and posts via WebClient."""
    from handler import lambda_handler

    event = {
        "Records": [
            {
                "messageId": "msg-1",
                "body": json.dumps({
                    "channel": "C01",
                    "thread_ts": "123.456",
                    "text": "Hello",
                    "bot_token": "xoxb-test-token",
                    "correlation_id": "corr-1",
                }),
            },
        ],
    }
    result = lambda_handler(event, None)
    assert result["batchItemFailures"] == []
    mock_webclient.return_value.chat_postMessage.assert_called_once()
    call = mock_webclient.return_value.chat_postMessage.call_args[1]
    assert call["channel"] == "C01"
    assert call["text"] == "Hello"
    assert call["thread_ts"] == "123.456"


@patch("handler.WebClient")
def test_lambda_handler_swaps_eyes_to_checkmark(mock_webclient):
    """When message_ts is present, removes eyes and adds white_check_mark after post."""
    from handler import lambda_handler

    event = {
        "Records": [
            {
                "messageId": "msg-1",
                "body": json.dumps({
                    "channel": "C01",
                    "thread_ts": "123.456",
                    "message_ts": "123.456",
                    "text": "Done",
                    "bot_token": "xoxb-test-token",
                }),
            },
        ],
    }
    result = lambda_handler(event, None)
    assert result["batchItemFailures"] == []
    mock_webclient.return_value.chat_postMessage.assert_called_once()
    mock_webclient.return_value.reactions_remove.assert_called_once_with(
        channel="C01", name="eyes", timestamp="123.456"
    )
    mock_webclient.return_value.reactions_add.assert_called_once_with(
        channel="C01", name="white_check_mark", timestamp="123.456"
    )


@patch("handler.WebClient")
def test_lambda_handler_missing_channel_returns_failure(mock_webclient):
    """Missing channel adds message to batchItemFailures."""
    from handler import lambda_handler

    event = {
        "Records": [
            {
                "messageId": "msg-1",
                "body": json.dumps({
                    "text": "Hi",
                    "bot_token": "xoxb-test",
                }),
            },
        ],
    }
    result = lambda_handler(event, None)
    assert result["batchItemFailures"] == [{"itemIdentifier": "msg-1"}]
    mock_webclient.return_value.chat_postMessage.assert_not_called()
