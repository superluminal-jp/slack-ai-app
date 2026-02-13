# Implementation Plan: Slack File Attachment Support

**Branch**: `024-slack-file-attachment` | **Date**: 2026-02-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/024-slack-file-attachment/spec.md`

## Summary

Enable Slack users to attach files (documents and images) to messages and receive AI responses that consider the file content. Files are securely transferred from the verification zone to the execution zone via S3 with pre-signed URLs. The execution zone uses Bedrock Converse API native document/image content blocks for high-quality multimodal inference.

**Key architectural change**: Verification agent downloads files from Slack and uploads to S3. Execution agent downloads from S3 via pre-signed URLs — eliminating the need to pass the Slack bot token to the execution zone.

## Technical Context

**Language/Version**: Python 3.11 (agents), TypeScript 5.x (CDK)
**Primary Dependencies**: FastAPI, uvicorn, boto3, requests, aws-cdk-lib
**Storage**: S3 (new — temporary file exchange), DynamoDB (existing — dedupe, whitelist, rate limit)
**Testing**: pytest (Python), jest (CDK TypeScript)
**Target Platform**: AWS (Lambda, Bedrock AgentCore containers, S3)
**Project Type**: Multi-zone serverless (verification zone + execution zone)
**Performance Goals**: < 30 seconds end-to-end for single file; < 60 seconds for 5 files
**Constraints**: Lambda 120s timeout, 10 MB max per image, 5 MB max per document, 5 files max per request
**Scale/Scope**: Same as existing system (~100 users, single workspace)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No project constitution defined (placeholder template). No gates to check. Proceeding with standard engineering practices.

**Post-design re-check**: Architecture follows existing patterns (two-zone, A2A protocol, CDK constructs). S3 bucket addition is the only new infrastructure component.

## Project Structure

### Documentation (this feature)

```text
specs/024-slack-file-attachment/
├── plan.md              # This file
├── research.md          # Phase 0: 8 key decisions documented
├── data-model.md        # Phase 1: entities, state transitions, validation rules
├── quickstart.md        # Phase 1: setup and testing guide
├── contracts/           # Phase 1: A2A payload contracts
│   ├── a2a-execution-payload.yaml
│   └── execution-response.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify/create)

```text
cdk/
├── lib/
│   ├── verification/
│   │   ├── constructs/
│   │   │   ├── file-exchange-bucket.ts        # NEW: S3 bucket construct
│   │   │   ├── verification-agent-runtime.ts  # MODIFY: add S3 env vars + IAM
│   │   │   └── slack-event-handler.ts         # NO CHANGE
│   │   ├── agent/verification-agent/
│   │   │   ├── s3_file_manager.py             # NEW: S3 upload, pre-signed URL, cleanup
│   │   │   ├── pipeline.py                    # MODIFY: add S3 upload/cleanup steps
│   │   │   ├── a2a_client.py                  # MODIFY: payload format (presigned_url)
│   │   │   ├── main.py                        # NO CHANGE
│   │   │   ├── requirements.txt               # MODIFY: add boto3 if missing
│   │   │   └── tests/
│   │   │       ├── test_s3_file_manager.py    # NEW: unit tests
│   │   │       └── test_pipeline.py           # MODIFY: add S3 integration tests
│   │   ├── lambda/slack-event-handler/
│   │   │   └── (NO CHANGES — metadata extraction already works)
│   │   └── verification-stack.ts              # MODIFY: add file exchange bucket
│   └── execution/
│       ├── agent/execution-agent/
│       │   ├── file_downloader.py             # MODIFY: add pre-signed URL download
│       │   ├── attachment_processor.py        # MODIFY: use presigned_url field
│       │   ├── bedrock_client_converse.py     # MODIFY: add native document blocks
│       │   └── tests/
│       │       ├── test_file_downloader.py    # MODIFY: test pre-signed URL path
│       │       ├── test_attachment_processor.py # MODIFY: test new payload format
│       │       └── test_bedrock_client.py     # MODIFY: test document blocks
│       └── execution-stack.ts                 # NO CHANGE
├── test/
│   └── verification-stack.test.ts             # MODIFY: add S3 bucket assertions
└── bin/cdk.ts                                 # NO CHANGE
```

**Structure Decision**: Follows existing project structure. New code follows established patterns (CDK constructs, Python agent modules with tests). S3 construct parallels existing DynamoDB constructs.

## Implementation Approach

### Layer 1: Infrastructure (CDK)

Create `FileExchangeBucket` construct:
- S3 bucket with SSE-S3 encryption, block all public access, enforce SSL
- 1-day lifecycle rule on `attachments/` prefix (safety net)
- Auto-delete objects on stack removal (dev only)
- Export bucket name and ARN for agent runtime env vars
- Grant `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` to verification agent role
- No cross-account bucket policy needed (pre-signed URLs handle access)

### Layer 2: Verification Agent (S3 Upload + Cleanup)

New `s3_file_manager.py` module:
- `upload_file_to_s3(file_bytes, correlation_id, file_id, file_name, mimetype)`: Upload file, return S3 key
- `generate_presigned_url(s3_key, expiry=900)`: Generate pre-signed GET URL
- `cleanup_request_files(correlation_id)`: Delete all objects under `attachments/{correlation_id}/`

Modify `pipeline.py`:
1. After security checks, before invoking execution agent:
   - Download each file from Slack using bot token (reuse `file_downloader` logic or inline)
   - Get fresh download URL via `files.info` API
   - Upload to S3 via `s3_file_manager`
   - Generate pre-signed URL
   - Build `EnrichedAttachment` with `presigned_url` instead of `url_private_download`
2. After execution agent response and Slack posting:
   - Call `cleanup_request_files(correlation_id)` to delete S3 objects
3. On error/exception:
   - Still cleanup S3 objects (try/finally)

Modify `a2a_client.py`:
- Update payload construction to use new `EnrichedAttachment` format
- Remove `bot_token` from execution payload (no longer needed for file downloads)

### Layer 3: Execution Agent (S3 Download + Native Document Blocks)

Modify `file_downloader.py`:
- Add `download_from_presigned_url(presigned_url, expected_size)`: Simple HTTP GET (no auth header)
- Reuse existing content validation (magic bytes, Content-Type check)

Modify `attachment_processor.py`:
- Check for `presigned_url` field in attachment metadata
- If present: download from S3 via `download_from_presigned_url`
- If absent (backward compatibility): fall back to Slack download
- Remove `bot_token` dependency for file downloads

Modify `bedrock_client_converse.py`:
- Add native `document` content block support:
  - For supported formats (pdf, txt, csv, doc, docx, xls, xlsx, html, md): pass raw bytes as `document` block
  - Sanitize `name` field (alphanumeric, hyphens, spaces only — prevent prompt injection)
  - Always include `text` content block alongside `document` blocks
- For unsupported formats (pptx): fall back to text extraction
- For images: keep existing `image` content block (no change)
- Handle Bedrock document errors gracefully: fall back to text extraction if native fails

### Layer 4: Testing

Unit tests:
- `test_s3_file_manager.py`: Mock S3 client, test upload/download/cleanup/pre-signed URL generation
- Modify existing tests to reflect new payload format and S3 flow
- Test Bedrock native document content block construction

Integration tests:
- CDK snapshot test: verify S3 bucket, lifecycle rules, IAM policies
- Contract tests: verify A2A payload schema matches contract definition

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pre-signed URL expires before execution agent downloads | High | 15-min expiry provides generous buffer; retry with fresh URL if expired |
| S3 objects not cleaned up (verification agent crash) | Low | 1-day lifecycle rule auto-deletes orphaned objects |
| Bedrock native document block fails for certain formats | Medium | Fall back to text extraction (existing logic) |
| Lambda timeout during file download + S3 upload | Medium | File download happens in verification agent (container), not Lambda |
| Bot token removal breaks execution agent | High | Keep backward-compatible: check for `presigned_url` first, fall back to `url_private_download` |

## Complexity Tracking

No constitution violations to justify.
