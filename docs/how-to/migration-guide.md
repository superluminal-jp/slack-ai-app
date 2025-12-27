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

### Step 2: cdk.json を更新

```json
{
  "context": {
    "deploymentMode": "split",
    "verificationStackName": "SlackAI-Verification",
    "executionStackName": "SlackAI-Execution"
  }
}
```

### Step 3: 新しいスタックをデプロイ

```bash
cd cdk

# Execution Stack をデプロイ
npx cdk deploy SlackAI-Execution

# API URL を取得して cdk.json に設定
# "executionApiUrl": "<API URL from output>"

# Verification Stack をデプロイ
npx cdk deploy SlackAI-Verification

# Lambda Role ARN を取得して cdk.json に設定
# "verificationLambdaRoleArn": "<Role ARN from output>"

# Execution Stack を更新（リソースポリシー追加）
npx cdk deploy SlackAI-Execution
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

### Step 6: 旧スタックの削除（オプション）

動作確認が完了したら、旧スタックを削除できます：

```bash
# 注意: これにより旧スタックのすべてのリソースが削除されます
npx cdk destroy SlackBedrockStack
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

## 関連ドキュメント

- [クロスアカウントアーキテクチャ](../reference/architecture/cross-account.md)
- [CDK README](../../cdk/README.md)
- [アーキテクチャ概要](../reference/architecture/overview.md)

