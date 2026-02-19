"""Tests for Slack Poster Lambda (019, 028)."""

import base64
import json
from io import BytesIO
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


@patch("handler.urllib.request.urlopen")
@patch("handler.WebClient")
def test_lambda_handler_post_file_via_s3_presigned_url(mock_webclient, mock_urlopen):
    """Post request with s3PresignedUrl fetches file from URL and uploads to Slack (028)."""
    from handler import lambda_handler

    file_content = b"large file content from s3"
    mock_resp = MagicMock()
    mock_resp.read.side_effect = lambda n=-1: file_content
    mock_resp.__enter__ = MagicMock(return_value=mock_resp)
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_urlopen.return_value = mock_resp

    event = {
        "Records": [
            {
                "messageId": "msg-1",
                "body": json.dumps({
                    "channel": "C01",
                    "thread_ts": "123.456",
                    "file_artifact": {
                        "fileName": "report.xlsx",
                        "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "s3PresignedUrl": "https://my-bucket.s3.ap-northeast-1.amazonaws.com/generated_files/corr-1/report.xlsx?X-Amz-Signature=abc",
                    },
                    "bot_token": "xoxb-test-token",
                    "correlation_id": "corr-1",
                }),
            },
        ],
    }
    result = lambda_handler(event, None)
    assert result["batchItemFailures"] == []
    mock_urlopen.assert_called_once()
    call_args = mock_urlopen.call_args[0]
    assert "amazonaws.com" in call_args[0]
    mock_webclient.return_value.files_upload_v2.assert_called_once()
    upload_call = mock_webclient.return_value.files_upload_v2.call_args[1]
    assert upload_call["content"] == file_content
    assert upload_call["filename"] == "report.xlsx"
    assert upload_call["channel"] == "C01"
    assert upload_call["thread_ts"] == "123.456"


@patch("handler.WebClient")
def test_lambda_handler_post_file_via_content_base64(mock_webclient):
    """Post request with contentBase64 decodes and uploads to Slack (028)."""
    from handler import lambda_handler

    file_content = b"small inline file content"
    b64_content = base64.b64encode(file_content).decode("ascii")

    event = {
        "Records": [
            {
                "messageId": "msg-1",
                "body": json.dumps({
                    "channel": "C01",
                    "thread_ts": "123.456",
                    "file_artifact": {
                        "fileName": "notes.txt",
                        "mimeType": "text/plain",
                        "contentBase64": b64_content,
                    },
                    "bot_token": "xoxb-test-token",
                    "correlation_id": "corr-1",
                }),
            },
        ],
    }
    result = lambda_handler(event, None)
    assert result["batchItemFailures"] == []
    mock_webclient.return_value.files_upload_v2.assert_called_once()
    upload_call = mock_webclient.return_value.files_upload_v2.call_args[1]
    assert upload_call["content"] == file_content
    assert upload_call["filename"] == "notes.txt"
    assert upload_call["channel"] == "C01"
