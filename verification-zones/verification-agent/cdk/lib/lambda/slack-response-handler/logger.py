"""
Unified logging utility for structured JSON logging.

Provides consistent logging across all modules with:
- Structured JSON output for CloudWatch
- Correlation ID tracking
- Error context and stack traces
- Log level standardization
- Performance metrics
"""

import json
import traceback
import sys
import hashlib
import os
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum


class LogLevel(Enum):
    """Standard log levels."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


# Global correlation ID (set by handler)
_correlation_id: Optional[str] = None
_lambda_context: Optional[Any] = None


def set_correlation_id(correlation_id: Optional[str]) -> None:
    """Set correlation ID for all subsequent logs."""
    global _correlation_id
    _correlation_id = correlation_id


def set_lambda_context(context: Optional[Any]) -> None:
    """Set Lambda context for request_id extraction."""
    global _lambda_context
    _lambda_context = context


def get_correlation_id() -> Optional[str]:
    """Get current correlation ID."""
    return _correlation_id


def _get_request_id() -> Optional[str]:
    """Extract request_id from Lambda context."""
    if _lambda_context and hasattr(_lambda_context, "aws_request_id"):
        return _lambda_context.aws_request_id
    return None


def _mask_pii(value: Optional[str], log_level: str = "INFO") -> Optional[str]:
    """
    Mask or hash PII (Personally Identifiable Information) based on log level.
    
    PII fields: team_id, user_id, channel_id
    
    Masking strategy:
    - DEBUG: Full value (for debugging only)
    - INFO: Partial mask (e.g., "T123***" -> "T123***")
    - WARN/ERROR/CRITICAL: SHA-256 hash (first 8 characters)
    
    Args:
        value: PII value to mask (can be None)
        log_level: Log level (DEBUG, INFO, WARN, ERROR, CRITICAL)
        
    Returns:
        Masked value or None if input is None
    """
    if not value or not isinstance(value, str):
        return value
    
    # DEBUG level: Return full value (for debugging)
    if log_level == "DEBUG":
        return value
    
    # INFO level: Partial mask (show first 3 characters, mask the rest)
    if log_level == "INFO":
        if len(value) <= 3:
            return "***"  # Too short to mask partially
        return value[:3] + "***"
    
    # WARN/ERROR/CRITICAL: SHA-256 hash (first 8 characters for readability)
    # Use a salt from environment variable for additional security
    salt = os.environ.get("PII_HASH_SALT", "default-salt-change-in-production")
    hash_input = f"{salt}:{value}"
    hash_value = hashlib.sha256(hash_input.encode("utf-8")).hexdigest()
    return hash_value[:8]  # Return first 8 characters for readability


def _sanitize_log_data(data: Dict[str, Any], log_level: str = "INFO") -> Dict[str, Any]:
    """
    Sanitize log data by masking PII fields.
    
    PII fields that are masked:
    - team_id
    - user_id
    - channel_id
    - bot_token (if present)
    - signing_secret (if present)
    
    Args:
        data: Log data dictionary
        log_level: Log level (determines masking strategy)
        
    Returns:
        Sanitized log data dictionary with PII masked
    """
    sanitized = data.copy()
    
    # PII fields to mask
    pii_fields = ["team_id", "user_id", "channel_id", "bot_token", "signing_secret"]
    
    for field in pii_fields:
        if field in sanitized:
            sanitized[field] = _mask_pii(sanitized[field], log_level)
    
    # Recursively sanitize nested dictionaries
    for key, value in sanitized.items():
        if isinstance(value, dict):
            sanitized[key] = _sanitize_log_data(value, log_level)
        elif isinstance(value, list):
            # Sanitize list items if they are dictionaries
            sanitized[key] = [
                _sanitize_log_data(item, log_level) if isinstance(item, dict) else item
                for item in value
            ]
    
    return sanitized


def _build_log_entry(
    level: str,
    event_type: str,
    data: Dict[str, Any],
    error: Optional[Exception] = None,
    include_stack_trace: bool = False,
) -> Dict[str, Any]:
    """
    Build structured log entry.
    
    Args:
        level: Log level (DEBUG, INFO, WARN, ERROR, CRITICAL)
        event_type: Event type identifier (e.g., "event_received", "signature_verified")
        data: Event-specific data dictionary
        error: Optional exception object for error logs
        include_stack_trace: Whether to include stack trace (for ERROR/CRITICAL)
        
    Returns:
        Structured log entry dictionary
    """
    # Sanitize log data to remove PII (mask based on log level)
    sanitized_data = _sanitize_log_data(data, level)
    
    log_entry = {
        "level": level,
        "event": event_type,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        **sanitized_data,
    }
    
    # Add correlation ID if available
    correlation_id = get_correlation_id()
    if correlation_id:
        log_entry["correlation_id"] = correlation_id
    
    # Add request_id from Lambda context
    request_id = _get_request_id()
    if request_id:
        log_entry["request_id"] = request_id
    
    # Add error details if exception provided
    if error:
        log_entry["error"] = {
            "type": type(error).__name__,
            "message": str(error),
        }
        
        # Include stack trace for ERROR and CRITICAL levels
        if include_stack_trace and level in ("ERROR", "CRITICAL"):
            log_entry["error"]["stack_trace"] = traceback.format_exc()
    
    return log_entry


def log(
    level: str,
    event_type: str,
    data: Dict[str, Any],
    error: Optional[Exception] = None,
    include_stack_trace: bool = False,
) -> None:
    """
    Log structured event.
    
    Args:
        level: Log level (DEBUG, INFO, WARN, ERROR, CRITICAL)
        event_type: Event type identifier
        data: Event-specific data dictionary
        error: Optional exception object for error logs
        include_stack_trace: Whether to include stack trace (default: False for ERROR, True for CRITICAL)
    """
    # Auto-include stack trace for CRITICAL, default False for ERROR
    if level == "CRITICAL":
        include_stack_trace = True
    elif level == "ERROR" and include_stack_trace is False:
        # For ERROR, include stack trace if error object is provided
        include_stack_trace = error is not None
    
    log_entry = _build_log_entry(level, event_type, data, error, include_stack_trace)
    print(json.dumps(log_entry))


def log_debug(event_type: str, data: Dict[str, Any]) -> None:
    """Log DEBUG level event."""
    log(LogLevel.DEBUG.value, event_type, data)


def log_info(event_type: str, data: Dict[str, Any]) -> None:
    """Log INFO level event."""
    log(LogLevel.INFO.value, event_type, data)


def log_warn(event_type: str, data: Dict[str, Any], error: Optional[Exception] = None) -> None:
    """Log WARN level event."""
    log(LogLevel.WARN.value, event_type, data, error)


def log_error(
    event_type: str,
    data: Dict[str, Any],
    error: Optional[Exception] = None,
    include_stack_trace: bool = True,
) -> None:
    """
    Log ERROR level event with optional stack trace.
    
    Args:
        event_type: Event type identifier
        data: Event-specific data dictionary
        error: Optional exception object
        include_stack_trace: Whether to include stack trace (default: True)
    """
    log(LogLevel.ERROR.value, event_type, data, error, include_stack_trace)


def log_critical(
    event_type: str,
    data: Dict[str, Any],
    error: Optional[Exception] = None,
) -> None:
    """Log CRITICAL level event with stack trace."""
    log(LogLevel.CRITICAL.value, event_type, data, error, include_stack_trace=True)


def log_exception(
    event_type: str,
    data: Dict[str, Any],
    error: Exception,
    include_stack_trace: bool = True,
) -> None:
    """
    Log exception with full context.
    
    Convenience method for logging exceptions with stack trace.
    
    Args:
        event_type: Event type identifier
        data: Event-specific data dictionary
        error: Exception object
        include_stack_trace: Whether to include stack trace (default: True)
    """
    log_error(event_type, data, error, include_stack_trace)


def log_performance(
    event_type: str,
    operation: str,
    duration_ms: float,
    additional_data: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Log performance metrics.
    
    Args:
        event_type: Event type identifier
        operation: Operation name (e.g., "bedrock_invoke", "file_download")
        duration_ms: Duration in milliseconds
        additional_data: Optional additional context
    """
    data = {
        "operation": operation,
        "duration_ms": duration_ms,
    }
    if additional_data:
        data.update(additional_data)
    
    log_info(event_type, data)

