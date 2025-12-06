# Research: Canvas for Long Replies

**Feature**: 005-canvas-long-reply
**Date**: 2025-01-30
**Purpose**: Resolve technical clarifications and establish implementation patterns for Canvas creation and sharing functionality

## Overview

This document resolves technical questions about implementing Canvas creation and sharing for long replies and structured documents in Slack, and establishes the implementation approach for automatically using Canvas when appropriate.

## Research Tasks

### 1. Slack Canvas API Endpoints and Methods

**Question**: What are the exact API endpoints and methods for creating and sharing Canvas programmatically?

**Decision**: Use Slack Web API methods (assumed pattern based on Slack API conventions)

**Rationale**:
- **Slack API Pattern**: Slack Web API follows RESTful conventions with methods like `chat.postMessage`, `files.upload`, etc.
- **Expected Methods**: Based on Slack API patterns, Canvas operations likely use methods like:
  - `canvas.create` or `canvas.write` for creating Canvas
  - `canvas.share` or `conversations.share` for sharing Canvas in channels/threads
- **Bot Token Authentication**: Canvas operations require bot token with appropriate scopes
- **API Documentation**: Official Slack Canvas API documentation may be limited or require workspace admin access; implementation will need to be validated through testing

**Implementation Approach**:
```python
# Assumed API pattern (to be validated)
from slack_sdk import WebClient

client = WebClient(token=bot_token)

# Create Canvas
response = client.canvas_create(
    title="AI Response",
    content=canvas_content,  # Formatted content
    workspace_id=workspace_id
)

# Share Canvas in thread/channel
response = client.canvas_share(
    canvas_id=canvas_id,
    channel=channel,
    thread_ts=thread_ts  # Optional for thread context
)
```

**Alternatives Considered**:
- **Manual Canvas Creation**: Users create Canvas manually - rejected as it doesn't meet automation requirement
- **File Upload Alternative**: Use `files.upload` with formatted content - rejected as Canvas provides better formatting and structure
- **Message Blocks**: Use Slack Block Kit for structured content - rejected as Canvas provides better long-form content presentation

**Validation Required**: 
- Test Canvas API methods with bot token
- Verify required scopes/permissions
- Confirm API endpoint availability

---

### 2. Canvas Content Formatting and Structure

**Question**: How should Canvas content be formatted? What format does the Canvas API accept?

**Decision**: Use structured content format (likely JSON or markdown-based)

**Rationale**:
- **Canvas Content Format**: Canvas likely accepts structured content in JSON format (similar to Slack Block Kit) or markdown
- **Formatting Preservation**: Structured elements (headings, lists, tables, code blocks) should be preserved in Canvas format
- **Content Structure**: Canvas content should maintain readability with appropriate structure (paragraphs, headings, lists)

**Implementation Approach**:
```python
# Assumed Canvas content structure (to be validated)
canvas_content = {
    "blocks": [
        {
            "type": "header",
            "text": "AI Response"
        },
        {
            "type": "section",
            "text": formatted_reply_content  # With preserved structure
        }
    ]
}
```

**Alternatives Considered**:
- **Plain Text**: Simple text content - rejected as it doesn't leverage Canvas formatting capabilities
- **HTML**: HTML-formatted content - rejected as Slack APIs typically use JSON/Block Kit format
- **Markdown**: Markdown-formatted content - possible alternative if Canvas API supports markdown

**Validation Required**:
- Test Canvas content format with actual API
- Verify formatting preservation (headings, lists, code blocks)
- Confirm content size limits

---

### 3. Structured Document Formatting Detection

**Question**: What specific patterns or markers indicate structured document formatting (headings, lists, tables, code blocks)?

**Decision**: Use pattern matching to detect markdown-style formatting and structural elements

**Rationale**:
- **Markdown Patterns**: AI models (Claude) often generate markdown-formatted responses
- **Common Patterns**:
  - Headings: Lines starting with `#`, `##`, `###` (markdown headers)
  - Lists: Lines starting with `-`, `*`, `+` (unordered) or `1.`, `2.` (ordered)
  - Code blocks: Text between triple backticks (```)
  - Tables: Pipe-separated values (`| col1 | col2 |`)
- **Detection Threshold**: Presence of 2+ structural elements indicates structured formatting
- **Pattern Matching**: Use regex patterns to detect these elements

**Implementation Approach**:
```python
import re

def detect_structured_formatting(text: str) -> bool:
    """Detect if text contains structured document formatting."""
    patterns = {
        'headings': r'^#{1,6}\s+.+$',  # Markdown headings
        'lists': r'^[\s]*[-*+]\s+|^[\s]*\d+\.\s+',  # Unordered/ordered lists
        'code_blocks': r'```[\s\S]*?```',  # Code blocks
        'tables': r'\|.+\|',  # Tables (pipe-separated)
    }
    
    matches = sum(1 for pattern in patterns.values() if re.search(pattern, text, re.MULTILINE))
    return matches >= 2  # At least 2 structural elements
```

**Alternatives Considered**:
- **AI-Based Detection**: Use AI to classify content type - rejected as overkill for pattern detection
- **Length-Only**: Only use length threshold - rejected as spec requires structured formatting detection
- **Single Pattern**: Require only one pattern match - rejected as too permissive (may match accidental formatting)

**Validation Required**:
- Test pattern matching with various AI response formats
- Verify detection accuracy with real AI-generated content
- Tune threshold (2+ elements) based on testing

---

### 4. Canvas API Rate Limits and Content Size Limits

**Question**: What are the rate limits and content size limits for Canvas API?

**Decision**: Assume standard Slack API rate limits; implement content size validation

**Rationale**:
- **Slack API Rate Limits**: Standard Slack API methods typically have Tier 2 rate limits (20 requests/minute per method)
- **Content Size Limits**: Canvas likely has content size limits (assumed similar to message limits or larger)
- **Error Handling**: Must handle rate limit errors gracefully with retry logic
- **Content Validation**: Validate content size before Canvas creation

**Implementation Approach**:
```python
# Assumed limits (to be validated)
CANVAS_MAX_CONTENT_SIZE = 100000  # 100KB (assumed, to be validated)
SLACK_API_RATE_LIMIT = 20  # requests per minute (Tier 2)

def validate_canvas_content_size(content: str) -> bool:
    """Validate Canvas content size."""
    return len(content.encode('utf-8')) <= CANVAS_MAX_CONTENT_SIZE
```

**Alternatives Considered**:
- **No Size Validation**: Assume no limits - rejected as risky; may cause API errors
- **Very Conservative Limits**: Use very small limits - rejected as may prevent legitimate Canvas creation
- **Dynamic Limits**: Query API for limits - rejected as adds complexity; assume standard limits

**Validation Required**:
- Test Canvas API with various content sizes
- Verify rate limit behavior
- Confirm actual content size limits

---

### 5. Canvas Sharing in Threads

**Question**: How does Canvas sharing work in thread contexts? Does it support `thread_ts` parameter?

**Decision**: Assume Canvas sharing supports thread context (similar to `chat.postMessage`)

**Rationale**:
- **Slack API Pattern**: Most Slack API methods that post content support `thread_ts` for thread context
- **Thread Sharing**: Canvas sharing likely supports `thread_ts` parameter to associate Canvas with thread
- **Fallback Behavior**: If thread sharing fails, fall back to channel sharing

**Implementation Approach**:
```python
# Assumed API pattern (to be validated)
def share_canvas_in_thread(
    client: WebClient,
    canvas_id: str,
    channel: str,
    thread_ts: Optional[str] = None
) -> dict:
    """Share Canvas in thread or channel."""
    params = {
        "canvas_id": canvas_id,
        "channel": channel
    }
    
    if thread_ts and _is_valid_timestamp(thread_ts):
        params["thread_ts"] = thread_ts
    
    return client.canvas_share(**params)
```

**Alternatives Considered**:
- **Channel-Only Sharing**: Always share in channel - rejected as spec requires thread support
- **Separate Thread API**: Use different API for thread sharing - rejected as adds complexity; assume unified API

**Validation Required**:
- Test Canvas sharing with `thread_ts` parameter
- Verify thread association behavior
- Confirm fallback behavior if thread sharing fails

---

### 6. Bot Token Permissions for Canvas

**Question**: What bot token permissions/scopes are required for Canvas creation and sharing?

**Decision**: Assume `canvas:write` scope or equivalent (per spec assumptions)

**Rationale**:
- **Spec Assumptions**: Spec assumes `canvas:write` or equivalent scope
- **Slack Scope Pattern**: Slack scopes typically follow `resource:action` pattern
- **Permission Requirements**: Canvas creation and sharing likely require write permissions
- **Error Handling**: Must handle permission errors gracefully with fallback to regular messages

**Implementation Approach**:
```python
# Assumed scope requirement
REQUIRED_SCOPE = "canvas:write"  # Or equivalent

def check_canvas_permissions(bot_token: str) -> bool:
    """Check if bot token has Canvas permissions."""
    # Validate token has required scope
    # Implementation depends on Slack API auth info method
    pass
```

**Alternatives Considered**:
- **No Permission Check**: Assume permissions always available - rejected as may cause runtime errors
- **Strict Permission Enforcement**: Fail if permissions missing - rejected as too strict; fallback to regular messages is better UX

**Validation Required**:
- Test Canvas API with bot token
- Verify required scopes
- Confirm permission error handling

---

## Summary of Decisions

1. **Canvas API Methods**: Use assumed `canvas.create` and `canvas.share` methods (to be validated)
2. **Content Format**: Use structured JSON format (similar to Block Kit) for Canvas content
3. **Formatting Detection**: Use regex pattern matching to detect markdown-style structural elements (headings, lists, code blocks, tables)
4. **Rate Limits**: Assume standard Slack API Tier 2 rate limits (20 requests/minute)
5. **Content Size**: Assume 100KB content size limit (to be validated)
6. **Thread Sharing**: Assume Canvas sharing supports `thread_ts` parameter
7. **Permissions**: Assume `canvas:write` scope required (per spec assumptions)

## Validation Requirements

All assumptions require validation through:
1. **API Testing**: Test Canvas API methods with actual bot token
2. **Integration Testing**: Test Canvas creation and sharing in real Slack workspace
3. **Error Handling Testing**: Test error scenarios (permissions, rate limits, content size)
4. **Formatting Testing**: Test structured formatting detection and preservation

## Implementation Notes

- **Progressive Validation**: Implement with assumptions, validate through testing, adjust as needed
- **Fallback Strategy**: Always fall back to regular messages if Canvas creation fails
- **Error Logging**: Log all Canvas API errors for monitoring and debugging
- **User Experience**: Ensure Canvas creation doesn't significantly impact response time (target: <5 seconds additional time)

