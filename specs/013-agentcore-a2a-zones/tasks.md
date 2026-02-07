# Tasks: AgentCore A2A ゾーン間通信

**Input**: Design documents from `/specs/013-agentcore-a2a-zones/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: TDD アプローチで実装。全 97 テスト（Python 73 + CDK/Jest 24）がパス済み。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, container scaffolding, CDK type updates

- [x] T001 Create Execution Agent container directory structure at `cdk/lib/execution/agent/execution-agent/`
- [x] T002 [P] Create Verification Agent container directory structure at `cdk/lib/verification/agent/verification-agent/`
- [x] T003 [P] Create `cdk/lib/execution/agent/execution-agent/requirements.txt` with dependencies: `bedrock-agentcore`, `strands-agents[a2a]`, `uvicorn`, `fastapi`, `boto3>=1.34.0`, `requests>=2.31.0`, `PyPDF2>=3.0.0`, `openpyxl>=3.1.0`
- [x] T004 [P] Create `cdk/lib/verification/agent/verification-agent/requirements.txt` with dependencies: `bedrock-agentcore`, `strands-agents[a2a]`, `uvicorn`, `fastapi`, `boto3>=1.34.0`, `slack-sdk>=3.27.0`, `requests>=2.31.0`
- [x] T005 [P] Create `cdk/lib/execution/agent/execution-agent/Dockerfile` — ARM64 base (`python:3.11-slim`), EXPOSE 9000, CMD `python main.py`
- [x] T006 [P] Create `cdk/lib/verification/agent/verification-agent/Dockerfile` — ARM64 base (`python:3.11-slim`), EXPOSE 9000, CMD `python main.py`
- [x] T007 Update `cdk/lib/types/stack-config.ts` — Add `ExecutionAgentStackProps` fields: `executionAgentName`, `verificationAgentArn`, `useAgentCore`
- [x] T008 Update `cdk/lib/types/cdk-config.ts` — Add AgentCore config fields: `executionAgentName`, `verificationAgentName`, `useAgentCore`, `executionAgentArn`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: CDK constructs for AgentCore Runtime, IAM roles, ECR — MUST complete before user story agent code

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 Create `cdk/lib/execution/constructs/execution-agent-runtime.ts` — CDK L1 construct using `CfnRuntime` with ProtocolConfiguration `A2A`, ARM64 container, SigV4 auth, IAM execution role (ECR, CloudWatch, X-Ray, Bedrock permissions), trust policy for `bedrock-agentcore.amazonaws.com`
- [x] T010 [P] Create `cdk/lib/verification/constructs/verification-agent-runtime.ts` — CDK L1 construct using `CfnRuntime` with ProtocolConfiguration `A2A`, ARM64 container, SigV4 auth, IAM execution role (ECR, CloudWatch, X-Ray, DynamoDB 5 tables, Secrets Manager, `bedrock-agentcore:InvokeAgentRuntime` permissions), trust policy for `bedrock-agentcore.amazonaws.com`
- [x] T011 [P] Create `cdk/lib/execution/constructs/execution-agent-ecr.ts` — CDK `DockerImageAsset` construct for Execution Agent container image build and push to ECR (`--platform linux/arm64`)
- [x] T012 [P] Create `cdk/lib/verification/constructs/verification-agent-ecr.ts` — CDK `DockerImageAsset` construct for Verification Agent container image build and push to ECR (`--platform linux/arm64`)
- [x] T013 Update `cdk/lib/execution/execution-stack.ts` — Import and instantiate `ExecutionAgentRuntime` + `ExecutionAgentEcr` constructs, add `CfnRuntimeEndpoint` (DEFAULT), add stack outputs for `ExecutionAgentArn` and `ExecutionAgentEndpointUrl`, keep existing API Gateway + BedrockProcessor for fallback
- [x] T014 Update `cdk/lib/verification/verification-stack.ts` — Import and instantiate `VerificationAgentRuntime` + `VerificationAgentEcr` constructs, add `CfnRuntimeEndpoint` (DEFAULT), add stack outputs for `VerificationAgentArn`, grant SlackEventHandler Lambda `bedrock-agentcore:InvokeAgentRuntime` permission, keep existing SQS + SlackResponseHandler for fallback
- [x] T015 Update `cdk/bin/cdk.ts` — Pass AgentCore config values (`executionAgentName`, `verificationAgentName`, `useAgentCore`) to both stacks, add `executionAgentArn` cross-stack parameter flow

### Phase 2 TDD テスト

- [x] T015a Create `cdk/test/agentcore-constructs.test.ts` — CDK AgentCore コンストラクトのユニットテスト（Jest + aws-cdk-lib/assertions）: ExecutionAgentRuntime（A2A プロトコル、SigV4 認証、IAM ロール、Bedrock/ECR/CloudWatch/X-Ray 権限、クロスアカウントリソースポリシー条件付き作成）、VerificationAgentRuntime（A2A プロトコル、SigV4 認証、IAM ロール、DynamoDB/SecretsManager/AgentCore invoke 権限、GetAsyncTaskResult 含む、スコープ付き IAM ポリシー）、SlackEventHandler Feature Flag（USE_AGENTCORE/VERIFICATION_AGENT_ARN 環境変数、条件付き bedrock-agentcore:InvokeAgentRuntime IAM 権限）**[24 tests passed]**

**Checkpoint**: AgentCore Runtime infrastructure is deployable. Both agents have ECR repos, IAM roles, Runtime + Endpoint resources defined in CDK. Existing Lambda/API Gateway/SQS still operational as fallback.

---

## Phase 3: User Story 1 — Slack ユーザーが AI に質問し、AgentCore 経由で回答を受け取る (Priority: P1) MVP

**Goal**: コア A2A フローの実装 — Slack → Lambda → Verification Agent → A2A → Execution Agent → Bedrock → A2A response → Slack 投稿

**Independent Test**: Slack で `@AI テスト質問` を投稿し、リアクション（👀）表示後に AI 回答がスレッドに投稿されることを確認。CloudWatch Logs で A2A JSON-RPC 2.0 メッセージを確認。

### Execution Agent コアロジック

- [x] T016 [P] [US1] Create `cdk/lib/execution/agent/execution-agent/main.py` — A2A サーバーエントリポイント: `BedrockAgentCoreApp` 初期化、`@app.entrypoint` で JSON-RPC 2.0 メッセージ受信、ExecutionTaskPayload のパースと Bedrock 処理呼び出し、ExecutionResponse の JSON-RPC 2.0 artifact 返却
- [x] T017 [P] [US1] Copy and adapt `cdk/lib/execution/agent/execution-agent/bedrock_client_converse.py` from existing `cdk/lib/execution/lambda/bedrock-processor/bedrock_client_converse.py` — Bedrock Converse API 呼び出しロジックを AgentCore コンテナ環境に適合（Lambda 固有の環境変数参照を汎用化）
- [x] T018 [P] [US1] Copy and adapt `cdk/lib/execution/agent/execution-agent/response_formatter.py` from existing `cdk/lib/execution/lambda/bedrock-processor/response_formatter.py` — レスポンス整形ロジック移植（SQS 送信部分を A2A レスポンス形式に変更）
- [x] T019 [P] [US1] Copy and adapt `cdk/lib/execution/agent/execution-agent/thread_history.py` from existing `cdk/lib/execution/lambda/bedrock-processor/thread_history.py` — スレッド履歴取得ロジック移植

### Verification Agent コアロジック

- [x] T020 [P] [US1] Create `cdk/lib/verification/agent/verification-agent/main.py` — A2A サーバーエントリポイント: `BedrockAgentCoreApp` 初期化、`@app.entrypoint` で SlackTaskPayload 受信、セキュリティ検証パイプライン実行、A2A client 経由で Execution Agent 呼び出し、結果受信後に Slack API chat.postMessage で投稿
- [x] T021 [P] [US1] Copy and adapt `cdk/lib/verification/agent/verification-agent/slack_verifier.py` from existing `cdk/lib/verification/lambda/slack-event-handler/slack_verifier.py` — 署名検証ロジック移植
- [x] T022 [P] [US1] Copy and adapt `cdk/lib/verification/agent/verification-agent/existence_check.py` from existing `cdk/lib/verification/lambda/slack-event-handler/existence_check.py` — Existence Check ロジック移植
- [x] T023 [P] [US1] Copy and adapt `cdk/lib/verification/agent/verification-agent/authorization.py` from existing `cdk/lib/verification/lambda/slack-event-handler/authorization.py` — ホワイトリスト認可ロジック移植
- [x] T024 [P] [US1] Copy and adapt `cdk/lib/verification/agent/verification-agent/rate_limiter.py` from existing `cdk/lib/verification/lambda/slack-event-handler/rate_limiter.py` — レート制限ロジック移植
- [x] T025 [P] [US1] Copy and adapt `cdk/lib/verification/agent/verification-agent/event_dedupe.py` from existing `cdk/lib/verification/lambda/slack-event-handler/event_dedupe.py` — イベント重複排除ロジック移植
- [x] T026 [P] [US1] Copy and adapt `cdk/lib/verification/agent/verification-agent/slack_poster.py` from existing `cdk/lib/verification/lambda/slack-response-handler/slack_poster.py` + `response_handler.py` — Slack 投稿ロジック移植（chat.postMessage、4000 文字分割、リトライ）
- [x] T027 [US1] Create `cdk/lib/verification/agent/verification-agent/a2a_client.py` — Execution Agent への A2A 呼び出しクライアント: `InvokeAgentRuntime` API を使用して JSON-RPC 2.0 `message/send` を送信、SigV4 認証、correlation_id によるトレーシング、タイムアウト・エラーハンドリング

### Feature Flag と Lambda 統合

- [x] T028 [US1] Update `cdk/lib/verification/lambda/slack-event-handler/handler.py` — Feature Flag `USE_AGENTCORE` 環境変数を参照し、`true` の場合は `InvokeAgentRuntime(Verification Agent)` を呼び出し、`false` の場合は既存の API Gateway `/execute` 呼び出しを維持
- [x] T029 [US1] Update `cdk/lib/verification/constructs/slack-event-handler.ts` — 環境変数に `USE_AGENTCORE`、`VERIFICATION_AGENT_ARN`、`EXECUTION_AGENT_ARN` を追加、Lambda ロールに `bedrock-agentcore:InvokeAgentRuntime` 権限を付与

### Phase 3 TDD テスト

- [x] T029a [US1] Create `cdk/lib/execution/agent/execution-agent/tests/conftest.py` — `bedrock_agentcore` SDK モック: テスト環境で未インストールの SDK を `MockBedrockAgentCoreApp` クラス（`entrypoint`, `route`, `add_async_task`, `complete_async_task` メソッド）で代替
- [x] T029b [US1] Create `cdk/lib/execution/agent/execution-agent/tests/test_main.py` — Execution Agent main.py ユニットテスト: A2A メッセージバリデーション（channel/text 必須）、非同期タスク作成フロー、バックグラウンド Bedrock 処理、エラーマッピング（timeout/throttling/access_denied）、Agent Card エンドポイント、ヘルスチェック **[18 tests passed]**
- [x] T029c [US1] Create `cdk/lib/verification/agent/verification-agent/tests/conftest.py` — `bedrock_agentcore` SDK + `slack_sdk` モック
- [x] T029d [US1] Create `cdk/lib/verification/agent/verification-agent/tests/test_main.py` — Verification Agent main.py ユニットテスト: A2A ペイロード解析、セキュリティパイプライン（存在確認・認可・レート制限の失敗ブロック）、Execution Agent 委譲と Slack 投稿、エラーメッセージマッピング（既知エラーコード → ユーザーフレンドリーメッセージ）、Agent Card、ヘルスチェック **[15 tests passed]**
- [x] T029e [US1] Create `cdk/lib/verification/agent/verification-agent/tests/test_a2a_client.py` — A2A クライアントユニットテスト: 同期/非同期レスポンス処理、ポーリング（指数バックオフ）、タイムアウトエラー、ClientError ハンドリング（raise せず JSON エラー返却）、ThrottlingException マッピング、ARN 環境変数フォールバック、SigV4 クライアント生成 **[13 tests passed]**

**Checkpoint**: US1 完了。Slack → Lambda → AgentCore A2A → Bedrock → Slack 投稿のエンドツーエンドフローが Feature Flag `USE_AGENTCORE=true` で動作。`false` で既存フローにロールバック可能。

---

## Phase 4: User Story 2 — 長時間処理の AgentCore 非同期機能対応 (Priority: P1)

**Goal**: 添付ファイル処理・長時間 Bedrock 呼び出しを AgentCore の非同期タスク管理で安定実行

**Independent Test**: 複数画像添付付きの質問を投稿し、即座にリアクション表示後、数秒〜数十秒後に回答が投稿されることを確認。CloudWatch Logs で `HealthyBusy` → `Healthy` 遷移を確認。

**Dependencies**: Phase 3 (US1) のコアフローが動作していること

### 非同期タスク管理

- [x] T030 [US2] Update `cdk/lib/execution/agent/execution-agent/main.py` — `@app.entrypoint` で `add_async_task("bedrock_processing")` を呼び出し、バックグラウンド `threading.Thread` で Bedrock 処理を実行、処理完了時に `complete_async_task(task_id)` を呼び出し。`@app.entrypoint` はブロッキングしない設計。

### 添付ファイル処理の移植

- [x] T031 [P] [US2] Copy and adapt `cdk/lib/execution/agent/execution-agent/attachment_processor.py` from existing `cdk/lib/execution/lambda/bedrock-processor/attachment_processor.py` — 添付ファイル処理ロジック移植（画像・ドキュメント対応）
- [x] T032 [P] [US2] Copy and adapt `cdk/lib/execution/agent/execution-agent/document_extractor.py` from existing `cdk/lib/execution/lambda/bedrock-processor/document_extractor.py` — ドキュメント抽出ロジック移植（PDF, DOCX, CSV, XLSX, PPTX, TXT）
- [x] T033 [P] [US2] Copy and adapt `cdk/lib/execution/agent/execution-agent/file_downloader.py` from existing `cdk/lib/execution/lambda/bedrock-processor/file_downloader.py` — Slack CDN からの添付ファイルダウンロードロジック移植

### Verification Agent の非同期対応

- [x] T034 [US2] Update `cdk/lib/verification/agent/verification-agent/a2a_client.py` — 非同期 A2A レスポンスのハンドリング: 即時レスポンス（`accepted`）と最終結果レスポンス（`result with artifacts`）の区別、指数バックオフによるポーリングパターンの実装（`_poll_async_task_result`）

### エラーハンドリング

- [x] T035 [US2] Update `cdk/lib/execution/agent/execution-agent/main.py` — エラーハンドリング強化: Bedrock タイムアウト、スロットリング、添付ファイルダウンロード失敗時に A2A JSON-RPC 2.0 エラーレスポンス（error_code マッピング）を返却。バックグラウンドスレッドの例外キャッチと `complete_async_task` の確実な呼び出し
- [x] T036 [US2] Update `cdk/lib/verification/agent/verification-agent/main.py` — Execution Agent からのエラーレスポンス受信時にユーザーフレンドリーなエラーメッセージを Slack スレッドに投稿

### Phase 4 TDD テスト

- [x] T036a [US2] Execution Agent 非同期フロー検証 — `test_main.py` TestHandleMessageAsyncFlow: 非同期タスク作成確認、daemon スレッド確認、Bedrock 呼び出し成功時の `complete_async_task` 確認、例外時のエラー付き完了確認 **[T029b に統合済み]**
- [x] T036b [US2] A2A クライアント非同期検証 — `test_a2a_client.py` TestPollAsyncTaskResult: ポーリング完了、タイムアウトエラー返却、指数バックオフ間隔増加、failed ステータスのエラー返却 **[T029e に統合済み]**

**Checkpoint**: US2 完了。複数添付ファイル付きの長時間処理が AgentCore 非同期タスクとして安定動作。`HealthyBusy` → `Healthy` 遷移がログで確認可能。

---

## Phase 5: User Story 3 — クロスアカウント A2A 通信のセキュリティ (Priority: P2)

**Goal**: Verification Zone (Account A) と Execution Zone (Account B) を異なる AWS アカウントにデプロイし、SigV4 認証でゾーン間 A2A 通信を保護

**Independent Test**: 異なるアカウントにデプロイ後、正常リクエストが通過し、無効な認証が拒否されることを確認。CloudTrail で認証イベントを検証。

**Dependencies**: Phase 3 (US1) の同一アカウントフローが動作していること

- [x] T037 [US3] Update `cdk/lib/execution/constructs/execution-agent-runtime.ts` — リソースベースポリシー追加: Verification Account の IAM ロール ARN に `bedrock-agentcore:InvokeAgentRuntime` を許可。Runtime と Endpoint の両方にポリシーを設定。`verificationAccountId` が指定されている場合のみクロスアカウントポリシーを適用
- [x] T038 [US3] Update `cdk/lib/verification/constructs/verification-agent-runtime.ts` — クロスアカウント呼び出し対応: Verification Agent の IAM 実行ロールに `bedrock-agentcore:InvokeAgentRuntime` + `bedrock-agentcore:GetAsyncTaskResult` 権限を付与（Execution Account の Runtime ARN をリソースに指定）
- [x] T039 [US3] Update `cdk/lib/execution/execution-stack.ts` — 新規 props `verificationAccountId` を `ExecutionAgentRuntime` コンストラクトに渡す。Stack output に `ExecutionAgentArn` を追加
- [x] T040 [US3] Update `cdk/lib/verification/verification-stack.ts` — 新規 props `executionAgentArn` を受け取り、Verification Agent の IAM ポリシーに Execution Agent の ARN を設定
- [x] T041 [US3] Update `cdk/bin/cdk.ts` — クロスアカウント設定の `executionAgentArn` パラメータを VerificationStack に渡す。`cdk.config.{env}.json` からの読み込みを追加
- [x] T042 [US3] Update `cdk/lib/verification/agent/verification-agent/a2a_client.py` — SigV4 署名付き `InvokeAgentRuntime` 呼び出し: `boto3` クライアントが自動的に SigV4 で署名するため、クロスアカウント ARN を環境変数から取得するように変更
- [x] T043 [US3] Add structured security logging in `cdk/lib/verification/agent/verification-agent/main.py` and `cdk/lib/execution/agent/execution-agent/main.py` — A2A 通信の認証成功/失敗イベントを構造化 JSON ログとして CloudWatch に出力（correlation_id, source_account, action, result）

### Phase 5 TDD テスト

- [x] T043a [US3] CDK クロスアカウントポリシーテスト — `agentcore-constructs.test.ts` Cross-Account Resource Policy: `verificationAccountId` 未指定時にポリシー未作成、指定時にリソースポリシー作成、InvokeAgentRuntime 許可の検証 **[T015a に統合済み]**
- [x] T043b [US3] CDK スコープ付き IAM テスト — `agentcore-constructs.test.ts` Scoped IAM Permissions: 特定 ARN 指定時のスコープ付きポリシー、未指定時のワイルドカード ARN の検証 **[T015a に統合済み]**

**Checkpoint**: US3 完了。クロスアカウントデプロイで A2A 通信が SigV4 認証で保護され動作。CloudTrail に全 `InvokeAgentRuntime` イベントが記録。

---

## Phase 6: User Story 4 — Agent Card と Agent Discovery (Priority: P3)

**Goal**: 各エージェントが Agent Card を公開し、A2A プロトコルの Agent Discovery に準拠

**Independent Test**: 各エージェントの `/.well-known/agent-card.json` に GET リクエストを送信し、コントラクト定義に一致する Agent Card JSON が返されることを確認。

**Dependencies**: Phase 3 (US1) のエージェントが起動していること

- [x] T044 [P] [US4] Create `cdk/lib/execution/agent/execution-agent/agent_card.py` — Execution Agent の Agent Card 定義: name `SlackAI-ExecutionAgent`、skills（bedrock-conversation, attachment-processing, thread-history, async-processing）、`AGENTCORE_RUNTIME_URL` 環境変数から URL を構築。`/.well-known/agent-card.json` エンドポイントとして登録
- [x] T045 [P] [US4] Create `cdk/lib/verification/agent/verification-agent/agent_card.py` — Verification Agent の Agent Card 定義: name `SlackAI-VerificationAgent`、skills（slack-request-validation, existence-check, whitelist-authorization, rate-limiting, task-delegation, slack-response）。`/.well-known/agent-card.json` エンドポイントとして登録
- [x] T046 [US4] Update `cdk/lib/execution/agent/execution-agent/main.py` — Agent Card エンドポイントの登録と `/ping` ヘルスチェックエンドポイントの実装（`Healthy` / `HealthyBusy` ステータス返却）
- [x] T047 [US4] Update `cdk/lib/verification/agent/verification-agent/main.py` — Agent Card エンドポイントの登録と `/ping` ヘルスチェックエンドポイントの実装

### Phase 6 TDD テスト

- [x] T047a [US4] Create `cdk/lib/execution/agent/execution-agent/tests/test_agent_card.py` — Agent Card ユニットテスト: カード構造検証（name, protocol=A2A, version, description, url, capabilities, authentication=SigV4）、スキル定義検証（bedrock-conversation, attachment-processing, async-processing + required fields）、ヘルスステータス検証（Healthy/HealthyBusy、agent_name 含む、JSON シリアライズ可能、timestamp 含む） **[17 tests passed]**
- [x] T047b [US4] Verification Agent Card テスト — `test_main.py` TestVerificationAgentCard: Agent Card 必須フィールド、セキュリティパイプラインスキルカバレッジ、ヘルスステータス **[T029d に統合、4 tests]**

**Checkpoint**: US4 完了。Agent Card が A2A プロトコル仕様に準拠して公開され、Agent Discovery が機能。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: オブザーバビリティ、ドキュメント更新、クリーンアップ

- [x] T048 [P] Create `cdk/lib/verification/agent/verification-agent/cloudwatch_metrics.py` — CloudWatch メトリクス発行ヘルパー: `emit_metric(namespace, metric_name, value)` + メトリクス定数（ExistenceCheckFailed, WhitelistAuthorizationFailed, RateLimitExceeded, A2ATaskReceived/Completed/Failed, SlackResponsePosted）。サイレントエラーハンドリング、シングルトンクライアント
- [x] T049 [P] Create `cdk/lib/execution/agent/execution-agent/cloudwatch_metrics.py` — CloudWatch メトリクス発行ヘルパー: `emit_metric(namespace, metric_name, value)` + メトリクス定数（BedrockApiError, BedrockTimeout, BedrockThrottling, AsyncTaskCreated/Completed/Failed, AttachmentProcessed/Failed）。サイレントエラーハンドリング、シングルトンクライアント
- [x] T050 [P] Add structured JSON logging with correlation_id in both agent `main.py` files — PII マスキング適用、構造化ログ出力（request_id, correlation_id, team_id マスク済み, user_id マスク済み, action, duration_ms）
- [x] T051 Update `docs/reference/architecture/overview.md` — セクション 2.4 に AgentCore A2A アーキテクチャ図を追加済み（フロー図、比較表、Feature Flag 説明）
- [x] T052 [P] Update `docs/reference/architecture/zone-communication.md` — セクション 6 に A2A 通信パスを追加済み（Mermaid 図、経路表、ペイロード例、非同期パターン、Agent Discovery）。セクション 7 にレガシー/A2A 比較一覧追加済み
- [x] T053 [P] Update `docs/reference/architecture/system-architecture-diagram.md` — セクション 2.2 に AgentCore Runtime/ECR を「新規 (Feature Flag)」として追加済み。セクション 2.3 に AgentCore リソース一覧（Runtime, Endpoint, ECR, IAM Role, リソースベースポリシー）追加済み
- [x] T054 Update `scripts/deploy-split-stacks.sh` — `validate_agentcore` 関数で AgentCore Runtime ACTIVE 待機（最大 120 秒、10 秒間隔ポーリング）と Agent Card 検証ステップを実装済み
- [ ] T055 Run quickstart.md validation — `specs/013-agentcore-a2a-zones/quickstart.md` の手順に従い、エンドツーエンドの動作確認とトラブルシューティング（実デプロイ環境が必要）

### Phase 7 TDD テスト

- [x] T055a [P] Create `cdk/lib/execution/agent/execution-agent/tests/test_cloudwatch_metrics.py` — CloudWatch メトリクスユニットテスト: PutMetricData 呼び出し検証、サイレントエラー検証、Dimensions 付きメトリクス、デフォルト Unit=Count、メトリクス定数定義検証、シングルトンクライアント検証 **[6 tests passed]**
- [x] T055b [P] Create `cdk/lib/verification/agent/verification-agent/tests/test_cloudwatch_metrics.py` — CloudWatch メトリクスユニットテスト: PutMetricData 呼び出し検証、サイレントエラー検証、シングルトンクライアント検証、メトリクス定数定義検証 **[4 tests passed]**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — Core A2A flow
- **US2 (Phase 4)**: Depends on US1 — Adds async processing on top of core flow
- **US3 (Phase 5)**: Depends on US1 — Adds cross-account security (independent of US2)
- **US4 (Phase 6)**: Depends on US1 — Adds Agent Discovery (independent of US2, US3)
- **Polish (Phase 7)**: Depends on US1 at minimum, ideally all user stories

### User Story Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational)
                      │
                      ├── Phase 3 (US1: Core A2A Flow) ← MVP
                      │       │
                      │       ├── Phase 4 (US2: Async Processing)
                      │       ├── Phase 5 (US3: Cross-Account Security) [P]
                      │       └── Phase 6 (US4: Agent Discovery) [P]
                      │
                      └── Phase 7 (Polish) — after desired stories complete
```

### Within Each User Story

- Agent code modules marked [P] can be copied/adapted in parallel
- `main.py` integration tasks depend on module tasks completing first
- CDK stack updates depend on construct tasks completing first
- TDD テストタスクは実装タスク完了後に作成・実行

### Parallel Opportunities

- **Phase 1**: T001-T008 — All setup tasks are independent and can run in parallel
- **Phase 2**: T009-T012 — CDK constructs for each zone are independent ([P])
- **Phase 3 (US1)**: T016-T026 — All module copy/adapt tasks are independent ([P])
- **Phase 4 (US2)**: T031-T033 — Attachment module tasks are independent ([P])
- **Phase 5/6**: Can run in parallel with each other after US1 completes
- **Phase 7**: T048-T053 — Most polish tasks are independent ([P])

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T008)
2. Complete Phase 2: Foundational CDK (T009-T015, T015a)
3. Complete Phase 3: US1 Core A2A Flow (T016-T029, T029a-T029e)
4. **STOP and VALIDATE**: Deploy with `USE_AGENTCORE=true`, test Slack → AI 回答フロー
5. If issues: Rollback with `USE_AGENTCORE=false` (zero downtime)
6. Deploy/demo if ready — **MVP achieved with 29 tasks + 5 test tasks**

### Incremental Delivery

1. Setup + Foundational → AgentCore Runtime infrastructure ready
2. US1 → Core A2A flow works → Deploy/Demo (**MVP!**)
3. US2 → Async processing for attachments → Deploy/Demo
4. US3 → Cross-account security hardening → Deploy/Demo
5. US4 → Agent Discovery for future extensibility → Deploy/Demo
6. Polish → Observability, docs, cleanup → Final release

### Rollback Strategy

At any point, setting `USE_AGENTCORE=false` on the SlackEventHandler Lambda reverts to the existing API Gateway + SQS flow. No user impact.

---

## TDD テスト結果サマリー

| テストスイート | ファイル | テスト数 | 状態 |
|---|---|---|---|
| **Execution Agent** | `tests/test_agent_card.py` | 17 | PASSED |
| **Execution Agent** | `tests/test_main.py` | 18 | PASSED |
| **Execution Agent** | `tests/test_cloudwatch_metrics.py` | 6 | PASSED |
| **Verification Agent** | `tests/test_main.py` | 15 | PASSED |
| **Verification Agent** | `tests/test_a2a_client.py` | 13 | PASSED |
| **Verification Agent** | `tests/test_cloudwatch_metrics.py` | 4 | PASSED |
| **CDK Constructs** | `test/agentcore-constructs.test.ts` | 24 | PASSED |
| **合計** | | **97** | **ALL PASSED** |

### テストカバレッジ

- **Execution Agent**: A2A メッセージ解析、非同期タスク管理、Bedrock エラーマッピング、Agent Card、CloudWatch メトリクス
- **Verification Agent**: セキュリティパイプライン（存在確認・認可・レート制限）、A2A クライアント（同期/非同期/ポーリング/バックオフ）、Slack 投稿、エラーメッセージマッピング、Agent Card、CloudWatch メトリクス
- **CDK Constructs**: AgentCore Runtime（A2A/SigV4/IAM）、クロスアカウントポリシー、SlackEventHandler Feature Flag

### TDD で発見・修正した不具合

1. `verification-agent/main.py` L132: インデントエラー修正（12 spaces → 8 spaces）
2. `verification-stack.ts`: `useAgentCore` 変数の宣言順序修正（temporal dead zone 回避）

---

## Summary

| Metric | Value |
|--------|-------|
| **Total tasks** | 67 (実装 55 + テスト 12) |
| **Phase 1 (Setup)** | 8 tasks |
| **Phase 2 (Foundational + Tests)** | 8 tasks (7 impl + 1 test) |
| **Phase 3 (US1 — MVP + Tests)** | 19 tasks (14 impl + 5 test) |
| **Phase 4 (US2 + Tests)** | 9 tasks (7 impl + 2 test) |
| **Phase 5 (US3 + Tests)** | 9 tasks (7 impl + 2 test) |
| **Phase 6 (US4 + Tests)** | 6 tasks (4 impl + 2 test) |
| **Phase 7 (Polish + Tests)** | 10 tasks (8 impl + 2 test) |
| **Completed tasks** | 66 / 67 (99%) |
| **Remaining tasks** | 1 (T055: E2E 検証 — 実デプロイ環境が必要) |
| **TDD tests total** | 97 tests — ALL PASSED |
| **Bugs found by TDD** | 2 (indent error, variable declaration order) |

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Feature Flag `USE_AGENTCORE` enables zero-downtime rollback at any phase
- Existing Lambda/API Gateway/SQS resources remain until Phase 7 cleanup (future feature)
- TDD テストは `conftest.py` で `bedrock_agentcore` SDK と `slack_sdk` をモックし、外部依存なしで実行可能
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
