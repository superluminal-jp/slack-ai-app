"""
File limit configuration for generated file artifacts (014, 027).

Defines maximum file size and allowed MIME types for files returned from
Execution Zone to Verification Zone via A2A. Values are read from environment
with fallback to defaults per research R-003 (014) and research.md §2.1 (027).

027 extensions: Per-file-type size limits, sanitize_filename, generated file MIME types.
"""

import os
import re
import time
from typing import List

# Defaults: 014 used 5 MB; 027 uses 10 MB for generated files (research.md §2.1)
_DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB — Slack workspace limit

# 027: Per-file-type size limits (research.md §2.1)
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB — Slack workspace limit
MAX_TEXT_FILE_BYTES = 1 * 1024 * 1024   # 1 MB — text-based (.md, .csv, .txt)
MAX_OFFICE_FILE_BYTES = 10 * 1024 * 1024  # 10 MB — Office (.docx, .xlsx, .pptx)
MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024   # 5 MB — image (.png)

# 027: Extended defaults for generated files (contracts/execution-response.yaml)
_DEFAULT_ALLOWED_MIME_TYPES = [
    "text/csv",
    "application/json",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/png",
]

# Windows forbidden chars (data-model.md): \ / : * ? " < > |
_FORBIDDEN_CHARS_RE = re.compile(r'[\\/:*?"<>|]')


def get_max_file_size_bytes() -> int:
    """Return max allowed file size in bytes (from env MAX_FILE_SIZE_BYTES or default 10 MB)."""
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


def sanitize_filename(filename: str, extension: str = "") -> str:
    """
    Sanitize filename for cross-platform and Slack compatibility (027, data-model.md §2.2).

    - Remove control chars (0x00–0x1F)
    - Replace \\ / : * ? " < > | with _
    - Strip leading/trailing spaces and dots
    - Fallback to generated_file_{timestamp}.{ext} when empty
    """
    if not filename or not isinstance(filename, str):
        base = f"generated_file_{int(time.time())}"
        return f"{base}.{extension}" if extension else base
    # Remove control characters
    sanitized = "".join(c for c in filename if ord(c) >= 0x20)
    # Replace forbidden chars with underscore
    sanitized = _FORBIDDEN_CHARS_RE.sub("_", sanitized)
    # Strip leading/trailing whitespace and dots
    sanitized = sanitized.strip(" \t\n\r.")
    if not sanitized:
        base = f"generated_file_{int(time.time())}"
        return f"{base}.{extension}" if extension else base
    return sanitized
