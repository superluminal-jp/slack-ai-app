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

import json
import os
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

from logger_util import get_logger, log

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch (searchable, parseable)."""
    log(_logger, level, event_type, {**data, "component": "bedrock_client"}, service="execution-agent")


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
    
    # Claude 4.x series models (8192 tokens) - all variants
    # Pattern: claude-sonnet-4-5/4-6, claude-haiku-4-5, claude-opus-4-5/4-6
    if any(p in model_id for p in ("claude-sonnet-4-5", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-5", "claude-opus-4-6")):
        return 8192
    
    # Amazon Nova Pro (8192 tokens)
    if "amazon.nova-pro" in model_id:
        return 8192
    
    # Amazon Nova Lite (4096 tokens)
    if "amazon.nova-lite" in model_id:
        return 4096
    
    # Default: 4096 tokens (safe fallback for unknown models)
    return 4096


# MIME to Bedrock document format (per data-model; PPTX not native)
MIME_TO_DOCUMENT_FORMAT = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/csv": "csv",
    "text/plain": "txt",
}
# PPTX -> text extraction only (not in map)


def _sanitize_document_name(file_name: str, max_length: int = 100) -> str:
    """
    Sanitize document name for Bedrock: alphanumeric, hyphens, spaces only.
    Prevents prompt injection via filename. Strip extension, truncate.
    """
    import re
    base = file_name.rsplit(".", 1)[0] if "." in file_name else file_name
    sanitized = re.sub(r"[^a-zA-Z0-9\s\-()\[\]]", "-", base)
    sanitized = re.sub(r"\s+", " ", sanitized).strip() or "document"
    return sanitized[:max_length]


def prepare_document_content_converse(
    raw_bytes: bytes,
    mimetype: str,
    file_name: str,
) -> Optional[Dict[str, Any]]:
    """
    Build Bedrock Converse API document content block for native document support.

    Supported formats (per data-model): pdf, docx, xlsx, csv, txt.
    PPTX returns None to trigger text extraction fallback.

    Args:
        raw_bytes: Raw document file bytes.
        mimetype: MIME type (e.g. application/pdf).
        file_name: Original filename (sanitized for name field).

    Returns:
        Document content block {"document": {"name", "format", "source": {"bytes"}}}
        or None for unsupported formats (e.g. PPTX).
    """
    if not raw_bytes or not isinstance(raw_bytes, bytes):
        return None

    format_val = MIME_TO_DOCUMENT_FORMAT.get(mimetype)
    if format_val is None:
        return None

    name = _sanitize_document_name(file_name)
    return {
        "document": {
            "name": name,
            "format": format_val,
            "source": {"bytes": raw_bytes},
        },
    }


def build_content_blocks(
    prompt: str,
    documents: Optional[List[Dict[str, Any]]] = None,
    document_texts: Optional[List[str]] = None,
    images: Optional[List[bytes]] = None,
    image_formats: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Build content blocks for Bedrock Converse / Strands Agent multimodal input.

    Args:
        prompt: User message text
        documents: Native document blocks [{bytes, format, name}]
        document_texts: Fallback text from documents (e.g. PPTX)
        images: Image bytes list
        image_formats: Format per image (png, jpeg, gif, webp)

    Returns:
        List of content blocks (text, document, image)
    """
    content_parts: List[Dict[str, Any]] = []
    if prompt and prompt.strip():
        content_parts.append({"text": prompt.strip()})
    elif documents:
        content_parts.append({"text": "Please summarize or analyze the attached document(s)."})

    if document_texts:
        for doc_text in document_texts:
            if doc_text:
                content_parts.append({"text": f"\n\n[Document content]\n{doc_text}"})

    if documents:
        for doc in documents:
            raw_bytes = doc.get("bytes")
            format_val = doc.get("format")
            name = doc.get("name", "document")
            if raw_bytes and format_val:
                safe_name = _sanitize_document_name(name)
                content_parts.append({
                    "document": {
                        "name": safe_name,
                        "format": format_val,
                        "source": {"bytes": raw_bytes},
                    },
                })

    if images:
        formats = image_formats if image_formats else ["png"] * len(images)
        for image_bytes, image_format in zip(images, formats):
            content_parts.append({
                "image": {
                    "format": image_format,
                    "source": {"bytes": image_bytes},
                },
            })
    return content_parts


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
    documents: Optional[List[Dict[str, Any]]] = None,
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
        document_texts: Optional list of extracted document text strings (fallback, e.g. PPTX)
        documents: Optional list of native document blocks: [{"bytes", "format", "name"}, ...]
                  (PDF, DOCX, XLSX, CSV, TXT). Max 5 per Bedrock API.
        
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
    # Validate input - at least one of prompt, images, document_texts, or documents must be provided
    if not prompt and not images and not document_texts and not documents:
        raise ValueError(
            "At least one of prompt, images, document_texts, or documents must be provided"
        )
    
    # Validate image formats match images length
    if images and image_formats and len(images) != len(image_formats):
        raise ValueError(
            f"Number of images ({len(images)}) must match number of formats ({len(image_formats)})"
        )

    # FR-012 / Bedrock API limits: max 5 documents, max 20 images per request
    MAX_DOCUMENTS_PER_REQUEST = 5
    MAX_IMAGES_PER_REQUEST = 20
    if documents and len(documents) > MAX_DOCUMENTS_PER_REQUEST:
        documents = documents[:MAX_DOCUMENTS_PER_REQUEST]
    if images and len(images) > MAX_IMAGES_PER_REQUEST:
        images = images[:MAX_IMAGES_PER_REQUEST]
        if image_formats:
            image_formats = image_formats[:MAX_IMAGES_PER_REQUEST]

    # Get configuration from environment variables
    aws_region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
    model_id = os.environ.get("BEDROCK_MODEL_ID", "jp.anthropic.claude-sonnet-4-6")
    
    # Get maximum tokens for the model (model-specific limit)
    max_tokens = get_max_tokens_for_model(model_id)
    
    # Initialize Bedrock Runtime client
    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime", region_name=aws_region
    )
    
    # Build content array: text first, then document blocks, then images
    content_parts = build_content_blocks(
        prompt=prompt,
        documents=documents,
        document_texts=document_texts,
        images=images,
        image_formats=image_formats,
    )
    
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
        # Log request details (structured JSON for CloudWatch)
        image_summary = []
        if images:
            fmt = image_formats if image_formats else ["png"] * len(images)
            for i, img_bytes in enumerate(images):
                image_summary.append({"index": i, "bytes": len(img_bytes), "format": fmt[i]})
        _log("INFO", "bedrock_converse_request", {
            "model_id": model_id,
            "max_tokens": max_tokens,
            "prompt_length": len(prompt),
            "image_count": len(images) if images else 0,
            "document_text_count": len(document_texts) if document_texts else 0,
            "native_document_count": len(documents) if documents else 0,
            "message_count": len(messages),
            "image_summary": image_summary,
        })
        
        # Call Converse API
        response = bedrock_runtime.converse(
            modelId=model_id,
            messages=messages,
            inferenceConfig=inference_config
        )
        
        # Parse response
        content_blocks = response.get("output", {}).get("message", {}).get("content", [])
        resp_len = len(content_blocks[0].get("text", "")) if content_blocks else 0
        _log("INFO", "bedrock_converse_response", {
            "model_id": model_id,
            "stop_reason": response.get("stopReason"),
            "usage": response.get("usage"),
            "response_length": resp_len,
        })
        
        # Extract AI-generated text from response
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
        
        return ai_response
    
    except ClientError as e:
        # AWS service errors (throttling, access denied, etc.)
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]
        error_details = {
            "error_code": error_code,
            "error_message": error_message,
            "model_id": model_id,
            "message_count": len(messages),
            "http_status": e.response.get("ResponseMetadata", {}).get("HTTPStatusCode"),
        }
        if error_code == "ValidationException" and images:
            error_details["image_count"] = len(images)
            error_details["image_sizes"] = [len(b) for b in images]
            error_details["image_formats"] = image_formats if image_formats else ["png"] * len(images)
        _log("ERROR", "bedrock_client_error", error_details)
        raise
    
    except ValueError as e:
        _log("ERROR", "bedrock_response_validation_error", {
            "error": str(e),
            "model_id": model_id,
        })
        raise
    
    except Exception as e:
        _log("ERROR", "bedrock_unexpected_error", {
            "error_type": type(e).__name__,
            "error": str(e),
            "error_repr": repr(e),
            "model_id": model_id,
        })
        raise
