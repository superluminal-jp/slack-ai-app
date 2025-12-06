"""
Amazon Bedrock client for AI inference.

This module provides a simple wrapper around the Bedrock Runtime API
for invoking Claude 3 Haiku model for conversational AI responses.

Note: This is Phase 6 implementation (async processing in Bedrock Processor).
"""

import json
import os
from typing import Optional, List, Dict, Any

import boto3
from botocore.exceptions import ClientError


# Model configuration
# MODEL_ID is loaded from environment variable to allow flexible model selection
MAX_TOKENS = 1024
TEMPERATURE = 1.0


def prepare_image_content(
    base64_image: str, mime_type: str = "image/png"
) -> Dict[str, Any]:
    """
    Prepare image content for Bedrock API (Claude vision format).

    Args:
        base64_image: Base64-encoded image string
        mime_type: MIME type of the image (default: "image/png")

    Returns:
        Dictionary with image content block format for Claude API

    Raises:
        ValueError: If base64_image is empty or invalid
    """
    if not base64_image or not isinstance(base64_image, str):
        raise ValueError("base64_image must be a non-empty string")

    # Validate base64 format (basic check)
    try:
        import base64 as b64

        # Try to decode to validate base64 format
        b64.b64decode(base64_image, validate=True)
    except Exception as e:
        raise ValueError(f"Invalid base64 image data: {str(e)}")

    # Validate image size (5MB limit for base64 encoded)
    max_size = 5 * 1024 * 1024  # 5MB
    if len(base64_image) > max_size:
        raise ValueError(
            f"Image size ({len(base64_image)} bytes) exceeds maximum allowed size ({max_size} bytes)"
        )

    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": mime_type,
            "data": base64_image,
        },
    }


def invoke_bedrock(
    prompt: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    images: Optional[List[Dict[str, Any]]] = None,
    document_texts: Optional[List[str]] = None,
) -> str:
    """
    Invoke Amazon Bedrock model for AI inference.

    This function sends a user prompt to Bedrock and returns the AI-generated
    response. It automatically detects the model type and uses the appropriate
    API format (Claude vs Nova). Supports images and document text.

    Args:
        prompt: User message text (cleaned, without bot mentions)
        conversation_history: Optional list of previous messages in format:
            [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
            If provided, these messages are included as conversation context.
        images: Optional list of image content dictionaries (from prepare_image_content)
        document_texts: Optional list of extracted document text strings

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

        >>> # With images
        >>> image_content = prepare_image_content(base64_image)
        >>> response = invoke_bedrock("What's in this image?", images=[image_content])

    Performance:
        - Typical latency: 1-3 seconds for short prompts
        - May take up to 30 seconds for complex queries with images
        - Synchronous call - blocks until response received

    Security:
        - Uses IAM role credentials (no hardcoded keys)
        - Prompt is not validated for PII (deferred to post-MVP)
        - No Guardrails applied (deferred to post-MVP)
    """
    # Validate input - prompt is optional if images or document_texts are provided
    if not prompt and not images and not document_texts:
        raise ValueError("Prompt, images, or document_texts must be provided")

    # Get configuration from environment variables
    aws_region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
    model_id = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")

    # Initialize Bedrock Runtime client
    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime", region_name=aws_region
    )

    # Build content array for current message (text + images + document texts)
    content_parts = []

    # Add text prompt if present
    if prompt and prompt.strip():
        content_parts.append({"type": "text", "text": prompt.strip()})

    # Add document texts if present
    if document_texts:
        for doc_text in document_texts:
            if doc_text:
                content_parts.append(
                    {"type": "text", "text": f"\n\n[Document content]\n{doc_text}"}
                )

    # Add images if present
    if images:
        content_parts.extend(images)

    # Build messages array with conversation history
    # If conversation_history is provided, include it; otherwise use just the current message
    if conversation_history:
        # Convert conversation history to Claude format (content must be array)
        messages = []
        for hist_msg in conversation_history:
            role = hist_msg.get("role", "user")
            hist_content = hist_msg.get("content", "")
            # Convert string content to array format for Claude API
            if isinstance(hist_content, str):
                messages.append(
                    {"role": role, "content": [{"type": "text", "text": hist_content}]}
                )
            elif isinstance(hist_content, list):
                # Already in array format
                messages.append({"role": role, "content": hist_content})
            else:
                # Fallback
                messages.append(
                    {
                        "role": role,
                        "content": [{"type": "text", "text": str(hist_content)}],
                    }
                )

        # Add current user message with content array (may include images)
        # Important: If we have images, we need to ensure the previous message ends with assistant
        # Claude API requires alternating user/assistant messages
        if messages and messages[-1]["role"] == "user" and (images or document_texts):
            # Last message was from user, but we need to add another user message with images
            # This violates Claude's alternating message rule
            # Solution: Combine the last user message with the current one
            last_message_content = messages[-1]["content"]
            if isinstance(last_message_content, list):
                # Merge content arrays
                combined_content = last_message_content + content_parts
                messages[-1]["content"] = combined_content
            else:
                # Should not happen after conversion above, but handle it
                messages[-1]["content"] = content_parts
        else:
            # Normal case: add new user message
            messages.append({"role": "user", "content": content_parts})
    else:
        # No history - just current message
        messages = [{"role": "user", "content": content_parts}]

    # Construct request payload based on model type
    # Different models have different API formats
    if "anthropic.claude" in model_id or "jp.anthropic.claude" in model_id:
        # Claude models (Anthropic format)
        # Reference: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
        # Claude format: content MUST be array format (even for text-only messages when images are present)
        claude_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            # Convert content to array format
            if isinstance(content, list):
                # Content is already an array (current message with images or already converted)
                claude_messages.append({"role": role, "content": content})
            elif isinstance(content, str):
                # Text-only message - convert to array format
                # Claude API requires content to be array format
                claude_messages.append(
                    {"role": role, "content": [{"type": "text", "text": content}]}
                )
            else:
                # Fallback: convert to string then to array
                claude_messages.append(
                    {"role": role, "content": [{"type": "text", "text": str(content)}]}
                )

        # Use anthropic_version based on model ID
        # Claude 3.5 and newer models may require different version
        if (
            "claude-3-5" in model_id
            or "claude-haiku-4" in model_id
            or "claude-sonnet-4" in model_id
        ):
            anthropic_version = "bedrock-2023-05-31"  # Latest version for Claude 3.5+
        else:
            anthropic_version = "bedrock-2023-05-31"  # Standard version

        request_body = {
            "anthropic_version": anthropic_version,
            "max_tokens": MAX_TOKENS,
            "temperature": TEMPERATURE,
            "messages": claude_messages,
        }
    elif "amazon.nova" in model_id:
        # Amazon Nova models (AWS native format)
        # Reference: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-nova.html
        # Convert messages to Nova format (content is array with text object)
        nova_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            # Nova format: content is array with text object
            nova_messages.append({"role": role, "content": [{"text": content}]})

        request_body = {
            "messages": nova_messages,
            "inferenceConfig": {
                "max_new_tokens": MAX_TOKENS,
                "temperature": TEMPERATURE,
            },
        }
    else:
        # Default to Nova format for unknown models
        nova_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            nova_messages.append({"role": role, "content": [{"text": content}]})

        request_body = {
            "messages": nova_messages,
            "inferenceConfig": {
                "max_new_tokens": MAX_TOKENS,
                "temperature": TEMPERATURE,
            },
        }

    try:
        # Invoke Bedrock model
        print(f"Invoking Bedrock model: {model_id}")
        print(f"Prompt length: {len(prompt)} characters")
        if images:
            print(f"Image count: {len(images)}")
        if document_texts:
            print(f"Document text count: {len(document_texts)}")
        # Debug: Log request body structure (without full image data)
        debug_body = json.loads(json.dumps(request_body))
        if "messages" in debug_body:
            for i, msg in enumerate(debug_body["messages"]):
                if isinstance(msg.get("content"), list):
                    content_summary = []
                    for part in msg["content"]:
                        if part.get("type") == "text":
                            content_summary.append(
                                f"text({len(part.get('text', ''))} chars)"
                            )
                        elif part.get("type") == "image":
                            img_source = part.get("source", {})
                            media_type = img_source.get("media_type", "unknown")
                            data_len = len(img_source.get("data", ""))
                            content_summary.append(
                                f"image({media_type}, {data_len} bytes)"
                            )
                    print(f"Message {i} content: {content_summary}")
                else:
                    print(
                        f"Message {i} content: string({len(str(msg.get('content', '')))} chars)"
                    )

        # Validate request body before sending
        if "messages" in request_body:
            for i, msg in enumerate(request_body["messages"]):
                content = msg.get("content", [])
                if isinstance(content, list):
                    for j, part in enumerate(content):
                        if part.get("type") == "image":
                            img_source = part.get("source", {})
                            img_data = img_source.get("data", "")
                            if not img_data:
                                raise ValueError(
                                    f"Message {i} content part {j}: image data is empty"
                                )
                            if len(img_data) == 0:
                                raise ValueError(
                                    f"Message {i} content part {j}: image data length is 0"
                                )
                            # Validate base64 format
                            try:
                                import base64 as b64

                                decoded = b64.b64decode(img_data, validate=True)
                                if len(decoded) == 0:
                                    raise ValueError(
                                        f"Message {i} content part {j}: decoded image data is empty"
                                    )
                                print(
                                    f"Message {i} content part {j}: image validated - decoded_size={len(decoded)} bytes, base64_size={len(img_data)} bytes"
                                )
                            except Exception as e:
                                raise ValueError(
                                    f"Message {i} content part {j}: invalid base64 image data: {str(e)}"
                                )

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

        # Log additional details for ValidationException
        if error_code == "ValidationException":
            print(f"Request body structure:")
            print(f"  Model: {model_id}")
            print(f"  Messages count: {len(request_body.get('messages', []))}")
            if images:
                print(f"  Images count: {len(images)}")
                for i, img in enumerate(images):
                    img_source = img.get("source", {})
                    print(
                        f"    Image {i}: type={img.get('type')}, media_type={img_source.get('media_type')}, data_len={len(img_source.get('data', ''))}"
                    )

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
