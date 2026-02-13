"""
Attachment processor module for Slack attachments.

Orchestrates attachment download, content extraction, and processing.
Follows Slack and AWS best practices:
- Uses files.info API to get fresh download URLs (Slack official recommendation)
- Images returned as binary data for AWS Bedrock Converse API (no Base64 needed)
- Detailed error tracking with specific failure reasons
- Graceful degradation: process what we can, report what failed

Reference:
- Slack files.info: https://api.slack.com/methods/files.info
- AWS Bedrock Converse: https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html
"""

import json
from typing import Any, Dict, List, Optional

from file_downloader import download_file, get_file_download_url, download_from_presigned_url
from logger_util import get_logger, log

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="execution-agent-attachment")


# Supported image MIME types (Bedrock Converse API supported formats)
SUPPORTED_IMAGE_TYPES = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
]


def is_image_attachment(mimetype: str) -> bool:
    """
    Check if attachment is a supported image type.
    
    Bedrock Converse API supports: PNG, JPEG, GIF, WebP
    """
    return mimetype in SUPPORTED_IMAGE_TYPES or mimetype.startswith("image/")


def is_supported_image_type(mimetype: str) -> bool:
    """Check if image type is supported by Bedrock Converse API."""
    return mimetype in SUPPORTED_IMAGE_TYPES


def is_document_attachment(mimetype: str) -> bool:
    """Check if attachment is a supported document type."""
    supported_documents = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # XLSX
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # PPTX
        "text/plain",  # TXT
    ]
    return mimetype in supported_documents


def validate_attachment_size(file_size: int, max_size_bytes: int) -> bool:
    """Validate attachment file size against maximum allowed size."""
    return file_size > 0 and file_size <= max_size_bytes
# Import document extractor functions with error handling
try:
    from document_extractor import (
        extract_text_from_pdf,
        extract_text_from_docx,
        extract_text_from_csv,
        extract_text_from_xlsx,
        extract_text_from_pptx,
        extract_text_from_txt,
        convert_pptx_slides_to_images,
    )
except ImportError as e:
    _log("WARN", "document_extractor_import_failed", {"error": str(e)})

    # Define stub functions that log a warning and return None
    def extract_text_from_pdf(*args, **kwargs):
        _log("WARN", "stub_extractor_called", {"function": "extract_text_from_pdf", "reason": "document_extractor not available"})
        return None
    def extract_text_from_docx(*args, **kwargs):
        _log("WARN", "stub_extractor_called", {"function": "extract_text_from_docx", "reason": "document_extractor not available"})
        return None
    def extract_text_from_csv(*args, **kwargs):
        _log("WARN", "stub_extractor_called", {"function": "extract_text_from_csv", "reason": "document_extractor not available"})
        return None
    def extract_text_from_xlsx(*args, **kwargs):
        _log("WARN", "stub_extractor_called", {"function": "extract_text_from_xlsx", "reason": "document_extractor not available"})
        return None
    def extract_text_from_pptx(*args, **kwargs):
        _log("WARN", "stub_extractor_called", {"function": "extract_text_from_pptx", "reason": "document_extractor not available"})
        return None
    def extract_text_from_txt(*args, **kwargs):
        _log("WARN", "stub_extractor_called", {"function": "extract_text_from_txt", "reason": "document_extractor not available"})
        return None
    def convert_pptx_slides_to_images(*args, **kwargs):
        _log("WARN", "stub_extractor_called", {"function": "convert_pptx_slides_to_images", "reason": "document_extractor not available"})
        return None

# File size limits (in bytes)
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_DOCUMENT_SIZE = 5 * 1024 * 1024  # 5MB


def process_attachments(
    attachments: List[Dict[str, Any]], bot_token: str, correlation_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Process all attachments: download, extract content, and prepare for AI processing.
    
    Follows best practices:
    - Uses files.info API for fresh download URLs (Slack official recommendation)
    - Validates file size before download
    - Validates content after download (Content-Type, size, magic bytes)
    - Returns binary image data for Bedrock Converse API
    - Tracks specific failure reasons for each attachment
    
    Args:
        attachments: List of attachment metadata dictionaries from Slack event
        bot_token: Slack bot token (xoxb-*) for file downloads
        correlation_id: Optional correlation ID for distributed tracing
        
    Returns:
        List of processed attachment dictionaries, each containing:
        - file_id: Original Slack file ID
        - file_name: File name
        - mimetype: MIME type
        - content_type: "image", "document", or "unknown"
        - processing_status: "success", "failed", or "skipped"
        - content: Binary data (images) or text (documents) if successful
        - error_message: Description of failure if not successful
        - error_code: Machine-readable error code for categorization
    """
    processed = []
    
    for attachment in attachments:
        file_id = attachment.get("id")
        file_name = attachment.get("name", "unknown")
        mime_type = attachment.get("mimetype", "")
        file_size = attachment.get("size", 0)
        download_url = attachment.get("url_private_download")
        
        log_data = {
            "file_id": file_id,
            "file_name": file_name,
            "mimetype": mime_type,
            "size": file_size,
        }
        correlation_id = correlation_id or get_correlation_id()
        if correlation_id:
            log_data["correlation_id"] = correlation_id
        
        # Check if image type is supported by Bedrock
        if is_image_attachment(mime_type) and not is_supported_image_type(mime_type):
            log_warn(
                "attachment_unsupported_image_type",
                {
                    **log_data,
                    "supported_types": SUPPORTED_IMAGE_TYPES,
                },
            )
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "mimetype": mime_type,
                "content_type": "image",
                "processing_status": "failed",
                "error_code": "unsupported_image_type",
                "error_message": f"Image type '{mime_type}' is not supported. Supported types: PNG, JPEG, GIF, WebP",
            })
            continue
        
        # Validate file size
        if is_image_attachment(mime_type):
            if not validate_attachment_size(file_size, MAX_IMAGE_SIZE):
                log_warn(
                    "attachment_size_exceeded",
                    {
                        **log_data,
                        "max_size": MAX_IMAGE_SIZE,
                    },
                )
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "image",
                    "processing_status": "failed",
                    "error_code": "file_too_large",
                    "error_message": f"Image file size ({file_size} bytes) exceeds maximum allowed size ({MAX_IMAGE_SIZE} bytes)",
                })
                continue
        elif is_document_attachment(mime_type):
            if not validate_attachment_size(file_size, MAX_DOCUMENT_SIZE):
                log_warn(
                    "attachment_size_exceeded",
                    {
                        **log_data,
                        "max_size": MAX_DOCUMENT_SIZE,
                    },
                )
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "document",
                    "processing_status": "failed",
                    "error_code": "file_too_large",
                    "error_message": f"Document file size ({file_size} bytes) exceeds maximum allowed size ({MAX_DOCUMENT_SIZE} bytes)",
                })
                continue
        
        # Step 1: Get fresh download URL from files.info API
        # Slack official best practice: Event payload URLs may be stale or expired
        fresh_download_url = get_file_download_url(file_id, bot_token)
        
        # Use fresh URL (preferred) or fallback to event payload URL
        effective_download_url = fresh_download_url or download_url
        url_source = "files_info" if fresh_download_url else "event_payload"
        
        if not effective_download_url:
            log_error(
                "attachment_download_url_missing",
                {
                    **log_data,
                    "files_info_failed": fresh_download_url is None,
                    "event_url_missing": download_url is None,
                },
            )
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "mimetype": mime_type,
                "content_type": "unknown",
                "processing_status": "failed",
                "error_code": "url_not_available",
                "error_message": "Could not obtain download URL from Slack (files.info API and event payload both failed)",
            })
            continue
        
        log_info(
            "attachment_download_started",
            {
                **log_data,
                "url_source": url_source,
            },
        )
        
        # Step 2: Download file with validation
        # - Retries with exponential backoff
        # - Handles rate limiting (429)
        # - Validates Content-Type, size, and magic bytes
        file_bytes = download_file(
            effective_download_url,
            bot_token,
            expected_size=file_size,
            expected_mimetype=mime_type,
        )
        
        if not file_bytes:
            log_error(
                "attachment_download_failed",
                {
                    **log_data,
                    "url_source": url_source,
                },
            )
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "mimetype": mime_type,
                "content_type": "image" if is_image_attachment(mime_type) else "document" if is_document_attachment(mime_type) else "unknown",
                "processing_status": "failed",
                "error_code": "download_failed",
                "error_message": "Failed to download file from Slack (check bot permissions and file accessibility)",
            })
            continue
        
        log_info(
            "attachment_download_success",
            {
                **log_data,
                "downloaded_size": len(file_bytes),
                "url_source": url_source,
            },
        )
        
        # Step 3: Process based on file type
        if is_image_attachment(mime_type):
            # Store image as binary data (Converse API uses binary, not Base64)
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "mimetype": mime_type,
                "content_type": "image",
                "content": file_bytes,  # Binary data for Bedrock Converse API
                "processing_status": "success",
            })
        elif is_document_attachment(mime_type):
            # Extract text or convert to images based on document type
            text_content = None
            slide_images = None
            
            log_info(
                "document_extraction_started",
                log_data,
            )
            
            if mime_type == "application/pdf":
                text_content = extract_text_from_pdf(file_bytes)
            elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                text_content = extract_text_from_docx(file_bytes)
            elif mime_type == "text/csv":
                text_content = extract_text_from_csv(file_bytes)
            elif mime_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                text_content = extract_text_from_xlsx(file_bytes)
            elif mime_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation":
                # PPTX: Extract text AND convert slides to images
                text_content = extract_text_from_pptx(file_bytes)
                slide_images = convert_pptx_slides_to_images(file_bytes)
            elif mime_type == "text/plain":
                text_content = extract_text_from_txt(file_bytes)
            
            # Log extraction result
            if text_content:
                log_info(
                    "document_extraction_success",
                    {
                        **log_data,
                        "extracted_length": len(text_content),
                    },
                )
            else:
                log_warn(
                    "document_extraction_no_content",
                    {
                        **log_data,
                        "message": "Text extraction returned None or empty string",
                    },
                )
            
            # Process PPTX slide images
            if slide_images:
                for slide_num, image_bytes in enumerate(slide_images, 1):
                    # Store as binary data (Converse API uses binary, not Base64)
                    processed.append({
                        "file_id": f"{file_id}_slide_{slide_num}",
                        "file_name": f"{file_name} - Slide {slide_num}",
                        "mimetype": "image/png",
                        "content_type": "image",
                        "content": image_bytes,  # Binary data, not Base64
                        "processing_status": "success",
                    })
            
            # Include text content if available
            if text_content:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "document",
                    "content": text_content,
                    "processing_status": "success",
                })
            elif not slide_images:
                # No text and no images - processing failed
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "document",
                    "processing_status": "failed",
                    "error_code": "extraction_failed",
                    "error_message": "Failed to extract content from document",
                })
        else:
            # Unsupported file type
            log_info(
                "attachment_unsupported_type",
                log_data,
            )
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "mimetype": mime_type,
                "content_type": "unknown",
                "processing_status": "skipped",
                "error_code": "unsupported_type",
                "error_message": f"Unsupported file type: {mime_type}",
            })
    
    return processed


def get_processing_summary(processed_attachments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate a summary of attachment processing results.
    
    Args:
        processed_attachments: List of processed attachment dictionaries
        
    Returns:
        Summary dictionary with counts and details
    """
    success_count = len([a for a in processed_attachments if a.get("processing_status") == "success"])
    failed_count = len([a for a in processed_attachments if a.get("processing_status") == "failed"])
    skipped_count = len([a for a in processed_attachments if a.get("processing_status") == "skipped"])
    
    # Group failures by error code
    failure_codes = {}
    for a in processed_attachments:
        if a.get("processing_status") == "failed":
            code = a.get("error_code", "unknown")
            failure_codes[code] = failure_codes.get(code, 0) + 1
    
    return {
        "total": len(processed_attachments),
        "success": success_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "failure_codes": failure_codes,
        "has_images": any(a.get("content_type") == "image" and a.get("processing_status") == "success" for a in processed_attachments),
        "has_documents": any(a.get("content_type") == "document" and a.get("processing_status") == "success" for a in processed_attachments),
    }

