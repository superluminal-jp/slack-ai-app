"""Unit tests for slack_thread_context.py and pipeline integration."""

import json
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from slack_thread_context import build_current_thread_context


class TestSlackThreadContext:
    @patch("slack_thread_context.requests.get")
    def test_builds_context_and_skips_current_message(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "ok": True,
            "messages": [
                {"ts": "100.001", "text": "最初の質問", "user": "U1"},
                {"ts": "100.002", "text": "回答です", "bot_id": "B1"},
                {"ts": "100.003", "text": "今の質問", "user": "U1"},
            ],
        }
        mock_get.return_value = mock_resp

        context = build_current_thread_context(
            bot_token="xoxb-test",
            channel_id="C001",
            thread_ts="100.001",
            correlation_id="corr-1",
            current_message_ts="100.003",
        )

        assert "[Current Slack Thread Context]" in context
        assert "User: 最初の質問" in context
        assert "Assistant: 回答です" in context
        assert "今の質問" not in context

    @patch("slack_thread_context.requests.get")
    def test_returns_empty_when_slack_api_error(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"ok": False, "error": "channel_not_found"}
        mock_get.return_value = mock_resp

        context = build_current_thread_context(
            bot_token="xoxb-test",
            channel_id="C001",
            thread_ts="100.001",
            correlation_id="corr-2",
        )
        assert context == ""


class TestPipelineThreadContextIntegration:
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.resolve_slack_urls")
    @patch("pipeline.build_current_thread_context")
    @patch("pipeline.route_request", return_value="file-creator")
    @patch(
        "pipeline.get_agent_arn",
        return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
    )
    def test_pipeline_injects_thread_context_before_delegate(
        self,
        _mock_arn,
        _mock_route,
        mock_thread_context,
        mock_resolve,
        mock_rate,
        mock_existence,
        mock_auth,
        mock_invoke,
        mock_slack_post,
    ):
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, None)
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "OK"})
        mock_slack_post.return_value = None
        mock_thread_context.return_value = "[Current Slack Thread Context]\nUser: 過去文脈\n[End Current Slack Thread Context]"
        mock_resolve.side_effect = lambda text, _token, _cid: text

        from pipeline import run

        payload = {
            "correlation_id": "corr-ctx-1",
            "channel": "C01",
            "text": "現在の質問",
            "bot_token": "xoxb-test",
            "thread_ts": "123.456",
            "message_ts": "123.789",
            "team_id": "T1",
            "user_id": "U1",
            "attachments": [],
        }

        result = json.loads(run({"prompt": json.dumps(payload)}))
        assert result["status"] == "completed"
        mock_thread_context.assert_called_once_with(
            bot_token="xoxb-test",
            channel_id="C01",
            thread_ts="123.456",
            correlation_id="corr-ctx-1",
            current_message_ts="123.789",
        )
        invoke_payload = mock_invoke.call_args[0][0]
        assert "[Current Slack Thread Context]" in invoke_payload["text"]
        assert "現在の質問" in invoke_payload["text"]
