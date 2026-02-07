"""
Unit tests for Execution Agent main.py (A2A entrypoint).

Tests:
- A2A message parsing and validation
- Async task creation (add_async_task)
- Background processing with Bedrock
- Error handling and error code mapping
- Agent Card and health check endpoints
"""

import json
import os
import sys
import time
import threading
from unittest.mock import Mock, patch, MagicMock

import pytest

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestHandleMessageValidation:
    """Test A2A entrypoint input validation."""

    @patch("main.app")
    def test_missing_channel_returns_error(self, mock_app):
        """Missing channel should return error response."""
        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "text": "Hello",
                "bot_token": "xoxb-test",
                "correlation_id": "test-corr-id",
            })
        }

        result = handle_message(payload)
        result_data = json.loads(result)

        assert result_data["status"] == "error" or "error" in result_data.get("error_code", "")

    @patch("main.app")
    def test_missing_text_returns_error(self, mock_app):
        """Missing text should return error response."""
        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "bot_token": "xoxb-test",
                "correlation_id": "test-corr-id",
            })
        }

        result = handle_message(payload)
        result_data = json.loads(result)

        assert result_data["status"] == "error" or "missing_text" in result_data.get("error_code", "")

    @patch("main.app")
    def test_empty_payload_handled_gracefully(self, mock_app):
        """Empty payload should not crash."""
        from main import handle_message

        payload = {"prompt": "{}"}
        result = handle_message(payload)
        result_data = json.loads(result)

        # Should return error for missing channel/text
        assert "error" in result_data.get("status", "") or "error" in result_data.get("error_code", "")


class TestHandleMessageAsyncFlow:
    """Test the async task creation and acceptance flow."""

    @patch("main.threading.Thread")
    @patch("main.app")
    def test_valid_message_returns_accepted(self, mock_app, mock_thread_cls):
        """Valid message should create async task and return 'accepted'."""
        mock_app.add_async_task.return_value = "task-123"
        mock_thread_instance = Mock()
        mock_thread_cls.return_value = mock_thread_instance

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Hello AI",
                "bot_token": "xoxb-test-token",
                "correlation_id": "corr-001",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }

        result = handle_message(payload)
        result_data = json.loads(result)

        assert result_data["status"] == "accepted"
        assert result_data["task_id"] == "task-123"
        assert result_data["correlation_id"] == "corr-001"
        mock_app.add_async_task.assert_called_once_with("bedrock_processing")
        mock_thread_instance.start.assert_called_once()

    @patch("main.threading.Thread")
    @patch("main.app")
    def test_async_task_thread_is_daemon(self, mock_app, mock_thread_cls):
        """Background thread should be a daemon thread."""
        mock_app.add_async_task.return_value = "task-456"
        mock_thread_instance = Mock()
        mock_thread_cls.return_value = mock_thread_instance

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Test question",
                "bot_token": "xoxb-test",
            })
        }

        handle_message(payload)

        # Verify daemon=True was passed
        call_kwargs = mock_thread_cls.call_args
        assert call_kwargs[1]["daemon"] is True


class TestProcessBedrockRequest:
    """Test the background Bedrock processing function."""

    @patch("main.app")
    @patch("main.invoke_bedrock")
    @patch("main.process_attachments")
    @patch("main.format_success_response")
    def test_successful_bedrock_call_completes_task(
        self, mock_format, mock_attachments, mock_bedrock, mock_app
    ):
        """Successful Bedrock call should complete async task with result."""
        mock_bedrock.return_value = "AI response text"
        mock_attachments.return_value = []
        mock_format.return_value = {
            "status": "success",
            "response_text": "AI response text",
        }

        from main import _process_bedrock_request

        _process_bedrock_request(
            task_id="task-001",
            text="Hello",
            channel="C01234567",
            bot_token="xoxb-test",
            thread_ts=None,
            correlation_id="corr-001",
            attachments=[],
        )

        mock_bedrock.assert_called_once()
        mock_app.complete_async_task.assert_called_once()

        # Verify the result passed to complete_async_task
        call_args = mock_app.complete_async_task.call_args
        assert call_args[0][0] == "task-001"
        completed_result = json.loads(call_args[0][1])
        assert completed_result["status"] == "success"

    @patch("main.app")
    @patch("main.invoke_bedrock")
    @patch("main.process_attachments")
    @patch("main.format_error_response")
    def test_bedrock_exception_completes_task_with_error(
        self, mock_format, mock_attachments, mock_bedrock, mock_app
    ):
        """Bedrock exception should still complete async task (with error)."""
        mock_bedrock.side_effect = Exception("Throttling: rate exceeded")
        mock_attachments.return_value = []
        mock_format.return_value = {
            "status": "error",
            "error_code": "bedrock_throttling",
        }

        from main import _process_bedrock_request

        _process_bedrock_request(
            task_id="task-002",
            text="Hello",
            channel="C01234567",
            bot_token="xoxb-test",
            thread_ts=None,
            correlation_id="corr-002",
            attachments=[],
        )

        # complete_async_task MUST be called even on error
        mock_app.complete_async_task.assert_called_once()
        call_args = mock_app.complete_async_task.call_args
        assert call_args[0][0] == "task-002"

    @patch("main.app")
    @patch("main.invoke_bedrock")
    @patch("main.process_attachments")
    @patch("main.get_processing_summary")
    @patch("main.format_success_response")
    def test_attachments_are_processed_before_bedrock(
        self, mock_format, mock_summary, mock_attachments, mock_bedrock, mock_app
    ):
        """Attachments should be processed and included in Bedrock prompt."""
        mock_attachments.return_value = [
            {
                "file_id": "F001",
                "file_name": "doc.pdf",
                "mimetype": "application/pdf",
                "content_type": "document",
                "content": "Extracted PDF text content here",
                "processing_status": "success",
            }
        ]
        mock_summary.return_value = {
            "total": 1, "success": 1, "failed": 0, "skipped": 0,
            "failure_codes": {},
            "has_images": False, "has_documents": True,
        }
        mock_bedrock.return_value = "Based on the document..."
        mock_format.return_value = {"status": "success", "response_text": "Based on the document..."}

        from main import _process_bedrock_request

        attachments = [{"id": "F001", "name": "doc.pdf", "mimetype": "application/pdf", "size": 1024}]

        _process_bedrock_request(
            task_id="task-003",
            text="Summarize this",
            channel="C01234567",
            bot_token="xoxb-test",
            thread_ts=None,
            correlation_id="corr-003",
            attachments=attachments,
        )

        mock_attachments.assert_called_once()
        # Bedrock should receive text with attached document context
        call_args = mock_bedrock.call_args
        prompt_text = call_args[0][0]
        assert "Summarize this" in prompt_text
        assert "Attached Documents" in prompt_text


class TestErrorMapping:
    """Test error-to-response mapping."""

    def test_timeout_error_maps_correctly(self):
        from main import _map_error_to_response

        error = Exception("Timeout error occurred")
        code, msg = _map_error_to_response(error)
        assert code == "bedrock_timeout"

    def test_throttling_error_maps_correctly(self):
        from main import _map_error_to_response

        error = Exception("ThrottlingException: rate exceeded")
        code, msg = _map_error_to_response(error)
        assert code == "bedrock_throttling"

    def test_access_denied_maps_correctly(self):
        from main import _map_error_to_response

        error = Exception("AccessDeniedException: not authorized")
        code, msg = _map_error_to_response(error)
        assert code == "bedrock_access_denied"

    def test_unknown_error_maps_to_generic(self):
        from main import _map_error_to_response

        error = Exception("Some unknown error")
        code, msg = _map_error_to_response(error)
        assert code == "generic"


class TestAgentCard:
    """Test Agent Card endpoint."""

    def test_agent_card_has_required_fields(self):
        from agent_card import get_agent_card

        card = get_agent_card()
        assert card["name"] == "SlackAI-ExecutionAgent"
        assert card["protocol"] == "A2A"
        assert card["protocolVersion"] == "1.0"
        assert "skills" in card
        assert len(card["skills"]) >= 3

    def test_agent_card_skills_have_ids(self):
        from agent_card import get_agent_card

        card = get_agent_card()
        skill_ids = [s["id"] for s in card["skills"]]
        assert "bedrock-conversation" in skill_ids
        assert "attachment-processing" in skill_ids
        assert "async-processing" in skill_ids

    def test_agent_card_authentication_is_sigv4(self):
        from agent_card import get_agent_card

        card = get_agent_card()
        assert card["authentication"]["type"] == "SIGV4"

    def test_health_status_healthy(self):
        from agent_card import get_health_status

        status = get_health_status(is_busy=False)
        assert status["status"] == "Healthy"
        assert status["agent"] == "SlackAI-ExecutionAgent"

    def test_health_status_busy(self):
        from agent_card import get_health_status

        status = get_health_status(is_busy=True)
        assert status["status"] == "HealthyBusy"

    @patch.dict(os.environ, {"AGENTCORE_RUNTIME_URL": "https://test.example.com"})
    def test_agent_card_uses_runtime_url_env(self):
        from agent_card import get_agent_card

        card = get_agent_card()
        assert card["url"] == "https://test.example.com"
