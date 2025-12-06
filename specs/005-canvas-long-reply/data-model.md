# Data Model: Canvas for Long Replies

**Feature**: 005-canvas-long-reply
**Date**: 2025-01-30
**Purpose**: Define data entities and flow modifications for Canvas creation and sharing functionality

## Overview

This feature modifies the existing data flow to support Canvas creation and sharing for long replies and structured documents. No new persistent storage entities are required. Changes are limited to transient payload structures and decision logic for Canvas vs regular message routing.

## Modified Entities

### 1. Bedrock Processor Payload (Modified)

**Purpose**: Payload passed from Slack Event Handler to Bedrock Processor now includes information needed for Canvas creation decision

**Storage**: Not persisted (transient payload between Lambda functions)

**Attributes** (unchanged from existing, but used for Canvas decision):

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `channel` | String | Yes | Channel ID (e.g., "C01234567" or "D01234567") | Format: `C[A-Z0-9]{8,}` or `D[A-Z0-9]{8,}` |
| `text` | String | Yes | User message text | Non-empty string |
| `bot_token` | String | Yes | Slack bot OAuth token | Format: `xoxb-[a-zA-Z0-9-]+` |
| `thread_ts` | String | No | Message timestamp for thread reply | Slack timestamp format: "1234567890.123456" |

**Payload Format** (unchanged):
```json
{
  "channel": "C01234567",
  "text": "User message text",
  "bot_token": "xoxb-...",
  "thread_ts": "1234567890.123456"
}
```

---

### 2. Bedrock Response (Modified)

**Purpose**: AI-generated response from Bedrock API, now evaluated for Canvas usage

**Storage**: Not persisted (processed and posted to Slack)

**Attributes** (unchanged from existing):

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `content` | String | Yes | AI-generated text response | Non-empty string |
| `length` | Number | Yes | Character count of response | Integer >= 0 |
| `has_structured_formatting` | Boolean | Yes | Whether response contains structured formatting | Boolean |

**Response Evaluation**:
- **Length Check**: `length > 800` triggers Canvas usage
- **Formatting Check**: `has_structured_formatting == true` triggers Canvas usage
- **Canvas Decision**: `use_canvas = (length > 800) OR has_structured_formatting`

---

### 3. Canvas Creation Request (New - Transient)

**Purpose**: Request to create Canvas via Slack API

**Storage**: Not persisted (exists only in Lambda execution context)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `title` | String | Yes | Canvas title | Non-empty string, max 100 characters |
| `content` | String/Object | Yes | Canvas content (formatted) | Non-empty, max 100KB (assumed) |
| `workspace_id` | String | No | Slack workspace ID | Format: `T[A-Z0-9]{8,}` |

**Request Format** (assumed API structure):
```json
{
  "title": "AI Response",
  "content": {
    "blocks": [
      {
        "type": "header",
        "text": "AI Response"
      },
      {
        "type": "section",
        "text": "Formatted reply content..."
      }
    ]
  }
}
```

---

### 4. Canvas Creation Result (New - Transient)

**Purpose**: Result of Canvas creation attempt

**Storage**: Not persisted (exists only in Lambda execution context)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `success` | Boolean | Yes | Whether Canvas creation succeeded | Boolean |
| `canvas_id` | String | No | Canvas ID if creation succeeded | Format: `C[A-Z0-9]+` (assumed) |
| `error_code` | String | No | Error code if creation failed | Enum: "api_error", "permission_error", "rate_limit", "content_too_large", "unknown" |
| `error_message` | String | No | Human-readable error message | String |

**Result Format**:
```json
{
  "success": true,
  "canvas_id": "C01234567"
}
```

or

```json
{
  "success": false,
  "error_code": "permission_error",
  "error_message": "Bot token missing canvas:write permission"
}
```

---

### 5. Canvas Share Request (New - Transient)

**Purpose**: Request to share Canvas in thread or channel

**Storage**: Not persisted (exists only in Lambda execution context)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `canvas_id` | String | Yes | Canvas ID to share | Format: `C[A-Z0-9]+` (assumed) |
| `channel` | String | Yes | Channel ID where to share | Format: `C[A-Z0-9]{8,}` or `D[A-Z0-9]{8,}` |
| `thread_ts` | String | No | Thread timestamp if sharing in thread | Slack timestamp format: "1234567890.123456" |

**Request Format** (assumed API structure):
```json
{
  "canvas_id": "C01234567",
  "channel": "C01234567",
  "thread_ts": "1234567890.123456"
}
```

---

### 6. Canvas Summary Message (New - Transient)

**Purpose**: Brief message posted to indicate Canvas was created

**Storage**: Not persisted (posted to Slack and discarded)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `text` | String | Yes | Summary message text | Non-empty string, max 200 characters |
| `channel` | String | Yes | Channel ID where to post | Format: `C[A-Z0-9]{8,}` or `D[A-Z0-9]{8,}` |
| `thread_ts` | String | No | Thread timestamp if posting in thread | Slack timestamp format: "1234567890.123456" |

**Message Format**:
```
"📄 I've created a Canvas with the full response. [View Canvas]"
```

---

## Data Flow

### Canvas Creation Flow

1. **Bedrock Response** → **Reply Router** (evaluates length and formatting)
2. **Reply Router** → **Canvas Creator** (if Canvas needed)
3. **Canvas Creator** → **Canvas Share** (shares Canvas in thread/channel)
4. **Canvas Share** → **Slack Poster** (posts summary message)

### Fallback Flow

1. **Canvas Creator** → **Error** (Canvas creation failed)
2. **Error Handler** → **Slack Poster** (posts regular message with fallback)

### Regular Message Flow (Unchanged)

1. **Bedrock Response** → **Reply Router** (determines regular message)
2. **Reply Router** → **Slack Poster** (posts regular message)

---

## Validation Rules

### Canvas Creation

- **Content Size**: Canvas content must not exceed 100KB (assumed limit)
- **Title Length**: Canvas title must not exceed 100 characters
- **Content Format**: Canvas content must be valid structured format (JSON/Block Kit)

### Canvas Sharing

- **Canvas ID**: Must be valid Canvas ID from successful creation
- **Channel**: Must be valid channel ID
- **Thread Timestamp**: If provided, must be valid Slack timestamp format

### Reply Routing

- **Length Threshold**: 800 characters (per FR-016)
- **Formatting Detection**: At least 2 structural elements (headings, lists, code blocks, tables)
- **Canvas Decision**: `use_canvas = (length > 800) OR has_structured_formatting`

---

## State Transitions

### Canvas Creation State Machine

```
[Start] → [Evaluate Reply] → [Length > 800 OR Structured?]
                                    |
                    +---------------+---------------+
                    |                               |
              [Yes] |                               | [No]
                    |                               |
        [Create Canvas]                    [Post Regular Message]
                    |
        +-----------+-----------+
        |                       |
  [Success]              [Failure]
        |                       |
  [Share Canvas]         [Fallback to Regular Message]
        |
  [Post Summary]
        |
    [End]
```

---

## Relationships

- **Bedrock Response** → **Canvas Creation Request** (1:1 if Canvas needed)
- **Canvas Creation Request** → **Canvas Creation Result** (1:1)
- **Canvas Creation Result** → **Canvas Share Request** (1:1 if success)
- **Canvas Share Request** → **Canvas Summary Message** (1:1)
- **Bedrock Response** → **Regular Message** (1:1 if Canvas not needed)

---

## Notes

- All entities are transient (not persisted)
- Canvas content format is assumed (to be validated with actual API)
- Canvas ID format is assumed (to be validated with actual API)
- Content size limits are assumed (to be validated with actual API)
- All validation rules may need adjustment based on actual Canvas API behavior

