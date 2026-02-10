"""
File limit configuration for generated file artifacts (014).

Defines maximum file size and allowed MIME types for files returned from
Execution Zone to Verification Zone via A2A. Values are read from environment
with fallback to defaults per research R-003.
"""

import os
from typing import List

# Defaults per research R-003 (5 MB, text/csv, application/json, text/plain)
_DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
_DEFAULT_ALLOWED_MIME_TYPES = ["text/csv", "application/json", "text/plain"]


def get_max_file_size_bytes() -> int:
    """Return max allowed file size in bytes (from env MAX_FILE_SIZE_BYTES or default 5 MB)."""
    raw = os.environ.get("MAX_FILE_SIZE_BYTES")
    if raw is None or not raw.strip():
        return _DEFAULT_MAX_FILE_SIZE_BYTES
    try:
        value = int(raw.strip())
        return max(1, value) if value > 0 else _DEFAULT_MAX_FILE_SIZE_BYTES
    except ValueError:
        return _DEFAULT_MAX_FILE_SIZE_BYTES


def get_allowed_mime_types() -> List[str]:
    """Return allowed MIME types (from env ALLOWED_MIME_TYPES comma-separated or default)."""
    raw = os.environ.get("ALLOWED_MIME_TYPES")
    if raw is None or not raw.strip():
        return list(_DEFAULT_ALLOWED_MIME_TYPES)
    types = [s.strip().lower() for s in raw.split(",") if s.strip()]
    return types if types else list(_DEFAULT_ALLOWED_MIME_TYPES)


def is_within_size_limit(size_bytes: int) -> bool:
    """Return True if size_bytes is within configured max (inclusive)."""
    return 0 <= size_bytes <= get_max_file_size_bytes()


def is_allowed_mime(mime_type: str) -> bool:
    """Return True if mime_type is in allowed list (case-insensitive)."""
    if not mime_type or not isinstance(mime_type, str):
        return False
    return mime_type.strip().lower() in get_allowed_mime_types()
