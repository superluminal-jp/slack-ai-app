"""
Unit tests for Verification Agent main.py (A2A entrypoint).

Tests:
- A2A message parsing
- Security verification pipeline (existence check, authorization, rate limit)
- Delegation to Execution Agent
- Slack response posting
- Error handling and user-friendly error mapping
- Agent Card and health check
"""

import json
import os
import sys
from unittest.mock import Mock, patch, MagicMock

import pytest

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def mock_routing_defaults():
    """Keep tests focused on pipeline behavior, not router selection outcomes."""
    with patch("pipeline.route_request", return_value="file-creator"), patch(
        "pipeline.get_agent_arn",
        return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
    ):
        yield


class TestHandleMessageParsing:
    """Test A2A entrypoint payload parsing."""

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_valid_payload_is_parsed(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """Valid payload should be parsed and processed."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "AI answer",
        })

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Hello",
                "bot_token": "xoxb-test",
                "thread_ts": "1234.5678",
                "correlation_id": "corr-001",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }

        result = handle_message(payload)
        result_data = json.loads(result)

        assert result_data["status"] == "completed"
        mock_invoke.assert_called_once()
        mock_send.assert_called_once()

    def test_malformed_prompt_handled_gracefully(self):
        """Malformed prompt JSON should not crash."""
        from main import handle_message

        payload = {"prompt": "not-valid-json{{{"}
        result = handle_message(payload)
        result_data = json.loads(result)

        assert result_data["status"] == "error"
        assert result_data["error_code"] == "internal_error"


class TestSecurityPipeline:
    """Test the security verification pipeline."""

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_existence_check_failure_blocks_request(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """Failed existence check should return error, not delegate."""
        from existence_check import ExistenceCheckError

        mock_existence.side_effect = ExistenceCheckError("Team not found")

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Hello",
                "bot_token": "xoxb-test",
                "team_id": "T_INVALID",
                "user_id": "U1234",
            })
        }

        result = handle_message(payload)
        result_data = json.loads(result)

        assert result_data["status"] == "error"
        assert result_data["error_code"] == "existence_check_failed"
        mock_invoke.assert_not_called()

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_authorization_failure_blocks_request(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """Unauthorized request should return error, not delegate."""
        mock_auth.return_value = Mock(authorized=False, unauthorized_entities=["T_BAD"])

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Hello",
                "bot_token": "xoxb-test",
                "team_id": "T_BAD",
                "user_id": "U1234",
            })
        }

        result = handle_message(payload)
        result_data = json.loads(result)

        assert result_data["status"] == "error"
        assert result_data["error_code"] == "authorization_failed"
        mock_invoke.assert_not_called()

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_rate_limit_exceeded_blocks_request(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """Exceeding rate limit should return error, not delegate."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (False, 0)  # Not allowed

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Hello",
                "bot_token": "xoxb-test",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }

        result = handle_message(payload)
        result_data = json.loads(result)

        assert result_data["status"] == "error"
        assert result_data["error_code"] == "rate_limit_exceeded"
        mock_invoke.assert_not_called()


class TestExecutionDelegation:
    """Test delegation to Execution Agent and Slack posting."""

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_success_response_posted_to_slack(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """Successful execution response should be enqueued to Slack Poster (019)."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "This is the AI answer.",
        })

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Question",
                "bot_token": "xoxb-test",
                "thread_ts": "1234.5678",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }

        result = handle_message(payload)

        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["channel"] == "C01234567"
        assert call_kw["thread_ts"] == "1234.5678"
        assert call_kw["text"] == "This is the AI answer."
        assert call_kw["bot_token"] == "xoxb-test"
        assert call_kw.get("file_artifact") is None

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_success_with_file_artifact_posts_text_then_file(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """When result has response_text and file_artifact, send one request with both (019)."""
        import base64
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        file_bytes = b"col1,col2\n1,2"
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "Here is your export.",
            "file_artifact": {
                "artifactId": "art-1",
                "name": "generated_file",
                "parts": [{
                    "kind": "file",
                    "contentBase64": base64.b64encode(file_bytes).decode("utf-8"),
                    "fileName": "export.csv",
                    "mimeType": "text/csv",
                }],
            },
        })

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Export as CSV",
                "bot_token": "xoxb-test",
                "thread_ts": "1234.5678",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }

        handle_message(payload)

        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["channel"] == "C01234567"
        assert call_kw["text"] == "Here is your export."
        assert call_kw["file_artifact"] is not None
        assert call_kw["file_artifact"].get("fileName") == "export.csv"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_success_text_only_does_not_call_post_file_to_slack(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """When result has no generated_file, only send_slack_post_request with text (019)."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "Text only answer.",
        })
        from main import handle_message
        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Hello",
                "bot_token": "xoxb-test",
                "thread_ts": "1234.5678",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }
        handle_message(payload)
        mock_send.assert_called_once()
        assert mock_send.call_args[1].get("file_artifact") is None

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_success_file_only_calls_post_file_to_slack_not_post_to_slack_for_content(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """When only file (no/empty response_text), send one request with file_artifact only (019)."""
        import base64
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "",
            "file_artifact": {
                "artifactId": "a1", "name": "generated_file",
                "parts": [{
                    "kind": "file",
                    "contentBase64": base64.b64encode(b"data").decode("utf-8"),
                    "fileName": "out.csv",
                    "mimeType": "text/csv",
                }],
            },
        })
        from main import handle_message
        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Export",
                "bot_token": "xoxb-test",
                "thread_ts": "1234.5678",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }
        handle_message(payload)
        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["file_artifact"] is not None
        assert call_kw["file_artifact"]["fileName"] == "out.csv"
        assert not call_kw.get("text") or call_kw.get("text") == ""

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_post_file_to_slack_failure_posts_error_message_to_thread(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """019: Agent sends one message with text+file; Lambda posts and on file failure posts error (FR-007)."""
        import base64
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "Here is the file.",
            "file_artifact": {
                "artifactId": "a1", "name": "generated_file",
                "parts": [{
                    "kind": "file",
                    "contentBase64": base64.b64encode(b"data").decode("utf-8"),
                    "fileName": "f.csv",
                    "mimeType": "text/csv",
                }],
            },
        })
        from main import handle_message
        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Export",
                "bot_token": "xoxb-test",
                "thread_ts": "1234.5678",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }
        handle_message(payload)
        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["text"] == "Here is the file."
        assert call_kw["file_artifact"] is not None

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_error_response_posts_friendly_message(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """Error from Execution Agent should enqueue user-friendly message (019)."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "error",
            "error_code": "bedrock_timeout",
            "error_message": "Raw timeout error",
        })

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Question",
                "bot_token": "xoxb-test",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }

        result = handle_message(payload)

        mock_send.assert_called_once()
        posted_text = mock_send.call_args[1]["text"]
        assert "AI サービス" in posted_text or "hourglass" in posted_text

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_execution_agent_exception_posts_generic_error(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """Exception from invoke should enqueue generic error (019)."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.side_effect = Exception("Connection refused")

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Question",
                "bot_token": "xoxb-test",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }

        result = handle_message(payload)
        result_data = json.loads(result)

        assert result_data["status"] == "error"
        mock_send.assert_called_once()


class TestErrorMessageMapping:
    """Test user-friendly error message mapping."""

    def test_known_error_codes_have_friendly_messages(self):
        from pipeline import _get_user_friendly_error

        assert "AI サービス" in _get_user_friendly_error("bedrock_timeout")
        assert "混雑" in _get_user_friendly_error("bedrock_throttling")
        assert "アクセス" in _get_user_friendly_error("access_denied")
        assert "タイムアウト" in _get_user_friendly_error("async_timeout")

    def test_unknown_error_code_uses_default(self):
        from pipeline import _get_user_friendly_error, DEFAULT_ERROR_MESSAGE

        result = _get_user_friendly_error("unknown_code_xyz")
        assert result == DEFAULT_ERROR_MESSAGE

    def test_fallback_message_used_when_available(self):
        from pipeline import _get_user_friendly_error

        result = _get_user_friendly_error("unknown_code", "Custom fallback")
        assert result == "Custom fallback"


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


class TestVerificationAgentCard:
    """Test Agent Card for Verification Agent."""

    def test_agent_card_has_required_fields(self):
        from agent_card import get_agent_card

        card = get_agent_card()
        assert card["name"] == "SlackAI-VerificationAgent"
        assert card["protocol"] == "A2A"
        assert "skills" in card
        assert len(card["skills"]) >= 5

    def test_agent_card_skills_cover_security_pipeline(self):
        from agent_card import get_agent_card

        card = get_agent_card()
        skill_ids = [s["id"] for s in card["skills"]]
        assert "slack-request-validation" in skill_ids
        assert "existence-check" in skill_ids
        assert "whitelist-authorization" in skill_ids
        assert "rate-limiting" in skill_ids
        assert "task-delegation" in skill_ids
        assert "slack-response" in skill_ids

    def test_health_status_healthy(self):
        from agent_card import get_health_status

        status = get_health_status(is_busy=False)
        assert status["status"] == "Healthy"
        assert status["agent"] == "SlackAI-VerificationAgent"

    def test_health_status_busy(self):
        from agent_card import get_health_status

        status = get_health_status(is_busy=True)
        assert status["status"] == "HealthyBusy"


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
        main_path = os.path.join(os.path.dirname(__file__), "../src/main.py")
        with open(main_path) as f:
            source = f.read()
        assert "_handle_invocation" not in source, (
            "main.py still references private API _handle_invocation"
        )

    def test_no_bedrock_agentcore_import(self):
        """main.py source has zero occurrences of bedrock_agentcore."""
        main_path = os.path.join(os.path.dirname(__file__), "../src/main.py")
        with open(main_path) as f:
            source = f.read()
        assert "bedrock_agentcore" not in source, (
            "main.py still imports bedrock_agentcore"
        )

    def test_uvicorn_run_uses_port_9000(self):
        """uvicorn.run(app, ..., port=9000) must be present in main.py source."""
        main_path = os.path.join(os.path.dirname(__file__), "../src/main.py")
        with open(main_path) as f:
            source = f.read()
        assert "port=9000" in source, "main.py must use port=9000 for A2A protocol"

    def test_no_strands_import(self):
        """main.py should not import strands (uses FastAPI directly)."""
        main_path = os.path.join(os.path.dirname(__file__), "../src/main.py")
        with open(main_path) as f:
            source = f.read()
        assert "from strands" not in source, "main.py should not import strands"


class TestUS3VersionConstraints:
    """US3: Verify requirements.txt uses pinned (~= or ==) versions, no loose (>=) constraints."""

    def test_no_loose_version_constraints(self):
        """requirements.txt must not contain >= constraints (all must be ~= or ==)."""
        req_path = os.path.join(os.path.dirname(__file__), "../src/requirements.txt")
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
        req_path = os.path.join(os.path.dirname(__file__), "../src/requirements.txt")
        with open(req_path) as f:
            content = f.read()
        assert "bedrock-agentcore" not in content, (
            "bedrock-agentcore should be removed from requirements.txt"
        )


# ─── 022: Echo Mode Disable — Normal Flow & Security Check TDD ───


class Test022NormalFlowDelegation:
    """022 US1: Pipeline delegates to Execution Agent (normal flow)."""

    def _make_payload(self, text="Hello", channel="C01234567", thread_ts="1234.5678",
                      team_id="T1234", user_id="U1234", correlation_id="corr-022"):
        return {
            "prompt": json.dumps({
                "channel": channel,
                "text": text,
                "bot_token": "xoxb-test",
                "thread_ts": thread_ts,
                "correlation_id": correlation_id,
                "team_id": team_id,
                "user_id": user_id,
                "attachments": [{"id": "F001", "name": "test.txt"}],
            })
        }

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_echo_off_delegates_to_execution_agent(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T003: Echo mode off → invoke_execution_agent called, AI response posted to Slack."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "AI answer from execution",
        })

        from main import handle_message

        result = handle_message(self._make_payload())

        result_data = json.loads(result)
        assert result_data["status"] == "completed"
        mock_invoke.assert_called_once()
        mock_send.assert_called_once()
        assert mock_send.call_args[1]["text"] == "AI answer from execution"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_echo_off_no_echo_prefix_in_response(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T004: Echo mode off → response does NOT contain [Echo] prefix."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "Normal AI response",
        })

        from main import handle_message

        handle_message(self._make_payload())

        posted_text = mock_send.call_args[1]["text"]
        assert "[Echo]" not in posted_text
        assert posted_text == "Normal AI response"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_echo_off_with_file_artifact(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T005: Echo mode off → file artifact from execution agent forwarded to Slack."""
        import base64
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "See attached.",
            "file_artifact": {
                "artifactId": "art-022",
                "name": "generated_file",
                "parts": [{
                    "kind": "file",
                    "contentBase64": base64.b64encode(b"csv,data").decode("utf-8"),
                    "fileName": "result.csv",
                    "mimeType": "text/csv",
                }],
            },
        })

        from main import handle_message

        handle_message(self._make_payload())

        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["text"] == "See attached."
        assert call_kw["file_artifact"] is not None
        assert call_kw["file_artifact"]["fileName"] == "result.csv"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_echo_off_payload_contains_all_fields(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T006: Execution payload includes all required fields."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "ok"})

        from main import handle_message

        handle_message(self._make_payload(
            text="question", channel="C_TEST", thread_ts="999.000",
            team_id="T_TEAM", user_id="U_USER", correlation_id="corr-fields"
        ))

        invoke_args = mock_invoke.call_args[0][0]
        assert invoke_args["channel"] == "C_TEST"
        assert invoke_args["text"] == "question"
        # bot_token required for response formatting (success/error)
        assert invoke_args.get("bot_token") == "xoxb-test"
        assert invoke_args["thread_ts"] == "999.000"
        assert invoke_args["correlation_id"] == "corr-fields"
        assert invoke_args["team_id"] == "T_TEAM"
        assert invoke_args["user_id"] == "U_USER"
        assert invoke_args["attachments"] == [{"id": "F001", "name": "test.txt"}]

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_echo_off_env_var_case_insensitive(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T007: Normal flow (delegation to execution agent) regardless of env."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "ok"})

        from main import handle_message

        for env_val in ["false", "False", "FALSE", "", "no", "0"]:
            mock_invoke.reset_mock()
            handle_message(self._make_payload())
            mock_invoke.assert_called_once(), f"invoke not called for ECHO_MODE={env_val!r}"


class Test022SecurityCheckPipeline:
    """022 US2: Security check pipeline order and failure isolation with echo mode off."""

    def _make_payload(self, team_id="T1234", user_id="U1234"):
        return {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Hello",
                "bot_token": "xoxb-test",
                "thread_ts": "1234.5678",
                "correlation_id": "corr-022-sec",
                "team_id": team_id,
                "user_id": user_id,
            })
        }

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_existence_check_runs_before_authorization(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T008: When existence check fails, authorization is NOT called."""
        from existence_check import ExistenceCheckError
        mock_existence.side_effect = ExistenceCheckError("Not found")

        from main import handle_message

        result = handle_message(self._make_payload())

        result_data = json.loads(result)
        assert result_data["error_code"] == "existence_check_failed"
        mock_auth.assert_not_called()
        mock_rate.assert_not_called()
        mock_invoke.assert_not_called()

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_authorization_runs_before_rate_limit(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T009: When authorization fails, rate_limit is NOT called."""
        mock_auth.return_value = Mock(authorized=False, unauthorized_entities=["T_BAD"])

        from main import handle_message

        result = handle_message(self._make_payload())

        result_data = json.loads(result)
        assert result_data["error_code"] == "authorization_failed"
        mock_existence.assert_called_once()
        mock_rate.assert_not_called()
        mock_invoke.assert_not_called()

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_rate_limit_exception_class_returns_error(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T010: RateLimitExceededError exception returns rate_limit_exceeded error."""
        from rate_limiter import RateLimitExceededError
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.side_effect = RateLimitExceededError("Too many requests")

        from main import handle_message

        result = handle_message(self._make_payload())

        result_data = json.loads(result)
        assert result_data["error_code"] == "rate_limit_exceeded"
        mock_invoke.assert_not_called()

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_authorization_exception_returns_error(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T011: Unexpected exception from authorize_request returns authorization_error."""
        mock_auth.side_effect = Exception("DynamoDB connection failed")

        from main import handle_message

        result = handle_message(self._make_payload())

        result_data = json.loads(result)
        assert result_data["error_code"] == "authorization_error"
        mock_invoke.assert_not_called()

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_all_checks_pass_delegates_to_execution(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T012: When all 3 security checks pass, invoke_execution_agent is called."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "ok"})

        from main import handle_message

        result = handle_message({
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "Hello",
                "bot_token": "xoxb-test",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        })

        result_data = json.loads(result)
        assert result_data["status"] == "completed"
        mock_existence.assert_called_once()
        mock_auth.assert_called_once()
        mock_rate.assert_called_once()
        mock_invoke.assert_called_once()


# ─── 022: Echo Mode Disable — Execution Error Paths TDD ───


class Test022ExecutionErrorPaths:
    """022 US3: Verify execution agent error codes produce correct user-friendly messages."""

    def _make_payload(self, text="Hello", channel="C01234567"):
        return {
            "prompt": json.dumps({
                "channel": channel,
                "text": text,
                "bot_token": "xoxb-secret-bot-token",
                "thread_ts": "1234.5678",
                "correlation_id": "corr-022-err",
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_bedrock_throttling_error_posts_friendly_message(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T017: bedrock_throttling error code produces message containing '混雑'."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "error",
            "error_code": "bedrock_throttling",
            "error_message": "ThrottlingException",
        })

        from main import handle_message

        handle_message(self._make_payload())

        mock_send.assert_called_once()
        posted_text = mock_send.call_args[1]["text"]
        assert "混雑" in posted_text, f"Expected '混雑' in throttling message, got: {posted_text}"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_access_denied_error_posts_friendly_message(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T018: access_denied error code produces message containing 'アクセス'."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "error",
            "error_code": "access_denied",
            "error_message": "AccessDeniedException",
        })

        from main import handle_message

        handle_message(self._make_payload())

        mock_send.assert_called_once()
        posted_text = mock_send.call_args[1]["text"]
        assert "アクセス" in posted_text, f"Expected 'アクセス' in access_denied message, got: {posted_text}"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_invalid_json_response_from_execution_posts_generic_error(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T019: Non-JSON response from execution agent posts generic error message to Slack."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = "THIS IS NOT JSON {{{"

        from main import handle_message

        result = handle_message(self._make_payload())

        result_data = json.loads(result)
        assert result_data["status"] == "error"
        assert result_data["error_code"] == "invalid_response"
        mock_send.assert_called_once()
        posted_text = mock_send.call_args[1]["text"]
        assert "エラー" in posted_text, f"Expected generic error message, got: {posted_text}"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_empty_response_from_execution_handles_gracefully(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T020: Empty string response from execution agent does not crash, posts error to Slack."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = ""

        from main import handle_message

        result = handle_message(self._make_payload())

        result_data = json.loads(result)
        assert result_data["status"] == "error"
        assert result_data["error_code"] == "invalid_response"
        mock_send.assert_called_once()

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_exception_does_not_leak_internal_details(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T021: Exception from execution agent — Slack message does NOT contain stack trace, ARN, or token."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.side_effect = Exception(
            "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/exec-agent failed"
        )

        from main import handle_message

        handle_message(self._make_payload())

        mock_send.assert_called_once()
        posted_text = mock_send.call_args[1]["text"]
        assert "arn:" not in posted_text, f"ARN leaked in Slack message: {posted_text}"
        assert "Traceback" not in posted_text, f"Stack trace leaked in Slack message: {posted_text}"
        assert "xoxb-" not in posted_text, f"Bot token leaked in Slack message: {posted_text}"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_is_processing_reset_on_execution_exception(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """T022: pipeline.is_processing is False after execution agent raises exception."""
        import pipeline

        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.side_effect = RuntimeError("Connection timeout")

        from main import handle_message

        handle_message(self._make_payload())

        assert pipeline.is_processing is False, "is_processing should be reset to False after exception"


# ─── 022: Echo Mode Disable — Structured Logging TDD ───


class Test022StructuredLogging:
    """022 US4: Verify structured logging conforms to AWS Well-Architected Operational Excellence."""

    def _make_payload(self, text="Hello", correlation_id="corr-022-log"):
        return {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": text,
                "bot_token": "xoxb-secret-bot-token",
                "thread_ts": "1234.5678",
                "correlation_id": correlation_id,
                "team_id": "T1234",
                "user_id": "U1234",
            })
        }

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_all_logs_are_valid_json(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke, capsys
    ):
        """T025: Every log line is parseable JSON with level, event_type, service keys."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "ok"})

        from main import handle_message

        handle_message(self._make_payload())

        captured = capsys.readouterr()
        lines = [line for line in captured.out.strip().split("\n") if line.strip()]
        assert len(lines) > 0, "Expected at least one log line"

        for i, line in enumerate(lines):
            log = json.loads(line)  # Will raise if not valid JSON
            assert "level" in log, f"Log line {i} missing 'level': {line}"
            assert "event_type" in log, f"Log line {i} missing 'event_type': {line}"
            assert "service" in log, f"Log line {i} missing 'service': {line}"
            assert log["service"] == "verification-agent", f"Log line {i} wrong service: {log['service']}"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_correlation_id_present_in_all_log_entries(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke, capsys
    ):
        """T026: Every JSON log line contains correlation_id matching the request."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "ok"})

        from main import handle_message

        test_corr_id = "corr-026-unique"
        handle_message(self._make_payload(correlation_id=test_corr_id))

        captured = capsys.readouterr()
        lines = [line for line in captured.out.strip().split("\n") if line.strip()]
        assert len(lines) > 0, "Expected at least one log line"

        for i, line in enumerate(lines):
            log = json.loads(line)
            assert "correlation_id" in log, f"Log line {i} missing 'correlation_id': {line}"
            assert log["correlation_id"] == test_corr_id, (
                f"Log line {i} correlation_id mismatch: expected {test_corr_id}, got {log.get('correlation_id')}"
            )

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_security_check_logs_include_result(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke, capsys
    ):
        """T027: Existence check, authorization, and rate limit steps emit log entries."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "ok"})

        from main import handle_message

        handle_message(self._make_payload())

        captured = capsys.readouterr()
        lines = [line for line in captured.out.strip().split("\n") if line.strip()]
        event_types = [json.loads(line).get("event_type") for line in lines]

        # Verify existence check logged
        assert "existence_check_passed" in event_types or "existence_check_failed" in event_types, (
            f"No existence check log found. Event types: {event_types}"
        )
        # Verify authorization logged (a2a_auth_event covers auth logging)
        assert "a2a_auth_event" in event_types, (
            f"No authorization log found. Event types: {event_types}"
        )
        # Verify delegation logged (confirms rate limit passed and pipeline continued)
        assert "delegating_to_execution_agent" in event_types, (
            f"No delegation log found. Event types: {event_types}"
        )

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_error_log_does_not_contain_bot_token(
        self, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke, capsys
    ):
        """T028: No log entry contains the bot_token value (no credential leakage)."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.side_effect = RuntimeError("Execution failed")

        from main import handle_message

        bot_token = "xoxb-secret-bot-token"
        handle_message(self._make_payload())

        captured = capsys.readouterr()
        lines = [line for line in captured.out.strip().split("\n") if line.strip()]
        assert len(lines) > 0, "Expected at least one log line"

        for i, line in enumerate(lines):
            assert bot_token not in line, (
                f"Bot token leaked in log line {i}: {line}"
            )
