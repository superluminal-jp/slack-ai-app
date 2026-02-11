# Tasks: エコーモード削除

**Input**: Design documents from `/specs/023-remove-echo-mode/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Organization**: Tasks follow bottom-up deletion order (tests → implementation → types → docs) to maintain build/test integrity at each step. User story labels indicate traceability to spec requirements.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1=Pipeline code, US2=CDK config, US3=Test removal
- Include exact file paths in descriptions

---

## Phase 1: Pre-Verification

**Purpose**: Confirm all existing tests pass before making any deletions

- [ ] T001 Run Verification Agent pytest and confirm all tests pass: `pytest cdk/lib/verification/agent/verification-agent/tests/test_main.py -v`
- [ ] T002 [P] Run Lambda handler pytest and confirm all tests pass: `pytest cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py -v`
- [ ] T003 [P] Run CDK Jest tests and confirm all tests pass: `cd cdk && npx jest`

**Checkpoint**: All existing tests green. Safe to begin deletions.

---

## Phase 2: User Story 3 - エコーモード関連テストの除去 (Priority: P2, executed first due to deletion dependency)

**Goal**: Delete echo mode test classes that would fail once implementation code is removed. Feature 022 normal-flow tests are preserved.

**Independent Test**: After this phase, run all test suites — remaining tests pass, deleted test classes no longer exist.

### Verification Agent Tests (test_main.py)

- [x] T004 [US3] Delete `Test018EchoModeAtRuntime` class (lines ~447-524) in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T005 [US3] Delete `Test018EchoContentAndTarget` class (lines ~527-567) in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T006 [US3] Delete `Test018EchoModeOff` class (lines ~570-651) in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T007 [US3] Remove `patch.dict(os.environ, {"VALIDATION_ZONE_ECHO_MODE": ""}, clear=False)` from all Feature 022 test methods (~22 occurrences) in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T008 [US3] Run `pytest cdk/lib/verification/agent/verification-agent/tests/test_main.py -v` and confirm all remaining tests pass

### Lambda Handler Tests (test_handler.py)

- [x] T009 [P] [US3] Delete `Test017EchoMode` class (lines ~777-963) in `cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py`
- [x] T010 [P] [US3] Delete `Test017EchoModeOff` class (lines ~966-1090) in `cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py`
- [x] T011 [P] [US3] Delete Feature 018 Lambda echo test class (lines ~1091-1127) in `cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py`
- [x] T012 [US3] Run `pytest cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py -v` and confirm all remaining tests pass

### CDK Tests (verification-stack.test.ts)

- [x] T013 [P] [US3] Delete `should not have VALIDATION_ZONE_ECHO_MODE when not provided` test (lines ~129-137) in `cdk/test/verification-stack.test.ts`
- [x] T014 [P] [US3] Delete `should set VALIDATION_ZONE_ECHO_MODE when validationZoneEchoMode is true` test (lines ~234-248) in `cdk/test/verification-stack.test.ts`
- [x] T015 [P] [US3] Delete `018 Echo at Runtime` describe block (lines ~257-271) in `cdk/test/verification-stack.test.ts`
- [x] T016 [P] [US3] Delete `US4: CdkConfig validationZoneEchoMode type safety` describe block (lines ~299-334) in `cdk/test/verification-stack.test.ts`
- [x] T017 [US3] Run `cd cdk && npx jest` and confirm all remaining CDK tests pass

### E2E Tests

- [x] T018 [P] [US3] Delete `TestEchoModeFullFlow` class in `tests/e2e/test_slack_flow.py`
- [x] T019 [P] [US3] Remove echo mode sections from `tests/e2e/README.md` (prerequisites, test descriptions, example output referencing echo mode)

**Checkpoint**: All echo mode tests removed. Remaining test suites pass. Ready to remove implementation code.

---

## Phase 3: User Story 1 - エコーモード関連コードの完全除去 (Priority: P1)

**Goal**: Remove echo mode conditional branch from Verification Agent pipeline so all messages unconditionally delegate to Execution Agent.

**Independent Test**: `pipeline.py` has no reference to `VALIDATION_ZONE_ECHO_MODE`; run pytest to confirm normal flow works.

### Implementation

- [x] T020 [US1] Delete echo mode branch (lines 205-216: `if (os.environ.get("VALIDATION_ZONE_ECHO_MODE")...` through `return json.dumps(...)`) in `cdk/lib/verification/agent/verification-agent/pipeline.py`
- [x] T021 [US1] Remove `import os` if no longer used elsewhere in `cdk/lib/verification/agent/verification-agent/pipeline.py` (verify other usages first)
- [x] T022 [US1] Run `pytest cdk/lib/verification/agent/verification-agent/tests/test_main.py -v` and confirm all tests pass

**Checkpoint**: Pipeline code clean. All messages delegate to Execution Agent unconditionally.

---

## Phase 4: User Story 2 - CDK 構成からのエコーモード設定除去 (Priority: P1)

**Goal**: Remove `validationZoneEchoMode` from all CDK type definitions, constructs, stack, and entry point.

**Independent Test**: No TypeScript compile errors; `cd cdk && npx jest` passes; grep for `validationZoneEchoMode` in CDK files returns zero results.

### CDK Constructs

- [x] T023 [P] [US2] Remove `validationZoneEchoMode?: boolean` prop and JSDoc (line ~26) from `SlackEventHandlerProps` interface, and remove conditional env var block (lines ~106-109) in `cdk/lib/verification/constructs/slack-event-handler.ts`
- [x] T024 [P] [US2] Remove `validationZoneEchoMode?: boolean` prop and JSDoc (lines ~39-40) from `VerificationAgentRuntimeProps` interface, and remove conditional env var block (lines ~204-206) in `cdk/lib/verification/constructs/verification-agent-runtime.ts`

### Verification Stack

- [x] T025 [US2] Remove `validationZoneEchoMode` local variable (lines ~95-98), remove from VerificationAgentRuntime props (line ~181: `validationZoneEchoMode: validationZoneEchoMode ?? false`), and remove from SlackEventHandler props (line ~200: `validationZoneEchoMode`) in `cdk/lib/verification/verification-stack.ts`

### Type Definitions

- [x] T026 [P] [US2] Remove `validationZoneEchoMode` property and JSDoc (lines ~73-76) from `VerificationStackProps` interface in `cdk/lib/types/stack-config.ts`
- [x] T027 [P] [US2] Remove `validationZoneEchoMode?: boolean` field (lines ~48-49) from `CdkConfig` interface, and remove `validationZoneEchoMode: z.boolean().optional().default(false)` (line ~100) from Zod schema in `cdk/lib/types/cdk-config.ts`

### CDK Entry Point

- [x] T028 [US2] Remove echo mode variable block (lines ~157-164: `const validationZoneEchoMode = ...`) and context setting (lines ~197-199: `if (validationZoneEchoMode)`) in `cdk/bin/cdk.ts`

### Validation

- [x] T029 [US2] Run `cd cdk && npx jest` and confirm all CDK tests pass
- [x] T030 [US2] Verify `grep -r "validationZoneEchoMode" cdk/` returns no results (excluding node_modules)

**Checkpoint**: CDK configuration clean. No echo mode references in infrastructure code.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Clean up deploy scripts, documentation, and project configuration

### Deploy Script

- [x] T031 [P] Remove echo mode comment (line ~15: `#   export VALIDATION_ZONE_ECHO_MODE=true`) and conditional block (lines ~277-282: `if [[ "${VALIDATION_ZONE_ECHO_MODE:-}" == "true" ]]...`) in `scripts/deploy-split-stacks.sh`

### Documentation

- [x] T032 [P] Remove echo mode troubleshooting sections (017 echo mode at Lambda ~L479-498, 018 echo mode at Runtime ~L511-544, echo_mode_response log entries ~L580-581) in `docs/how-to/troubleshooting.md`
- [x] T033 [P] Remove `echo_mode_response` references (lines ~67, ~79, ~117) in `docs/how-to/troubleshooting-no-reply.md`
- [x] T034 [P] Update echo mode related entries (lines ~546, ~556) in `README.md`
- [x] T035 [P] Update echo mode related entries (line ~558) in `README.ja.md`

### Project Configuration

- [x] T036 [P] Remove `VALIDATION_ZONE_ECHO_MODE=true` permission entry (line ~35) from `.claude/settings.local.json`
- [x] T037 Remove `022-echo-mode-disable-validation` technology entries from `CLAUDE.md` (lines referencing 022-echo-mode-disable-validation in Active Technologies and Recent Changes sections)

### Final Verification

- [x] T038 Run full verification: `grep -rn "VALIDATION_ZONE_ECHO_MODE" --include="*.py" --include="*.ts" --include="*.sh" .` returns no results (excluding specs/ and CHANGELOG.md)
- [x] T039 Run full verification: `grep -rn "validationZoneEchoMode" --include="*.ts" .` returns no results (excluding specs/, node_modules/, CHANGELOG.md)
- [x] T040 Run all test suites: pytest (Verification Agent + Lambda) and Jest (CDK) all pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Pre-Verification)**: No dependencies — run immediately
- **Phase 2 (US3 - Test Deletion)**: Depends on Phase 1 confirmation — MUST complete before Phase 3
- **Phase 3 (US1 - Pipeline Code)**: Depends on Phase 2 (echo mode tests removed)
- **Phase 4 (US2 - CDK Config)**: Depends on Phase 3 (pipeline no longer references echo mode)
- **Phase 5 (Polish)**: Depends on Phase 4 (all code clean)

### Why US3 (P2) executes before US1 (P1)

In a deletion scenario, the dependency is reversed from typical feature development:
- Echo mode **tests** assert echo behavior exists → must be deleted **before** echo code
- Echo mode **code** references CDK config → CDK config deleted **after** code
- This bottom-up order ensures builds and tests pass at every step

### Parallel Opportunities

**Within Phase 1** (all parallel):
```
T001 (pytest verification agent)
T002 (pytest lambda handler)
T003 (jest CDK)
```

**Within Phase 2 — test_main.py** (sequential within file, parallel across files):
```
File 1: T004 → T005 → T006 → T007 → T008
File 2: T009 + T010 + T011 → T012
File 3: T013 + T014 + T015 + T016 → T017
File 4: T018 + T019
```

**Within Phase 4 — CDK** (parallel across files):
```
T023 (slack-event-handler.ts) + T024 (verification-agent-runtime.ts) + T026 (stack-config.ts) + T027 (cdk-config.ts)
→ T025 (verification-stack.ts) — depends on constructs being updated
→ T028 (cdk.ts) — depends on stack being updated
→ T029 + T030 (validation)
```

**Within Phase 5** (all parallel except final verification):
```
T031 + T032 + T033 + T034 + T035 + T036 + T037
→ T038 + T039 + T040 (final verification)
```

---

## Implementation Strategy

### Sequential Execution (Single Developer)

1. Phase 1: Verify green baseline (T001-T003)
2. Phase 2: Delete all echo mode tests (T004-T019) — largest phase
3. Phase 3: Delete pipeline echo branch (T020-T022) — smallest phase
4. Phase 4: Delete CDK config (T023-T030)
5. Phase 5: Clean up docs/scripts (T031-T040)
6. **STOP and VALIDATE**: Full grep + full test run

### Incremental Commits

Commit after each phase for clean, reviewable diffs:
1. `refactor: remove echo mode test classes (Phase 2)`
2. `refactor: remove echo mode pipeline branch (Phase 3)`
3. `refactor: remove echo mode CDK configuration (Phase 4)`
4. `docs: remove echo mode documentation and scripts (Phase 5)`

---

## Notes

- CHANGELOG.md echo mode entries are **preserved** (past version history)
- Spec files (017, 018, 022) are **preserved** as archive
- `os` import in pipeline.py: verify other usages before removing
- Feature 022 tests: only remove `VALIDATION_ZONE_ECHO_MODE` env var patches; test logic and assertions are unchanged
- All deletions are pure removal — no new code or functionality added
