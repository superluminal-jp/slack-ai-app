# Tasks: strands-agents 移行とインフラ整備

**Input**: Design documents from `/specs/021-strands-migration-cleanup/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: TDD アプローチ — テストを先に記述し、FAIL を確認してから実装

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

```text
cdk/lib/verification/
├── agent/verification-agent/
│   ├── main.py                    # Verification Agent entrypoint
│   ├── requirements.txt           # Dependencies
│   └── tests/
│       ├── conftest.py            # SDK mock
│       └── test_main.py           # Agent tests
└── constructs/
    └── verification-agent-runtime.ts  # CDK construct (IAM)

cdk/lib/execution/
├── agent/execution-agent/
│   ├── main.py                    # Execution Agent entrypoint
│   ├── requirements.txt           # Dependencies
│   └── tests/
│       ├── conftest.py            # SDK mock
│       └── test_main.py           # Agent tests
└── constructs/
    └── execution-agent-runtime.ts     # CDK construct (IAM)

cdk/lib/types/cdk-config.ts           # CDK config type definition
cdk/bin/cdk.ts                         # CDK app entry
cdk/test/                              # CDK tests
scripts/deploy-split-stacks.sh         # Deploy script
tests/e2e/                             # NEW: E2E tests
```

## Phase 1: Setup

**Purpose**: No new project initialization needed. Existing codebase with working CI/test infrastructure.

*No setup tasks required — all directories and test files already exist.*

---

## Phase 2: Foundational

**Purpose**: No shared foundational changes needed. Each user story modifies independent files.

*No foundational tasks required — changes are scoped to individual files per user story.*

**Checkpoint**: Proceed directly to user story phases.

---

## Phase 3: User Story 1 - CloudWatch Metrics 名前空間修正 (Priority: P1)

**Goal**: IAM ポリシーの CloudWatch 名前空間条件を `"bedrock-agentcore"` から実際のエージェント名前空間 (`SlackEventHandler`, `SlackAI/*`) に修正し、メトリクス送信の AccessDenied を解消する。

**Independent Test**: CDK テストで IAM ポリシー条件が正しい名前空間を含むことを検証。デプロイ後に CloudWatch でメトリクス記録を確認。

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T001 [P] [US1] Add test that verifies Verification Agent IAM policy CloudWatch condition uses `StringLike` with `["SlackEventHandler", "SlackAI/*"]` instead of `StringEquals` with `"bedrock-agentcore"` in `cdk/test/agentcore-constructs.test.ts`
- [x] T002 [P] [US1] Add test that verifies Execution Agent IAM policy CloudWatch condition uses `StringLike` with `["SlackEventHandler", "SlackAI/*"]` instead of `StringEquals` with `"bedrock-agentcore"` in `cdk/test/agentcore-constructs.test.ts`

### Implementation for User Story 1

- [x] T003 [P] [US1] Update CloudWatch Metrics IAM policy condition from `StringEquals: { "cloudwatch:namespace": "bedrock-agentcore" }` to `StringLike: { "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"] }` in `cdk/lib/verification/constructs/verification-agent-runtime.ts` (lines 129-142)
- [x] T004 [P] [US1] Update CloudWatch Metrics IAM policy condition from `StringEquals: { "cloudwatch:namespace": "bedrock-agentcore" }` to `StringLike: { "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"] }` in `cdk/lib/execution/constructs/execution-agent-runtime.ts` (lines 105-118)
- [x] T005 [US1] Run CDK tests to verify T001-T002 now pass: `npx jest cdk/test/agentcore-constructs.test.ts`

**Checkpoint**: IAM ポリシー条件が修正され、CDK テストがパス。デプロイすればメトリクスが CloudWatch に記録される。

---

## Phase 4: User Story 2 - strands-agents A2A サーバー移行 (Priority: P2)

**Goal**: 両エージェントの main.py を `BedrockAgentCoreApp` + `_handle_invocation` (private API) から strands-agents `A2AServer` + `FastAPI` に移行する。

**Independent Test**: 移行後にエコーモードでデプロイし、Slack メンションで `[Echo] {テキスト}` が返ることを確認。全単体テストがパス。

### Phase 4a: Verification Agent 移行

#### Tests for Verification Agent

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T006 [US2] Update conftest.py mock to replace `MockBedrockAgentCoreApp` with strands-agents compatible mock (`MockAgent`, `MockA2AServer`, `MockFastAPI`) in `cdk/lib/verification/agent/verification-agent/tests/conftest.py` — mock `strands.Agent`, `strands.multiagent.a2a.A2AServer`, `fastapi.FastAPI`, `uvicorn`
- [x] T007 [US2] Add test `test_strands_agent_created_with_correct_config` that verifies `Agent` is instantiated with name, description, and tools in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T008 [US2] Add test `test_a2a_server_created_with_port_9000` that verifies `A2AServer` is instantiated with `port=9000` and `serve_at_root=True` in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T009 [US2] Add test `test_fastapi_ping_endpoint_registered` that verifies `/ping` GET route exists on the FastAPI app in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T010 [US2] Add test `test_a2a_server_mounted_at_root` that verifies `a2a_server.to_fastapi_app()` is mounted at `/` on the FastAPI app in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T011 [US2] Add test `test_no_private_api_usage` that scans `main.py` source for `_handle_invocation` and asserts zero occurrences in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T012 [US2] Add test `test_no_bedrock_agentcore_import` that scans `main.py` source for `bedrock_agentcore` and asserts zero occurrences in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T013 [US2] Run new tests to verify they FAIL before implementation: `cd cdk/lib/verification/agent/verification-agent && pytest tests/test_main.py -k "strands_agent or a2a_server or fastapi_ping or mounted_at_root or no_private_api or no_bedrock_agentcore" -v`

#### Implementation for Verification Agent

- [x] T014 [US2] Rewrite `cdk/lib/verification/agent/verification-agent/main.py` to replace `BedrockAgentCoreApp` with strands-agents `A2AServer` + `FastAPI` — import `Agent` from `strands`, `A2AServer` from `strands.multiagent.a2a`, `FastAPI` from `fastapi`, `uvicorn`; create `Agent` with handle_message as tool; create `A2AServer` with `serve_at_root=True, port=9000`; add `/ping` on FastAPI; mount A2AServer at `/`; run via `uvicorn.run(app, host="0.0.0.0", port=9000)`
- [x] T015 [US2] Run all Verification Agent tests to verify no regressions: `cd cdk/lib/verification/agent/verification-agent && pytest tests/ -v`
- [x] T016 [US2] Run new strands-agents tests to verify T007-T012 now pass: `cd cdk/lib/verification/agent/verification-agent && pytest tests/test_main.py -k "strands_agent or a2a_server or fastapi_ping or mounted_at_root or no_private_api or no_bedrock_agentcore" -v`

**Checkpoint**: Verification Agent が strands-agents A2AServer で動作し、全テストがパス。private API 使用ゼロ。

### Phase 4b: Execution Agent 移行

#### Tests for Execution Agent

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T017 [US2] Update conftest.py mock to replace `MockBedrockAgentCoreApp` with strands-agents compatible mock (`MockAgent`, `MockA2AServer`, `MockFastAPI`) in `cdk/lib/execution/agent/execution-agent/tests/conftest.py` — mock `strands.Agent`, `strands.multiagent.a2a.A2AServer`, `fastapi.FastAPI`, `uvicorn`
- [x] T018 [P] [US2] Add test `test_strands_agent_created_with_correct_config` that verifies `Agent` is instantiated with name, description, and tools in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T019 [P] [US2] Add test `test_a2a_server_created_with_port_9000` that verifies `A2AServer` is instantiated with `port=9000` and `serve_at_root=True` in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T020 [P] [US2] Add test `test_fastapi_ping_endpoint_registered` that verifies `/ping` GET route exists on the FastAPI app in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T021 [P] [US2] Add test `test_a2a_server_mounted_at_root` that verifies `a2a_server.to_fastapi_app()` is mounted at `/` on the FastAPI app in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T022 [P] [US2] Add test `test_no_private_api_usage` that scans `main.py` source for `_handle_invocation` and asserts zero occurrences in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T023 [P] [US2] Add test `test_no_bedrock_agentcore_import` that scans `main.py` source for `bedrock_agentcore` and asserts zero occurrences in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T024 [P] [US2] Add test `test_handle_message_tool_processes_payload` that verifies the Bedrock processing tool receives A2A message payload and returns formatted response in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T025 [US2] Run new tests to verify they FAIL before implementation: `cd cdk/lib/execution/agent/execution-agent && pytest tests/test_main.py -k "strands_agent or a2a_server or fastapi_ping or mounted_at_root or no_private_api or no_bedrock_agentcore or handle_message_tool" -v`

#### Implementation for Execution Agent

- [x] T026 [US2] Rewrite `cdk/lib/execution/agent/execution-agent/main.py` to replace `BedrockAgentCoreApp` with strands-agents `A2AServer` + `FastAPI` — same base pattern as Verification Agent (T014); additionally convert `_process_bedrock_request` background thread pattern to a strands Tool function; remove `app.add_async_task()` / `app.complete_async_task()` calls (executor manages task lifecycle); preserve Bedrock invocation, attachment processing, and error handling logic
- [x] T027 [US2] Run all Execution Agent tests to verify no regressions: `cd cdk/lib/execution/agent/execution-agent && pytest tests/ -v`
- [x] T028 [US2] Run new strands-agents tests to verify T018-T024 now pass: `cd cdk/lib/execution/agent/execution-agent && pytest tests/test_main.py -k "strands_agent or a2a_server or fastapi_ping or mounted_at_root or no_private_api or no_bedrock_agentcore or handle_message_tool" -v`

**Checkpoint**: Execution Agent が strands-agents A2AServer で動作し、全テストがパス。`_handle_invocation` と `add_async_task` / `complete_async_task` の使用ゼロ。

---

## Phase 5: User Story 3 - 依存パッケージバージョン固定 (Priority: P3)

**Goal**: 両エージェントの requirements.txt を `~=` 互換バージョン指定に更新し、未使用の `bedrock-agentcore` を削除する。

**Independent Test**: `pip install -r requirements.txt` で全パッケージが指定バージョンでインストールされることを確認。

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T029 [P] [US3] Add test `test_no_loose_version_constraints` that reads `requirements.txt` and asserts no `>=` constraints exist (all must be `~=` or `==`) in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T030 [P] [US3] Add test `test_no_bedrock_agentcore_dependency` that reads `requirements.txt` and asserts `bedrock-agentcore` is not listed in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`
- [x] T031 [P] [US3] Add test `test_no_loose_version_constraints` that reads `requirements.txt` and asserts no `>=` constraints exist in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`
- [x] T032 [P] [US3] Add test `test_no_bedrock_agentcore_dependency` that reads `requirements.txt` and asserts `bedrock-agentcore` is not listed in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`

### Implementation for User Story 3

- [x] T033 [P] [US3] Update `cdk/lib/verification/agent/verification-agent/requirements.txt` — replace all `>=` with `~=`, remove `bedrock-agentcore`, pin versions: `strands-agents[a2a]~=1.25.0`, `uvicorn~=0.34.0`, `fastapi~=0.115.0`, `boto3~=1.34.0`, `slack-sdk~=3.27.0`, `requests~=2.31.0`
- [x] T034 [P] [US3] Update `cdk/lib/execution/agent/execution-agent/requirements.txt` — replace all `>=` with `~=`, remove `bedrock-agentcore`, pin versions: `strands-agents[a2a]~=1.25.0`, `uvicorn~=0.34.0`, `fastapi~=0.115.0`, `boto3~=1.34.0`, `requests~=2.31.0`, `PyPDF2~=3.0.0`, `openpyxl~=3.1.0`
- [x] T035 [US3] Run version constraint tests to verify T029-T032 now pass

**Checkpoint**: 全依存パッケージが互換バージョン指定で固定され、未使用パッケージが除去されている。

---

## Phase 6: User Story 4 - エコーモード設定型安全化 (Priority: P4)

**Goal**: `validationZoneEchoMode` を CdkConfig 型定義に追加し、設定ファイルから型安全に読み込めるようにする。既存の環境変数・コンテキスト変数指定も後方互換で維持。

**Independent Test**: `cdk.config.dev.json` に `validationZoneEchoMode: true` を設定してデプロイスクリプトを実行し、エコーモードが有効になることを確認。

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T036 [P] [US4] Add test that verifies `CdkConfig` interface accepts `validationZoneEchoMode?: boolean` property and Zod schema validates it correctly (true, false, undefined) in `cdk/test/verification-stack.test.ts` or appropriate CDK test file
- [x] T037 [P] [US4] Add test that verifies `validationZoneEchoMode` defaults to `false` when not specified in config in `cdk/test/verification-stack.test.ts`

### Implementation for User Story 4

- [x] T038 [US4] Add `validationZoneEchoMode?: boolean` to `CdkConfig` interface and `z.boolean().optional().default(false)` to Zod schema in `cdk/lib/types/cdk-config.ts`
- [x] T039 [US4] Update `cdk/bin/cdk.ts` to read `validationZoneEchoMode` from config file with fallback to context variable: `config.validationZoneEchoMode ?? (context === true || context === "true")`
- [x] T040 [US4] Run CDK tests to verify T036-T037 now pass

**Checkpoint**: エコーモードが設定ファイルから型安全に制御可能。後方互換も維持。

---

## Phase 7: User Story 5 - E2E テスト自動化 (Priority: P5)

**Goal**: Slack → Lambda → Verification Agent → Execution Agent → Slack の全フローを自動テストで検証するスクリプトを作成する。

**Independent Test**: テストスクリプトを実行し、全フローのレスポンスが期待通りであることを自動判定できる。

### Implementation for User Story 5

- [x] T041 [US5] Create `tests/e2e/` directory and `tests/e2e/conftest.py` with test configuration (Slack Bot Token, test channel ID, timeout settings) loaded from environment variables
- [x] T042 [US5] Create `tests/e2e/test_slack_flow.py` with test `test_echo_mode_full_flow` — send Slack message mentioning bot via `chat.postMessage`, poll for reply with `conversations.history`, assert response contains `[Echo]` prefix, record latency for each step
- [x] T043 [US5] Add retry logic and timeout handling to E2E test — max 60 seconds wait, 3 retries on transient Slack API errors, clear error messages on failure with step identification
- [x] T044 [US5] Add `tests/e2e/README.md` with prerequisites (env vars: `SLACK_BOT_TOKEN`, `SLACK_TEST_CHANNEL`, `SLACK_BOT_USER_ID`), usage instructions (`pytest tests/e2e/ -v`), and expected output format
- [x] T045 [US5] Run E2E test against deployed dev environment (エコーモード有効): `SLACK_BOT_TOKEN=... SLACK_TEST_CHANNEL=... pytest tests/e2e/ -v`

**Checkpoint**: E2E テストスクリプトが全フローを自動検証し、レイテンシを記録。

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T046 Run full test suite for both agents: `cd cdk/lib/verification/agent/verification-agent && pytest tests/ -v` and `cd cdk/lib/execution/agent/execution-agent && pytest tests/ -v`
- [x] T047 Run full CDK test suite: `cd cdk && npx jest`
- [x] T048 Verify zero occurrences of `_handle_invocation` in entire codebase: `grep -r "_handle_invocation" cdk/lib/`
- [x] T049 Verify zero occurrences of `bedrock_agentcore` import in agent code: `grep -r "bedrock_agentcore" cdk/lib/verification/agent/ cdk/lib/execution/agent/`
- [x] T050 Deploy to dev environment with echo mode and verify end-to-end: `VALIDATION_ZONE_ECHO_MODE=true ./scripts/deploy-split-stacks.sh dev`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Skipped — no setup needed
- **Phase 2 (Foundational)**: Skipped — no shared prerequisites
- **Phase 3 (US1)**: Can start immediately — IAM policy changes only
- **Phase 4 (US2)**: Can start immediately — independent agent directories (but 4a before 4b)
- **Phase 5 (US3)**: Depends on US2 completion — requirements change after migration
- **Phase 6 (US4)**: Can start immediately — different files from US1/US2
- **Phase 7 (US5)**: Depends on US1 + US2 + US3 + US4 completion + deployment
- **Phase 8 (Polish)**: Depends on all user stories completion

### User Story Dependencies

- **US1 (P1)**: Independent — CDK constructs only
- **US2 (P2)**: Independent — agent main.py and tests only (4a → 4b serial)
- **US3 (P3)**: Depends on US2 — requirements change after migration
- **US4 (P4)**: Independent — CDK types and config only
- **US5 (P5)**: Depends on US1 + US2 + US3 + US4 + deployment

### Within Each User Story

1. Tests MUST be written and FAIL before implementation
2. Implementation changes applied
3. All tests (existing + new) MUST pass
4. Story checkpoint validated

### Parallel Opportunities

- **US1 and US4 can run in parallel** — different files (CDK constructs vs CDK types)
- **US1 and US2 can run in parallel** — CDK constructs vs agent Python code
- **US4 and US2 can run in parallel** — CDK types vs agent Python code
- Within US1, T001-T002 (tests) and T003-T004 (implementation) are each parallelizable
- Within US2 Phase 4b, T018-T024 (tests) are all [P] (different test classes)
- Within US3, T029-T032 (tests) and T033-T034 (implementation) are each parallelizable

---

## Parallel Example: US1 + US4 Simultaneously

```bash
# Developer A: US1 (CloudWatch IAM)
Task: "T001-T002: Write IAM namespace condition tests"
Task: "T003-T004: Update IAM policy conditions"
Task: "T005: Run CDK tests"

# Developer B: US4 (Echo Mode Config) — in parallel
Task: "T036-T037: Write echo mode config tests"
Task: "T038-T039: Add validationZoneEchoMode to CdkConfig"
Task: "T040: Run CDK tests"
```

## Parallel Example: US2 Verification + Execution Agents

```bash
# Phase 4a FIRST (Verification Agent):
Task: "T006-T012: Write strands-agents migration tests"
Task: "T013: Verify tests FAIL"
Task: "T014: Rewrite main.py with strands-agents"
Task: "T015-T016: Verify all tests PASS"

# Phase 4b AFTER 4a (Execution Agent):
Task: "T017-T024: Write strands-agents migration tests"
Task: "T025: Verify tests FAIL"
Task: "T026: Rewrite main.py with strands-agents"
Task: "T027-T028: Verify all tests PASS"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 3: US1 (CloudWatch IAM fix)
2. **STOP and VALIDATE**: Deploy, check CloudWatch for metrics
3. Confirm metrics are being recorded (no more AccessDenied)

### Incremental Delivery

1. US1 → IAM fix → Deploy → Validate metrics (MVP)
2. US2 → strands-agents migration (Verification → Execution) → Deploy → Validate echo mode
3. US3 → Version pinning → Verify build reproducibility
4. US4 → Echo mode config → Deploy → Validate config-driven echo
5. US5 → E2E tests → Run against deployed environment
6. Polish → Full test suite, grep validation, final deploy

### Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| strands-agents A2AServer API 差異 | Execution Agent の async task パターンが移行困難 | Verification Agent 先行移行で API 習熟 |
| テストモック更新の工数 | conftest.py の大幅変更 | 段階的更新（Verification → Execution） |
| `cancel()` 未実装 | タスクキャンセルが機能しない | 現行コードもキャンセル未対応のため影響なし |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US4 are fully independent (different CDK files)
- US2 is the largest story — Verification Agent 先行で安定確認後に Execution Agent 着手
- US3 depends on US2 — requirements.txt は移行完了後に最終確定
- US5 depends on deployment — E2E テストは全 US 完了・デプロイ後に実施
- Total code change: ~15 files across agents, CDK, and tests
- TDD 厳守: 全 US でテスト先行記述 → FAIL 確認 → 実装 → PASS 確認
