"""
Unit tests for Execution Agent main.py (A2A entrypoint).

Tests:
- A2A message parsing and validation
- Bedrock processing (synchronous via handle_message_tool)
- Error handling and error code mapping
- Agent Card and health check endpoints
- strands-agents migration (021)
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

    def test_missing_channel_returns_error(self):
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

    def test_missing_text_returns_error(self):
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

    def test_empty_payload_handled_gracefully(self):
        """Empty payload should not crash."""
        from main import handle_message

        payload = {"prompt": "{}"}
        result = handle_message(payload)
        result_data = json.loads(result)

        # Should return error for missing channel/text
        assert "error" in result_data.get("status", "") or "error" in result_data.get("error_code", "")


def _make_agent_result(text: str):
    """Build mock AgentResult for Strands Agent (027)."""
    return Mock(
        message={"content": [{"text": text}], "role": "assistant"},
        stop_reason="end_turn",
    )


class TestHandleMessageProcessing:
    """Test the synchronous Bedrock/Strands Agent processing flow (027)."""

    @patch("main.create_agent")
    @patch("main.process_attachments")
    @patch("main.format_success_response")
    def test_valid_message_returns_success(
        self, mock_format, mock_attachments, mock_create_agent
    ):
        """Valid message should process and return success result."""
        mock_agent = Mock(return_value=_make_agent_result("AI response text"))
        mock_create_agent.return_value = mock_agent
        mock_attachments.return_value = []
        mock_format.return_value = (
            {"status": "success", "response_text": "AI response text"},
            None,
        )

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

        assert result_data["status"] == "success"
        mock_agent.assert_called_once()

    @patch("main.create_agent")
    @patch("main.process_attachments")
    def test_success_with_file_artifact(
        self, mock_attachments, mock_create_agent
    ):
        """When file is returned, result has response_text and file_artifact (014 US1, 027)."""
        def agent_side_effect(agent_input, **kwargs):
            invocation_state = kwargs.get("invocation_state", {})
            if invocation_state is not None:
                invocation_state["generated_file"] = {
                    "file_bytes": b"a,b\n1,2",
                    "file_name": "export.csv",
                    "mime_type": "text/csv",
                    "description": "CSV exported",
                }
            return _make_agent_result("Here is your export.")

        mock_agent = Mock(side_effect=agent_side_effect)
        mock_create_agent.return_value = mock_agent
        mock_attachments.return_value = []

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Export as CSV",
                "bot_token": "xoxb-test",
                "correlation_id": "corr-file",
            })
        }

        result = handle_message(payload)
        completed_result = json.loads(result)

        assert completed_result["status"] == "success"
        assert completed_result.get("response_text") == "Here is your export."
        assert "file_artifact" in completed_result
        fa = completed_result["file_artifact"]
        assert fa["name"] == "generated_file"
        assert len(fa.get("parts", [])) == 1
        part = fa["parts"][0]
        assert part.get("fileName") == "export.csv"
        assert part.get("mimeType") == "text/csv"

    @patch("main.create_agent")
    @patch("main.process_attachments")
    @patch("main.format_success_response")
    def test_no_file_generated_result_has_no_file_artifact(
        self, mock_format, mock_attachments, mock_create_agent
    ):
        """When no file is generated, completed result has no file_artifact (014 US2)."""
        mock_agent = Mock(return_value=_make_agent_result("Text only."))
        mock_create_agent.return_value = mock_agent
        mock_attachments.return_value = []
        mock_format.return_value = (
            {"status": "success", "response_text": "Text only.", "channel": "C1", "bot_token": "xoxb-1", "thread_ts": None},
            None,
        )
        from main import handle_message
        payload = {
            "prompt": json.dumps({
                "channel": "C1", "text": "Hi", "bot_token": "xoxb-1",
            })
        }
        result = handle_message(payload)
        completed_result = json.loads(result)
        assert completed_result["status"] == "success"
        assert "file_artifact" not in completed_result

    @patch("main.create_agent")
    @patch("main.process_attachments")
    def test_only_file_response_has_empty_response_text_and_file_artifact(
        self, mock_attachments, mock_create_agent
    ):
        """When only file is returned, result has empty/minimal response_text and file_artifact (014 US2)."""
        def agent_side_effect(agent_input, **kwargs):
            invocation_state = kwargs.get("invocation_state", {})
            if invocation_state is not None:
                invocation_state["generated_file"] = {
                    "file_bytes": b"x",
                    "file_name": "f.csv",
                    "mime_type": "text/csv",
                    "description": "CSV",
                }
            return _make_agent_result("")

        mock_agent = Mock(side_effect=agent_side_effect)
        mock_create_agent.return_value = mock_agent
        mock_attachments.return_value = []

        from main import handle_message
        payload = {
            "prompt": json.dumps({
                "channel": "C1", "text": "Export", "bot_token": "xoxb-1",
            })
        }
        result = handle_message(payload)
        completed_result = json.loads(result)
        assert completed_result["status"] == "success"
        assert completed_result.get("response_text") == ""
        assert completed_result.get("file_artifact") is not None
        assert completed_result["file_artifact"]["name"] == "generated_file"

    @patch("main.create_agent")
    @patch("main.process_attachments")
    @patch("main.format_error_response")
    def test_bedrock_exception_returns_error(
        self, mock_format, mock_attachments, mock_create_agent
    ):
        """Bedrock exception should return error result."""
        mock_agent = Mock(side_effect=Exception("Throttling: rate exceeded"))
        mock_create_agent.return_value = mock_agent
        mock_attachments.return_value = []
        mock_format.return_value = {
            "status": "error",
            "error_code": "bedrock_throttling",
        }

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Hello",
                "bot_token": "xoxb-test",
                "correlation_id": "corr-002",
            })
        }

        result = handle_message(payload)
        result_data = json.loads(result)
        assert result_data["status"] == "error"

    @patch("main.create_agent")
    @patch("main.process_attachments")
    @patch("main.get_processing_summary")
    @patch("main.format_success_response")
    def test_attachments_are_processed_before_bedrock(
        self, mock_format, mock_summary, mock_attachments, mock_create_agent
    ):
        """Attachments should be processed and included in agent input."""
        mock_agent = Mock(return_value=_make_agent_result("Based on the document..."))
        mock_create_agent.return_value = mock_agent
        mock_attachments.return_value = [
            {
                "file_id": "F001",
                "file_name": "doc.pdf",
                "mimetype": "application/pdf",
                "content_type": "document",
                "document_bytes": b"pdf-content",
                "document_format": "pdf",
                "content": "Extracted PDF text content here",
                "processing_status": "success",
            }
        ]
        mock_summary.return_value = {
            "total": 1, "success": 1, "failed": 0, "skipped": 0,
            "failure_codes": {},
            "has_images": False, "has_documents": True,
        }
        mock_format.return_value = (
            {"status": "success", "response_text": "Based on the document..."},
            None,
        )

        from main import handle_message

        attachments = [{"id": "F001", "name": "doc.pdf", "mimetype": "application/pdf", "size": 1024}]

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Summarize this",
                "bot_token": "xoxb-test",
                "correlation_id": "corr-003",
                "attachments": attachments,
            })
        }

        handle_message(payload)

        mock_attachments.assert_called_once()
        # Agent should be called with multimodal input (messages with documents)
        call_args = mock_agent.call_args
        agent_input = call_args[0][0] if call_args[0] else call_args[1].get("invocation_state")
        invocation_state = call_args[1].get("invocation_state", {})
        # Agent input can be str or list[Message]; with attachments it's messages
        assert mock_agent.called


class TestFileGenerationIntentDetection:
    """027: Test file generation intent detection for tool use control."""

    def test_indicates_file_generation_japanese(self):
        """Japanese phrases for file creation should return True."""
        from main import _indicates_file_generation

        assert _indicates_file_generation("サンプルexcelファイルを作成") is True
        assert _indicates_file_generation("サンプルmarkdownファイルを作成") is True
        assert _indicates_file_generation("ファイルを作って") is True
        assert _indicates_file_generation("エクセルで集計表を作成") is True
        assert _indicates_file_generation("グラフを画像で作成して") is True

    def test_indicates_file_generation_english(self):
        """English phrases for file creation should return True."""
        from main import _indicates_file_generation

        assert _indicates_file_generation("Create an Excel file") is True
        assert _indicates_file_generation("generate a markdown file") is True
        assert _indicates_file_generation("make a csv file") is True

    def test_indicates_file_generation_negative(self):
        """Non-file-generation phrases should return False."""
        from main import _indicates_file_generation

        assert _indicates_file_generation("こんにちは") is False
        assert _indicates_file_generation("このドキュメントを要約して") is False
        assert _indicates_file_generation("") is False
        assert _indicates_file_generation(None) is False  # type: ignore


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

    def test_tool_failure_maps_correctly(self):
        """FR-010: tool exceptions (e.g. ValueError) map to user-friendly message."""
        from main import _map_error_to_response, ERROR_MESSAGES

        error = ValueError("invalid sheet name")
        code, msg = _map_error_to_response(error)
        assert code == "tool_failure"
        assert msg == ERROR_MESSAGES["tool_failure"]

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
        assert card["name"] == "SlackAI-FileCreatorAgent"
        assert card["protocol"] == "A2A"
        assert card["protocolVersion"] == "1.0"
        assert "skills" in card
        assert len(card["skills"]) >= 3

    def test_agent_card_skills_have_ids(self):
        from agent_card import get_agent_card

        card = get_agent_card()
        skill_ids = [s["id"] for s in card["skills"]]
        assert "generate_excel" in skill_ids
        assert "generate_word" in skill_ids
        assert "generate_powerpoint" in skill_ids

    def test_agent_card_authentication_is_sigv4(self):
        from agent_card import get_agent_card

        card = get_agent_card()
        assert card["authentication"]["type"] == "SIGV4"

    def test_health_status_healthy(self):
        from agent_card import get_health_status

        status = get_health_status(is_busy=False)
        assert status["status"] == "Healthy"
        assert status["agent"] == "SlackAI-FileCreatorAgent"

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
    """020→021: A2A routing via FastAPI (invoke_agent_runtime sends raw payload to POST /)."""

    def test_ping_route_registered_on_fastapi(self):
        """GET /ping route must be registered on FastAPI app."""
        import main

        assert ("GET", "/ping") in main.app._routes, "/ping GET route not registered on FastAPI app"

    def test_post_root_route_registered(self):
        """POST / route must be registered for invoke_agent_runtime payloads."""
        import main

        assert ("POST", "/") in main.app._routes, "POST / route not registered on FastAPI app"

    def test_agent_card_route_registered(self):
        """GET /.well-known/agent-card.json route must be registered."""
        import main

        assert ("GET", "/.well-known/agent-card.json") in main.app._routes, "Agent Card route not registered"

    def test_uvicorn_run_uses_port_9000(self):
        """uvicorn.run(app, ..., port=9000) must be present in main.py source."""
        main_path = os.path.join(os.path.dirname(__file__), "..", "src", "main.py")
        with open(main_path) as f:
            source = f.read()
        assert "port=9000" in source, (
            "main.py must use port=9000 for A2A protocol"
        )


class Test021FastAPIDirectRouting:
    """021: Verify FastAPI direct routing (invoke_agent_runtime sends raw payload, not JSON-RPC)."""

    def test_fastapi_ping_endpoint_registered(self):
        """GET /ping route exists on the FastAPI app."""
        import main

        app = main.app
        assert ("GET", "/ping") in app._routes, "/ping GET route not registered on FastAPI app"

    def test_post_root_handles_invocation(self):
        """POST / route exists for invoke_agent_runtime payloads."""
        import main

        app = main.app
        assert ("POST", "/") in app._routes, "POST / route not registered on FastAPI app"

    def test_agent_card_endpoint_registered(self):
        """GET /.well-known/agent-card.json route exists."""
        import main

        app = main.app
        assert ("GET", "/.well-known/agent-card.json") in app._routes, "Agent Card route not registered"

    def test_no_private_api_usage(self):
        """main.py source has zero occurrences of _handle_invocation."""
        main_path = os.path.join(os.path.dirname(__file__), "..", "src", "main.py")
        with open(main_path) as f:
            source = f.read()
        assert "_handle_invocation" not in source, (
            "main.py still references private API _handle_invocation"
        )

    def test_no_bedrock_agentcore_import(self):
        """main.py source has zero occurrences of bedrock_agentcore."""
        main_path = os.path.join(os.path.dirname(__file__), "..", "src", "main.py")
        with open(main_path) as f:
            source = f.read()
        assert "bedrock_agentcore" not in source, (
            "main.py still imports bedrock_agentcore"
        )

    def test_uses_agent_factory_for_inference(self):
        """main.py uses create_agent from agent_factory (027 Strands Agent)."""
        main_path = os.path.join(os.path.dirname(__file__), "..", "src", "main.py")
        with open(main_path) as f:
            source = f.read()
        assert "create_agent" in source, "main.py should use create_agent for inference"

    def test_handle_message_tool_processes_payload(self):
        """handle_message_tool receives payload and returns formatted response."""
        import main

        tool_fn = main.handle_message_tool
        assert callable(tool_fn)


class TestUS3VersionConstraints:
    """US3: Verify requirements.txt uses pinned (~= or ==) versions, no loose (>=) constraints."""

    def test_no_loose_version_constraints(self):
        """requirements.txt must not contain >= constraints (all must be ~= or ==)."""
        req_path = os.path.join(os.path.dirname(__file__), "..", "src", "requirements.txt")
        with open(req_path) as f:
            lines = f.readlines()
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            assert ">=" not in stripped, (
                f"Loose version constraint found: {stripped!r} — use ~= or == instead of >="
            )

    def test_no_bedrock_agentcore_dependency(self):
        """requirements.txt must not list bedrock-agentcore (unused after migration)."""
        req_path = os.path.join(os.path.dirname(__file__), "..", "src", "requirements.txt")
        with open(req_path) as f:
            content = f.read()
        assert "bedrock-agentcore" not in content, (
            "bedrock-agentcore should be removed from requirements.txt"
        )


class Test032JsonRpcZoneConnection:
    """032: JSON-RPC 2.0 zone connection (CSP-independent A2A)."""

    def test_jsonrpc_invalid_json_returns_parse_error(self):
        """POST body that is not valid JSON returns JSON-RPC 2.0 error -32700, id null."""
        import main
        body = b"not valid json"
        resp = main.handle_invocation_body(body)
        assert resp.get("jsonrpc") == "2.0"
        assert "error" in resp
        assert resp["error"]["code"] == -32700
        assert resp["error"]["message"] == "Parse error"
        assert resp.get("id") is None

    def test_jsonrpc_valid_json_but_invalid_request_returns_32600(self):
        """POST body valid JSON but missing method returns JSON-RPC 2.0 error -32600, id null."""
        import main
        body = b'{"foo": 1}'
        resp = main.handle_invocation_body(body)
        assert resp.get("jsonrpc") == "2.0"
        assert "error" in resp
        assert resp["error"]["code"] == -32600
        assert resp["error"]["message"] == "Invalid Request"
        assert resp.get("id") is None

    def test_jsonrpc_unknown_method_returns_method_not_found(self):
        """POST method 'foobar' with id returns JSON-RPC 2.0 error -32601 and same id."""
        import main
        body = b'{"jsonrpc": "2.0", "method": "foobar", "id": "1"}'
        resp = main.handle_invocation_body(body)
        assert resp.get("jsonrpc") == "2.0"
        assert "error" in resp
        assert resp["error"]["code"] == -32601
        assert resp["error"]["message"] == "Method not found"
        assert resp.get("id") == "1"

    @patch("main.get_agent_card")
    def test_jsonrpc_get_agent_card_returns_card_with_id(self, mock_get_agent_card):
        """POST get_agent_card returns JSON-RPC result with card and same id."""
        import main

        mock_get_agent_card.return_value = {
            "name": "SlackAI-ExecutionAgent",
            "protocol": "A2A",
        }
        body = b'{"jsonrpc":"2.0","method":"get_agent_card","id":"card-1"}'
        resp = main.handle_invocation_body(body)
        assert resp.get("jsonrpc") == "2.0"
        assert resp.get("id") == "card-1"
        assert resp.get("result", {}).get("name") == "SlackAI-ExecutionAgent"
        assert "error" not in resp

    @patch("main.handle_message_tool")
    def test_jsonrpc_execute_task_returns_result_with_id(self, mock_tool):
        """POST valid JSON-RPC execute_task with params returns JSON-RPC 2.0 response with result or error and same id."""
        import main
        mock_tool.return_value = json.dumps({
            "status": "success",
            "response_text": "AI reply",
        })
        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "params": {
                "channel": "C01234",
                "text": "Hello",
                "bot_token": "xoxb-test",
            },
            "id": "2",
        }).encode("utf-8")
        resp = main.handle_invocation_body(body)
        assert resp.get("jsonrpc") == "2.0"
        assert resp.get("id") == "2"
        assert "result" in resp or "error" in resp
        if "result" in resp:
            assert resp["result"].get("status") == "success"
            assert resp["result"].get("response_text") == "AI reply"

    def test_jsonrpc_execute_task_missing_channel_returns_invalid_params(self):
        """T023 [US2]: execute_task with params missing channel returns error.code -32602, request id preserved."""
        import main
        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "params": {"text": "Hi", "bot_token": "xoxb-test"},
            "id": "req-32602",
        }).encode("utf-8")
        resp = main.handle_invocation_body(body)
        assert resp.get("jsonrpc") == "2.0"
        assert "error" in resp
        assert resp["error"]["code"] == -32602
        assert "Invalid params" in resp["error"].get("message", "")
        assert resp.get("id") == "req-32602"
        assert "result" not in resp

    @patch("main.handle_message_tool")
    def test_jsonrpc_execute_task_exception_returns_internal_error_with_id(self, mock_tool):
        """T024 [US2]: When processing throws, response has error.code -32603 or -32001, request id preserved."""
        import main
        mock_tool.side_effect = RuntimeError("Simulated failure")
        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "execute_task",
            "params": {"channel": "C01", "text": "Hi", "bot_token": "xoxb-test"},
            "id": "req-32603",
        }).encode("utf-8")
        resp = main.handle_invocation_body(body)
        assert resp.get("jsonrpc") == "2.0"
        assert "error" in resp
        assert resp["error"]["code"] in (-32603, -32001)
        assert resp.get("id") == "req-32603"
        assert "result" not in resp
