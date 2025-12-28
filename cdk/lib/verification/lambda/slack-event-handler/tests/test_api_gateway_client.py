"""
Unit tests for API Gateway client with IAM authentication.
"""

import json
import sys
import os
import pytest
from unittest.mock import Mock, patch, MagicMock
import requests
from botocore.credentials import Credentials

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api_gateway_client import invoke_execution_api


class TestApiGatewayClient:
    """Test cases for API Gateway client."""

    @patch("api_gateway_client.boto3.Session")
    @patch("api_gateway_client.requests.post")
    @patch("api_gateway_client.SigV4Auth")
    def test_invoke_execution_api_success(
        self, mock_signer_class, mock_post, mock_session
    ):
        """Test successful API Gateway invocation with SigV4 signing."""
        # Setup mocks
        mock_credentials = Mock(spec=Credentials)
        mock_session_instance = Mock()
        mock_session_instance.get_credentials.return_value = mock_credentials
        mock_session.return_value = mock_session_instance

        mock_signer = Mock()
        mock_signer_class.return_value = mock_signer

        mock_response = Mock(spec=requests.Response)
        mock_response.status_code = 202
        mock_response.text = ""
        mock_post.return_value = mock_response

        # Mock AWSRequest signing
        with patch("api_gateway_client.AWSRequest") as mock_request_class:
            mock_request = Mock()
            mock_request.headers = {"Authorization": "AWS4-HMAC-SHA256 ..."}
            mock_request.url = (
                "https://api.execute-api.region.amazonaws.com/prod/execute"
            )
            mock_request_class.return_value = mock_request

            # Execute
            payload = {"channel": "C123", "text": "test", "bot_token": "xoxb-test"}
            result = invoke_execution_api(
                api_url="https://api.execute-api.region.amazonaws.com/prod",
                payload=payload,
                region="ap-northeast-1",
            )

            # Verify
            assert result.status_code == 202
            mock_signer.add_auth.assert_called_once()
            mock_post.assert_called_once()
            call_args = mock_post.call_args
            assert (
                call_args[0][0]
                == "https://api.execute-api.region.amazonaws.com/prod/execute"
            )
            assert json.loads(call_args[1]["data"]) == payload

    @patch("api_gateway_client.boto3.Session")
    def test_invoke_execution_api_no_credentials(self, mock_session):
        """Test error when no AWS credentials are available."""
        # Setup mocks
        mock_session_instance = Mock()
        mock_session_instance.get_credentials.return_value = None
        mock_session.return_value = mock_session_instance

        # Execute and verify
        payload = {"channel": "C123", "text": "test", "bot_token": "xoxb-test"}
        with pytest.raises(ValueError, match="No AWS credentials available"):
            invoke_execution_api(
                api_url="https://api.execute-api.region.amazonaws.com/prod",
                payload=payload,
            )

    @patch("api_gateway_client.boto3.Session")
    @patch("api_gateway_client.requests.post")
    @patch("api_gateway_client.SigV4Auth")
    def test_invoke_execution_api_timeout(
        self, mock_signer_class, mock_post, mock_session
    ):
        """Test timeout error handling."""
        # Setup mocks
        mock_credentials = Mock(spec=Credentials)
        mock_session_instance = Mock()
        mock_session_instance.get_credentials.return_value = mock_credentials
        mock_session.return_value = mock_session_instance

        mock_signer = Mock()
        mock_signer_class.return_value = mock_signer

        # Mock timeout exception
        mock_post.side_effect = requests.Timeout("Request timed out")

        # Mock AWSRequest signing
        with patch("api_gateway_client.AWSRequest") as mock_request_class:
            mock_request = Mock()
            mock_request.headers = {"Authorization": "AWS4-HMAC-SHA256 ..."}
            mock_request.url = (
                "https://api.execute-api.region.amazonaws.com/prod/execute"
            )
            mock_request_class.return_value = mock_request

            # Execute and verify
            payload = {"channel": "C123", "text": "test", "bot_token": "xoxb-test"}
            with pytest.raises(requests.Timeout):
                invoke_execution_api(
                    api_url="https://api.execute-api.region.amazonaws.com/prod",
                    payload=payload,
                )

    @patch("api_gateway_client.boto3.Session")
    @patch("api_gateway_client.requests.post")
    @patch("api_gateway_client.SigV4Auth")
    def test_invoke_execution_api_request_formatting(
        self, mock_signer_class, mock_post, mock_session
    ):
        """Test request formatting (headers, body, URL)."""
        # Setup mocks
        mock_credentials = Mock(spec=Credentials)
        mock_session_instance = Mock()
        mock_session_instance.get_credentials.return_value = mock_credentials
        mock_session.return_value = mock_session_instance

        mock_signer = Mock()
        mock_signer_class.return_value = mock_signer

        mock_response = Mock(spec=requests.Response)
        mock_response.status_code = 202
        mock_post.return_value = mock_response

        # Mock AWSRequest signing
        with patch("api_gateway_client.AWSRequest") as mock_request_class:
            mock_request = Mock()
            mock_request.headers = {
                "Authorization": "AWS4-HMAC-SHA256 ...",
                "Content-Type": "application/json",
                "X-Amz-Date": "20250127T120000Z",
            }
            mock_request.url = (
                "https://api.execute-api.region.amazonaws.com/prod/execute"
            )
            mock_request_class.return_value = mock_request

            # Execute
            payload = {
                "channel": "C123",
                "text": "test message",
                "bot_token": "xoxb-test-token",
            }
            result = invoke_execution_api(
                api_url="https://api.execute-api.region.amazonaws.com/prod",
                payload=payload,
                region="us-east-1",
            )

            # Verify request formatting
            call_args = mock_post.call_args
            assert (
                call_args[0][0]
                == "https://api.execute-api.region.amazonaws.com/prod/execute"
            )
            assert "Content-Type" in call_args[1]["headers"]
            assert call_args[1]["headers"]["Content-Type"] == "application/json"
            assert json.loads(call_args[1]["data"]) == payload
            assert call_args[1]["timeout"] == 30
