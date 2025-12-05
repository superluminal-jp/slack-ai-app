"""
API Gateway client with IAM authentication (SigV4 signing).

This module provides a client for calling API Gateway endpoints
using AWS Signature Version 4 authentication.
"""

import json
import os
from typing import Dict, Any, Optional
import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
from botocore.credentials import Credentials
import requests


def invoke_execution_api(
    api_url: str,
    payload: Dict[str, Any],
    region: str = "ap-northeast-1",
) -> requests.Response:
    """
    Invoke Execution Layer API Gateway endpoint with IAM authentication.

    Args:
        api_url: API Gateway endpoint URL (e.g., https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod)
        payload: Request payload dictionary
        region: AWS region name

    Returns:
        requests.Response: HTTP response from API Gateway

    Raises:
        ValueError: If no AWS credentials are available
        requests.RequestException: If request fails
    """
    # Get AWS credentials from Lambda execution role
    session = boto3.Session()
    credentials = session.get_credentials()

    if not credentials:
        raise ValueError("No AWS credentials available")

    # Create SigV4 signer
    signer = SigV4Auth(credentials, "execute-api", region)

    # Prepare request
    url = f"{api_url}/execute"
    method = "POST"
    headers = {
        "Content-Type": "application/json",
    }
    body = json.dumps(payload)

    # Create AWS request for signing
    request = AWSRequest(method=method, url=url, data=body, headers=headers)
    signer.add_auth(request)

    # Send signed request
    response = requests.post(
        url,
        headers=dict(request.headers),
        data=body,
        timeout=30,
    )

    return response
