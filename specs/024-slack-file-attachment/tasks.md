# Tasks: Slack File Attachment Support

**Input**: Design documents from `/specs/024-slack-file-attachment/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Tests**: TDD requested — all tests written FIRST, verified to FAIL, then implementation.

**Organization**: Tasks grouped by user story. US4 (Secure Cross-Zone Transfer) is foundational — all other stories depend on it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (Document Q&A), US2 (Image Analysis), US3 (Multiple Files), US4 (Secure Transfer)
- All paths relative to repository root

---

## Phase 1: Setup (CDK Infrastructure)

**Purpose**: Create S3 bucket construct and integrate into VerificationStack

- [x] T001 Create `FileExchangeBucket` CDK construct in `cdk/lib/verification/constructs/file-exchange-bucket.ts` — S3 bucket with SSE-S3 encryption, block all public access, enforce SSL, 1-day lifecycle rule on `attachments/` prefix, auto-delete on stack removal (dev). Export bucket name and ARN. Follow existing construct patterns (e.g., `event-dedupe.ts`). Use AWS MCP server for S3 best practice validation.
- [x] T002 Update `cdk/lib/verification/verification-stack.ts` — instantiate `FileExchangeBucket`, pass bucket name to verification agent runtime environment variables (`FILE_EXCHANGE_BUCKET`, `FILE_EXCHANGE_PREFIX=attachments/`, `PRESIGNED_URL_EXPIRY=900`).
- [x] T003 Update `cdk/lib/verification/constructs/verification-agent-runtime.ts` — add S3 IAM permissions (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`) scoped to the file exchange bucket `attachments/*` prefix. Add bucket name environment variable to agent container.
- [x] T004 Write CDK snapshot test in `cdk/test/verification-stack.test.ts` — assert S3 bucket exists with correct properties: SSE-S3, block public access, lifecycle rule (1-day expiry on `attachments/`), IAM policy granting verification agent role S3 access.

---

## Phase 2: Foundational — US4 Secure Cross-Zone File Transfer (Priority: P1)

**Purpose**: S3 file manager, pre-signed URL download, and pipeline integration. MUST complete before any user story.

**Goal**: Files are securely uploaded to S3 in the verification zone and downloadable from the execution zone via pre-signed URLs. Cleanup occurs after request completion.

**Independent Test**: Verify files upload to S3, pre-signed URLs are generated with 15-min expiry, execution agent can download via pre-signed URL, and S3 objects are deleted after processing.

### Tests for US4 (TDD — write first, verify RED)

- [x] T005 [P] [US4] Write unit tests for `s3_file_manager` in `cdk/lib/verification/agent/verification-agent/tests/test_s3_file_manager.py` — test `upload_file_to_s3()` (correct S3 key structure `attachments/{correlation_id}/{file_id}/{file_name}`, content type set), `generate_presigned_url()` (returns HTTPS URL, expiry parameter passed), `cleanup_request_files()` (lists and deletes all objects under correlation_id prefix). Mock boto3 S3 client. Test error handling for S3 upload failures.
- [x] T006 [P] [US4] Write unit tests for pre-signed URL download in `cdk/lib/execution/agent/execution-agent/tests/test_file_downloader.py` — add tests for new `download_from_presigned_url(presigned_url, expected_size)` function: successful download returns bytes, content validation (magic bytes for images), Content-Type check, retry on transient errors (5xx), no Authorization header sent. Mock `requests.get`.
- [x] T007 [P] [US4] Write unit tests for pipeline S3 integration in `cdk/lib/verification/agent/verification-agent/tests/test_pipeline.py` — add tests for: Slack file download + S3 upload flow, pre-signed URL generation and inclusion in execution payload, S3 cleanup after successful response, S3 cleanup on error (try/finally), payload no longer contains `bot_token` for file operations, payload contains `presigned_url` per contract `specs/024-slack-file-attachment/contracts/a2a-execution-payload.yaml`.
- [x] T008 [P] [US4] Write unit tests for updated attachment_processor in `cdk/lib/execution/agent/execution-agent/tests/test_attachment_processor.py` — add tests for: `presigned_url` field detection in attachment metadata, download from pre-signed URL when `presigned_url` present, fallback to Slack download when `presigned_url` absent (backward compatibility), no `bot_token` required when using pre-signed URL.

### Implementation for US4

- [x] T009 [P] [US4] Implement `s3_file_manager.py` in `cdk/lib/verification/agent/verification-agent/s3_file_manager.py` — functions: `upload_file_to_s3(file_bytes, correlation_id, file_id, file_name, mimetype)` returns S3 key, `generate_presigned_url(s3_key, expiry=900)` returns pre-signed GET URL, `cleanup_request_files(correlation_id)` lists and deletes all objects under `attachments/{correlation_id}/`. Use `boto3.client('s3')`, read bucket name from `FILE_EXCHANGE_BUCKET` env var. Add structured logging with correlation_id.
- [x] T010 [P] [US4] Implement `download_from_presigned_url()` in `cdk/lib/execution/agent/execution-agent/file_downloader.py` — simple HTTP GET (no Authorization header), reuse existing `validate_image_content()` for magic bytes check, Content-Type validation, retry with exponential backoff on transient errors (5xx), size validation against `expected_size`.
- [x] T011 [US4] Update `cdk/lib/verification/agent/verification-agent/pipeline.py` — after security checks and before invoking execution agent: (1) for each attachment, get fresh Slack download URL via `files.info` API using bot token, (2) download file bytes from Slack, (3) upload to S3 via `s3_file_manager.upload_file_to_s3()`, (4) generate pre-signed URL via `s3_file_manager.generate_presigned_url()`, (5) build `EnrichedAttachment` dict with `presigned_url` replacing `url_private_download`. After execution response and Slack posting: call `s3_file_manager.cleanup_request_files(correlation_id)`. Wrap in try/finally for cleanup on error.
- [x] T012 [US4] Update `cdk/lib/verification/agent/verification-agent/a2a_client.py` — update execution payload construction to use `EnrichedAttachment` format (id, name, mimetype, size, presigned_url). Remove `bot_token` from execution payload. Verify payload matches contract in `specs/024-slack-file-attachment/contracts/a2a-execution-payload.yaml`.
- [x] T013 [US4] Update `cdk/lib/execution/agent/execution-agent/attachment_processor.py` — check for `presigned_url` field in each attachment dict. If present: call `download_from_presigned_url()`. If absent: fall back to existing Slack download via `get_file_download_url()` + `download_file()` (backward compatibility). Remove `bot_token` as required parameter when `presigned_url` is available.
- [x] T014 [US4] Update `cdk/lib/verification/agent/verification-agent/requirements.txt` — ensure `boto3~=1.34.0` and `requests~=2.31.0` are listed (needed for Slack download and S3 operations in verification agent).
- [x] T015 [US4] Run all US4 tests and verify GREEN — `cd cdk/lib/verification/agent/verification-agent && pytest tests/test_s3_file_manager.py tests/test_pipeline.py -v` and `cd cdk/lib/execution/agent/execution-agent && pytest tests/test_file_downloader.py tests/test_attachment_processor.py -v`.

**Checkpoint**: S3 file transfer pipeline works end-to-end. Files upload to S3, pre-signed URLs are generated, execution agent downloads via pre-signed URL, cleanup occurs after processing. No bot token crosses zone boundary for file operations.

---

## Phase 3: User Story 1 — Document-Based Q&A (Priority: P1) MVP

**Goal**: Users attach a document (PDF, DOCX, XLSX, CSV, TXT) and receive an AI response that references the document content. Uses Bedrock Converse API native document content blocks for high-quality processing.

**Independent Test**: Upload a PDF with known content, ask a specific question. The AI response should reference data from the PDF.

### Tests for US1 (TDD — write first, verify RED)

- [x] T016 [P] [US1] Write unit tests for native document blocks in `cdk/lib/execution/agent/execution-agent/tests/test_bedrock_client.py` — test `prepare_document_content_converse()` (new function): correct Bedrock `document` content block format (`name`, `format`, `source.bytes`), filename sanitization (alphanumeric/hyphens/spaces only, prevents prompt injection), `text` content block always accompanies `document` block, format mapping (pdf→pdf, docx→docx, xlsx→xlsx, csv→csv, txt→txt), PPTX falls back to text extraction (not native). Test `invoke_bedrock()` with documents parameter.
- [x] T017 [P] [US1] Write integration tests for document Q&A flow in `cdk/lib/execution/agent/execution-agent/tests/test_attachment_processor.py` — add tests for: document attachment with `presigned_url`, file downloaded and passed as native document block (not text extraction), PPTX uses text extraction fallback, file-only message (empty text) generates summary, file exceeding 5 MB size limit returns clear error (FR-006), corrupted/unreadable document returns user-friendly error (FR-013).

### Implementation for US1

- [x] T018 [US1] Implement `prepare_document_content_converse()` in `cdk/lib/execution/agent/execution-agent/bedrock_client_converse.py` — new function that builds Bedrock Converse API `document` content block: `{"document": {"name": sanitized_name, "format": bedrock_format, "source": {"bytes": raw_bytes}}}`. Sanitize `name` field: strip extension, replace non-alphanumeric with hyphens, truncate to 100 chars. Map MIME types to Bedrock formats per data-model.md. Return None for unsupported formats (PPTX) to trigger text extraction fallback.
- [x] T019 [US1] Update `invoke_bedrock()` in `cdk/lib/execution/agent/execution-agent/bedrock_client_converse.py` — add `documents` parameter (list of dicts with `bytes`, `format`, `name`). Build content blocks: text block first (required alongside documents), then document blocks, then image blocks. Handle Bedrock errors for document blocks gracefully: catch ValidationException and fall back to text extraction via existing `document_extractor.py`.
- [x] T020 [US1] Update `cdk/lib/execution/agent/execution-agent/main.py` — modify `handle_message_tool()` to pass document attachments as native Bedrock document blocks (not just extracted text). For each document attachment with `processing_status=success`: add to `documents` list for `invoke_bedrock()`. For PPTX or fallback: keep existing text extraction path. Handle file-only messages (empty text) by setting default prompt "Please summarize the attached document(s)."
- [x] T021 [US1] Run all US1 tests and verify GREEN — `cd cdk/lib/execution/agent/execution-agent && pytest tests/test_bedrock_client.py tests/test_attachment_processor.py -v`.

**Checkpoint**: Users can attach documents and get AI responses referencing document content. Native Bedrock document blocks used for PDF, DOCX, XLSX, CSV, TXT. PPTX falls back to text extraction. File-only messages generate summaries.

---

## Phase 4: User Story 2 — Image-Based Analysis (Priority: P2)

**Goal**: Users attach images (PNG, JPEG, GIF, WebP) and receive AI responses that describe or analyze the image content. Images flow through S3 pipeline and use existing Bedrock image content blocks.

**Independent Test**: Upload a screenshot of a chart, ask "What trend does this chart show?" The response should describe the visual content.

### Tests for US2 (TDD — write first, verify RED)

- [x] T022 [P] [US2] Write integration tests for image processing via S3 in `cdk/lib/execution/agent/execution-agent/tests/test_attachment_processor.py` — add tests for: image attachment with `presigned_url` downloads correctly, image bytes validated via magic bytes (PNG/JPEG/GIF/WebP), image exceeding 10 MB returns clear error (FR-006), unsupported image format (e.g., BMP) returns error with supported formats list, image content passed to Bedrock as `image` content block (not `document` block).

### Implementation for US2

- [x] T023 [US2] Verify and update image path in `cdk/lib/execution/agent/execution-agent/attachment_processor.py` — ensure image attachments downloaded via `presigned_url` (S3) are correctly passed to `prepare_image_content_converse()`. Verify magic bytes validation runs on S3-downloaded content. No changes expected to `bedrock_client_converse.py` image handling (already implemented), but verify integration with new S3 download path.
- [x] T024 [US2] Run all US2 tests and verify GREEN — `cd cdk/lib/execution/agent/execution-agent && pytest tests/test_attachment_processor.py -v -k image`.

**Checkpoint**: Users can attach images and get AI responses analyzing the image content. Images flow through S3 pipeline and use existing Bedrock image content blocks.

---

## Phase 5: User Story 3 — Multiple File Attachments (Priority: P3)

**Goal**: Users attach multiple files (mix of documents and images) in a single message. The system processes all files and provides a unified AI response considering all file content together.

**Independent Test**: Attach two PDFs and ask "Compare the findings of these two reports." The response should reference content from both.

### Tests for US3 (TDD — write first, verify RED)

- [x] T025 [P] [US3] Write tests for batch file upload in `cdk/lib/verification/agent/verification-agent/tests/test_pipeline.py` — add tests for: multiple attachments (2-5 files) all uploaded to S3 under same correlation_id, each gets unique pre-signed URL, batch cleanup deletes all files for correlation_id, total processing within timeout constraints.
- [x] T026 [P] [US3] Write tests for combined prompt construction in `cdk/lib/execution/agent/execution-agent/tests/test_bedrock_client.py` — add tests for: multiple documents + images in single `invoke_bedrock()` call, max 5 documents per Bedrock request (FR-012), mixed document types (PDF + CSV) in single request, combined document + image content blocks, file count exceeding limit returns partial processing with skip message.

### Implementation for US3

- [x] T027 [US3] Update `cdk/lib/verification/agent/verification-agent/pipeline.py` — ensure loop over attachments handles multiple files: upload each to S3, generate pre-signed URL for each, include all in execution payload. Add max file count validation (5 files per FR-012), log warning for files exceeding limit.
- [x] T028 [US3] Update `cdk/lib/execution/agent/execution-agent/main.py` — build combined content for Bedrock: collect all document blocks (max 5 per Bedrock API limit), collect all image blocks (max 20 per Bedrock API limit), combine text + documents + images. If file count exceeds limits: process first N files, include skip message in response listing which files were skipped and why.
- [x] T029 [US3] Run all US3 tests and verify GREEN — `cd cdk/lib/verification/agent/verification-agent && pytest tests/test_pipeline.py -v -k multiple` and `cd cdk/lib/execution/agent/execution-agent && pytest tests/test_bedrock_client.py -v -k multiple`.

**Checkpoint**: Users can attach up to 5 files (mix of documents and images) and get a unified AI response considering all file content. Files exceeding the limit are skipped with a clear message.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, logging, CDK validation, and documentation

- [x] T030 [P] Validate error messages for all failure scenarios in `cdk/lib/execution/agent/execution-agent/main.py` — verify user-friendly error messages (in user's language per FR-013) for: unsupported file type, file too large, download failed, corrupted/unreadable file, password-protected document, MIME type mismatch. Validate against `ERROR_MESSAGE_MAP` in `cdk/lib/verification/agent/verification-agent/pipeline.py`.
- [x] T031 [P] Verify structured logging with correlation IDs in all modified files — confirm all S3 operations, file downloads, Bedrock calls, and errors include `correlation_id` in log entries (FR-014). Check: `s3_file_manager.py`, `pipeline.py`, `file_downloader.py`, `attachment_processor.py`, `bedrock_client_converse.py`.
- [x] T032 [P] Run CDK synthesis and snapshot validation — `cd cdk && npx cdk synth && npm test`. Verify S3 bucket properties, IAM policies, lifecycle rules, environment variables in synthesized template.
- [x] T033 Run full test suite across both agents — `cd cdk/lib/verification/agent/verification-agent && pytest tests/ -v` and `cd cdk/lib/execution/agent/execution-agent && pytest tests/ -v`. All tests must pass.
- [x] T034 Run `quickstart.md` validation — follow steps in `specs/024-slack-file-attachment/quickstart.md` to verify local development setup, deployment commands, and test procedures are accurate.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US4 Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1 Documents)**: Depends on Phase 2 completion
- **Phase 4 (US2 Images)**: Depends on Phase 2 completion — can run in parallel with US1
- **Phase 5 (US3 Multiple Files)**: Depends on Phase 3 (US1) and Phase 4 (US2)
- **Phase 6 (Polish)**: Depends on all user stories complete

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 2: US4 (Secure Transfer) ← BLOCKS ALL
    ↓                ↓
Phase 3: US1      Phase 4: US2    ← Can run in parallel
    ↓                ↓
Phase 5: US3 (depends on US1 + US2)
    ↓
Phase 6: Polish
```

### Within Each Phase (TDD Cycle)

1. Write tests → verify RED (tests fail)
2. Implement → verify GREEN (tests pass)
3. Refactor if needed
4. Move to next task

### Parallel Opportunities

**Phase 1**: T001, T002, T003 are sequential (dependency chain). T004 can be parallel with T003.

**Phase 2 Tests**: T005, T006, T007, T008 all marked [P] — different test files, can run in parallel.

**Phase 2 Implementation**: T009 and T010 marked [P] — different modules in different agents. T011-T013 sequential (depend on T009/T010).

**Phase 3 + Phase 4**: Can run in parallel after Phase 2 completes (different agent files).

---

## Parallel Example: Phase 2 (TDD Tests)

```bash
# Launch all Phase 2 tests in parallel (different files):
Task: "T005 [US4] Write tests for s3_file_manager"
Task: "T006 [US4] Write tests for pre-signed URL download"
Task: "T007 [US4] Write tests for pipeline S3 integration"
Task: "T008 [US4] Write tests for attachment_processor"

# Then launch parallel implementations:
Task: "T009 [US4] Implement s3_file_manager.py"
Task: "T010 [US4] Implement download_from_presigned_url()"
```

## Parallel Example: Phase 3 + Phase 4

```bash
# After Phase 2 completes, run US1 and US2 in parallel:
# Developer A (US1 - Documents):
Task: "T016 [US1] Write tests for native document blocks"
Task: "T018 [US1] Implement prepare_document_content_converse()"

# Developer B (US2 - Images):
Task: "T022 [US2] Write tests for image processing via S3"
Task: "T023 [US2] Verify image path in attachment_processor"
```

---

## Implementation Strategy

### MVP First (US4 + US1 Only)

1. Complete Phase 1: Setup (CDK infrastructure)
2. Complete Phase 2: US4 (S3 file transfer pipeline)
3. Complete Phase 3: US1 (Document-Based Q&A)
4. **STOP and VALIDATE**: Test with a real PDF in Slack → AI response references PDF content
5. Deploy/demo if ready — this delivers core value

### Incremental Delivery

1. Setup + US4 → Secure S3 transfer pipeline works
2. Add US1 → Document Q&A works → Deploy (MVP)
3. Add US2 → Image analysis works → Deploy
4. Add US3 → Multiple files work → Deploy
5. Polish → Error messages, logging, docs → Final release

### Parallel Team Strategy

With 2 developers after Phase 2:
- Developer A: US1 (Documents) → US3 (Multiple Files)
- Developer B: US2 (Images) → Polish

---

## Summary

| Phase | Story | Tasks | Parallelizable |
|-------|-------|-------|----------------|
| 1 Setup | — | T001-T004 (4) | T004 ∥ T003 |
| 2 Foundational | US4 | T005-T015 (11) | T005-T008 ∥, T009-T010 ∥ |
| 3 Documents | US1 | T016-T021 (6) | T016-T017 ∥ |
| 4 Images | US2 | T022-T024 (3) | T022 ∥ with T016-T017 |
| 5 Multiple | US3 | T025-T029 (5) | T025-T026 ∥ |
| 6 Polish | — | T030-T034 (5) | T030-T032 ∥ |
| **Total** | | **34 tasks** | |

---

## Notes

- TDD enforced: write tests FIRST, verify they FAIL, then implement
- [P] tasks = different files, no dependencies — safe to run in parallel
- [Story] label maps task to specific user story for traceability
- All file paths are relative to repository root
- AWS best practices applied per research.md decisions (SSE-S3, pre-signed URLs, lifecycle rules)
- Use AWS MCP server during implementation for CDK construct validation and S3 best practices
- Commit after each completed TDD cycle (test + implementation)
