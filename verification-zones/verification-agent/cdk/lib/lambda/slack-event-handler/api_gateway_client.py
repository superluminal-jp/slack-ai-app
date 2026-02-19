"""
API Gateway client with IAM authentication (SigV4 signing) and API key authentication.

This module provides a client for calling API Gateway endpoints
using AWS Signature Version 4 authentication or API key authentication.

Supports cross-account deployments where the Execution API
may be in a different AWS account.
"""

import json
import os
from typing import Dict, Any, Optional, Tuple
import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
from botocore.credentials import Credentials
import requests
from requests.exceptions import (
    ConnectionError,
    Timeout,
    RequestException,
)

# Import secrets manager client for API key retrieval
try:
    from secrets_manager_client import get_api_key, SecretNotFoundError, InvalidSecretFormatError
except ImportError:
    # Fallback if secrets_manager_client is not available
    get_api_key = None
    SecretNotFoundError = Exception
    InvalidSecretFormatError = Exception


class ExecutionApiError(Exception):
    """Base exception for Execution API errors."""

    pass


class ExecutionApiUnavailableError(ExecutionApiError):
    """Raised when the Execution API is unavailable."""

    def __init__(self, message: str = "Execution API is currently unavailable"):
        self.message = message
        super().__init__(self.message)


class ExecutionApiAuthError(ExecutionApiError):
    """Raised when authentication to Execution API fails."""

    def __init__(self, message: str = "Authentication to Execution API failed"):
        self.message = message
        super().__init__(self.message)


def invoke_execution_api(
    api_url: str,
    payload: Dict[str, Any],
    region: str = "ap-northeast-1",
    timeout: int = 30,
    max_retries: int = 2,
    auth_method: str = "iam",
    api_key_secret_name: Optional[str] = None,
) -> requests.Response:
    """
    Invoke Execution Layer API Gateway endpoint with IAM or API key authentication.

    Supports cross-account deployments where the Execution API
    may be in a different AWS account.

    Args:
        api_url: API Gateway endpoint URL (e.g., https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod)
        payload: Request payload dictionary
        region: AWS region name
        timeout: Request timeout in seconds
        max_retries: Maximum number of retry attempts for transient errors
        auth_method: Authentication method ('iam' or 'api_key')
        api_key_secret_name: Secrets Manager secret name for API key (required if auth_method is 'api_key')

    Returns:
        requests.Response: HTTP response from API Gateway

    Raises:
        ExecutionApiUnavailableError: If the Execution API is unavailable
        ExecutionApiAuthError: If authentication fails (403)
        ValueError: If no AWS credentials are available, invalid auth_method, or missing api_key_secret_name
    """
    # Validate authentication method
    if auth_method not in ["iam", "api_key"]:
        raise ValueError(f"Invalid auth_method: {auth_method}. Must be 'iam' or 'api_key'")

    if auth_method == "api_key" and not api_key_secret_name:
        raise ValueError("api_key_secret_name is required when auth_method is 'api_key'")

    # Prepare request
    url = f"{api_url.rstrip('/')}/execute"
    method = "POST"
    headers = {
        "Content-Type": "application/json",
    }
    body = json.dumps(payload)

    # Set up authentication based on method
    if auth_method == "iam":
        # IAM authentication (SigV4 signing)
        session = boto3.Session()
        credentials = session.get_credentials()

        if not credentials:
            raise ValueError("No AWS credentials available")

        # Create SigV4 signer
        signer = SigV4Auth(credentials, "execute-api", region)
    elif auth_method == "api_key":
        # API key authentication
        if not get_api_key:
            raise ValueError("secrets_manager_client module is not available")

        try:
            api_key = get_api_key(api_key_secret_name, region)
            headers["x-api-key"] = api_key
        except (SecretNotFoundError, InvalidSecretFormatError) as e:
            raise ExecutionApiAuthError(
                f"Failed to retrieve API key from Secrets Manager: {str(e)}"
            ) from e

    last_error: Optional[Exception] = None

    for attempt in range(max_retries + 1):
        try:
            # For IAM authentication, sign the request
            if auth_method == "iam":
                # Create AWS request for signing (must be fresh for each attempt)
                request = AWSRequest(method=method, url=url, data=body, headers=headers)
                signer.add_auth(request)
                request_headers = dict(request.headers)
            else:
                # For API key authentication, use headers directly
                request_headers = headers

            # Send request
            response = requests.post(
                url,
                headers=request_headers,
                data=body,
                timeout=timeout,
            )

            # Handle specific error codes
            if response.status_code == 403:
                raise ExecutionApiAuthError(
                    f"Authentication failed (403). Verify IAM permissions and "
                    f"API Gateway resource policy. Response: {response.text[:200]}"
                )

            if response.status_code >= 500:
                # Server error - may be transient, retry
                last_error = ExecutionApiUnavailableError(
                    f"Execution API returned {response.status_code}: {response.text[:200]}"
                )
                if attempt < max_retries:
                    continue
                raise last_error

            return response

        except ConnectionError as e:
            last_error = ExecutionApiUnavailableError(
                f"Cannot connect to Execution API at {url}. "
                f"The API may be down or the URL may be incorrect. Error: {str(e)}"
            )
            if attempt < max_retries:
                continue
            raise last_error from e

        except Timeout as e:
            last_error = ExecutionApiUnavailableError(
                f"Execution API request timed out after {timeout}s. "
                f"The API may be overloaded or experiencing issues. Error: {str(e)}"
            )
            if attempt < max_retries:
                continue
            raise last_error from e

        except RequestException as e:
            last_error = ExecutionApiError(
                f"Unexpected error calling Execution API: {str(e)}"
            )
            raise last_error from e

    # Should not reach here, but just in case
    if last_error:
        raise last_error
    raise ExecutionApiError("Unknown error occurred")


def check_execution_api_health(
    api_url: str,
    region: str = "ap-northeast-1",
    timeout: int = 5,
) -> Tuple[bool, str]:
    """
    Check if the Execution API is available.

    This is a lightweight health check that verifies connectivity
    to the API Gateway. Note that the API uses IAM authentication,
    so a 403 response actually indicates the API is available
    (authentication is working, we just don't have a health endpoint).

    Args:
        api_url: API Gateway endpoint URL
        region: AWS region name
        timeout: Request timeout in seconds

    Returns:
        Tuple of (is_healthy, message)
    """
    try:
        # Try to make a request - even a 403 means the API is available
        session = boto3.Session()
        credentials = session.get_credentials()

        if not credentials:
            return False, "No AWS credentials available"

        signer = SigV4Auth(credentials, "execute-api", region)
        url = f"{api_url.rstrip('/')}/execute"

        request = AWSRequest(method="OPTIONS", url=url, headers={})
        signer.add_auth(request)

        response = requests.options(
            url,
            headers=dict(request.headers),
            timeout=timeout,
        )

        # Any response (including 403, 404) means the API is reachable
        if response.status_code < 500:
            return True, f"API is reachable (status: {response.status_code})"

        return False, f"API returned server error: {response.status_code}"

    except ConnectionError:
        return False, "Cannot connect to Execution API"
    except Timeout:
        return False, "Execution API health check timed out"
    except Exception as e:
        return False, f"Health check failed: {str(e)}"
