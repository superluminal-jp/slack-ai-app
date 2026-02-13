"""
Slack request signature verification.

This module implements HMAC SHA256 signature verification for Slack requests
to prevent unauthorized access and replay attacks.

Security Features:
- HMAC SHA256 signature verification
- Timestamp validation (±5 minutes window)
- Timing-safe comparison to prevent timing attacks
- Replay attack prevention

Reference: https://api.slack.com/authentication/verifying-requests-from-slack
"""

import hashlib
import hmac
import time
from typing import Optional

from logger_util import get_logger, log

_logger = get_logger()


def verify_signature(
    body: Optional[str],
    timestamp: Optional[str],
    signature: Optional[str],
    signing_secret: Optional[str]
) -> bool:
    """
    Verify Slack request signature using HMAC SHA256.

    This function implements Slack's request verification protocol:
    1. Validates timestamp is within ±5 minutes (prevents replay attacks)
    2. Constructs the signature base string: v0:{timestamp}:{body}
    3. Computes HMAC SHA256 hash using signing secret
    4. Compares with provided signature using timing-safe comparison

    Args:
        body: Raw request body as string
        timestamp: X-Slack-Request-Timestamp header value
        signature: X-Slack-Signature header value (format: v0={hash})
        signing_secret: Slack app signing secret from environment

    Returns:
        bool: True if signature is valid and timestamp is within window,
              False otherwise

    Security Notes:
        - Uses hmac.compare_digest() for timing-safe comparison
        - Validates timestamp to prevent replay attacks (±5 minutes)
        - Returns False for any invalid/missing parameters
        - Never logs or exposes the signing secret

    Example:
        >>> body = '{"type":"url_verification","challenge":"test"}'
        >>> timestamp = "1234567890"
        >>> signature = "v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503"
        >>> secret = "my_signing_secret"
        >>> verify_signature(body, timestamp, signature, secret)
        True
    """
    # Validate all parameters are present and not None
    if body is None or timestamp is None or signature is None or signing_secret is None:
        return False

    # Validate parameters are not empty strings
    if not signing_secret:
        return False

    # Validate signature format (must start with v0=)
    if not signature.startswith("v0="):
        return False

    try:
        # Parse and validate timestamp
        try:
            request_timestamp = int(timestamp)
        except (ValueError, TypeError):
            # Invalid timestamp format (not a number)
            return False

        # Check if timestamp is negative (invalid)
        if request_timestamp < 0:
            return False

        # Get current time
        current_timestamp = int(time.time())

        # Validate timestamp is within ±5 minutes (300 seconds)
        # This prevents replay attacks
        time_diff = abs(current_timestamp - request_timestamp)
        if time_diff > 300:
            return False

        # Construct the signature base string
        # Format: v0:{timestamp}:{body}
        sig_basestring = f"v0:{timestamp}:{body}"

        # Compute HMAC SHA256 signature
        computed_signature = hmac.new(
            signing_secret.encode('utf-8'),
            sig_basestring.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        # Expected signature format: v0={hash}
        expected_signature = f"v0={computed_signature}"

        # Use timing-safe comparison to prevent timing attacks
        # hmac.compare_digest() runs in constant time regardless of input
        return hmac.compare_digest(expected_signature, signature)

    except Exception as e:
        log(_logger, "WARN", "signature_verification_error", {"error": str(e)}, service="verification-agent")
        return False
