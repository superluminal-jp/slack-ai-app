# Tasks: レガシーコードを削除（Remove Legacy Code）

**Input**: Design documents from `/specs/053-remove-legacy-code/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, quickstart.md

**Tests**: Not applicable — this feature deletes dead code only. Existing test suites serve as regression gates at each checkpoint.

**Organization**: Tasks are grouped by user story (deletion target) to enable incremental deletion with validation after each step.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Baseline Verification

**Purpose**: Establish that all existing tests pass before any deletions, so regressions can be attributed to specific deletions.

- [x] T001 Run verification-agent Python tests: `cd verification-zones/verification-agent && python -m pytest tests/ -v`
- [x] T002 [P] Run slack-event-handler Lambda tests: `cd verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler && python -m pytest tests/ -v`
- [x] T003 [P] Run verification-agent CDK tests: `cd verification-zones/verification-agent/cdk && npm test`

**Checkpoint**: All tests green — baseline established for regression detection.

---

## Phase 2: User Story 1 — 旧 agent/ ディレクトリの削除 (Priority: P1) 🎯 MVP

**Goal**: Remove the entire legacy `verification-zones/verification-agent/agent/` directory tree (~33 files) that was superseded by the `src/` layout.

**Independent Test**: Confirm `agent/` directory no longer exists, then run verification-agent pytest + CDK synth to verify nothing breaks.

### Implementation for User Story 1

- [x] T004 [US1] Delete directory tree `verification-zones/verification-agent/agent/` (recursive, ~33 files)
- [x] T005 [US1] Verify no dangling references: `rg "agent/verification-agent" --type py --type ts` (exclude specs/ and docs/)
- [x] T006 [US1] Run verification-agent Python tests: `cd verification-zones/verification-agent && python -m pytest tests/ -v`
- [x] T007 [US1] Run verification-agent CDK synth: `cd verification-zones/verification-agent/cdk && npx cdk synth`

**Checkpoint**: Legacy agent/ tree removed. Verification-agent tests and CDK synth pass.

---

## Phase 3: User Story 2 — api_gateway_client.py の削除 (Priority: P2)

**Goal**: Remove the unused API Gateway client module and its test from the slack-event-handler Lambda.

**Independent Test**: Confirm both files are deleted, then run slack-event-handler tests to verify handler.py is unaffected.

### Implementation for User Story 2

- [x] T008 [P] [US2] Delete `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/api_gateway_client.py`
- [x] T009 [P] [US2] Delete `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/tests/test_api_gateway_client.py`
- [x] T010 [US2] Verify no dangling references: `rg "api_gateway_client" --type py --type ts` (exclude specs/)
- [x] T011 [US2] Run slack-event-handler Lambda tests: `cd verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler && python -m pytest tests/ -v`

**Checkpoint**: API Gateway client dead code removed. Slack-event-handler tests pass.

---

## Phase 4: User Story 3 — router.py の削除 (Priority: P3)

**Goal**: Remove the deprecated `router.py` module and its test. Research confirmed zero production references (orchestrator.py does not import router).

**Independent Test**: Confirm both files are deleted, then run verification-agent pytest to verify no breakage.

### Implementation for User Story 3

- [x] T012 [P] [US3] Delete `verification-zones/verification-agent/src/router.py`
- [x] T013 [P] [US3] Delete `verification-zones/verification-agent/tests/test_router.py`
- [x] T014 [US3] Verify no dangling references: `rg "from router import" verification-zones/verification-agent/src/`
- [x] T015 [US3] Run verification-agent Python tests: `cd verification-zones/verification-agent && python -m pytest tests/ -v`

**Checkpoint**: All three deletion targets removed. Verification-agent tests pass.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates and final cross-zone verification.

- [x] T016 Update `docs/license-audit.md` — remove or correct the legacy path reference at L86
- [x] T017 [P] Update `CHANGELOG.md` — add [Unreleased] entry listing all deleted files with rationale
- [x] T018 [P] Update `CLAUDE.md` — add Recent Changes entry for 053-remove-legacy-code
- [x] T019 Run full test suite across all zones (quickstart.md §5): verification-agent, slack-search-agent, file-creator-agent, fetch-url-agent, time-agent, docs-agent
- [x] T020 Run final dangling reference check per quickstart.md §6

---

## Dependencies & Execution Order

### Phase Dependencies

- **Baseline (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on Phase 1 baseline pass
- **US2 (Phase 3)**: Depends on Phase 1 baseline pass (independent of US1)
- **US3 (Phase 4)**: Depends on Phase 1 baseline pass (independent of US1, US2)
- **Polish (Phase 5)**: Depends on all user stories (Phases 2-4) being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 1. No dependencies on other stories.
- **User Story 2 (P2)**: Can start after Phase 1. Independent of US1.
- **User Story 3 (P3)**: Can start after Phase 1. Independent of US1 and US2.

### Parallel Opportunities

- T001, T002, T003 (Phase 1 baseline) can all run in parallel
- T008 and T009 (US2 file deletions) can run in parallel
- T012 and T013 (US3 file deletions) can run in parallel
- T016, T017, T018 (Phase 5 doc updates) can run in parallel
- US1, US2, and US3 are fully independent and could run in parallel

---

## Parallel Example: All User Stories

```text
# After Phase 1 baseline passes, all three stories can start simultaneously:

# US1 (different directory):
Task: "Delete directory tree verification-zones/verification-agent/agent/"

# US2 (different files):
Task: "Delete api_gateway_client.py"
Task: "Delete test_api_gateway_client.py"

# US3 (different files):
Task: "Delete router.py"
Task: "Delete test_router.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Baseline verification
2. Complete Phase 2: Delete agent/ directory (biggest impact — ~33 files)
3. **STOP and VALIDATE**: Run tests, confirm no breakage
4. Commit if ready

### Incremental Delivery

1. Baseline → all tests green
2. Delete agent/ → Test → Commit (MVP — largest cleanup)
3. Delete api_gateway_client → Test → Commit
4. Delete router.py → Test → Commit
5. Update docs → Final verification → Commit

### Single-Pass Strategy (Recommended)

Since all targets are confirmed safe with zero cross-references:

1. Baseline verification (Phase 1)
2. Execute all deletions (Phases 2-4) in sequence
3. Documentation updates (Phase 5)
4. Single comprehensive commit

---

## Notes

- All deletions are confirmed safe by research.md — zero production code references for all targets
- No new code is written — this is a pure deletion feature
- Existing test suites serve as regression gates (no new tests needed)
- Spec files in `specs/` that reference old paths are out of scope (historical records)
- CHANGELOG entries in the existing log that describe the migration are preserved as history
