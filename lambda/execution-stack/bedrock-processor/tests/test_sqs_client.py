"""
Unit tests for sqs_client module.
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError
from sqs_client import send_response_to_queue


class TestSendResponseToQueue:
    """Tests for send_response_to_queue function."""

    @patch("sqs_client.boto3.client")
    def test_send_success_response_success(self, mock_boto3_client):
        """Test successful SQS message send for success response."""
        mock_sqs = Mock()
        mock_sqs.send_message.return_value = {"MessageId": "msg-123"}
        mock_boto3_client.return_value = mock_sqs

        response = {
            "status": "success",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "response_text": "AI response text",
        }

        result = send_response_to_queue("https://sqs.region.amazonaws.com/123456789012/queue", response)

        assert result is True
        mock_sqs.send_message.assert_called_once()
        call_args = mock_sqs.send_message.call_args
        assert call_args[1]["QueueUrl"] == "https://sqs.region.amazonaws.com/123456789012/queue"
        assert json.loads(call_args[1]["MessageBody"]) == response

    @patch("sqs_client.boto3.client")
    def test_send_error_response_success(self, mock_boto3_client):
        """Test successful SQS message send for error response."""
        mock_sqs = Mock()
        mock_sqs.send_message.return_value = {"MessageId": "msg-123"}
        mock_boto3_client.return_value = mock_sqs

        response = {
            "status": "error",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "error_code": "bedrock_timeout",
            "error_message": "Error message",
        }

        result = send_response_to_queue("https://sqs.region.amazonaws.com/123456789012/queue", response)

        assert result is True
        mock_sqs.send_message.assert_called_once()

    @patch("sqs_client.boto3.client")
    def test_send_response_with_correlation_id(self, mock_boto3_client):
        """Test SQS message send with correlation ID in message attributes."""
        mock_sqs = Mock()
        mock_sqs.send_message.return_value = {"MessageId": "msg-123"}
        mock_boto3_client.return_value = mock_sqs

        response = {
            "status": "success",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "response_text": "AI response text",
            "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
        }

        result = send_response_to_queue("https://sqs.region.amazonaws.com/123456789012/queue", response)

        assert result is True
        call_args = mock_sqs.send_message.call_args
        assert "MessageAttributes" in call_args[1]
        assert call_args[1]["MessageAttributes"]["correlation_id"]["StringValue"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_send_response_invalid_queue_url(self):
        """Test that empty queue_url raises ValueError."""
        response = {
            "status": "success",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "response_text": "AI response text",
        }

        with pytest.raises(ValueError, match="queue_url must be a non-empty string"):
            send_response_to_queue("", response)

    def test_send_response_invalid_response_format(self):
        """Test that invalid response format raises ValueError."""
        with pytest.raises(ValueError, match="response must be a dictionary"):
            send_response_to_queue("https://sqs.region.amazonaws.com/123456789012/queue", "not a dict")

    def test_send_response_invalid_status(self):
        """Test that invalid status raises ValueError."""
        response = {
            "status": "invalid",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
        }

        with pytest.raises(ValueError, match="Invalid response status"):
            send_response_to_queue("https://sqs.region.amazonaws.com/123456789012/queue", response)

    @patch("sqs_client.boto3.client")
    def test_send_response_retry_on_service_unavailable(self, mock_boto3_client):
        """Test that SQS send retries on ServiceUnavailable error."""
        mock_sqs = Mock()
        # First call fails, second succeeds
        mock_sqs.send_message.side_effect = [
            ClientError(
                {"Error": {"Code": "ServiceUnavailable", "Message": "Service unavailable"}},
                "SendMessage",
            ),
            {"MessageId": "msg-123"},
        ]
        mock_boto3_client.return_value = mock_sqs

        response = {
            "status": "success",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "response_text": "AI response text",
        }

        result = send_response_to_queue("https://sqs.region.amazonaws.com/123456789012/queue", response, max_retries=1)

        assert result is True
        assert mock_sqs.send_message.call_count == 2

    @patch("sqs_client.boto3.client")
    def test_send_response_fails_after_max_retries(self, mock_boto3_client):
        """Test that SQS send raises exception after max retries."""
        mock_sqs = Mock()
        mock_sqs.send_message.side_effect = ClientError(
            {"Error": {"Code": "ServiceUnavailable", "Message": "Service unavailable"}},
            "SendMessage",
        )
        mock_boto3_client.return_value = mock_sqs

        response = {
            "status": "success",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "response_text": "AI response text",
        }

        with pytest.raises(ClientError):
            send_response_to_queue("https://sqs.region.amazonaws.com/123456789012/queue", response, max_retries=2)

        assert mock_sqs.send_message.call_count == 3  # Initial + 2 retries

    @patch("sqs_client.boto3.client")
    def test_send_response_non_retryable_error(self, mock_boto3_client):
        """Test that non-retryable errors are raised immediately."""
        mock_sqs = Mock()
        mock_sqs.send_message.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access denied"}},
            "SendMessage",
        )
        mock_boto3_client.return_value = mock_sqs

        response = {
            "status": "success",
            "channel": "C01234567",
            "bot_token": "xoxb-token-123",
            "response_text": "AI response text",
        }

        with pytest.raises(ClientError):
            send_response_to_queue("https://sqs.region.amazonaws.com/123456789012/queue", response, max_retries=2)

        assert mock_sqs.send_message.call_count == 1  # No retries for non-retryable errors

