# トラブルシューティングガイド

---

title: トラブルシューティング
type: How-to
audience: [Developer, Operations]
status: Published
created: 2025-12-27
updated: 2026-02-07

---

## 概要

このガイドでは、Slack AI App の運用中に発生する可能性のある一般的な問題と、その解決方法を説明します。レガシーパス（API Gateway + SQS）と AgentCore A2A パスの両方をカバーします。

## 目次

- [接続エラー](#接続エラー)
- [認証エラー](#認証エラー)
- [API キー / シークレット関連](#api-キー--シークレット関連)
- [タイムアウトエラー](#タイムアウトエラー)
- [Bedrock エラー](#bedrock-エラー)
- [JSON シリアライゼーションエラー](#json-シリアライゼーションエラー)
- [AgentCore A2A エラー](#agentcore-a2a-エラー)
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

## API キー / シークレット関連

### 症状: `execution_api_invocation_failed` ログエラー

**考えられる原因**:

1. `execution-api-key-{env}` シークレットが Secrets Manager に存在しない
2. シークレットの値が正しくない

**解決手順**:

1. Secrets Manager でシークレットの存在を確認:

```bash
# 開発環境
aws secretsmanager describe-secret --secret-id execution-api-key-dev

# シークレットが存在しない場合は作成
API_KEY_ID=$(aws cloudformation describe-stacks \
  --stack-name SlackAI-Execution-Dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ExecutionApiKeyId`].OutputValue' \
  --output text)

API_KEY_VALUE=$(aws apigateway get-api-key \
  --api-key $API_KEY_ID \
  --include-value \
  --query 'value' \
  --output text)

aws secretsmanager create-secret \
  --name execution-api-key-dev \
  --secret-string "$API_KEY_VALUE"
```

2. Lambda 環境変数 `EXECUTION_API_KEY_SECRET_NAME` が正しいシークレット名を指しているか確認

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

## JSON シリアライゼーションエラー

### 症状: `TypeError: Object of type Decimal is not JSON serializable`

**考えられる原因**:

DynamoDB から取得した値に `Decimal` 型が含まれており、標準の `json.dumps` ではシリアライズできない。

**解決手順**:

1. `logger.py` でカスタム JSON エンコーダーを使用しているか確認:

```python
from decimal import Decimal

class _DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj == int(obj) else float(obj)
        return super().default(obj)

# json.dumps 呼び出し時に cls=_DecimalEncoder を指定
print(json.dumps(log_entry, cls=_DecimalEncoder))
```

2. DynamoDB クエリ結果をログに記録する箇所をすべて確認

---

## AgentCore A2A エラー

### 症状: AgentCore Agent が起動しない

**考えられる原因**:

1. Docker イメージのビルド失敗（ARM64 アーキテクチャの不一致）
2. ECR へのプッシュ権限不足
3. AgentCore Runtime のプロビジョニング失敗

**解決手順**:

```bash
# Docker が ARM64 ビルドに対応しているか確認
docker buildx inspect

# ECR リポジトリの確認
aws ecr describe-repositories --repository-names "*agent*"

# AgentCore Runtime のステータス確認
aws bedrock-agentcore list-agent-runtimes
```

### 症状: A2A 通信で `InvokeAgentRuntime` が失敗

**考えられる原因**:

1. Execution Agent の Alias ARN が正しく設定されていない
2. クロスアカウント時の RuntimeResourcePolicy が未設定
3. SigV4 署名の認証エラー

**解決手順**:

1. 環境変数 `EXECUTION_AGENT_ALIAS_ARN` を確認
2. CloudWatch ログで A2A 呼び出しエラーを確認:

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler \
  --filter-pattern "a2a"
```

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

| パターン                              | 意味                               |
| ------------------------------------- | ---------------------------------- |
| `signature_valid=false`               | 署名検証失敗                       |
| `existence_check_failed`              | Slack API 実在性確認失敗           |
| `bedrock_error`                       | Bedrock API エラー                 |
| `timeout`                             | 処理タイムアウト                   |
| `execution_api_invocation_failed`     | Execution API 呼び出し失敗         |
| `rate_limit_unexpected_error`         | レート制限の予期しないエラー       |
| `whitelist_authorization_failed`      | ホワイトリスト認可失敗             |
| `a2a_invocation_failed`              | AgentCore A2A 呼び出し失敗        |

---

## 関連ドキュメント

- [モニタリングガイド](../reference/operations/monitoring.md)
- [セキュリティ実装](../reference/security/implementation.md)
- [クイックスタート](../quickstart.md)
