"""
Unit tests for attachment_processor (US4 presigned_url path).

Tests:
- presigned_url field detection in attachment metadata
- Download from pre-signed URL when presigned_url present
- Fallback to Slack download when presigned_url absent (backward compatibility)
- No bot_token required when using pre-signed URL
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestAttachmentProcessorPresignedUrl:
    """Tests for presigned_url handling in process_attachments."""

    @patch("attachment_processor.download_from_presigned_url")
    def test_uses_presigned_url_when_present(self, mock_download_presigned):
        """When attachment has presigned_url, must call download_from_presigned_url (no bot_token)."""
        # Use valid PNG magic bytes so image path succeeds
        mock_download_presigned.return_value = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F1",
                "name": "img.png",
                "mimetype": "image/png",
                "size": 108,
                "presigned_url": "https://bucket.s3.amazonaws.com/key?X-Amz-Signature=...",
            },
        ]

        result = process_attachments(
            attachments=attachments,
            bot_token="",  # Not required when presigned_url present
            correlation_id="corr-1",
        )

        mock_download_presigned.assert_called_once()
        call_args = mock_download_presigned.call_args
        assert call_args[0][0] == "https://bucket.s3.amazonaws.com/key?X-Amz-Signature=..."
        assert call_args[1].get("expected_size") == 108

        assert len(result) >= 1
        success = [r for r in result if r.get("processing_status") == "success"]
        assert len(success) == 1
        assert success[0].get("content") == (b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

    @patch("attachment_processor.download_file")
    @patch("attachment_processor.get_file_download_url")
    def test_fallback_to_slack_download_when_presigned_url_absent(
        self, mock_get_url, mock_download_file
    ):
        """When presigned_url is absent, must fall back to Slack (get_file_download_url + download_file)."""
        mock_get_url.return_value = "https://files.slack.com/private/..."
        mock_download_file.return_value = b"downloaded from slack"

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F2",
                "name": "image.png",
                "mimetype": "image/png",
                "size": 100,
                "url_private_download": "https://files.slack.com/old",
                # no presigned_url -> backward compatibility path
            },
        ]

        result = process_attachments(
            attachments=attachments,
            bot_token="xoxb-required-for-slack",
            correlation_id="corr-2",
        )

        mock_get_url.assert_called_once_with("F2", "xoxb-required-for-slack")
        mock_download_file.assert_called_once()
        assert len(result) >= 1
        success = [r for r in result if r.get("processing_status") == "success"]
        assert len(success) == 1

    @patch("attachment_processor.download_from_presigned_url")
    def test_presigned_url_field_detection(self, mock_download_presigned):
        """Attachments with presigned_url key are detected and use S3 path."""
        mock_download_presigned.return_value = b"content"

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F3",
                "name": "f.txt",
                "mimetype": "text/plain",
                "size": 7,
                "presigned_url": "https://s3.example.com/k?sig=1",
            },
        ]

        process_attachments(attachments=attachments, bot_token="", correlation_id="c3")

        mock_download_presigned.assert_called_once_with(
            "https://s3.example.com/k?sig=1",
            expected_size=7,
            expected_mimetype=None,
            correlation_id="c3",
        )

    @patch("attachment_processor.download_from_presigned_url")
    def test_no_bot_token_required_when_all_attachments_have_presigned_url(
        self, mock_download_presigned
    ):
        """When all attachments have presigned_url, bot_token can be empty."""
        # Use image so we get success without document extraction
        mock_download_presigned.return_value = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F4",
                "name": "a.png",
                "mimetype": "image/png",
                "size": 58,
                "presigned_url": "https://s3.example.com/a?sig=1",
            },
        ]

        result = process_attachments(
            attachments=attachments,
            bot_token="",  # No token needed
            correlation_id="c4",
        )

        assert mock_download_presigned.called
        success = [r for r in result if r.get("processing_status") == "success"]
        assert len(success) == 1


class TestDocumentQaFlowUs1:
    """Integration tests for document Q&A (US1): native blocks, PPTX fallback, errors."""

    @patch("attachment_processor.download_from_presigned_url")
    @patch("attachment_processor.extract_text_from_pdf")
    def test_document_pdf_with_presigned_url_includes_document_bytes_for_native(
        self, mock_extract_pdf, mock_download
    ):
        """Document (PDF) with presigned_url should have document_bytes and document_format for native block."""
        mock_download.return_value = b"%PDF-1.4 minimal"
        mock_extract_pdf.return_value = "Extracted text"

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F1",
                "name": "report.pdf",
                "mimetype": "application/pdf",
                "size": 20,
                "presigned_url": "https://s3.example.com/k?sig=1",
            },
        ]
        result = process_attachments(attachments=attachments, bot_token="", correlation_id="c1")

        success = [r for r in result if r.get("processing_status") == "success" and r.get("content_type") == "document"]
        assert len(success) == 1
        # Native document path: must include document_bytes and document_format for Bedrock
        assert success[0].get("document_bytes") == b"%PDF-1.4 minimal"
        assert success[0].get("document_format") == "pdf"

    @patch("attachment_processor.download_from_presigned_url")
    @patch("attachment_processor.extract_text_from_pptx")
    def test_pptx_uses_text_extraction_fallback_no_native_block(self, mock_extract_pptx, mock_download):
        """PPTX is not native; result has content (text) only, no document_bytes."""
        mock_download.return_value = b"PK\x03\x04" + b"\x00" * 100
        mock_extract_pptx.return_value = "Slide 1 text"

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F2",
                "name": "deck.pptx",
                "mimetype": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "size": 104,
                "presigned_url": "https://s3.example.com/k?sig=2",
            },
        ]
        result = process_attachments(attachments=attachments, bot_token="", correlation_id="c2")

        success = [r for r in result if r.get("processing_status") == "success" and r.get("content_type") == "document"]
        assert len(success) == 1
        assert success[0].get("content") == "Slide 1 text"
        # PPTX: no native document block
        assert success[0].get("document_bytes") is None

    def test_document_exceeding_5mb_returns_clear_error_fr006(self):
        """File exceeding 5 MB document limit must return clear error (FR-006)."""
        from attachment_processor import process_attachments

        over_5mb = 5 * 1024 * 1024 + 1
        attachments = [
            {
                "id": "F3",
                "name": "huge.pdf",
                "mimetype": "application/pdf",
                "size": over_5mb,
                "presigned_url": "https://s3.example.com/k?sig=3",
            },
        ]
        result = process_attachments(attachments=attachments, bot_token="", correlation_id="c3")

        failed = [r for r in result if r.get("processing_status") == "failed"]
        assert len(failed) == 1
        assert failed[0].get("error_code") == "file_too_large"
        assert "5" in failed[0].get("error_message", "") or "size" in failed[0].get("error_message", "").lower()

    @patch("attachment_processor.download_from_presigned_url")
    @patch("attachment_processor.extract_text_from_pdf")
    def test_corrupted_document_returns_user_friendly_error_fr013(self, mock_extract_pdf, mock_download):
        """Corrupted/unreadable document must return user-friendly error (FR-013)."""
        mock_download.return_value = b"not a valid pdf"
        mock_extract_pdf.return_value = None

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F4",
                "name": "bad.pdf",
                "mimetype": "application/pdf",
                "size": 14,
                "presigned_url": "https://s3.example.com/k?sig=4",
            },
        ]
        result = process_attachments(attachments=attachments, bot_token="", correlation_id="c4")

        failed = [r for r in result if r.get("processing_status") == "failed"]
        assert len(failed) == 1
        assert failed[0].get("error_code") == "extraction_failed"
        assert failed[0].get("error_message")


class TestImageProcessingViaS3Us2:
    """Integration tests for image processing via S3 (US2): presigned_url, magic bytes, limits."""

    @patch("attachment_processor.download_from_presigned_url")
    def test_image_with_presigned_url_downloads_correctly(self, mock_download):
        """Image attachment with presigned_url downloads and is returned as image content."""
        png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
        mock_download.return_value = png_bytes

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F1",
                "name": "chart.png",
                "mimetype": "image/png",
                "size": 208,
                "presigned_url": "https://bucket.s3.amazonaws.com/attachments/corr/img?X-Amz-Signature=...",
            },
        ]
        result = process_attachments(
            attachments=attachments,
            bot_token="",
            correlation_id="corr-1",
        )

        mock_download.assert_called_once()
        call_kw = mock_download.call_args[1]
        assert call_kw.get("expected_size") == 208
        assert call_kw.get("expected_mimetype") == "image/png"

        success = [r for r in result if r.get("processing_status") == "success"]
        assert len(success) == 1
        assert success[0].get("content_type") == "image"
        assert success[0].get("content") == png_bytes
        assert success[0].get("document_bytes") is None

    @patch("file_downloader.requests.get")
    def test_image_bytes_validated_via_magic_bytes(self, mock_get):
        """Image content is validated via magic bytes (in download_from_presigned_url); invalid bytes cause failure."""
        resp = MagicMock()
        resp.status_code = 200
        resp.content = b"not a valid image"
        resp.raise_for_status = MagicMock()
        mock_get.return_value = resp

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F2",
                "name": "fake.png",
                "mimetype": "image/png",
                "size": 17,
                "presigned_url": "https://s3.example.com/k?sig=1",
            },
        ]
        result = process_attachments(
            attachments=attachments,
            bot_token="",
            correlation_id="corr-2",
        )

        failed = [r for r in result if r.get("processing_status") == "failed"]
        assert len(failed) == 1
        assert failed[0].get("error_code") == "download_failed"
        assert failed[0].get("content_type") == "image"

    @patch("attachment_processor.download_from_presigned_url")
    def test_image_exceeding_10mb_returns_clear_error_fr006(self, mock_download):
        """Image exceeding 10 MB returns clear error (FR-006)."""
        mock_download.return_value = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100

        from attachment_processor import process_attachments

        over_10mb = 10 * 1024 * 1024 + 1
        attachments = [
            {
                "id": "F3",
                "name": "huge.png",
                "mimetype": "image/png",
                "size": over_10mb,
                "presigned_url": "https://s3.example.com/k?sig=2",
            },
        ]
        result = process_attachments(
            attachments=attachments,
            bot_token="",
            correlation_id="corr-3",
        )

        failed = [r for r in result if r.get("processing_status") == "failed"]
        assert len(failed) == 1
        assert failed[0].get("error_code") == "file_too_large"
        msg = failed[0].get("error_message", "")
        assert "10" in msg or "size" in msg.lower()

    @patch("attachment_processor.download_from_presigned_url")
    def test_unsupported_image_format_returns_error_with_supported_list(
        self, mock_download
    ):
        """Unsupported image format (e.g. BMP) returns error listing supported formats."""
        mock_download.return_value = b"BM\x00\x00" + b"\x00" * 50

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F4",
                "name": "photo.bmp",
                "mimetype": "image/bmp",
                "size": 54,
                "presigned_url": "https://s3.example.com/k?sig=3",
            },
        ]
        result = process_attachments(
            attachments=attachments,
            bot_token="",
            correlation_id="corr-4",
        )

        failed = [r for r in result if r.get("processing_status") == "failed"]
        assert len(failed) == 1
        assert failed[0].get("error_code") == "unsupported_image_type"
        msg = failed[0].get("error_message", "")
        assert "PNG" in msg and "JPEG" in msg and "GIF" in msg and "WebP" in msg

    @patch("attachment_processor.download_from_presigned_url")
    def test_image_content_passed_as_image_block_not_document(self, mock_download):
        """Success image result has content_type image and raw bytes; no document block."""
        jpeg_bytes = b"\xff\xd8\xff" + b"\x00" * 500
        mock_download.return_value = jpeg_bytes

        from attachment_processor import process_attachments

        attachments = [
            {
                "id": "F5",
                "name": "photo.jpg",
                "mimetype": "image/jpeg",
                "size": 503,
                "presigned_url": "https://s3.example.com/k?sig=4",
            },
        ]
        result = process_attachments(
            attachments=attachments,
            bot_token="",
            correlation_id="corr-5",
        )

        success = [r for r in result if r.get("processing_status") == "success"]
        assert len(success) == 1
        assert success[0].get("content_type") == "image"
        assert success[0].get("content") == jpeg_bytes
        assert success[0].get("document_bytes") is None
        assert success[0].get("document_format") is None
