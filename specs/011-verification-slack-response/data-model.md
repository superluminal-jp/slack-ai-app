# Data Model: Verification Zone Slack Response Handling

**Feature**: 011-verification-slack-response  
**Date**: 2025-01-30  
**Purpose**: 実行ゾーンから検証ゾーンへのレスポンスと、検証ゾーンでの Slack 投稿処理のデータモデルを定義

## Entities

### ExecutionResponse

**Purpose**: 実行ゾーンから検証ゾーンに返されるレスポンス（SQS メッセージ経由）

**Fields**:
- `status` (string, required): レスポンスステータス（"success" または "error"）
- `channel` (string, required): Slack チャンネル ID（Slack 投稿に必要）
- `thread_ts` (string, optional): スレッドタイムスタンプ（スレッド返信に必要）
- `correlation_id` (string, optional): リクエスト相関 ID（トレーシング用）
- `bot_token` (string, required): Slack bot OAuth トークン（検証ゾーンが Slack API に投稿する際に必要）
- `response_text` (string, optional): AI 生成レスポンステキスト（成功時）
- `error_code` (string, optional): エラーコード（エラー時、例: "bedrock_timeout", "bedrock_throttling"）
- `error_message` (string, optional): ユーザーフレンドリーなエラーメッセージ（エラー時）

**Validation Rules**:
- `status` は "success" または "error" のいずれかでなければならない
- `status` が "success" の場合、`response_text` は必須
- `status` が "error" の場合、`error_code` と `error_message` は必須
- `channel` は非空文字列でなければならない
- `bot_token` は有効な Slack bot トークン形式（`xoxb-` で始まる）でなければならない
- `correlation_id` は UUID 形式（提供されている場合）

**Example (Success)**:
```json
{
  "status": "success",
  "channel": "C01234567",
  "thread_ts": "1234567890.123456",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "bot_token": "xoxb-EXAMPLE-TOKEN-REPLACE-WITH-ACTUAL-TOKEN",
  "response_text": "AI generated response text here..."
}
```

**Example (Error)**:
```json
{
  "status": "error",
  "channel": "C01234567",
  "thread_ts": "1234567890.123456",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "bot_token": "xoxb-EXAMPLE-TOKEN-REPLACE-WITH-ACTUAL-TOKEN",
  "error_code": "bedrock_timeout",
  "error_message": "Sorry, the AI service is taking longer than usual. Please try again in a moment."
}
```

**State Transitions**: N/A (stateless response)

---

### SQSMessage

**Purpose**: SQS キューに送信される ExecutionResponse のラッパー

**Fields**:
- `MessageBody` (string, required): JSON エンコードされた ExecutionResponse
- `MessageAttributes` (object, optional): メッセージ属性（相関 ID など）

**Validation Rules**:
- `MessageBody` は有効な JSON 文字列でなければならない
- `MessageBody` は ExecutionResponse のバリデーションルールに準拠しなければならない

**Example**:
```json
{
  "MessageBody": "{\"status\":\"success\",\"channel\":\"C01234567\",\"thread_ts\":\"1234567890.123456\",\"correlation_id\":\"550e8400-e29b-41d4-a716-446655440000\",\"bot_token\":\"xoxb-...\",\"response_text\":\"AI response...\"}",
  "MessageAttributes": {
    "correlation_id": {
      "StringValue": "550e8400-e29b-41d4-a716-446655440000",
      "DataType": "String"
    }
  }
}
```

**State Transitions**: N/A (SQS メッセージ)

---

### SlackPostRequest

**Purpose**: 検証ゾーンが Slack API に投稿する際のリクエスト

**Fields**:
- `channel` (string, required): Slack チャンネル ID
- `text` (string, required): 投稿するメッセージテキスト
- `thread_ts` (string, optional): スレッドタイムスタンプ（スレッド返信の場合）
- `bot_token` (string, required): Slack bot OAuth トークン

**Validation Rules**:
- `channel` は非空文字列でなければならない
- `text` は非空文字列でなければならない（最大 4000 文字、Slack の制限）
- `bot_token` は有効な Slack bot トークン形式でなければならない

**Example**:
```json
{
  "channel": "C01234567",
  "text": "AI generated response text here...",
  "thread_ts": "1234567890.123456",
  "bot_token": "xoxb-EXAMPLE-TOKEN-REPLACE-WITH-ACTUAL-TOKEN"
}
```

**State Transitions**: N/A (stateless request)

---

## Relationships

```
Execution Zone (BedrockProcessor)
    |
    | (creates after Bedrock API call)
    v
ExecutionResponse
    |
    | (wraps in)
    v
SQSMessage
    |
    | (sends to)
    v
SQS Queue (execution-response-queue)
    |
    | (triggers)
    v
Verification Zone (slack-response-handler Lambda)
    |
    | (extracts)
    v
ExecutionResponse
    |
    | (converts to)
    v
SlackPostRequest
    |
    | (posts to)
    v
Slack API (chat.postMessage)
```

## Data Flow

1. **Execution Zone** が Bedrock API を呼び出し、AI レスポンスを生成
2. **Execution Zone** が `ExecutionResponse` を作成（成功時は `response_text`、エラー時は `error_code` と `error_message`）
3. **Execution Zone** が `ExecutionResponse` を JSON エンコードし、SQS キューに送信
4. **SQS キュー** がメッセージを受信し、`slack-response-handler` Lambda 関数をトリガー
5. **Verification Zone** (`slack-response-handler`) が SQS メッセージから `ExecutionResponse` を抽出
6. **Verification Zone** が `ExecutionResponse` を `SlackPostRequest` に変換
7. **Verification Zone** が Slack API (`chat.postMessage`) に投稿

## Constraints

- **SQS メッセージサイズ**: ≤256 KB（SQS の制限）
- **Slack メッセージサイズ**: ≤4000 文字（Slack の制限、必要に応じて分割投稿）
- **SQS 可視性タイムアウト**: 30 秒（Bedrock API 呼び出し時間を考慮）
- **Lambda タイムアウト**: 30 秒（Slack API 呼び出し時間を考慮）
- **SQS メッセージ保持期間**: 14 日（デフォルト）

## Migration Notes

- 既存の `ExecutionRequest` 形式（検証ゾーンから実行ゾーンへのリクエスト）は変更なし
- 実行ゾーンからのレスポンス形式は新規（既存の `ExecutionResponse` 形式から拡張）
- 検証ゾーンは新しい Lambda 関数（`slack-response-handler`）を追加
- 実行ゾーンは既存の `post_to_slack()` 呼び出しを削除し、SQS 送信に置き換え

