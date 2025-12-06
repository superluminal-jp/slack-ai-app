"""
Tests for formatting_detector module.

Tests structured document formatting detection including:
- Heading detection
- List detection
- Code block detection
- Table detection
- Multiple pattern detection (2+ elements)
"""

import pytest
from formatting_detector import detect_structured_formatting


class TestHeadingDetection:
    """Test heading pattern detection."""

    def test_detect_single_heading(self):
        """Test detection of single markdown heading."""
        text = "# Heading\nSome text"
        # Single element should not trigger (needs 2+)
        assert detect_structured_formatting(text) == False

    def test_detect_multiple_headings(self):
        """Test detection of multiple markdown headings."""
        text = "# Heading\n## Subheading\n### Sub-subheading\nSome text"
        assert detect_structured_formatting(text) == True

    def test_detect_headings_with_other_elements(self):
        """Test detection of headings with lists."""
        text = "# Heading\n## Subheading\n- Item 1\n- Item 2"
        assert detect_structured_formatting(text) == True


class TestListDetection:
    """Test list pattern detection."""

    def test_detect_unordered_list(self):
        """Test detection of unordered list."""
        text = "- Item 1\n- Item 2\n- Item 3"
        # Single element should not trigger (needs 2+)
        assert detect_structured_formatting(text) == False

    def test_detect_ordered_list(self):
        """Test detection of ordered list."""
        text = "1. First item\n2. Second item\n3. Third item"
        # Single element should not trigger (needs 2+)
        assert detect_structured_formatting(text) == False

    def test_detect_lists_with_other_elements(self):
        """Test detection of lists with headings."""
        text = "# Heading\n- Item 1\n- Item 2"
        assert detect_structured_formatting(text) == True


class TestCodeBlockDetection:
    """Test code block pattern detection."""

    def test_detect_code_block(self):
        """Test detection of code block."""
        text = "Some text\n```python\ndef hello():\n    print('Hello')\n```\nMore text"
        # Single element should not trigger (needs 2+)
        assert detect_structured_formatting(text) == False

    def test_detect_code_blocks_with_other_elements(self):
        """Test detection of code blocks with headings."""
        text = "# Heading\n```python\ncode here\n```\n## Subheading"
        assert detect_structured_formatting(text) == True


class TestTableDetection:
    """Test table pattern detection."""

    def test_detect_table(self):
        """Test detection of pipe-separated table."""
        text = "| Col1 | Col2 |\n|------|------|\n| Val1 | Val2 |"
        # Single element should not trigger (needs 2+)
        assert detect_structured_formatting(text) == False

    def test_detect_table_with_other_elements(self):
        """Test detection of table with headings."""
        text = "# Heading\n| Col1 | Col2 |\n|------|------|\n| Val1 | Val2 |"
        assert detect_structured_formatting(text) == True


class TestMultiplePatternDetection:
    """Test detection of multiple structural elements."""

    def test_detect_two_elements(self):
        """Test detection of exactly 2 structural elements."""
        text = "# Heading\n## Subheading\n- Item 1"
        assert detect_structured_formatting(text) == True

    def test_detect_three_elements(self):
        """Test detection of 3 structural elements."""
        text = "# Heading\n- Item 1\n```code```"
        assert detect_structured_formatting(text) == True

    def test_detect_four_elements(self):
        """Test detection of 4 structural elements."""
        text = "# Heading\n- Item 1\n```code```\n| Col1 | Col2 |"
        assert detect_structured_formatting(text) == True

    def test_no_structured_formatting(self):
        """Test plain text without structured formatting."""
        text = "This is plain text without any structure."
        assert detect_structured_formatting(text) == False

    def test_empty_text(self):
        """Test empty text."""
        text = ""
        assert detect_structured_formatting(text) == False

    def test_whitespace_only(self):
        """Test whitespace-only text."""
        text = "   \n\t  "
        assert detect_structured_formatting(text) == False

