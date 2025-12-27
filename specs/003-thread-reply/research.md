# Research: Thread Reply

**Feature**: 003-thread-reply
**Date**: 2025-01-27
**Purpose**: Resolve technical clarifications and establish implementation patterns for thread reply functionality

## Overview

This document resolves technical questions about implementing thread replies in Slack and establishes the implementation approach for modifying the bot to reply in threads instead of posting new channel messages.

## Research Tasks

### 1. Slack API Thread Reply Support

**Question**: How does Slack API support thread replies? What is the `thread_ts` parameter?

**Decision**: Use `thread_ts` parameter in `chat.postMessage` API call

**Rationale**:
- **Slack API Documentation**: `chat.postMessage` method supports optional `thread_ts` parameter
- **Parameter format**: `thread_ts` must match the timestamp (`ts`) of the parent message
- **Behavior**: When `thread_ts` is provided, the message is posted as a reply in the thread, not as a new channel message
- **Compatibility**: Works identically for both channel mentions (`app_mention`) and direct messages (`message` with `channel_type: im`)

**Implementation**:
```python
# Current implementation (channel message)
client.chat_postMessage(channel=channel, text=text)

# New implementation (thread reply)
client.chat_postMessage(channel=channel, text=text, thread_ts=thread_ts)
```

**API Reference**:
- Slack API: `chat.postMessage` method
- Parameter: `thread_ts` (optional string, Slack timestamp format: "1234567890.123456")
- When provided: Message appears as thread reply
- When omitted: Message appears as new channel message (current behavior)

**Alternatives Considered**:
- **`chat.postEphemeral`**: Only visible to specific user, not suitable for channel mentions
- **`chat.postMessage` with `reply_broadcast`**: Broadcasts thread reply to channel, rejected as it defeats the purpose of thread organization
- **`conversations.replies`**: Used for reading thread replies, not posting

---

### 2. Message Timestamp Extraction

**Question**: Where is the message timestamp (`ts`) available in Slack events?

**Decision**: Extract `event.ts` from Slack event payload

**Rationale**:
- **Event structure**: Slack `event_callback` events include `event.ts` field containing the message timestamp
- **Availability**: Present in both `app_mention` and `message` event types
- **Format**: Slack timestamp format (string): "1234567890.123456" (Unix epoch with microseconds)
- **Uniqueness**: Each message has a unique timestamp that serves as its identifier

**Implementation**:
```python
# In slack-event-handler/handler.py
slack_event = body.get("event", {})
message_timestamp = slack_event.get("ts")  # Extract timestamp

# Include in payload to bedrock-processor
payload = {
    "channel": channel,
    "text": user_text,
    "bot_token": bot_token,
    "thread_ts": message_timestamp  # NEW: Add timestamp
}
```

**Event Structure**:
```json
{
  "type": "event_callback",
  "event": {
    "type": "app_mention",
    "ts": "1234567890.123456",  // ← Extract this
    "channel": "C01234567",
    "text": "<@U98765432> Hello",
    "user": "U01234567"
  }
}
```

**Validation**:
- `event.ts` is always present in `app_mention` and `message` events (per Slack API documentation)
- Format validation: Must match pattern `^\d+\.\d+$` (digits, dot, digits)
- Edge case handling: If `ts` is missing or invalid, fall back to channel message (backward compatibility)

**Alternatives Considered**:
- **`event.event_ts`**: Different field, represents event processing time, not message timestamp
- **`event.message.ts`**: Only available in message update events, not in initial events
- **Generate new timestamp**: Would create new thread instead of replying to existing message

---

### 3. Backward Compatibility Strategy

**Question**: How to handle cases where timestamp is missing or invalid?

**Decision**: Graceful degradation: fall back to channel message if `thread_ts` is missing/invalid

**Rationale**:
- **FR-006 requirement**: System MUST maintain backward compatibility with existing message posting functionality
- **FR-007 requirement**: System MUST handle cases where message timestamp is missing or invalid gracefully
- **User experience**: Better to post a channel message than fail silently or crash
- **Error handling**: Log warning when timestamp is missing but continue processing

**Implementation**:
```python
# In bedrock-processor/slack_poster.py
def post_to_slack(channel: str, text: str, bot_token: str, thread_ts: str = None) -> None:
    """
    Post a message to Slack, optionally as a thread reply.
    
    Args:
        channel: Slack channel ID
        text: Message text to post
        bot_token: Slack bot OAuth token
        thread_ts: Optional thread timestamp (if None, posts as channel message)
    """
    client = WebClient(token=bot_token)
    
    # Build API call parameters
    params = {
        "channel": channel,
        "text": text
    }
    
    # Add thread_ts only if valid
    if thread_ts and _is_valid_timestamp(thread_ts):
        params["thread_ts"] = thread_ts
    elif thread_ts:
        # Invalid timestamp: log warning but continue
        print(f"WARNING: Invalid thread_ts format: {thread_ts}, posting as channel message")
    
    response = client.chat_postMessage(**params)
```

**Validation Function**:
```python
def _is_valid_timestamp(ts: str) -> bool:
    """Validate Slack timestamp format."""
    import re
    pattern = r'^\d+\.\d+$'
    return bool(re.match(pattern, ts))
```

**Error Scenarios**:
1. **Missing `event.ts`**: Log warning, post as channel message (backward compatible)
2. **Invalid format**: Log warning, post as channel message (backward compatible)
3. **Empty string**: Treated as None, post as channel message
4. **None value**: Post as channel message (default behavior)

**Alternatives Considered**:
- **Fail fast**: Reject requests without timestamp - rejected as too strict, breaks backward compatibility
- **Return error to user**: Rejected as poor UX; user doesn't need to know about internal timestamp issues
- **Retry with channel message**: Same as graceful degradation, but simpler to implement

---

### 4. Thread Reply Error Handling

**Question**: What happens if thread reply fails (e.g., parent message deleted)?

**Decision**: Slack API handles errors gracefully; implement error handling in code

**Rationale**:
- **Slack API behavior**: If `thread_ts` references a deleted message or invalid thread, Slack API returns error
- **Error codes**: `channel_not_found`, `message_not_found`, `invalid_thread_ts`
- **User experience**: Should fall back to channel message if thread reply fails
- **Logging**: Log thread reply failures for debugging

**Implementation**:
```python
# In bedrock-processor/slack_poster.py
try:
    if thread_ts:
        response = client.chat_postMessage(
            channel=channel,
            text=text,
            thread_ts=thread_ts
        )
    else:
        response = client.chat_postMessage(channel=channel, text=text)
except SlackApiError as e:
    error_code = e.response.get("error", "")
    
    # If thread reply failed, retry as channel message
    if thread_ts and error_code in ["message_not_found", "invalid_thread_ts"]:
        print(f"WARNING: Thread reply failed ({error_code}), falling back to channel message")
        response = client.chat_postMessage(channel=channel, text=text)
    else:
        # Other errors: re-raise
        raise
```

**Error Codes**:
- `message_not_found`: Parent message was deleted
- `invalid_thread_ts`: Timestamp format invalid or message doesn't exist
- `channel_not_found`: Channel was deleted or bot removed
- `not_in_channel`: Bot not in channel (shouldn't happen for mentions)

**Fallback Strategy**:
1. Attempt thread reply with `thread_ts`
2. If error indicates thread issue (`message_not_found`, `invalid_thread_ts`), retry as channel message
3. If other error (e.g., `channel_not_found`), re-raise (indicates real problem)

**Alternatives Considered**:
- **No fallback**: Rejected as poor UX; user gets no response if thread deleted
- **Return error to user**: Rejected as confusing; user doesn't need to know about thread issues
- **Pre-validate thread exists**: Requires additional API call (`conversations.replies`), rejected as unnecessary overhead

---

### 5. Direct Messages vs Channel Mentions

**Question**: Do thread replies work differently for direct messages vs channel mentions?

**Decision**: Thread replies work identically for both; no special handling required

**Rationale**:
- **Slack API consistency**: `chat.postMessage` with `thread_ts` works identically for channels (`C*`) and DMs (`D*`)
- **User experience**: Thread replies improve organization in both contexts
- **Implementation simplicity**: Single code path handles both cases

**Implementation**:
```python
# Same code works for both channel mentions and DMs
# Channel ID format determines behavior:
# - C01234567 = Public/private channel
# - D01234567 = Direct message

# No special handling needed
client.chat_postMessage(
    channel=channel,  # Works for both C* and D*
    text=text,
    thread_ts=thread_ts  # Works for both
)
```

**Verification**:
- **Channel mentions**: Bot mentioned in channel → reply appears in thread
- **Direct messages**: User sends DM → reply appears in thread
- **UI behavior**: Slack UI shows thread indicator in both cases

**Alternatives Considered**:
- **Different behavior for DMs**: Rejected as unnecessary complexity; thread replies improve UX in both contexts
- **Skip thread replies for DMs**: Rejected per spec requirement FR-004 (handle both)

---

## Summary

**Key Decisions**:
1. Use `thread_ts` parameter in `chat.postMessage` API call
2. Extract `event.ts` from Slack event payload
3. Implement graceful degradation: fall back to channel message if timestamp missing/invalid
4. Handle thread reply errors with fallback to channel message
5. No special handling needed for DMs vs channel mentions

**Implementation Approach**:
- Modify `slack-event-handler/handler.py` to extract and pass `event.ts`
- Modify `bedrock-processor/handler.py` to accept `thread_ts` parameter
- Modify `bedrock-processor/slack_poster.py` to add optional `thread_ts` parameter and implement error handling

**Risk Mitigation**:
- Backward compatibility maintained via graceful degradation
- Error handling prevents silent failures
- Logging enables debugging of edge cases

