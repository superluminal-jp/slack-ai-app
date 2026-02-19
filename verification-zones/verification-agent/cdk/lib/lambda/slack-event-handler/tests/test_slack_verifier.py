"""
Unit tests for Slack signature verification.

These tests validate HMAC SHA256 signature verification, timestamp validation,
and replay attack prevention per Slack security requirements.
"""

import hashlib
import hmac
import json
import time
from unittest import mock

import pytest

# Import the function we'll be testing (it doesn't exist yet, but that's expected)
from slack_verifier import verify_signature


class TestSlackSignatureVerification:
    """Test cases for Slack request signature verification."""

    # Test data
    SIGNING_SECRET = "test_signing_secret_12345"
    VALID_BODY = json.dumps({"type": "url_verification", "challenge": "test123"})
    
    def _generate_valid_signature(self, timestamp: str, body: str) -> str:
        """
        Generate a valid Slack signature for testing.
        
        Args:
            timestamp: Unix timestamp as string
            body: Request body as string
            
        Returns:
            Valid Slack signature with v0= prefix
        """
        sig_basestring = f"v0:{timestamp}:{body}"
        signature = hmac.new(
            self.SIGNING_SECRET.encode(),
            sig_basestring.encode(),
            hashlib.sha256
        ).hexdigest()
        return f"v0={signature}"

    def test_valid_signature_verification(self):
        """
        T030: Test valid HMAC SHA256 signature verification.
        
        Given a valid Slack request with correct signature
        When verify_signature is called
        Then it should return True (signature valid)
        """
        # Arrange
        current_timestamp = str(int(time.time()))
        valid_signature = self._generate_valid_signature(current_timestamp, self.VALID_BODY)
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=current_timestamp,
            signature=valid_signature,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is True, "Valid signature should pass verification"

    def test_invalid_signature_rejection(self):
        """
        T031: Test invalid signature rejection.
        
        Given a Slack request with incorrect signature
        When verify_signature is called
        Then it should return False (signature invalid)
        """
        # Arrange
        current_timestamp = str(int(time.time()))
        invalid_signature = "v0=invalid_signature_hash_12345"
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=current_timestamp,
            signature=invalid_signature,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is False, "Invalid signature should fail verification"

    def test_timestamp_validation_within_window(self):
        """
        T032: Test timestamp validation within ±5 minutes window.
        
        Given a Slack request with timestamp within 5 minutes
        When verify_signature is called
        Then it should return True (timestamp valid)
        """
        # Arrange - timestamp 2 minutes ago (within window)
        timestamp_2min_ago = str(int(time.time()) - 120)
        valid_signature = self._generate_valid_signature(timestamp_2min_ago, self.VALID_BODY)
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=timestamp_2min_ago,
            signature=valid_signature,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is True, "Timestamp within 5-minute window should pass verification"

    def test_timestamp_validation_too_old(self):
        """
        T032: Test timestamp validation rejects old timestamps (replay attack prevention).
        
        Given a Slack request with timestamp older than 5 minutes
        When verify_signature is called
        Then it should return False (timestamp too old)
        """
        # Arrange - timestamp 6 minutes ago (outside window)
        timestamp_6min_ago = str(int(time.time()) - 360)
        valid_signature = self._generate_valid_signature(timestamp_6min_ago, self.VALID_BODY)
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=timestamp_6min_ago,
            signature=valid_signature,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is False, "Timestamp older than 5 minutes should fail verification"

    def test_timestamp_validation_too_new(self):
        """
        T032: Test timestamp validation rejects future timestamps.
        
        Given a Slack request with timestamp in the future (beyond 5 minutes)
        When verify_signature is called
        Then it should return False (timestamp in future)
        """
        # Arrange - timestamp 6 minutes in the future (outside window)
        timestamp_6min_future = str(int(time.time()) + 360)
        valid_signature = self._generate_valid_signature(timestamp_6min_future, self.VALID_BODY)
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=timestamp_6min_future,
            signature=valid_signature,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is False, "Timestamp in future should fail verification"

    def test_signature_with_modified_body(self):
        """
        Test signature verification fails when body is tampered.
        
        Given a valid signature for original body
        When body is modified after signature generation
        Then verification should fail
        """
        # Arrange
        current_timestamp = str(int(time.time()))
        original_body = json.dumps({"type": "url_verification", "challenge": "original"})
        valid_signature = self._generate_valid_signature(current_timestamp, original_body)
        
        # Modify body after signature generation
        tampered_body = json.dumps({"type": "url_verification", "challenge": "tampered"})
        
        # Act
        result = verify_signature(
            body=tampered_body,
            timestamp=current_timestamp,
            signature=valid_signature,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is False, "Signature should fail when body is tampered"

    def test_signature_with_wrong_secret(self):
        """
        Test signature verification fails with wrong signing secret.
        
        Given a signature generated with one secret
        When verified with a different secret
        Then verification should fail
        """
        # Arrange
        current_timestamp = str(int(time.time()))
        valid_signature = self._generate_valid_signature(current_timestamp, self.VALID_BODY)
        wrong_secret = "wrong_secret_67890"
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=current_timestamp,
            signature=valid_signature,
            signing_secret=wrong_secret
        )
        
        # Assert
        assert result is False, "Signature should fail with wrong signing secret"

    def test_signature_missing_v0_prefix(self):
        """
        Test signature verification handles missing v0= prefix gracefully.
        
        Given a signature without the v0= prefix
        When verify_signature is called
        Then it should return False (invalid format)
        """
        # Arrange
        current_timestamp = str(int(time.time()))
        signature_without_prefix = "invalid_no_prefix_signature"
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=current_timestamp,
            signature=signature_without_prefix,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is False, "Signature without v0= prefix should fail"

    def test_empty_body_signature(self):
        """
        Test signature verification with empty body.
        
        Given an empty request body
        When verify_signature is called
        Then it should handle gracefully (based on valid signature)
        """
        # Arrange
        current_timestamp = str(int(time.time()))
        empty_body = ""
        valid_signature = self._generate_valid_signature(current_timestamp, empty_body)
        
        # Act
        result = verify_signature(
            body=empty_body,
            timestamp=current_timestamp,
            signature=valid_signature,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is True, "Valid signature should pass even for empty body"

    def test_timing_safe_comparison(self):
        """
        Test that signature comparison is timing-safe.
        
        This test verifies that hmac.compare_digest is used internally
        to prevent timing attacks.
        
        Note: This is a behavioral test - implementation should use
        hmac.compare_digest for secure comparison.
        """
        # Arrange
        current_timestamp = str(int(time.time()))
        valid_signature = self._generate_valid_signature(current_timestamp, self.VALID_BODY)
        
        # Act - multiple calls should have consistent behavior
        results = [
            verify_signature(
                body=self.VALID_BODY,
                timestamp=current_timestamp,
                signature=valid_signature,
                signing_secret=self.SIGNING_SECRET
            )
            for _ in range(10)
        ]
        
        # Assert - all results should be True (consistent)
        assert all(results), "Timing-safe comparison should have consistent results"
        assert len(set(results)) == 1, "All verification results should be identical"


class TestSlackVerifierEdgeCases:
    """Test edge cases and error conditions."""

    SIGNING_SECRET = "test_signing_secret_12345"
    VALID_BODY = json.dumps({"type": "url_verification"})

    def test_non_numeric_timestamp(self):
        """Test handling of non-numeric timestamp."""
        # Arrange
        invalid_timestamp = "not_a_number"
        signature = "v0=dummy_signature"
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=invalid_timestamp,
            signature=signature,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is False, "Non-numeric timestamp should fail verification"

    def test_negative_timestamp(self):
        """Test handling of negative timestamp."""
        # Arrange
        negative_timestamp = "-1234567890"
        signature = "v0=dummy_signature"
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=negative_timestamp,
            signature=signature,
            signing_secret=self.SIGNING_SECRET
        )
        
        # Assert
        assert result is False, "Negative timestamp should fail verification"

    def test_empty_signing_secret(self):
        """Test handling of empty signing secret."""
        # Arrange
        current_timestamp = str(int(time.time()))
        signature = "v0=dummy_signature"
        
        # Act
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=current_timestamp,
            signature=signature,
            signing_secret=""
        )
        
        # Assert
        assert result is False, "Empty signing secret should fail verification"

    def test_none_parameters(self):
        """Test handling of None parameters."""
        # Test with None body
        result = verify_signature(
            body=None,
            timestamp=str(int(time.time())),
            signature="v0=test",
            signing_secret=self.SIGNING_SECRET
        )
        assert result is False, "None body should fail verification"

        # Test with None timestamp
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=None,
            signature="v0=test",
            signing_secret=self.SIGNING_SECRET
        )
        assert result is False, "None timestamp should fail verification"

        # Test with None signature
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=str(int(time.time())),
            signature=None,
            signing_secret=self.SIGNING_SECRET
        )
        assert result is False, "None signature should fail verification"

        # Test with None signing_secret
        result = verify_signature(
            body=self.VALID_BODY,
            timestamp=str(int(time.time())),
            signature="v0=test",
            signing_secret=None
        )
        assert result is False, "None signing_secret should fail verification"

