"""Unit tests for generate_word tool (027 US2)."""

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestGenerateWord:
    """Tests for generate_word tool."""

    def test_stores_file_in_invocation_state(self):
        """Tool stores generated Word in tool_context.invocation_state."""
        from tools.generate_word import generate_word

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_word(
            filename="report",
            title="Report Title",
            sections=[{"heading": "Section 1", "content": "Body text"}],
            tool_context=tool_context,
        )

        assert "ファイル" in result
        assert "generated_file" in tool_context.invocation_state
        gf = tool_context.invocation_state["generated_file"]
        assert gf["file_name"].endswith(".docx")
        assert gf["mime_type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert len(gf["file_bytes"]) > 0

    def test_sanitizes_filename(self):
        """Tool applies sanitize_filename (T019)."""
        from tools.generate_word import generate_word

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        generate_word(
            filename="doc/bad",
            title="T",
            sections=[{"heading": "H", "content": "C"}],
            tool_context=tool_context,
        )

        gf = tool_context.invocation_state["generated_file"]
        assert "/" not in gf["file_name"]
