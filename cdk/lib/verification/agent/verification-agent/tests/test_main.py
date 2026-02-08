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


class TestHandleMessageParsing:
    """Test A2A entrypoint payload parsing."""

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("main.app")
    def test_valid_payload_is_parsed(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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

    @patch("main.app")
    def test_malformed_prompt_handled_gracefully(self, mock_app):
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
    @patch("main.app")
    def test_existence_check_failure_blocks_request(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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
    @patch("main.app")
    def test_authorization_failure_blocks_request(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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
    @patch("main.app")
    def test_rate_limit_exceeded_blocks_request(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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
    @patch("main.app")
    def test_success_response_posted_to_slack(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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
    @patch("main.app")
    def test_success_with_file_artifact_posts_text_then_file(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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
    @patch("main.app")
    def test_success_text_only_does_not_call_post_file_to_slack(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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
    @patch("main.app")
    def test_success_file_only_calls_post_file_to_slack_not_post_to_slack_for_content(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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
    @patch("main.app")
    def test_post_file_to_slack_failure_posts_error_message_to_thread(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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
    @patch("main.app")
    def test_error_response_posts_friendly_message(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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
    @patch("main.app")
    def test_execution_agent_exception_posts_generic_error(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
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


class Test018EchoModeAtRuntime:
    """018: When VALIDATION_ZONE_ECHO_MODE is 'true', Verification Agent enqueues echo to Slack Poster and does NOT call invoke_execution_agent."""

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("main.app")
    def test_echo_mode_on_does_not_call_invoke_execution_agent_posts_echo_returns_success(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """When VALIDATION_ZONE_ECHO_MODE is 'true', handle_message does NOT call invoke_execution_agent; calls send_slack_post_request with [Echo] + text and returns success (T003)."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C01234567",
                "text": "hello world",
                "bot_token": "xoxb-test",
                "thread_ts": "1234.5678",
                "correlation_id": "corr-018",
                "team_id": "T1234",
                "user_id": "U1234",
            }),
        }

        with patch.dict(os.environ, {"VALIDATION_ZONE_ECHO_MODE": "true"}, clear=False):
            result = handle_message(payload)

        result_data = json.loads(result)
        assert result_data.get("status") == "completed"
        mock_invoke.assert_not_called()
        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["channel"] == "C01234567"
        assert call_kw["text"] == "[Echo] hello world"
        assert call_kw["bot_token"] == "xoxb-test"
        assert call_kw["thread_ts"] == "1234.5678"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("main.app")
    def test_echo_mode_on_post_to_slack_called_with_channel_thread_ts_and_echo_text(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """When echo mode is on, send_slack_post_request is called with channel, thread_ts, and text '[Echo] ' + task text (T004)."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)

        from main import handle_message

        task_text = "echo this message"
        payload = {
            "prompt": json.dumps({
                "channel": "C09999999",
                "text": task_text,
                "bot_token": "xoxb-test",
                "thread_ts": "9999.000000",
                "correlation_id": "corr-018-2",
                "team_id": "T1234",
                "user_id": "U1234",
            }),
        }

        with patch.dict(os.environ, {"VALIDATION_ZONE_ECHO_MODE": "true"}, clear=False):
            handle_message(payload)

        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["channel"] == "C09999999"
        assert call_kw["thread_ts"] == "9999.000000"
        assert call_kw["text"] == "[Echo] " + task_text
        mock_invoke.assert_not_called()


class Test018EchoContentAndTarget:
    """018 US3: Echo uses only current task channel, thread_ts, and text; no cross-request mixing."""

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("main.app")
    def test_echo_uses_task_channel_thread_ts_text_only_post_to_slack_matching(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """Verification Agent echo uses task channel, task thread_ts, and task text only; send_slack_post_request called with matching args (T012)."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)

        from main import handle_message

        task_channel = "C_US3_CH"
        task_thread_ts = "12345.67890"
        task_text = "only this request text"
        payload = {
            "prompt": json.dumps({
                "channel": task_channel,
                "text": task_text,
                "bot_token": "xoxb-test",
                "thread_ts": task_thread_ts,
                "correlation_id": "corr-us3",
                "team_id": "T1234",
                "user_id": "U1234",
            }),
        }

        with patch.dict(os.environ, {"VALIDATION_ZONE_ECHO_MODE": "true"}, clear=False):
            handle_message(payload)

        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["channel"] == task_channel
        assert call_kw["thread_ts"] == task_thread_ts
        assert call_kw["text"] == "[Echo] " + task_text
        mock_invoke.assert_not_called()


class Test018EchoModeOff:
    """018 US2: When VALIDATION_ZONE_ECHO_MODE is unset or not 'true', Verification Agent calls invoke_execution_agent and does NOT post echo."""

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("main.app")
    def test_echo_mode_unset_calls_invoke_execution_agent_does_not_post_echo(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """When VALIDATION_ZONE_ECHO_MODE is unset, handle_message calls invoke_execution_agent and sends result to Slack Poster (T010)."""
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
                "text": "hello",
                "bot_token": "xoxb-test",
                "thread_ts": "1234.5678",
                "correlation_id": "corr-us2",
                "team_id": "T1234",
                "user_id": "U1234",
            }),
        }

        with patch.dict(os.environ, {"VALIDATION_ZONE_ECHO_MODE": ""}, clear=False):
            result = handle_message(payload)

        result_data = json.loads(result)
        assert result_data.get("status") == "completed"
        mock_invoke.assert_called_once()
        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["channel"] == "C01234567"
        assert call_kw["text"] == "AI answer"
        assert call_kw["bot_token"] == "xoxb-test"
        assert call_kw["thread_ts"] == "1234.5678"

    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.check_rate_limit")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("main.app")
    def test_echo_mode_false_calls_invoke_execution_agent_does_not_post_echo(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_send, mock_invoke
    ):
        """When VALIDATION_ZONE_ECHO_MODE is 'false', handle_message calls invoke_execution_agent and sends result to Slack Poster (T010)."""
        mock_auth.return_value = Mock(authorized=True, unauthorized_entities=[])
        mock_rate.return_value = (True, 9)
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "Normal response",
        })

        from main import handle_message

        payload = {
            "prompt": json.dumps({
                "channel": "C09999",
                "text": "question",
                "bot_token": "xoxb-test",
                "thread_ts": "999.000",
                "correlation_id": "corr-us2b",
                "team_id": "T1234",
                "user_id": "U1234",
            }),
        }

        with patch.dict(os.environ, {"VALIDATION_ZONE_ECHO_MODE": "false"}, clear=False):
            result = handle_message(payload)

        result_data = json.loads(result)
        assert result_data.get("status") == "completed"
        mock_invoke.assert_called_once()
        mock_send.assert_called_once()
        call_kw = mock_send.call_args[1]
        assert call_kw["channel"] == "C09999"
        assert call_kw["text"] == "Normal response"
        assert call_kw["bot_token"] == "xoxb-test"
        assert call_kw["thread_ts"] == "999.000"


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
    """020: Verify A2A protocol routing — POST / delegates to SDK _handle_invocation."""

    def test_a2a_root_route_registered(self):
        """POST / route must be registered on app for A2A protocol (T001)."""
        import main

        route_paths = []
        for route in main.app.routes:
            path = getattr(route, "path", None)
            if path == "/":
                methods = getattr(route, "methods", set())
                route_paths.append(("/" , methods))

        assert any(
            path == "/" and "POST" in methods
            for path, methods in route_paths
        ), "POST / route not found in app.routes"

    def test_a2a_root_handler_delegates_to_handle_invocation(self):
        """a2a_root_handler must be registered and callable (T002)."""
        import main

        # Verify the handler was registered via @app.route("/", ...)
        handler = main.app._routes_dict.get("/")
        assert handler is not None, "No handler registered for POST /"
        assert handler.__name__ == "a2a_root_handler", (
            f"Expected a2a_root_handler, got {handler.__name__}"
        )

    def test_existing_invocations_route_still_works(self):
        """SDK /invocations route must still be registered (regression) (T003)."""
        import main

        route_paths = [getattr(r, "path", None) for r in main.app.routes]
        assert "/invocations" in route_paths, "/invocations route missing (regression)"

    def test_agent_card_route_still_works(self):
        """/.well-known/agent-card.json GET route must still be registered (regression) (T004)."""
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
        """/ping GET route must still be registered (regression) (T005)."""
        import main

        found = False
        for route in main.app.routes:
            if getattr(route, "path", None) == "/ping":
                methods = getattr(route, "methods", set())
                if "GET" in methods:
                    found = True
                    break
        assert found, "/ping GET route missing (regression)"


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
