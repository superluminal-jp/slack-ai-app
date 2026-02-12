# Tasks: Echo Mode Disable — Full Pipeline Validation with TDD

**Input**: Design documents from `/specs/022-echo-mode-disable-validation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md
**Tests**: Required (FR-006: TDD approach; user input: "TDD")

**Organization**: Tasks grouped by user story. TDD enforced: tests written and committed BEFORE implementation (RED → GREEN → REFACTOR per D-004).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- All test tasks target: `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- All implementation tasks target: `cdk/lib/verification/agent/verification-agent/pipeline.py`

---

## Phase 1: Setup

**Purpose**: Verify existing environment is ready and establish TDD baseline

- [x] T001 Run existing test suite to confirm all 63 tests pass as baseline: `pytest cdk/lib/verification/agent/verification-agent/tests/ -v`
- [x] T002 Verify echo mode disabled path works with existing tests: `pytest cdk/lib/verification/agent/verification-agent/tests/test_main.py -v -k "Test018EchoModeOff"`

**Checkpoint**: All existing tests pass — safe to add new test classes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational work needed — existing `test_main.py` and `pipeline.py` provide all infrastructure. The conftest.py mocks (FastAPI, uvicorn, slack_sdk) and the patch pattern (`@patch("pipeline.xxx")`) are already established.

**Checkpoint**: Foundation ready — user story test writing can begin

---

## Phase 3: User Story 1 + 2 — Normal Flow & Security Check TDD (Priority: P1) MVP

**Goal**: Write comprehensive TDD tests for echo-mode-disabled pipeline: normal flow delegation (US1) and all security check paths (US2). Then implement minimal pipeline enhancements to pass new tests.

**Independent Test**: Run `pytest tests/test_main.py -v -k "Test022"` — all new tests pass; existing tests unchanged.

### RED Phase: Write Failing Tests (commit separately as `test(022): RED`)

> **NOTE: Write ALL these tests FIRST, ensure they FAIL before any implementation**

- [x] T003 [P] [US1] Write `Test022NormalFlowDelegation.test_echo_off_delegates_to_execution_agent` — verify that with `VALIDATION_ZONE_ECHO_MODE=""`, `invoke_execution_agent` is called and `send_slack_post_request` receives the AI response text in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T004 [P] [US1] Write `Test022NormalFlowDelegation.test_echo_off_no_echo_prefix_in_response` — verify response text does NOT contain `[Echo]` prefix when echo mode is disabled in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T005 [P] [US1] Write `Test022NormalFlowDelegation.test_echo_off_with_file_artifact` — verify file artifact from execution agent is forwarded to Slack post request in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T006 [P] [US1] Write `Test022NormalFlowDelegation.test_echo_off_payload_contains_all_fields` — verify execution payload includes channel, text, bot_token, thread_ts, attachments, correlation_id, team_id, user_id in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T007 [P] [US1] Write `Test022NormalFlowDelegation.test_echo_off_env_var_case_insensitive` — verify `VALIDATION_ZONE_ECHO_MODE` values `"false"`, `"False"`, `"FALSE"`, `""`, unset all trigger normal flow in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T008 [P] [US2] Write `Test022SecurityCheckPipeline.test_existence_check_runs_before_authorization` — verify existence check is called; if it fails, authorization is NOT called in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T009 [P] [US2] Write `Test022SecurityCheckPipeline.test_authorization_runs_before_rate_limit` — verify authorization is called; if it fails, rate_limit is NOT called in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T010 [P] [US2] Write `Test022SecurityCheckPipeline.test_rate_limit_exception_class_returns_error` — verify `RateLimitExceededError` exception (not just tuple) returns rate_limit_exceeded error in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T011 [P] [US2] Write `Test022SecurityCheckPipeline.test_authorization_exception_returns_error` — verify unexpected exception from `authorize_request` returns authorization_error in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T012 [P] [US2] Write `Test022SecurityCheckPipeline.test_all_checks_pass_delegates_to_execution` — verify when all 3 security checks pass, `invoke_execution_agent` is called with correct payload in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`

**Checkpoint**: All T003-T012 tests written. Run `pytest -k "Test022" -v` — expect RED (some tests may pass against existing code, which is fine; new edge case tests should fail)

### GREEN Phase: Implement to Pass Tests

- [x] T013 [US1] Add `json.JSONDecodeError` handling in execution result parsing — wrap `json.loads(execution_result)` in try/except in `cdk/lib/verification/agent/verification-agent/pipeline.py` (D-003 item 2)
- [x] T014 [US1] Add logging to `parse_file_artifact` when Base64 decode fails — log warning with correlation_id instead of silent `None` return in `cdk/lib/verification/agent/verification-agent/pipeline.py` (D-003 item 1)
- [x] T015 [US2] Verify `is_processing = False` is set on all error paths in execution delegation try/except block in `cdk/lib/verification/agent/verification-agent/pipeline.py` (D-003 item 3)
- [x] T016 Run all tests to confirm GREEN: `pytest cdk/lib/verification/agent/verification-agent/tests/ -v` — all existing + new tests pass

**Checkpoint**: US1 + US2 complete. `pytest -k "Test022NormalFlowDelegation or Test022SecurityCheckPipeline" -v` all GREEN.

---

## Phase 4: User Story 3 — Execution Error Handling (Priority: P2)

**Goal**: Verify all execution agent error codes produce correct user-friendly messages and exceptions are handled gracefully.

**Independent Test**: Run `pytest tests/test_main.py -v -k "Test022ExecutionErrorPaths"` — all tests pass.

### RED Phase: Write Failing Tests

- [x] T017 [P] [US3] Write `Test022ExecutionErrorPaths.test_bedrock_throttling_error_posts_friendly_message` — verify `bedrock_throttling` error code produces message containing "混雑" in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T018 [P] [US3] Write `Test022ExecutionErrorPaths.test_access_denied_error_posts_friendly_message` — verify `access_denied` error code produces message containing "アクセス" in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T019 [P] [US3] Write `Test022ExecutionErrorPaths.test_invalid_json_response_from_execution_posts_generic_error` — verify non-JSON response from execution agent posts generic error message to Slack in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T020 [P] [US3] Write `Test022ExecutionErrorPaths.test_empty_response_from_execution_handles_gracefully` — verify empty string response from execution agent does not crash, posts error to Slack in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T021 [P] [US3] Write `Test022ExecutionErrorPaths.test_exception_does_not_leak_internal_details` — verify when execution agent raises exception, the message posted to Slack does NOT contain stack trace, ARN, or token in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T022 [P] [US3] Write `Test022ExecutionErrorPaths.test_is_processing_reset_on_execution_exception` — verify `pipeline.is_processing` is `False` after execution agent raises exception in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`

### GREEN Phase: Implement to Pass Tests

- [x] T023 [US3] Implement `json.JSONDecodeError` handling for execution agent responses that return non-JSON — post generic error message and log the failure in `cdk/lib/verification/agent/verification-agent/pipeline.py`
- [x] T024 Run tests to confirm GREEN: `pytest cdk/lib/verification/agent/verification-agent/tests/test_main.py -v -k "Test022ExecutionErrorPaths"`

**Checkpoint**: US3 complete. All error paths verified with user-friendly messages, no internal detail leakage.

---

## Phase 5: User Story 4 — AWS Best Practices (Structured Logging) (Priority: P2)

**Goal**: Verify structured logging output conforms to AWS Well-Architected Operational Excellence — JSON format, correlation_id tracing, security event classification.

**Independent Test**: Run `pytest tests/test_main.py -v -k "Test022StructuredLogging"` — all tests pass.

### RED Phase: Write Failing Tests

- [x] T025 [P] [US4] Write `Test022StructuredLogging.test_all_logs_are_valid_json` — use `capsys` to capture stdout; verify every line is parseable JSON with `level`, `event_type`, `service` keys in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T026 [P] [US4] Write `Test022StructuredLogging.test_correlation_id_present_in_all_log_entries` — verify every JSON log line contains `correlation_id` matching the request's correlation_id in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T027 [P] [US4] Write `Test022StructuredLogging.test_security_check_logs_include_result` — verify existence check, authorization, and rate limit steps emit log entries with pass/fail result in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T028 [P] [US4] Write `Test022StructuredLogging.test_error_log_does_not_contain_bot_token` — verify no log entry contains the bot_token value (security: no credential leakage in logs) in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`

### GREEN Phase: Implement to Pass Tests

- [x] T029 [US4] Add missing structured log entries for any pipeline steps that lack logging (review each step in pipeline.py run() function) in `cdk/lib/verification/agent/verification-agent/pipeline.py`
- [x] T030 Run tests to confirm GREEN: `pytest cdk/lib/verification/agent/verification-agent/tests/test_main.py -v -k "Test022StructuredLogging"`

**Checkpoint**: US4 complete. All logs verified as structured JSON with correlation_id tracing.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, edge case coverage, and TDD commit evidence

- [x] T031 Run full test suite to confirm no regressions: `pytest cdk/lib/verification/agent/verification-agent/tests/ -v`
- [x] T032 Run test coverage report and verify >=90% on pipeline.py: `pytest cdk/lib/verification/agent/verification-agent/tests/ --cov=cdk/lib/verification/agent/verification-agent --cov-report=term-missing`
- [x] T033 Verify TDD commit order in git log: RED tests committed before GREEN implementation (SC-003)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: No work needed — existing infrastructure sufficient
- **Phase 3 (US1+US2)**: Depends on Phase 1 baseline — **MVP; complete first**
- **Phase 4 (US3)**: Can start after Phase 3 GREEN or independently (different test class)
- **Phase 5 (US4)**: Can start after Phase 3 GREEN or independently (different test class)
- **Phase 6 (Polish)**: Depends on all story phases complete

### User Story Dependencies

- **US1 (P1) Normal Flow**: Can start after Phase 1 — no dependencies on other stories
- **US2 (P1) Security TDD**: Can run in parallel with US1 — different test class, same file
- **US3 (P2) Error Handling**: Independent — different test class, may share some pipeline.py changes with US1
- **US4 (P2) Logging**: Independent — different test class, different assertions

### Within Each User Story (TDD Order)

1. **RED**: Write all test methods for the story → commit
2. **GREEN**: Write minimal implementation to pass → commit
3. Verify no regressions against full suite

### Parallel Opportunities

- T003-T007 (US1 tests) and T008-T012 (US2 tests) can be written in parallel
- T017-T022 (US3 tests) and T025-T028 (US4 tests) can be written in parallel
- All [P] tests within a phase can be written in any order (same file but different test classes)

---

## Parallel Example: Phase 3 (US1 + US2)

```bash
# Write all RED tests in parallel (same file, different classes):
# Agent 1: Test022NormalFlowDelegation (T003-T007)
# Agent 2: Test022SecurityCheckPipeline (T008-T012)

# Then GREEN implementation sequentially:
# T013 → T014 → T015 → T016 (pipeline.py changes in order)
```

## Parallel Example: Phase 4 + Phase 5

```bash
# Write RED tests for US3 and US4 in parallel:
# Agent 1: Test022ExecutionErrorPaths (T017-T022)
# Agent 2: Test022StructuredLogging (T025-T028)

# Then GREEN implementation:
# T023 (US3 pipeline changes)
# T029 (US4 pipeline changes)
# T024, T030 (verification runs)
```

---

## Implementation Strategy

### MVP First (Phase 3: US1 + US2)

1. Complete Phase 1: Verify baseline
2. Write RED tests (T003-T012) → commit `test(022): RED`
3. Write GREEN implementation (T013-T016) → commit `feat(022): GREEN`
4. **STOP and VALIDATE**: `pytest -k "Test022" -v` all pass; no regressions
5. This alone satisfies FR-001, FR-002, FR-006

### Incremental Delivery

1. Phase 3 (US1+US2) → MVP: Normal flow + security checks tested via TDD
2. Phase 4 (US3) → Add: Error handling comprehensive test coverage
3. Phase 5 (US4) → Add: Structured logging verification (AWS best practices)
4. Phase 6 → Validate: Full coverage, TDD commit order, no regressions

### TDD Commit Order (Critical for SC-003)

```text
Commit 1: test(022): RED — add Test022 test classes (T003-T012 failing)
Commit 2: feat(022): GREEN — pipeline enhancements pass all tests (T013-T016)
Commit 3: test(022): RED — add error/logging test classes (T017-T022, T025-T028)
Commit 4: feat(022): GREEN — error handling and logging enhancements (T023, T029)
Commit 5: refactor(022): REFACTOR — code cleanup if needed
```

---

## Notes

- All new tests use existing patterns from `test_main.py`: `@patch("pipeline.xxx")`, `handle_message(payload)`, JSON assertions
- No new dependencies — only pytest + unittest.mock
- `capsys` fixture (pytest built-in) used for log output capture in US4
- `patch.dict(os.environ, ...)` used for echo mode env var testing in US1
- File artifact tests use `base64.b64encode()` for test data (existing pattern from Test class `TestExecutionDelegation`)
- Total new test methods: ~20 across 4 test classes
