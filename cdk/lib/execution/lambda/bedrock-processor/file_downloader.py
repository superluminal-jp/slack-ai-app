"""
File downloader module for Slack attachments.

Downloads files from Slack CDN using bot token authentication.
Follows Slack official best practices:
- Uses files.info API to get fresh download URLs
- Implements exponential backoff for retries
- Handles rate limiting (429 errors) with Retry-After header
- Validates downloaded content (Content-Type, size, magic bytes)

Reference: https://api.slack.com/methods/files.info
"""

import requests

from logger_util import get_logger, log

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="execution-agent-file-downloader")


# Retry configuration
MAX_RETRIES = 3
BASE_DELAY_SECONDS = 1.0
MAX_DELAY_SECONDS = 30.0
JITTER_FACTOR = 0.5  # Random jitter up to 50% of delay


def _calculate_backoff_delay(attempt: int, base_delay: float = BASE_DELAY_SECONDS) -> float:
    """
    Calculate exponential backoff delay with jitter.
    
    Args:
        attempt: Current attempt number (0-indexed)
        base_delay: Base delay in seconds
        
    Returns:
        Delay in seconds with jitter applied
    """
    # Exponential backoff: base_delay * 2^attempt
    delay = min(base_delay * (2 ** attempt), MAX_DELAY_SECONDS)
    
    # Add random jitter to prevent thundering herd
    jitter = delay * JITTER_FACTOR * random.random()
    
    return delay + jitter


def get_file_download_url(
    file_id: str,
    bot_token: str,
    max_retries: int = MAX_RETRIES,
) -> Optional[str]:
    """
    Get the download URL for a file using Slack's files.info API.
    
    Slack official best practice: Event payload URLs may be stale or expired.
    Always fetch fresh download URL via files.info API for reliable downloads.
    
    Implements:
    - Exponential backoff with jitter for transient failures
    - Rate limit handling (429) with Retry-After header
    
    Args:
        file_id: Slack file ID (e.g., "F0A1W7HRGQ6")
        bot_token: Slack bot OAuth token (xoxb-*)
        max_retries: Maximum number of retry attempts (default: 3)
        
    Returns:
        Download URL string, or None if API call fails after all retries
    """
    if not file_id or not bot_token:
        return None
    
    last_error = None
    
    for attempt in range(max_retries):
        try:
            response = requests.get(
                "https://slack.com/api/files.info",
                headers={"Authorization": f"Bearer {bot_token}"},
                params={"file": file_id},
                timeout=10,
            )
            
            # Handle rate limiting (429)
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", _calculate_backoff_delay(attempt)))
                log_warn(
                    "files_info_rate_limited",
                    {
                        "file_id": file_id,
                        "retry_after": retry_after,
                        "attempt": attempt + 1,
                    },
                )
                time.sleep(retry_after)
                continue
            
            response.raise_for_status()
            
            data = response.json()
            if not data.get("ok"):
                error = data.get("error", "unknown")
                
                # Some errors are not retryable
                non_retryable_errors = ["file_not_found", "file_deleted", "invalid_auth"]
                if error in non_retryable_errors:
                    log_error(
                        "files_info_api_error",
                        {
                            "file_id": file_id,
                            "error": error,
                            "retryable": False,
                        },
                    )
                    return None
                
                # Retryable error - log and continue
                log_warn(
                    "files_info_api_error_retrying",
                    {
                        "file_id": file_id,
                        "error": error,
                        "attempt": attempt + 1,
                    },
                )
                last_error = error
                time.sleep(_calculate_backoff_delay(attempt))
                continue
            
            file_info = data.get("file", {})
            download_url = file_info.get("url_private_download") or file_info.get("url_private")
            
            if download_url:
                log_info(
                    "files_info_url_retrieved",
                    {
                        "file_id": file_id,
                        "has_url": True,
                        "attempts": attempt + 1,
                    },
                )
                return download_url
            else:
                log_warn(
                    "files_info_no_download_url",
                    {"file_id": file_id},
                )
                return None
            
        except requests.exceptions.Timeout:
            log_warn(
                "files_info_timeout",
                {
                    "file_id": file_id,
                    "attempt": attempt + 1,
                },
            )
            last_error = "timeout"
            time.sleep(_calculate_backoff_delay(attempt))
            
        except requests.exceptions.RequestException as e:
            log_exception(
                "files_info_request_error",
                {
                    "file_id": file_id,
                    "attempt": attempt + 1,
                },
                e,
            )
            last_error = str(e)
            time.sleep(_calculate_backoff_delay(attempt))
    
    # All retries exhausted
    log_error(
        "files_info_api_failed_after_retries",
        {
            "file_id": file_id,
            "last_error": last_error,
            "max_retries": max_retries,
        },
    )
    return None


# Image magic bytes for validation
IMAGE_MAGIC_BYTES = {
    b'\x89PNG\r\n\x1a\n': 'image/png',
    b'\xff\xd8\xff': 'image/jpeg',
    b'GIF87a': 'image/gif',
    b'GIF89a': 'image/gif',
    b'RIFF': 'image/webp',  # WebP starts with RIFF (need to check WEBP at offset 8)
}


def validate_image_content(content: bytes, expected_mimetype: str) -> Tuple[bool, str]:
    """
    Validate that downloaded content is actually an image by checking magic bytes.
    
    Args:
        content: Downloaded file content
        expected_mimetype: Expected MIME type (e.g., "image/png")
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not content or len(content) < 12:
        return False, "Content too small to be a valid image"
    
    # Check for HTML error pages (common when download fails)
    if content.startswith(b'<!DOCTYPE') or content.startswith(b'<html') or content.startswith(b'<HTML'):
        return False, "Downloaded content is HTML, not an image (possible error page)"
    
    # Check for JSON error responses
    if content.startswith(b'{') and b'"error"' in content[:200]:
        return False, "Downloaded content is JSON error response"
    
    # Validate PNG
    if expected_mimetype == 'image/png':
        if not content.startswith(b'\x89PNG\r\n\x1a\n'):
            return False, f"Invalid PNG: doesn't start with PNG magic bytes (got: {content[:8].hex()})"
        return True, ""
    
    # Validate JPEG
    if expected_mimetype in ('image/jpeg', 'image/jpg'):
        if not content.startswith(b'\xff\xd8\xff'):
            return False, f"Invalid JPEG: doesn't start with JPEG magic bytes (got: {content[:8].hex()})"
        return True, ""
    
    # Validate GIF
    if expected_mimetype == 'image/gif':
        if not (content.startswith(b'GIF87a') or content.startswith(b'GIF89a')):
            return False, f"Invalid GIF: doesn't start with GIF magic bytes (got: {content[:8].hex()})"
        return True, ""
    
    # Validate WebP
    if expected_mimetype == 'image/webp':
        if not (content.startswith(b'RIFF') and content[8:12] == b'WEBP'):
            return False, f"Invalid WebP: doesn't start with RIFF...WEBP magic bytes"
        return True, ""
    
    # For other types, accept if not HTML/JSON error
    return True, ""


def download_file(
    download_url: str,
    bot_token: str,
    timeout: int = 30,
    expected_size: Optional[int] = None,
    expected_mimetype: Optional[str] = None,
    max_retries: int = MAX_RETRIES,
) -> Optional[bytes]:
    """
    Download file from Slack CDN using bot token authentication.
    
    Implements Slack best practices:
    - Exponential backoff with jitter for transient failures
    - Rate limit handling (429) with Retry-After header
    - Content-Type validation to detect error pages
    - Size validation to detect truncated downloads
    - Magic bytes validation for image files
    
    Args:
        download_url: Slack file download URL (url_private_download from files.info)
        bot_token: Slack bot OAuth token (xoxb-*)
        timeout: Request timeout in seconds (default: 30)
        expected_size: Expected file size in bytes (for validation)
        expected_mimetype: Expected MIME type (for validation)
        max_retries: Maximum number of retry attempts (default: 3)
        
    Returns:
        File content as bytes, or None if download fails after all retries
    """
    if not download_url:
        return None
    
    if not bot_token:
        return None
    
    headers = {
        "Authorization": f"Bearer {bot_token}",
    }
    
    last_error = None
    
    for attempt in range(max_retries):
        try:
            # Use stream=True for large files to avoid memory issues
            response = requests.get(download_url, headers=headers, timeout=timeout, stream=True)
            
            # Handle rate limiting (429) - respect Retry-After header
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", _calculate_backoff_delay(attempt)))
                log_warn(
                    "file_download_rate_limited",
                    {
                        "retry_after": retry_after,
                        "attempt": attempt + 1,
                    },
                )
                time.sleep(retry_after)
                continue
            
            # Handle server errors (5xx) with retry
            if response.status_code >= 500:
                log_warn(
                    "file_download_server_error",
                    {
                        "status_code": response.status_code,
                        "attempt": attempt + 1,
                    },
                )
                last_error = f"Server error: {response.status_code}"
                time.sleep(_calculate_backoff_delay(attempt))
                continue
            
            # Handle client errors (4xx except 429) - not retryable
            if response.status_code >= 400:
                log_error(
                    "file_download_client_error",
                    {
                        "status_code": response.status_code,
                        "retryable": False,
                    },
                )
                return None
            
            response.raise_for_status()
            
            # Check Content-Type header
            content_type = response.headers.get('Content-Type', '')
            
            # If we expect an image but get HTML, it's likely an error page
            if expected_mimetype and expected_mimetype.startswith('image/'):
                if 'text/html' in content_type.lower():
                    log_error(
                        "file_download_wrong_content_type",
                        {
                            "expected_mimetype": expected_mimetype,
                            "actual_content_type": content_type,
                            "message": "Received HTML instead of image - likely error page or permission issue",
                        },
                    )
                    return None
            
            # Read content
            content = response.content
            
            # Validate downloaded size against expected size
            if expected_size and expected_size > 0:
                size_ratio = len(content) / expected_size
                if size_ratio < 0.5:  # Downloaded less than 50% of expected
                    log_warn(
                        "file_download_size_mismatch",
                        {
                            "expected_size": expected_size,
                            "actual_size": len(content),
                            "ratio": round(size_ratio, 4),
                            "message": "Downloaded significantly less than expected size",
                        },
                    )
            
            # Validate image content if expected
            if expected_mimetype and expected_mimetype.startswith('image/'):
                is_valid, error_msg = validate_image_content(content, expected_mimetype)
                if not is_valid:
                    log_error(
                        "file_download_content_validation_failed",
                        {
                            "expected_mimetype": expected_mimetype,
                            "error": error_msg,
                            "content_size": len(content),
                            "content_preview": content[:50].hex() if content else None,
                        },
                    )
                    return None
            
            # Success - log and return
            if attempt > 0:
                log_info(
                    "file_download_success_after_retry",
                    {
                        "attempts": attempt + 1,
                        "content_size": len(content),
                    },
                )
            
            return content
            
        except requests.exceptions.Timeout:
            log_warn(
                "file_download_timeout",
                {
                    "timeout": timeout,
                    "attempt": attempt + 1,
                },
            )
            last_error = "timeout"
            time.sleep(_calculate_backoff_delay(attempt))
            
        except requests.exceptions.RequestException as e:
            log_exception(
                "file_download_request_error",
                {
                    "attempt": attempt + 1,
                },
                e,
            )
            last_error = str(e)
            time.sleep(_calculate_backoff_delay(attempt))
    
    # All retries exhausted
    log_error(
        "file_download_failed_after_retries",
        {
            "last_error": last_error,
            "max_retries": max_retries,
            "download_url": download_url[:100] if download_url else None,
        },
    )
    return None

