"""
Tests for reply_router module.

Tests Canvas vs regular message routing based on:
- Length threshold (>800 chars)
- Structured formatting detection
- Regular message decision (<800 chars, no formatting)
"""

import pytest
from reply_router import should_use_canvas, CANVAS_LENGTH_THRESHOLD


class TestLengthThreshold:
    """Test length threshold detection."""

    def test_exceeds_threshold(self):
        """Test reply exceeding 800 character threshold."""
        text = "A" * 801  # 801 characters
        assert should_use_canvas(text) == True

    def test_exactly_at_threshold(self):
        """Test reply exactly at 800 character threshold."""
        text = "A" * 800  # Exactly 800 characters
        assert should_use_canvas(text) == False  # Must exceed, not equal

    def test_below_threshold(self):
        """Test reply below 800 character threshold."""
        text = "A" * 799  # 799 characters
        assert should_use_canvas(text) == False

    def test_short_reply(self):
        """Test short reply."""
        text = "Short reply"
        assert should_use_canvas(text) == False


class TestStructuredFormattingDetection:
    """Test structured formatting detection."""

    def test_with_headings_and_lists(self):
        """Test reply with headings and lists (structured formatting)."""
        text = "# Heading\n## Subheading\n- Item 1\n- Item 2"
        assert should_use_canvas(text) == True

    def test_with_code_blocks_and_tables(self):
        """Test reply with code blocks and tables (structured formatting)."""
        text = "```python\ncode\n```\n| Col1 | Col2 |"
        assert should_use_canvas(text) == True

    def test_with_formatting_below_threshold(self):
        """Test structured formatting even when below length threshold."""
        text = "# Heading\n## Subheading"  # Short but structured
        assert should_use_canvas(text) == True


class TestRegularMessageDecision:
    """Test regular message decision (no Canvas)."""

    def test_short_plain_text(self):
        """Test short plain text reply."""
        text = "This is a short reply without any structure."
        assert should_use_canvas(text) == False

    def test_below_threshold_no_formatting(self):
        """Test reply below threshold with no formatting."""
        text = "A" * 500  # 500 characters, no structure
        assert should_use_canvas(text) == False

    def test_single_structural_element(self):
        """Test reply with only one structural element (not enough)."""
        text = "# Single heading\nSome text"  # Only one element
        assert should_use_canvas(text) == False

    def test_empty_text(self):
        """Test empty text."""
        text = ""
        assert should_use_canvas(text) == False

    def test_whitespace_only(self):
        """Test whitespace-only text."""
        text = "   \n\t  "
        assert should_use_canvas(text) == False


class TestCombinedConditions:
    """Test combined length and formatting conditions."""

    def test_long_with_formatting(self):
        """Test long reply with structured formatting."""
        text = "# Heading\n" + "A" * 800  # Long and structured
        assert should_use_canvas(text) == True

    def test_long_without_formatting(self):
        """Test long reply without structured formatting."""
        text = "A" * 801  # Long but no structure
        assert should_use_canvas(text) == True  # Length alone triggers

    def test_short_with_formatting(self):
        """Test short reply with structured formatting."""
        text = "# Heading\n## Subheading\n- Item"  # Short but structured
        assert should_use_canvas(text) == True  # Formatting alone triggers

