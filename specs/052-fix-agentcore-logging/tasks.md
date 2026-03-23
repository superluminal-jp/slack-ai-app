# Tasks: Fix AgentCore Runtime Logging to CloudWatch

**Input**: Design documents from `/specs/052-fix-agentcore-logging/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`

**Tests**: This feature explicitly requires TDD. Write tests first, confirm they fail, then implement.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: User story label (`[US1]`, `[US2]`)
- Every task includes an exact file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare test scaffolding and task tracking files for the logging fix.

- [X] T001 Create implementation checklist in `specs/052-fix-agentcore-logging/checklists/requirements.md`
- [X] T002 Add test execution notes for all six agents in `specs/052-fix-agentcore-logging/quickstart.md`
- [X] T003 [P] Add verification runbook query examples for correlation_id lookup in `specs/052-fix-agentcore-logging/research.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared test pattern that all story phases depend on.

**CRITICAL**: Complete this phase before any user-story implementation.

- [X] T004 Define common logger test pattern (propagation, stdout, root handler, duplication) in `specs/052-fix-agentcore-logging/plan.md`
- [X] T005 [P] Document affected runtime source files and exclusions in `specs/052-fix-agentcore-logging/plan.md`
- [X] T006 [P] Document Dockerfile comment correction rule for OTel routing in `specs/052-fix-agentcore-logging/plan.md`

**Checkpoint**: Foundation complete; user story work can proceed.

---

## Phase 3: User Story 1 - Operator Investigates Agent Failure via CloudWatch (Priority: P1) 🎯 MVP

**Goal**: Ensure runtime logs from all agents propagate to root logger and reach CloudWatch via OTel within operational expectations.

**Independent Test**: Invoke each deployed agent path and confirm `correlation_id`-scoped structured entries appear in CloudWatch for pipeline stages.

### Tests for User Story 1 (TDD first)

- [X] T007 [P] [US1] Add logger propagation and root-handler tests for verification agent in `verification-zones/verification-agent/tests/test_logger_util.py`
- [X] T008 [P] [US1] Add logger propagation and root-handler tests for slack-search agent in `verification-zones/slack-search-agent/tests/test_logger_util.py`
- [X] T009 [P] [US1] Add logger propagation and root-handler tests for docs agent in `execution-zones/docs-agent/tests/test_logger_util.py`
- [X] T010 [P] [US1] Add logger propagation and root-handler tests for file-creator agent in `execution-zones/file-creator-agent/tests/test_logger_util.py`
- [X] T011 [P] [US1] Add logger propagation and root-handler tests for time agent in `execution-zones/time-agent/tests/test_logger_util.py`
- [X] T012 [P] [US1] Add logger propagation and root-handler tests for fetch-url agent in `execution-zones/fetch-url-agent/tests/test_logger_util.py`

### Implementation for User Story 1

- [X] T013 [P] [US1] Remove propagate override in verification runtime logger setup at `verification-zones/verification-agent/src/logger_util.py`
- [X] T014 [P] [US1] Remove propagate override in slack-search runtime logger setup at `verification-zones/slack-search-agent/src/logger_util.py`
- [X] T015 [P] [US1] Remove propagate override in docs runtime logger setup at `execution-zones/docs-agent/src/logger_util.py`
- [X] T016 [P] [US1] Remove propagate override in file-creator runtime logger setup at `execution-zones/file-creator-agent/src/logger_util.py`
- [X] T017 [P] [US1] Remove propagate override in time runtime logger setup at `execution-zones/time-agent/src/logger_util.py`
- [X] T018 [P] [US1] Remove propagate override in fetch-url runtime logger setup at `execution-zones/fetch-url-agent/src/logger_util.py`
- [X] T019 [P] [US1] Correct stdout/CloudWatch routing comment in verification Dockerfile at `verification-zones/verification-agent/src/Dockerfile`
- [X] T020 [P] [US1] Correct stdout/CloudWatch routing comment in slack-search Dockerfile at `verification-zones/slack-search-agent/src/Dockerfile`
- [X] T021 [P] [US1] Correct stdout/CloudWatch routing comment in docs Dockerfile at `execution-zones/docs-agent/src/Dockerfile`
- [X] T022 [P] [US1] Correct stdout/CloudWatch routing comment in file-creator Dockerfile at `execution-zones/file-creator-agent/src/Dockerfile`
- [X] T023 [P] [US1] Correct stdout/CloudWatch routing comment in time Dockerfile at `execution-zones/time-agent/src/Dockerfile`
- [X] T024 [P] [US1] Correct stdout/CloudWatch routing comment in fetch-url Dockerfile at `execution-zones/fetch-url-agent/src/Dockerfile`
- [X] T025 [US1] Validate verification agent tests and runtime logging behavior in `verification-zones/verification-agent/tests/test_logger_util.py`
- [X] T026 [US1] Validate slack-search agent tests and runtime logging behavior in `verification-zones/slack-search-agent/tests/test_logger_util.py`
- [X] T027 [US1] Validate execution-zone logger tests and runtime logging behavior in `execution-zones/docs-agent/tests/test_logger_util.py`

**Checkpoint**: US1 is complete when all six agents propagate logs to root logger and CloudWatch operational checks pass.

---

## Phase 4: User Story 2 - Developer Verifies Log Output During Local Testing (Priority: P2)

**Goal**: Preserve local stdout visibility and pytest capture behavior without OTel.

**Independent Test**: Run each zone test suite locally and confirm `log()` output remains capturable with no test changes required.

### Tests for User Story 2 (TDD first)

- [X] T028 [P] [US2] Add stdout capture assertion coverage for verification agent in `verification-zones/verification-agent/tests/test_logger_util.py`
- [X] T029 [P] [US2] Add stdout capture assertion coverage for slack-search agent in `verification-zones/slack-search-agent/tests/test_logger_util.py`
- [X] T030 [P] [US2] Add stdout capture assertion coverage for docs agent in `execution-zones/docs-agent/tests/test_logger_util.py`
- [X] T031 [P] [US2] Add stdout capture assertion coverage for file-creator agent in `execution-zones/file-creator-agent/tests/test_logger_util.py`
- [X] T032 [P] [US2] Add stdout capture assertion coverage for time agent in `execution-zones/time-agent/tests/test_logger_util.py`
- [X] T033 [P] [US2] Add stdout capture assertion coverage for fetch-url agent in `execution-zones/fetch-url-agent/tests/test_logger_util.py`

### Implementation for User Story 2

- [X] T034 [US2] Ensure `_StdoutHandler` fallback behavior remains unchanged in verification logger utility at `verification-zones/verification-agent/src/logger_util.py`
- [X] T035 [US2] Ensure `_StdoutHandler` fallback behavior remains unchanged in slack-search logger utility at `verification-zones/slack-search-agent/src/logger_util.py`
- [X] T036 [US2] Ensure `_StdoutHandler` fallback behavior remains unchanged in docs logger utility at `execution-zones/docs-agent/src/logger_util.py`
- [X] T037 [US2] Ensure `_StdoutHandler` fallback behavior remains unchanged in file-creator logger utility at `execution-zones/file-creator-agent/src/logger_util.py`
- [X] T038 [US2] Ensure `_StdoutHandler` fallback behavior remains unchanged in time logger utility at `execution-zones/time-agent/src/logger_util.py`
- [X] T039 [US2] Ensure `_StdoutHandler` fallback behavior remains unchanged in fetch-url logger utility at `execution-zones/fetch-url-agent/src/logger_util.py`
- [X] T040 [US2] Validate local pytest capture compatibility for verification zones in `verification-zones/verification-agent/tests/test_logger_util.py`
- [X] T041 [US2] Validate local pytest capture compatibility for execution zones in `execution-zones/file-creator-agent/tests/test_logger_util.py`

**Checkpoint**: US2 is complete when local runs and pytest capture structured stdout for all affected agents.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Sync project documentation and complete final validation.

- [X] T042 [P] Update unreleased change entry for logging propagation fix in `CHANGELOG.md`
- [X] T043 [P] Update active technologies/recent changes for logging fix in `CLAUDE.md`
- [X] T044 Document operational verification evidence and final status in `specs/052-fix-agentcore-logging/research.md`
- [X] T045 Record final validation commands and outcomes in `specs/052-fix-agentcore-logging/quickstart.md`

---

## Phase 6: Enable OTel Python Logging Bridge (2026-03-24 follow-up)

**Purpose**: Phase 1 fix (removing `propagate = False`) was necessary but insufficient. `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` must be set to activate the OTel logging bridge on the root logger. See updated plan.md "Phase 2 Fix" section.

- [X] T046 [P] [US1] Add `ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` to verification-agent Dockerfile at `verification-zones/verification-agent/src/Dockerfile`
- [X] T047 [P] [US1] Add `ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` to slack-search-agent Dockerfile at `verification-zones/slack-search-agent/src/Dockerfile`
- [X] T048 [P] [US1] Add `ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` to docs-agent Dockerfile at `execution-zones/docs-agent/src/Dockerfile`
- [X] T049 [P] [US1] Add `ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` to file-creator-agent Dockerfile at `execution-zones/file-creator-agent/src/Dockerfile`
- [X] T050 [P] [US1] Add `ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` to time-agent Dockerfile at `execution-zones/time-agent/src/Dockerfile`
- [X] T051 [P] [US1] Add `ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` to fetch-url-agent Dockerfile at `execution-zones/fetch-url-agent/src/Dockerfile`
- [X] T052 [P] [US1] Correct stdout/CloudWatch routing comment in all 6 Dockerfiles (done with T046-T051)
- [X] T053 Update spec.md assumption #3 with corrected root cause
- [X] T054 Update plan.md with Phase 2 fix documentation
- [X] T055 Update CHANGELOG.md with Phase 2 fix entry
- [X] T056 Validate all existing tests pass after Dockerfile changes

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 (Setup): no dependencies.
- Phase 2 (Foundational): depends on Phase 1; blocks all user stories.
- Phase 3 (US1): depends on Phase 2; MVP delivery target.
- Phase 4 (US2): depends on Phase 2 and can start after US1 implementation stabilizes.
- Phase 5 (Polish): depends on completion of desired stories (US1 required, US2 recommended).

### User Story Dependencies

- **US1 (P1)**: no dependency on US2; delivers CloudWatch logging fix end-to-end.
- **US2 (P2)**: depends on US1 logger behavior being finalized; verifies local compatibility guarantees.

### Within Each User Story

- Write tests first and confirm failure.
- Apply logger configuration/code changes.
- Run per-zone validation before closing the story.

### Parallel Opportunities

- T007-T012 can run in parallel (different test files).
- T013-T024 can run in parallel by agent/file.
- T028-T033 can run in parallel (different test files).
- T042-T043 can run in parallel (different docs).

---

## Parallel Example: User Story 1

```bash
# Parallel test authoring (US1):
Task T007 in verification-zones/verification-agent/tests/test_logger_util.py
Task T010 in execution-zones/file-creator-agent/tests/test_logger_util.py
Task T012 in execution-zones/fetch-url-agent/tests/test_logger_util.py

# Parallel implementation (US1):
Task T013 in verification-zones/verification-agent/src/logger_util.py
Task T016 in execution-zones/file-creator-agent/src/logger_util.py
Task T024 in execution-zones/fetch-url-agent/src/Dockerfile
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1 and Phase 2.
2. Complete all US1 test tasks (T007-T012), verify red state.
3. Complete US1 implementation tasks (T013-T024), verify green state.
4. Run US1 validation tasks (T025-T027) and confirm CloudWatch visibility.
5. Pause for review/deploy decision.

### Incremental Delivery

1. Deliver MVP with US1 (production observability restored).
2. Add US2 to lock in local developer experience and pytest behavior.
3. Finish with Phase 5 documentation and verification evidence.

### Suggested MVP Scope

- **MVP**: Phase 1 + Phase 2 + Phase 3 (US1)

---

## Notes

- [P] tasks must not edit the same file concurrently.
- Keep log schema unchanged (`level`, `event_type`, `service`, `timestamp`, caller fields).
- Do not modify `agent/verification-agent/logger_util.py` or Lambda logger utilities in this feature.
