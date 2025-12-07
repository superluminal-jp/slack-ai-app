# セキュリティ実装

## 6.1 多層防御アーキテクチャ

セキュリティは機能実現のための重要な要素として、以下の多層防御を実装します：

- **レイヤー 1（Slack）**: SSO + MFA による認証
- **レイヤー 2（SlackEventHandler Function URL）**: Function URL (認証なし、署名検証はLambda内で実施)
- **レイヤー 3（SlackEventHandler）**:
  - 3a. HMAC SHA256 署名検証
  - **3b. Slack API Existence Check（NEW）**
  - 3c. 認可（ホワイトリスト）
  - 3d. 基本的プロンプト検証
- **レイヤー 4（ExecutionApi）**: IAM 認証による内部 API 保護
- **レイヤー 5（BedrockProcessor）**: Bedrock Guardrails、PII 検出
- **レイヤー 6（Bedrock）**: Automated Reasoning（99%精度）によるプロンプトインジェクション検出

### レイヤー 3b: Slack API Existence Check 実装詳細

**目的**: Signing Secret 漏洩時の攻撃面を縮小し、偽造リクエストを検出する

**実装フロー**:

1. 署名検証（3a）が成功した後、Existence Check を実行
2. 以下の Slack API を順次呼び出し:
   - `team.info`: team_id が実在するワークスペースか確認
   - `users.info`: user_id が実在するユーザーか確認
   - `conversations.info`: channel_id が実在するチャンネルか確認
3. すべての API 呼び出しが成功した場合のみ、認可レイヤー（3c）に進む
4. いずれかが失敗した場合、セキュリティイベントをログに記録し、403 を返す

**キャッシュ戦略**:

- 検証成功したエンティティを DynamoDB に 5 分間キャッシュ
- キャッシュキー: `{team_id}#{user_id}#{channel_id}`
- TTL: 300 秒（5 分）
- キャッシュヒット時は Slack API 呼び出しをスキップ

**エラーハンドリング**:

- Slack API レート制限: 429 エラー時は指数バックオフでリトライ（最大 3 回）
- **Slack API ダウン: タイムアウト時（>2 秒）は fail-closed（リクエスト拒否）** ← セキュリティ優先
- 不正エンティティ: 403 Forbidden + セキュリティアラート

**セキュリティメトリクス** (CloudWatch namespace: `SlackEventHandler`):

- `ExistenceCheckFailed`: 存在チェック失敗回数（Sum）
- `ExistenceCheckCacheHit`: キャッシュヒット回数（Sum）
- `ExistenceCheckCacheMiss`: キャッシュミス回数（Sum）
- `SlackAPILatency`: Slack API 呼び出しレイテンシ（Milliseconds, p95）

**キャッシュヒット率の計算**: `ExistenceCheckCacheHit / (ExistenceCheckCacheHit + ExistenceCheckCacheMiss) * 100`

## 6.2 Slack API Existence Check 実装コード

### Python 実装例（SlackEventHandler）

```python
"""Slack API Existence Check - 動的エンティティ検証"""

import boto3
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from typing import Optional, Dict
import time

dynamodb = boto3.resource('dynamodb')
existence_cache_table = dynamodb.Table('ExistenceCheckCache')

class ExistenceCheckError(Exception):
    """エンティティ存在チェックが失敗した場合に発生"""
    pass

def check_entity_existence(
    bot_token: str,
    team_id: str,
    user_id: str,
    channel_id: str
) -> bool:
    """Slack API を使用してエンティティの存在を動的に検証する"""

    # キャッシュチェック
    cache_key = f"{team_id}#{user_id}#{channel_id}"
    cached = get_from_cache(cache_key)
    if cached:
        return True

    client = WebClient(token=bot_token)

    try:
        # 1. team_id 検証
        team_info = client.team_info(team=team_id)
        if not team_info["ok"]:
            raise ExistenceCheckError(f"Invalid team_id: {team_id}")

        # 2. user_id 検証
        user_info = client.users_info(user=user_id)
        if not user_info["ok"]:
            raise ExistenceCheckError(f"Invalid user_id: {user_id}")

        # 3. channel_id 検証
        channel_info = client.conversations_info(channel=channel_id)
        if not channel_info["ok"]:
            raise ExistenceCheckError(f"Invalid channel_id: {channel_id}")

        # キャッシュに保存（TTL: 5分）
        save_to_cache(cache_key, ttl=300)

        return True

    except SlackApiError as e:
        if e.response["error"] == "team_not_found":
            raise ExistenceCheckError(f"Team not found: {team_id}")
        elif e.response["error"] == "user_not_found":
            raise ExistenceCheckError(f"User not found: {user_id}")
        elif e.response["error"] == "channel_not_found":
            raise ExistenceCheckError(f"Channel not found: {channel_id}")
        elif e.response.status_code == 429:
            raise ExistenceCheckError("Slack API rate limit exceeded")
        else:
            raise ExistenceCheckError(f"Slack API error: {e.response['error']}")

def get_from_cache(cache_key: str) -> Optional[Dict]:
    """DynamoDB からキャッシュを取得"""
    try:
        response = existence_cache_table.get_item(Key={'cache_key': cache_key})
        item = response.get('Item')
        if item and item.get('ttl', 0) > int(time.time()):
            return item
        return None
    except Exception:
        return None

def save_to_cache(cache_key: str, ttl: int):
    """DynamoDB にキャッシュを保存（TTL 付き）"""
    try:
        existence_cache_table.put_item(
            Item={
                'cache_key': cache_key,
                'ttl': int(time.time()) + ttl,
                'verified_at': int(time.time())
            }
        )
    except Exception as e:
        print(f"Cache save failed: {str(e)}")
```

### TypeScript 実装例（CDK スタック）

```typescript
// DynamoDB テーブル定義（Existence Check キャッシュ）
const existenceCheckCacheTable = new dynamodb.Table(
  this,
  "ExistenceCheckCache",
  {
    partitionKey: { name: "cache_key", type: dynamodb.AttributeType.STRING },
    timeToLiveAttribute: "ttl",
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  }
);

// SlackEventHandler に DynamoDB アクセス権限を付与
existenceCheckCacheTable.grantReadWriteData(slackEventHandlerLambda);

// CloudWatch アラーム: Existence Check 失敗
const existenceCheckFailedAlarm = new cloudwatch.Alarm(
  this,
  "ExistenceCheckFailedAlarm",
  {
    alarmName: `${cdk.Stack.of(this).stackName}-existence-check-failed`,
    alarmDescription: "Alert when Existence Check failures exceed threshold (potential security issue)",
    metric: new cloudwatch.Metric({
      namespace: "SlackEventHandler",
      metricName: "ExistenceCheckFailed",
      statistic: "Sum",
      period: cdk.Duration.minutes(5),
    }),
    threshold: 5,
    evaluationPeriods: 1,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  }
);

existenceCheckFailedAlarm.addAlarmAction(
  new cloudwatch_actions.SnsAction(securityTeamTopic)
);
```

---

## 関連ドキュメント

- [セキュリティ要件](./requirements.md) - 機能的・非機能的セキュリティ要件
- [脅威モデル](./threat-model.md) - リスク分析とアクター
- [アーキテクチャ概要](../architecture/overview.md) - セキュリティ設計の原則
- [テストと検証](../operations/testing.md) - セキュリティ検証シナリオ
- [ADR-004](../adr/004-slack-api-existence-check.md) - Existence Check の採用理由
