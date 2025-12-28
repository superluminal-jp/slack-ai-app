# トラブルシューティングガイド

---

title: トラブルシューティング
type: How-to
audience: [Developer, Operations]
status: Published
created: 2025-12-27
updated: 2025-12-27

---

## 概要

このガイドでは、Slack Bedrock MVP の運用中に発生する可能性のある一般的な問題と、その解決方法を説明します。

## 目次

- [接続エラー](#接続エラー)
- [認証エラー](#認証エラー)
- [タイムアウトエラー](#タイムアウトエラー)
- [Bedrock エラー](#bedrock-エラー)
- [ログの確認方法](#ログの確認方法)

---

## 接続エラー

### 症状: ボットが応答しない

**考えられる原因**:

1. Lambda 関数がデプロイされていない
2. API Gateway の設定が正しくない
3. Slack App の Event Subscriptions が無効

**解決手順**:

```bash
# Lambda 関数の状態を確認
aws lambda get-function --function-name slack-event-handler

# API Gateway のエンドポイントを確認
aws apigateway get-rest-apis

# CloudWatch ログを確認
aws logs tail /aws/cdk/lib/verification/lambda/slack-event-handler --follow
```

---

## 認証エラー

### 症状: "Invalid signature" エラー

**考えられる原因**:

1. Slack Signing Secret が正しく設定されていない
2. リクエストのタイムスタンプが古い（リプレイアタック防止）

**解決手順**:

1. Secrets Manager で Signing Secret を確認:

```bash
aws secretsmanager get-secret-value --secret-id slack-credentials
```

2. Slack App の設定ページで Signing Secret を再確認

3. サーバーの時刻同期を確認:

```bash
timedatectl status
```

### 症状: "User not authorized" エラー

**考えられる原因**:

1. ユーザーがホワイトリストに含まれていない
2. チャンネルがホワイトリストに含まれていない

**解決手順**:

1. DynamoDB のホワイトリストテーブルを確認
2. 必要に応じてユーザー/チャンネルを追加

---

## タイムアウトエラー

### 症状: "処理中です..." メッセージの後、応答がない

**考えられる原因**:

1. Bedrock の処理が予想より長い
2. Lambda のタイムアウト設定が短い
3. ネットワーク接続の問題

**解決手順**:

1. Lambda のタイムアウト設定を確認（推奨: 60 秒以上）:

```bash
aws lambda get-function-configuration --function-name bedrock-processor
```

2. Bedrock のレスポンス時間を CloudWatch で確認

3. 必要に応じてタイムアウトを延長:

```bash
aws lambda update-function-configuration \
  --function-name bedrock-processor \
  --timeout 120
```

---

## Bedrock エラー

### 症状: "Model access denied" エラー

**考えられる原因**:

1. Bedrock モデルへのアクセスが有効化されていない
2. IAM ロールの権限が不足

**解決手順**:

1. AWS Console で Bedrock Model Access を確認
2. 使用するモデル（Claude 4.5 Sonnet など）を有効化
3. Lambda の IAM ロールに `bedrock:InvokeModel` 権限を追加

### 症状: "Token limit exceeded" エラー

**考えられる原因**:

1. 入力テキストが長すぎる
2. スレッド履歴が長すぎる

**解決手順**:

1. 環境変数 `MAX_TOKENS` を調整
2. スレッド履歴の取得数を制限
3. 入力テキストのトリミングを実装

---

## ログの確認方法

### CloudWatch ログの確認

```bash
# 最新のログを表示
aws logs tail /aws/cdk/lib/verification/lambda/slack-event-handler --follow

# 特定の時間範囲のログを検索
aws logs filter-log-events \
  --log-group-name /aws/cdk/lib/verification/lambda/slack-event-handler \
  --start-time $(date -v-1H +%s000) \
  --filter-pattern "ERROR"
```

### 重要なログパターン

| パターン                 | 意味                     |
| ------------------------ | ------------------------ |
| `signature_valid=false`  | 署名検証失敗             |
| `existence_check_failed` | Slack API 実在性確認失敗 |
| `bedrock_error`          | Bedrock API エラー       |
| `timeout`                | 処理タイムアウト         |

---

## 関連ドキュメント

- [モニタリングガイド](../reference/operations/monitoring.md)
- [セキュリティ実装](../reference/security/implementation.md)
- [クイックスタート](../quickstart.md)
