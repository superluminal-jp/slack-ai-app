"""
Attachment extractor module for Slack events.

Extracts and validates attachment metadata from Slack event payloads.
"""

from typing import List, Dict, Optional, Any


def extract_attachment_metadata(event: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extract attachment metadata from Slack event payload.
    
    Args:
        event: Slack event dictionary containing 'files' array
        
    Returns:
        List of attachment metadata dictionaries, each containing:
        - id: Slack file ID
        - name: File name
        - mimetype: MIME type
        - size: File size in bytes
        - url_private_download: Download URL (may be None)
    """
    files = event.get("files", [])
    if not files or not isinstance(files, list):
        return []
    
    attachments = []
    for file_info in files:
        # Extract required fields
        file_id = file_info.get("id")
        file_name = file_info.get("name")
        mime_type = file_info.get("mimetype")
        file_size = file_info.get("size")
        download_url = file_info.get("url_private_download")
        
        # Validate required fields
        if not file_id or not file_name or not mime_type or file_size is None:
            continue
        
        # Create attachment metadata
        attachment = {
            "id": file_id,
            "name": file_name,
            "mimetype": mime_type,
            "size": file_size,
            "url_private_download": download_url,  # May be None
        }
        
        attachments.append(attachment)
    
    return attachments


def is_image_attachment(mimetype: str) -> bool:
    """
    Check if attachment is an image based on MIME type.
    
    Args:
        mimetype: MIME type string (e.g., "image/png")
        
    Returns:
        True if MIME type indicates an image, False otherwise
    """
    return mimetype.startswith("image/")


def is_document_attachment(mimetype: str) -> bool:
    """
    Check if attachment is a supported document type.
    
    Supported document types:
    - PDF: application/pdf
    - DOCX: application/vnd.openxmlformats-officedocument.wordprocessingml.document
    - CSV: text/csv
    - XLSX: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    - PPTX: application/vnd.openxmlformats-officedocument.presentationml.presentation
    - TXT: text/plain
    
    Args:
        mimetype: MIME type string
        
    Returns:
        True if MIME type indicates a supported document, False otherwise
    """
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
    """
    Validate attachment file size against maximum allowed size.
    
    Args:
        file_size: File size in bytes
        max_size_bytes: Maximum allowed size in bytes
        
    Returns:
        True if file size is within limit, False otherwise
    """
    return file_size > 0 and file_size <= max_size_bytes

