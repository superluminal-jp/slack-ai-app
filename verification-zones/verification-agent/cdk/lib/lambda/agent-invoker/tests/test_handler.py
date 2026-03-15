"""
Unit tests for Agent Invoker Lambda (016): SQS event → InvokeAgentRuntime(Verification Agent).
"""

import json
import os
import pytest
from unittest.mock import Mock, patch, MagicMock

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from handler import lambda_handler


def _sqs_event_record(body: dict, message_id: str = "msg-001"):
    return {
        "messageId": message_id,
        "receiptHandle": "receipt-001",
        "body": json.dumps(body),
        "attributes": {},
        "messageAttributes": {},
        "md5OfBody": "md5",
        "eventSource": "aws:sqs",
        "eventSourceARN": "arn:aws:sqs:ap-northeast-1:123456789012:agent-invocation-request",
        "awsRegion": "ap-northeast-1",
    }


def _agent_invocation_request():
    return {
        "channel": "C01234567",
        "text": "hello",
        "bot_token": "xoxb-test",
        "thread_ts": "1234567890.123456",
        "attachments": [],
        "correlation_id": "req-016-001",
        "team_id": "T12345",
        "user_id": "U12345",
        "event_id": "Ev016Test001",
    }


class TestAgentInvokerHandler:
    """016: Agent Invoker consumes SQS and calls InvokeAgentRuntime with correct payload."""

    @patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/verify-001", "AWS_REGION_NAME": "ap-northeast-1"})
    @patch("boto3.client")
    def test_invokes_agent_runtime_with_prompt_payload(self, mock_boto_client):
        """lambda_handler given SQS event with AgentInvocationRequest Body calls invoke_agent_runtime with payload prompt = json.dumps(task_data) and correct agentRuntimeArn."""
        mock_agentcore = Mock()
        mock_boto_client.return_value = mock_agentcore

        event = {"Records": [_sqs_event_record(_agent_invocation_request())]}
        context = Mock()
        context.aws_request_id = "ctx-001"

        result = lambda_handler(event, context)

        mock_agentcore.invoke_agent_runtime.assert_called_once()
        call_kw = mock_agentcore.invoke_agent_runtime.call_args[1]
        assert call_kw["agentRuntimeArn"] == "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/verify-001"
        assert "runtimeSessionId" in call_kw
        payload = json.loads(call_kw["payload"].decode("utf-8"))
        assert "prompt" in payload
        task_data = json.loads(payload["prompt"])
        assert task_data["channel"] == "C01234567"
        assert task_data["text"] == "hello"
        assert task_data["thread_ts"] == "1234567890.123456"
        assert task_data["event_id"] == "Ev016Test001"
        assert task_data["team_id"] == "T12345"
        assert task_data["user_id"] == "U12345"

    @patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/verify-001", "AWS_REGION_NAME": "ap-northeast-1"})
    @patch("boto3.client")
    def test_returns_batch_item_failures_on_invoke_exception(self, mock_boto_client):
        """When invoke_agent_runtime raises, handler returns batchItemFailures with failed message id(s)."""
        mock_agentcore = Mock()
        mock_agentcore.invoke_agent_runtime.side_effect = Exception("AgentCore error")
        mock_boto_client.return_value = mock_agentcore

        event = {"Records": [_sqs_event_record(_agent_invocation_request(), message_id="msg-fail-001")]}
        context = Mock()

        result = lambda_handler(event, context)

        assert "batchItemFailures" in result
        assert len(result["batchItemFailures"]) >= 1
        assert any(f.get("itemIdentifier") == "msg-fail-001" for f in result["batchItemFailures"])

    @patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:456:runtime/verification-only", "AWS_REGION_NAME": "ap-northeast-1"})
    @patch("boto3.client")
    def test_invoke_agent_runtime_uses_verification_agent_arn_from_env(self, mock_boto_client):
        """[US3] invoke_agent_runtime is called with VERIFICATION_AGENT_ARN from env, not Execution Agent ARN — ensures invocation target is Verification Agent which retains Slack posting responsibility."""
        mock_agentcore = Mock()
        mock_boto_client.return_value = mock_agentcore

        event = {"Records": [_sqs_event_record(_agent_invocation_request())]}
        context = Mock()
        context.aws_request_id = "ctx-us3"

        lambda_handler(event, context)

        mock_agentcore.invoke_agent_runtime.assert_called_once()
        call_kw = mock_agentcore.invoke_agent_runtime.call_args[1]
        assert call_kw["agentRuntimeArn"] == os.environ["VERIFICATION_AGENT_ARN"]
        assert call_kw["agentRuntimeArn"] == "arn:aws:bedrock-agentcore:ap-northeast-1:456:runtime/verification-only"

    @patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/verify-001", "AWS_REGION_NAME": "ap-northeast-1"})
    def test_invalid_json_body_returns_batch_item_failure_and_does_not_invoke(self):
        """When SQS body is invalid JSON, handler logs payload_parse_error and returns batchItemFailures without calling InvokeAgentRuntime."""
        with patch("boto3.client") as mock_boto_client:
            mock_agentcore = Mock()
            mock_boto_client.return_value = mock_agentcore

            record = {
                "messageId": "msg-bad-json",
                "receiptHandle": "receipt-001",
                "body": "not valid json {{{",
                "attributes": {},
                "messageAttributes": {},
                "md5OfBody": "md5",
                "eventSource": "aws:sqs",
                "eventSourceARN": "arn:aws:sqs:ap-northeast-1:123456789012:agent-invocation-request",
                "awsRegion": "ap-northeast-1",
            }
            event = {"Records": [record]}
            context = Mock()
            context.aws_request_id = "ctx-parse"

            result = lambda_handler(event, context)

            assert result["batchItemFailures"] == [{"itemIdentifier": "msg-bad-json"}]
            mock_agentcore.invoke_agent_runtime.assert_not_called()
