"""
Unit tests for file downloader module.

Tests file download functionality from Slack CDN.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import requests
from requests.exceptions import Timeout, RequestException

# Import module to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from file_downloader import (
    get_file_download_url,
    download_file,
    validate_image_content,
    _calculate_backoff_delay,
)


class TestBackoffDelayCalculation:
    """Test exponential backoff delay calculation."""
    
    def test_backoff_delay_increases(self):
        """Test that delay increases with attempt number."""
        delay_0 = _calculate_backoff_delay(0)
        delay_1 = _calculate_backoff_delay(1)
        delay_2 = _calculate_backoff_delay(2)
        
        assert delay_1 > delay_0
        assert delay_2 > delay_1
    
    def test_backoff_delay_has_jitter(self):
        """Test that delay includes random jitter."""
        # Run multiple times to check for jitter variation
        delays = [_calculate_backoff_delay(1) for _ in range(10)]
        # All delays should be within expected range (not all identical)
        assert len(set(delays)) > 1  # At least some variation due to jitter
    
    def test_backoff_delay_capped(self):
        """Test that delay is capped at maximum."""
        delay = _calculate_backoff_delay(100)  # Very large attempt number
        assert delay <= 30.0  # MAX_DELAY_SECONDS


class TestGetFileDownloadUrl:
    """Test getting file download URL from files.info API."""
    
    @patch('file_downloader.requests.get')
    def test_successful_url_retrieval(self, mock_get):
        """Test successful retrieval of download URL."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "ok": True,
            "file": {
                "id": "F01234567",
                "url_private_download": "https://files.slack.com/files-pri/.../download",
            }
        }
        mock_get.return_value = mock_response
        
        url = get_file_download_url("F01234567", "xoxb-token")
        
        assert url == "https://files.slack.com/files-pri/.../download"
        mock_get.assert_called_once()
    
    @patch('file_downloader.requests.get')
    def test_fallback_to_url_private(self, mock_get):
        """Test fallback to url_private when url_private_download is missing."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "ok": True,
            "file": {
                "id": "F01234567",
                "url_private": "https://files.slack.com/files-pri/...",
            }
        }
        mock_get.return_value = mock_response
        
        url = get_file_download_url("F01234567", "xoxb-token")
        
        assert url == "https://files.slack.com/files-pri/..."
    
    @patch('file_downloader.requests.get')
    def test_api_error_not_retryable(self, mock_get):
        """Test that non-retryable errors return None immediately."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "ok": False,
            "error": "file_not_found",
        }
        mock_get.return_value = mock_response
        
        url = get_file_download_url("F01234567", "xoxb-token")
        
        assert url is None
    
    @patch('file_downloader.requests.get')
    def test_rate_limiting_429(self, mock_get):
        """Test handling of rate limiting (429) with Retry-After header."""
        # First call: 429 with Retry-After
        mock_response_429 = Mock()
        mock_response_429.status_code = 429
        mock_response_429.headers.get.return_value = "2"
        
        # Second call: success
        mock_response_200 = Mock()
        mock_response_200.status_code = 200
        mock_response_200.json.return_value = {
            "ok": True,
            "file": {
                "id": "F01234567",
                "url_private_download": "https://files.slack.com/files-pri/.../download",
            }
        }
        
        mock_get.side_effect = [mock_response_429, mock_response_200]
        
        with patch('file_downloader.time.sleep'):  # Mock sleep to speed up test
            url = get_file_download_url("F01234567", "xoxb-token")
        
        assert url == "https://files.slack.com/files-pri/.../download"
        assert mock_get.call_count == 2
    
    @patch('file_downloader.requests.get')
    def test_timeout_retry(self, mock_get):
        """Test retry on timeout."""
        mock_get.side_effect = Timeout("Connection timeout")
        
        with patch('file_downloader.time.sleep'):  # Mock sleep
            url = get_file_download_url("F01234567", "xoxb-token", max_retries=2)
        
        assert url is None
        assert mock_get.call_count == 2
    
    def test_missing_parameters(self):
        """Test that missing parameters return None."""
        assert get_file_download_url("", "xoxb-token") is None
        assert get_file_download_url("F01234567", "") is None
        assert get_file_download_url(None, "xoxb-token") is None


class TestValidateImageContent:
    """Test image content validation."""
    
    def test_valid_png(self):
        """Test validation of valid PNG image."""
        png_bytes = b'\x89PNG\r\n\x1a\n' + b'x' * 100
        is_valid, error = validate_image_content(png_bytes, "image/png")
        assert is_valid is True
        assert error == ""
    
    def test_invalid_png(self):
        """Test validation of invalid PNG image."""
        invalid_bytes = b'NOT A PNG' + b'x' * 100
        is_valid, error = validate_image_content(invalid_bytes, "image/png")
        assert is_valid is False
        assert "PNG" in error
    
    def test_valid_jpeg(self):
        """Test validation of valid JPEG image."""
        jpeg_bytes = b'\xff\xd8\xff' + b'x' * 100
        is_valid, error = validate_image_content(jpeg_bytes, "image/jpeg")
        assert is_valid is True
        assert error == ""
    
    def test_invalid_jpeg(self):
        """Test validation of invalid JPEG image."""
        invalid_bytes = b'NOT A JPEG' + b'x' * 100
        is_valid, error = validate_image_content(invalid_bytes, "image/jpeg")
        assert is_valid is False
        assert "JPEG" in error
    
    def test_valid_gif(self):
        """Test validation of valid GIF image."""
        gif_bytes = b'GIF87a' + b'x' * 100
        is_valid, error = validate_image_content(gif_bytes, "image/gif")
        assert is_valid is True
        assert error == ""
    
    def test_html_error_page(self):
        """Test detection of HTML error pages."""
        html_bytes = b'<!DOCTYPE html><html>Error page</html>'
        is_valid, error = validate_image_content(html_bytes, "image/png")
        assert is_valid is False
        assert "HTML" in error
    
    def test_json_error_response(self):
        """Test detection of JSON error responses."""
        json_bytes = b'{"error": "something went wrong"}'
        is_valid, error = validate_image_content(json_bytes, "image/png")
        assert is_valid is False
        assert "JSON" in error
    
    def test_content_too_small(self):
        """Test that content too small fails validation."""
        small_bytes = b'x' * 5
        is_valid, error = validate_image_content(small_bytes, "image/png")
        assert is_valid is False
        assert "too small" in error


class TestDownloadFile:
    """Test file download functionality."""
    
    @patch('file_downloader.requests.get')
    def test_successful_download(self, mock_get):
        """Test successful file download."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.headers.get.return_value = "image/png"
        mock_response.content = b'PNG image data'
        mock_get.return_value = mock_response
        
        content = download_file("https://files.slack.com/...", "xoxb-token")
        
        assert content == b'PNG image data'
        mock_get.assert_called_once()
    
    @patch('file_downloader.requests.get')
    def test_rate_limiting_429(self, mock_get):
        """Test handling of rate limiting during download."""
        # First call: 429
        mock_response_429 = Mock()
        mock_response_429.status_code = 429
        mock_response_429.headers.get.return_value = "2"
        
        # Second call: success
        mock_response_200 = Mock()
        mock_response_200.status_code = 200
        mock_response_200.headers.get.return_value = "image/png"
        mock_response_200.content = b'PNG image data'
        
        mock_get.side_effect = [mock_response_429, mock_response_200]
        
        with patch('file_downloader.time.sleep'):
            content = download_file("https://files.slack.com/...", "xoxb-token", max_retries=2)
        
        assert content == b'PNG image data'
        assert mock_get.call_count == 2
    
    @patch('file_downloader.requests.get')
    def test_client_error_4xx(self, mock_get):
        """Test that 4xx errors (except 429) return None without retry."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        content = download_file("https://files.slack.com/...", "xoxb-token")
        
        assert content is None
        mock_get.assert_called_once()  # No retry for 4xx
    
    @patch('file_downloader.requests.get')
    def test_server_error_5xx_retry(self, mock_get):
        """Test that 5xx errors trigger retry."""
        # First call: 500
        mock_response_500 = Mock()
        mock_response_500.status_code = 500
        
        # Second call: success
        mock_response_200 = Mock()
        mock_response_200.status_code = 200
        mock_response_200.headers.get.return_value = "image/png"
        mock_response_200.content = b'PNG image data'
        
        mock_get.side_effect = [mock_response_500, mock_response_200]
        
        with patch('file_downloader.time.sleep'):
            content = download_file("https://files.slack.com/...", "xoxb-token", max_retries=2)
        
        assert content == b'PNG image data'
        assert mock_get.call_count == 2
    
    @patch('file_downloader.requests.get')
    def test_timeout_retry(self, mock_get):
        """Test retry on timeout."""
        mock_get.side_effect = Timeout("Connection timeout")
        
        with patch('file_downloader.time.sleep'):
            content = download_file("https://files.slack.com/...", "xoxb-token", max_retries=2)
        
        assert content is None
        assert mock_get.call_count == 2
    
    @patch('file_downloader.requests.get')
    def test_wrong_content_type_detection(self, mock_get):
        """Test detection of wrong content type (HTML instead of image)."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.headers.get.return_value = "text/html"
        mock_response.content = b'<html>Error page</html>'
        mock_get.return_value = mock_response
        
        content = download_file(
            "https://files.slack.com/...",
            "xoxb-token",
            expected_mimetype="image/png"
        )
        
        assert content is None  # Should fail validation
    
    def test_missing_parameters(self):
        """Test that missing parameters return None."""
        assert download_file("", "xoxb-token") is None
        assert download_file("https://files.slack.com/...", "") is None
        assert download_file(None, "xoxb-token") is None

