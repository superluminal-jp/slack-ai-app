# Tasks: Echo at Verification Agent (AgentCore Runtime)

**Input**: Design documents from `specs/018-echo-at-agentcore-runtime/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/  
**Tests**: TDD — test tasks run first; ensure they FAIL before implementation.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files or no dependencies)
- **[Story]**: User story (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Lambda: `cdk/lib/verification/lambda/slack-event-handler/`
- Verification Agent: `cdk/lib/verification/agent/verification-agent/`
- CDK constructs: `cdk/lib/verification/constructs/`
- Tests: `cdk/lib/verification/agent/verification-agent/tests/`, `cdk/lib/verification/lambda/slack-event-handler/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm target structure; no new project layout (changes limited to Lambda + Verification Agent + CDK per plan).

- [x] T001 Confirm targets exist: cdk/lib/verification/lambda/slack-event-handler/handler.py, cdk/lib/verification/agent/verification-agent/main.py, cdk/lib/verification/constructs/slack-event-handler.ts, cdk/lib/verification/constructs/verification-agent-runtime.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ensure test harness is ready before TDD for user stories.

**Checkpoint**: pytest for verification-agent and slack-event-handler can run.

- [x] T002 Ensure verification-agent tests run with pytest from cdk/lib/verification/agent/verification-agent (e.g. pytest tests/ -v) and slack-event-handler tests run from cdk/lib/verification/lambda/slack-event-handler

---

## Phase 3: User Story 1 - エコーを Verification Agent (Runtime) で返す (Priority: P1) — MVP

**Goal**: エコーモード有効時、Lambda は SQS に送り Lambda 内ではエコーしない。SQS → Agent Invoker → Verification Agent まで届き、Runtime で [Echo] を Slack に投稿し、Execution は呼ばない。

**Independent Test**: エコーモード有効でメンションを送り、同じスレッドに [Echo] 付きで返る。CloudWatch で Lambda → SQS → Agent Invoker → Verification Agent のログがあり、Execution Agent は呼ばれていないこと。

### Tests for User Story 1 (TDD — write first, expect FAIL)

- [x] T003 [P] [US1] Add unit test: when VALIDATION_ZONE_ECHO_MODE is "true", Verification Agent handle_message does NOT call invoke_execution_agent; it calls post_to_slack with [Echo] + text and returns success in cdk/lib/verification/agent/verification-agent/tests/test_main.py
- [x] T004 [P] [US1] Add unit test: when echo mode is on, Verification Agent post_to_slack is called with channel, thread_ts, and text equal to "[Echo] " + task text in cdk/lib/verification/agent/verification-agent/tests/test_main.py
- [x] T005 [P] [US1] Add unit test: when VALIDATION_ZONE_ECHO_MODE is set (e.g. "true"), SlackEventHandler Lambda does NOT post echo (chat_postMessage for echo); it sends to SQS and returns 200 in cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py

### Implementation for User Story 1

- [x] T006 [US1] Remove 017 echo mode block from SlackEventHandler so Lambda always proceeds to SQS when AGENT_INVOCATION_QUEUE_URL is set (no echo at Lambda) in cdk/lib/verification/lambda/slack-event-handler/handler.py
- [x] T007 [US1] In Verification Agent handle_message, after security pipeline and before invoke_execution_agent, if os.environ VALIDATION_ZONE_ECHO_MODE strip lower == "true", call post_to_slack(channel, thread_ts, "[Echo] " + text) and return A2A success without calling invoke_execution_agent in cdk/lib/verification/agent/verification-agent/main.py
- [x] T008 [US1] Add structured log (e.g. echo_mode_response) when responding in echo mode in Verification Agent in cdk/lib/verification/agent/verification-agent/main.py
- [x] T009 [US1] Add optional VALIDATION_ZONE_ECHO_MODE to VerificationAgentRuntime environmentVariables and pass from VerificationStack (e.g. context or props) in cdk/lib/verification/constructs/verification-agent-runtime.ts and cdk/lib/verification/verification-stack.ts

**Checkpoint**: User Story 1 complete — echo mode on → Lambda sends to SQS, Runtime posts [Echo] to Slack, no Execution; tests pass.

---

## Phase 4: User Story 2 - エコーモード無効時は従来どおり (Priority: P2)

**Goal**: エコーモード無効時、従来どおり SQS → Agent Invoker → Verification Agent → Execution Agent の経路で AI 応答が返る。

**Independent Test**: エコーモードを無効にしてメンションを送り、Execution 経由の応答が返ることを確認。

### Tests for User Story 2 (TDD)

- [x] T010 [P] [US2] Add unit test: when VALIDATION_ZONE_ECHO_MODE is unset or not "true", Verification Agent handle_message calls invoke_execution_agent and does NOT post echo in cdk/lib/verification/agent/verification-agent/tests/test_main.py

### Implementation for User Story 2

- [x] T011 [US2] Verify echo mode off path in Verification Agent (env not "true" skips echo branch and proceeds to invoke_execution_agent) in cdk/lib/verification/agent/verification-agent/main.py — no change if branch is correct.

**Checkpoint**: User Story 2 complete — echo off restores normal Execution flow; tests pass.

---

## Phase 5: User Story 3 - エコー内容・宛先の明確さ (Priority: P2)

**Goal**: エコーは当該リクエストのチャンネル・スレッドにのみ返り、投稿内容は当該メッセージの本文と対応する。

**Independent Test**: 複数スレッドで同時にメンションを送り、各スレッドに正しいエコーのみ返る。

### Tests for User Story 3 (TDD)

- [x] T012 [P] [US3] Add unit test: Verification Agent echo uses task channel, task thread_ts, and task text only; post_to_slack called with matching channel, thread_ts, and "[Echo] " + text in cdk/lib/verification/agent/verification-agent/tests/test_main.py

### Implementation for User Story 3

- [x] T013 [US3] Ensure Verification Agent echo uses only current task_payload channel, thread_ts, text (no cross-request mixing) in cdk/lib/verification/agent/verification-agent/main.py — confirm no shared state; already satisfied if using only task_payload.

**Checkpoint**: User Story 3 complete — echo content and target thread are correct.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Docs, regression tests, and quickstart validation.

- [x] T014 [P] Update docs (e.g. docs/how-to/troubleshooting.md, specs/018-echo-at-agentcore-runtime/quickstart.md) with 018 echo-at-runtime enable/disable and troubleshooting
- [x] T015 Run full pytest for cdk/lib/verification/agent/verification-agent/tests/ and cdk/lib/verification/lambda/slack-event-handler/tests/ and fix any regressions
- [x] T016 [P] Optionally add or update CDK test in cdk/test/verification-stack.test.ts or verification-agent-runtime to assert VALIDATION_ZONE_ECHO_MODE is set on Runtime when provided

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS user story work.
- **Phase 3 (US1)**: Depends on Phase 2. Tests T003–T005 must FAIL before T006–T009.
- **Phase 4 (US2)**: Depends on Phase 3. Test T010 then T011.
- **Phase 5 (US3)**: Depends on Phase 3. Test T012 then T013.
- **Phase 6 (Polish)**: Depends on Phases 3–5.

### User Story Dependencies

- **US1 (P1)**: No dependency on US2/US3. Implements Lambda 017 removal + Runtime echo branch + CDK env.
- **US2 (P2)**: Builds on US1; ensures echo-off path unchanged.
- **US3 (P2)**: Builds on US1; ensures echo content/channel correctness.

### Within Each User Story (TDD)

- Write test tasks first; run tests and confirm they fail (or are skipped) before implementation.
- Then implement until tests pass.

### Parallel Opportunities

- T003, T004, T005 can be written in parallel (different files: test_main.py, test_handler.py).
- T014, T016 are independent (docs vs CDK test).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3: write T003–T005 (fail), then T006–T009 until tests pass.
3. **STOP and VALIDATE**: Deploy with VALIDATION_ZONE_ECHO_MODE=true and confirm echo at Runtime in Slack.
4. Optionally add US2/US3 for mode switch and content correctness, then Polish.

### TDD Workflow

1. For each story: add test(s) → run pytest (expect fail) → implement → run pytest (expect pass).
2. Commit after each task or logical group.
3. Use mocks for invoke_execution_agent, post_to_slack, SQS, WebClient so tests do not call real AWS or Slack.

---

## Notes

- [P] = parallelizable where noted; same-file tasks can still be implemented in one edit.
- [USn] maps to spec.md User Story n for traceability.
- Echo mode is enabled only when VALIDATION_ZONE_ECHO_MODE is the string "true" (case-insensitive).
- 018 removes Lambda-side echo (017); Runtime is the only place that echoes when VALIDATION_ZONE_ECHO_MODE is true.
