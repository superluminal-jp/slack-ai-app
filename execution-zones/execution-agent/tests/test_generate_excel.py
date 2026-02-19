"""Unit tests for generate_excel tool (027 US2)."""

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestGenerateExcel:
    """Tests for generate_excel tool."""

    def test_stores_file_in_invocation_state(self):
        """Tool stores generated Excel in tool_context.invocation_state."""
        from tools.generate_excel import generate_excel

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_excel(
            filename="report",
            sheets=[{"name": "Q1", "headers": ["A", "B"], "rows": [["1", "2"]]}],
            tool_context=tool_context,
        )

        assert "ファイル" in result
        assert "generated_file" in tool_context.invocation_state
        gf = tool_context.invocation_state["generated_file"]
        assert gf["file_name"].endswith(".xlsx")
        assert gf["mime_type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert len(gf["file_bytes"]) > 0

    def test_sanitizes_filename(self):
        """Tool applies sanitize_filename (T019)."""
        from tools.generate_excel import generate_excel

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        generate_excel(
            filename="report:bad",
            sheets=[{"name": "S1", "headers": [], "rows": []}],
            tool_context=tool_context,
        )

        gf = tool_context.invocation_state["generated_file"]
        assert ":" not in gf["file_name"]

    def test_empty_sheets_creates_minimal_workbook(self):
        """Tool creates valid xlsx even with empty sheets."""
        from tools.generate_excel import generate_excel

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_excel(
            filename="empty",
            sheets=[{"name": "S1", "headers": [], "rows": []}],
            tool_context=tool_context,
        )

        assert "ファイル" in result
        gf = tool_context.invocation_state["generated_file"]
        assert gf["file_bytes"][:2] == b"PK"  # xlsx is zip format
