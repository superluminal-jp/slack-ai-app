# Tasks: Code Cleanup — Logs, Comments, and Dead Code in verification-zones

**Input**: Design documents from `/specs/042-code-cleanup/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅

**Organization**: Tasks grouped by user story. All three stories are independently completable. US1 (logging) and US2 (comments) have no inter-story dependencies; US3 (dead code) can proceed in parallel after the baseline is established.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1/US2/US3)
- No test-first tasks: behavior is unchanged; TDD here means confirm-baseline → change → confirm-green

---

## Phase 1: Setup (Baseline Verification)

**Purpose**: Confirm all tests pass before any change, and capture the ruff F401 baseline.

- [x] T001 Run Python test baseline in verification-agent: `cd verification-zones/verification-agent && python -m pytest tests/ -v` — must exit 0 before any changes
- [x] T002 Run CDK test baseline in verification-agent: `cd verification-zones/verification-agent/cdk && npm test` — must exit 0 before any changes
- [x] T003 Run ruff baseline to document current F401 violations: `cd verification-zones/verification-agent && ruff check src/ cdk/lib/lambda/ --select F401 2>&1`
- [x] T004 [P] Run Python test baseline in slack-search-agent: `cd verification-zones/slack-search-agent && python -m pytest tests/ -v` — must exit 0

**Checkpoint**: All baselines green. No changes made yet.

---

## Phase 2: Foundational (Shared Pre-condition)

**Purpose**: No foundational setup is required for this cleanup. All three user stories can begin immediately after the baseline is confirmed.

**⚠️ CRITICAL**: All user story tasks depend on Phase 1 passing. No changes to production code until T001–T004 are confirmed green.

---

## Phase 3: User Story 1 — Readable, Actionable Log Output (Priority: P1) 🎯 MVP

**Goal**: Replace all raw `print()` calls in Lambda handler production files with structured log calls from the existing `logger.py` module, and delete the orphan `bedrock_client.py` file.

**Independent Test**: `grep -rn "^        print(" verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/{event_dedupe,slack_verifier,token_storage}.py` returns empty; `bedrock_client.py` no longer exists; Lambda test suite passes.

### Implementation for User Story 1

- [x] T005 [US1] In `cdk/lib/lambda/slack-event-handler/event_dedupe.py`: add `from logger import log_warn, log_error` import and replace `print(f"Warning: Dedupe table not found: {table_name}")` → `log_warn("dedupe_table_not_found", {"table_name": table_name})`; replace `print(f"DynamoDB error checking duplicate: {error_code}")` → `log_error("dedupe_dynamodb_error", {"error_code": error_code})`; replace `print(f"Warning: Dedupe table not found: {table_name}")` (second occurrence in `mark_event_processed`) → `log_warn("dedupe_table_not_found", {"table_name": table_name})`; replace `print(f"DynamoDB error marking event: {error_code}")` → `log_error("dedupe_mark_error", {"error_code": error_code})`
- [x] T006 [US1] In `cdk/lib/lambda/slack-event-handler/slack_verifier.py`: add `from logger import log_error` import (if not already present) and replace `print(f"Signature verification error: {str(e)}")` → `log_error("slack_signature_verification_error", {"error": str(e)})`
- [x] T007 [US1] In `cdk/lib/lambda/slack-event-handler/token_storage.py`: add `from logger import log_error` import (if not already present) and replace `print(f"Error retrieving token from DynamoDB: {str(e)}")` → `log_error("token_retrieval_error", {"error": str(e)})`
- [x] T008 [US1] Delete orphan file `cdk/lib/lambda/slack-event-handler/bedrock_client.py` (zero callers — confirmed by research.md §5; file uses 8 raw `print()` calls, references stale "Phase 5/6" roadmap notes)
- [x] T009 [US1] Run verification: `cd verification-zones/verification-agent && python -m pytest tests/ -v` (Python suite) and `cd verification-zones/verification-agent/cdk && npm test` (CDK suite) — both must pass; confirm no `print()` remaining in T005–T007 files

**Checkpoint**: US1 complete — raw `print()` calls migrated to structured logger; orphan module deleted; all tests green.

---

## Phase 4: User Story 2 — Comments Convey Intent, Not History (Priority: P2)

**Goal**: Remove all spec-number annotations matching `(NNN)` from every `.py` and `.ts` source file in `verification-zones/`, preserving explanatory content around removed annotations.

**Independent Test**: `grep -rn "([0-9]\{3\})" verification-zones/ --include="*.py" --include="*.ts" | grep -v "cdk.out\|node_modules\|\.d\.ts\|(429)"` returns empty.

### Implementation for User Story 2

**Python source files (`src/`):**

- [x] T010 [P] [US2] In `verification-zones/verification-agent/src/slack_post_request.py`: remove `(028)` from module docstring line 7 and from `build_file_artifact_s3` function docstring line 108; preserve surrounding explanatory text
- [x] T011 [P] [US2] In `verification-zones/verification-agent/src/s3_file_manager.py`: remove `(024)` from module docstring line 5; remove `(028)` from module docstring line 6, from docstring at line 82, and from docstring at line 138; preserve path descriptions and technical context around them

**Python test files (`tests/`):**

- [x] T012 [P] [US2] In `verification-zones/verification-agent/tests/test_pipeline_usage_history.py`: remove `(039)` from module docstring line 2; remove any other `(039)` inline comment occurrences; preserve the test descriptions

**Python Lambda files (`cdk/lib/lambda/`):**

- [x] T013 [P] [US2] In `cdk/lib/lambda/dynamodb-export-job/handler.py`: remove `(040)` from module docstring line 2; rewrite to plain description: `"DynamoDB Export Job Lambda handler."`
- [x] T014 [P] [US2] In `cdk/lib/lambda/agent-invoker/handler.py`: remove `(016)` from module docstring line 2; rewrite to: `"Agent Invoker Lambda: consumes SQS messages and invokes Verification Agent via InvokeAgentRuntime."`

**TypeScript CDK construct files (`cdk/lib/constructs/`):**

- [x] T015 [P] [US2] In `cdk/lib/constructs/usage-history-archive-bucket.ts`: remove `(041)` from file-level JSDoc comment on line 6; preserve the construct description
- [x] T016 [P] [US2] In `cdk/lib/constructs/usage-history-replication.ts`: remove `(041)` from JSDoc comment line 7; remove `(041)` from the CDK `description` string value on line 47 (IAM role description prop); preserve surrounding text
- [x] T017 [P] [US2] In `cdk/lib/constructs/verification-agent-runtime.ts`: remove `(039)` from JSDoc comment on DynamoDB table prop (line 62); remove `(039)` from JSDoc comment on S3 bucket prop (line 64); remove `(024)` from JSDoc comment on file exchange bucket prop (line 58); preserve the property descriptions
- [x] T018 [P] [US2] In `cdk/lib/constructs/slack-event-handler.ts`: remove `(016)` from JSDoc comment on the SQS queue property (line 36); preserve the functional description
- [x] T019 [P] [US2] In `cdk/lib/constructs/slack-poster.ts`: remove `(019)` from the JSDoc class comment on line 11; preserve "SQS queue + Lambda for posting messages to Slack"
- [x] T020 [P] [US2] In `cdk/lib/constructs/agent-invoker.ts`: remove `(016)` from JSDoc class comment on line 12; preserve the construct description

**TypeScript CDK stack file (`cdk/lib/`):**

- [x] T021 [P] [US2] In `cdk/lib/verification-stack.ts`: remove `(016)` from JSDoc property comment on line 66; preserve "SQS queue for async agent invocation requests"

**TypeScript CDK test files (`cdk/test/`):**

- [x] T022 [P] [US2] In `cdk/test/verification-stack.test.ts`: remove `(024)` from `describe("S3 File Exchange Bucket (024)", …)` label on line 236 → `describe("S3 File Exchange Bucket", …)`; remove `(031)` from `describe("Cost allocation tags (031)", …)` label on line 290 → `describe("Cost allocation tags", …)`
- [x] T023 [P] [US2] In `cdk/test/dynamodb-export-job.test.ts`: remove `(040)` from file-level comment on line 2; rewrite to: `"DynamoDbExportJob CDK unit tests."`
- [x] T024 [US2] Run verification: `grep -rn "([0-9]\{3\})" verification-zones/ --include="*.py" --include="*.ts" | grep -v "cdk.out\|node_modules\|\.d\.ts\|(429)"` must return empty; run `cd verification-zones/verification-agent && python -m pytest tests/ -v` and `cd verification-zones/verification-agent/cdk && npm test` — both must pass

**Checkpoint**: US2 complete — zero spec-number patterns in source; all tests green.

---

## Phase 5: User Story 3 — No Dead Code or Unused Imports (Priority: P3)

**Goal**: Remove all unused imports identified by `ruff F401` in Python files and TypeScript files in `verification-zones/`, plus delete the orphan `bedrock_client.py` (already done in T008 if US1 ran first; skip if already deleted).

**Independent Test**: `ruff check verification-zones/verification-agent/src/ verification-zones/verification-agent/cdk/lib/lambda/ --select F401` returns "All checks passed!"; all Python and CDK test suites remain green.

### Implementation for User Story 3 — `src/` unused imports

- [x] T025 [P] [US3] In `verification-zones/verification-agent/src/agent_card.py`: remove unused `import json` (line 13)
- [x] T026 [P] [US3] In `verification-zones/verification-agent/src/agent_tools.py`: remove unused `import inspect` (line 3)
- [x] T027 [P] [US3] In `verification-zones/verification-agent/src/cloudwatch_metrics.py`: remove unused `import json` (line 8)
- [x] T028 [P] [US3] In `verification-zones/verification-agent/src/event_dedupe.py`: remove unused `typing.Optional` from `from typing import Optional, …` (line 13); keep any remaining typing imports in use
- [x] T029 [P] [US3] In `verification-zones/verification-agent/src/existence_check.py`: remove unused `import json` (line 19)
- [x] T030 [P] [US3] In `verification-zones/verification-agent/src/orchestrator.py`: remove unused `import asyncio` (line 4); remove unused `dataclasses.field` from import (line 6); remove unused `typing.Literal` from import (line 8); keep remaining imports in use
- [x] T031 [US3] In `verification-zones/verification-agent/src/pipeline.py` (832 lines — use targeted edits): remove `from a2a_client import invoke_execution_agent` (line 21); remove `get_agent_arn,` from the agent_registry import block (lines 22–26, keep `initialize_registry` and `get_all_cards`); remove the entire router import line 27 (`from router import route_request, UNROUTED_AGENT_ID, LIST_AGENTS_AGENT_ID  # kept for backward-compat…`); remove `log_execution_agent_error_response` from the error_debug import line 34 (keep `log_execution_error`)
- [x] T032 [P] [US3] In `verification-zones/verification-agent/src/rate_limiter.py`: remove unused `import json` (line 14)
- [x] T033 [P] [US3] In `verification-zones/verification-agent/src/slack_poster.py`: remove unused `import json` (line 8)

### Implementation for User Story 3 — `cdk/lib/lambda/` unused imports (production files)

- [x] T034 [P] [US3] In `cdk/lib/lambda/dynamodb-export-job/handler.py`: remove unused `import json` (line 12)
- [x] T035 [P] [US3] In `cdk/lib/lambda/slack-event-handler/api_gateway_client.py`: remove unused `import os` (line 12); remove `botocore.credentials.Credentials` from import (line 17) — keep other botocore imports in use
- [x] T036 [P] [US3] In `cdk/lib/lambda/slack-event-handler/attachment_extractor.py`: remove unused `typing.Optional` from typing import (line 7); keep other typing imports in use
- [x] T037 [P] [US3] In `cdk/lib/lambda/slack-event-handler/event_dedupe.py`: remove unused `typing.Optional` from typing import (line 13); keep other typing imports in use (note: `from logger import log_warn, log_error` was added in T005 — ensure no double-import)
- [x] T038 [P] [US3] In `cdk/lib/lambda/slack-event-handler/handler.py`: remove unused `import time` (line 4); remove `authorization.AuthorizationError` from authorization import (line 14); remove unused `logger.set_lambda_context` from logger import (line 20) — verify `set_lambda_context` is not referenced elsewhere in the file
- [x] T039 [P] [US3] In `cdk/lib/lambda/slack-event-handler/logger.py`: remove unused `import sys` (line 14)
- [x] T040 [P] [US3] In `cdk/lib/lambda/slack-event-handler/secrets_manager_client.py`: remove unused `import os` (line 8)
- [x] T041 [US3] Run ruff verification: `cd verification-zones/verification-agent && ruff check src/ cdk/lib/lambda/ --select F401` must report "All checks passed!"; run `python -m pytest tests/ -v` and `cd cdk && npm test` — both must pass

**Checkpoint**: US3 complete — ruff F401 clean; all tests green.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation sweep, documentation parity.

- [x] T042 [P] Run full ruff check (not just F401): `cd verification-zones/verification-agent && ruff check src/ cdk/lib/lambda/` — address any new violations introduced during the cleanup
- [x] T043 [P] Confirm no unintended `print()` remain in production sources: `grep -rn "^\s*print(" verification-zones/verification-agent/src/ verification-zones/verification-agent/cdk/lib/lambda/ | grep -v "json.dumps\|>>>\|doctest\|logger.py\|slack-poster/handler.py\|agent-invoker/handler.py\|slack-response-handler"` — must return empty
- [x] T044 [P] Confirm no spec-number patterns remain: `grep -rn "([0-9]\{3\})" verification-zones/ --include="*.py" --include="*.ts" | grep -v "cdk.out\|node_modules\|\.d\.ts\|(429)"` — must return empty
- [x] T045 Run final full test suite: `cd verification-zones/verification-agent && python -m pytest tests/ -v` + `cd verification-zones/slack-search-agent && python -m pytest tests/ -v` + `cd verification-zones/verification-agent/cdk && npm test`

### Mandatory: Documentation & Deploy-Script Sync (Principle VI)

- [x] T046 Add `[Unreleased]` entry to `CHANGELOG.md`: "Removed spec-number annotations, unused imports, and dead code from verification-zones; migrated raw print() in Lambda handlers to structured logger"
- [x] T047 Update `CLAUDE.md` "Recent Changes" section: add entry for 042-code-cleanup summarizing what was cleaned up
- [x] T048 [P] Verify `README.md` and `verification-zones/verification-agent/README.md` — no architecture or setup changes in this cleanup, so no updates needed (confirm and mark done)
- [x] T049 [P] Verify `scripts/deploy.sh` — no stack or output key changes; no update needed (confirm and mark done)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Baseline)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: N/A for this cleanup
- **Phase 3 (US1)**: Requires Phase 1 green — can start immediately after
- **Phase 4 (US2)**: Requires Phase 1 green — independent of US1, can run in parallel with Phase 3
- **Phase 5 (US3)**: Requires Phase 1 green — independent of US1/US2 except T038 (handler.py) must check T005 outcome first
- **Phase 6 (Polish)**: Requires Phase 3 + Phase 4 + Phase 5 complete

### User Story Dependencies

- **US1 (P1)**: Independent — starts after Phase 1
- **US2 (P2)**: Independent — starts after Phase 1, parallelizable with US1
- **US3 (P3)**: Mostly independent — T037 (event_dedupe.py) should run after T005 (US1) to avoid import conflicts from the `log_warn`/`log_error` addition

### Within Each User Story

- All [P]-marked tasks within a story touch different files — run in parallel if desired
- Non-[P] tasks (T009, T024, T031, T041) are sequential verification gates
- Commit after each verification gate passes

### Parallel Opportunities

```bash
# Phase 3 (US1) can run in parallel with Phase 4 (US2) and Phase 5 (US3)

# Within US2 — all comment-removal tasks are independent files:
T010 src/slack_post_request.py
T011 src/s3_file_manager.py
T012 tests/test_pipeline_usage_history.py
T013 cdk/lib/lambda/dynamodb-export-job/handler.py
T014 cdk/lib/lambda/agent-invoker/handler.py
T015 cdk/lib/constructs/usage-history-archive-bucket.ts
T016 cdk/lib/constructs/usage-history-replication.ts
T017 cdk/lib/constructs/verification-agent-runtime.ts
T018 cdk/lib/constructs/slack-event-handler.ts
T019 cdk/lib/constructs/slack-poster.ts
T020 cdk/lib/constructs/agent-invoker.ts
T021 cdk/lib/verification-stack.ts
T022 cdk/test/verification-stack.test.ts
T023 cdk/test/dynamodb-export-job.test.ts

# Within US3 — all import-removal tasks are independent files:
T025–T033 src/ files (in parallel)
T034–T040 cdk/lib/lambda/ files (in parallel)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (baseline)
2. Complete Phase 3 (US1 — print() migration + bedrock_client.py deletion)
3. **STOP and VALIDATE** (T009)
4. Observable result: no raw `print()` in Lambda handlers, structured log output for error paths

### Incremental Delivery

1. Phase 1: Baseline — tests all green ✓
2. Phase 3 (US1): Logging fixed — tests still green ✓
3. Phase 4 (US2): Comments cleaned — tests still green ✓
4. Phase 5 (US3): Imports cleaned — ruff clean, tests still green ✓
5. Phase 6: Docs updated ✓

### Parallel Team Strategy

With two contributors:
1. Both confirm Phase 1 baseline
2. Contributor A: Phase 3 (US1 — 5 tasks) + Phase 5 US3-src tasks (T025–T033)
3. Contributor B: Phase 4 (US2 — 15 tasks, mostly independent files)
4. Merge + Phase 5 Lambda tasks (T034–T040) + Phase 6

---

## Notes

- **Do not touch `agent/` directory** — legacy snapshot, not built or tested; cleaning it creates divergence without benefit (see research.md §1)
- **Preserve `(429)` in existence_check.py** — HTTP status code, not a spec number
- **Lambda `print(json.dumps(…))`** in `logger.py`, `slack-poster/handler.py`, `agent-invoker/handler.py`, `slack-response-handler/logger.py` — intentional structured logging mechanism; do not replace
- **T031 (pipeline.py)** — 832-line file; use surgical targeted edits per `.claude/rules/file-editing.md`
- [P] tasks = different files, no dependencies — safe to parallelize
- Commit after each verification gate (T009, T024, T041, T045)
