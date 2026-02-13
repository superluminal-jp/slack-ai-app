# Research: 024-slack-file-attachment

**Date**: 2026-02-11
**Purpose**: Resolve technical unknowns and establish best practices for file attachment feature.

---

## Decision 1: S3 Bucket Ownership Zone

**Decision**: S3 bucket in the **verification zone** (Account A).

**Rationale**:
- Verification zone downloads from Slack (has bot token already)
- Upload to same-account S3 requires no cross-account IAM for PUT
- Pre-signed GET URLs work cross-account without additional policies
- Simpler CDK — bucket is part of VerificationStack

**Alternatives considered**:
- **S3 in execution zone**: Would require cross-account PUT from verification zone. Adds complexity for uploads.
- **S3 in shared/bridge account**: Over-engineered for temporary files.

---

## Decision 2: Who Downloads from Slack

**Decision**: **Verification Agent** (container) downloads from Slack and uploads to S3.

**Rationale**:
- Verification Agent already has bot token via environment variable
- Container has no hard timeout (unlike Lambda's 120s)
- Keeps file download logic in verification zone — execution zone never needs bot token for file access
- **Security improvement**: bot token no longer crosses zone boundary for file operations

**Alternatives considered**:
- **Verification Lambda**: Has 120-second timeout. For 5 files at 10MB = 50MB, download + S3 upload may be tight.
- **Execution Agent downloads directly from Slack**: Current approach. Works but sends bot token to execution zone unnecessarily.

---

## Decision 3: S3 Encryption

**Decision**: **SSE-S3** (AES-256, S3-managed keys).

**Rationale**:
- Pre-signed URLs handle cross-account access transparently — no KMS key policy needed
- Files exist for minutes, not months — regulatory encryption audit trails aren't required
- SSE-KMS would require execution zone to have `kms:Decrypt` permission, adding cross-account IAM complexity with no security benefit for ephemeral files
- Pre-signed URLs already provide scoped, time-limited access

**Alternatives considered**:
- **SSE-KMS**: Better audit trail via CloudTrail. Needed for compliance-sensitive data with long retention. Overkill for temporary transfer files.

---

## Decision 4: Pre-signed URL Expiry

**Decision**: **15 minutes**.

**Rationale**:
- File processing (download + extraction + Bedrock inference) takes 10-30 seconds typically
- 15 minutes provides generous buffer for retries and queue delays
- Short enough to limit exposure window if URL is leaked
- Lambda credential rotation (1-6 hours) is well above 15 minutes

**Alternatives considered**:
- **5 minutes**: Too tight — if execution agent has queue delays, URL expires before download
- **1 hour**: Unnecessarily long exposure window

---

## Decision 5: S3 Object Lifecycle

**Decision**: **1-day S3 lifecycle rule** + **immediate deletion after processing** in verification agent.

**Rationale**:
- S3 lifecycle rules have 1-day minimum granularity — cannot set to minutes
- Verification agent deletes S3 objects immediately after execution agent responds (primary cleanup)
- 1-day lifecycle is safety net for objects orphaned by errors/crashes
- No need for separate cleanup Lambda — verification agent handles the happy path; lifecycle handles failures

**Alternatives considered**:
- **EventBridge + Lambda cleanup every 15 min**: Over-engineered. 1-day lifecycle is sufficient as safety net.
- **Lifecycle only (1 day)**: Files persist too long if no active cleanup. Verification agent cleanup is simple to add.

---

## Decision 6: Bedrock Document Integration

**Decision**: Use **native Bedrock Converse API document content blocks** for supported formats, with **text extraction as fallback**.

**Rationale**:
- Bedrock Converse API `document` content block supports: pdf, txt, csv, doc, docx, xls, xlsx, html, md
- Native document support preserves formatting, tables, charts (especially for PDFs)
- Eliminates dependency on PyPDF2, openpyxl for extraction (can keep as fallback)
- Pass file bytes directly — Bedrock handles parsing
- Max 5 documents per request, 4.5 MB each

**Fallback strategy**:
- If Bedrock returns an error for a document format → fall back to text extraction
- PPTX is not natively supported → always use text extraction for PPTX
- Model-specific: Claude models have best native PDF support; test with Nova Pro

**Alternatives considered**:
- **Text extraction only (current approach)**: Works but loses visual content (charts, formatting). Lower quality answers.
- **S3 reference in Bedrock**: Avoids payload limits but requires cross-account S3 access for Bedrock IAM role. Over-complex for files under 5 MB.

---

## Decision 7: Bot Token in Execution Zone

**Decision**: **Remove bot token from execution zone payload** for file operations.

**Rationale**:
- With S3 pre-signed URLs, execution zone no longer needs bot token to download files
- Bot token is still needed by verification zone (Slack API calls, posting responses)
- Reduces attack surface — execution zone in a different account never sees the Slack credential
- Bot token stays in verification zone Secrets Manager only

**Impact**:
- Execution agent's `file_downloader.py` changes to use pre-signed URLs instead of Slack API
- `attachment_processor.py` no longer receives `bot_token` parameter for file downloads
- Bot token may still appear in payload for other purposes (verify if needed elsewhere)

---

## Decision 8: S3 Object Key Structure

**Decision**: `attachments/{correlation_id}/{file_id}/{file_name}`

**Rationale**:
- `correlation_id` prefix enables efficient cleanup (delete all objects for a request)
- `file_id` prevents name collisions when multiple files have the same name
- `file_name` preserved for readability in logs and debugging
- Prefix-based IAM conditions can scope access per request

**Alternatives considered**:
- **UUID-only keys**: Harder to debug, no correlation to request
- **Flat structure**: Cannot efficiently list/delete per-request objects

---

## AWS Best Practices Applied

### S3 Security (per AWS S3 Security Best Practices)
- Block all public access
- Enforce SSL (deny HTTP)
- SSE-S3 encryption at rest
- Pre-signed URLs for scoped, time-limited access
- Lifecycle rules for automatic cleanup

### Bedrock Converse API (per AWS Bedrock User Guide)
- Use native document content blocks (not text extraction)
- Pass raw bytes via SDK (SDK handles base64)
- `name` field sanitized (no user-supplied filenames — prevents prompt injection)
- `text` content block always accompanies `document` blocks

### Slack API (per Slack Developer Docs)
- Use `files.info` API for fresh download URLs
- `Authorization: Bearer {token}` header for downloads
- Handle rate limits (429 + Retry-After)
- `files.info` is Tier 4 (~100 req/min)

---

## Existing Code Reuse Assessment

| Component | Status | Reuse? |
|-----------|--------|--------|
| `attachment_extractor.py` (Lambda) | Complete | Yes — no changes needed |
| `pipeline.py` (Verification Agent) | Complete | Modify — add S3 upload/cleanup |
| `a2a_client.py` (Verification Agent) | Complete | Modify — payload format change |
| `file_downloader.py` (Execution Agent) | Complete | Modify — add pre-signed URL support |
| `attachment_processor.py` (Execution Agent) | Complete | Modify — S3 URL source |
| `document_extractor.py` (Execution Agent) | Complete | Keep as fallback |
| `bedrock_client_converse.py` (Execution Agent) | Complete | Modify — add native document blocks |
| `response_formatter.py` (Execution Agent) | Complete | No changes |
