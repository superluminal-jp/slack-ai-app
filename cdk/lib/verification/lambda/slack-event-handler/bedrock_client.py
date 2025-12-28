"""
Amazon Bedrock client for AI inference.

This module provides a simple wrapper around the Bedrock Runtime API
for invoking Claude models (primarily Claude 4.5 series) for conversational AI responses.

Note: This is Phase 5 implementation (synchronous). In Phase 6, this will
be moved to the bedrock-processor Lambda for async processing.
"""

import json
import os
from typing import Optional

import boto3
from botocore.exceptions import ClientError


# Model configuration
# MODEL_ID is loaded from environment variable to allow flexible model selection
TEMPERATURE = 1.0


def get_max_tokens_for_model(model_id: str) -> int:
    """
    Get maximum tokens for a given Bedrock model.

    Returns the maximum output tokens supported by the model.
    If model is not recognized, returns a safe default (4096).

    Args:
        model_id: Bedrock model identifier (e.g., "jp.anthropic.claude-haiku-4-5-20251001-v1:0")

    Returns:
        Maximum tokens for the model

    Model-specific limits:
        - Claude 4.5 Sonnet/Haiku/Opus: 8192 tokens (all 4.5 series)
        - Amazon Nova Pro: 8192 tokens
        - Amazon Nova Lite: 4096 tokens
        - Default: 4096 tokens (safe fallback)
    """
    # Check environment variable first (allows override)
    env_max_tokens = os.environ.get("BEDROCK_MAX_TOKENS")
    if env_max_tokens:
        try:
            return int(env_max_tokens)
        except ValueError:
            pass  # Fall through to model-based detection

    # Claude 4.5 series models (8192 tokens) - all variants
    # Pattern: claude-sonnet-4-5, claude-haiku-4-5, claude-opus-4-5
    if (
        "claude-sonnet-4-5" in model_id
        or "claude-haiku-4-5" in model_id
        or "claude-opus-4-5" in model_id
    ):
        return 8192

    # Amazon Nova Pro (8192 tokens)
    if "amazon.nova-pro" in model_id:
        return 8192

    # Amazon Nova Lite (4096 tokens)
    if "amazon.nova-lite" in model_id:
        return 4096

    # Default: 4096 tokens (safe fallback for unknown models)
    return 4096


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

    # Get maximum tokens for the model (model-specific limit)
    max_tokens = get_max_tokens_for_model(model_id)

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
            "max_tokens": max_tokens,
            "temperature": TEMPERATURE,
            "messages": [{"role": "user", "content": prompt.strip()}],
        }
    elif "amazon.nova" in model_id:
        # Amazon Nova models (AWS native format)
        # Reference: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-nova.html
        request_body = {
            "messages": [{"role": "user", "content": [{"text": prompt.strip()}]}],
            "inferenceConfig": {
                "max_new_tokens": max_tokens,
                "temperature": TEMPERATURE,
            },
        }
    else:
        # Default to Nova format for unknown models
        request_body = {
            "messages": [{"role": "user", "content": [{"text": prompt.strip()}]}],
            "inferenceConfig": {
                "max_new_tokens": max_tokens,
                "temperature": TEMPERATURE,
            },
        }

    try:
        # Invoke Bedrock model
        print(f"Invoking Bedrock model: {model_id}")
        print(f"Max tokens: {max_tokens} (model-specific limit)")
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
