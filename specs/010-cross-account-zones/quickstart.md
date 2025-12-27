# Quickstart: Cross-Account Zones Architecture

**Feature**: 010-cross-account-zones  
**Date**: 2025-12-27

## 概要

本ガイドでは、Verification Stack と Execution Stack を分離してデプロイする手順を説明します。

## 前提条件

- AWS CLI がインストール・設定済み
- Node.js 18+ がインストール済み
- AWS CDK 2.x がインストール済み
- Slack Bot Token と Signing Secret が取得済み

## クイックスタート（同一アカウント）

### Step 1: 環境変数の設定

```bash
# 必須の環境変数
export SLACK_BOT_TOKEN="xoxb-your-bot-token"
export SLACK_SIGNING_SECRET="your-signing-secret"

# オプション（デフォルト: ap-northeast-1）
export AWS_REGION="ap-northeast-1"
```

### Step 2: Execution Stack のデプロイ

```bash
cd cdk

# 依存関係のインストール
npm install

# Execution Stack をデプロイ
npx cdk deploy SlackAI-Execution

# 出力から API URL を取得
# Outputs:
#   SlackAI-Execution.ExecutionApiUrl = https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod/
```

API URL をメモしておきます。

### Step 3: Verification Stack のデプロイ

```bash
# Execution API URL を環境変数に設定
export EXECUTION_API_URL="https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod/"

# Verification Stack をデプロイ
npx cdk deploy SlackAI-Verification

# 出力から Function URL と Lambda ロール ARN を取得
# Outputs:
#   SlackAI-Verification.SlackEventHandlerUrl = https://xxxxxxxxxx.lambda-url.ap-northeast-1.on.aws/
#   SlackAI-Verification.VerificationLambdaRoleArn = arn:aws:iam::123456789012:role/...
```

### Step 4: Execution Stack の更新（リソースポリシー設定）

```bash
# Verification Lambda ロール ARN を環境変数に設定
export VERIFICATION_LAMBDA_ROLE_ARN="arn:aws:iam::123456789012:role/..."

# Execution Stack を更新
npx cdk deploy SlackAI-Execution
```

### Step 5: Slack アプリの設定

1. [Slack API](https://api.slack.com/apps) で Event Subscriptions を設定
2. Request URL に Step 3 で取得した Function URL を設定
3. 必要なイベントをサブスクライブ

## デプロイコマンドまとめ

```bash
# 全スタックをデプロイ（推奨順序）
npx cdk deploy SlackAI-Execution
npx cdk deploy SlackAI-Verification
npx cdk deploy SlackAI-Execution  # リソースポリシー更新

# 個別スタックの更新
npx cdk deploy SlackAI-Verification  # Verification のみ更新
npx cdk deploy SlackAI-Execution     # Execution のみ更新

# スタックの削除（逆順）
npx cdk destroy SlackAI-Verification
npx cdk destroy SlackAI-Execution
```

## 設定オプション

### CDK コンテキスト（cdk.json）

```json
{
  "context": {
    "awsRegion": "ap-northeast-1",
    "bedrockModelId": "amazon.nova-pro-v1:0",

    // クロスアカウント設定（将来用）
    "verificationAccountId": "123456789012",
    "executionAccountId": "123456789012"
  }
}
```

### 環境変数

| 変数名                        | 必須  | 説明                                                       |
| ----------------------------- | ----- | ---------------------------------------------------------- |
| SLACK_BOT_TOKEN               | Yes   | Slack Bot OAuth Token                                      |
| SLACK_SIGNING_SECRET          | Yes   | Slack Signing Secret                                       |
| EXECUTION_API_URL             | Yes\* | Execution API の URL（Verification Stack デプロイ時）      |
| VERIFICATION_LAMBDA_ROLE_ARN  | No    | Verification Lambda のロール ARN（Execution Stack 更新時） |
| AWS_REGION                    | No    | AWS リージョン（デフォルト: ap-northeast-1）               |
| ENABLE_API_GATEWAY_MONITORING | No    | API Gateway モニタリングの有効化                           |

## トラブルシューティング

### API Gateway 403 エラー

```
AccessDeniedException: User is not authorized to access this resource
```

**原因**: Execution Stack のリソースポリシーに Verification Lambda のロール ARN が設定されていない

**解決策**:

1. `VERIFICATION_LAMBDA_ROLE_ARN` を設定
2. `npx cdk deploy SlackAI-Execution` で更新

### Verification Stack デプロイエラー

```
Error: EXECUTION_API_URL environment variable is required
```

**原因**: Execution API URL が設定されていない

**解決策**:

1. 先に Execution Stack をデプロイ
2. 出力から API URL を取得
3. `EXECUTION_API_URL` を設定してから Verification Stack をデプロイ

## 既存スタックからの移行

既存の単一スタック（SlackBedrockStack）から分離スタック構成への移行は、以下の手順で行います：

1. 既存スタックはそのまま維持
2. 新しい分離スタックを並行してデプロイ
3. Slack アプリの Request URL を新しい Function URL に変更
4. 動作確認後、既存スタックを削除

**注意**: このプロジェクトは現在、2つの独立したスタック（VerificationStack + ExecutionStack）を標準として使用しています。単一スタック（SlackBedrockStack）はコードベースから削除されました。
