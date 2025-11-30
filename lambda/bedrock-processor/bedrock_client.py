"""
Amazon Bedrock client for AI inference.

This module provides a simple wrapper around the Bedrock Runtime API
for invoking Claude 3 Haiku model for conversational AI responses.

Note: This is Phase 6 implementation (async processing in Lambda②).
"""

import json
import os
from typing import Optional

import boto3
from botocore.exceptions import ClientError


# Model configuration
# MODEL_ID is loaded from environment variable to allow flexible model selection
MAX_TOKENS = 1024
TEMPERATURE = 1.0


def invoke_bedrock(prompt: str) -> str:
    """
    Invoke Amazon Bedrock model for AI inference.

    This function sends a user prompt to Bedrock and returns the AI-generated
    response. It automatically detects the model type and uses the appropriate
    API format (Claude vs Nova).

    Args:
        prompt: User message text (cleaned, without bot mentions)

    Returns:
        str: AI-generated response text

    Raises:
        ClientError: If Bedrock API call fails (throttling, access denied, etc.)
        ValueError: If prompt is empty or response format is invalid
        Exception: For unexpected errors

    Example:
        >>> response = invoke_bedrock("Hello, can you help me?")
        >>> print(response)
        "Hello! I'm here to help. What would you like to know?"

    Performance:
        - Typical latency: 1-3 seconds for short prompts
        - May take up to 30 seconds for complex queries
        - Synchronous call - blocks until response received

    Security:
        - Uses IAM role credentials (no hardcoded keys)
        - Prompt is not validated for PII (deferred to post-MVP)
        - No Guardrails applied (deferred to post-MVP)
    """
    # Validate input
    if not prompt or not prompt.strip():
        raise ValueError("Prompt cannot be empty")

    # Get configuration from environment variables
    aws_region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
    model_id = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")

    # Initialize Bedrock Runtime client
    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime", region_name=aws_region
    )

    # Construct request payload based on model type
    # Different models have different API formats
    if "anthropic.claude" in model_id or "jp.anthropic.claude" in model_id:
        # Claude models (Anthropic format)
        # Reference: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": MAX_TOKENS,
            "temperature": TEMPERATURE,
            "messages": [{"role": "user", "content": prompt.strip()}],
        }
    elif "amazon.nova" in model_id:
        # Amazon Nova models (AWS native format)
        # Reference: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-nova.html
        request_body = {
            "messages": [{"role": "user", "content": [{"text": prompt.strip()}]}],
            "inferenceConfig": {
                "max_new_tokens": MAX_TOKENS,
                "temperature": TEMPERATURE,
            },
        }
    else:
        # Default to Nova format for unknown models
        request_body = {
            "messages": [{"role": "user", "content": [{"text": prompt.strip()}]}],
            "inferenceConfig": {
                "max_new_tokens": MAX_TOKENS,
                "temperature": TEMPERATURE,
            },
        }

    try:
        # Invoke Bedrock model
        print(f"Invoking Bedrock model: {model_id}")
        print(f"Prompt length: {len(prompt)} characters")

        response = bedrock_runtime.invoke_model(
            modelId=model_id, body=json.dumps(request_body)
        )

        # Parse response
        response_body = json.loads(response["body"].read())

        print(f"Bedrock response received")
        print(f"Stop reason: {response_body.get('stop_reason')}")
        print(f"Usage: {response_body.get('usage')}")

        # Extract AI-generated text from response
        # Response format varies by model
        if "anthropic.claude" in model_id or "jp.anthropic.claude" in model_id:
            # Claude response format: {"content": [{"type": "text", "text": "..."}], ...}
            content_blocks = response_body.get("content", [])
            if not content_blocks:
                raise ValueError("No content in Bedrock response")
            first_block = content_blocks[0]
            ai_response = first_block.get("text", "").strip()
        elif "amazon.nova" in model_id:
            # Amazon Nova response format: {"output": {"message": {"content": [{"text": "..."}]}}, ...}
            output = response_body.get("output", {})
            message = output.get("message", {})
            content_blocks = message.get("content", [])
            if not content_blocks:
                raise ValueError("No content in Bedrock response")
            first_block = content_blocks[0]
            ai_response = first_block.get("text", "").strip()
        else:
            # Default to Nova format
            output = response_body.get("output", {})
            message = output.get("message", {})
            content_blocks = message.get("content", [])
            if not content_blocks:
                raise ValueError("No content in Bedrock response")
            first_block = content_blocks[0]
            ai_response = first_block.get("text", "").strip()

        if not ai_response:
            raise ValueError("Empty text in Bedrock response")

        print(f"AI response length: {len(ai_response)} characters")
        return ai_response

    except ClientError as e:
        # AWS service errors (throttling, access denied, etc.)
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]
        print(f"Bedrock ClientError: {error_code} - {error_message}")
        raise

    except ValueError as e:
        # Invalid response format
        print(f"Bedrock response validation error: {str(e)}")
        raise

    except Exception as e:
        # Unexpected errors
        print(f"Unexpected error invoking Bedrock: {str(e)}")
        raise


def validate_prompt(prompt: str, max_length: int = 4000) -> tuple[bool, Optional[str]]:
    """
    Validate user prompt before sending to Bedrock.

    Args:
        prompt: User message text
        max_length: Maximum allowed prompt length (default: 4000 chars)

    Returns:
        tuple: (is_valid: bool, error_message: Optional[str])

    Example:
        >>> is_valid, error = validate_prompt("Hello")
        >>> print(is_valid)
        True
        >>> is_valid, error = validate_prompt("")
        >>> print(error)
        "Please send me a message and I'll respond!"
    """
    # Check if prompt is empty
    if not prompt or not prompt.strip():
        return (
            False,
            "Please send me a message and I'll respond! For example, 'Hello' or 'What can you do?'",
        )

    # Check if prompt exceeds maximum length
    if len(prompt) > max_length:
        return (
            False,
            f"Your message is too long ({len(prompt)} characters). Please keep it under {max_length} characters.",
        )

    # All validations passed
    return True, None

