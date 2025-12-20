# Quick Start: ホワイトリスト認可

**Feature**: 007-whitelist-auth  
**Date**: 2025-01-30

## Overview

ホワイトリスト認可機能は、署名検証（3a）と Existence Check（3b）の後に実行され、team_id、user_id、channel_id の 3 つのエンティティすべてがホワイトリストに含まれている場合のみリクエストを承認します。

## Prerequisites

- 署名検証（3a）が実装済み
- Existence Check（3b）が実装済み
- AWS Lambda 実行環境（Python 3.11+）
- DynamoDB テーブル作成権限（または Secrets Manager アクセス権限）

## Setup

### 1. DynamoDB テーブルの作成（推奨）

```bash
aws dynamodb create-table \
  --table-name slack-whitelist-config \
  --attribute-definitions \
    AttributeName=entity_type,AttributeType=S \
    AttributeName=entity_id,AttributeType=S \
  --key-schema \
    AttributeName=entity_type,KeyType=HASH \
    AttributeName=entity_id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

### 2. ホワイトリストデータの投入

```bash
# team_id の追加
aws dynamodb put-item \
  --table-name slack-whitelist-config \
  --item '{
    "entity_type": {"S": "team_id"},
    "entity_id": {"S": "T01234567"},
    "created_at": {"N": "1706630400"},
    "updated_at": {"N": "1706630400"}
  }'

# user_id の追加
aws dynamodb put-item \
  --table-name slack-whitelist-config \
  --item '{
    "entity_type": {"S": "user_id"},
    "entity_id": {"S": "U01234567"},
    "created_at": {"N": "1706630400"},
    "updated_at": {"N": "1706630400"}
  }'

# channel_id の追加
aws dynamodb put-item \
  --table-name slack-whitelist-config \
  --item '{
    "entity_type": {"S": "channel_id"},
    "entity_id": {"S": "C01234567"},
    "created_at": {"N": "1706630400"},
    "updated_at": {"N": "1706630400"}
  }'
```

### 3. Lambda 環境変数の設定

```bash
# DynamoDB テーブル名（推奨）
WHITELIST_TABLE_NAME=slack-whitelist-config

# または Secrets Manager シークレット名
WHITELIST_SECRET_NAME=slack-whitelist-config

# または環境変数（フォールバック）
WHITELIST_TEAM_IDS=T01234567,T45678901
WHITELIST_USER_IDS=U01234567,U45678901
WHITELIST_CHANNEL_IDS=C01234567,C45678901
```

### 4. IAM ロールの更新

Lambda 実行ロールに以下の権限を追加：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT:table/slack-whitelist-config"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:slack-whitelist-config-*"
    }
  ]
}
```

## Implementation Steps

### Step 1: モジュールの作成

1. `lambda/slack-event-handler/whitelist_loader.py` を作成
   - DynamoDB、Secrets Manager、環境変数からホワイトリストを読み込む
   - メモリ内キャッシュ（5 分 TTL）を実装

2. `lambda/slack-event-handler/authorization.py` を作成
   - `authorize_request(team_id, user_id, channel_id)` 関数を実装
   - ホワイトリストチェックロジック
   - AuthorizationResult の生成

### Step 2: handler.py の更新

`handler.py` の Existence Check 成功後にホワイトリスト認可を追加：

```python
# Existence Check 成功後
try:
    auth_result = authorize_request(
        team_id=team_id,
        user_id=user_id,
        channel_id=channel_id
    )
    if not auth_result.authorized:
        log_error("whitelist_authorization_failed", {
            "team_id": team_id,
            "user_id": user_id,
            "channel_id": channel_id,
            "unauthorized_entities": auth_result.unauthorized_entities,
        })
        return {
            "statusCode": 403,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Authorization failed"}),
        }
    log_info("whitelist_authorization_success", {
        "team_id": team_id,
        "user_id": user_id,
        "channel_id": channel_id,
    })
except AuthorizationError as e:
    # 設定読み込み失敗時は fail-closed
    log_error("whitelist_config_load_failed", {
        "error": str(e),
    })
    return {
        "statusCode": 403,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": "Configuration error"}),
    }
```

### Step 3: テストの作成

1. `tests/test_authorization.py`: ユニットテスト
2. `tests/test_whitelist_loader.py`: 設定読み込みのテスト
3. `tests/test_authorization.feature`: BDD シナリオ

## Testing

### Unit Tests

```bash
cd lambda/slack-event-handler
pytest tests/test_authorization.py -v
pytest tests/test_whitelist_loader.py -v
```

### BDD Tests

```bash
pytest tests/test_authorization.feature -v
```

### Integration Test

1. 認可済みの team_id、user_id、channel_id でリクエストを送信
2. 200 OK が返されることを確認
3. 未認可のエンティティでリクエストを送信
4. 403 Forbidden が返されることを確認

## Monitoring

### CloudWatch Metrics

- `WhitelistAuthorizationSuccess`: 認可成功回数
- `WhitelistAuthorizationFailed`: 認可失敗回数
- `WhitelistAuthorizationLatency`: 認可処理時間（ミリ秒）
- `WhitelistConfigLoadErrors`: 設定読み込みエラー回数

### CloudWatch Alarms

- `WhitelistAuthorizationFailedAlarm`: 5 分間に 10 回以上失敗した場合にトリガー
- `WhitelistConfigLoadErrorAlarm`: 設定読み込みエラーが発生した場合にトリガー

### Log Queries

```bash
# 認可失敗のログを確認
aws logs filter-log-events \
  --log-group-name /aws/lambda/slack-event-handler \
  --filter-pattern "whitelist_authorization_failed"

# 設定読み込みエラーのログを確認
aws logs filter-log-events \
  --log-group-name /aws/lambda/slack-event-handler \
  --filter-pattern "whitelist_config_load_failed"
```

## Whitelist Management

### DynamoDB でのホワイトリスト管理

DynamoDB を使用している場合、ホワイトリストの更新は即座に反映されます（キャッシュ TTL 5 分を除く）。

#### エンティティの追加

```bash
# team_id の追加
aws dynamodb put-item \
  --table-name slack-whitelist-config \
  --item '{
    "entity_type": {"S": "team_id"},
    "entity_id": {"S": "T_NEW_TEAM"},
    "created_at": {"N": "'$(date +%s)'"},
    "updated_at": {"N": "'$(date +%s)'"}
  }'

# user_id の追加
aws dynamodb put-item \
  --table-name slack-whitelist-config \
  --item '{
    "entity_type": {"S": "user_id"},
    "entity_id": {"S": "U_NEW_USER"},
    "created_at": {"N": "'$(date +%s)'"},
    "updated_at": {"N": "'$(date +%s)'"}
  }'

# channel_id の追加
aws dynamodb put-item \
  --table-name slack-whitelist-config \
  --item '{
    "entity_type": {"S": "channel_id"},
    "entity_id": {"S": "C_NEW_CHANNEL"},
    "created_at": {"N": "'$(date +%s)'"},
    "updated_at": {"N": "'$(date +%s)'"}
  }'
```

#### エンティティの削除

```bash
# team_id の削除
aws dynamodb delete-item \
  --table-name slack-whitelist-config \
  --key '{
    "entity_type": {"S": "team_id"},
    "entity_id": {"S": "T_OLD_TEAM"}
  }'

# user_id の削除
aws dynamodb delete-item \
  --table-name slack-whitelist-config \
  --key '{
    "entity_type": {"S": "user_id"},
    "entity_id": {"S": "U_OLD_USER"}
  }'

# channel_id の削除
aws dynamodb delete-item \
  --table-name slack-whitelist-config \
  --key '{
    "entity_type": {"S": "channel_id"},
    "entity_id": {"S": "C_OLD_CHANNEL"}
  }'
```

#### キャッシュ TTL について

- DynamoDB の更新は、キャッシュ TTL（5 分）が経過すると自動的に反映されます
- 即座に反映する必要がある場合は、Lambda 関数を再起動するか、5 分待つ必要があります

### Secrets Manager でのホワイトリスト管理

Secrets Manager を使用している場合、シークレットを更新すると、キャッシュ TTL（5 分）が経過後に反映されます。

#### シークレットの更新

```bash
# シークレットの現在の値を取得
aws secretsmanager get-secret-value \
  --secret-id SlackBedrockStack/slack/whitelist-config \
  --query SecretString \
  --output text > whitelist.json

# whitelist.json を編集（team_ids, user_ids, channel_ids を更新）

# シークレットを更新
aws secretsmanager update-secret \
  --secret-id SlackBedrockStack/slack/whitelist-config \
  --secret-string file://whitelist.json
```

**注意**: シークレットの更新は、キャッシュ TTL（5 分）が経過するまで反映されません。

### 環境変数でのホワイトリスト管理

環境変数を使用している場合、ホワイトリストの更新には Lambda 関数の再デプロイが必要です。

#### CDK での環境変数更新

```typescript
// cdk/lib/constructs/slack-event-handler.ts を編集
environment: {
  // ... 既存の環境変数 ...
  WHITELIST_TEAM_IDS: "T123ABC,T456DEF,T_NEW",  // 新しい team_id を追加
  WHITELIST_USER_IDS: "U111,U222",
  WHITELIST_CHANNEL_IDS: "C001,C002",
}
```

```bash
# CDK スタックを再デプロイ
cd cdk
npm run build
cdk deploy
```

**注意**: 環境変数の更新は、Lambda 関数の再デプロイが必要です。キャッシュは再デプロイ時にクリアされます。

### ホワイトリスト管理のベストプラクティス

1. **DynamoDB を使用する場合（推奨）**:
   - 動的更新が可能
   - 即座に反映（キャッシュ TTL を除く）
   - 運用上の柔軟性が高い

2. **Secrets Manager を使用する場合**:
   - 機密情報として管理
   - 自動ローテーション対応
   - キャッシュ TTL（5 分）の反映遅延を考慮

3. **環境変数を使用する場合**:
   - 開発環境や小規模運用に適している
   - 更新には再デプロイが必要
   - シンプルで理解しやすい

## Troubleshooting

### 問題: すべてのリクエストが 403 で拒否される

**原因**: ホワイトリストが空、または設定が読み込めない

**解決策**:
1. DynamoDB テーブルにデータが存在するか確認
2. Lambda 実行ロールに DynamoDB 読み取り権限があるか確認
3. 環境変数が正しく設定されているか確認

### 問題: 認可チェックが遅い（>50ms）

**原因**: キャッシュが効いていない、または DynamoDB アクセスが遅い

**解決策**:
1. キャッシュの TTL を確認（5 分）
2. DynamoDB のレイテンシを確認
3. キャッシュヒット率を CloudWatch で確認

### 問題: ホワイトリスト更新が反映されない

**原因**: キャッシュの TTL（5 分）が経過していない

**解決策**:
1. 5 分待つ（キャッシュ TTL 経過）
2. Lambda を再起動（キャッシュクリア）
3. キャッシュ TTL を短くする（開発環境のみ）

## Next Steps

1. `/speckit.tasks` を実行してタスクリストを生成
2. 実装を開始
3. テストを実行
4. デプロイ

