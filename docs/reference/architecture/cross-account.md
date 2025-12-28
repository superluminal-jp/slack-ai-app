# クロスアカウントアーキテクチャ

## 概要

Slack AI アプリケーションは、Verification Zone（検証層）と Execution Zone（実行層）を異なる AWS アカウントにデプロイ可能な設計になっています。この文書では、クロスアカウント通信のアーキテクチャと IAM 認証パターンについて説明します。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ Account A (Verification Zone)                                │
│                                                              │
│  Slack → Function URL → SlackEventHandler Lambda            │
│                              │                               │
│                              ├─→ DynamoDB (5 tables)        │
│                              └─→ Secrets Manager            │
│                                                              │
│  IAM Role: SlackEventHandlerRole                            │
│    └─→ execute-api:Invoke (Account B API)                   │
└──────────────────────────────┼──────────────────────────────┘
                               │ HTTPS + SigV4 署名
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ Account B (Execution Zone)                                   │
│                                                              │
│  API Gateway (Resource Policy)                               │
│    └─→ Allow: Account A / SlackEventHandlerRole             │
│                              │                               │
│                              ↓                               │
│  BedrockProcessor Lambda → Bedrock API                      │
└─────────────────────────────────────────────────────────────┘
```

## 認証パターン（デュアル認証: IAM と API キー）

Execution API は IAM 認証と API キー認証の両方をサポートしています。デフォルトは API キー認証です。

### 1. IAM 認証パターン

#### 1.1 Verification Stack (Account A) の IAM 設定

SlackEventHandler Lambda には、Execution API を呼び出すための IAM ポリシーが付与されています：

```json
{
  "Effect": "Allow",
  "Action": "execute-api:Invoke",
  "Resource": "arn:aws:execute-api:REGION:ACCOUNT_B:API_ID/*"
}
```

Lambda は AWS SDK を使用して SigV4 署名付きリクエストを送信します。

#### 1.2 Execution Stack (Account B) の Resource Policy（IAM認証用）

API Gateway には、特定の IAM ロールからのアクセスのみを許可するリソースポリシーが設定されています：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_A:role/SlackEventHandlerRole"
      },
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:REGION:ACCOUNT_B:API_ID/*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalAccount": "ACCOUNT_A"
        }
      }
    }
  ]
}
```

#### 1.3 IAM 認証フロー

```
1. Slack → SlackEventHandler Lambda
2. Lambda が IAM ロールを使用して SigV4 署名を生成
3. SigV4 署名付き HTTPS リクエストを Execution API に送信
4. API Gateway がリソースポリシーを検証
   - Principal (IAM ロール ARN) をチェック
   - アカウント ID をチェック（オプション）
5. 検証成功 → BedrockProcessor Lambda を呼び出し
6. 検証失敗 → 403 Forbidden を返却
```

### 2. API キー認証パターン（デフォルト）

#### 2.1 Verification Stack (Account A) の設定

SlackEventHandler Lambda には、Secrets Manager から API キーを取得する権限が付与されています：

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT_A:secret:execution-api-key*"
}
```

Lambda は環境変数 `EXECUTION_API_AUTH_METHOD=api_key` で API キー認証を使用するように設定されています。

#### 2.2 Execution Stack (Account B) の Resource Policy（APIキー認証用）

API Gateway には、API キー認証を許可するリソースポリシーが設定されています：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:REGION:ACCOUNT_B:API_ID/*"
    }
  ]
}
```

API キーの検証は API Gateway のメソッドレベル（`apiKeyRequired: true`）で行われます。

#### 2.3 API キー認証フロー

```
1. Slack → SlackEventHandler Lambda
2. Lambda が Secrets Manager から API キーを取得
3. `x-api-key` ヘッダーに API キーを含めて HTTPS リクエストを送信
4. API Gateway が API キーを検証（使用量プランと関連付け）
5. 検証成功 → BedrockProcessor Lambda を呼び出し
6. 検証失敗 → 403 Forbidden を返却
```

### 3. 認証方法の選択

認証方法は環境変数 `EXECUTION_API_AUTH_METHOD` で制御されます：

- `iam`: IAM認証を使用（既存の動作）
- `api_key`: APIキー認証を使用（デフォルト）

API キー認証を使用する場合、`EXECUTION_API_KEY_SECRET_NAME` 環境変数で Secrets Manager のシークレット名を指定します（デフォルト: `execution-api-key`）。

## デプロイフロー

### Phase 1: Execution Stack のデプロイ

```bash
# デプロイ環境を設定
export DEPLOYMENT_ENV=dev  # または 'prod'

# デプロイ
npx cdk deploy SlackAI-Execution-Dev

# 出力から API URL と API ARN を取得
```

### Phase 2: Verification Stack のデプロイ

```bash
# 設定ファイル (cdk.config.{env}.json) に API URL を設定
# または --context で指定
npx cdk deploy SlackAI-Verification-Dev \
  --context executionApiUrl=https://xxx.execute-api.ap-northeast-1.amazonaws.com/prod/

# 出力から Lambda ロール ARN を取得
```

### Phase 3: Execution Stack の更新

```bash
# cdk.config.{env}.json に Lambda ロール ARN と SQS キュー URL を設定
{
  "verificationLambdaRoleArn": "arn:aws:iam::123456789012:role/...",
  "executionResponseQueueUrl": "https://sqs.ap-northeast-1.amazonaws.com/123456789012/slackai-verification-dev-execution-response-queue"
}

# 再デプロイ（リソースポリシーとSQS送信権限を更新）
npx cdk deploy SlackAI-Execution-Dev
```

**注意**: `executionResponseQueueUrl` が設定されている場合、`ExecutionStack` は自動的に `BedrockProcessor` Lambda ロールに SQS 送信権限を追加します。

## クロスアカウント設定

異なる AWS アカウントにデプロイする場合の追加設定：

### 設定ファイル (cdk.config.{env}.json)

```json
{
  "verificationAccountId": "111111111111",
  "executionAccountId": "222222222222"
}
```

または、コマンドラインで指定：

```bash
npx cdk deploy SlackAI-Execution-Dev \
  --context verificationAccountId=111111111111 \
  --context executionAccountId=222222222222
```

### AWS 認証情報

各アカウントへのデプロイには、適切な AWS 認証情報が必要です：

```bash
# Account A (Verification)
export AWS_PROFILE=account-a
npx cdk deploy SlackAI-Verification

# Account B (Execution)
export AWS_PROFILE=account-b
npx cdk deploy SlackAI-Execution
```

## セキュリティ考慮事項

### 最小権限の原則

- Verification Lambda には `execute-api:Invoke` 権限のみ付与
- API Gateway リソースポリシーは特定のロール ARN のみを許可
- アカウント ID 条件でさらにスコープを制限

### 監査

- CloudTrail で API Gateway 呼び出しを記録
- CloudWatch Logs で Lambda 実行を記録
- 相関 ID でリクエストをトレース可能

### 障害対応

- Execution API が利用不可の場合、Verification Lambda はタイムアウトを適切に処理
- ユーザーには「サービス一時停止中」のメッセージを返却
- CloudWatch アラームで障害を検知

## トラブルシューティング

### 403 Forbidden エラー

1. **リソースポリシーを確認**
   - `verificationLambdaRoleArn` が正しく設定されているか
   - Execution Stack を再デプロイしたか

2. **IAM ポリシーを確認**
   - Verification Lambda に `execute-api:Invoke` 権限があるか
   - リソース ARN が正しいか

3. **アカウント ID を確認**
   - クロスアカウントの場合、`verificationAccountId` が正しいか

### タイムアウトエラー

1. **API Gateway URL を確認**
   - `executionApiUrl` が正しく設定されているか
   - URL が有効でアクセス可能か

2. **ネットワーク設定を確認**
   - VPC 設定がある場合、NAT Gateway が設定されているか

## 関連ドキュメント

- [アーキテクチャ概要](./overview.md) - システム全体のアーキテクチャ
- [セキュリティ要件](../security/requirements.md) - セキュリティ要件の詳細
- [CDK README](../../../cdk/README.md) - デプロイ手順

