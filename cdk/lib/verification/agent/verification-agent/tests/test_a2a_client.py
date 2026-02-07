"""
Unit tests for a2a_client.py (Verification → Execution A2A communication).

Tests:
- invoke_execution_agent synchronous path
- invoke_execution_agent async path (polling)
- Error handling for AWS ClientError (returns JSON, does not raise)
- Polling with exponential backoff
- Timeout handling
"""

import json
import os
import sys
import time
from unittest.mock import Mock, patch, MagicMock, call

import pytest

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestInvokeExecutionAgent:
    """Test the main invocation function."""

    @patch("a2a_client._get_agentcore_client")
    def test_synchronous_response_returned_directly(self, mock_get_client):
        """When Execution Agent returns immediate result, return it directly."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client

        success_body = json.dumps({
            "status": "success",
            "response_text": "Hello from AI",
        })

        mock_client.invoke_agent_runtime.return_value = {
            "body": success_body,
        }

        from a2a_client import invoke_execution_agent

        result = invoke_execution_agent(
            task_payload={
                "channel": "C01234567",
                "text": "Hello",
                "bot_token": "xoxb-test",
                "correlation_id": "corr-sync-001",
            },
            execution_agent_arn="arn:aws:bedrock-agentcore:us-east-1:111111111111:runtime/exec-001",
        )

        result_data = json.loads(result)
        assert result_data["status"] == "success"
        assert result_data["response_text"] == "Hello from AI"

    @patch("a2a_client._poll_async_task_result")
    @patch("a2a_client._get_agentcore_client")
    def test_async_response_triggers_polling(self, mock_get_client, mock_poll):
        """When 'accepted' status is returned, should poll for final result."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client

        # Execution Agent returns accepted with task_id
        accepted_body = json.dumps({
            "status": "accepted",
            "task_id": "async-task-789",
        })
        mock_client.invoke_agent_runtime.return_value = {
            "body": accepted_body,
        }

        # Polling returns final result
        mock_poll.return_value = json.dumps({
            "status": "success",
            "response_text": "Polled AI response",
        })

        from a2a_client import invoke_execution_agent

        result = invoke_execution_agent(
            task_payload={
                "channel": "C01234567",
                "text": "Process with attachments",
                "bot_token": "xoxb-test",
                "correlation_id": "corr-async-001",
            },
            execution_agent_arn="arn:aws:bedrock-agentcore:us-east-1:111111111111:runtime/exec-001",
        )

        mock_poll.assert_called_once()
        result_data = json.loads(result)
        assert result_data["status"] == "success"

    @patch("a2a_client._get_agentcore_client")
    def test_client_error_returns_json_error(self, mock_get_client):
        """AWS ClientError should return error JSON (not raise)."""
        from botocore.exceptions import ClientError

        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_client.invoke_agent_runtime.side_effect = ClientError(
            {"Error": {"Code": "ResourceNotFoundException", "Message": "Runtime not found"}},
            "InvokeAgentRuntime",
        )

        from a2a_client import invoke_execution_agent

        # Should NOT raise — returns error JSON instead
        result = invoke_execution_agent(
            task_payload={
                "channel": "C01", "text": "Hello", "bot_token": "xoxb-test",
                "correlation_id": "corr-err-001",
            },
            execution_agent_arn="arn:aws:bedrock-agentcore:us-east-1:111111111111:runtime/invalid",
        )

        result_data = json.loads(result)
        assert result_data["status"] == "error"
        assert "resourcenotfoundexception" in result_data["error_code"]

    @patch("a2a_client._get_agentcore_client")
    def test_throttling_error_returns_throttling_code(self, mock_get_client):
        """ThrottlingException should return throttling error code."""
        from botocore.exceptions import ClientError

        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_client.invoke_agent_runtime.side_effect = ClientError(
            {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
            "InvokeAgentRuntime",
        )

        from a2a_client import invoke_execution_agent

        result = invoke_execution_agent(
            task_payload={
                "channel": "C01", "text": "Hi", "bot_token": "xoxb",
                "correlation_id": "corr-throttle-001",
            },
            execution_agent_arn="arn:aws:test",
        )

        result_data = json.loads(result)
        assert result_data["status"] == "error"
        assert result_data["error_code"] == "throttling"

    @patch("a2a_client._get_agentcore_client")
    def test_arn_from_env_used_as_fallback(self, mock_get_client):
        """When no ARN passed, should use EXECUTION_AGENT_ARN env var."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_client.invoke_agent_runtime.return_value = {
            "body": json.dumps({"status": "success", "response_text": "ok"})
        }

        from a2a_client import invoke_execution_agent

        with patch.dict(os.environ, {"EXECUTION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/env-agent"}):
            invoke_execution_agent(
                task_payload={"channel": "C01", "text": "Hi", "bot_token": "xoxb"},
            )

        call_kwargs = mock_client.invoke_agent_runtime.call_args[1]
        assert "env-agent" in call_kwargs.get("agentRuntimeArn", "")

    def test_missing_arn_raises_value_error(self):
        """Missing ARN (both arg and env) should raise ValueError."""
        from a2a_client import invoke_execution_agent

        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="EXECUTION_AGENT_ARN"):
                invoke_execution_agent(
                    task_payload={"channel": "C01", "text": "Hi", "bot_token": "xoxb"},
                    execution_agent_arn="",
                )

    @patch("a2a_client._get_agentcore_client")
    def test_generic_exception_returns_internal_error(self, mock_get_client):
        """Non-ClientError exceptions should return internal_error JSON."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_client.invoke_agent_runtime.side_effect = ConnectionError("Network down")

        from a2a_client import invoke_execution_agent

        result = invoke_execution_agent(
            task_payload={
                "channel": "C01", "text": "Hi", "bot_token": "xoxb",
                "correlation_id": "corr-net-001",
            },
            execution_agent_arn="arn:aws:test",
        )

        result_data = json.loads(result)
        assert result_data["status"] == "error"
        assert result_data["error_code"] == "internal_error"


class TestPollAsyncTaskResult:
    """Test the async task polling function."""

    @patch("a2a_client.time.sleep")
    @patch("a2a_client._get_agentcore_client")
    def test_returns_result_when_completed(self, mock_get_client, mock_sleep):
        """Should return result when task status becomes 'completed'."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client

        success_result = json.dumps({"status": "success"})

        # First poll: still processing, second: completed
        mock_client.get_async_task_result.side_effect = [
            {"status": "processing"},
            {"status": "completed", "result": success_result},
        ]

        from a2a_client import _poll_async_task_result

        result = _poll_async_task_result(
            agent_arn="arn:aws:test",
            task_id="task-123",
            correlation_id="corr-poll-001",
            max_wait_seconds=30,
        )

        assert mock_client.get_async_task_result.call_count == 2
        result_data = json.loads(result)
        assert result_data["status"] == "success"

    @patch("a2a_client.time.sleep")
    @patch("a2a_client.time.time")
    @patch("a2a_client._get_agentcore_client")
    def test_timeout_returns_async_timeout_error(self, mock_get_client, mock_time, mock_sleep):
        """Should return async_timeout error if polling exceeds max_wait_seconds."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client

        # Always return processing
        mock_client.get_async_task_result.return_value = {"status": "processing"}

        # Simulate time progressing beyond timeout (need enough values for all time.time() calls)
        mock_time.side_effect = [0, 0.5, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

        from a2a_client import _poll_async_task_result

        result = _poll_async_task_result(
            agent_arn="arn:aws:test",
            task_id="task-timeout",
            correlation_id="corr-timeout-001",
            max_wait_seconds=30,
        )

        result_data = json.loads(result)
        assert result_data["status"] == "error"
        assert result_data["error_code"] == "async_timeout"

    @patch("a2a_client.time.sleep")
    @patch("a2a_client._get_agentcore_client")
    def test_exponential_backoff_between_polls(self, mock_get_client, mock_sleep):
        """Polling intervals should increase (exponential backoff)."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client

        success_result = json.dumps({"status": "success"})

        # Return processing 3 times, then completed
        mock_client.get_async_task_result.side_effect = [
            {"status": "processing"},
            {"status": "processing"},
            {"status": "processing"},
            {"status": "completed", "result": success_result},
        ]

        from a2a_client import _poll_async_task_result

        _poll_async_task_result(
            agent_arn="arn:aws:test",
            task_id="task-backoff",
            correlation_id="corr-backoff-001",
            max_wait_seconds=120,
        )

        # Verify that sleep was called with increasing intervals
        sleep_calls = [c[0][0] for c in mock_sleep.call_args_list]
        assert len(sleep_calls) >= 3
        # Each interval should be >= previous (backoff)
        for i in range(1, len(sleep_calls)):
            assert sleep_calls[i] >= sleep_calls[i - 1]

    @patch("a2a_client.time.sleep")
    @patch("a2a_client._get_agentcore_client")
    def test_failed_status_returns_error(self, mock_get_client, mock_sleep):
        """Task with 'failed' status should return error result."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client

        error_result = json.dumps({
            "status": "error",
            "error_code": "bedrock_timeout",
        })

        mock_client.get_async_task_result.return_value = {
            "status": "failed",
            "result": error_result,
        }

        from a2a_client import _poll_async_task_result

        result = _poll_async_task_result(
            agent_arn="arn:aws:test",
            task_id="task-failed",
            correlation_id="corr-failed-001",
        )

        result_data = json.loads(result)
        assert result_data["status"] == "error"


class TestA2AClientSigV4:
    """Test that the client uses SigV4 authentication (boto3 default)."""

    @patch("a2a_client.boto3.client")
    def test_uses_bedrock_agentcore_runtime_client(self, mock_boto_client):
        """Should create a bedrock-agentcore-runtime boto3 client."""
        # Reset cached client
        import a2a_client
        a2a_client._agentcore_client = None

        mock_boto_client.return_value = Mock()

        client = a2a_client._get_agentcore_client()

        mock_boto_client.assert_called_once()
        call_args = mock_boto_client.call_args
        assert call_args[0][0] == "bedrock-agentcore-runtime"

    def test_polling_constants_defined(self):
        """Polling configuration constants should be defined."""
        from a2a_client import POLL_INTERVAL_SECONDS, POLL_MAX_WAIT_SECONDS, POLL_BACKOFF_FACTOR

        assert POLL_INTERVAL_SECONDS > 0
        assert POLL_MAX_WAIT_SECONDS > 30
        assert POLL_BACKOFF_FACTOR > 1.0
