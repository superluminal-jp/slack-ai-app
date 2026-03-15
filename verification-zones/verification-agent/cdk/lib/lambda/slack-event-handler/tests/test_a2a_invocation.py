"""
Unit tests for A2A (AgentCore) invocation in Lambda handler.

Tests:
- When VERIFICATION_AGENT_ARN is set: handler invokes AgentCore (invoke_agent_runtime).
- When VERIFICATION_AGENT_ARN is missing: handler returns 200 and does not invoke AgentCore.
- When AgentCore invocation fails: handler still returns 200 to Slack (graceful degradation).
"""

import json
import os
import sys
from unittest.mock import Mock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_slack_event(text="Hello AI", channel="C01234567"):
    """Minimal valid Slack app_mention event body."""
    return {
        "type": "event_callback",
        "team_id": "T01234567",
        "event": {
            "type": "app_mention",
            "text": f"<@U_BOT_ID> {text}",
            "channel": channel,
            "user": "U01234567",
            "ts": "1234567890.123456",
        },
    }


def _make_api_gateway_event(body_dict):
    """Wrap Slack body into API Gateway event."""
    return {
        "httpMethod": "POST",
        "headers": {
            "x-slack-signature": "v0=test_signature",
            "x-slack-request-timestamp": "1234567890",
            "content-type": "application/json",
        },
        "body": json.dumps(body_dict),
        "isBase64Encoded": False,
    }


class TestA2AInvocation:
    """Handler uses only A2A path (VERIFICATION_AGENT_ARN + bedrock-agentcore)."""

    @patch("handler.boto3.client")
    @patch("handler.check_rate_limit")
    @patch("handler.authorize_request")
    @patch("handler.check_entity_existence", return_value=True)
    @patch("handler.is_duplicate_event", return_value=False)
    @patch("handler.mark_event_processed")
    @patch("handler.verify_signature", return_value=True)
    @patch("handler.get_secret_from_secrets_manager", return_value="test-secret")
    @patch("handler.get_token", return_value="xoxb-test-token")
    def test_invokes_agentcore_when_verification_agent_arn_set(
        self,
        mock_get_token,
        mock_get_secret,
        mock_verify,
        mock_mark,
        mock_dedup,
        mock_existence,
        mock_auth,
        mock_rate,
        mock_boto_client,
    ):
        """When VERIFICATION_AGENT_ARN is set, handler invokes AgentCore."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_agentcore = Mock()
        mock_boto_client.return_value = mock_agentcore

        env_vars = {
            "VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/verify-001",
            "AWS_REGION_NAME": "ap-northeast-1",
            "SLACK_SIGNING_SECRET_NAME": "test-signing-secret",
            "SLACK_BOT_TOKEN_SECRET_NAME": "test-bot-token-secret",
        }

        with patch.dict(os.environ, env_vars, clear=False):
            from handler import lambda_handler

            event = _make_api_gateway_event(_make_slack_event())
            context = Mock()
            context.aws_request_id = "test-req-001"

            result = lambda_handler(event, context)

        assert result["statusCode"] == 200
        mock_agentcore.invoke_agent_runtime.assert_called_once()
        call_kw = mock_agentcore.invoke_agent_runtime.call_args[1]
        assert call_kw["agentRuntimeArn"] == env_vars["VERIFICATION_AGENT_ARN"]
        assert "runtimeSessionId" in call_kw
        assert "payload" in call_kw

    @patch("handler.check_rate_limit")
    @patch("handler.authorize_request")
    @patch("handler.check_entity_existence", return_value=True)
    @patch("handler.is_duplicate_event", return_value=False)
    @patch("handler.mark_event_processed")
    @patch("handler.verify_signature", return_value=True)
    @patch("handler.get_secret_from_secrets_manager", return_value="test-secret")
    @patch("handler.get_token", return_value="xoxb-test-token")
    def test_returns_200_when_verification_agent_arn_missing(
        self,
        mock_get_token,
        mock_get_secret,
        mock_verify,
        mock_mark,
        mock_dedup,
        mock_existence,
        mock_auth,
        mock_rate,
    ):
        """When VERIFICATION_AGENT_ARN is not set, handler returns 200 and does not call AgentCore."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)

        env_vars = {
            "VERIFICATION_AGENT_ARN": "",
            "SLACK_SIGNING_SECRET_NAME": "test-signing-secret",
            "SLACK_BOT_TOKEN_SECRET_NAME": "test-bot-token-secret",
        }

        with patch.dict(os.environ, env_vars, clear=False):
            with patch("handler.boto3.client") as mock_boto_client:
                from handler import lambda_handler

                event = _make_api_gateway_event(_make_slack_event())
                context = Mock()
                context.aws_request_id = "test-req-002"

                result = lambda_handler(event, context)

        assert result["statusCode"] == 200
        mock_boto_client.assert_not_called()

    @patch("handler.boto3.client")
    @patch("handler.check_rate_limit")
    @patch("handler.authorize_request")
    @patch("handler.check_entity_existence", return_value=True)
    @patch("handler.is_duplicate_event", return_value=False)
    @patch("handler.mark_event_processed")
    @patch("handler.verify_signature", return_value=True)
    @patch("handler.get_secret_from_secrets_manager", return_value="test-secret")
    @patch("handler.get_token", return_value="xoxb-test-token")
    def test_returns_200_on_agentcore_invocation_failure(
        self,
        mock_get_token,
        mock_get_secret,
        mock_verify,
        mock_mark,
        mock_dedup,
        mock_existence,
        mock_auth,
        mock_rate,
        mock_boto_client,
    ):
        """AgentCore invocation failure still returns 200 to Slack."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_agentcore = Mock()
        mock_agentcore.invoke_agent_runtime.side_effect = Exception("AgentCore unavailable")
        mock_boto_client.return_value = mock_agentcore

        env_vars = {
            "VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/verify-001",
            "AWS_REGION_NAME": "ap-northeast-1",
            "SLACK_SIGNING_SECRET_NAME": "test-signing-secret",
            "SLACK_BOT_TOKEN_SECRET_NAME": "test-bot-token-secret",
        }

        with patch.dict(os.environ, env_vars, clear=False):
            from handler import lambda_handler

            event = _make_api_gateway_event(_make_slack_event())
            context = Mock()
            context.aws_request_id = "test-req-003"

            result = lambda_handler(event, context)

        assert result["statusCode"] == 200
