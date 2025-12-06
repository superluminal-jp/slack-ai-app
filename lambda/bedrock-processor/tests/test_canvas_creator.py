"""
Tests for canvas_creator module.

Tests Canvas creation functionality including:
- Successful Canvas creation
- API error handling
- Permission error handling
- Rate limit error handling
- Content size validation
- Title length validation
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from slack_sdk.errors import SlackApiError

# Import handler module to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from canvas_creator import (
    create_canvas,
    format_canvas_content,
    map_error_code,
    CANVAS_MAX_CONTENT_SIZE,
    CANVAS_MAX_TITLE_LENGTH
)


class TestFormatCanvasContent:
    """Test Canvas content formatting."""

    def test_format_canvas_content(self):
        """Test formatting reply content for Canvas."""
        content = "This is the reply content"
        result = format_canvas_content(content)

        assert isinstance(result, dict)
        assert "blocks" in result
        assert len(result["blocks"]) == 2
        assert result["blocks"][0]["type"] == "header"
        assert result["blocks"][0]["text"] == "AI Response"
        assert result["blocks"][1]["type"] == "section"
        assert result["blocks"][1]["text"] == content


class TestMapErrorCode:
    """Test error code mapping."""

    def test_map_permission_errors(self):
        """Test mapping permission-related errors."""
        assert map_error_code("missing_scope") == "permission_error"
        assert map_error_code("not_authorized") == "permission_error"
        assert map_error_code("invalid_auth") == "permission_error"

    def test_map_rate_limit_error(self):
        """Test mapping rate limit error."""
        assert map_error_code("rate_limited") == "rate_limit"

    def test_map_content_too_large_error(self):
        """Test mapping content size error."""
        assert map_error_code("invalid_content") == "content_too_large"

    def test_map_api_error(self):
        """Test mapping API error."""
        assert map_error_code("invalid_request") == "api_error"

    def test_map_unknown_error(self):
        """Test mapping unknown error."""
        assert map_error_code("unknown_error") == "unknown"


class TestCreateCanvasSuccess:
    """Test successful Canvas creation."""

    @patch('canvas_creator.WebClient')
    def test_create_canvas_success(self, mock_web_client_class):
        """Test successful Canvas creation."""
        # Setup mock
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_create.return_value = {
            "ok": True,
            "canvas": {
                "id": "C01234567"
            }
        }

        result = create_canvas(
            bot_token="xoxb-test",
            title="AI Response",
            content="Test content"
        )

        assert result["success"] == True
        assert result["canvas_id"] == "C01234567"
        mock_client.canvas_create.assert_called_once()

    @patch('canvas_creator.WebClient')
    def test_create_canvas_with_valid_inputs(self, mock_web_client_class):
        """Test Canvas creation with valid inputs."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_create.return_value = {
            "ok": True,
            "canvas": {"id": "C01234567"}
        }

        result = create_canvas(
            bot_token="xoxb-valid-token",
            title="Test Canvas",
            content="This is test content for Canvas"
        )

        assert result["success"] == True


class TestCreateCanvasValidation:
    """Test Canvas creation input validation."""

    def test_missing_bot_token(self):
        """Test Canvas creation with missing bot token."""
        result = create_canvas(
            bot_token="",
            title="Test",
            content="Content"
        )

        assert result["success"] == False
        assert result["error_code"] == "api_error"
        assert "token" in result["error_message"].lower()

    def test_missing_title(self):
        """Test Canvas creation with missing title."""
        result = create_canvas(
            bot_token="xoxb-test",
            title="",
            content="Content"
        )

        assert result["success"] == False
        assert result["error_code"] == "api_error"
        assert "title" in result["error_message"].lower()

    def test_title_too_long(self):
        """Test Canvas creation with title exceeding limit."""
        long_title = "A" * (CANVAS_MAX_TITLE_LENGTH + 1)
        result = create_canvas(
            bot_token="xoxb-test",
            title=long_title,
            content="Content"
        )

        assert result["success"] == False
        assert result["error_code"] == "content_too_large"

    def test_missing_content(self):
        """Test Canvas creation with missing content."""
        result = create_canvas(
            bot_token="xoxb-test",
            title="Test",
            content=""
        )

        assert result["success"] == False
        assert result["error_code"] == "api_error"
        assert "content" in result["error_message"].lower()

    def test_content_too_large(self):
        """Test Canvas creation with content exceeding size limit."""
        large_content = "A" * (CANVAS_MAX_CONTENT_SIZE + 1)
        result = create_canvas(
            bot_token="xoxb-test",
            title="Test",
            content=large_content
        )

        assert result["success"] == False
        assert result["error_code"] == "content_too_large"


class TestCreateCanvasAPIErrors:
    """Test Canvas creation API error handling."""

    @patch('canvas_creator.WebClient')
    def test_api_error_response(self, mock_web_client_class):
        """Test handling of API error response."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_create.return_value = {
            "ok": False,
            "error": "invalid_request",
            "error_message": "Invalid request parameters"
        }

        result = create_canvas(
            bot_token="xoxb-test",
            title="Test",
            content="Content"
        )

        assert result["success"] == False
        assert result["error_code"] == "api_error"

    @patch('canvas_creator.WebClient')
    def test_permission_error(self, mock_web_client_class):
        """Test handling of permission error."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_create.return_value = {
            "ok": False,
            "error": "missing_scope",
            "error_message": "Bot token missing canvas:write permission"
        }

        result = create_canvas(
            bot_token="xoxb-test",
            title="Test",
            content="Content"
        )

        assert result["success"] == False
        assert result["error_code"] == "permission_error"

    @patch('canvas_creator.WebClient')
    def test_rate_limit_error(self, mock_web_client_class):
        """Test handling of rate limit error."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_create.return_value = {
            "ok": False,
            "error": "rate_limited",
            "error_message": "Rate limit exceeded"
        }

        result = create_canvas(
            bot_token="xoxb-test",
            title="Test",
            content="Content"
        )

        assert result["success"] == False
        assert result["error_code"] == "rate_limit"

    @patch('canvas_creator.WebClient')
    def test_slack_api_exception(self, mock_web_client_class):
        """Test handling of SlackApiError exception."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_response = Mock()
        mock_response.get.return_value = "invalid_auth"
        mock_client.canvas_create.side_effect = SlackApiError(
            "API error",
            response=mock_response
        )

        result = create_canvas(
            bot_token="xoxb-test",
            title="Test",
            content="Content"
        )

        assert result["success"] == False
        assert result["error_code"] in ["permission_error", "unknown"]

    @patch('canvas_creator.WebClient')
    def test_unexpected_exception(self, mock_web_client_class):
        """Test handling of unexpected exceptions."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_create.side_effect = Exception("Unexpected error")

        result = create_canvas(
            bot_token="xoxb-test",
            title="Test",
            content="Content"
        )

        assert result["success"] == False
        assert result["error_code"] == "unknown"

    @patch('canvas_creator.WebClient')
    def test_missing_canvas_id(self, mock_web_client_class):
        """Test handling when Canvas created but ID not returned."""
        mock_client = Mock()
        mock_web_client_class.return_value = mock_client
        mock_client.canvas_create.return_value = {
            "ok": True,
            "canvas": {}  # Missing ID
        }

        result = create_canvas(
            bot_token="xoxb-test",
            title="Test",
            content="Content"
        )

        assert result["success"] == False
        assert result["error_code"] == "api_error"

