# Tasks: Verification Zone Usage History (039)

**Input**: Design documents from `specs/039-usage-history/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓

**TDD**: Constitution II requires test tasks to precede every implementation task. Tests MUST fail before implementation begins.

**Organization**: Tasks are grouped by user story. US2 (自動削除) and US3 (correlation_id 検索) are infrastructure-only — covered by Phase 1 CDK construct tests with no additional Python code.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to (US1/US2/US3)
- All paths relative to `verification-zones/verification-agent/`

---

## Phase 1: Setup — CDK Constructs

**Purpose**: New DynamoDB table and S3 bucket infrastructure (covers US2 TTL + US3 GSI via CDK tests)

> **TDD**: Write tests first (T001, T002), confirm they FAIL, then implement (T003, T004)

- [X] T001 [P] Write CDK unit test for UsageHistoryTable construct asserting: PK=channel_id, SK=request_id, TTL attribute=ttl, PAY_PER_REQUEST, AWS_MANAGED encryption, GSI correlation_id-index with projection ALL, 90-day TTL configuration — in `cdk/test/usage-history-table.test.ts`
- [X] T002 [P] Write CDK unit test for UsageHistoryBucket construct asserting: bucket name pattern, SSE-S3 encryption, block public access, enforceSSL, two lifecycle rules each with 90-day expiration on `content/` prefix and `attachments/` prefix — in `cdk/test/usage-history-bucket.test.ts`
- [X] T003 [P] Implement UsageHistoryTable CDK construct (PK=channel_id/SK=request_id, TTL=ttl, GSI=correlation_id-index projection ALL, PAY_PER_REQUEST, AWS_MANAGED, DESTROY) — in `cdk/lib/constructs/usage-history-table.ts`
- [X] T004 [P] Implement UsageHistoryBucket CDK construct (SSE-S3, enforceSSL, BlockPublicAccess.BLOCK_ALL, DESTROY, autoDeleteObjects, two lifecycle rules: 90-day on `content/` and 90-day on `attachments/`) — in `cdk/lib/constructs/usage-history-bucket.ts`

**Checkpoint**: `cd cdk && npm test` — T001 and T002 tests must pass (GREEN) before Phase 2

---

## Phase 2: Foundational — Stack Wiring + Core Module

**Purpose**: Wire constructs into the runtime and implement the `usage_history` write module

**⚠️ CRITICAL**: Must complete before US1 pipeline integration

> **TDD**: Write test T006 first, confirm it FAILs, then implement T007

- [X] T005 Wire UsageHistoryTable and UsageHistoryBucket into `cdk/lib/verification-stack.ts`: instantiate both constructs, add `usageHistoryTable` and `usageHistoryBucket` props to `VerificationAgentRuntimeProps` interface, add `grantWriteData` (DynamoDB), `grantPut(executionRole, "content/*")` and `grantPut(executionRole, "attachments/*")` (S3, write-only per prefix), inject env vars `USAGE_HISTORY_TABLE_NAME` and `USAGE_HISTORY_BUCKET_NAME` into runtime environment — modifies `cdk/lib/verification-stack.ts` and `cdk/lib/constructs/verification-agent-runtime.ts`
- [X] T006 [P] Write unit tests for `usage_history.py` covering: (a) `save()` calls `s3.put_object` for `content/.../input.json` when input_text non-empty, (b) `save()` calls `s3.put_object` for `content/.../output.json` when output_text non-empty, (c) `save()` skips content S3 writes when input_text/output_text empty, (d) `save()` calls `s3.copy_object` for each attachment key, (e) `save()` calls `dynamodb.put_item` with `s3_content_prefix` and metadata but WITHOUT `input_text`/`output_text` fields, (f) `save()` does not raise on DynamoDB error (fail-open), (g) `save()` does not raise on S3 error (fail-open), (h) skipped_attachments recorded when copy fails, (i) UUID generated when correlation_id is empty — in `tests/test_usage_history.py`
- [X] T007 Implement `src/usage_history.py`: `PipelineResult`, `OrchestrationResult`, `UsageRecord` dataclasses; `save(table_name, history_bucket, temp_bucket, record)` function that (1) writes `{"text": input_text}` to `content/{channel}/{date}/{corr_id}/input.json` via `s3.put_object` if non-empty, (2) writes `{"text": output_text}` to `content/{channel}/{date}/{corr_id}/output.json` via `s3.put_object` if non-empty, (3) copies each attachment from temp_bucket to `attachments/` prefix via `s3.copy_object`, (4) writes DynamoDB PutItem with metadata + `s3_content_prefix` but without `input_text`/`output_text` fields, fail-open exception handling with WARNING log containing `correlation_id`/`error`/`error_type`

**Checkpoint**: `python -m pytest tests/test_usage_history.py -v` — all tests GREEN before Phase 3

---

## Phase 3: User Story 1 — 利用履歴の記録 (Priority: P1) 🎯 MVP

**Goal**: Every Verification Agent request writes a UsageRecord to DynamoDB + copies attachments to history S3

**Independent Test**: Send Slack message → verify DynamoDB record in `{stack}-usage-history` table contains `s3_content_prefix` and pipeline_result but NOT input_text/output_text fields; verify `content/.../input.json` and `content/.../output.json` exist in S3; verify attachment S3 objects for file uploads (quickstart.md Scenarios 1–4)

> **TDD**: Write test T008 first (RED), then implement T009 and T010

- [X] T008 [US1] Write unit tests for `pipeline.py` usage-history integration covering: (a) `save()` called at end of successful run with correct `input_text` (user_text) and `output_text` (agent response) in UsageRecord — verify these are passed to `save()` which will route them to S3, not DynamoDB, (b) `save()` called when pipeline rejects at authorization with `authorization=False` and empty input_text/output_text, (c) `save()` called when pipeline rejects at rate limit with `rate_limited=True`, (d) pipeline response to user is unaffected when `save()` raises an exception, (e) `attachment_keys` (temp S3 keys from s3_file_manager) passed to `save()` — in `tests/test_pipeline_usage_history.py`
- [X] T009 [US1] Add `UsageRecord` construction and `save_usage_record()` call as final step in `pipeline.py::run()`, capturing `start_time` at method entry for `duration_ms`; build `PipelineResult` at each security pipeline decision point and pass through to `save()` — modifies `src/pipeline.py`
- [X] T010 [US1] Pass temp attachment keys collected by `s3_file_manager.py` through `pipeline.py` run context (already available in pipeline state after file upload step) to `usage_history.save()` as `attachment_keys` list — modifies `src/pipeline.py`

**Checkpoint**: `python -m pytest tests/test_pipeline_usage_history.py -v` — all tests GREEN

---

## Phase 4: User Story 2 — 保持期間による自動削除 (Priority: P2)

**Goal**: Records and files auto-delete after 90 days

> **Coverage**: Fully implemented by CDK constructs in Phase 1.
> - DynamoDB TTL attribute `ttl` (90 days) → set in T007 (`save()`) and verified in T001
> - S3 lifecycle rule 90-day expiration on `attachments/` → implemented in T004 and verified in T002
> No additional Python code or CDK changes required.

- [X] T011 [US2] Verify `cdk/test/usage-history-table.test.ts` (T001) explicitly asserts `TimeToLiveSpecification.AttributeName == "ttl"` and `TimeToLiveSpecification.Enabled == true`; add assertion if missing
- [X] T012 [US2] Verify `cdk/test/usage-history-bucket.test.ts` (T002) explicitly asserts lifecycle rule expiration days == 90 for `attachments/` prefix; add assertion if missing

**Checkpoint**: `cd cdk && npm test` still GREEN

---

## Phase 5: User Story 3 — correlation_id による履歴参照 (Priority: P3)

**Goal**: Enable lookup of a specific request by `correlation_id`

> **Coverage**: Fully enabled by DynamoDB GSI `correlation_id-index` (Projection=ALL) implemented in T003 and verified in T001. No API endpoint needed — read access is administrative (direct DynamoDB query).
> No additional Python code required.

- [X] T013 [US3] Verify `cdk/test/usage-history-table.test.ts` (T001) explicitly asserts GSI named `correlation_id-index` with `ProjectionType == "ALL"` and `AttributeName == "correlation_id"` as hash key; add assertion if missing

**Checkpoint**: `cd cdk && npm test` still GREEN

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and deploy-script parity (Constitution Principle VI — mandatory)

- [X] T014 [P] Update `verification-zones/verification-agent/README.md` to document usage history feature: what is recorded, DynamoDB table name pattern, S3 bucket name pattern, retention period, and new env vars (`USAGE_HISTORY_TABLE_NAME`, `USAGE_HISTORY_BUCKET_NAME`)
- [X] T015 Add `[Unreleased]` entry to `CHANGELOG.md` under `### Added`: "Verification Agent usage history — metadata recorded to DynamoDB; input/output text and attachments stored in dedicated S3 bucket (content/ and attachments/ prefixes) with 90-day retention for confidentiality; fail-open (write failure does not affect user response)"
- [X] T016 Update `CLAUDE.md` "Active Technologies" section with new DynamoDB table `usage-history` and S3 bucket `usage-history`; update "Recent Changes" with feature 039 summary
- [X] T017 Verify `verification-zones/verification-agent/scripts/deploy.sh` (or equivalent) reads or exports the new CDK CfnOutput names (`UsageHistoryTableName`, `UsageHistoryBucketName`) if they are referenced; update if needed
- [ ] T018 Run quickstart.md Scenarios 1–4 manually (or in integration test) to validate end-to-end behaviour in dev environment

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (CDK Constructs)
  └─► Phase 2 (Stack Wiring + usage_history.py)  [BLOCKS all Python work]
        └─► Phase 3 (US1 pipeline integration)
              └─► Phase 4 (US2 verification)
                    └─► Phase 5 (US3 verification)
                          └─► Phase 6 (Polish)
```

### Within Each Phase

- T001 and T002 are **parallel** (different files)
- T003 and T004 are **parallel** (different files, after T001/T002 RED confirmed)
- T006 is **parallel** with T005 (different files; T006 mocks boto3, no real infra needed)
- T007 depends on T006 (RED confirmed)
- T008 depends on T007 (usage_history module must exist to import)
- T009 and T010 are **sequential** (both modify pipeline.py; T009 first, T010 extends it)
- T011, T012, T013 are **parallel** (different test files, read-only verification)
- T014–T017 are **parallel** (different files)

---

## Parallel Execution Examples

### Phase 1 Parallel (all 4 tasks at once after confirming RED):
```
Agent A: T001 — Write CDK test for UsageHistoryTable
Agent B: T002 — Write CDK test for UsageHistoryBucket
(confirm both FAIL, then:)
Agent A: T003 — Implement UsageHistoryTable construct
Agent B: T004 — Implement UsageHistoryBucket construct
```

### Phase 2 Parallel (T005 and T006 together):
```
Agent A: T005 — CDK stack wiring (TypeScript)
Agent B: T006 — Write usage_history.py unit tests (Python)
(T007 after T006 RED confirmed)
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1: CDK constructs (T001–T004)
2. Phase 2: Wiring + core module (T005–T007)
3. Phase 3: Pipeline integration (T008–T010)
4. **STOP and VALIDATE**: deploy to dev, send test message, verify DynamoDB record created
5. Phase 6: Docs (T014–T017)

### Full Delivery

1. MVP above
2. Phase 4+5: Verify US2/US3 CDK test coverage (T011–T013)
3. Phase 6: Complete polish

---

## Notes

- All paths are relative to `verification-zones/verification-agent/` unless stated
- CDK tests: `cdk/test/` (Jest, `cd cdk && npm test`)
- Python tests: `tests/` (pytest, `python -m pytest tests/ -v`)
- `[P]` = different files, can run in parallel
- **TDD is mandatory per Constitution II**: every RED checkpoint must be confirmed before GREEN implementation begins
- US2 and US3 are CDK-only: no new Python modules beyond Phase 2
