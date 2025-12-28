# データモデル: スタック間通信のデュアル認証対応

**機能**: 012-api-key-auth  
**日付**: 2025-01-30  
**目的**: Verification Stack と Execution Stack の間の API Gateway 通信における IAM 認証と API キー認証のデータエンティティを定義

## エンティティ

### ExecutionRequest

**目的**: Verification Stack から Execution Stack へ API Gateway 経由で送信されるリクエストペイロード

**フィールド**:
- `channel` (string, required): メッセージを受信した Slack チャンネル ID
- `text` (string, required): Bedrock AI で処理するユーザーメッセージテキスト
- `bot_token` (string, required): レスポンスを投稿するための Slack bot OAuth トークン
- `team_id` (string, optional): Slack ワークスペースチーム ID
- `user_id` (string, optional): メッセージを送信した Slack ユーザー ID
- `response_url` (string, optional): 非同期レスポンス投稿用の Slack response_url ウェブフック URL
- `correlation_id` (string, optional): トレーシング用のリクエスト相関 ID

**検証ルール**:
- `channel` は空でない文字列である必要がある
- `text` は空でない文字列である必要がある
- `bot_token` は有効な Slack bot トークン形式である必要がある（`xoxb-` で始まる）
- `correlation_id` は提供されている場合、UUID 形式である必要がある

**例**:
```json
{
  "channel": "C01234567",
  "text": "What is the weather today?",
  "bot_token": "xoxb-EXAMPLE-TOKEN-REPLACE-WITH-ACTUAL-TOKEN",
  "team_id": "T01234567",
  "user_id": "U01234567",
  "response_url": "https://hooks.slack.com/services/TEAM/WEBHOOK/EXAMPLE",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**状態遷移**: N/A（ステートレスリクエスト）

---

### ExecutionResponse

**目的**: Execution Layer Lambda 関数からのレスポンス（API Gateway 経由）

**フィールド**:
- `statusCode` (integer, required): HTTP ステータスコード（成功時 200、エラー時 4xx/5xx）
- `body` (string, optional): レスポンスボディ（エラー時は JSON 文字列、非同期処理時は空）

**検証ルール**:
- `statusCode` は有効な HTTP ステータスコード（200-599）である必要がある
- `body` は提供されている場合、有効な JSON 文字列である必要がある

**例（成功 - 非同期処理）**:
```json
{
  "statusCode": 202,
  "body": ""
}
```

**例（エラー）**:
```json
{
  "statusCode": 400,
  "body": "{\"error\": \"Missing required field: channel\"}"
}
```

**状態遷移**: N/A（ステートレスレスポンス）

---

### AuthenticatedRequest (IAM 認証)

**目的**: IAM 認証を使用した API Gateway への HTTP リクエスト

**フィールド**:
- `method` (string, required): HTTP メソッド（POST）
- `url` (string, required): API Gateway エンドポイント URL
- `headers` (object, required): AWS Signature Version 4 ヘッダーを含む HTTP ヘッダー
  - `Authorization` (string, required): AWS SigV4 認証ヘッダー
  - `X-Amz-Date` (string, required): ISO 8601 形式のリクエストタイムスタンプ
  - `Content-Type` (string, required): `application/json`
  - `Host` (string, required): API Gateway ホスト名
- `body` (string, required): JSON エンコードされた ExecutionRequest ペイロード

**検証ルール**:
- `method` は "POST" である必要がある
- `url` は有効な API Gateway エンドポイント URL である必要がある
- `headers.Authorization` は有効な AWS SigV4 認証ヘッダー形式である必要がある
- `headers.X-Amz-Date` は有効な ISO 8601 タイムスタンプである必要がある
- `body` は有効な JSON 文字列である必要がある

**例**:
```http
POST /prod/execute HTTP/1.1
Host: abc123xyz.execute-api.ap-northeast-1.amazonaws.com
Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20250130/ap-northeast-1/execute-api/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=...
X-Amz-Date: 20250130T120000Z
Content-Type: application/json

{"channel":"C01234567","text":"Hello","bot_token":"xoxb-..."}
```

**状態遷移**: N/A（ステートレスリクエスト）

---

### AuthenticatedRequest (API キー認証)

**目的**: API キー認証を使用した API Gateway への HTTP リクエスト

**フィールド**:
- `method` (string, required): HTTP メソッド（POST）
- `url` (string, required): API Gateway エンドポイント URL
- `headers` (object, required): API キーヘッダーを含む HTTP ヘッダー
  - `x-api-key` (string, required): API Gateway API キー
  - `Content-Type` (string, required): `application/json`
  - `Host` (string, required): API Gateway ホスト名
- `body` (string, required): JSON エンコードされた ExecutionRequest ペイロード

**検証ルール**:
- `method` は "POST" である必要がある
- `url` は有効な API Gateway エンドポイント URL である必要がある
- `headers.x-api-key` は有効な API Gateway API キーである必要がある
- `body` は有効な JSON 文字列である必要がある

**例**:
```http
POST /prod/execute HTTP/1.1
Host: abc123xyz.execute-api.ap-northeast-1.amazonaws.com
x-api-key: abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
Content-Type: application/json

{"channel":"C01234567","text":"Hello","bot_token":"xoxb-..."}
```

**状態遷移**: N/A（ステートレスリクエスト）

---

### AuthenticationConfiguration

**目的**: 認証方法の設定

**フィールド**:
- `auth_method` (string, required): 認証方法（'iam' または 'api_key'）
- `api_key_secret_name` (string, optional): API キーが保存されている Secrets Manager のシークレット名（`auth_method` が 'api_key' の場合に必須）
- `api_gateway_url` (string, required): API Gateway エンドポイント URL

**検証ルール**:
- `auth_method` は 'iam' または 'api_key' である必要がある
- `api_key_secret_name` は `auth_method` が 'api_key' の場合に必須
- `api_gateway_url` は有効な URL である必要がある

**例（IAM 認証）**:
```json
{
  "auth_method": "iam",
  "api_gateway_url": "https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod"
}
```

**例（API キー認証）**:
```json
{
  "auth_method": "api_key",
  "api_key_secret_name": "execution-api-key",
  "api_gateway_url": "https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod"
}
```

**状態遷移**: N/A（設定エンティティ）

---

### APIKeySecret

**目的**: AWS Secrets Manager に保存された API キー

**フィールド**:
- `api_key` (string, required): API Gateway API キー値
- `created_at` (string, optional): API キー作成日時（ISO 8601 形式）
- `expires_at` (string, optional): API キー有効期限（ISO 8601 形式、オプション）

**検証ルール**:
- `api_key` は空でない文字列である必要がある
- `created_at` は提供されている場合、有効な ISO 8601 タイムスタンプである必要がある
- `expires_at` は提供されている場合、有効な ISO 8601 タイムスタンプである必要がある

**例**:
```json
{
  "api_key": "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
  "created_at": "2025-01-30T12:00:00Z",
  "expires_at": "2026-01-30T12:00:00Z"
}
```

**セキュリティ考慮事項**:
- API キーは Secrets Manager に暗号化されて保存される
- API キーはログ、エラーメッセージ、コードに露出しない（FR-011）
- API キーは実行時にのみ取得され、メモリに保持される

**状態遷移**: N/A（シークレットエンティティ）

---

### AuthenticationError

**目的**: API Gateway からの認証失敗時のエラーレスポンス

**フィールド**:
- `statusCode` (integer, required): HTTP ステータスコード（403 Forbidden）
- `body` (string, required): エラーメッセージボディ
- `headers` (object, optional): レスポンスヘッダー
  - `x-amzn-ErrorType` (string, optional): AWS エラータイプ
  - `x-amzn-RequestId` (string, optional): デバッグ用のリクエスト ID

**検証ルール**:
- `statusCode` は認証失敗時は 403 である必要がある
- `body` はエラーメッセージを含む必要がある

**例（IAM 認証失敗）**:
```json
{
  "statusCode": 403,
  "body": "{\"message\": \"User: arn:aws:iam::123456789012:role/verification-lambda-role is not authorized to perform: execute-api:Invoke on resource: arn:aws:execute-api:ap-northeast-1:123456789012:abc123xyz/prod/execute\"}",
  "headers": {
    "x-amzn-ErrorType": "AccessDeniedException",
    "x-amzn-RequestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**例（API キー認証失敗）**:
```json
{
  "statusCode": 403,
  "body": "{\"message\": \"Forbidden\"}",
  "headers": {
    "x-amzn-ErrorType": "ForbiddenException",
    "x-amzn-RequestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**状態遷移**: N/A（エラーレスポンス）

---

## 関係

```
Verification Layer
    |
    | (reads)
    v
AuthenticationConfiguration
    |
    | (determines)
    v
[IAM Auth] OR [API Key Auth]
    |
    | (creates)
    v
AuthenticatedRequest (IAM or API Key)
    |
    | (contains)
    v
ExecutionRequest
    |
    | (sent via)
    v
API Gateway (IAM or API Key authenticated)
    |
    | (invokes)
    v
Execution Layer Lambda
    |
    | (returns)
    v
ExecutionResponse

[API Key Auth path]
    |
    | (retrieves from)
    v
Secrets Manager
    |
    | (contains)
    v
APIKeySecret
```

## データフロー

### IAM 認証フロー

1. **Verification Layer** が Slack イベントを受信し、検証
2. **Verification Layer** が `ExecutionRequest` ペイロードを作成
3. **Verification Layer** が IAM 資格情報でリクエストに署名して `AuthenticatedRequest` を作成
4. **API Gateway** が IAM 認証を検証し、`ExecutionRequest` を Execution Layer に転送
5. **Execution Layer** がリクエストを処理し、`ExecutionResponse` を返す（非同期応答）
6. **Verification Layer** が `ExecutionResponse` を受信し、結果をログに記録

### API キー認証フロー

1. **Verification Layer** が Slack イベントを受信し、検証
2. **Verification Layer** が `AuthenticationConfiguration` を読み取り、認証方法を決定
3. **Verification Layer** が Secrets Manager から `APIKeySecret` を取得（API キー認証の場合）
4. **Verification Layer** が `ExecutionRequest` ペイロードを作成
5. **Verification Layer** が API キーを含む `AuthenticatedRequest` を作成
6. **API Gateway** が API キー認証を検証し、`ExecutionRequest` を Execution Layer に転送
7. **Execution Layer** がリクエストを処理し、`ExecutionResponse` を返す（非同期応答）
8. **Verification Layer** が `ExecutionResponse` を受信し、結果をログに記録

## 制約

- リクエストペイロードサイズ: ≤256 KB（API Gateway 制限）
- レスポンスペイロードサイズ: ≤10 MB（API Gateway 制限）
- リクエストタイムアウト: 29 秒（API Gateway 制限、ただし Execution Layer は非同期処理）
- 認証: AWS Signature Version 4（IAM 認証）または API キー（API キー認証）
- Content-Type: `application/json` 必須
- API キー取得のオーバーヘッド: ≤100ms（仕様の仮定に基づく）

## 移行に関する注意事項

- 既存のペイロード構造（直接 Lambda 呼び出し）は保持される
- Execution Layer Lambda ハンドラーインターフェースへの変更は不要
- API Gateway Lambda プロキシ統合は後方互換性を維持
- IAM 認証はデフォルトで使用される（API キー認証が設定されていない場合）
- API キー認証は設定により有効化される（既存の IAM 認証に影響しない）

