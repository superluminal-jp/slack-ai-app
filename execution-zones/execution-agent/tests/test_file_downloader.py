"""
Unit tests for file_downloader (US4 pre-signed URL download).

Tests for download_from_presigned_url:
- Successful download returns bytes
- Content validation (magic bytes for images)
- Content-Type check
- Retry on transient errors (5xx)
- No Authorization header sent
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestDownloadFromPresignedUrl:
    """Tests for download_from_presigned_url."""

    @patch("file_downloader.requests.get")
    def test_successful_download_returns_bytes(self, mock_get):
        """Successful GET returns response content as bytes."""
        mock_get.return_value = MagicMock(
            status_code=200,
            content=b"file content here",
            headers={"Content-Type": "application/pdf"},
        )

        from file_downloader import download_from_presigned_url

        result = download_from_presigned_url(
            presigned_url="https://bucket.s3.region.amazonaws.com/key?X-Amz-Signature=...",
            expected_size=17,
        )

        assert result == b"file content here"
        mock_get.assert_called_once()
        call_kw = mock_get.call_args[1]
        assert call_kw.get("headers", {}).get("Authorization") is None

    @patch("file_downloader.requests.get")
    def test_no_authorization_header_sent(self, mock_get):
        """Pre-signed URL must be used without Authorization header."""
        mock_get.return_value = MagicMock(
            status_code=200,
            content=b"data",
            headers={"Content-Type": "application/octet-stream"},
        )

        from file_downloader import download_from_presigned_url

        download_from_presigned_url(
            presigned_url="https://s3.example.com/key?signature=abc",
            expected_size=4,
        )

        call_args = mock_get.call_args
        headers = call_args[1].get("headers") or {}
        assert "Authorization" not in headers or headers.get("Authorization") is None

    @patch("file_downloader.requests.get")
    def test_content_type_validation(self, mock_get):
        """Content-Type in response can be validated when expected_mimetype provided."""
        mock_get.return_value = MagicMock(
            status_code=200,
            content=b"\x89PNG\r\n\x1a\n" + b"\x00" * 100,
            headers={"Content-Type": "image/png"},
        )

        from file_downloader import download_from_presigned_url

        result = download_from_presigned_url(
            presigned_url="https://s3.example.com/img.png?sig=1",
            expected_size=108,
            expected_mimetype="image/png",
        )

        assert result is not None
        assert len(result) == 108

    @patch("file_downloader.requests.get")
    def test_magic_bytes_validation_for_image(self, mock_get):
        """When expected_mimetype is image/png, content must pass magic bytes check."""
        png_magic = b"\x89PNG\r\n\x1a\n"
        mock_get.return_value = MagicMock(
            status_code=200,
            content=png_magic + b"\x00" * 50,
            headers={"Content-Type": "image/png"},
        )

        from file_downloader import download_from_presigned_url

        result = download_from_presigned_url(
            presigned_url="https://s3.example.com/x.png?sig=1",
            expected_size=len(png_magic) + 50,
            expected_mimetype="image/png",
        )

        assert result is not None
        assert result.startswith(png_magic)

    @patch("file_downloader.requests.get")
    def test_retry_on_5xx_transient_errors(self, mock_get):
        """On 5xx response, implementation should retry with backoff."""
        mock_get.side_effect = [
            MagicMock(status_code=503, content=b"", headers={}),
            MagicMock(status_code=200, content=b"ok", headers={"Content-Type": "text/plain"}),
        ]

        from file_downloader import download_from_presigned_url

        result = download_from_presigned_url(
            presigned_url="https://s3.example.com/key?sig=1",
            expected_size=2,
        )

        assert result == b"ok"
        assert mock_get.call_count >= 2

    @patch("file_downloader.requests.get")
    def test_size_validation_against_expected_size(self, mock_get):
        """When expected_size provided, implementation may validate size (or log)."""
        content = b"small"
        mock_get.return_value = MagicMock(
            status_code=200,
            content=content,
            headers={"Content-Type": "application/octet-stream"},
        )

        from file_downloader import download_from_presigned_url

        result = download_from_presigned_url(
            presigned_url="https://s3.example.com/k?sig=1",
            expected_size=5,
        )

        assert result == content
