"""
Formatting detector for structured document content.

This module detects structured document formatting in text content,
such as headings, lists, tables, and code blocks, to determine if
Canvas should be used for better presentation.
"""

import re
from typing import Dict


def detect_structured_formatting(text: str) -> bool:
    """
    Detect if text contains structured document formatting.

    Returns True if at least 2 structural elements are found:
    - Headings (markdown #, ##, ###)
    - Lists (unordered - * + or ordered 1. 2.)
    - Code blocks (triple backticks)
    - Tables (pipe-separated | col1 | col2 |)

    Args:
        text: Text content to analyze

    Returns:
        True if structured formatting detected (2+ elements), False otherwise

    Examples:
        >>> detect_structured_formatting("# Heading\\n## Subheading\\nSome text")
        True
        >>> detect_structured_formatting("Plain text without structure")
        False
        >>> detect_structured_formatting("- Item 1\\n- Item 2")
        True
    """
    if not text or not text.strip():
        return False

    patterns: Dict[str, str] = {
        'headings': r'^#{1,6}\s+.+$',  # Markdown headings (# through ######)
        'lists': r'^[\s]*[-*+]\s+|^[\s]*\d+\.\s+',  # Unordered/ordered lists
        'code_blocks': r'```[\s\S]*?```',  # Code blocks (triple backticks)
        'tables': r'\|.+\|',  # Tables (pipe-separated)
    }

    # Count matches for each pattern type
    # For headings, count all instances (multiple headings indicate document structure)
    # For other patterns, just check if they exist (search)
    heading_matches = len(re.findall(patterns['headings'], text, re.MULTILINE))
    list_exists = bool(re.search(patterns['lists'], text, re.MULTILINE))
    code_block_exists = bool(re.search(patterns['code_blocks'], text, re.MULTILINE))
    table_exists = bool(re.search(patterns['tables'], text, re.MULTILINE))

    # Multiple headings (2+) indicate structured document formatting
    if heading_matches >= 2:
        return True

    # Count different types of structural elements
    # Need 2+ different types to indicate structured formatting
    total_element_types = (
        (1 if heading_matches > 0 else 0) +
        (1 if list_exists else 0) +
        (1 if code_block_exists else 0) +
        (1 if table_exists else 0)
    )

    return total_element_types >= 2  # At least 2 different structural element types

