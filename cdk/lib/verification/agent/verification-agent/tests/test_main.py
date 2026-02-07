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

    @patch("main.invoke_execution_agent")
    @patch("main.post_to_slack")
    @patch("main.check_rate_limit")
    @patch("main.authorize_request")
    @patch("main.check_entity_existence")
    @patch("main.app")
    def test_valid_payload_is_parsed(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_post, mock_invoke
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
        mock_post.assert_called_once()

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

    @patch("main.invoke_execution_agent")
    @patch("main.post_to_slack")
    @patch("main.check_rate_limit")
    @patch("main.authorize_request")
    @patch("main.check_entity_existence")
    @patch("main.app")
    def test_existence_check_failure_blocks_request(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_post, mock_invoke
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

    @patch("main.invoke_execution_agent")
    @patch("main.post_to_slack")
    @patch("main.check_rate_limit")
    @patch("main.authorize_request")
    @patch("main.check_entity_existence")
    @patch("main.app")
    def test_authorization_failure_blocks_request(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_post, mock_invoke
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

    @patch("main.invoke_execution_agent")
    @patch("main.post_to_slack")
    @patch("main.check_rate_limit")
    @patch("main.authorize_request")
    @patch("main.check_entity_existence")
    @patch("main.app")
    def test_rate_limit_exceeded_blocks_request(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_post, mock_invoke
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

    @patch("main.invoke_execution_agent")
    @patch("main.post_to_slack")
    @patch("main.check_rate_limit")
    @patch("main.authorize_request")
    @patch("main.check_entity_existence")
    @patch("main.app")
    def test_success_response_posted_to_slack(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_post, mock_invoke
    ):
        """Successful execution response should be posted to Slack."""
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

        mock_post.assert_called_once_with(
            channel="C01234567",
            text="This is the AI answer.",
            bot_token="xoxb-test",
            thread_ts="1234.5678",
        )

    @patch("main.invoke_execution_agent")
    @patch("main.post_to_slack")
    @patch("main.check_rate_limit")
    @patch("main.authorize_request")
    @patch("main.check_entity_existence")
    @patch("main.app")
    def test_error_response_posts_friendly_message(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_post, mock_invoke
    ):
        """Error from Execution Agent should post user-friendly message to Slack."""
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

        mock_post.assert_called_once()
        posted_text = mock_post.call_args[1]["text"]
        # Should use the friendly message from ERROR_MESSAGE_MAP, not raw error
        assert "AI サービス" in posted_text or "hourglass" in posted_text

    @patch("main.invoke_execution_agent")
    @patch("main.post_to_slack")
    @patch("main.check_rate_limit")
    @patch("main.authorize_request")
    @patch("main.check_entity_existence")
    @patch("main.app")
    def test_execution_agent_exception_posts_generic_error(
        self, mock_app, mock_existence, mock_auth, mock_rate, mock_post, mock_invoke
    ):
        """Exception from invoke should post generic error to Slack."""
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
        # Should still try to post error to Slack
        mock_post.assert_called_once()


class TestErrorMessageMapping:
    """Test user-friendly error message mapping."""

    def test_known_error_codes_have_friendly_messages(self):
        from main import _get_user_friendly_error

        assert "AI サービス" in _get_user_friendly_error("bedrock_timeout")
        assert "混雑" in _get_user_friendly_error("bedrock_throttling")
        assert "アクセス" in _get_user_friendly_error("access_denied")
        assert "タイムアウト" in _get_user_friendly_error("async_timeout")

    def test_unknown_error_code_uses_default(self):
        from main import _get_user_friendly_error, DEFAULT_ERROR_MESSAGE

        result = _get_user_friendly_error("unknown_code_xyz")
        assert result == DEFAULT_ERROR_MESSAGE

    def test_fallback_message_used_when_available(self):
        from main import _get_user_friendly_error

        result = _get_user_friendly_error("unknown_code", "Custom fallback")
        assert result == "Custom fallback"


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
