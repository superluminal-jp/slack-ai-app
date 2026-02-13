"""
Unit tests for Execution Agent file_config.py (014 file limits).

Tests:
- Default values for max size and allowed MIME types
- Environment variable override
- is_allowed_mime and is_within_size_limit validation helpers
"""

import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import file_config as fc


class TestDefaultValues:
    """Default values when env is not set."""

    def test_get_max_file_size_bytes_default(self):
        with patch.dict(os.environ, {}, clear=False):
            if "MAX_FILE_SIZE_BYTES" in os.environ:
                del os.environ["MAX_FILE_SIZE_BYTES"]
            assert fc.get_max_file_size_bytes() == 10 * 1024 * 1024  # 027: 10 MB default

    def test_get_allowed_mime_types_default(self):
        with patch.dict(os.environ, {}, clear=False):
            if "ALLOWED_MIME_TYPES" in os.environ:
                del os.environ["ALLOWED_MIME_TYPES"]
            assert fc.get_allowed_mime_types() == [
                "text/csv",
                "application/json",
                "text/plain",
                "text/markdown",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "image/png",
            ]


class TestEnvOverride:
    """Environment variable overrides."""

    def test_max_file_size_bytes_from_env(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "1000"}):
            assert fc.get_max_file_size_bytes() == 1000

    def test_max_file_size_bytes_invalid_fallback(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "invalid"}):
            assert fc.get_max_file_size_bytes() == 10 * 1024 * 1024  # 027: 10 MB fallback

    def test_allowed_mime_types_from_env(self):
        with patch.dict(os.environ, {"ALLOWED_MIME_TYPES": "text/plain,application/pdf"}):
            assert fc.get_allowed_mime_types() == ["text/plain", "application/pdf"]

    def test_allowed_mime_types_empty_env_fallback(self):
        with patch.dict(os.environ, {"ALLOWED_MIME_TYPES": ""}):
            assert fc.get_allowed_mime_types() == [
                "text/csv",
                "application/json",
                "text/plain",
                "text/markdown",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "image/png",
            ]


class TestIsWithinSizeLimit:
    """is_within_size_limit helper."""

    def test_zero_within_limit(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "100"}):
            assert fc.is_within_size_limit(0) is True

    def test_at_limit(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "100"}):
            assert fc.is_within_size_limit(100) is True

    def test_over_limit(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "100"}):
            assert fc.is_within_size_limit(101) is False

    def test_negative_rejected(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "100"}):
            assert fc.is_within_size_limit(-1) is False


class TestIsAllowedMime:
    """is_allowed_mime helper."""

    def test_allowed_defaults(self):
        with patch.dict(os.environ, {}, clear=False):
            if "ALLOWED_MIME_TYPES" in os.environ:
                del os.environ["ALLOWED_MIME_TYPES"]
            assert fc.is_allowed_mime("text/csv") is True
            assert fc.is_allowed_mime("application/json") is True
            assert fc.is_allowed_mime("text/plain") is True
            assert fc.is_allowed_mime("text/markdown") is True
            assert fc.is_allowed_mime("image/png") is True

    def test_case_insensitive(self):
        with patch.dict(os.environ, {}, clear=False):
            if "ALLOWED_MIME_TYPES" in os.environ:
                del os.environ["ALLOWED_MIME_TYPES"]
            assert fc.is_allowed_mime("TEXT/CSV") is True
            assert fc.is_allowed_mime("Application/JSON") is True

    def test_disallowed(self):
        with patch.dict(os.environ, {}, clear=False):
            if "ALLOWED_MIME_TYPES" in os.environ:
                del os.environ["ALLOWED_MIME_TYPES"]
            assert fc.is_allowed_mime("application/pdf") is False
            assert fc.is_allowed_mime("application/octet-stream") is False

    def test_empty_or_none(self):
        assert fc.is_allowed_mime("") is False
        assert fc.is_allowed_mime(None) is False  # type: ignore[arg-type]


class TestSanitizeFilename:
    """sanitize_filename helper (027)."""

    def test_forbidden_chars_replaced(self):
        assert fc.sanitize_filename("report:test.csv") == "report_test.csv"
        assert fc.sanitize_filename("file<name>.txt") == "file_name_.txt"

    def test_backslash_and_slash_replaced(self):
        """Windows path separators and slashes are replaced with underscore."""
        assert fc.sanitize_filename("path\\to\\file.csv") == "path_to_file.csv"
        assert fc.sanitize_filename("folder/file.xlsx") == "folder_file.xlsx"

    def test_leading_trailing_stripped(self):
        assert fc.sanitize_filename("  report.csv  ") == "report.csv"
        assert fc.sanitize_filename("..name..") == "name"

    def test_empty_fallback(self):
        result = fc.sanitize_filename("", "csv")
        assert result.startswith("generated_file_")
        assert result.endswith(".csv")

    def test_none_fallback(self):
        result = fc.sanitize_filename(None, "md")  # type: ignore[arg-type]
        assert result.startswith("generated_file_")
        assert result.endswith(".md")
