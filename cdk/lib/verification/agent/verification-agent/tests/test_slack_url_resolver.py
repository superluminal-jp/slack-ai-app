"""
Unit tests for Slack message URL resolver (slack_url_resolver.py).

Tests cover:
- URL parsing and timestamp conversion
- Whitelist channel check
- Thread fetching (mocked requests)
- Integration: resolve_slack_urls end-to-end
- Pipeline integration (fail-open behaviour)
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from slack_url_resolver import (
    MAX_URLS_PER_MESSAGE,
    SlackUrlMatch,
    ResolvedThread,
    parse_slack_urls,
    check_channel_whitelisted,
    fetch_thread_replies,
    format_thread_context,
    resolve_slack_urls,
)


# ---------------------------------------------------------------------------
# URL Parsing
# ---------------------------------------------------------------------------

class TestParseSlackUrls:
    def test_valid_single_url(self):
        text = "Check this https://myteam.slack.com/archives/C0ABC1234/p1706123456789012 please"
        result = parse_slack_urls(text)
        assert len(result) == 1
        assert result[0].channel_id == "C0ABC1234"
        assert result[0].message_ts == "1706123456.789012"
        assert "p1706123456789012" in result[0].original_url

    def test_multiple_urls(self):
        text = (
            "See https://a.slack.com/archives/C001/p1000000000000001 "
            "and https://b.slack.com/archives/C002/p2000000000000002"
        )
        result = parse_slack_urls(text)
        assert len(result) == 2
        assert result[0].channel_id == "C001"
        assert result[1].channel_id == "C002"

    def test_no_urls_returns_empty(self):
        assert parse_slack_urls("just a regular message") == []
        assert parse_slack_urls("") == []

    def test_max_urls_limit(self):
        urls = " ".join(
            f"https://x.slack.com/archives/C{i:03d}/p{i:016d}"
            for i in range(1, 6)
        )
        result = parse_slack_urls(urls)
        assert len(result) == MAX_URLS_PER_MESSAGE

    def test_malformed_urls_ignored(self):
        text = (
            "https://slack.com/archives/C001/p123 "  # ts too short
            "https://notslack.example.com/archives/C001/p1000000000000001 "  # not slack
            "https://team.slack.com/archives/C001/p1000000000000001"  # valid
        )
        result = parse_slack_urls(text)
        assert len(result) == 1
        assert result[0].channel_id == "C001"


# ---------------------------------------------------------------------------
# Timestamp Conversion
# ---------------------------------------------------------------------------

class TestTimestampConversion:
    def test_converts_16_digit_to_dotted(self):
        result = parse_slack_urls("https://t.slack.com/archives/CABC/p1706123456789012")
        assert result[0].message_ts == "1706123456.789012"


# ---------------------------------------------------------------------------
# Whitelist Check
# ---------------------------------------------------------------------------

class TestCheckChannelWhitelisted:
    @patch("slack_url_resolver.load_whitelist_config")
    def test_channel_in_whitelist(self, mock_load):
        mock_load.return_value = {"channel_ids": {"C001", "C002"}, "team_ids": set(), "user_ids": set()}
        assert check_channel_whitelisted("C001") is True

    @patch("slack_url_resolver.load_whitelist_config")
    def test_channel_not_in_whitelist(self, mock_load):
        mock_load.return_value = {"channel_ids": {"C001"}, "team_ids": set(), "user_ids": set()}
        assert check_channel_whitelisted("C999") is False

    @patch("slack_url_resolver.load_whitelist_config")
    def test_empty_whitelist_allows_all(self, mock_load):
        mock_load.return_value = {"channel_ids": set(), "team_ids": set(), "user_ids": set()}
        assert check_channel_whitelisted("CANY") is True


# ---------------------------------------------------------------------------
# Thread Fetching
# ---------------------------------------------------------------------------

class TestFetchThreadReplies:
    @patch("slack_url_resolver.requests.get")
    def test_success(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "ok": True,
            "messages": [
                {"text": "Hello", "user": "U1"},
                {"text": "Hi!", "bot_id": "B1"},
            ],
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        result = fetch_thread_replies("xoxb-test", "C001", "1706123456.789012")
        assert result.error is None
        assert len(result.messages) == 2

    @patch("slack_url_resolver.requests.get")
    def test_api_error(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"ok": False, "error": "channel_not_found"}
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        result = fetch_thread_replies("xoxb-test", "C001", "1706123456.789012")
        assert result.error is not None
        assert "channel_not_found" in result.error

    @patch("slack_url_resolver.requests.get")
    def test_network_exception(self, mock_get):
        mock_get.side_effect = ConnectionError("timeout")

        result = fetch_thread_replies("xoxb-test", "C001", "1706123456.789012")
        assert result.error is not None
        assert "ConnectionError" in result.error


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

class TestFormatThreadContext:
    def test_formats_user_and_bot_messages(self):
        resolved = ResolvedThread(
            channel_id="C001",
            messages=[
                {"text": "What is X?", "user": "U1"},
                {"text": "X is Y.", "bot_id": "B1"},
                {"text": "Thanks", "user": "U1"},
            ],
        )
        output = format_thread_context(resolved)
        assert "[Referenced Slack Thread (C001)]" in output
        assert "[End Referenced Thread]" in output
        assert "User: What is X?" in output
        assert "Assistant: X is Y." in output
        assert "User: Thanks" in output

    def test_skips_empty_messages(self):
        resolved = ResolvedThread(
            channel_id="C001",
            messages=[
                {"text": "", "user": "U1"},
                {"text": "Hello", "user": "U2"},
            ],
        )
        output = format_thread_context(resolved)
        assert "User: Hello" in output
        # Empty message should not produce a "User: " line
        lines = [l for l in output.split("\n") if l.startswith("User:") or l.startswith("Assistant:")]
        assert len(lines) == 1


# ---------------------------------------------------------------------------
# Integration: resolve_slack_urls
# ---------------------------------------------------------------------------

class TestResolveSlackUrls:
    @patch("slack_url_resolver.fetch_thread_replies")
    @patch("slack_url_resolver.check_channel_whitelisted")
    def test_enriches_text_with_thread(self, mock_wl, mock_fetch):
        mock_wl.return_value = True
        mock_fetch.return_value = ResolvedThread(
            channel_id="C001",
            messages=[{"text": "context msg", "user": "U1"}],
        )
        text = "Look at https://t.slack.com/archives/C001/p1000000000000001"
        result = resolve_slack_urls(text, "xoxb-test", "corr-1")
        assert "[Referenced Slack Thread (C001)]" in result
        assert "User: context msg" in result
        assert "Look at" in result
        assert "https://t.slack.com/archives/C001/p1000000000000001" not in result

    @patch("slack_url_resolver.check_channel_whitelisted")
    def test_skips_non_whitelisted_channel(self, mock_wl):
        mock_wl.return_value = False
        text = "See https://t.slack.com/archives/C001/p1000000000000001"
        result = resolve_slack_urls(text, "xoxb-test", "corr-1")
        assert result == text  # unchanged

    def test_no_urls_returns_original(self):
        text = "Just a normal message"
        result = resolve_slack_urls(text, "xoxb-test", "corr-1")
        assert result == text

    @patch("slack_url_resolver.fetch_thread_replies")
    @patch("slack_url_resolver.check_channel_whitelisted")
    def test_partial_failure(self, mock_wl, mock_fetch):
        """One URL succeeds, one fails → only successful context is prepended."""
        mock_wl.return_value = True
        mock_fetch.side_effect = [
            ResolvedThread(channel_id="C001", messages=[{"text": "ok", "user": "U1"}]),
            ResolvedThread(channel_id="C002", error="channel_not_found"),
        ]
        text = (
            "https://t.slack.com/archives/C001/p1000000000000001 "
            "https://t.slack.com/archives/C002/p2000000000000002"
        )
        result = resolve_slack_urls(text, "xoxb-test", "corr-1")
        assert "[Referenced Slack Thread (C001)]" in result
        assert "https://t.slack.com/archives/C001/p1000000000000001" not in result
        assert "https://t.slack.com/archives/C002/p2000000000000002" in result

    @patch("slack_url_resolver.fetch_thread_replies")
    @patch("slack_url_resolver.check_channel_whitelisted")
    def test_fetch_error_does_not_block(self, mock_wl, mock_fetch):
        mock_wl.return_value = True
        mock_fetch.return_value = ResolvedThread(channel_id="C001", error="network_error")
        text = "See https://t.slack.com/archives/C001/p1000000000000001"
        result = resolve_slack_urls(text, "xoxb-test", "corr-1")
        assert result == text  # unchanged, no context block


# ---------------------------------------------------------------------------
# Pipeline integration
# ---------------------------------------------------------------------------

class TestPipelineIntegration:
    """Verify pipeline.py calls resolve_slack_urls correctly and handles exceptions."""

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.resolve_slack_urls")
    def test_pipeline_calls_resolver(
        self, mock_resolve, mock_rate, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, None)
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "OK"})
        mock_slack_post.return_value = None
        mock_resolve.return_value = "enriched text"

        from pipeline import run

        payload = {
            "correlation_id": "corr-1",
            "channel": "C01",
            "text": "https://t.slack.com/archives/C001/p1000000000000001",
            "bot_token": "xoxb-test",
            "thread_ts": "123.456",
            "team_id": "T1",
            "user_id": "U1",
            "attachments": [],
        }
        result = json.loads(run({"prompt": json.dumps(payload)}))
        assert result["status"] == "completed"
        mock_resolve.assert_called_once_with(
            "https://t.slack.com/archives/C001/p1000000000000001",
            "xoxb-test",
            "corr-1",
        )
        # Verify enriched text was passed to execution agent
        call_args = mock_invoke.call_args[0][0]
        assert call_args["text"] == "enriched text"

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.resolve_slack_urls")
    def test_pipeline_continues_on_resolver_exception(
        self, mock_resolve, mock_rate, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, None)
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "OK"})
        mock_slack_post.return_value = None
        mock_resolve.side_effect = RuntimeError("resolver crashed")

        from pipeline import run

        payload = {
            "correlation_id": "corr-1",
            "channel": "C01",
            "text": "hello",
            "bot_token": "xoxb-test",
            "thread_ts": "123.456",
            "team_id": "T1",
            "user_id": "U1",
            "attachments": [],
        }
        result = json.loads(run({"prompt": json.dumps(payload)}))
        # Pipeline should still complete despite resolver failure
        assert result["status"] == "completed"
        # Original text should be used (not enriched)
        call_args = mock_invoke.call_args[0][0]
        assert call_args["text"] == "hello"
