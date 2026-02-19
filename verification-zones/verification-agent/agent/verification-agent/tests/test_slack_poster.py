"""
Unit tests for slack_poster module (014 file posting).

Covers post_file_to_slack signature and ValueError cases per contracts/slack-file-poster.yaml.
SlackApiError on API failure is documented in contract; integration tests cover that path.
"""

import pytest
from unittest.mock import MagicMock, patch

from slack_poster import post_file_to_slack
from slack_sdk.errors import SlackApiError


class TestPostFileToSlackValidation:
    """post_file_to_slack raises ValueError for invalid channel, file_name, bot_token, etc."""

    def test_empty_channel_raises_value_error(self):
        with pytest.raises(ValueError, match="channel must be a non-empty string"):
            post_file_to_slack(
                channel="",
                file_bytes=b"data",
                file_name="x.csv",
                mime_type="text/csv",
                bot_token="xoxb-123",
            )

    def test_whitespace_channel_raises_value_error(self):
        with pytest.raises(ValueError, match="channel must be a non-empty string"):
            post_file_to_slack(
                channel="   ",
                file_bytes=b"data",
                file_name="x.csv",
                mime_type="text/csv",
                bot_token="xoxb-123",
            )

    def test_empty_file_name_raises_value_error(self):
        with pytest.raises(ValueError, match="file_name must be a non-empty string"):
            post_file_to_slack(
                channel="C123",
                file_bytes=b"data",
                file_name="",
                mime_type="text/csv",
                bot_token="xoxb-123",
            )

    def test_empty_bot_token_raises_value_error(self):
        with pytest.raises(ValueError, match="bot_token must be a non-empty string"):
            post_file_to_slack(
                channel="C123",
                file_bytes=b"data",
                file_name="x.csv",
                mime_type="text/csv",
                bot_token="",
            )

    def test_invalid_bot_token_prefix_raises_value_error(self):
        with pytest.raises(ValueError, match="bot_token must be a valid Slack bot token"):
            post_file_to_slack(
                channel="C123",
                file_bytes=b"data",
                file_name="x.csv",
                mime_type="text/csv",
                bot_token="xoxp-123",
            )

    def test_file_bytes_not_bytes_raises_value_error(self):
        with pytest.raises(ValueError, match="file_bytes must be bytes"):
            post_file_to_slack(
                channel="C123",
                file_bytes="not bytes",
                file_name="x.csv",
                mime_type="text/csv",
                bot_token="xoxb-123",
            )

    def test_empty_mime_type_raises_value_error(self):
        with pytest.raises(ValueError, match="mime_type must be a non-empty string"):
            post_file_to_slack(
                channel="C123",
                file_bytes=b"data",
                file_name="x.csv",
                mime_type="",
                bot_token="xoxb-123",
            )

    def test_invalid_thread_ts_raises_value_error(self):
        with pytest.raises(ValueError, match="thread_ts must be a valid Slack timestamp"):
            post_file_to_slack(
                channel="C123",
                file_bytes=b"data",
                file_name="x.csv",
                mime_type="text/csv",
                bot_token="xoxb-123",
                thread_ts="invalid",
            )


class TestPostFileToSlackApiCall:
    """post_file_to_slack calls WebClient.files_upload_v2 with correct args."""

    @patch("slack_poster.WebClient")
    def test_calls_files_upload_v2_with_channel_file_and_token(self, mock_web_client_cls):
        mock_client = MagicMock()
        mock_web_client_cls.return_value = mock_client
        mock_client.files_upload_v2.return_value = {"file": {"id": "F123"}}

        post_file_to_slack(
            channel="C123",
            file_bytes=b"csv,data",
            file_name="export.csv",
            mime_type="text/csv",
            bot_token="xoxb-token",
            thread_ts="1234567890.123456",
        )

        mock_client.files_upload_v2.assert_called_once()
        call_kw = mock_client.files_upload_v2.call_args[1]
        assert call_kw["channel"] == "C123"
        assert call_kw["filename"] == "export.csv"
        assert call_kw["content"] == b"csv,data"
        assert call_kw["title"] == "export.csv"
        assert call_kw["thread_ts"] == "1234567890.123456"

    @patch("slack_poster.WebClient")
    def test_slack_api_error_is_raised_on_failure(self, mock_web_client_cls):
        # Contract: SlackApiError is raised on API failure (slack-file-poster.yaml)
        api_error = SlackApiError(
            message="file_not_found",
            response={"ok": False, "error": "file_not_found"},
        )
        mock_client = MagicMock()
        mock_client.files_upload_v2.side_effect = api_error
        mock_web_client_cls.return_value = mock_client

        with pytest.raises(type(api_error)) as exc_info:
            post_file_to_slack(
                channel="C123",
                file_bytes=b"data",
                file_name="x.csv",
                mime_type="text/csv",
                bot_token="xoxb-123",
            )
        assert exc_info.value.response.get("error") == "file_not_found"
