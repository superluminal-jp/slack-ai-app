# Quick Start Guide: Canvas for Long Replies

**Feature**: 005-canvas-long-reply  
**Date**: 2025-01-30  
**Purpose**: Quick reference for implementing Canvas creation and sharing functionality

## Overview

This feature automatically uses Slack Canvas for long replies (exceeding 800 characters) or structured document formatting (headings, lists, tables, code blocks). The system creates a Canvas, shares it in the appropriate thread or channel, and posts a brief summary message.

## Key Components

### 1. Reply Router (`reply_router.py`)

Determines whether to use Canvas or regular message based on length and formatting.

```python
from reply_router import should_use_canvas

def should_use_canvas(reply_text: str) -> bool:
    """
    Determine if reply should use Canvas.
    
    Returns True if:
    - Reply length > 800 characters, OR
    - Reply contains structured formatting (headings, lists, code blocks, tables)
    """
    length = len(reply_text)
    has_formatting = detect_structured_formatting(reply_text)
    
    return (length > 800) or has_formatting
```

### 2. Formatting Detector (`formatting_detector.py`)

Detects structured document formatting in reply text.

```python
from formatting_detector import detect_structured_formatting
import re

def detect_structured_formatting(text: str) -> bool:
    """
    Detect if text contains structured document formatting.
    
    Returns True if at least 2 structural elements are found:
    - Headings (markdown #, ##, ###)
    - Lists (unordered - * + or ordered 1. 2.)
    - Code blocks (triple backticks)
    - Tables (pipe-separated | col1 | col2 |)
    """
    patterns = {
        'headings': r'^#{1,6}\s+.+$',
        'lists': r'^[\s]*[-*+]\s+|^[\s]*\d+\.\s+',
        'code_blocks': r'```[\s\S]*?```',
        'tables': r'\|.+\|',
    }
    
    matches = sum(
        1 for pattern in patterns.values()
        if re.search(pattern, text, re.MULTILINE)
    )
    
    return matches >= 2
```

### 3. Canvas Creator (`canvas_creator.py`)

Creates Canvas via Slack API.

```python
from canvas_creator import create_canvas
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

def create_canvas(
    bot_token: str,
    title: str,
    content: str
) -> dict:
    """
    Create Canvas via Slack API.
    
    Returns:
        {
            "success": True,
            "canvas_id": "C01234567"
        }
        or
        {
            "success": False,
            "error_code": "permission_error",
            "error_message": "..."
        }
    """
    client = WebClient(token=bot_token)
    
    try:
        # Assumed API method (to be validated)
        response = client.canvas_create(
            title=title,
            content=format_canvas_content(content)
        )
        
        if response.get("ok"):
            return {
                "success": True,
                "canvas_id": response["canvas"]["id"]
            }
        else:
            return {
                "success": False,
                "error_code": response.get("error", "unknown"),
                "error_message": response.get("error_message", "Canvas creation failed")
            }
    except SlackApiError as e:
        error_code = e.response.get("error", "unknown")
        return {
            "success": False,
            "error_code": map_error_code(error_code),
            "error_message": str(e)
        }

def format_canvas_content(content: str) -> dict:
    """
    Format reply content for Canvas (assumed structure).
    """
    return {
        "blocks": [
            {
                "type": "header",
                "text": "AI Response"
            },
            {
                "type": "section",
                "text": content
            }
        ]
    }
```

### 4. Canvas Sharer (`canvas_sharer.py`)

Shares Canvas in thread or channel.

```python
from canvas_sharer import share_canvas
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from typing import Optional

def share_canvas(
    bot_token: str,
    canvas_id: str,
    channel: str,
    thread_ts: Optional[str] = None
) -> dict:
    """
    Share Canvas in thread or channel.
    
    Returns:
        {
            "success": True
        }
        or
        {
            "success": False,
            "error_code": "...",
            "error_message": "..."
        }
    """
    client = WebClient(token=bot_token)
    
    try:
        # Assumed API method (to be validated)
        params = {
            "canvas_id": canvas_id,
            "channel": channel
        }
        
        if thread_ts and _is_valid_timestamp(thread_ts):
            params["thread_ts"] = thread_ts
        
        response = client.canvas_share(**params)
        
        if response.get("ok"):
            return {"success": True}
        else:
            return {
                "success": False,
                "error_code": response.get("error", "unknown"),
                "error_message": response.get("error_message", "Canvas sharing failed")
            }
    except SlackApiError as e:
        return {
            "success": False,
            "error_code": map_error_code(e.response.get("error", "unknown")),
            "error_message": str(e)
        }
```

### 5. Handler Integration (`handler.py`)

Main handler logic integrating Canvas creation.

```python
from reply_router import should_use_canvas
from canvas_creator import create_canvas
from canvas_sharer import share_canvas
from slack_poster import post_to_slack

def lambda_handler(event, context):
    """
    Process Bedrock response and post to Slack (with Canvas support).
    """
    # ... existing Bedrock invocation ...
    reply_text = bedrock_response["content"][0]["text"]
    
    # Determine if Canvas should be used
    use_canvas = should_use_canvas(reply_text)
    
    if use_canvas:
        # Create Canvas
        canvas_result = create_canvas(
            bot_token=bot_token,
            title="AI Response",
            content=reply_text
        )
        
        if canvas_result["success"]:
            # Share Canvas
            share_result = share_canvas(
                bot_token=bot_token,
                canvas_id=canvas_result["canvas_id"],
                channel=channel,
                thread_ts=thread_ts
            )
            
            if share_result["success"]:
                # Post summary message
                summary = "📄 I've created a Canvas with the full response."
                post_to_slack(
                    channel=channel,
                    text=summary,
                    bot_token=bot_token,
                    thread_ts=thread_ts
                )
            else:
                # Canvas sharing failed, fallback to regular message
                fallback_to_regular_message(reply_text, channel, bot_token, thread_ts)
        else:
            # Canvas creation failed, fallback to regular message
            fallback_to_regular_message(reply_text, channel, bot_token, thread_ts)
    else:
        # Regular message (existing behavior)
        post_to_slack(
            channel=channel,
            text=reply_text,
            bot_token=bot_token,
            thread_ts=thread_ts
        )

def fallback_to_regular_message(
    reply_text: str,
    channel: str,
    bot_token: str,
    thread_ts: Optional[str]
):
    """
    Fallback to regular message if Canvas creation/sharing fails.
    """
    # Truncate if exceeds Slack message limit (4000 chars)
    if len(reply_text) > 4000:
        truncated = reply_text[:3997] + "..."
        post_to_slack(
            channel=channel,
            text=truncated,
            bot_token=bot_token,
            thread_ts=thread_ts
        )
    else:
        post_to_slack(
            channel=channel,
            text=reply_text,
            bot_token=bot_token,
            thread_ts=thread_ts
        )
```

## Implementation Steps

### Step 1: Create Formatting Detector

1. Create `lambda/bedrock-processor/formatting_detector.py`
2. Implement `detect_structured_formatting()` function
3. Add unit tests

### Step 2: Create Reply Router

1. Create `lambda/bedrock-processor/reply_router.py`
2. Implement `should_use_canvas()` function
3. Add unit tests

### Step 3: Create Canvas Creator

1. Create `lambda/bedrock-processor/canvas_creator.py`
2. Implement `create_canvas()` function
3. Add error handling for API errors, permissions, rate limits
4. Add unit tests (mock Slack API)

### Step 4: Create Canvas Sharer

1. Create `lambda/bedrock-processor/canvas_sharer.py`
2. Implement `share_canvas()` function
3. Add error handling
4. Add unit tests (mock Slack API)

### Step 5: Modify Handler

1. Modify `lambda/bedrock-processor/handler.py`
2. Add Canvas creation logic after Bedrock response
3. Add fallback logic for Canvas failures
4. Update logging

### Step 6: Update Slack Poster (Optional)

1. Modify `lambda/bedrock-processor/slack_poster.py` if needed
2. Ensure thread_ts support is maintained

## Testing

### Unit Tests

```python
# test_formatting_detector.py
def test_detect_headings():
    text = "# Heading\n## Subheading\nSome text"
    assert detect_structured_formatting(text) == True

def test_detect_lists():
    text = "- Item 1\n- Item 2\nSome text"
    assert detect_structured_formatting(text) == True

def test_detect_code_blocks():
    text = "Some text\n```code```\nMore text"
    assert detect_structured_formatting(text) == True

# test_reply_router.py
def test_should_use_canvas_long():
    text = "A" * 801  # 801 characters
    assert should_use_canvas(text) == True

def test_should_use_canvas_short():
    text = "Short reply"  # < 800 characters
    assert should_use_canvas(text) == False

def test_should_use_canvas_formatting():
    text = "# Heading\n## Subheading\nSome text"  # Structured formatting
    assert should_use_canvas(text) == True
```

### Integration Tests

1. Test Canvas creation with real bot token (in test workspace)
2. Test Canvas sharing in thread
3. Test Canvas sharing in channel
4. Test fallback behavior when Canvas creation fails
5. Test error handling (permissions, rate limits)

## Error Handling

### Canvas Creation Errors

- **Permission Error**: Fallback to regular message, log warning
- **Rate Limit**: Retry with exponential backoff, fallback if retries exhausted
- **Content Too Large**: Truncate content or fallback to regular message
- **API Error**: Fallback to regular message, log error

### Canvas Sharing Errors

- **Canvas Not Found**: Fallback to regular message, log error
- **Channel Not Found**: Fallback to regular message, log error
- **Thread Not Found**: Fallback to channel message (without thread_ts), log warning

## Monitoring

### Metrics to Track

- Canvas creation success rate
- Canvas creation failure rate (by error type)
- Canvas sharing success rate
- Fallback to regular message rate
- Average Canvas creation time
- Structured formatting detection accuracy

### Logging

```python
log_info("canvas_creation_attempt", {
    "reply_length": len(reply_text),
    "has_formatting": has_formatting,
    "use_canvas": use_canvas
})

log_info("canvas_creation_success", {
    "canvas_id": canvas_id,
    "creation_time_ms": creation_time
})

log_error("canvas_creation_failure", {
    "error_code": error_code,
    "error_message": error_message,
    "fallback_used": True
})
```

## Configuration

### Environment Variables

- `CANVAS_LENGTH_THRESHOLD`: Reply length threshold (default: 800)
- `CANVAS_MAX_CONTENT_SIZE`: Maximum Canvas content size (default: 100000 bytes)
- `CANVAS_RETRY_MAX_ATTEMPTS`: Maximum retry attempts for rate limits (default: 3)

## Validation Checklist

Before deployment:

- [ ] Formatting detector correctly identifies structured content
- [ ] Reply router correctly determines Canvas usage
- [ ] Canvas creation works with bot token
- [ ] Canvas sharing works in threads
- [ ] Canvas sharing works in channels
- [ ] Fallback to regular message works correctly
- [ ] Error handling covers all scenarios
- [ ] Logging includes all required events
- [ ] Unit tests pass
- [ ] Integration tests pass (in test workspace)

## Notes

- Canvas API methods are assumed and require validation through testing
- Canvas content format is assumed (similar to Block Kit) and may need adjustment
- Rate limits and content size limits are assumed and require validation
- Bot token must have `canvas:write` scope (or equivalent)

