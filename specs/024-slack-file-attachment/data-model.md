# Data Model: 024-slack-file-attachment

**Date**: 2026-02-11

---

## Entities

### FileAttachmentMetadata

Extracted from Slack event payload by the Lambda handler. Passed through the pipeline unchanged.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `id` | string | Slack event `files[].id` | Slack file identifier (e.g., `F01234567`) |
| `name` | string | Slack event `files[].name` | Original filename (e.g., `report.pdf`) |
| `mimetype` | string | Slack event `files[].mimetype` | MIME type (e.g., `application/pdf`) |
| `size` | integer | Slack event `files[].size` | File size in bytes |
| `url_private_download` | string | Slack event `files[].url_private_download` | Slack CDN download URL (used by verification agent) |

### S3FileReference

Created by verification agent after uploading file to S3. Replaces `url_private_download` in the execution payload.

| Field | Type | Description |
|-------|------|-------------|
| `s3_key` | string | S3 object key: `attachments/{correlation_id}/{file_id}/{file_name}` |
| `presigned_url` | string | Pre-signed GET URL (15-min expiry) |
| `bucket` | string | S3 bucket name (for cleanup reference) |

### EnrichedAttachment

Attachment metadata with S3 reference, sent from verification agent to execution agent.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Slack file ID |
| `name` | string | Original filename |
| `mimetype` | string | MIME type |
| `size` | integer | File size in bytes |
| `presigned_url` | string | S3 pre-signed GET URL for download |

### ProcessedContent

Result of file processing in the execution agent.

| Field | Type | Description |
|-------|------|-------------|
| `file_id` | string | Source file ID |
| `file_name` | string | Original filename |
| `content_type` | enum | `image` or `document` |
| `content` | bytes/string | Binary data (images) or extracted text (document fallback) |
| `document_bytes` | bytes | Raw document bytes for native Bedrock document block |
| `document_format` | string | Bedrock format: `pdf`, `txt`, `csv`, `doc`, `docx`, `xls`, `xlsx`, `html`, `md` |
| `image_format` | string | Bedrock format: `png`, `jpeg`, `gif`, `webp` |
| `processing_status` | enum | `success`, `failed`, `skipped` |
| `error_code` | string | Error identifier if failed |
| `error_message` | string | User-friendly error message |

---

## State Transitions

### File Lifecycle

```
Slack CDN → [Verification Agent downloads] → S3 (temporary)
    → [Execution Agent downloads via pre-signed URL] → Memory
    → [Bedrock processes] → Response
    → [Verification Agent deletes from S3] → Gone
    → [S3 lifecycle (1 day) deletes orphans] → Gone
```

### Processing Status Flow

```
pending → downloading → downloaded → processing → success
                    ↘               ↘
                   failed          failed
```

---

## S3 Object Key Schema

```
attachments/
└── {correlation_id}/
    ├── {file_id_1}/{file_name_1}
    ├── {file_id_2}/{file_name_2}
    └── ...
```

- **Prefix**: `attachments/` — enables scoped IAM policies and lifecycle rules
- **correlation_id**: Groups all files for a single request — enables batch cleanup
- **file_id**: Prevents name collisions
- **file_name**: Human-readable for debugging

---

## Validation Rules

| Entity | Field | Rule |
|--------|-------|------|
| FileAttachmentMetadata | `size` | Images: <= 10 MB, Documents: <= 5 MB |
| FileAttachmentMetadata | `mimetype` | Must be in supported types list |
| EnrichedAttachment | `presigned_url` | Must be valid HTTPS URL |
| ProcessedContent | `document_format` | Must be Bedrock-supported: pdf, txt, csv, doc, docx, xls, xlsx, html, md |
| ProcessedContent | `image_format` | Must be Bedrock-supported: png, jpeg, gif, webp |

### Supported MIME Types

**Documents**:
- `application/pdf` → format: `pdf`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` → format: `docx`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` → format: `xlsx`
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` → format: `pptx` (text extraction only)
- `text/csv` → format: `csv`
- `text/plain` → format: `txt`

**Images**:
- `image/png` → format: `png`
- `image/jpeg` → format: `jpeg`
- `image/gif` → format: `gif`
- `image/webp` → format: `webp`
