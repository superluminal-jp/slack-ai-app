# Tasks: Fix A2A Protocol Routing

**Input**: Design documents from `/specs/020-fix-a2a-routing/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: Test tasks are included per spec.md scope: "単体テストの追加・更新"

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

```text
cdk/lib/verification/agent/verification-agent/
├── main.py                    # Verification Agent entrypoint
└── tests/
    └── test_main.py           # Verification Agent tests

cdk/lib/execution/agent/execution-agent/
├── main.py                    # Execution Agent entrypoint
└── tests/
    └── test_main.py           # Execution Agent tests
```

## Phase 1: Setup

**Purpose**: No new project initialization needed. Existing codebase with working CI/test infrastructure.

*No setup tasks required — both agent directories and test files already exist.*

---

## Phase 2: Foundational

**Purpose**: No shared foundational changes needed. Each user story modifies independent agent directories.

*No foundational tasks required — changes are scoped to individual agent `main.py` files.*

**Checkpoint**: Proceed directly to user story phases.

---

## Phase 3: User Story 1 - Verification Agent が A2A ルートパスでリクエストを受信する (Priority: P1)

**Goal**: Verification Agent の `main.py` に POST `/` ルートを追加し、`_handle_invocation` に委譲する。InvokeAgentRuntime 呼び出しが 424 ではなく正常レスポンスを返すようにする。

**Independent Test**: `pytest cdk/lib/verification/agent/verification-agent/tests/test_main.py` が全件パスし、新規ルーティングテストが POST `/` の動作を検証する。

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T001 [US1] Add test `test_a2a_root_route_registered` that verifies POST `/` route exists on `app` — assert that Starlette routes include a route with path `/` and method POST in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T002 [US1] Add test `test_a2a_root_handler_delegates_to_handle_invocation` that mocks `app._handle_invocation` and calls `a2a_root_handler(request)` — assert `_handle_invocation` is called with the request object in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T003 [US1] Add test `test_existing_invocations_route_still_works` that verifies `/invocations` POST route is still registered (regression) in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T004 [US1] Add test `test_agent_card_route_still_works` that verifies `/.well-known/agent-card.json` GET route is still registered (regression) in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T005 [US1] Add test `test_ping_route_still_works` that verifies `/ping` GET route is still registered (regression) in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`

### Implementation for User Story 1

- [x] T006 [US1] Add `@app.route("/", methods=["POST"])` handler `a2a_root_handler` that delegates to `app._handle_invocation(request)` in `cdk/lib/verification/agent/verification-agent/main.py` — place between the `/ping` endpoint and the `@app.entrypoint` decorator (around line 44)
- [x] T007 [US1] Run existing tests to verify no regressions: `pytest cdk/lib/verification/agent/verification-agent/tests/test_main.py` — all existing tests must pass
- [x] T008 [US1] Run new routing tests to verify T001-T005 now pass: `pytest cdk/lib/verification/agent/verification-agent/tests/test_main.py -k "a2a_root or existing_invocations or agent_card_route or ping_route"`

**Checkpoint**: Verification Agent の POST `/` ルーティングが動作し、全テストがパス。デプロイすれば InvokeAgentRuntime が 424 ではなく正常応答する。

---

## Phase 4: User Story 2 - Execution Agent が A2A ルートパスでリクエストを受信する (Priority: P2)

**Goal**: Execution Agent の `main.py` に POST `/` ルートを追加し `_handle_invocation` に委譲する。さらに `app.run()` を `app.run(port=9000)` に修正し、A2A プロトコルが要求するポート 9000 でリッスンする。

**Independent Test**: `pytest cdk/lib/execution/agent/execution-agent/tests/test_main.py` が全件パスし、新規テストが POST `/` とポート 9000 を検証する。

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US2] Add test `test_a2a_root_route_registered` that verifies POST `/` route exists on `app` — assert that Starlette routes include a route with path `/` and method POST in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T010 [P] [US2] Add test `test_a2a_root_handler_delegates_to_handle_invocation` that mocks `app._handle_invocation` and calls `a2a_root_handler(request)` — assert `_handle_invocation` is called with the request object in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T011 [P] [US2] Add test `test_existing_invocations_route_still_works` that verifies `/invocations` POST route is still registered (regression) in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T012 [P] [US2] Add test `test_agent_card_route_still_works` that verifies `/.well-known/agent-card.json` GET route is still registered (regression) in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T013 [P] [US2] Add test `test_ping_route_still_works` that verifies `/ping` GET route is still registered (regression) in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T014 [P] [US2] Add test `test_app_run_uses_port_9000` that reads the source of `main.py` and asserts `app.run(port=9000)` is present (not bare `app.run()`) in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`

### Implementation for User Story 2

- [x] T015 [US2] Add `@app.route("/", methods=["POST"])` handler `a2a_root_handler` that delegates to `app._handle_invocation(request)` in `cdk/lib/execution/agent/execution-agent/main.py` — place between the `/ping` endpoint and the background processing section (around line 122)
- [x] T016 [US2] Change `app.run()` to `app.run(port=9000)` in `cdk/lib/execution/agent/execution-agent/main.py` line 409 — A2A protocol requires port 9000
- [x] T017 [US2] Run existing tests to verify no regressions: `pytest cdk/lib/execution/agent/execution-agent/tests/test_main.py` — all existing tests must pass
- [x] T018 [US2] Run new routing tests to verify T009-T014 now pass: `pytest cdk/lib/execution/agent/execution-agent/tests/test_main.py -k "a2a_root or existing_invocations or agent_card_route or ping_route or port_9000"`

**Checkpoint**: Execution Agent の POST `/` ルーティングとポート 9000 が動作し、全テストがパス。

---

## Phase 5: User Story 3 - コンテナログで処理状況を確認できる (Priority: P3)

**Goal**: ルーティング修正により、リクエストがアプリケーションコードに到達し、既存のログ出力が CloudWatch Logs に記録される。

**Independent Test**: デプロイ後に CloudWatch Logs でアプリケーションログの出力を確認（手動検証）。

*US3 は US1/US2 のルーティング修正の副次的効果として自然に解消される。追加のコード変更は不要。*

- [x] T019 [US3] Verify that both `main.py` files contain structured logging calls (`print(json.dumps(log_entry, ...))`) that will produce output once requests reach application code — review `cdk/lib/verification/agent/verification-agent/main.py` and `cdk/lib/execution/agent/execution-agent/main.py`

**Checkpoint**: 両エージェントにログ出力コードが存在することを確認。デプロイ後に CloudWatch Logs で実際のログ出力を手動検証。

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T020 Run full test suite for both agents: `pytest cdk/lib/verification/agent/verification-agent/tests/ cdk/lib/execution/agent/execution-agent/tests/ -v`
- [x] T021 Verify docstring in both `a2a_root_handler` functions references AWS A2A protocol contract URL

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Skipped — no setup needed
- **Phase 2 (Foundational)**: Skipped — no shared prerequisites
- **Phase 3 (US1)**: Can start immediately — Verification Agent is independent
- **Phase 4 (US2)**: Can start immediately — Execution Agent is independent (different directory)
- **Phase 5 (US3)**: Depends on US1 + US2 completion (verification only, no code changes)
- **Phase 6 (Polish)**: Depends on US1 + US2 + US3 completion

### User Story Dependencies

- **US1 (P1)**: Independent — `cdk/lib/verification/agent/verification-agent/`
- **US2 (P2)**: Independent — `cdk/lib/execution/agent/execution-agent/`
- **US3 (P3)**: Depends on US1 + US2 (verification only)

### Within Each User Story

1. Tests MUST be written and FAIL before implementation
2. Implementation changes applied
3. All tests (existing + new) MUST pass
4. Story checkpoint validated

### Parallel Opportunities

- **US1 and US2 can run in parallel** — they modify different directories with no shared code
- Within US2, test tasks T009-T014 are all [P] (different test classes, no dependencies)
- T019 (US3) can be done in parallel with US1/US2 (read-only verification)

---

## Parallel Example: US1 + US2 Simultaneously

```bash
# Developer A: US1 (Verification Agent)
Task: "T001-T005: Write routing tests for Verification Agent"
Task: "T006: Add POST / route to Verification Agent main.py"
Task: "T007-T008: Run and verify all tests"

# Developer B: US2 (Execution Agent) — in parallel
Task: "T009-T014: Write routing + port tests for Execution Agent"
Task: "T015-T016: Add POST / route + port=9000 to Execution Agent main.py"
Task: "T017-T018: Run and verify all tests"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 3: US1 (Verification Agent routing fix)
2. **STOP and VALIDATE**: Deploy Verification Agent, test with `InvokeAgentRuntime` — expect 200 instead of 424
3. Confirm echo mode works end-to-end via Slack

### Incremental Delivery

1. US1 → Verification Agent routing fix → Deploy → Validate (MVP)
2. US2 → Execution Agent routing + port fix → Deploy → Validate
3. US3 → Verify CloudWatch Logs → Confirm
4. Polish → Full test suite, docstrings

### Key Risk: Private API Usage

`app._handle_invocation` is a private method of `BedrockAgentCoreApp` SDK. Mitigation:
- SDK version pinned in `requirements.txt` (`bedrock-agentcore==1.2.0`)
- Tests T001-T002 and T009-T010 verify delegation works — breaks are detected immediately on SDK update

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are fully independent (different agent directories)
- US3 requires no code changes — it's a verification-only story
- Total code change: ~8 lines across 2 `main.py` files
- Total test additions: ~11 new test methods across 2 `test_main.py` files
