# Data Model: Thread Reply

**Feature**: 003-thread-reply
**Date**: 2025-01-27
**Purpose**: Define data entities and flow modifications for thread reply functionality

## Overview

This feature modifies the existing data flow to include message timestamp (`thread_ts`) for thread replies. No new storage entities are required. Changes are limited to transient payload structures passed between Lambda functions.

## Modified Entities

### 1. Slack Event Payload (Modified)

**Purpose**: Slack event payload now includes `event.ts` which must be extracted and passed through the pipeline

**Storage**: Not persisted (exists only in Lambda execution context)

**Attributes** (unchanged from MVP, but `event.ts` is now used):

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `event.ts` | String | Yes | Message timestamp (NOW USED for thread replies) | Slack timestamp format: "1234567890.123456" |

**Extraction**:
```python
# In slack-event-handler/handler.py
slack_event = body.get("event", {})
message_timestamp = slack_event.get("ts")  # Extract for thread reply
```

---

### 2. Event Handler → Bedrock Processor Payload (Modified)

**Purpose**: Payload passed from Slack Event Handler to Bedrock Processor now includes `thread_ts`

**Storage**: Not persisted (transient payload between Lambda functions)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `channel` | String | Yes | Channel ID (e.g., "C01234567" or "D01234567") | Format: `C[A-Z0-9]{8,}` or `D[A-Z0-9]{8,}` |
| `text` | String | Yes | User message text | Non-empty string |
| `bot_token` | String | Yes | Slack bot OAuth token | Format: `xoxb-[a-zA-Z0-9-]+` |
| `thread_ts` | String | No | Message timestamp for thread reply (NEW) | Slack timestamp format: "1234567890.123456" |

**Payload Format** (before):
```json
{
  "channel": "C01234567",
  "text": "User message text",
  "bot_token": "xoxb-..."
}
```

**Payload Format** (after):
```json
{
  "channel": "C01234567",
  "text": "User message text",
  "bot_token": "xoxb-...",
  "thread_ts": "1234567890.123456"
}
```

**Validation Rules**:
- `thread_ts` is optional (for backward compatibility)
- If present, must match pattern `^\d+\.\d+$` (digits, dot, digits)
- If missing or invalid, system falls back to channel message (graceful degradation)

---

### 3. Slack API Request Payload (Modified)

**Purpose**: Payload sent to Slack `chat.postMessage` API now includes optional `thread_ts` parameter

**Storage**: Not persisted (sent to Slack API)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `channel` | String | Yes | Channel ID to post to | Format: `C[A-Z0-9]{8,}` or `D[A-Z0-9]{8,}` |
| `text` | String | Yes | Message text (AI response or error) | Non-empty, max 40,000 characters |
| `thread_ts` | String | No | Thread timestamp (if replying in thread) | Slack timestamp format (optional) |

**Slack API Payload Format** (before):
```json
{
  "channel": "C01234567",
  "text": "Hello! I'm here to help."
}
```

**Slack API Payload Format** (after, with thread reply):
```json
{
  "channel": "C01234567",
  "text": "Hello! I'm here to help.",
  "thread_ts": "1234567890.123456"
}
```

**Validation Rules**:
- `thread_ts` is optional
- If provided, must be valid Slack timestamp format
- If invalid, system falls back to channel message (no `thread_ts` parameter)

---

## Data Flow

### Current Flow (Before Modification)

```
1. Slack Event → Slack Event Handler (slack-event-handler)
   ├─ Extract: team_id, user, channel, text
   ├─ Validate: signature, timestamp, event type
   ├─ Lookup: bot_token from DynamoDB(team_id)
   └─ Invoke: Bedrock Processor with (channel, text, bot_token)

2. Bedrock Processor (bedrock-processor)
   ├─ Prepare: Bedrock request payload
   ├─ Invoke: Bedrock API (model_id, prompt)
   ├─ Extract: AI response text
   └─ Post: Slack chat.postMessage(channel, text, bot_token)
```

### Modified Flow (After Modification)

```
1. Slack Event → Slack Event Handler (slack-event-handler)
   ├─ Extract: team_id, user, channel, text, event.ts (NEW)
   ├─ Validate: signature, timestamp, event type
   ├─ Lookup: bot_token from DynamoDB(team_id)
   └─ Invoke: Bedrock Processor with (channel, text, bot_token, thread_ts) (NEW)

2. Bedrock Processor (bedrock-processor)
   ├─ Prepare: Bedrock request payload
   ├─ Invoke: Bedrock API (model_id, prompt)
   ├─ Extract: AI response text
   └─ Post: Slack chat.postMessage(channel, text, bot_token, thread_ts) (NEW)
```

### Key Changes

1. **Slack Event Handler**:
   - Extract `event.ts` from Slack event payload
   - Include `thread_ts` in payload to Bedrock Processor

2. **Bedrock Processor**:
   - Accept `thread_ts` from payload
   - Pass `thread_ts` to `slack_poster.post_to_slack()`

3. **Slack Poster**:
   - Add optional `thread_ts` parameter to `post_to_slack()`
   - Include `thread_ts` in `chat.postMessage()` API call if valid

---

## Validation Summary

**Data Validations** (Both Lambdas):
- [x] Non-empty message text (existing)
- [x] Valid channel/user ID formats (existing)
- [x] Token format validation (existing)
- [x] Thread timestamp format validation (NEW)
- [x] Graceful handling of missing/invalid timestamps (NEW)

**Error Handling**:
- Missing `thread_ts`: Post as channel message (backward compatible)
- Invalid `thread_ts` format: Post as channel message (backward compatible)
- Thread reply API error: Fall back to channel message (graceful degradation)

---

## Backward Compatibility

**Compatibility Strategy**:
- `thread_ts` parameter is optional in all payloads
- If `thread_ts` is missing or invalid, system falls back to channel message behavior
- Existing functionality preserved: channel messages still work as before

**Migration Path**:
- No migration required: feature is additive
- Existing deployments continue to work (missing `thread_ts` = channel message)
- New deployments automatically use thread replies when timestamp available

