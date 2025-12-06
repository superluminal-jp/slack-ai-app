"""
Reply router for determining Canvas vs regular message usage.

This module determines whether a reply should be posted as a Canvas
or as a regular message based on length and structured formatting.
"""

from formatting_detector import detect_structured_formatting


# Length threshold for Canvas usage (per FR-016)
CANVAS_LENGTH_THRESHOLD = 800


def should_use_canvas(reply_text: str) -> bool:
    """
    Determine if reply should use Canvas instead of regular message.

    Returns True if:
    - Reply length > 800 characters, OR
    - Reply contains structured formatting (headings, lists, code blocks, tables)

    Args:
        reply_text: The AI-generated reply text to evaluate

    Returns:
        True if Canvas should be used, False for regular message

    Examples:
        >>> should_use_canvas("A" * 801)  # 801 characters
        True
        >>> should_use_canvas("# Heading\\n## Subheading\\nSome text")
        True
        >>> should_use_canvas("Short reply")  # < 800 chars, no formatting
        False
    """
    if not reply_text or not reply_text.strip():
        return False

    # Check length threshold
    length_exceeds_threshold = len(reply_text) > CANVAS_LENGTH_THRESHOLD

    # Check structured formatting
    has_formatting = detect_structured_formatting(reply_text)

    # Use Canvas if either condition is met
    return length_exceeds_threshold or has_formatting

