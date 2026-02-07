# Data Model: AgentCore A2A ゾーン間通信

**Branch**: `013-agentcore-a2a-zones` | **Date**: 2026-02-07

---

## 1. エンティティ一覧

### 1.1 AgentCore Runtime（各ゾーンに 1 つ）

| フィールド | 型 | 説明 | 制約 |
|-----------|------|------|------|
| AgentRuntimeName | string | エージェントの論理名 | `[a-zA-Z][a-zA-Z0-9_]{0,47}` |
| AgentRuntimeArn | string | AWS ARN | `arn:aws:bedrock-agentcore:{region}:{account}:runtime/{name}` |
| AgentRuntimeId | string | 一意識別子 | 自動生成 |
| ProtocolConfiguration | enum | 通信プロトコル | `A2A` |
| ContainerUri | string | ECR イメージ URI | `{account}.dkr.ecr.{region}.amazonaws.com/{repo}:{tag}` |
| RoleArn | string | 実行ロール ARN | IAM ロール |
| NetworkMode | enum | ネットワークモード | `PUBLIC` |
| AuthorizerType | enum | 認証方式 | `SIGV4` |
| Status | enum | ランタイムステータス | `CREATING` / `ACTIVE` / `FAILED` / `DELETING` |

### 1.2 AgentCore Endpoint

| フィールド | 型 | 説明 | 制約 |
|-----------|------|------|------|
| EndpointName | string | エンドポイント名 | `DEFAULT` または カスタム名 |
| AgentRuntimeVersion | string | バージョン参照 | Version ID |
| EndpointUrl | string | 呼び出し URL | `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{arn}/invocations/` |
| Status | enum | エンドポイントステータス | `CREATING` / `ACTIVE` / `FAILED` |

### 1.3 Agent Card（各エージェント）

| フィールド | 型 | 説明 | 制約 |
|-----------|------|------|------|
| name | string | エージェント名 | 必須 |
| description | string | エージェントの説明 | 必須 |
| version | string | バージョン | セマンティックバージョニング |
| url | string | サービスエンドポイント URL | AgentCore Runtime エンドポイント |
| protocolVersion | string | A2A プロトコルバージョン | `0.3.0` |
| preferredTransport | enum | トランスポート方式 | `JSONRPC` |
| capabilities | object | 能力（streaming 等） | `{ "streaming": false }` |
| defaultInputModes | array | 入力モード | `["text"]` |
| defaultOutputModes | array | 出力モード | `["text"]` |
| skills | array | スキル一覧 | Skill オブジェクト配列 |

### 1.4 A2A Message（JSON-RPC 2.0）

| フィールド | 型 | 説明 | 制約 |
|-----------|------|------|------|
| jsonrpc | string | プロトコルバージョン | `"2.0"` |
| id | string | リクエスト ID（相関 ID） | UUID v4 |
| method | string | メソッド名 | `"message/send"` |
| params.message.role | string | メッセージロール | `"user"` / `"agent"` |
| params.message.parts | array | メッセージ部品 | Part オブジェクト配列 |
| params.message.messageId | string | メッセージ ID | UUID v4 |

### 1.5 A2A Task Payload（Verification → Execution）

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| channel | string | ✅ | Slack チャンネル ID |
| text | string | ✅ | ユーザーメッセージテキスト |
| bot_token | string | ✅ | Slack Bot Token（スレッド履歴取得・添付ダウンロード用） |
| thread_ts | string | - | スレッド返信用タイムスタンプ |
| attachments | array | - | 添付ファイルメタデータ配列 |
| correlation_id | string | ✅ | 相関 ID（トレース用） |
| team_id | string | ✅ | Slack ワークスペース ID |
| user_id | string | ✅ | Slack ユーザー ID |

### 1.6 A2A Task Result（Execution → Verification）

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| status | enum | ✅ | `"success"` / `"error"` |
| channel | string | ✅ | 投稿先チャンネル ID |
| thread_ts | string | - | スレッド返信用タイムスタンプ |
| correlation_id | string | - | 相関 ID |
| bot_token | string | ✅ | Slack API 投稿用 Bot Token |
| response_text | string | success 時 | AI 生成テキスト |
| error_code | string | error 時 | エラーコード |
| error_message | string | error 時 | ユーザー向けエラーメッセージ |

### 1.7 AgentCore Session

| フィールド | 型 | 説明 | 制約 |
|-----------|------|------|------|
| runtimeSessionId | string | セッション識別子 | 33 文字以上、自動生成または指定 |
| status | enum | セッションステータス | `Healthy` / `HealthyBusy` |
| maxDuration | duration | 最大実行時間 | 8 時間 |
| idleTimeout | duration | アイドルタイムアウト | 15 分 |

---

## 2. エンティティ関係

```
┌─────────────────┐         ┌─────────────────┐
│ Verification     │  A2A    │ Execution        │
│ Agent Runtime    │────────▶│ Agent Runtime    │
│ (Account A)      │ SigV4   │ (Account B)      │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ has                       │ has
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│ Verification     │         │ Execution        │
│ Agent Endpoint   │         │ Agent Endpoint   │
│ (DEFAULT)        │         │ (DEFAULT)        │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ publishes                 │ publishes
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│ Agent Card       │         │ Agent Card       │
│ (Verification)   │         │ (Execution)      │
└─────────────────┘         └─────────────────┘
```

---

## 3. 既存エンティティ（変更なし）

以下の DynamoDB テーブルは既存のまま維持。AgentCore エージェントから直接アクセスする:

| テーブル名 | PK | SK | TTL | 用途 |
|-----------|-----|-----|-----|------|
| slack-workspace-tokens | team_id | - | - | Bot Token 保管 |
| slack-event-dedupe | event_id | - | expire_at | イベント重複排除 |
| slack-existence-check-cache | cache_key | - | expire_at | Existence Check キャッシュ |
| slack-whitelist-config | entity_type | entity_id | - | ホワイトリスト設定 |
| slack-rate-limit | rate_key | - | expire_at | レート制限 |

---

## 4. 削除予定エンティティ（フェーズ 2 以降）

| リソース | 理由 |
|---------|------|
| ExecutionApi (API Gateway REST API) | AgentCore A2A 通信に置き換え |
| ExecutionResponseQueue (SQS) | AgentCore の A2A 非同期レスポンスに置き換え |
| ExecutionResponseDlq (SQS DLQ) | 同上 |
| API キー (Secrets Manager) | SigV4 認証に置き換え |
| SlackResponseHandler (Lambda) | Verification Agent に Slack 投稿ロジックを統合 |

---

## 5. 状態遷移

### 5.1 A2A リクエスト処理フロー

```
[Slack Event Received]
        │
        ▼
[SlackEventHandler Lambda]
  ├── 署名検証 → 失敗: 401
  ├── Existence Check → 失敗: 403
  ├── ホワイトリスト → 失敗: 403
  ├── レート制限 → 超過: 429
  ├── リアクション（👀）追加
  └── InvokeAgentRuntime(Verification Agent)
        │
        ▼
[Verification Agent (A2A Server)]
  ├── A2A message/send → Execution Agent
  │     │
  │     ▼
  │   [Execution Agent (A2A Server)]
  │     ├── add_async_task("bedrock_processing")
  │     ├── → 即時 A2A レスポンス（accepted）
  │     ├── [Background Thread]
  │     │     ├── Bedrock Converse API 呼び出し
  │     │     ├── 添付ファイル処理
  │     │     ├── complete_async_task(task_id)
  │     │     └── A2A callback → Verification Agent
  │     └── /ping → HealthyBusy → Healthy
  │
  ├── A2A レスポンス受信（result with artifacts）
  ├── Slack API chat.postMessage（thread_ts）
  └── リアクション（✅）更新
```

### 5.2 AgentCore Session ライフサイクル

```
[Created] → [Healthy] → [HealthyBusy] → [Healthy] → ... → [Idle 15min] → [Terminated]
                                                              ↑
                                                    新リクエスト → [Created]（新セッション）
```
