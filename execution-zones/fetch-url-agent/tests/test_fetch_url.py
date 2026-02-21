"""
Unit tests for fetch_url tool.
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from tools.fetch_url import _extract_text_from_html, _is_private_ip, fetch_url


class TestFetchUrl:
    """Tests for fetch_url tool."""

    @patch("tools.fetch_url.requests.get")
    @patch("tools.fetch_url._is_private_ip", return_value=False)
    def test_valid_url_returns_text(self, _mock_ip, mock_get):
        """Fetching a valid URL returns extracted text content."""
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": "text/html; charset=utf-8"}
        mock_resp.iter_content.return_value = [
            b"<html><body><p>Hello World</p></body></html>"
        ]
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        result = fetch_url(url="https://example.com")
        assert "Hello World" in result

    @patch("tools.fetch_url.requests.get")
    @patch("tools.fetch_url._is_private_ip", return_value=False)
    def test_html_strips_scripts_and_styles(self, _mock_ip, mock_get):
        """HTML extraction removes script and style tags."""
        html = (
            b"<html><head><style>body{color:red}</style></head>"
            b"<body><script>alert(1)</script><p>Content</p>"
            b"<nav>Nav</nav></body></html>"
        )
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": "text/html"}
        mock_resp.iter_content.return_value = [html]
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        result = fetch_url(url="https://example.com")
        assert "Content" in result
        assert "alert" not in result
        assert "color:red" not in result
        assert "Nav" not in result

    @patch("tools.fetch_url.requests.get")
    @patch("tools.fetch_url._is_private_ip", return_value=False)
    def test_plain_text_returned_directly(self, _mock_ip, mock_get):
        """Non-HTML content is returned as-is."""
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": "text/plain"}
        mock_resp.iter_content.return_value = [b"Plain text content"]
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        result = fetch_url(url="https://example.com/file.txt")
        assert result == "Plain text content"

    @patch("tools.fetch_url.socket.getaddrinfo")
    def test_private_ip_blocked_127(self, mock_getaddr):
        """Blocks access to loopback addresses."""
        mock_getaddr.return_value = [(None, None, None, None, ("127.0.0.1", 80))]
        result = fetch_url(url="https://localhost/secret")
        assert "ブロック" in result

    @patch("tools.fetch_url.socket.getaddrinfo")
    def test_private_ip_blocked_10(self, mock_getaddr):
        """Blocks access to 10.x.x.x private range."""
        mock_getaddr.return_value = [(None, None, None, None, ("10.0.0.1", 80))]
        result = fetch_url(url="https://internal.corp/data")
        assert "ブロック" in result

    @patch("tools.fetch_url.socket.getaddrinfo")
    def test_private_ip_blocked_192(self, mock_getaddr):
        """Blocks access to 192.168.x.x private range."""
        mock_getaddr.return_value = [(None, None, None, None, ("192.168.1.1", 80))]
        result = fetch_url(url="https://router.local/admin")
        assert "ブロック" in result

    def test_invalid_scheme_file(self):
        """Rejects file:// URLs."""
        result = fetch_url(url="file:///etc/passwd")
        assert "サポートされていない" in result

    def test_invalid_scheme_ftp(self):
        """Rejects ftp:// URLs."""
        result = fetch_url(url="ftp://files.example.com/data")
        assert "サポートされていない" in result

    @patch("tools.fetch_url.requests.get")
    @patch("tools.fetch_url._is_private_ip", return_value=False)
    def test_timeout_returns_error(self, _mock_ip, mock_get):
        """Timeout produces a descriptive error message."""
        import requests as req

        mock_get.side_effect = req.exceptions.Timeout()
        result = fetch_url(url="https://slow.example.com")
        assert "タイムアウト" in result

    @patch("tools.fetch_url.requests.get")
    @patch("tools.fetch_url._is_private_ip", return_value=False)
    def test_large_content_truncated(self, _mock_ip, mock_get):
        """Content exceeding _MAX_RETURN_CHARS is truncated."""
        big_text = "A" * 20_000
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": "text/plain"}
        mock_resp.iter_content.return_value = [big_text.encode()]
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        result = fetch_url(url="https://example.com/big")
        assert len(result) < 20_000
        assert "省略" in result

    def test_empty_url_returns_error(self):
        """Empty URL returns an error message."""
        result = fetch_url(url="")
        assert "URL" in result

    def test_none_url_returns_error(self):
        """None URL returns an error message."""
        result = fetch_url(url=None)
        assert "URL" in result

    @patch("tools.fetch_url.requests.get")
    @patch("tools.fetch_url._is_private_ip", return_value=False)
    def test_http_error_reports_status(self, _mock_ip, mock_get):
        """HTTP error status codes are reported."""
        import requests as req

        http_error = req.exceptions.HTTPError(response=MagicMock(status_code=404))
        mock_get.return_value.raise_for_status.side_effect = http_error
        mock_get.side_effect = None
        # Need to re-mock properly
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = http_error
        mock_get.return_value = mock_resp

        result = fetch_url(url="https://example.com/missing")
        assert "404" in result


class TestExtractTextFromHtml:
    """Tests for HTML text extraction helper."""

    def test_strips_tags(self):
        """Extracts text and strips HTML tags."""
        html = "<html><body><h1>Title</h1><p>Body text</p></body></html>"
        text = _extract_text_from_html(html)
        assert "Title" in text
        assert "Body text" in text
        assert "<h1>" not in text

    def test_removes_scripts(self):
        """Removes script content from extraction."""
        html = "<body><script>var x = 1;</script><p>Visible</p></body>"
        text = _extract_text_from_html(html)
        assert "Visible" in text
        assert "var x" not in text


class TestIsPrivateIp:
    """Tests for SSRF IP validation helper."""

    @patch("tools.fetch_url.socket.getaddrinfo")
    def test_public_ip_allowed(self, mock_getaddr):
        """Public IPs are not blocked."""
        mock_getaddr.return_value = [(None, None, None, None, ("93.184.216.34", 80))]
        assert _is_private_ip("example.com") is False

    @patch("tools.fetch_url.socket.getaddrinfo")
    def test_dns_failure_blocked(self, mock_getaddr):
        """DNS resolution failure blocks the request."""
        import socket as sock

        mock_getaddr.side_effect = sock.gaierror("DNS failed")
        assert _is_private_ip("nonexistent.invalid") is True
