"""
Tests for Phase 7: Message Validation in Slack Event Handler.

Test cases:
1. Empty message validation (Test 2)
2. Very long message validation (>4000 chars) (Test 3)
"""

import pytest

from validation import validate_prompt


class TestMessageValidation:
    """Test message validation logic."""

    def test_empty_message_validation(self):
        """Test 2: Send empty message → Receive 'Please send me a message...' prompt."""
        # Test empty string
        is_valid, error_message = validate_prompt("")
        assert is_valid is False
        assert "Please send me a message" in error_message
        assert "Hello" in error_message or "What can you do" in error_message

        # Test whitespace only
        is_valid, error_message = validate_prompt("   ")
        assert is_valid is False
        assert "Please send me a message" in error_message

        # Test newline only
        is_valid, error_message = validate_prompt("\n\n")
        assert is_valid is False
        assert "Please send me a message" in error_message

    def test_very_long_message_validation(self):
        """Test 3: Send very long message (>4000 chars) → Receive length error."""
        # Test message exactly at limit (4000 chars) - should pass
        message_4000 = "a" * 4000
        is_valid, error_message = validate_prompt(message_4000)
        assert is_valid is True
        assert error_message is None

        # Test message over limit (4001 chars) - should fail
        message_4001 = "a" * 4001
        is_valid, error_message = validate_prompt(message_4001)
        assert is_valid is False
        assert "too long" in error_message.lower()
        assert "4001" in error_message
        assert "4000" in error_message

        # Test very long message (10000 chars)
        message_10000 = "a" * 10000
        is_valid, error_message = validate_prompt(message_10000)
        assert is_valid is False
        assert "too long" in error_message.lower()
        assert "10000" in error_message

    def test_valid_message(self):
        """Test valid message passes validation."""
        # Test normal message
        is_valid, error_message = validate_prompt("Hello, how are you?")
        assert is_valid is True
        assert error_message is None

        # Test message with special characters
        is_valid, error_message = validate_prompt("Hello! @#$%^&*()")
        assert is_valid is True
        assert error_message is None

        # Test message with Japanese characters
        is_valid, error_message = validate_prompt("こんにちは、元気ですか？")
        assert is_valid is True
        assert error_message is None

    def test_custom_max_length(self):
        """Test validation with custom max_length."""
        # Test with shorter limit
        message_100 = "a" * 100
        is_valid, error_message = validate_prompt(message_100, max_length=50)
        assert is_valid is False
        assert "too long" in error_message.lower()
        assert "100" in error_message
        assert "50" in error_message

        # Test with longer limit
        message_5000 = "a" * 5000
        is_valid, error_message = validate_prompt(message_5000, max_length=10000)
        assert is_valid is True
        assert error_message is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

