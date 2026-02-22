"""Unit tests for generate_powerpoint tool (027 US2)."""

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestGeneratePowerpoint:
    """Tests for generate_powerpoint tool."""

    def test_stores_file_in_invocation_state(self):
        """Tool stores generated PowerPoint in tool_context.invocation_state."""
        from tools.generate_powerpoint import generate_powerpoint

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_powerpoint(
            filename="deck",
            slides=[{"title": "Slide 1", "body": "Content"}],
            tool_context=tool_context,
        )

        assert "ファイル" in result
        assert "generated_file" in tool_context.invocation_state
        gf = tool_context.invocation_state["generated_file"]
        assert gf["file_name"].endswith(".pptx")
        assert gf["mime_type"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        assert len(gf["file_bytes"]) > 0

    def test_sanitizes_filename(self):
        """Tool applies sanitize_filename (T019)."""
        from tools.generate_powerpoint import generate_powerpoint

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        generate_powerpoint(
            filename="deck*test",
            slides=[{"title": "T", "body": "B"}],
            tool_context=tool_context,
        )

        gf = tool_context.invocation_state["generated_file"]
        assert "*" not in gf["file_name"]
