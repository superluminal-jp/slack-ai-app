# Data Model: Slack Bedrock MVP

**Feature**: 001-slack-bedrock-mvp
**Date**: 2025-11-30
**Purpose**: Define data entities, storage schema, and validation rules

## Overview

This MVP uses minimal data persistence. Primary focus is on workspace installation tokens. Context history and conversation state are explicitly deferred to post-MVP.

## Entities

### 1. Workspace Installation

**Purpose**: Store Slack workspace OAuth tokens for bot authentication

**Storage**: DynamoDB table `slack-workspace-tokens`

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `team_id` | String (PK) | Yes | Slack workspace identifier (e.g., T01234567) | Format: `T[A-Z0-9]{8,}` |
| `bot_token` | String | Yes | Slack bot OAuth token | Format: `xoxb-[a-zA-Z0-9-]+` (encrypted at rest) |
| `installation_timestamp` | Number | Yes | Unix epoch timestamp of installation | Positive integer |
| `bot_user_id` | String | No | Slack bot user ID (e.g., U01234567) | Format: `U[A-Z0-9]{8,}` |
| `scope` | String | No | Comma-separated OAuth scopes granted | Non-empty string |

**DynamoDB Schema**:
```json
{
  "TableName": "slack-workspace-tokens",
  "KeySchema": [
    { "AttributeName": "team_id", "KeyType": "HASH" }
  ],
  "AttributeDefinitions": [
    { "AttributeName": "team_id", "AttributeType": "S" }
  ],
  "BillingMode": "PAY_PER_REQUEST",
  "EncryptionSpecification": {
    "EncryptionType": "DEFAULT"
  }
}
```

**Access Patterns**:
1. **Lookup token by workspace**: `GetItem(team_id)` - Used by Slack Event Handler to validate workspace and retrieve bot_token
2. **Store new installation**: `PutItem(team_id, bot_token, ...)` - Used by OAuth handler during installation
3. **Update existing installation**: `UpdateItem(team_id)` - Used if user re-installs or updates scopes

**Validation Rules**:
- `team_id` must match Slack team ID format (`T[A-Z0-9]+`)
- `bot_token` must start with `xoxb-` (bot token prefix)
- `installation_timestamp` must be positive Unix timestamp
- `bot_token` is sensitive; never logged or exposed in API responses

---

### 2. Slack Event (Transient)

**Purpose**: Represent incoming Slack event from Event Subscriptions API

**Storage**: Not persisted (exists only in Lambda execution context)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `type` | String | Yes | Event type (always "event_callback" for messages) | Enum: "url_verification", "event_callback" |
| `team_id` | String | Yes | Slack workspace ID | Format: `T[A-Z0-9]{8,}` |
| `event` | Object | Yes | Nested event details | See Event.event schema below |
| `event.type` | String | Yes | Specific event type | Enum: "message", "app_mention" |
| `event.user` | String | Yes | User who sent message | Format: `U[A-Z0-9]{8,}` |
| `event.text` | String | Yes | Message text | Non-empty string (after mention stripping) |
| `event.channel` | String | Yes | Channel ID (DM or channel) | Format: `C[A-Z0-9]{8,}` or `D[A-Z0-9]{8,}` |
| `event.ts` | String | Yes | Message timestamp | Slack timestamp format: "1234567890.123456" |

**Example Payload**:
```json
{
  "type": "event_callback",
  "team_id": "T01234567",
  "event": {
    "type": "app_mention",
    "user": "U01234567",
    "text": "<@U98765432> Hello, can you help me?",
    "channel": "C01234567",
    "ts": "1234567890.123456"
  }
}
```

**Validation Rules**:
- Must contain valid Slack signature in headers (HMAC SHA256)
- `event.type` must be "message" (with `channel_type: "im"`) or "app_mention"
- `event.text` must not be empty after stripping bot mention
- Event timestamp must be within ±5 minutes of current time (replay attack prevention)

---

### 3. Bedrock Request (Transient)

**Purpose**: Payload sent to Amazon Bedrock API for AI inference

**Storage**: Not persisted (exists only in Lambda execution context)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `model_id` | String | Yes | Bedrock model identifier | Fixed: "anthropic.claude-3-haiku-20240307-v1:0" |
| `prompt` | String | Yes | User message (cleaned) | Non-empty, max 4000 characters |
| `max_tokens` | Number | Yes | Maximum tokens in response | Fixed: 1024 |
| `temperature` | Number | Yes | Sampling temperature | Fixed: 1.0 |

**Bedrock API Payload Format** (Anthropic Claude):
```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 1024,
  "temperature": 1.0,
  "messages": [
    {
      "role": "user",
      "content": "Hello, can you help me?"
    }
  ]
}
```

**Validation Rules**:
- `prompt` must be non-empty and ≤4000 characters
- `prompt` must not contain null bytes or control characters
- Model ID must be valid and accessible in AWS account

---

### 4. Bedrock Response (Transient)

**Purpose**: AI-generated response from Bedrock API

**Storage**: Not persisted (posted to Slack and discarded)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `content` | Array | Yes | Response content blocks | At least one text block |
| `content[0].type` | String | Yes | Content type | Must be "text" |
| `content[0].text` | String | Yes | AI-generated text | Non-empty string |
| `stop_reason` | String | Yes | Why generation stopped | Enum: "end_turn", "max_tokens", "stop_sequence" |
| `usage` | Object | Yes | Token usage stats | For logging only |

**Example Payload**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Hello! I'm here to help. What would you like to know?"
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 12,
    "output_tokens": 18
  }
}
```

**Validation Rules**:
- `content` array must have at least one element
- `content[0].text` must be non-empty
- `stop_reason` must be valid Claude stop reason

---

### 5. Slack Response Payload (Transient)

**Purpose**: Message posted back to Slack via response_url or chat.postMessage

**Storage**: Not persisted (sent to Slack API)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `channel` | String | Yes | Channel ID to post to | Format: `C[A-Z0-9]{8,}` or `D[A-Z0-9]{8,}` |
| `text` | String | Yes | Message text (AI response or error) | Non-empty, max 40,000 characters |
| `thread_ts` | String | No | Thread timestamp (if replying in thread) | Slack timestamp format |

**Slack API Payload Format**:
```json
{
  "channel": "C01234567",
  "text": "Hello! I'm here to help. What would you like to know?"
}
```

**Validation Rules**:
- `text` must be non-empty and ≤40,000 characters (Slack limit)
- `channel` must be valid channel ID
- Must use bot_token from DynamoDB for authentication

---

## Data Flow

```
1. Slack Event → Slack Event Handler (slack-event-handler)
   ├─ Extract: team_id, user, channel, text
   ├─ Validate: signature, timestamp, event type
   ├─ Lookup: bot_token from DynamoDB(team_id)
   └─ Invoke: Bedrock Processor with (team_id, user, channel, text, bot_token)

2. Bedrock Processor (bedrock-processor)
   ├─ Prepare: Bedrock request payload
   ├─ Invoke: Bedrock API (model_id, prompt)
   ├─ Extract: AI response text
   └─ Post: Slack chat.postMessage(channel, text, bot_token)
```

## Validation Summary

**Security Validations** (Slack Event Handler):
- [x] HMAC SHA256 signature verification (Slack signing secret)
- [x] Timestamp validation (±5 minutes window)
- [x] Team ID format validation
- [ ] Authorization checks (deferred to post-MVP)

**Data Validations** (Both Lambdas):
- [x] Non-empty message text
- [x] Valid channel/user ID formats
- [x] Token format validation (xoxb- prefix)
- [ ] Input sanitization (deferred to post-MVP)
- [ ] PII detection (deferred to post-MVP)

**Business Logic Validations**:
- [x] Message length limits (4000 chars for Bedrock, 40K for Slack)
- [x] Model ID whitelisting
- [ ] Rate limiting per user (deferred to post-MVP)
- [ ] Token usage quotas (deferred to post-MVP)

## State Transitions

### Workspace Installation State

```
UNINSTALLED → (OAuth flow) → INSTALLED
INSTALLED → (Re-authorization) → INSTALLED (updated scopes)
INSTALLED → (Uninstall event) → UNINSTALLED (manual cleanup for MVP)
```

**State Storage**: Implicit in DynamoDB (team_id exists = INSTALLED)

**MVP Simplification**: No explicit state machine; uninstall detection deferred

---

## Deferred Entities (Post-MVP)

The following entities are explicitly out of scope for MVP per spec:

### Conversation Context (deferred)

**Why needed post-MVP**: Multi-turn conversations with history
**Storage**: DynamoDB with KMS encryption
**Attributes**: user_id, channel_id, context_history (array of messages), created_at, updated_at

### User Quotas (deferred)

**Why needed post-MVP**: Cost management and rate limiting
**Storage**: DynamoDB
**Attributes**: user_id, token_count, request_count, reset_timestamp

### Audit Logs (deferred)

**Why needed post-MVP**: Compliance (GDPR, SOC 2)
**Storage**: CloudWatch Logs with structured JSON
**Attributes**: correlation_id, event_type, timestamp, user_id, team_id, action, outcome

---

## References

- [Slack Event Types](https://api.slack.com/events)
- [Slack Message Formatting](https://api.slack.com/reference/surfaces/formatting)
- [Bedrock Claude API Reference](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
