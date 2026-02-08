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
        mock_format.return_value = (
            {"status": "success", "response_text": "AI response text"},
            None,
        )

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
    @patch("main.format_success_response")
    def test_success_with_file_artifact_completes_task_with_two_artifacts(
        self, mock_format, mock_attachments, mock_bedrock, mock_app
    ):
        """When file is returned, result has response_text and file_artifact (014 US1)."""
        import base64
        mock_bedrock.return_value = "Here is your export."
        mock_attachments.return_value = []
        file_artifact = {
            "artifactId": "art-uuid",
            "name": "generated_file",
            "parts": [{
                "kind": "file",
                "contentBase64": base64.b64encode(b"a,b\n1,2").decode("utf-8"),
                "fileName": "export.csv",
                "mimeType": "text/csv",
            }],
        }
        result_dict = {
            "status": "success",
            "response_text": "Here is your export.",
            "channel": "C01234567",
            "bot_token": "xoxb-test",
            "thread_ts": None,
        }
        mock_format.return_value = (result_dict, file_artifact)

        from main import _process_bedrock_request

        _process_bedrock_request(
            task_id="task-file-001",
            text="Export as CSV",
            channel="C01234567",
            bot_token="xoxb-test",
            thread_ts=None,
            correlation_id="corr-file",
            attachments=[],
        )

        mock_app.complete_async_task.assert_called_once()
        call_args = mock_app.complete_async_task.call_args
        completed_result = json.loads(call_args[0][1])
        assert completed_result["status"] == "success"
        assert completed_result.get("response_text") == "Here is your export."
        assert "file_artifact" in completed_result
        fa = completed_result["file_artifact"]
        assert fa["name"] == "generated_file"
        assert len(fa.get("parts", [])) == 1
        part = fa["parts"][0]
        assert part.get("fileName") == "export.csv"
        assert part.get("mimeType") == "text/csv"
        assert "contentBase64" in part

    @patch("main.app")
    @patch("main.invoke_bedrock")
    @patch("main.process_attachments")
    @patch("main.format_success_response")
    def test_no_file_generated_result_has_no_file_artifact(self, mock_format, mock_attachments, mock_bedrock, mock_app):
        """When no file is generated, completed result has no file_artifact (014 US2)."""
        mock_bedrock.return_value = "Text only."
        mock_attachments.return_value = []
        mock_format.return_value = (
            {"status": "success", "response_text": "Text only.", "channel": "C1", "bot_token": "xoxb-1", "thread_ts": None},
            None,
        )
        from main import _process_bedrock_request
        _process_bedrock_request(
            task_id="t1", text="Hi", channel="C1", bot_token="xoxb-1", thread_ts=None, correlation_id="c1", attachments=[],
        )
        completed_result = json.loads(mock_app.complete_async_task.call_args[0][1])
        assert completed_result["status"] == "success"
        assert "file_artifact" not in completed_result

    @patch("main.app")
    @patch("main.invoke_bedrock")
    @patch("main.process_attachments")
    @patch("main.format_success_response")
    def test_only_file_response_has_empty_response_text_and_file_artifact(self, mock_format, mock_attachments, mock_bedrock, mock_app):
        """When only file is returned, result has empty/minimal response_text and file_artifact (014 US2)."""
        import base64
        mock_bedrock.return_value = ""
        mock_attachments.return_value = []
        file_artifact = {
            "artifactId": "a1", "name": "generated_file",
            "parts": [{"kind": "file", "contentBase64": base64.b64encode(b"x").decode("utf-8"), "fileName": "f.csv", "mimeType": "text/csv"}],
        }
        result_dict = {"status": "success", "response_text": "", "channel": "C1", "bot_token": "xoxb-1", "thread_ts": None}
        mock_format.return_value = (result_dict, file_artifact)
        from main import _process_bedrock_request
        _process_bedrock_request(
            task_id="t2", text="Export", channel="C1", bot_token="xoxb-1", thread_ts=None, correlation_id="c2", attachments=[],
        )
        completed_result = json.loads(mock_app.complete_async_task.call_args[0][1])
        assert completed_result["status"] == "success"
        assert completed_result.get("response_text") == ""
        assert completed_result.get("file_artifact") is not None
        assert completed_result["file_artifact"]["name"] == "generated_file"

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
        mock_format.return_value = (
            {"status": "success", "response_text": "Based on the document..."},
            None,
        )

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


class Test020A2ARouting:
    """020: Verify A2A protocol routing — POST / delegates to SDK _handle_invocation."""

    def test_a2a_root_route_registered(self):
        """POST / route must be registered on app for A2A protocol (T009)."""
        import main

        route_paths = []
        for route in main.app.routes:
            path = getattr(route, "path", None)
            if path == "/":
                methods = getattr(route, "methods", set())
                route_paths.append(("/", methods))

        assert any(
            path == "/" and "POST" in methods
            for path, methods in route_paths
        ), "POST / route not found in app.routes"

    def test_a2a_root_handler_delegates_to_handle_invocation(self):
        """a2a_root_handler must be registered and callable (T010)."""
        import main

        handler = main.app._routes_dict.get("/")
        assert handler is not None, "No handler registered for POST /"
        assert handler.__name__ == "a2a_root_handler", (
            f"Expected a2a_root_handler, got {handler.__name__}"
        )

    def test_existing_invocations_route_still_works(self):
        """SDK /invocations route must still be registered (regression) (T011)."""
        import main

        route_paths = [getattr(r, "path", None) for r in main.app.routes]
        assert "/invocations" in route_paths, "/invocations route missing (regression)"

    def test_agent_card_route_still_works(self):
        """/.well-known/agent-card.json GET route must still be registered (regression) (T012)."""
        import main

        found = False
        for route in main.app.routes:
            if getattr(route, "path", None) == "/.well-known/agent-card.json":
                methods = getattr(route, "methods", set())
                if "GET" in methods:
                    found = True
                    break
        assert found, "/.well-known/agent-card.json GET route missing (regression)"

    def test_ping_route_still_works(self):
        """/ping GET route must still be registered (regression) (T013)."""
        import main

        found = False
        for route in main.app.routes:
            if getattr(route, "path", None) == "/ping":
                methods = getattr(route, "methods", set())
                if "GET" in methods:
                    found = True
                    break
        assert found, "/ping GET route missing (regression)"

    def test_app_run_uses_port_9000(self):
        """app.run(port=9000) must be present in main.py source (T014)."""
        main_path = os.path.join(os.path.dirname(__file__), "..", "main.py")
        with open(main_path) as f:
            source = f.read()
        assert "app.run(port=9000)" in source, (
            "main.py must use app.run(port=9000) for A2A protocol, "
            "found bare app.run() instead"
        )
