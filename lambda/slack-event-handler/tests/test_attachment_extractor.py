"""
Unit tests for attachment extractor module.

Tests attachment metadata extraction from Slack events.
"""

import pytest
from unittest.mock import Mock, patch

# Import module to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from attachment_extractor import (
    extract_attachment_metadata,
    is_image_attachment,
    is_document_attachment,
    validate_attachment_size,
)


class TestExtractAttachmentMetadata:
    """Test attachment metadata extraction from Slack events."""
    
    def test_extract_single_attachment(self):
        """Test extracting single attachment from event."""
        event = {
            "files": [
                {
                    "id": "F01234567",
                    "name": "test.png",
                    "mimetype": "image/png",
                    "size": 1024,
                    "url_private_download": "https://files.slack.com/...",
                }
            ]
        }
        
        attachments = extract_attachment_metadata(event)
        
        assert len(attachments) == 1
        assert attachments[0]["id"] == "F01234567"
        assert attachments[0]["name"] == "test.png"
        assert attachments[0]["mimetype"] == "image/png"
        assert attachments[0]["size"] == 1024
        assert attachments[0]["url_private_download"] == "https://files.slack.com/..."
    
    def test_extract_multiple_attachments(self):
        """Test extracting multiple attachments from event."""
        event = {
            "files": [
                {
                    "id": "F01234567",
                    "name": "test.png",
                    "mimetype": "image/png",
                    "size": 1024,
                    "url_private_download": "https://files.slack.com/...",
                },
                {
                    "id": "F01234568",
                    "name": "document.pdf",
                    "mimetype": "application/pdf",
                    "size": 2048,
                    "url_private_download": "https://files.slack.com/...",
                }
            ]
        }
        
        attachments = extract_attachment_metadata(event)
        
        assert len(attachments) == 2
        assert attachments[0]["id"] == "F01234567"
        assert attachments[1]["id"] == "F01234568"
    
    def test_extract_no_files(self):
        """Test event with no files array."""
        event = {}
        attachments = extract_attachment_metadata(event)
        assert attachments == []
    
    def test_extract_empty_files(self):
        """Test event with empty files array."""
        event = {"files": []}
        attachments = extract_attachment_metadata(event)
        assert attachments == []
    
    def test_extract_invalid_files(self):
        """Test event with invalid files (not a list)."""
        event = {"files": "not a list"}
        attachments = extract_attachment_metadata(event)
        assert attachments == []
    
    def test_extract_missing_required_fields(self):
        """Test that attachments with missing required fields are skipped."""
        event = {
            "files": [
                {
                    "id": "F01234567",
                    "name": "test.png",
                    # Missing mimetype
                    "size": 1024,
                },
                {
                    "id": "F01234568",
                    "name": "test2.png",
                    "mimetype": "image/png",
                    # Missing size
                },
                {
                    # Missing id
                    "name": "test3.png",
                    "mimetype": "image/png",
                    "size": 1024,
                },
                {
                    "id": "F01234569",
                    # Missing name
                    "mimetype": "image/png",
                    "size": 1024,
                },
                {
                    "id": "F01234570",
                    "name": "test4.png",
                    "mimetype": "image/png",
                    "size": 1024,
                }
            ]
        }
        
        attachments = extract_attachment_metadata(event)
        
        # Only the last attachment should be included (has all required fields)
        assert len(attachments) == 1
        assert attachments[0]["id"] == "F01234570"
    
    def test_extract_without_download_url(self):
        """Test that attachments without download URL are still included."""
        event = {
            "files": [
                {
                    "id": "F01234567",
                    "name": "test.png",
                    "mimetype": "image/png",
                    "size": 1024,
                    # No url_private_download
                }
            ]
        }
        
        attachments = extract_attachment_metadata(event)
        
        assert len(attachments) == 1
        assert attachments[0]["url_private_download"] is None


class TestImageAttachmentDetection:
    """Test image attachment detection."""
    
    def test_image_mimetypes(self):
        """Test that image MIME types are detected correctly."""
        assert is_image_attachment("image/png") is True
        assert is_image_attachment("image/jpeg") is True
        assert is_image_attachment("image/jpg") is True
        assert is_image_attachment("image/gif") is True
        assert is_image_attachment("image/webp") is True
        assert is_image_attachment("image/svg+xml") is True
    
    def test_non_image_mimetypes(self):
        """Test that non-image MIME types return False."""
        assert is_image_attachment("application/pdf") is False
        assert is_image_attachment("text/plain") is False
        assert is_image_attachment("application/json") is False
        assert is_image_attachment("") is False


class TestDocumentAttachmentDetection:
    """Test document attachment detection."""
    
    def test_supported_document_mimetypes(self):
        """Test that supported document MIME types are detected correctly."""
        assert is_document_attachment("application/pdf") is True
        assert is_document_attachment("application/vnd.openxmlformats-officedocument.wordprocessingml.document") is True  # DOCX
        assert is_document_attachment("text/csv") is True
        assert is_document_attachment("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") is True  # XLSX
        assert is_document_attachment("application/vnd.openxmlformats-officedocument.presentationml.presentation") is True  # PPTX
        assert is_document_attachment("text/plain") is True
    
    def test_unsupported_mimetypes(self):
        """Test that unsupported MIME types return False."""
        assert is_document_attachment("image/png") is False
        assert is_document_attachment("application/json") is False
        assert is_document_attachment("video/mp4") is False
        assert is_document_attachment("") is False


class TestAttachmentSizeValidation:
    """Test attachment size validation."""
    
    def test_valid_sizes(self):
        """Test that valid file sizes pass validation."""
        assert validate_attachment_size(1024, 10240) is True
        assert validate_attachment_size(1, 10240) is True
        assert validate_attachment_size(10240, 10240) is True  # Exactly at limit
    
    def test_invalid_sizes(self):
        """Test that invalid file sizes fail validation."""
        assert validate_attachment_size(0, 10240) is False  # Zero size
        assert validate_attachment_size(-1, 10240) is False  # Negative size
        assert validate_attachment_size(10241, 10240) is False  # Exceeds limit
    
    def test_edge_cases(self):
        """Test edge cases for size validation."""
        assert validate_attachment_size(1, 1) is True  # Minimum valid
        assert validate_attachment_size(2, 1) is False  # Exceeds by 1

