# Quickstart: Thread Reply Feature

**Feature**: 003-thread-reply  
**Date**: 2025-01-27  
**Purpose**: Testing and validation guide for thread reply functionality

## Overview

This guide provides step-by-step instructions for testing the thread reply feature modification. The feature modifies bot behavior to reply in threads instead of posting new channel messages.

## Prerequisites

- Existing Slack Bedrock MVP deployment (001-slack-bedrock-mvp)
- Bot installed in test Slack workspace
- Access to AWS CloudWatch logs for debugging
- Test Slack workspace with bot permissions

## Testing Thread Reply Functionality

### Test Case 1: Channel Mention Thread Reply

**Objective**: Verify bot responds in thread when mentioned in channel

**Steps**:

1. Open a Slack channel where the bot is installed
2. Mention the bot: `@bot-name What is the weather today?`
3. Wait for bot response (typically 5-15 seconds)

**Expected Result**:

- Bot response appears as thread reply (not new channel message)
- Thread indicator shows on original message
- Clicking thread shows bot response

**Verification**:

- ✅ Bot response appears in thread (not channel feed)
- ✅ Thread indicator visible on original message
- ✅ Thread reply correctly associated with parent message

---

### Test Case 2: Direct Message Thread Reply

**Objective**: Verify bot responds in thread for direct messages

**Steps**:

1. Open direct message with bot
2. Send message: `Hello, can you help me?`
3. Wait for bot response

**Expected Result**:

- Bot response appears as thread reply in DM thread
- Thread indicator shows on original message

**Verification**:

- ✅ Bot response appears in thread
- ✅ Thread indicator visible on original message

---

### Test Case 3: Multiple Thread Replies

**Objective**: Verify multiple bot responses appear in same thread

**Steps**:

1. Mention bot in channel: `@bot-name What is Python?`
2. Wait for bot response
3. Reply in thread: `Can you give an example?`
4. Wait for bot response

**Expected Result**:

- Both bot responses appear in same thread
- Thread contains conversation history

**Verification**:

- ✅ First response in thread
- ✅ Second response in same thread
- ✅ Thread shows conversation flow

---

### Test Case 4: Backward Compatibility

**Objective**: Verify system handles missing timestamp gracefully

**Steps**:

1. Check CloudWatch logs for any warnings about missing `thread_ts`
2. Verify bot still responds even if timestamp extraction fails

**Expected Result**:

- Bot responds as channel message if timestamp missing/invalid
- Warning logged but no error
- User still receives response

**Verification**:

- ✅ Bot responds (may be channel message if timestamp issue)
- ✅ No errors in CloudWatch logs
- ✅ Warning logged if timestamp missing

---

### Test Case 5: Error Handling

**Objective**: Verify graceful handling of thread reply failures

**Steps**:

1. Mention bot in channel
2. Delete the original message immediately (before bot responds)
3. Wait for bot response

**Expected Result**:

- Bot falls back to channel message if thread reply fails
- Error logged but user still receives response

**Verification**:

- ✅ Bot responds (as channel message)
- ✅ Error logged in CloudWatch (message_not_found or invalid_thread_ts)
- ✅ No silent failures

---

## Manual Code Verification

### 1. Verify Timestamp Extraction

**File**: `lambda/slack-event-handler/handler.py`

**Check**:

```python
# Should extract event.ts
slack_event = body.get("event", {})
message_timestamp = slack_event.get("ts")

# Should include in payload
payload = {
    "channel": channel,
    "text": user_text,
    "bot_token": bot_token,
    "thread_ts": message_timestamp  # ← Verify this exists
}
```

---

### 2. Verify Thread Reply Posting

**File**: `lambda/bedrock-processor/slack_poster.py`

**Check**:

```python
# Function signature should include thread_ts
def post_to_slack(channel: str, text: str, bot_token: str, thread_ts: str = None) -> None:

# API call should include thread_ts if provided
if thread_ts and _is_valid_timestamp(thread_ts):
    response = client.chat_postMessage(
        channel=channel,
        text=text,
        thread_ts=thread_ts  # ← Verify this exists
    )
```

---

### 3. Verify Error Handling

**File**: `lambda/bedrock-processor/slack_poster.py`

**Check**:

```python
# Should handle thread reply errors gracefully
try:
    if thread_ts:
        response = client.chat_postMessage(...)
except SlackApiError as e:
    if error_code in ["message_not_found", "invalid_thread_ts"]:
        # Fall back to channel message
        response = client.chat_postMessage(channel=channel, text=text)
```

---

## CloudWatch Log Verification

### Expected Log Entries

**Successful Thread Reply**:

```json
{
  "level": "INFO",
  "event": "slack_post_success",
  "channel": "C01234567",
  "response_length": 150,
  "thread_ts": "1234567890.123456"
}
```

**Fallback to Channel Message**:

```json
{
  "level": "WARN",
  "event": "thread_reply_fallback",
  "channel": "C01234567",
  "reason": "invalid_thread_ts"
}
```

**Missing Timestamp**:

```json
{
  "level": "WARN",
  "event": "thread_ts_missing",
  "channel": "C01234567",
  "fallback": "channel_message"
}
```

---

## Troubleshooting

### Issue: Bot still posts channel messages instead of thread replies

**Possible Causes**:

1. `thread_ts` not extracted from event
2. `thread_ts` not passed to bedrock-processor
3. `thread_ts` not included in API call

**Debug Steps**:

1. Check CloudWatch logs for `thread_ts` in payload
2. Verify `event.ts` exists in Slack event payload
3. Check `slack_poster.py` includes `thread_ts` in API call

---

### Issue: Thread reply fails with error

**Possible Causes**:

1. Parent message deleted
2. Invalid timestamp format
3. Bot not in channel

**Debug Steps**:

1. Check CloudWatch logs for error code
2. Verify timestamp format matches `^\d+\.\d+$`
3. Verify bot has channel permissions

---

### Issue: Backward compatibility broken

**Possible Causes**:

1. `thread_ts` marked as required instead of optional
2. Error handling not implemented

**Debug Steps**:

1. Verify `thread_ts` is optional in function signature
2. Test with payload missing `thread_ts`
3. Verify fallback to channel message works

---

## Success Criteria Validation

### SC-001: 100% Thread Replies for Channel Mentions

- ✅ Test Case 1 passes
- ✅ All channel mentions result in thread replies

### SC-002: 100% Thread Replies for Direct Messages

- ✅ Test Case 2 passes
- ✅ All DMs result in thread replies

### SC-003: Correct Thread Association

- ✅ Test Case 3 passes
- ✅ Thread replies correctly linked to parent messages

### SC-004: Graceful Error Handling

- ✅ Test Case 4 and 5 pass
- ✅ Error rate < 1% for missing/invalid timestamps

### SC-005: Performance Maintained

- ✅ Response time within 15 seconds
- ✅ No performance degradation vs channel messages

---

## Next Steps

After successful testing:

1. Deploy to production (if applicable)
2. Monitor CloudWatch logs for thread reply success rate
3. Collect user feedback on thread reply UX improvement
4. Document any edge cases discovered during testing
