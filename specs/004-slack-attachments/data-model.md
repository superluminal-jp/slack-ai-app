# Data Model: Slack Message Attachments Support

**Feature**: 004-slack-attachments
**Date**: 2025-01-27
**Purpose**: Define data entities and flow modifications for attachment processing functionality

## Overview

This feature extends the existing data flow to include attachment metadata and processed attachment content. No new persistent storage entities are required. Changes are limited to transient payload structures passed between Lambda functions and in-memory processing of attachment content.

## Modified Entities

### 1. Slack Event Payload (Modified)

**Purpose**: Slack event payload now includes `event.files` array which must be extracted and processed

**Storage**: Not persisted (exists only in Lambda execution context)

**Attributes** (existing attributes unchanged, new `event.files` added):

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `event.files` | Array | No | Array of file attachment objects (NEW) | Array of FileAttachment objects (see below) |
| `event.files[].id` | String | Yes | Slack file ID | Format: `F[A-Z0-9]{8,}` |
| `event.files[].name` | String | Yes | File name | Non-empty string |
| `event.files[].mimetype` | String | Yes | MIME type | Format: `type/subtype` (e.g., "image/png", "application/pdf") |
| `event.files[].size` | Integer | Yes | File size in bytes | Positive integer |
| `event.files[].url_private_download` | String | No | Download URL (may be absent) | Valid HTTPS URL or absent |

**Extraction**:
```python
# In slack-event-handler/handler.py
slack_event = body.get("event", {})
files = slack_event.get("files", [])  # Extract files array (empty if no attachments)
```

**Example Payload**:
```json
{
  "type": "event_callback",
  "team_id": "T01234567",
  "event": {
    "type": "app_mention",
    "ts": "1234567890.123456",
    "channel": "C01234567",
    "text": "<@U98765432> Check this image",
    "user": "U01234567",
    "files": [
      {
        "id": "F01234567",
        "name": "screenshot.png",
        "mimetype": "image/png",
        "size": 1024000,
        "url_private_download": "https://files.slack.com/files-pri/.../download"
      }
    ]
  }
}
```

---

### 2. Event Handler → Bedrock Processor Payload (Modified)

**Purpose**: Payload passed from Slack Event Handler to Bedrock Processor now includes attachment metadata

**Storage**: Not persisted (transient payload between Lambda functions)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `channel` | String | Yes | Channel ID | Format: `C[A-Z0-9]{8,}` or `D[A-Z0-9]{8,}` |
| `text` | String | Yes | User message text | Non-empty string (or empty if attachments only) |
| `bot_token` | String | Yes | Slack bot OAuth token | Format: `xoxb-[a-zA-Z0-9-]+` |
| `thread_ts` | String | No | Message timestamp for thread reply | Slack timestamp format: "1234567890.123456" |
| `attachments` | Array | No | Attachment metadata array (NEW) | Array of AttachmentMetadata objects (see below) |

**AttachmentMetadata Object**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `id` | String | Yes | Slack file ID | Format: `F[A-Z0-9]{8,}` |
| `name` | String | Yes | File name | Non-empty string |
| `mimetype` | String | Yes | MIME type | Format: `type/subtype` |
| `size` | Integer | Yes | File size in bytes | Positive integer |
| `url_private_download` | String | No | Download URL | Valid HTTPS URL or absent |

**Payload Format** (before):
```json
{
  "channel": "C01234567",
  "text": "Check this image",
  "bot_token": "xoxb-...",
  "thread_ts": "1234567890.123456"
}
```

**Payload Format** (after):
```json
{
  "channel": "C01234567",
  "text": "Check this image",
  "bot_token": "xoxb-...",
  "thread_ts": "1234567890.123456",
  "attachments": [
    {
      "id": "F01234567",
      "name": "screenshot.png",
      "mimetype": "image/png",
      "size": 1024000,
      "url_private_download": "https://files.slack.com/files-pri/.../download"
    }
  ]
}
```

---

### 3. Processed Attachment Content (New)

**Purpose**: Represents downloaded and processed attachment content ready for AI processing

**Storage**: Not persisted (exists only in Lambda execution context during processing)

**Attributes**:

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `file_id` | String | Yes | Slack file ID | Format: `F[A-Z0-9]{8,}` |
| `file_name` | String | Yes | File name | Non-empty string |
| `mimetype` | String | Yes | MIME type | Format: `type/subtype` |
| `content_type` | String | Yes | Content type: "image" or "document" | Enum: "image", "document" |
| `content` | String or bytes | Yes | Processed content | Image: base64 string, Document: extracted text string |
| `processing_status` | String | Yes | Processing result | Enum: "success", "failed", "skipped" |
| `error_message` | String | No | Error message if failed | Non-empty string if status is "failed" |

**Content Format**:
- **Images**: Base64-encoded string (for Bedrock API)
- **Documents**: Extracted text string (for Bedrock text prompt)

**Example**:
```python
# Image attachment
{
    "file_id": "F01234567",
    "file_name": "screenshot.png",
    "mimetype": "image/png",
    "content_type": "image",
    "content": "iVBORw0KGgoAAAANSUhEUgAA...",  # Base64 string
    "processing_status": "success"
}

# Document attachment
{
    "file_id": "F01234568",
    "file_name": "report.pdf",
    "mimetype": "application/pdf",
    "content_type": "document",
    "content": "This is the extracted text from the PDF...",  # Text string
    "processing_status": "success"
}
```

---

### 4. Bedrock Request Payload (Modified)

**Purpose**: Payload sent to Amazon Bedrock API now includes attachment content

**Storage**: Not persisted (exists only in Lambda execution context)

**Attributes** (existing attributes unchanged, content array modified):

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `messages` | Array | Yes | Message array | Array of Message objects |
| `messages[].role` | String | Yes | Message role | Enum: "user", "assistant" |
| `messages[].content` | Array | Yes | Content blocks (MODIFIED) | Array of ContentBlock objects (text + optional images) |

**ContentBlock Object** (modified to support images):

| Attribute | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `type` | String | Yes | Content type | Enum: "text", "image" |
| `text` | String | Conditional | Text content | Required if type is "text" |
| `source` | Object | Conditional | Image source | Required if type is "image" |
| `source.type` | String | Yes | Source type | Enum: "base64" |
| `source.media_type` | String | Yes | MIME type | Format: `image/png`, `image/jpeg`, etc. |
| `source.data` | String | Yes | Base64 image data | Base64-encoded string |

**Payload Format** (text-only, before):
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What's in this image?"
        }
      ]
    }
  ]
}
```

**Payload Format** (with image, after):
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What's in this image?"
        },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "iVBORw0KGgoAAAANSUhEUgAA..."
          }
        }
      ]
    }
  ]
}
```

**Payload Format** (with document text, after):
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Summarize this document:\n\n[Extracted PDF text content here...]"
        }
      ]
    }
  ]
}
```

---

## Data Flow

```
1. Slack Event → Slack Event Handler (slack-event-handler)
   ├─ Extract: event.files array
   ├─ Validate: file metadata (size, MIME type)
   └─ Include: attachment metadata in payload to Bedrock Processor

2. Bedrock Processor (bedrock-processor)
   ├─ Receive: attachment metadata from payload
   ├─ Download: files from Slack CDN (file_downloader.py)
   ├─ Process: extract content (attachment_processor.py)
   │   ├─ Images: base64 encode for Bedrock
   │   └─ Documents: extract text (document_extractor.py)
   ├─ Prepare: Bedrock request with text + attachment content
   ├─ Invoke: Bedrock API (bedrock_client.py)
   └─ Post: Slack response (slack_poster.py)
```

## Validation Summary

**Security Validations** (Slack Event Handler):
- [x] HMAC SHA256 signature verification (existing)
- [x] Timestamp validation (existing)
- [x] File size validation (NEW: before processing)
- [x] MIME type validation (NEW: supported types only)

**Data Validations** (Bedrock Processor):
- [x] Attachment metadata validation (file ID, name, MIME type, size)
- [x] File download URL validation
- [x] File size limits (10MB images, 5MB documents)
- [x] Base64 encoding validation for images
- [x] Text extraction validation for documents

**Business Logic Validations**:
- [x] At least one of text or attachments must be present
- [x] Supported MIME types: image/*, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.openxmlformats-officedocument.presentationml.presentation
- [x] File size within limits before download
- [x] Attachment processing failures don't block text processing

## Entity Relationships

```
Slack Event
  ├─ contains → AttachmentMetadata[] (1:N)
  └─ contains → Message Text (1:1)

AttachmentMetadata
  └─ processed → ProcessedAttachmentContent (1:1)

ProcessedAttachmentContent
  ├─ images → Bedrock Image Content Block (1:1)
  └─ documents → Bedrock Text Content Block (1:1)

Bedrock Request
  └─ contains → ContentBlock[] (1:N)
      ├─ text blocks (from message text + document text)
      └─ image blocks (from image attachments)
```

