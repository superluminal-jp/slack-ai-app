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

## IAM 認証パターン

### 1. Verification Stack (Account A) の IAM 設定

SlackEventHandler Lambda には、Execution API を呼び出すための IAM ポリシーが付与されています：

```json
{
  "Effect": "Allow",
  "Action": "execute-api:Invoke",
  "Resource": "arn:aws:execute-api:REGION:ACCOUNT_B:API_ID/*"
}
```

Lambda は AWS SDK を使用して SigV4 署名付きリクエストを送信します。

### 2. Execution Stack (Account B) の Resource Policy

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

### 3. 認証フロー

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

## デプロイフロー

### Phase 1: Execution Stack のデプロイ

```bash
# cdk.json の設定
{
  "context": {
    "deploymentMode": "split"
  }
}

# デプロイ
npx cdk deploy SlackAI-Execution

# 出力から API URL と API ARN を取得
```

### Phase 2: Verification Stack のデプロイ

```bash
# cdk.json に API URL を設定
{
  "context": {
    "executionApiUrl": "https://xxx.execute-api.ap-northeast-1.amazonaws.com/prod/"
  }
}

# デプロイ
npx cdk deploy SlackAI-Verification

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

### cdk.json

```json
{
  "context": {
    "deploymentMode": "cross-account",
    "verificationAccountId": "111111111111",
    "executionAccountId": "222222222222"
  }
}
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

