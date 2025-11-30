"""
Validation utilities for Slack event handler.

This module provides validation functions for user messages
before they are sent to the Bedrock processor.
"""

from typing import Optional


def validate_prompt(prompt: str, max_length: int = 4000) -> tuple[bool, Optional[str]]:
    """
    Validate user prompt before sending to Bedrock.

    Args:
        prompt: User message text
        max_length: Maximum allowed prompt length (default: 4000 chars)

    Returns:
        tuple: (is_valid: bool, error_message: Optional[str])

    Example:
        >>> is_valid, error = validate_prompt("Hello")
        >>> print(is_valid)
        True
        >>> is_valid, error = validate_prompt("")
        >>> print(error)
        "Please send me a message and I'll respond!"
    """
    # Check if prompt is empty
    if not prompt or not prompt.strip():
        return (
            False,
            "Please send me a message and I'll respond! For example, 'Hello' or 'What can you do?'",
        )

    # Check if prompt exceeds maximum length
    if len(prompt) > max_length:
        return (
            False,
            f"Your message is too long ({len(prompt)} characters). Please keep it under {max_length} characters.",
        )

    # All validations passed
    return True, None

