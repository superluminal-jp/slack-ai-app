# 単一スタックから分離スタック構成への移行ガイド

## 概要

このガイドでは、既存の単一スタック構成（SlackBedrockStack）から新しい分離スタック構成（ExecutionStack + VerificationStack）への移行手順を説明します。

## 前提条件

- 既存の SlackBedrockStack がデプロイ済み
- AWS CLI が設定済み
- Node.js と npm がインストール済み

## 移行手順

### Step 1: 現在の設定をバックアップ

```bash
# 現在のスタック出力を記録
aws cloudformation describe-stacks \
  --stack-name SlackBedrockStack \
  --query 'Stacks[0].Outputs' \
  --output json > backup-outputs.json

# 現在の Function URL を記録
cat backup-outputs.json | jq -r '.[] | select(.OutputKey=="SlackEventHandlerUrl") | .OutputValue'
```

### Step 2: 環境変数の設定

`.env` ファイルを作成または確認します：

```bash
# プロジェクトルートに .env ファイルを作成
cat > .env << EOF
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
EOF
```

### Step 3: cdk.json を更新

```json
{
  "context": {
    "deploymentMode": "split",
    "verificationStackName": "SlackAI-Verification",
    "executionStackName": "SlackAI-Execution",
    "verificationAccountId": "YOUR_AWS_ACCOUNT_ID",
    "executionAccountId": "YOUR_AWS_ACCOUNT_ID"
  }
}
```

**注意**: アカウントIDは `aws sts get-caller-identity --query Account --output text` で確認できます。

### Step 4: 新しいスタックをデプロイ

#### 4.1 Execution Stack をデプロイ

```bash
cd cdk

# .env ファイルから環境変数を読み込んでデプロイ
set -a && source ../.env && set +a
npx cdk deploy SlackAI-Execution \
  --context deploymentMode=split \
  --profile YOUR_PROFILE \
  --require-approval never
```

出力から `ExecutionApiUrl` を記録します。

#### 4.2 Verification Stack をデプロイ

```bash
# ExecutionApiUrl をコンテキストとして渡してデプロイ
set -a && source ../.env && set +a
npx cdk deploy SlackAI-Verification \
  --context deploymentMode=split \
  --context executionApiUrl=<ExecutionApiUrl from step 4.1> \
  --profile YOUR_PROFILE \
  --require-approval never
```

出力から `VerificationLambdaRoleArn` を記録します。

#### 4.3 Execution Stack を更新（リソースポリシー追加）

```bash
# VerificationLambdaRoleArn をコンテキストとして渡して再デプロイ
npx cdk deploy SlackAI-Execution \
  --context deploymentMode=split \
  --context verificationLambdaRoleArn=<VerificationLambdaRoleArn from step 4.2> \
  --context verificationAccountId=YOUR_AWS_ACCOUNT_ID \
  --profile YOUR_PROFILE \
  --require-approval never
```

**または**、`scripts/deploy-split-stacks.sh` スクリプトを使用して3段階のデプロイを自動化できます：

```bash
cd scripts
chmod +x deploy-split-stacks.sh
./deploy-split-stacks.sh
```

### Step 4: Slack アプリの設定を更新

1. [Slack API](https://api.slack.com/apps) にアクセス
2. アプリの設定画面を開く
3. Event Subscriptions の Request URL を更新
   - 旧: SlackBedrockStack の Function URL
   - 新: SlackAI-Verification の Function URL

### Step 5: 動作確認

1. Slack でボットにメンションを送信
2. 正常に応答が返ることを確認
3. CloudWatch Logs でエラーがないことを確認

### Step 6: 旧スタックの削除

**重要**: 新しいスタックが正常に動作することを確認してから、旧スタックを削除してください。

#### 6.1 リソース名の競合について

新しいスタックは、DynamoDB テーブル名にスタック名プレフィックスを使用しているため、既存の `SlackBedrockStack` とリソース名の競合はありません。ただし、以下の点に注意してください：

- **DynamoDB テーブル**: 新しいスタックは `SlackAI-Verification-*` という名前のテーブルを作成します
- **Secrets Manager**: 新しいスタックは `SlackAI-Verification/slack/*` という名前のシークレットを作成します
- **CloudWatch アラーム**: 新しいスタックは `SlackAI-Verification-*` という名前のアラームを作成します

#### 6.2 削除手順

```bash
# 注意: これにより旧スタックのすべてのリソースが削除されます
# DynamoDB テーブルのデータも削除されるため、必要に応じてバックアップを取得してください

aws cloudformation delete-stack \
  --stack-name SlackBedrockStack \
  --profile YOUR_PROFILE \
  --region ap-northeast-1

# 削除の完了を待機
aws cloudformation wait stack-delete-complete \
  --stack-name SlackBedrockStack \
  --profile YOUR_PROFILE \
  --region ap-northeast-1
```

**または** CDK を使用：

```bash
cd cdk
npx cdk destroy SlackBedrockStack --profile YOUR_PROFILE
```

## ロールバック手順

問題が発生した場合は、以下の手順でロールバックできます：

### Slack 設定を元に戻す

1. Slack API で Event Subscriptions の Request URL を旧 Function URL に戻す
2. 旧スタックが動作することを確認

### 新スタックを削除

```bash
# 順序に注意: Verification → Execution
npx cdk destroy SlackAI-Verification
npx cdk destroy SlackAI-Execution
```

### cdk.json を元に戻す

```json
{
  "context": {
    "deploymentMode": "single"
  }
}
```

## 移行のメリット

| 項目 | 単一スタック | 分離スタック |
|------|-------------|-------------|
| クロスアカウント対応 | ❌ | ✅ |
| 独立したライフサイクル | ❌ | ✅ |
| セキュリティ分離 | 部分的 | 完全 |
| デプロイ時間 | 長い | 短い（個別更新） |
| 障害の影響範囲 | 全体 | 該当スタックのみ |

## トラブルシューティング

### 403 Forbidden エラー

**原因**: Execution Stack のリソースポリシーが設定されていない

**解決策**:
1. `verificationLambdaRoleArn` を cdk.json に設定
2. `npx cdk deploy SlackAI-Execution` で再デプロイ

### Function URL が変わらない

**原因**: Slack 設定が更新されていない

**解決策**:
1. Slack API で新しい Function URL を設定
2. Event Subscriptions を再検証

### Lambda タイムアウト

**原因**: Execution API への接続に問題がある

**解決策**:
1. `executionApiUrl` が正しいことを確認
2. IAM 権限を確認

### DynamoDB テーブル名の競合エラー

**原因**: 既存の `SlackBedrockStack` が同じテーブル名を使用している

**エラーメッセージ**: `slack-workspace-tokens already exists in stack SlackBedrockStack`

**解決策**:
1. 新しいスタックは自動的にスタック名プレフィックス（`SlackAI-Verification-*`）を使用します
2. このエラーが発生する場合は、既存の `SlackBedrockStack` を削除するか、新しいスタックのコードが最新であることを確認してください
3. コードを最新化: `git pull` してから再デプロイ

### API Gateway リソースポリシーエラー

**原因**: Execution Stack の API Gateway にリソースポリシーが設定されていない

**症状**: Verification Stack の Lambda が Execution API を呼び出せない（403 Forbidden）

**解決策**:
1. `VerificationLambdaRoleArn` を取得: `aws cloudformation describe-stacks --stack-name SlackAI-Verification --query 'Stacks[0].Outputs[?OutputKey==`VerificationLambdaRoleArn`].OutputValue' --output text`
2. Execution Stack を更新: `npx cdk deploy SlackAI-Execution --context verificationLambdaRoleArn=<ARN> --context verificationAccountId=<ACCOUNT_ID>`

## 関連ドキュメント

- [クロスアカウントアーキテクチャ](../reference/architecture/cross-account.md)
- [CDK README](../../cdk/README.md)
- [アーキテクチャ概要](../reference/architecture/overview.md)

