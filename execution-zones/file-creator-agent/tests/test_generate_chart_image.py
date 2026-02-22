"""Unit tests for generate_chart_image tool (027 US3)."""

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestGenerateChartImage:
    """Tests for generate_chart_image tool."""

    def test_stores_file_in_invocation_state(self):
        """Tool stores generated PNG in tool_context.invocation_state."""
        from tools.generate_chart_image import generate_chart_image

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_chart_image(
            filename="sales",
            chart_type="bar",
            title="Sales",
            data={"labels": ["Q1", "Q2"], "datasets": [{"label": "2024", "values": [100, 120]}]},
            tool_context=tool_context,
        )

        assert "ファイル" in result
        assert "generated_file" in tool_context.invocation_state
        gf = tool_context.invocation_state["generated_file"]
        assert gf["file_name"].endswith(".png")
        assert gf["mime_type"] == "image/png"
        assert len(gf["file_bytes"]) > 0
        assert gf["file_bytes"][:8] == b"\x89PNG\r\n\x1a\n"

    def test_sanitizes_filename(self):
        """Tool applies sanitize_filename (T022)."""
        from tools.generate_chart_image import generate_chart_image

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        generate_chart_image(
            filename="chart*test",
            chart_type="bar",
            title="T",
            data={"labels": ["A"], "datasets": [{"label": "X", "values": [1]}]},
            tool_context=tool_context,
        )

        gf = tool_context.invocation_state["generated_file"]
        assert "*" not in gf["file_name"]

    def test_rejects_invalid_chart_type(self):
        """Tool rejects invalid chart_type."""
        from tools.generate_chart_image import generate_chart_image

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_chart_image(
            filename="x",
            chart_type="invalid",
            title="T",
            data={"labels": ["A"], "datasets": [{"label": "X", "values": [1]}]},
            tool_context=tool_context,
        )

        assert "エラー" in result
        assert "generated_file" not in tool_context.invocation_state

    def test_pie_chart_creates_valid_png(self):
        """Pie chart generates valid PNG."""
        from tools.generate_chart_image import generate_chart_image

        tool_context = MagicMock()
        tool_context.invocation_state = {}

        result = generate_chart_image(
            filename="share",
            chart_type="pie",
            title="Market Share",
            data={"labels": ["A", "B", "C"], "datasets": [{"label": "X", "values": [30, 50, 20]}]},
            tool_context=tool_context,
        )

        assert "ファイル" in result
        gf = tool_context.invocation_state["generated_file"]
        assert len(gf["file_bytes"]) > 0
