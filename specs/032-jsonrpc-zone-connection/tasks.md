# Tasks: CSP に依らない A2A 接続（JSON-RPC 2.0）

**Input**: Design documents from `/specs/032-jsonrpc-zone-connection/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**TDD**: 各フェーズで **テストを先に書き、失敗を確認してから実装** する（Red → Green → Refactor）。テストタスクの直後に「pytest を実行し、該当テストが FAIL することを確認」を入れる。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story (US1, US2, US3)
- **TEST**: テストを書くタスク（実装前に実行し、失敗を確認）
- **IMPL**: 実装タスク（テストを通すための最小実装）

## Path Conventions

- **Verification Agent**: `cdk/lib/verification/agent/verification-agent/`
- **Execution Agent**: `cdk/lib/execution/agent/execution-agent/`
- **Contracts**: `specs/032-jsonrpc-zone-connection/contracts/jsonrpc-execute-task.yaml`

---

## Phase 1: Setup

**Purpose**: 契約参照とテスト環境の確認。

- [x] T001 Confirm contracts and data-model are the single source of truth for method `execute_task`, params, and error codes in `specs/032-jsonrpc-zone-connection/contracts/jsonrpc-execute-task.yaml` and `specs/032-jsonrpc-zone-connection/data-model.md`
- [x] T002 [P] Ensure pytest runs for Execution Agent: `cd cdk/lib/execution/agent/execution-agent && python -m pytest tests/ -v`
- [x] T003 [P] Ensure pytest runs for Verification Agent: `cd cdk/lib/verification/agent/verification-agent && python -m pytest tests/ -v`

---

## Phase 2: Foundational (Execution Zone — JSON-RPC 2.0 handler)

**Purpose**: Execution が JSON-RPC 2.0 Request を受け付け、JSON-RPC 2.0 Response を返す。TDD: テストを先に追加し RED を確認してから実装で GREEN にする。

**Independent Test**: POST で JSON-RPC 2.0 Request (method `execute_task`, params, id) を送り、JSON-RPC 2.0 Response (result or error, same id) が返ることを確認。

### 2.1 Tests first (Red)

> 以下のテストを追加したあと、pytest を実行し **いずれも FAIL することを確認** してから 2.2 に進む。

- [x] T004 [P] [US1] **TEST** Add test in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`: POST body が invalid JSON のとき、response が JSON-RPC 2.0 で `error.code == -32700`, `id is None`
- [x] T005 [P] [US1] **TEST** Add test in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`: POST body が valid JSON だが `method` 欠如または不正なとき、response が `error.code == -32600`, `id is None`
- [x] T006 [P] [US1] **TEST** Add test in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`: POST で `method: "foobar"`, `id: "1"` のとき、response が `error.code == -32601` かつ `id == "1"`
- [x] T007 [P] [US1] **TEST** Add test in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`: POST で valid JSON-RPC Request `method: "execute_task"`, `params: { channel, text, bot_token, ... }`, `id: "2"` のとき、response に `jsonrpc`, `result` or `error`, `id == "2"` が含まれる
- [x] T008 Run Execution Agent pytest: `cd cdk/lib/execution/agent/execution-agent && python -m pytest tests/test_main.py -v -k "jsonrpc or 32700 or 32600 or 32601 or execute_task"` — **上記 4 テストが FAIL することを確認（Red）**

### 2.2 Implementation (Green)

> T004–T007 で定義した期待に合わせ、最小実装でテストを通す。

- [x] T009 **IMPL** In `cdk/lib/execution/agent/execution-agent/main.py`: request body が valid JSON でないとき JSON-RPC Response (`error.code -32700`, `id null`) を返す
- [x] T010 **IMPL** In `cdk/lib/execution/agent/execution-agent/main.py`: valid JSON だが `jsonrpc`/`method`/`id` 欠如または型不正のとき JSON-RPC Response (`error.code -32600`, `id null`) を返す
- [x] T011 **IMPL** In `cdk/lib/execution/agent/execution-agent/main.py`: `method` が `execute_task` でないとき JSON-RPC Response (`error.code -32601`, request の `id`) を返す
- [x] T012 **IMPL** In `cdk/lib/execution/agent/execution-agent/main.py`: `method == "execute_task"` のとき `params` を task payload として既存 handle_message_tool を呼び、戻り値を JSON-RPC Response の `result` に載せ、request の `id` を付けて返す
- [x] T013 **IMPL** In `cdk/lib/execution/agent/execution-agent/main.py`: POST / のすべての応答が JSON-RPC 2.0 Response 形式（success: jsonrpc, result, id / error: jsonrpc, error { code, message, data? }, id）であることを保証する
- [x] T014 Run Execution Agent pytest again — **T004–T007 のテストがすべて PASS することを確認（Green）**

**Checkpoint**: Execution が JSON-RPC 2.0 の Request/Response を満たす。Verification 実装に進める。

---

## Phase 3: User Story 1 — Standard Request/Response (Priority: P1) — MVP

**Goal**: Verification が JSON-RPC 2.0 Request を送信し、JSON-RPC 2.0 Response をパースして利用する。

**Independent Test**: Verification から 1 リクエスト送信し、送信ペイロードが JSON-RPC Request、受信が JSON-RPC Response（同一 id）であることを確認。

### 3.1 Tests first (Red)

> Verification 側のユニットテストを先に書く。invoke_execution_agent のモック版や、request 構築・response パースの単体テストで RED を確認。

- [x] T015 [P] [US1] **TEST** Add test in `cdk/lib/verification/agent/verification-agent/tests/test_a2a_client.py` (or test_main.py): task_payload から JSON-RPC 2.0 Request を組み立てる関数を呼んだ結果、`jsonrpc == "2.0"`, `method == "execute_task"`, `params` に channel/text/bot_token 等が含まれる、`id` が string である
- [x] T016 [P] [US1] **TEST** Add test in `cdk/lib/verification/agent/verification-agent/tests/test_a2a_client.py`: JSON-RPC 2.0 Response（`result` あり）の body をパースする関数を呼んだ結果、成功ペイロード（status, response_text 等）が取り出せる
- [x] T017 [P] [US1] **TEST** Add test in `cdk/lib/verification/agent/verification-agent/tests/test_a2a_client.py`: JSON-RPC 2.0 Response（`error` あり）の body をパースする関数を呼んだ結果、error 情報（code, message）が取り出せる
- [x] T018 Run Verification Agent pytest — **上記テストが FAIL することを確認（Red）**

### 3.2 Implementation (Green)

- [x] T019 [US1] **IMPL** In `cdk/lib/verification/agent/verification-agent/a2a_client.py`: JSON-RPC 2.0 Request（jsonrpc "2.0", method "execute_task", params = task_payload, id = UUID 文字列）を組み立て、InvokeAgentRuntime の payload をその UTF-8 JSON にする
- [x] T020 [US1] **IMPL** In `cdk/lib/verification/agent/verification-agent/a2a_client.py`: InvokeAgentRuntime の response body を JSON-RPC 2.0 Response としてパースし、`result` または `error` を取得；同期成功時は result の JSON 文字列を返す；async（result.status "accepted", task_id）のときは既存 GetAsyncTaskResult ポーリングを維持し最終結果の JSON 文字列を返す
- [x] T021 [US1] **IMPL** In `cdk/lib/verification/agent/verification-agent/pipeline.py`（または invoke_execution_agent の呼び出し元）: 戻り値を従来どおり扱う — 成功時は response.result 相当のペイロード（status, response_text 等）を Slack poster に渡し、下流の形を変えない
- [x] T022 Run Verification Agent pytest — **T015–T017 が PASS することを確認（Green）**

**Checkpoint**: Verification 送信が JSON-RPC Request、受信パースが JSON-RPC Response；E2E で 1 タスク送信して形状を確認可能。

---

## Phase 4: User Story 2 — Consistent Error Contract (Priority: P2)

**Goal**: Execution の失敗（invalid params, timeout, internal error）がすべて JSON-RPC 2.0 の error オブジェクトで返り、Verification がそれを解釈する。

**Independent Test**: invalid params / timeout / internal error を意図的に起こし、response が JSON-RPC 2.0 の `error`（code, message, data?）のみで `result` がないことを確認。

### 4.1 Tests first (Red)

- [x] T023 [P] [US2] **TEST** Add test in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`: `execute_task` で `params` に channel なし（または必須欠落）のとき、response が `error.code == -32602`（Invalid params）、request id が維持される
- [x] T024 [P] [US2] **TEST** Add test in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`: 処理中に例外が発生するケース（モックで誘発）のとき、response が `error.code == -32603` または -32001、request id が維持される
- [x] T025 [P] [US2] **TEST** Add test in `cdk/lib/verification/agent/verification-agent/tests/test_a2a_client.py`: response に `error` が含まれるとき、ユーザー向けエラー用 JSON（status "error", error_code, error_message, correlation_id）に変換される
- [x] T026 Run Execution + Verification pytest — **上記テストが FAIL することを確認（Red）**

### 4.2 Implementation (Green)

- [x] T027 [US2] **IMPL** In `cdk/lib/execution/agent/execution-agent/main.py`: 必須 params（channel, text, bot_token）の欠落・不正時、JSON-RPC Response で `error.code -32602`、message と optional data を返す
- [x] T028 [US2] **IMPL** In `cdk/lib/execution/agent/execution-agent/main.py`: 未処理例外・処理失敗時、JSON-RPC Response で `error.code -32603` または `-32001`（contract に合わせる）、request id を維持して返す
- [x] T029 [US2] **IMPL** In `cdk/lib/verification/agent/verification-agent/a2a_client.py`: response に `error` があるとき、既存のユーザー向けエラー経路（status "error", error_code, error_message, correlation_id の JSON 文字列）にマッピングし、pipeline/Slack は従来どおり
- [x] T030 Run Execution + Verification pytest — **T023–T025 が PASS することを確認（Green）**

**Checkpoint**: 全エラー経路が JSON-RPC error オブジェクト；Verification は error を解釈しユーザーには安全なメッセージのみ表示。

---

## Phase 5: User Story 3 — End-to-End User Flow Unchanged (Priority: P1)

**Goal**: Slack ユーザーがメッセージを送り AI 返信を受け取る体験は変わらない；内部プロトコルのみ JSON-RPC 2.0。

**Independent Test**: Slack でメッセージ送信→返信受信；エラー時は適切なユーザー向けメッセージのみ表示され、プロトコル詳細やスタックトレースが出ないことを確認。

### 5.1 Test first (Red)

- [x] T031 [US3] **TEST** Add or document E2E/integration test: Slack → Verification → Execution (JSON-RPC) → Verification → Slack の一連の流れで、返信内容とエラー時のメッセージが pre–JSON-RPC ベースラインと同等であること（実機 or 統合テスト）。**現時点では失敗するか、スキップで「要検証」として記録**

### 5.2 Implementation (Green)

- [x] T032 [US3] **IMPL** In `cdk/lib/verification/agent/verification-agent/pipeline.py` および Slack poster 経路を確認: 成功時は response.result の内容（status, response_text 等）をそのまま利用し、エラー時はマッピング済みユーザー向けメッセージのみ使用；生の JSON-RPC envelope が Slack に露出しない
- [x] T033 [US3] Run E2E or manual test — **T031 の条件を満たすことを確認（Green）**

**Checkpoint**: SC-003 / FR-006 を満たし、ユーザーから見た挙動が変更されていない。

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: ドキュメントと一貫性。

- [x] T034 [P] Update README or module docs in `cdk/lib/verification/agent/verification-agent/` and `cdk/lib/execution/agent/execution-agent/`: ゾーン間プロトコルが JSON-RPC 2.0（CSP 非依存 A2A）であることを記載
- [x] T035 [P] Add CHANGELOG entry under Changed: Verification–Execution 接続を JSON-RPC 2.0（method execute_task）に変更；アプリケーション層はトランスポート非依存
- [x] T036 Run full pytest for both agents: `cdk/lib/execution/agent/execution-agent && python -m pytest tests/ -v` and `cdk/lib/verification/agent/verification-agent && python -m pytest tests/ -v`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: 依存なし — 最初に実行。
- **Phase 2**: Phase 1 完了後。**全ユーザーストーリーの前提**（Execution が JSON-RPC を話す）。
- **Phase 3**: Phase 2 完了後。Verification の Request 送信・Response パース。
- **Phase 4**: Phase 3 完了後。エラー契約の統一。
- **Phase 5**: Phase 3・4 完了後。E2E とユーザー体験の確認。
- **Phase 6**: Phase 5 完了後。

### TDD ルール（各フェーズ内）

1. **Tests first (Red)**: テストを追加 → pytest 実行 → **FAIL を確認**。
2. **Implementation (Green)**: 最小実装 → pytest 実行 → **PASS を確認**。
3. 必要に応じて Refactor（タスクには別途「リファクタ」を入れてもよい）。

### Parallel Opportunities

- T002, T003（Setup）: 並行可。
- T004–T007（Phase 2 テスト）: 並行可。
- T015–T017（Phase 3 テスト）: 並行可。
- T023–T025（Phase 4 テスト）: 並行可。
- T034, T035（Polish）: 並行可。

---

## Implementation Strategy (TDD)

### MVP（User Story 1 まで）

1. Phase 1: Setup  
2. Phase 2: **Tests first (T004–T008)** → Red 確認 → **Implementation (T009–T013)** → Green 確認（T014）  
3. Phase 3: **Tests first (T015–T018)** → Red 確認 → **Implementation (T019–T021)** → Green 確認（T022）  
4. **STOP and VALIDATE**: E2E で 1 タスク送信し Request/Response 形状を確認  

### Incremental Delivery

1. Phase 2 までで Execution が JSON-RPC 対応（TDD 完了）  
2. Phase 3 で Verification が JSON-RPC 送受信（TDD 完了）→ MVP  
3. Phase 4 でエラー契約を TDD で追加  
4. Phase 5 で E2E を TDD で検証  
5. Phase 6 でドキュメント整備  

### Standards

- **JSON-RPC 2.0**: [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification) に従う Request/Response とエラーコード（-32700, -32600, -32601, -32602, -32603, -32000..-32099）。
- **CSP 非依存**: アプリケーション層は `specs/032-jsonrpc-zone-connection/contracts/` と JSON-RPC 2.0 のみに依存；トランスポートは実装の詳細。

---

## Notes

- 各タスクは `- [ ] Tnnn [P?] [US?] Description` とファイルパスで一意に特定できる。
- **TEST** タスクは「期待をテストコードで表現し、実行して失敗を見る」までを完了とする。
- **IMPL** タスクは「そのテストを通す最小の実装」を完了とする。
- パスはリポジトリルート相対。
