# エラーハンドリング・HTTPS・PII 監査（026 Phase 2）

**Feature Branch**: `026-best-practices-alignment`
**Date**: 2026-02-11
**Purpose**: T003–T005 監査結果。AgentCore InvokeAgentRuntime ベストプラクティス準拠状況。

---

## 1. agent-invoker エラーハンドリング（T003）

**ファイル**: `cdk/lib/verification/lambda/agent-invoker/handler.py`

### 実装状況

| エラー種別 | 対応 | 詳細 |
|------------|------|------|
| **ThrottlingException** | ✓ リトライ | `_invoke_with_retry` で指数バックオフ（MAX_RETRIES=3, 1s→2s→4s） |
| **ValidationException** | ✓ 処理 | 再スロー → `lambda_handler` の `except` で捕捉 → `_log_invocation_failure` でログ → `batchItemFailures` に追加 |
| **ResourceNotFoundException** | ✓ 同上 | 同上 |
| **AccessDeniedException** | ✓ 同上 | 同上 |
| **その他 ClientError** | ✓ 同上 | 同上 |

### コード参照

- L123–163: `_invoke_with_retry` — ThrottlingException のみリトライ、他は再スロー
- L164–189: `_log_invocation_failure` — ClientError の `error_code`, `error_message`, `http_status` をログ
- L110–118: `lambda_handler` の `except` — 全例外を捕捉し `batchItemFailures` に追加

### 結論

**PASS** — AWS InvokeAgentRuntime ベストプラクティスに準拠。ThrottlingException は指数バックオフでリトライ、その他は適切にログ・失敗処理。

---

## 2. a2a_client InvokeAgentRuntime エラーハンドリング（T004）

**ファイル**: `cdk/lib/verification/agent/verification-agent/a2a_client.py`

### 実装状況

| エラー種別 | 対応 | 詳細 |
|------------|------|------|
| **ThrottlingException** | ✓ リトライ | L288–309: 指数バックオフ（3回、1s→2s→4s）でリトライ |
| **AccessDeniedException** | ✓ ハンドリング | L388–391: ユーザー向けエラーメッセージを返却 |
| **ValidationException** | ✓ ハンドリング | L399–403: 汎用エラー JSON を返却 |
| **ResourceNotFoundException** | ✓ ハンドリング | L399–403: 汎用エラー JSON を返却 |
| **その他 ClientError** | ✓ ハンドリング | L399–403: `error_code` を小文字で返却 |

### コード参照

- L52–54: リトライ定数（INVOKE_RETRY_MAX_ATTEMPTS=3, INVOKE_RETRY_BASE_DELAY=1.0, BACKOFF=2.0）
- L288–309: ThrottlingException リトライループ
- L369–403: `except ClientError` で AccessDeniedException を明示、他は汎用処理

### GetAsyncTaskResult ポーリング（L174–182）

- `ResourceNotFoundException`, `TaskNotReadyException`: ポーリング継続（タスク未準備のため）
- その他: エラー JSON を返却

### 結論

**PASS** — ThrottlingException リトライと主要エラー種別のハンドリングが実装済み。

---

## 3. Bedrock/AgentCore 呼び出し箇所と HTTPS・PII（T005）

### 呼び出し箇所一覧

| コンポーネント | ファイル | クライアント | API | 備考 |
|----------------|----------|--------------|-----|------|
| Agent Invoker Lambda | `cdk/lib/verification/lambda/agent-invoker/handler.py` | `boto3.client("bedrock-agentcore")` | `invoke_agent_runtime` | Verification Agent 呼び出し |
| Slack Event Handler | `cdk/lib/verification/lambda/slack-event-handler/handler.py` | `boto3.client("bedrock-agentcore")` | `invoke_agent_runtime` | AGENT_INVOCATION_QUEUE_URL 未設定時 |
| Verification Agent | `cdk/lib/verification/agent/verification-agent/a2a_client.py` | `boto3.client("bedrock-agentcore")` | `invoke_agent_runtime`, `get_async_task_result` | Execution Agent 呼び出し |
| Execution Agent | `cdk/lib/execution/agent/execution-agent/bedrock_client_converse.py` | `boto3.client("bedrock-runtime")` | `converse` | Bedrock Converse API |

### HTTPS

- **全クライアント**: boto3 のデフォルト設定を使用。boto3 は HTTPS をデフォルトで使用。
- **確認**: カスタム `endpoint_url` や `use_ssl=False` の指定なし。
- **結論**: ✓ 全通信は HTTPS で暗号化。

### PII

- **エージェントリソース名**: `SlackAI_VerificationAgent`, `SlackAI_ExecutionAgent` — 一般名のみ
- **ランタイム ARN**: 環境変数 `VERIFICATION_AGENT_ARN`, `EXECUTION_AGENT_ARN` から取得。ARN にユーザー PII は含まれない。
- **ペイロード**: ユーザーテキスト・添付ファイルは AI 処理用。リソース名・アクション名には含めない。
- **結論**: ✓ エージェントリソースに PII を含めていない。

---

## 4. サマリ

| タスク | 結果 | アクション |
|--------|------|------------|
| T003 agent-invoker 監査 | PASS | 変更不要 |
| T004 a2a_client 監査 | PASS | 変更不要 |
| T005 HTTPS/PII 監査 | PASS | 変更不要 |

Phase 2 監査完了。ユーザーストーリー実装（Phase 3 以降）に進む準備が整った。

---

## 5. Phase 4 検証（T010, T011）— AgentCore Runtime リトライ・エラーハンドリング

**Date**: 2026-02-11
**Purpose**: T010–T011 の AgentCore Runtime ベストプラクティス検証。

### T010: agent-invoker ThrottlingException リトライ

**検証結果**: ✓ PASS

- **ThrottlingException**: `_invoke_with_retry` で指数バックオフ（MAX_RETRIES=3, 1s→2s→4s）実装済み
- **ValidationException / ResourceNotFoundException / AccessDeniedException**: 非 ThrottlingException は再スロー → `lambda_handler` の `except` で捕捉 → `_log_invocation_failure` でログ → `batchItemFailures` に追加。リトライ不要なエラーとして適切に処理
- **変更**: 不要

### T011: a2a_client InvokeAgentRuntime リトライ

**検証結果**: ✓ PASS

- **ThrottlingException**: 指数バックオフ（3 回、1s→2s→4s）でリトライ実装済み（L288–309）
- **AccessDeniedException**: 専用ハンドリングでユーザー向けエラーメッセージを返却
- **その他 ClientError**: 汎用エラー JSON を返却
- **変更**: 不要
