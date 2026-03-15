# Tasks: Slack Search Agent for Verification Zone

**Input**: Design documents from `/specs/038-slack-search-agent/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**TDD**: 各コード変更はテスト先行（Red → Green → Refactor）で実施。Constitution Principle II 必須。
**Test command**: `cd verification-zones/slack-search-agent/src && python -m pytest ../tests/ -v`

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 並列実行可能（異なるファイル、依存なし）
- **[Story]**: 対応するユーザーストーリー（US1, US2, US3）

---

## Phase 1: Setup（新規ゾーンの骨格）

**Purpose**: `verification-zones/slack-search-agent/` のディレクトリ構造・設定ファイルの作成

- [X] T001 Create directory structure: `verification-zones/slack-search-agent/{src/tools/,tests/,cdk/bin/,cdk/lib/constructs/,cdk/lib/types/,cdk/test/,scripts/}`
- [X] T002 [P] Create `verification-zones/slack-search-agent/src/requirements.txt` with `strands-agents[a2a,otel]~=1.25.0`, `fastapi~=0.115.0`, `uvicorn~=0.34.0`, `boto3~=1.42.0`, `slack-sdk~=3.27.0`, `aws-opentelemetry-distro~=0.10.0`
- [X] T003 [P] Create `verification-zones/slack-search-agent/src/Dockerfile` based on time-agent pattern (`python:3.11-slim`, port 9000, `opentelemetry-instrument`)
- [X] T004 [P] Create `verification-zones/slack-search-agent/src/.dockerignore` excluding `__pycache__`, `*.pyc`, `.pytest_cache`, `tests`
- [X] T005 [P] Create `verification-zones/slack-search-agent/cdk/package.json` based on time-agent CDK package (aws-cdk-lib, constructs, typescript 5.x, jest)
- [X] T006 [P] Create `verification-zones/slack-search-agent/cdk/cdk.json` with `"app": "npx ts-node bin/cdk.ts"`
- [X] T007 [P] Create `verification-zones/slack-search-agent/cdk/cdk.config.dev.json` with `awsRegion`, `bedrockModelId`, `deploymentEnv`, `verificationAccountId`
- [X] T008 [P] Create `verification-zones/slack-search-agent/scripts/deploy.sh` based on time-agent deploy script pattern

**Checkpoint**: ディレクトリ構造と設定ファイルが揃い、次フェーズに進める

---

## Phase 2: Foundational（全ストーリー共通基盤）

**Purpose**: 全ユーザーストーリーが依存するコアコンポーネントの実装。ここが完了するまでストーリー実装は始められない。

**⚠️ CRITICAL**: このフェーズが完了するまで US1/US2/US3 の実装は開始しない

### 共有ユーティリティ（並列可）

- [X] T009 [P] Create `verification-zones/slack-search-agent/src/logger_util.py` — 構造化 JSON ログ（time-agent の logger_util.py と同一パターン）
- [X] T010 [P] Create `verification-zones/slack-search-agent/src/response_formatter.py` — `format_success_response` / `format_error_response` （time-agent パターン踏襲）
- [X] T011 [P] Create `verification-zones/slack-search-agent/src/system_prompt.py` — Slack 検索専用システムプロンプト（利用可能ツール・アクセス制限を明記）

### テスト基盤（並列可）

- [X] T012 [P] Create `verification-zones/slack-search-agent/tests/__init__.py` (空ファイル)
- [X] T013 [P] Create `verification-zones/slack-search-agent/src/tools/__init__.py` (空ファイル)
- [X] T014 [P] Create `verification-zones/slack-search-agent/tests/conftest.py` — FastAPI TestClient、uvicorn、Strands Agent、slack_sdk.WebClient のモック定義

### Agent Card（TDD）

- [X] T015 Write failing tests in `verification-zones/slack-search-agent/tests/test_agent_card.py` — `name == "SlackAI-SlackSearchAgent"`、3スキル（search-messages/get-thread/get-channel-history）、JSON シリアライズ可能、health status を検証
- [X] T016 Implement `verification-zones/slack-search-agent/src/agent_card.py` to make T015 pass — name, skills, capabilities, SIGV4 authentication

### チャンネルアクセス制御（TDD）— 全ツールの前提

- [X] T017 Write failing tests in `verification-zones/slack-search-agent/tests/test_channel_access.py` — (1) 呼び出し元チャンネル → 許可、(2) 公開チャンネル → 許可、(3) プライベートチャンネル（呼び出し元以外）→ 拒否、(4) `conversations.info` エラー時 → fail-open（拒否ではなくエラー返却）
- [X] T018 Implement `verification-zones/slack-search-agent/src/channel_access.py` to make T017 pass — `is_accessible(channel_id, calling_channel, bot_token) -> ChannelAccessDecision`

### Slack クライアントラッパー

- [X] T019 [P] Create `verification-zones/slack-search-agent/src/slack_client.py` — `slack_sdk.WebClient` ラッパー。`get_channel_info`, `get_channel_history`, `get_thread_replies` メソッドを提供。タイムアウト 10 秒、`SlackApiError` キャッチ + ログ

### Agent Factory

- [X] T020 [P] Create `verification-zones/slack-search-agent/src/agent_factory.py` — Strands `BedrockModel` + `Agent` のファクトリ（time-agent パターン）。`BEDROCK_MODEL_ID`, `AWS_REGION_NAME` 環境変数使用

### メインアプリ（TDD）— JSON-RPC 骨格

- [X] T021 Write failing tests in `verification-zones/slack-search-agent/tests/test_main.py` — (1) `GET /ping` 200 応答、(2) `GET /.well-known/agent-card.json` agent card 返却、(3) 無効 JSON → -32700、(4) 不明メソッド → -32601、(5) `text` 欠如 → -32602
- [X] T022 Implement `verification-zones/slack-search-agent/src/main.py` to make T021 pass — FastAPI app、`POST /`（JSON-RPC 2.0）、`GET /ping`、`GET /.well-known/agent-card.json`、`handle_message_tool`、`_active_tasks` カウンター

### CDK Infrastructure

- [X] T023 [P] Create `verification-zones/slack-search-agent/cdk/lib/constructs/slack-search-agent-ecr.ts` — `DockerImageAsset` (ARM64, `../src` から)
- [X] T024 Create `verification-zones/slack-search-agent/cdk/lib/constructs/slack-search-agent-runtime.ts` — `AWS::BedrockAgentCore::Runtime`、IAM role（ECR pull, CloudWatch, Bedrock InvokeModel, X-Ray）、環境変数（`BEDROCK_MODEL_ID`, `AWS_REGION_NAME`）
- [X] T025 Create `verification-zones/slack-search-agent/cdk/lib/slack-search-agent-stack.ts` — `SlackSearchAgentStack`（ECR + Runtime を統合、ARN を CfnOutput）
- [X] T026 Create `verification-zones/slack-search-agent/cdk/bin/cdk.ts` — `DEPLOYMENT_ENV` 読み込み、`SlackSearchAgentStack` インスタンス化
- [X] T027 [P] Create `verification-zones/slack-search-agent/cdk/test/slack-search-agent-stack.test.ts` — Jest CDK テスト（AgentCore Runtime リソース存在確認、ARM64 確認、ARN Output 確認）

**Checkpoint**: `python -m pytest ../tests/ -v` が全テスト通過。JSON-RPC 骨格が動作する。

---

## Phase 3: User Story 1 — Slack チャンネル検索（Priority: P1）🎯 MVP

**Goal**: ユーザーのキーワード検索依頼に対し、呼び出し元チャンネルと公開チャンネルを対象に検索して回答する

**Independent Test**: `execute_task` で検索依頼テキストを送ると、Slack API を呼んで結果テキストが返る。チャンネルアクセス制御が機能する。

### US1 実装

- [X] T028 [US1] Write failing tests in `verification-zones/slack-search-agent/tests/test_search_messages.py` — (1) キーワードが一致するメッセージを返す、(2) 呼び出し元チャンネル → 許可、(3) 公開チャンネル → 許可、(4) プライベートチャンネル指定 → アクセス拒否メッセージ返却、(5) 0 件 → 「見つかりませんでした」、(6) 最大 20 件上限、(7) Slack API エラー → graceful エラー
- [X] T029 [US1] Implement `verification-zones/slack-search-agent/src/tools/search_messages.py` to make T028 pass — `@tool search_messages(query, channel_id, calling_channel, bot_token, limit=20)`: `conversations.history` 取得 → テキストフィルタリング → 上限適用 → `channel_access.is_accessible` チェック
- [X] T030 [US1] Add US1 execute_task acceptance tests to `verification-zones/slack-search-agent/tests/test_main.py` — execute_task で検索意図テキストを送り `status == "success"` かつ `response_text` に結果が含まれることを検証（Strands Agent をモック）
- [X] T031 [US1] Register `search_messages` tool in `verification-zones/slack-search-agent/src/agent_factory.py` — `get_tools()` に `search_messages` を追加

**Checkpoint (US1)**: `python -m pytest ../tests/test_search_messages.py ../tests/test_main.py -v` 全通過。検索フローが独立して動作する。

---

## Phase 4: User Story 2 — URL によるスレッド取得（Priority: P1）

**Goal**: ユーザーが Slack URL を提示した場合にスレッド全体を取得して回答する

**Independent Test**: `execute_task` に Slack URL を含むテキストを送ると、スレッド内容が `response_text` に返る。アクセス不能チャンネルの場合はエラーを返す。

### US2 実装

- [X] T032 [US2] Write failing tests in `verification-zones/slack-search-agent/tests/test_get_thread.py` — (1) 有効 URL → スレッド全メッセージ返却、(2) URL のチャンネルが呼び出し元 → 許可、(3) URL のチャンネルが公開 → 許可、(4) URL のチャンネルがプライベート（呼び出し元以外）→ アクセス拒否、(5) 無効 URL 形式 → エラーメッセージ、(6) Slack API エラー → graceful エラー、(7) 最大 20 件上限
- [X] T033 [US2] Implement `verification-zones/slack-search-agent/src/tools/get_thread.py` to make T032 pass — `@tool get_thread(slack_url, calling_channel, bot_token, limit=20)`: URL パース → `channel_access.is_accessible` チェック → `conversations.replies` 取得 → フォーマット
- [X] T034 [US2] Add US2 execute_task acceptance tests to `verification-zones/slack-search-agent/tests/test_main.py` — URL 含むテキストで execute_task を呼び `status == "success"` を検証
- [X] T035 [US2] Register `get_thread` tool in `verification-zones/slack-search-agent/src/agent_factory.py` — `get_tools()` に `get_thread` を追加

**Checkpoint (US2)**: `python -m pytest ../tests/test_get_thread.py -v` 全通過。US1, US2 が独立して動作する。

---

## Phase 5: User Story 3 — チャンネル履歴取得（Priority: P2）

**Goal**: ユーザーが特定チャンネルの最新メッセージ一覧を要求した場合に対応する

**Independent Test**: `execute_task` でチャンネル名と件数を指定すると、最新メッセージが返る。プライベートチャンネル（呼び出し元以外）は拒否。

### US3 実装

- [X] T036 [US3] Write failing tests in `verification-zones/slack-search-agent/tests/test_get_channel_history.py` — (1) 公開チャンネル → 最新メッセージ返却、(2) 呼び出し元チャンネル → 許可、(3) プライベートチャンネル（呼び出し元以外）→ アクセス拒否、(4) ボット未参加 → エラーメッセージ、(5) limit 適用（デフォルト 20、最大 20）
- [X] T037 [US3] Implement `verification-zones/slack-search-agent/src/tools/get_channel_history.py` to make T036 pass — `@tool get_channel_history(channel_id, calling_channel, bot_token, limit=20)`: `channel_access.is_accessible` チェック → `conversations.history` 取得 → フォーマット
- [X] T038 [US3] Add US3 execute_task acceptance tests to `verification-zones/slack-search-agent/tests/test_main.py` — チャンネル履歴依頼テキストで execute_task を呼び `status == "success"` を検証
- [X] T039 [US3] Register `get_channel_history` tool in `verification-zones/slack-search-agent/src/agent_factory.py` — `get_tools()` に `get_channel_history` を追加

**Checkpoint (US3)**: `python -m pytest ../tests/ -v` 全通過（T001〜T039 全ストーリー完了）。

---

## Phase 6: verification-agent 統合

**Purpose**: verification agent が Slack Search Agent を A2A で呼び出せるようにする

**⚠️ 前提**: Phase 5 完了 + Slack Search Agent が dev 環境にデプロイ済みで ARN が取得できていること

### verification-agent 側 Python 変更（TDD）

- [X] T040 Write failing tests in `verification-zones/verification-agent/agent/verification-agent/tests/test_slack_search_client.py` — (1) `SlackSearchClient.search` が A2A 経由で `execute_task` を呼ぶ、(2) `SLACK_SEARCH_AGENT_ARN` 未設定時に `ValueError`、(3) A2A エラー時に graceful エラー返却
- [X] T041 Implement `verification-zones/verification-agent/agent/verification-agent/src/slack_search_client.py` to make T040 pass — `SlackSearchClient`: `invoke_execution_agent`（既存 `a2a_client.py`）を使って Slack Search Agent を A2A 呼び出し。`SLACK_SEARCH_AGENT_ARN` 環境変数から ARN を取得
- [X] T042 Add `slack_search` Strands tool to `verification-zones/verification-agent/agent/verification-agent/src/` — `@tool` デコレータで `slack_search_client.SlackSearchClient.search` をラップした Strands ツール。verification agent の orchestrator が使用できるよう `agent_tools.py` または新規ファイルに追加
- [X] T043 Add failing test for `slack_search` tool integration in `verification-zones/verification-agent/agent/verification-agent/tests/` — tool が呼ばれると A2A クライアントに委譲されることを検証。既存テストが引き続きパスすることを確認
- [X] T044 Update system prompt or agent configuration in `verification-zones/verification-agent/agent/verification-agent/src/` — Slack Search Agent の能力（チャンネル検索、スレッド取得、履歴取得）を orchestrator の system prompt / 利用可能ツールに追記

### verification-agent CDK 変更

- [X] T045 [P] Update `verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts` — `SLACK_SEARCH_AGENT_ARN` 環境変数を AgentCore Runtime の properties に追加。IAM role に Slack Search Agent Runtime への `InvokeAgentRuntime` 権限を追加
- [X] T046 [P] Update `verification-zones/verification-agent/cdk/bin/cdk.ts` — `slackSearchAgentArn` を環境変数または `cdk.config.{env}.json` から読み込み、`VerificationStack` props に渡す
- [X] T047 [P] Update `verification-zones/verification-agent/cdk/cdk.config.dev.json` — `slackSearchAgentArn` フィールドを追加（デプロイ後に実際の ARN を記入）
- [X] T048 [P] Update `verification-zones/verification-agent/cdk/lib/types/cdk-config.ts` (Zod schema) — `slackSearchAgentArn` フィールドを optional として追加

**Checkpoint (Integration)**: `cd verification-zones/verification-agent && python -m pytest tests/ -v` 全通過（既存テスト含む）。

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T049 [P] Create `verification-zones/slack-search-agent/README.md` — purpose, structure, test/deploy commands, required Slack scopes（quickstart.md を参照）
- [X] T050 [P] Run `cd verification-zones/slack-search-agent/src && ruff check .` and fix any lint errors
- [X] T051 [P] Run `cd verification-zones/verification-agent/agent/verification-agent && ruff check .` and fix any lint errors in new/changed files
- [ ] T052 Deploy Slack Search Agent to dev: `DEPLOYMENT_ENV=dev ./verification-zones/slack-search-agent/scripts/deploy.sh` — ARN を取得して `cdk.config.dev.json` に記入
- [ ] T053 Re-deploy verification agent with `SLACK_SEARCH_AGENT_ARN`: `DEPLOYMENT_ENV=dev ./verification-zones/verification-agent/scripts/deploy.sh` — agent card エンドポイントで Slack Search Agent のスキルが確認できることを検証

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)          → no dependencies
Phase 2 (Foundational)   → Phase 1 完了後
Phase 3 (US1)            → Phase 2 完了後
Phase 4 (US2)            → Phase 2 完了後（US1 と並列可）
Phase 5 (US3)            → Phase 2 完了後（US1, US2 と並列可）
Phase 6 (Integration)    → Phase 5 完了 + Slack Search Agent デプロイ済み
Phase 7 (Polish)         → Phase 6 完了後
```

### User Story Dependencies

- **US1**: Phase 2 完了後に開始可能。他ストーリーに依存なし
- **US2**: Phase 2 完了後に開始可能。US1 と並列実行可能
- **US3**: Phase 2 完了後に開始可能。US1, US2 と並列実行可能

### Within Each User Story（TDD 順序）

1. テスト作成（FAIL 確認）
2. ツール実装（GREEN）
3. Agent Factory への登録
4. main.py 受け入れテスト追加

---

## Parallel Opportunities

### Phase 1 並列実行例

```
T002 requirements.txt
T003 Dockerfile
T004 .dockerignore      ← 全て並列
T005 package.json
T006 cdk.json
T007 cdk.config.dev.json
T008 deploy.sh
```

### Phase 2 並列実行例（同フェーズ内で依存なし）

```
Group A: T009 logger_util.py + T010 response_formatter.py + T011 system_prompt.py
Group B: T012 tests/__init__.py + T013 tools/__init__.py + T014 conftest.py
Group C: T019 slack_client.py + T020 agent_factory.py（T015-T018 完了後）
Group D: T023 ecr.ts + T027 cdk-test.ts（T024 は T023 に依存）
```

### Phase 3〜5 並列実行例（Phase 2 完了後）

```
US1: T028→T029→T030→T031
US2: T032→T033→T034→T035  ← US1 と並列
US3: T036→T037→T038→T039  ← US1, US2 と並列
```

---

## Implementation Strategy

### MVP First（US1 のみ）

1. Phase 1: Setup 完了
2. Phase 2: Foundational 完了
3. Phase 3: US1 のみ完了
4. **STOP & VALIDATE**: `python -m pytest ../tests/ -v` 全通過
5. dev へのデプロイで検索機能を動作確認

### Incremental Delivery

1. Setup + Foundational → JSON-RPC 骨格が動く
2. US1（検索）→ 単独テスト → デプロイ（MVP!）
3. US2（URL スレッド取得）→ 単独テスト → デプロイ
4. US3（チャンネル履歴）→ 単独テスト → デプロイ
5. Integration（verification-agent 連携）→ E2E 確認 → 本番デプロイ

---

## Notes

- `[P]` タスク = 異なるファイル、依存なし → 並列実行可能
- TDD を守ること: テストを書き、FAIL を確認してから実装開始
- 各 Checkpoint でテストが全通過することを確認してから次フェーズへ
- Slack API はテストで全てモック（実環境不要）
- Strands Agent はテストでモック（Bedrock 呼び出しなし）
- CDK は TypeScript Jest テストで CDK アサーション確認
