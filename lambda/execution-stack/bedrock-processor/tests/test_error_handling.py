"""
Tests for Phase 7: Error Handling in Bedrock Processor.

Test cases:
1. Bedrock timeout error handling
2. Bedrock throttling error handling
3. Bedrock access denied error handling
4. Invalid Bedrock response handling
5. Generic error handling
"""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

# Mock dependencies before importing handler
sys.modules["slack_sdk"] = MagicMock()
sys.modules["slack_poster"] = MagicMock()
sys.modules["bedrock_client"] = MagicMock()

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Now import handler
from handler import ERROR_MESSAGES, lambda_handler


class TestBedrockErrorHandling:
    """Test Bedrock API error handling in Bedrock Processor."""

    @pytest.fixture
    def mock_context(self):
        """Mock Lambda context."""
        context = MagicMock()
        context.function_name = "bedrock-processor"
        context.function_version = "$LATEST"
        context.invoked_function_arn = "arn:aws:lambda:ap-northeast-1:123456789012:function:bedrock-processor"
        return context

    @pytest.fixture
    def valid_event(self):
        """Valid event payload."""
        return {
            "channel": "C01234567",
            "text": "Hello, how are you?",
            "bot_token": "xoxb-test-token",
        }

    @patch("handler.post_to_slack")
    @patch("handler.invoke_bedrock")
    def test_timeout_error_handling(self, mock_invoke, mock_post, valid_event, mock_context):
        """Test 1: Simulate Bedrock timeout error → Receive friendly error message."""
        # Simulate ReadTimeoutError
        from botocore.exceptions import ReadTimeoutError

        mock_invoke.side_effect = ReadTimeoutError(endpoint_url="https://bedrock-runtime.ap-northeast-1.amazonaws.com")

        # Call handler
        result = lambda_handler(valid_event, mock_context)

        # Verify error message posted to Slack
        mock_post.assert_called_once_with(
            valid_event["channel"],
            ERROR_MESSAGES["bedrock_timeout"],
            valid_event["bot_token"],
        )

        # Verify handler returns success (error was handled)
        assert result["statusCode"] == 200
        assert "Timeout error handled" in result["body"]

    @patch("handler.post_to_slack")
    @patch("handler.invoke_bedrock")
    def test_throttling_error_handling(self, mock_invoke, mock_post, valid_event, mock_context):
        """Test throttling error handling."""
        # Simulate ThrottlingException
        error_response = {
            "Error": {
                "Code": "ThrottlingException",
                "Message": "Rate exceeded",
            }
        }
        mock_invoke.side_effect = ClientError(error_response, "InvokeModel")

        # Call handler
        result = lambda_handler(valid_event, mock_context)

        # Verify error message posted to Slack
        mock_post.assert_called_once_with(
            valid_event["channel"],
            ERROR_MESSAGES["bedrock_throttling"],
            valid_event["bot_token"],
        )

        # Verify handler returns success
        assert result["statusCode"] == 200
        assert "Error handled" in result["body"]

    @patch("handler.post_to_slack")
    @patch("handler.invoke_bedrock")
    def test_access_denied_error_handling(self, mock_invoke, mock_post, valid_event, mock_context):
        """Test access denied error handling."""
        # Simulate AccessDeniedException
        error_response = {
            "Error": {
                "Code": "AccessDeniedException",
                "Message": "Access denied",
            }
        }
        mock_invoke.side_effect = ClientError(error_response, "InvokeModel")

        # Call handler
        result = lambda_handler(valid_event, mock_context)

        # Verify error message posted to Slack
        mock_post.assert_called_once_with(
            valid_event["channel"],
            ERROR_MESSAGES["bedrock_access_denied"],
            valid_event["bot_token"],
        )

        # Verify handler returns success
        assert result["statusCode"] == 200
        assert "Error handled" in result["body"]

    @patch("handler.post_to_slack")
    @patch("handler.invoke_bedrock")
    def test_invalid_response_handling(self, mock_invoke, mock_post, valid_event, mock_context):
        """Test invalid Bedrock response handling."""
        # Simulate ValueError (invalid response format)
        mock_invoke.side_effect = ValueError("No content in Bedrock response")

        # Call handler
        result = lambda_handler(valid_event, mock_context)

        # Verify error message posted to Slack
        mock_post.assert_called_once_with(
            valid_event["channel"],
            ERROR_MESSAGES["invalid_response"],
            valid_event["bot_token"],
        )

        # Verify handler returns success
        assert result["statusCode"] == 200
        assert "Validation error handled" in result["body"]

    @patch("handler.post_to_slack")
    @patch("handler.invoke_bedrock")
    def test_generic_error_handling(self, mock_invoke, mock_post, valid_event, mock_context):
        """Test generic error handling."""
        # Simulate unexpected error
        mock_invoke.side_effect = Exception("Unexpected error occurred")

        # Call handler
        result = lambda_handler(valid_event, mock_context)

        # Verify error message posted to Slack
        mock_post.assert_called_once_with(
            valid_event["channel"],
            ERROR_MESSAGES["generic"],
            valid_event["bot_token"],
        )

        # Verify handler returns success
        assert result["statusCode"] == 200
        assert "Error handled" in result["body"]

    @patch("handler.post_to_slack")
    @patch("handler.invoke_bedrock")
    def test_successful_processing(self, mock_invoke, mock_post, valid_event, mock_context):
        """Test successful Bedrock processing."""
        # Simulate successful Bedrock response
        mock_invoke.return_value = "This is a test AI response."

        # Call handler
        result = lambda_handler(valid_event, mock_context)

        # Verify Bedrock was called
        mock_invoke.assert_called_once_with(valid_event["text"])

        # Verify response posted to Slack
        mock_post.assert_called_once_with(
            valid_event["channel"],
            "This is a test AI response.",
            valid_event["bot_token"],
        )

        # Verify handler returns success
        assert result["statusCode"] == 200
        assert result["body"] == "Success"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

