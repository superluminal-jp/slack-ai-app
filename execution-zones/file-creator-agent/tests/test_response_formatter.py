"""
Unit tests for Execution Agent response_formatter.py.

Tests:
- validate_file_for_artifact: within limit + allowed MIME, over size, disallowed MIME
- Constants for A2A file artifact (014)
"""

import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from response_formatter import (
    FILE_PART_KEY_CONTENT_BASE64,
    FILE_PART_KEY_FILE_NAME,
    FILE_PART_KEY_MIME_TYPE,
    FILE_PART_KIND,
    GENERATED_FILE_ARTIFACT_NAME,
    format_success_response,
    validate_file_for_artifact,
)


class TestValidateFileForArtifact:
    """validate_file_for_artifact returns (ok, error_message)."""

    def test_within_limit_and_allowed_mime_returns_ok(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "100"}):
            ok, err = validate_file_for_artifact(b"x" * 50, "export.csv", "text/csv")
            assert ok is True
            assert err is None

    def test_over_size_returns_error_message(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "10"}):
            ok, err = validate_file_for_artifact(b"x" * 20, "export.csv", "text/csv")
            assert ok is False
            assert "大きすぎ" in (err or "")

    def test_disallowed_mime_returns_error_message(self):
        ok, err = validate_file_for_artifact(b"data", "x.pdf", "application/pdf")
        assert ok is False
        assert err is not None and "許可" in err

    def test_empty_file_name_returns_error(self):
        ok, err = validate_file_for_artifact(b"x", "", "text/plain")
        assert ok is False
        assert err is not None

    def test_boundary_size_accepted(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "5"}):
            ok, err = validate_file_for_artifact(b"12345", "a.txt", "text/plain")
            assert ok is True
            assert err is None


class TestFormatSuccessResponseFileValidation:
    """format_success_response includes user-facing message when file rejected (014 US3)."""

    def test_file_over_size_no_artifact_response_text_contains_message(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "10"}):
            resp, fa = format_success_response(
                channel="C1",
                response_text="Here is the result.",
                bot_token="xoxb-token",
                file_bytes=b"x" * 20,
                file_name="big.csv",
                mime_type="text/csv",
            )
        assert fa is None
        assert "ファイルが大きすぎます" in resp["response_text"]

    def test_file_disallowed_mime_no_artifact_response_text_contains_message(self):
        resp, fa = format_success_response(
            channel="C1",
            response_text="Result.",
            bot_token="xoxb-token",
            file_bytes=b"data",
            file_name="x.pdf",
            mime_type="application/pdf",
        )
        assert fa is None
        assert "許可されていない" in resp["response_text"]

    def test_file_valid_returns_artifact(self):
        with patch.dict(os.environ, {"MAX_FILE_SIZE_BYTES": "1000"}):
            resp, fa = format_success_response(
                channel="C1",
                response_text="Done.",
                bot_token="xoxb-token",
                file_bytes=b"a,b\n1,2",
                file_name="out.csv",
                mime_type="text/csv",
            )
        assert fa is not None
        assert fa["name"] == "generated_file"
        assert "response_text" in resp and resp["response_text"] == "Done."


class TestFileArtifactConstants:
    """A2A file artifact constants match contract."""

    def test_generated_file_artifact_name(self):
        assert GENERATED_FILE_ARTIFACT_NAME == "generated_file"

    def test_file_part_keys(self):
        assert FILE_PART_KEY_CONTENT_BASE64 == "contentBase64"
        assert FILE_PART_KEY_FILE_NAME == "fileName"
        assert FILE_PART_KEY_MIME_TYPE == "mimeType"
        assert FILE_PART_KIND == "file"
