"""
Unit tests for attachment processor module.

Tests attachment processing orchestration.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock

# Import module to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from attachment_processor import (
    process_attachments,
    is_image_attachment,
    is_supported_image_type,
    is_document_attachment,
    validate_attachment_size,
    get_processing_summary,
    MAX_IMAGE_SIZE,
    MAX_DOCUMENT_SIZE,
)


class TestImageAttachmentDetection:
    """Test image attachment detection."""
    
    def test_supported_image_types(self):
        """Test that supported image types are detected."""
        assert is_supported_image_type("image/png") is True
        assert is_supported_image_type("image/jpeg") is True
        assert is_supported_image_type("image/jpg") is True
        assert is_supported_image_type("image/gif") is True
        assert is_supported_image_type("image/webp") is True
    
    def test_unsupported_image_types(self):
        """Test that unsupported image types return False."""
        assert is_supported_image_type("image/svg+xml") is False
        assert is_supported_image_type("image/bmp") is False
    
    def test_is_image_attachment(self):
        """Test general image attachment detection."""
        assert is_image_attachment("image/png") is True
        assert is_image_attachment("image/anything") is True
        assert is_image_attachment("application/pdf") is False


class TestDocumentAttachmentDetection:
    """Test document attachment detection."""
    
    def test_supported_document_types(self):
        """Test that supported document types are detected."""
        assert is_document_attachment("application/pdf") is True
        assert is_document_attachment("application/vnd.openxmlformats-officedocument.wordprocessingml.document") is True  # DOCX
        assert is_document_attachment("text/csv") is True
        assert is_document_attachment("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") is True  # XLSX
        assert is_document_attachment("application/vnd.openxmlformats-officedocument.presentationml.presentation") is True  # PPTX
        assert is_document_attachment("text/plain") is True
    
    def test_unsupported_types(self):
        """Test that unsupported types return False."""
        assert is_document_attachment("image/png") is False
        assert is_document_attachment("application/json") is False


class TestSizeValidation:
    """Test attachment size validation."""
    
    def test_image_size_validation(self):
        """Test image size validation."""
        assert validate_attachment_size(1024, MAX_IMAGE_SIZE) is True
        assert validate_attachment_size(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE) is True
        assert validate_attachment_size(MAX_IMAGE_SIZE + 1, MAX_IMAGE_SIZE) is False
        assert validate_attachment_size(0, MAX_IMAGE_SIZE) is False
    
    def test_document_size_validation(self):
        """Test document size validation."""
        assert validate_attachment_size(1024, MAX_DOCUMENT_SIZE) is True
        assert validate_attachment_size(MAX_DOCUMENT_SIZE, MAX_DOCUMENT_SIZE) is True
        assert validate_attachment_size(MAX_DOCUMENT_SIZE + 1, MAX_DOCUMENT_SIZE) is False


class TestProcessAttachments:
    """Test attachment processing orchestration."""
    
    @patch('attachment_processor.download_file')
    @patch('attachment_processor.get_file_download_url')
    def test_process_image_attachment_success(self, mock_get_url, mock_download):
        """Test successful image attachment processing."""
        mock_get_url.return_value = "https://files.slack.com/..."
        mock_download.return_value = b'PNG image data'
        
        attachments = [
            {
                "id": "F01234567",
                "name": "test.png",
                "mimetype": "image/png",
                "size": 1024,
                "url_private_download": "https://files.slack.com/...",
            }
        ]
        
        result = process_attachments(attachments, "xoxb-token")
        
        assert len(result) == 1
        assert result[0]["processing_status"] == "success"
        assert result[0]["content_type"] == "image"
        assert result[0]["content"] == b'PNG image data'
    
    @patch('attachment_processor.download_file')
    @patch('attachment_processor.get_file_download_url')
    def test_process_document_attachment_success(self, mock_get_url, mock_download):
        """Test successful document attachment processing."""
        mock_get_url.return_value = "https://files.slack.com/..."
        mock_download.return_value = b'PDF content'
        
        with patch('attachment_processor.extract_text_from_pdf') as mock_extract:
            mock_extract.return_value = "Extracted PDF text"
            
            attachments = [
                {
                    "id": "F01234567",
                    "name": "document.pdf",
                    "mimetype": "application/pdf",
                    "size": 2048,
                    "url_private_download": "https://files.slack.com/...",
                }
            ]
            
            result = process_attachments(attachments, "xoxb-token")
            
            assert len(result) == 1
            assert result[0]["processing_status"] == "success"
            assert result[0]["content_type"] == "document"
            assert result[0]["content"] == "Extracted PDF text"
    
    @patch('attachment_processor.get_file_download_url')
    def test_process_attachment_size_exceeded(self, mock_get_url):
        """Test attachment processing with size exceeded."""
        attachments = [
            {
                "id": "F01234567",
                "name": "large.png",
                "mimetype": "image/png",
                "size": MAX_IMAGE_SIZE + 1,  # Exceeds limit
                "url_private_download": "https://files.slack.com/...",
            }
        ]
        
        result = process_attachments(attachments, "xoxb-token")
        
        assert len(result) == 1
        assert result[0]["processing_status"] == "failed"
        assert result[0]["error_code"] == "file_too_large"
    
    @patch('attachment_processor.get_file_download_url')
    def test_process_attachment_unsupported_type(self, mock_get_url):
        """Test attachment processing with unsupported type."""
        attachments = [
            {
                "id": "F01234567",
                "name": "video.mp4",
                "mimetype": "video/mp4",
                "size": 1024,
                "url_private_download": "https://files.slack.com/...",
            }
        ]
        
        result = process_attachments(attachments, "xoxb-token")
        
        assert len(result) == 1
        assert result[0]["processing_status"] == "skipped"
        assert result[0]["error_code"] == "unsupported_type"
    
    @patch('attachment_processor.get_file_download_url')
    def test_process_attachment_no_download_url(self, mock_get_url):
        """Test attachment processing when download URL is unavailable."""
        mock_get_url.return_value = None  # files.info failed
        
        attachments = [
            {
                "id": "F01234567",
                "name": "test.png",
                "mimetype": "image/png",
                "size": 1024,
                # No url_private_download in event
            }
        ]
        
        result = process_attachments(attachments, "xoxb-token")
        
        assert len(result) == 1
        assert result[0]["processing_status"] == "failed"
        assert result[0]["error_code"] == "url_not_available"
    
    @patch('attachment_processor.download_file')
    @patch('attachment_processor.get_file_download_url')
    def test_process_attachment_download_failed(self, mock_get_url, mock_download):
        """Test attachment processing when download fails."""
        mock_get_url.return_value = "https://files.slack.com/..."
        mock_download.return_value = None  # Download failed
        
        attachments = [
            {
                "id": "F01234567",
                "name": "test.png",
                "mimetype": "image/png",
                "size": 1024,
                "url_private_download": "https://files.slack.com/...",
            }
        ]
        
        result = process_attachments(attachments, "xoxb-token")
        
        assert len(result) == 1
        assert result[0]["processing_status"] == "failed"
        assert result[0]["error_code"] == "download_failed"
    
    @patch('attachment_processor.download_file')
    @patch('attachment_processor.get_file_download_url')
    def test_process_multiple_attachments(self, mock_get_url, mock_download):
        """Test processing multiple attachments."""
        mock_get_url.return_value = "https://files.slack.com/..."
        mock_download.return_value = b'file content'
        
        attachments = [
            {
                "id": "F01234567",
                "name": "image1.png",
                "mimetype": "image/png",
                "size": 1024,
                "url_private_download": "https://files.slack.com/...",
            },
            {
                "id": "F01234568",
                "name": "image2.png",
                "mimetype": "image/png",
                "size": 2048,
                "url_private_download": "https://files.slack.com/...",
            }
        ]
        
        result = process_attachments(attachments, "xoxb-token")
        
        assert len(result) == 2
        assert all(r["processing_status"] == "success" for r in result)
    
    @patch('attachment_processor.download_file')
    @patch('attachment_processor.get_file_download_url')
    def test_process_pptx_with_slides(self, mock_get_url, mock_download):
        """Test PPTX processing with slide image conversion."""
        mock_get_url.return_value = "https://files.slack.com/..."
        mock_download.return_value = b'PPTX content'
        
        with patch('attachment_processor.extract_text_from_pptx') as mock_extract_text, \
             patch('attachment_processor.convert_pptx_slides_to_images') as mock_convert:
            mock_extract_text.return_value = "Slide text"
            mock_convert.return_value = [b'slide1.png', b'slide2.png']
            
            attachments = [
                {
                    "id": "F01234567",
                    "name": "presentation.pptx",
                    "mimetype": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    "size": 2048,
                    "url_private_download": "https://files.slack.com/...",
                }
            ]
            
            result = process_attachments(attachments, "xoxb-token")
            
            # Should have: 2 slide images + 1 text document = 3 results
            assert len(result) == 3
            # Check slide images
            slide_images = [r for r in result if r["file_id"].endswith("_slide_1") or r["file_id"].endswith("_slide_2")]
            assert len(slide_images) == 2
            # Check text document
            text_docs = [r for r in result if r["content_type"] == "document"]
            assert len(text_docs) == 1


class TestProcessingSummary:
    """Test processing summary generation."""
    
    def test_summary_all_success(self):
        """Test summary with all successful attachments."""
        processed = [
            {"processing_status": "success", "content_type": "image"},
            {"processing_status": "success", "content_type": "document"},
        ]
        
        summary = get_processing_summary(processed)
        
        assert summary["total"] == 2
        assert summary["success"] == 2
        assert summary["failed"] == 0
        assert summary["skipped"] == 0
    
    def test_summary_mixed_results(self):
        """Test summary with mixed success/failure."""
        processed = [
            {"processing_status": "success", "content_type": "image"},
            {"processing_status": "failed", "error_code": "download_failed"},
            {"processing_status": "skipped", "error_code": "unsupported_type"},
        ]
        
        summary = get_processing_summary(processed)
        
        assert summary["total"] == 3
        assert summary["success"] == 1
        assert summary["failed"] == 1
        assert summary["skipped"] == 1
        assert "download_failed" in summary["failure_codes"]
    
    def test_summary_has_images_and_documents(self):
        """Test summary flags for images and documents."""
        processed = [
            {"processing_status": "success", "content_type": "image"},
            {"processing_status": "success", "content_type": "document"},
        ]
        
        summary = get_processing_summary(processed)
        
        assert summary["has_images"] is True
        assert summary["has_documents"] is True

