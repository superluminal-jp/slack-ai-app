# Tasks: S3-backed Large File Artifact

**Input**: Design documents from `/specs/028-s3-large-file-transfer/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- CDK: `cdk/lib/verification/constructs/`, `cdk/lib/verification/agent/verification-agent/`
- Slack Poster: `cdk/lib/verification/lambda/slack-poster/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure design artifacts and project context are ready

- [x] T001 Verify design artifacts (spec.md, plan.md, data-model.md, contracts/) and branch in specs/028-s3-large-file-transfer/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add `generated_files/` lifecycle rule (1-day expiration) in cdk/lib/verification/constructs/file-exchange-bucket.ts
- [x] T003 [P] Add grantReadWrite for `generated_files/*` in cdk/lib/verification/constructs/verification-agent-runtime.ts
- [x] T004 Add `upload_generated_file_to_s3(file_bytes, correlation_id, file_name, mime_type) -> str` in cdk/lib/verification/agent/verification-agent/s3_file_manager.py (S3 key: generated_files/{correlation_id}/{sanitized_file_name})
- [x] T005 Add `generate_presigned_url_for_generated_file(s3_key, expiry=900) -> str` in cdk/lib/verification/agent/verification-agent/s3_file_manager.py (reuse existing generate_presigned_url logic)
- [x] T006 [P] Add file name sanitization for S3 key (per 027: control chars, Windows forbidden chars; fallback `generated_file_{timestamp}.{ext}`) in cdk/lib/verification/agent/verification-agent/s3_file_manager.py
- [x] T007 [P] Add unit test for `upload_generated_file_to_s3` and `generate_presigned_url_for_generated_file` in cdk/lib/verification/agent/verification-agent/tests/test_s3_file_manager.py

**Checkpoint**: S3 bucket, IAM, and s3_file_manager ready. Pipeline and Slack Poster can proceed.

---

## Phase 3: User Story 1 - Receive Large AI-Generated File in Slack (Priority: P1) 🎯 MVP

**Goal**: Users receive AI-generated files > 200 KB in Slack via S3-backed delivery (presigned URL in SQS).

**Independent Test**: Request an AI-generated file > 200 KB; verify it appears in Slack as a downloadable attachment.

### Implementation for User Story 1

- [x] T008 [US1] Add `build_file_artifact_s3(s3_presigned_url, file_name, mime_type) -> dict` in cdk/lib/verification/agent/verification-agent/slack_post_request.py
- [x] T009 [US1] Extend pipeline.py: add `SQS_FILE_ARTIFACT_SIZE_THRESHOLD = 200 * 1024`; after parse_file_artifact branch by size; if > 200KB call upload_generated_file_to_s3, generate_presigned_url_for_generated_file, build_file_artifact_s3, send_slack_post_request; else use existing build_file_artifact in cdk/lib/verification/agent/verification-agent/pipeline.py
- [x] T010 [US1] Refactor Slack Poster _post_file to accept file_bytes: bytes; in _process_one add s3PresignedUrl branch (urllib.request.urlopen) and contentBase64 branch (base64.decode), both pass bytes to _post_file in cdk/lib/verification/lambda/slack-poster/handler.py
- [x] T011 [P] [US1] Add pipeline test for size > 200KB S3 path in cdk/lib/verification/agent/verification-agent/tests/test_pipeline.py

**Checkpoint**: Large files (> 200 KB) are delivered to Slack via S3. MVP complete.

---

## Phase 4: User Story 2 - Small Files Continue to Work (Priority: P2)

**Goal**: Files ≤ 200 KB continue to use the existing inline mechanism; no regression.

**Independent Test**: Request a file < 200 KB; verify it is delivered via inline path (contentBase64) without behavior change.

### Implementation for User Story 2

- [x] T012 [P] [US2] Add pipeline test for size ≤ 200KB inline path and 200KB boundary (≤ uses inline) in cdk/lib/verification/agent/verification-agent/tests/test_pipeline.py

**Checkpoint**: Small files work as before. Backward compatibility verified. (Implementation is the else branch in T009.)

---

## Phase 5: User Story 3 - Transparent Handling of Both Formats (Priority: P3)

**Goal**: Slack Poster handles both inline (contentBase64) and S3-backed (s3PresignedUrl) formats transparently.

**Independent Test**: Send mixed workloads (small and large files); verify all are posted correctly.

### Implementation for User Story 3

- [x] T013 [US3] (Satisfied by T010) Slack Poster handles both formats: s3PresignedUrl and contentBase64 paths both resolve to file_bytes and call _post_file. Add structured log for artifact_type when posting in cdk/lib/verification/lambda/slack-poster/handler.py
- [x] T014 [P] [US3] Add Slack Poster test for s3PresignedUrl path (mock HTTP or integration) if test harness exists in cdk/lib/verification/lambda/slack-poster/

**Checkpoint**: Both formats handled. Dual-format support complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, observability, and validation

- [x] T015 [P] Add structured logging for artifact routing (artifact_type: inline|s3, size_bytes) in cdk/lib/verification/agent/verification-agent/pipeline.py
- [x] T016 Update slack-post-request.md in specs/019-slack-poster-separation/contracts/ to document s3PresignedUrl format (or add reference to 028 contract)
- [x] T017 Run quickstart.md validation: pytest test_s3_file_manager, test_pipeline; manual Slack Poster s3PresignedUrl test

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies — can start immediately
- **Phase 2**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — MVP
- **Phase 4 (US2)**: Depends on Phase 3 (validates else branch of pipeline)
- **Phase 5 (US3)**: Depends on Phase 3 (T010 satisfies both US1 and US3; T013 adds logging)
- **Phase 6**: Depends on Phases 3–5

### User Story Dependencies

- **US1 (P1)**: After Foundational. Delivers large-file S3 path.
- **US2 (P2)**: After US1. Validates inline path (else branch in T009).
- **US3 (P3)**: After US1. Slack Poster dual-format (T010).

### Parallel Opportunities

- T002, T003 can run in parallel (different CDK files)
- T006, T007 can run in parallel (s3_file_manager, test file)
- T011, T012 can run in parallel (test_pipeline)
- T015, T016 can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# CDK changes in parallel:
Task T002: "Add generated_files/ lifecycle rule in file-exchange-bucket.ts"
Task T003: "Add grantReadWrite generated_files/* in verification-agent-runtime.ts"

# After T004, T005:
Task T006: "Add file name sanitization in s3_file_manager.py"
Task T007: "Add unit test in test_s3_file_manager.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational (T002–T007)
3. Phase 3: US1 (T008–T012)
4. **STOP and VALIDATE**: Test large file (> 200 KB) delivery to Slack
5. Deploy and demo

### Incremental Delivery

1. Foundational → S3 + s3_file_manager ready
2. US1 → Large files work (MVP)
3. US2 → Small files verified (no regression)
4. US3 → Dual-format poster (refactor for clarity)
5. Polish → Logging, docs, quickstart validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to user story for traceability
- T015/T016: Slack Poster refactor can be done as part of T011; split for clarity
- Tests: quickstart references test_s3_file_manager, test_pipeline; include those tasks
- Commit after each task or logical group
