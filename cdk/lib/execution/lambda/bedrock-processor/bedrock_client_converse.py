"""
Amazon Bedrock client for AI inference using Converse API.

This module provides a wrapper around the Bedrock Runtime Converse API
for invoking foundation models with a unified interface.

Converse API advantages:
- Unified interface across all supported models
- Native support for multimodal inputs (text + images)
- Simplified conversation history management
- Binary image data (no Base64 encoding required)
- Better performance and memory efficiency

Note: Migrated from InvokeModel API to Converse API for better image handling.
"""

import os
from typing import Optional, List, Dict, Any

import boto3
from botocore.exceptions import ClientError


# Model configuration
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
    if "claude-sonnet-4-5" in model_id or "claude-haiku-4-5" in model_id or "claude-opus-4-5" in model_id:
        return 8192
    
    # Amazon Nova Pro (8192 tokens)
    if "amazon.nova-pro" in model_id:
        return 8192
    
    # Amazon Nova Lite (4096 tokens)
    if "amazon.nova-lite" in model_id:
        return 4096
    
    # Default: 4096 tokens (safe fallback for unknown models)
    return 4096


def prepare_image_content_converse(image_bytes: bytes, mime_type: str = "image/png") -> Dict[str, Any]:
    """
    Prepare image content for Bedrock Converse API.
    
    Converse API uses binary image data directly (no Base64 encoding required).
    
    Args:
        image_bytes: Raw image file bytes
        mime_type: MIME type of the image (e.g., "image/png", "image/jpeg")
        
    Returns:
        Dictionary with image content block format for Converse API
        
    Raises:
        ValueError: If image_bytes is empty or invalid
        
    Example:
        >>> with open("photo.png", "rb") as f:
        ...     image_bytes = f.read()
        >>> image_content = prepare_image_content_converse(image_bytes, "image/png")
    """
    if not image_bytes or not isinstance(image_bytes, bytes):
        raise ValueError("image_bytes must be non-empty bytes")
    
    # Validate image size (5MB limit for Converse API)
    max_size = 5 * 1024 * 1024  # 5MB
    if len(image_bytes) > max_size:
        raise ValueError(
            f"Image size ({len(image_bytes)} bytes) exceeds maximum "
            f"allowed size ({max_size} bytes)"
        )
    
    # Extract format from MIME type (e.g., "image/png" -> "png")
    image_format = mime_type.split("/")[-1].lower()
    
    # Map common MIME types to Converse API format values
    format_mapping = {
        "png": "png",
        "jpeg": "jpeg",
        "jpg": "jpeg",
        "gif": "gif",
        "webp": "webp",
    }
    
    image_format = format_mapping.get(image_format, "png")
    
    return {
        "image": {
            "format": image_format,
            "source": {
                "bytes": image_bytes  # Binary data, no Base64 encoding
            }
        }
    }


def invoke_bedrock(
    prompt: str,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    images: Optional[List[bytes]] = None,
    image_formats: Optional[List[str]] = None,
    document_texts: Optional[List[str]] = None,
) -> str:
    """
    Invoke Amazon Bedrock model using Converse API.
    
    Converse API provides a unified interface for all supported models,
    simplifying multimodal inputs (text + images) and conversation management.
    
    Args:
        prompt: User message text (cleaned, without bot mentions)
        conversation_history: Optional list of previous messages in Converse format:
            [
                {"role": "user", "content": [{"text": "..."}]},
                {"role": "assistant", "content": [{"text": "..."}]}
            ]
        images: Optional list of image bytes (raw binary data, NOT Base64)
        image_formats: Optional list of image formats (e.g., ["png", "jpeg"])
                      Must match length of images list
        document_texts: Optional list of extracted document text strings
        
    Returns:
        str: AI-generated response text
        
    Raises:
        ClientError: If Bedrock API call fails (throttling, access denied, etc.)
        ValueError: If input is invalid or response format is unexpected
        Exception: For unexpected errors
        
    Example:
        >>> # Text only
        >>> response = invoke_bedrock("Hello!")
        
        >>> # With image
        >>> with open("photo.png", "rb") as f:
        ...     image_bytes = f.read()
        >>> response = invoke_bedrock(
        ...     "What's in this image?",
        ...     images=[image_bytes],
        ...     image_formats=["png"]
        ... )
        
        >>> # With conversation history
        >>> history = [
        ...     {"role": "user", "content": [{"text": "Hello"}]},
        ...     {"role": "assistant", "content": [{"text": "Hi there!"}]}
        ... ]
        >>> response = invoke_bedrock("How are you?", conversation_history=history)
    
    Performance:
        - Typical latency: 1-3 seconds for short prompts
        - May take up to 30 seconds for complex queries with images
        - Synchronous call - blocks until response received
        
    Security:
        - Uses IAM role credentials (no hardcoded keys)
        - Prompt is not validated for PII (deferred to post-MVP)
        - No Guardrails applied (deferred to post-MVP)
    """
    # Validate input - at least one of prompt, images, or document_texts must be provided
    if not prompt and not images and not document_texts:
        raise ValueError("At least one of prompt, images, or document_texts must be provided")
    
    # Validate image formats match images length
    if images and image_formats and len(images) != len(image_formats):
        raise ValueError(
            f"Number of images ({len(images)}) must match number of formats ({len(image_formats)})"
        )
    
    # Get configuration from environment variables
    aws_region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
    model_id = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")
    
    # Get maximum tokens for the model (model-specific limit)
    max_tokens = get_max_tokens_for_model(model_id)
    
    # Initialize Bedrock Runtime client
    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime", region_name=aws_region
    )
    
    # Build content array for current message (text + images + document texts)
    content_parts = []
    
    # Add text prompt if present
    if prompt and prompt.strip():
        content_parts.append({"text": prompt.strip()})
    
    # Add document texts if present
    if document_texts:
        for doc_text in document_texts:
            if doc_text:
                content_parts.append({"text": f"\n\n[Document content]\n{doc_text}"})
    
    # Add images if present (binary data, no Base64 encoding)
    if images:
        formats = image_formats if image_formats else ["png"] * len(images)
        for image_bytes, image_format in zip(images, formats):
            content_parts.append({
                "image": {
                    "format": image_format,
                    "source": {
                        "bytes": image_bytes  # Binary data directly
                    }
                }
            })
    
    # Build messages array with conversation history
    messages = []
    
    if conversation_history:
        # Use conversation history as-is (already in Converse format)
        messages = conversation_history.copy()
    
    # Add current message
    messages.append({
        "role": "user",
        "content": content_parts
    })
    
    # Build inference configuration with model-specific max tokens
    inference_config = {
        "maxTokens": max_tokens,
        "temperature": TEMPERATURE,
    }
    
    try:
        # Log request details
        print(f"Invoking Bedrock model (Converse API): {model_id}")
        print(f"Max tokens: {max_tokens} (model-specific limit)")
        print(f"Prompt length: {len(prompt)} characters")
        if images:
            print(f"Image count: {len(images)}")
            for i, img_bytes in enumerate(images):
                print(f"  Image {i}: {len(img_bytes)} bytes, format: {formats[i]}")
        if document_texts:
            print(f"Document text count: {len(document_texts)}")
        print(f"Total messages: {len(messages)}")
        
        # Log message structure (without full content)
        for i, msg in enumerate(messages):
            role = msg.get("role", "unknown")
            content = msg.get("content", [])
            content_summary = []
            for part in content:
                if "text" in part:
                    content_summary.append(f"text({len(part['text'])} chars)")
                elif "image" in part:
                    img = part["image"]
                    img_format = img.get("format", "unknown")
                    img_bytes_len = len(img.get("source", {}).get("bytes", b""))
                    content_summary.append(f"image({img_format}, {img_bytes_len} bytes)")
            print(f"Message {i} [{role}]: {content_summary}")
        
        # Call Converse API
        response = bedrock_runtime.converse(
            modelId=model_id,
            messages=messages,
            inferenceConfig=inference_config
        )
        
        # Parse response
        print(f"Bedrock response received (Converse API)")
        print(f"Stop reason: {response.get('stopReason')}")
        print(f"Usage: {response.get('usage')}")
        
        # Extract AI-generated text from response
        # Converse API response format:
        # {
        #   "output": {
        #     "message": {
        #       "role": "assistant",
        #       "content": [{"text": "..."}]
        #     }
        #   },
        #   "stopReason": "end_turn",
        #   "usage": {...}
        # }
        output = response.get("output", {})
        message = output.get("message", {})
        content_blocks = message.get("content", [])
        
        if not content_blocks:
            raise ValueError("No content in Bedrock response")
        
        # Extract text from first content block
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
        print(f"Bedrock ClientError (Converse API): {error_code} - {error_message}")
        
        # Log additional details for ValidationException
        if error_code == "ValidationException":
            print(f"Request details:")
            print(f"  Model: {model_id}")
            print(f"  Messages count: {len(messages)}")
            if images:
                print(f"  Images count: {len(images)}")
                for i, img_bytes in enumerate(images):
                    print(f"    Image {i}: {len(img_bytes)} bytes, format: {formats[i]}")
        
        raise
    
    except ValueError as e:
        # Invalid response format
        print(f"Bedrock response validation error: {str(e)}")
        raise
    
    except Exception as e:
        # Unexpected errors
        print(f"Unexpected error invoking Bedrock (Converse API): {str(e)}")
        raise


def _detect_prompt_injection(prompt: str) -> tuple[bool, Optional[str]]:
    """
    Detect potential prompt injection attacks.
    
    Checks for common prompt injection patterns:
    - "ignore previous instructions"
    - "system prompt"
    - "forget everything"
    - "new instructions"
    - "override"
    - "jailbreak"
    
    Args:
        prompt: User message text
        
    Returns:
        Tuple of (is_suspicious: bool, reason: Optional[str])
        - is_suspicious: True if prompt injection pattern detected
        - reason: Reason for suspicion (None if not suspicious)
    """
    if not prompt:
        return False, None
    
    prompt_lower = prompt.lower()
    
    # Common prompt injection patterns (case-insensitive)
    suspicious_patterns = [
        ("ignore previous", "Attempt to ignore previous instructions"),
        ("ignore all previous", "Attempt to ignore all previous instructions"),
        ("system prompt", "Attempt to access system prompt"),
        ("forget everything", "Attempt to reset context"),
        ("new instructions", "Attempt to provide new instructions"),
        ("override", "Attempt to override system behavior"),
        ("jailbreak", "Attempt to jailbreak the model"),
        ("you are now", "Attempt to change model behavior"),
        ("act as", "Attempt to change model role"),
        ("pretend to be", "Attempt to change model role"),
    ]
    
    for pattern, reason in suspicious_patterns:
        if pattern in prompt_lower:
            return True, reason
    
    return False, None


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
    
    # Check for prompt injection patterns
    is_suspicious, reason = _detect_prompt_injection(prompt)
    if is_suspicious:
        # Log security event but don't reveal the specific pattern to user
        # This prevents attackers from learning which patterns are detected
        return (
            False,
            "Your message contains potentially harmful content. Please rephrase your request.",
        )
    
    # All validations passed
    return True, None

