"""
Validation utilities for Slack event handler.

This module provides validation functions for user messages
before they are sent to the Bedrock processor.
"""

from typing import Optional


def _detect_prompt_injection(prompt: str) -> tuple[bool, Optional[str]]:
    """
    Detect potential prompt injection attacks.
    
    Checks for common prompt injection patterns:
    - "ignore previous instructions"
    - "system prompt"
    - "forget everything"
    - "new instructions"
    - "override"
    - "jailbreak"
    
    Args:
        prompt: User message text
        
    Returns:
        Tuple of (is_suspicious: bool, reason: Optional[str])
        - is_suspicious: True if prompt injection pattern detected
        - reason: Reason for suspicion (None if not suspicious)
    """
    if not prompt:
        return False, None
    
    prompt_lower = prompt.lower()
    
    # Common prompt injection patterns (case-insensitive)
    suspicious_patterns = [
        ("ignore previous", "Attempt to ignore previous instructions"),
        ("ignore all previous", "Attempt to ignore all previous instructions"),
        ("system prompt", "Attempt to access system prompt"),
        ("forget everything", "Attempt to reset context"),
        ("new instructions", "Attempt to provide new instructions"),
        ("override", "Attempt to override system behavior"),
        ("jailbreak", "Attempt to jailbreak the model"),
        ("you are now", "Attempt to change model behavior"),
        ("act as", "Attempt to change model role"),
        ("pretend to be", "Attempt to change model role"),
    ]
    
    for pattern, reason in suspicious_patterns:
        if pattern in prompt_lower:
            return True, reason
    
    return False, None


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
    
    # Check for prompt injection patterns
    is_suspicious, reason = _detect_prompt_injection(prompt)
    if is_suspicious:
        # Log security event but don't reveal the specific pattern to user
        # This prevents attackers from learning which patterns are detected
        return (
            False,
            "Your message contains potentially harmful content. Please rephrase your request.",
        )
    
    # All validations passed
    return True, None

