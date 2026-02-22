"""
Unit tests for generate_text_file tool (027 US1).
"""

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestGenerateTextFile:
    """Tests for generate_text_file tool."""

    def test_stores_file_in_invocation_state(self):
        """Tool stores generated file in tool_context.invocation_state."""
        from tools.generate_text_file import generate_text_file

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_text_file(
            content="a,b\n1,2",
            filename="export.csv",
            tool_context=tool_context,
        )

        assert "ファイル" in result or "作成" in result
        assert "generated_file" in tool_context.invocation_state
        gf = tool_context.invocation_state["generated_file"]
        assert gf["file_bytes"] == b"a,b\n1,2"
        assert gf["file_name"] == "export.csv"
        assert gf["mime_type"] == "text/csv"

    def test_sanitizes_filename(self):
        """Tool applies sanitize_filename to output (T014)."""
        from tools.generate_text_file import generate_text_file

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_text_file(
            content="content",
            filename="report:bad/chars.md",
            tool_context=tool_context,
        )

        gf = tool_context.invocation_state["generated_file"]
        assert ":" not in gf["file_name"]
        assert "/" not in gf["file_name"]
        assert "report" in gf["file_name"] or "md" in gf["file_name"]

    def test_empty_content_returns_error(self):
        """Empty content returns error message."""
        from tools.generate_text_file import generate_text_file

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_text_file(
            content="",
            filename="x.csv",
            tool_context=tool_context,
        )

        assert "エラー" in result
        assert "generated_file" not in tool_context.invocation_state

    def test_mime_type_mapping(self):
        """MIME type is correct for .md, .csv, .txt."""
        from tools.generate_text_file import generate_text_file

        for ext, expected_mime in [
            ("report.md", "text/markdown"),
            ("data.csv", "text/csv"),
            ("notes.txt", "text/plain"),
        ]:
            tool_context = MagicMock()
            tool_context.invocation_state = {}
            generate_text_file(content="x", filename=ext, tool_context=tool_context)
            assert tool_context.invocation_state["generated_file"]["mime_type"] == expected_mime
