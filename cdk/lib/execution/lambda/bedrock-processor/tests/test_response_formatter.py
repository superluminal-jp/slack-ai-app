"""
Unit tests for response_formatter module.
"""

import pytest
from response_formatter import (
    format_success_response,
    format_error_response,
    validate_execution_response,
)


class TestFormatSuccessResponse:
    """Tests for format_success_response function."""

    def test_format_success_response_basic(self):
        """Test basic success response formatting."""
        response = format_success_response(
            channel="C01234567",
            response_text="AI response text",
            bot_token="xoxb-token-123",
        )

        assert response["status"] == "success"
        assert response["channel"] == "C01234567"
        assert response["response_text"] == "AI response text"
        assert response["bot_token"] == "xoxb-token-123"
        assert "thread_ts" not in response
        assert "correlation_id" not in response

    def test_format_success_response_with_thread_ts(self):
        """Test success response with thread timestamp."""
        response = format_success_response(
            channel="C01234567",
            response_text="AI response text",
            bot_token="xoxb-token-123",
            thread_ts="1234567890.123456",
        )

        assert response["status"] == "success"
        assert response["thread_ts"] == "1234567890.123456"

    def test_format_success_response_with_correlation_id(self):
        """Test success response with correlation ID."""
        response = format_success_response(
            channel="C01234567",
            response_text="AI response text",
            bot_token="xoxb-token-123",
            correlation_id="550e8400-e29b-41d4-a716-446655440000",
        )

        assert response["status"] == "success"
        assert response["correlation_id"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_format_success_response_invalid_channel(self):
        """Test that empty channel raises ValueError."""
        with pytest.raises(ValueError, match="channel must be a non-empty string"):
            format_success_response(
                channel="",
                response_text="AI response text",
                bot_token="xoxb-token-123",
            )

    def test_format_success_response_invalid_response_text(self):
        """Test that empty response_text raises ValueError."""
        with pytest.raises(ValueError, match="response_text must be a non-empty string"):
            format_success_response(
                channel="C01234567",
                response_text="",
                bot_token="xoxb-token-123",
            )

    def test_format_success_response_invalid_bot_token(self):
        """Test that invalid bot_token raises ValueError."""
        with pytest.raises(ValueError, match="bot_token must be a valid Slack bot token"):
            format_success_response(
                channel="C01234567",
                response_text="AI response text",
                bot_token="invalid-token",
            )


class TestFormatErrorResponse:
    """Tests for format_error_response function."""

    def test_format_error_response_basic(self):
        """Test basic error response formatting."""
        response = format_error_response(
            channel="C01234567",
            error_code="bedrock_timeout",
            error_message="Sorry, the AI service is taking longer than usual.",
            bot_token="xoxb-token-123",
        )

        assert response["status"] == "error"
        assert response["channel"] == "C01234567"
        assert response["error_code"] == "bedrock_timeout"
        assert response["error_message"] == "Sorry, the AI service is taking longer than usual."
        assert response["bot_token"] == "xoxb-token-123"
        assert "thread_ts" not in response
        assert "correlation_id" not in response

    def test_format_error_response_with_thread_ts(self):
        """Test error response with thread timestamp."""
        response = format_error_response(
            channel="C01234567",
            error_code="bedrock_timeout",
            error_message="Sorry, the AI service is taking longer than usual.",
            bot_token="xoxb-token-123",
            thread_ts="1234567890.123456",
        )

        assert response["status"] == "error"
        assert response["thread_ts"] == "1234567890.123456"

    def test_format_error_response_with_correlation_id(self):
        """Test error response with correlation ID."""
        response = format_error_response(
            channel="C01234567",
            error_code="bedrock_timeout",
            error_message="Sorry, the AI service is taking longer than usual.",
            bot_token="xoxb-token-123",
            correlation_id="550e8400-e29b-41d4-a716-446655440000",
        )

        assert response["status"] == "error"
        assert response["correlation_id"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_format_error_response_invalid_channel(self):
        """Test that empty channel raises ValueError."""
        with pytest.raises(ValueError, match="channel must be a non-empty string"):
            format_error_response(
                channel="",
                error_code="bedrock_timeout",
                error_message="Error message",
                bot_token="xoxb-token-123",
            )

    def test_format_error_response_invalid_error_code(self):
        """Test that empty error_code raises ValueError."""
        with pytest.raises(ValueError, match="error_code must be a non-empty string"):
            format_error_response(
                channel="C01234567",
                error_code="",
                error_message="Error message",
                bot_token="xoxb-token-123",
            )

    def test_format_error_response_invalid_error_message(self):
        """Test that empty error_message raises ValueError."""
        with pytest.raises(ValueError, match="error_message must be a non-empty string"):
            format_error_response(
                channel="C01234567",
                error_code="bedrock_timeout",
                error_message="",
                bot_token="xoxb-token-123",
            )

    def test_format_error_response_invalid_bot_token(self):
        """Test that invalid bot_token raises ValueError."""
        with pytest.raises(ValueError, match="bot_token must be a valid Slack bot token"):
            format_error_response(
                channel="C01234567",
                error_code="bedrock_timeout",
                error_message="Error message",
                bot_token="invalid-token",
            )


class TestValidateExecutionResponse:
    """Tests for validate_execution_response function."""

    def test_validate_success_response_valid(self):
        """Test validation of valid success response."""
        response = {
            "status": "success",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "response_text": "AI response text",
        }
        assert validate_execution_response(response) is True

    def test_validate_error_response_valid(self):
        """Test validation of valid error response."""
        response = {
            "status": "error",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "error_code": "bedrock_timeout",
            "error_message": "Error message",
        }
        assert validate_execution_response(response) is True

    def test_validate_response_invalid_status(self):
        """Test validation fails for invalid status."""
        response = {
            "status": "invalid",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "response_text": "AI response text",
        }
        assert validate_execution_response(response) is False

    def test_validate_response_missing_channel(self):
        """Test validation fails for missing channel."""
        response = {
            "status": "success",
            "bot_token": "xoxb-token-123",
            "response_text": "AI response text",
        }
        assert validate_execution_response(response) is False

    def test_validate_response_missing_bot_token(self):
        """Test validation fails for missing bot_token."""
        response = {
            "status": "success",
            "channel": "C01234567",
            "response_text": "AI response text",
        }
        assert validate_execution_response(response) is False

    def test_validate_success_response_missing_response_text(self):
        """Test validation fails for success response without response_text."""
        response = {
            "status": "success",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
        }
        assert validate_execution_response(response) is False

    def test_validate_error_response_missing_error_code(self):
        """Test validation fails for error response without error_code."""
        response = {
            "status": "error",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "error_message": "Error message",
        }
        assert validate_execution_response(response) is False

    def test_validate_error_response_missing_error_message(self):
        """Test validation fails for error response without error_message."""
        response = {
            "status": "error",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "error_code": "bedrock_timeout",
        }
        assert validate_execution_response(response) is False

    def test_validate_response_invalid_bot_token_format(self):
        """Test validation fails for invalid bot_token format."""
        response = {
            "status": "success",
            "channel": "C01234567",
            "bot_token": "invalid-token",
            "response_text": "AI response text",
        }
        assert validate_execution_response(response) is False

    def test_validate_response_not_dict(self):
        """Test validation fails for non-dict input."""
        assert validate_execution_response("not a dict") is False
        assert validate_execution_response(None) is False
        assert validate_execution_response([]) is False

