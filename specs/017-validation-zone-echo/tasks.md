# Tasks: Validation Zone Echo for AgentCore Verification

**Input**: Design documents from `specs/017-validation-zone-echo/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/  
**Tests**: TDD — test tasks run first; ensure they FAIL before implementation.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files or no dependencies)
- **[Story]**: User story (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Lambda: `cdk/lib/verification/lambda/slack-event-handler/`
- CDK construct: `cdk/lib/verification/constructs/slack-event-handler.ts`
- Tests: `cdk/lib/verification/lambda/slack-event-handler/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm target structure; no new project layout (changes limited to SlackEventHandler per plan).

- [x] T001 Confirm SlackEventHandler targets exist: cdk/lib/verification/constructs/slack-event-handler.ts and cdk/lib/verification/lambda/slack-event-handler/handler.py

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ensure test harness is ready before TDD for user stories.

**Checkpoint**: pytest for slack-event-handler can run; test_handler.py is the test file for handler behavior.

- [x] T002 Ensure slack-event-handler tests run with pytest from cdk/lib/verification/lambda/slack-event-handler (e.g. pytest tests/ -v) and test_handler.py exists in cdk/lib/verification/lambda/slack-event-handler/tests/

---

## Phase 3: User Story 1 - AgentCore（検証ゾーン）単体での動作確認 (Priority: P1) — MVP

**Goal**: エコーモード有効時、実行ゾーンを経由せず受信メッセージ本文を Slack スレッドに返し、SQS 送信・InvokeAgentRuntime を行わない。

**Independent Test**: Slack でメッセージを送り、同じ内容がスレッドに返る。実行ゾーンにはリクエストが送られない。

### Tests for User Story 1 (TDD — write first, expect FAIL)

- [x] T003 [P] [US1] Add unit test: when VALIDATION_ZONE_ECHO_MODE is "true", handler does NOT call SQS send_message nor bedrock-agentcore invoke_agent_runtime; it posts echo to Slack (mock WebClient.chat_postMessage) and returns 200 in cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py
- [x] T004 [P] [US1] Add unit test: when echo mode is on, handler posts message with text equal to user_text (or [Echo] + user_text) and correct channel and thread_ts in cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py

### Implementation for User Story 1

- [x] T005 [US1] Implement echo mode check (os.environ VALIDATION_ZONE_ECHO_MODE strip lower == "true") and branch: if echo mode, call chat_postMessage(channel, text=user_text, thread_ts=message_timestamp) then return 200 without SQS or InvokeAgentRuntime in cdk/lib/verification/lambda/slack-event-handler/handler.py
- [x] T006 [US1] Add structured log (e.g. echo_mode_response) when responding in echo mode in cdk/lib/verification/lambda/slack-event-handler/handler.py
- [x] T007 [US1] Add optional environment variable VALIDATION_ZONE_ECHO_MODE to SlackEventHandler in cdk/lib/verification/constructs/slack-event-handler.ts (e.g. from stack context or default unset so existing behavior when unset)

**Checkpoint**: User Story 1 complete — echo mode on → echo posted to Slack, no SQS/AgentCore; tests pass.

---

## Phase 4: User Story 2 - エコー内容の明確さ (Priority: P2)

**Goal**: 返却される内容が当該リクエストと対応し、スレッド・チャンネルが混在しない。

**Independent Test**: 複数スレッドでメッセージを送り、各スレッドに正しいエコーのみ返る。

### Tests for User Story 2 (TDD)

- [x] T008 [P] [US2] Add unit test: echo uses event channel and event thread_ts (or event.ts) so reply is in same thread; posted text matches user_text for that event in cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py

### Implementation for User Story 2

- [x] T009 [US2] Ensure echo content uses only current event's channel, thread_ts, and user_text (no cross-request mixing); add [Echo] prefix to text if chosen per research in cdk/lib/verification/lambda/slack-event-handler/handler.py

**Checkpoint**: User Story 2 complete — echo content and target thread are correct and identifiable.

---

## Phase 5: User Story 3 - 通常モードへの切り戻し (Priority: P2)

**Goal**: エコーモード無効時、従来どおり SQS 送信または InvokeAgentRuntime が実行される。

**Independent Test**: エコーモードを無効にしてメッセージを送り、実行ゾーン経由の応答が返る。

### Tests for User Story 3 (TDD)

- [x] T010 [P] [US3] Add unit test: when VALIDATION_ZONE_ECHO_MODE is unset or not "true", handler does NOT post echo; it proceeds to SQS send or InvokeAgentRuntime as in existing flow in cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py

### Implementation for User Story 3

- [x] T011 [US3] Verify echo mode off path: env not "true" (or unset) skips echo branch and uses existing SQS/AgentCore path in cdk/lib/verification/lambda/slack-event-handler/handler.py

**Checkpoint**: User Story 3 complete — mode switch works; echo off restores normal flow.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Docs, regression tests, and quickstart validation.

- [x] T012 [P] Update docs or quickstart if needed (e.g. docs/how-to/troubleshooting.md or specs/017-validation-zone-echo/quickstart.md) with echo mode enable/disable and troubleshooting
- [x] T013 Run full pytest for cdk/lib/verification/lambda/slack-event-handler/tests/ and fix any regressions
- [x] T014 [P] Optionally add or update CDK test in cdk/test/verification-stack.test.ts to assert VALIDATION_ZONE_ECHO_MODE can be set when provided (if stack exposes it)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS user story work.
- **Phase 3 (US1)**: Depends on Phase 2. Tests T003–T004 must FAIL before T005–T007.
- **Phase 4 (US2)**: Depends on Phase 3. Test T008 then implementation T009.
- **Phase 5 (US3)**: Depends on Phase 3. Test T010 then implementation T011.
- **Phase 6 (Polish)**: Depends on Phases 3–5.

### User Story Dependencies

- **US1 (P1)**: No dependency on US2/US3. Implements echo-on path and CDK env.
- **US2 (P2)**: Builds on US1; ensures echo content and thread correctness.
- **US3 (P2)**: Builds on US1; ensures echo-off path unchanged.

### Within Each User Story (TDD)

- Write test tasks first; run tests and confirm they fail (or are skipped) before implementation.
- Then implement until tests pass.

### Parallel Opportunities

- T003, T004 can be written in parallel (same file but different test cases).
- T008, T010 can be written in parallel (same file, different cases).
- T012, T014 are independent of each other (different files).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3: write T003–T004 (fail), then T005–T007 until tests pass.
3. **STOP and VALIDATE**: Deploy with VALIDATION_ZONE_ECHO_MODE=true and confirm echo in Slack.
4. Optionally add US2/US3 for content clarity and mode switch, then Polish.

### TDD Workflow

1. For each story: add test(s) → run pytest (expect fail) → implement → run pytest (expect pass).
2. Commit after each task or logical group.
3. Use mocks for SQS, bedrock-agentcore, and WebClient so tests do not call real AWS or Slack.

---

## Notes

- [P] = parallelizable where noted; same-file tasks (e.g. multiple tests in test_handler.py) can still be implemented in one edit.
- [USn] maps to spec.md User Story n for traceability.
- Echo mode is enabled only when VALIDATION_ZONE_ECHO_MODE is the string "true" (case-insensitive per data-model).
- Verification Agent and Execution zone code are out of scope; only SlackEventHandler (Lambda + CDK env) changes.
