# セキュリティ実装

## 6.1 多層防御アーキテクチャ

セキュリティは機能実現のための重要な要素として、以下の多層防御を実装します：

- **レイヤー 1（Slack）**: SSO + MFA による認証
- **レイヤー 2（SlackEventHandler Function URL）**: Function URL (認証なし、署名検証はLambda内で実施)
- **レイヤー 3（SlackEventHandler）**:
  - 3a. HMAC SHA256 署名検証
  - **3b. Slack API Existence Check（NEW）**
  - 3c. 認可（ホワイトリスト）
- **レイヤー 4（ExecutionApi）**: IAM 認証による内部 API 保護
- **レイヤー 5（BedrockProcessor）**: Bedrock Guardrails
- **レイヤー 6（Bedrock）**: Automated Reasoning

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

### レイヤー 3c: ホワイトリスト認可 実装詳細

**目的**: 認可済みのワークスペース、ユーザー、チャンネルのみがAI機能にアクセスできるようにする

**実装フロー**:

1. Existence Check（3b）が成功した後、ホワイトリスト認可を実行
2. **条件付きAND条件**: 設定されているエンティティのみをチェック
   - `team_id`: ワークスペースID（ホワイトリストに設定されている場合のみチェック）
   - `user_id`: ユーザーID（ホワイトリストに設定されている場合のみチェック）
   - `channel_id`: チャンネルID（ホワイトリストに設定されている場合のみチェック）
3. **空のホワイトリスト**: すべてのエンティティが未設定（空）の場合、すべてのリクエストを許可（柔軟な設定）
4. 設定されているエンティティがすべて認可済みの場合のみ、Execution API に進む
5. 設定されているエンティティのいずれかが未認可の場合、セキュリティイベントをログに記録し、403 を返す

**ホワイトリスト設定ソース（優先順位）**:

1. **DynamoDB** (推奨): 動的更新、即座に反映（キャッシュTTL 5分を除く）
   - テーブル名: `slack-whitelist-config`
   - パーティションキー: `entity_type` (team_id, user_id, channel_id)
   - ソートキー: `entity_id` (実際のID値)
2. **AWS Secrets Manager** (セカンダリ): 機密情報として管理、暗号化、ローテーション対応
   - シークレット名: `{stackName}/slack/whitelist-config`
   - JSON形式: `{"team_ids": ["T123ABC"], "user_ids": ["U111"], "channel_ids": ["C001"]}`
3. **環境変数** (フォールバック): シンプル、再デプロイ必要
   - `WHITELIST_TEAM_IDS`: カンマ区切り
   - `WHITELIST_USER_IDS`: カンマ区切り
   - `WHITELIST_CHANNEL_IDS`: カンマ区切り

**キャッシュ戦略**:

- ホワイトリスト設定をメモリ内に5分間キャッシュ
- TTL: 300秒（5分）
- キャッシュヒット時は設定ソースへのアクセスをスキップ
- キャッシュTTLが経過すると自動的に再読み込み

**エラーハンドリング**:

- **設定読み込み失敗: fail-closed（すべてのリクエストを拒否）** ← セキュリティ優先
- **ホワイトリストが空: すべてのリクエストを許可（柔軟な設定）** ← 設定されていない場合は全許可
- 未認可エンティティ: 403 Forbidden + セキュリティアラート

**セキュリティメトリクス** (CloudWatch namespace: `SlackEventHandler`):

- `WhitelistAuthorizationSuccess`: 認可成功回数（Sum）
- `WhitelistAuthorizationFailed`: 認可失敗回数（Sum）
- `WhitelistAuthorizationLatency`: 認可処理レイテンシ（Milliseconds, p95）
- `WhitelistConfigLoadErrors`: 設定読み込みエラー回数（Sum）

### レイヤー 3d: レート制限 実装詳細

**目的**: DDoS攻撃やレート乱用を防止し、コストを制御する

**実装フロー**:

1. ホワイトリスト認可（3c）が成功した後、レート制限チェックを実行
2. **ユーザー単位スロットリング**: `{team_id}#{user_id}` をキーとして DynamoDB で追跡
3. **時間ウィンドウ**: 1分間（60秒）ごとにリセット
4. **デフォルト制限**: 10リクエスト/分/ユーザー（環境変数 `RATE_LIMIT_PER_MINUTE` で設定可能）
5. **トークンバケットアルゴリズム**: DynamoDB の条件付き更新を使用してアトミックにカウント
6. 制限超過時は 429 Too Many Requests を返す

**DynamoDB テーブル設計**:

- テーブル名: `slack-rate-limit`
- パーティションキー: `rate_limit_key` (形式: `{team_id}#{user_id}#{window_start}`)
- TTL属性: `ttl` (自動クリーンアップ)
- 属性:
  - `request_count`: 現在のウィンドウでのリクエスト数
  - `window_start`: ウィンドウ開始時刻（秒単位のエポックタイム）

**エラーハンドリング**:

- **DynamoDB エラー**: レート制限チェック失敗時は graceful degradation（リクエストを許可）
- **レート制限超過**: 429 Too Many Requests + セキュリティログ
- **予期しないエラー**: ログに記録し、リクエストを許可（fail-open for rate limiting）

**セキュリティメトリクス** (CloudWatch namespace: `SlackEventHandler`):

- `RateLimitExceeded`: レート制限超過回数（Sum）
- `RateLimitRequests`: レート制限チェック回数（Sum）
- CloudWatch アラーム: 5分間に10回以上のレート制限超過でアラート

### レイヤー 3e: 入力検証とプロンプトインジェクション対策 実装詳細

**目的**: プロンプトインジェクション攻撃を検出し、システムプロンプトの漏洩を防止する

**実装フロー**:

1. メッセージ長チェック（最大 4000 文字）
2. **プロンプトインジェクションパターン検出**: 10種類の既知パターンをチェック
   - "ignore previous instructions"
   - "system prompt"
   - "forget everything"
   - "new instructions"
   - "override"
   - "jailbreak"
   - "you are now"
   - "act as"
   - "pretend to be"
3. 検出時はユーザーに一般的なエラーメッセージを返す（具体的なパターンは開示しない）

**検出パターン**:

- 大文字小文字を区別しない検索
- 部分一致（パターンが含まれていれば検出）
- 複数パターンの同時検出に対応

**エラーハンドリング**:

- **検出時**: 400 Bad Request + ユーザーフレンドリーなエラーメッセージ
- **セキュリティログ**: 検出されたパターンと理由をログに記録（PII マスキング適用）

**セキュリティメトリクス** (CloudWatch namespace: `SlackEventHandler`):

- `PromptInjectionDetected`: プロンプトインジェクション検出回数（Sum）
- セキュリティイベントログに詳細を記録

### レイヤー 3f: PII マスキング 実装詳細

**目的**: ログから個人識別情報（PII）を除去し、コンプライアンス要件を満たす

**実装フロー**:

1. すべてのログエントリを出力前に自動的にサニタイズ
2. **マスキング戦略**（ログレベルに応じて）:
   - **DEBUG**: 完全な値（デバッグ用）
   - **INFO**: 部分マスキング（例: `T123***`）
   - **WARN/ERROR/CRITICAL**: SHA-256 ハッシュ（最初の8文字）
3. **マスキング対象フィールド**:
   - `team_id`
   - `user_id`
   - `channel_id`
   - `bot_token`
   - `signing_secret`

**ハッシュ化**:

- SHA-256 アルゴリズムを使用
- 環境変数 `PII_HASH_SALT` でソルトを設定（本番環境で変更推奨）
- ハッシュ値の最初の8文字を返す（可読性のため）

**再帰的サニタイゼーション**:

- ネストされた辞書を再帰的にサニタイズ
- リスト内の辞書もサニタイズ

**セキュリティメトリクス**:

- PII マスキングは自動的に適用され、メトリクスは不要
- ログ監査で PII が含まれていないことを確認

**CloudWatchアラーム**:

- `WhitelistAuthorizationFailureAlarm`: 5分間に5回以上の認可失敗でトリガー
- `WhitelistConfigLoadErrorAlarm`: 設定読み込みエラーが発生した場合にトリガー

**認可ロジック**:

```python
def authorize_request(
    team_id: Optional[str],
    user_id: Optional[str],
    channel_id: Optional[str],
) -> AuthorizationResult:
    """
    条件付きAND条件: 設定されているエンティティのみをチェック
    
    - ホワイトリストが完全に空の場合: すべてのリクエストを許可
    - エンティティがホワイトリストに設定されている場合のみチェック
    - 設定されていないエンティティはスキップ（チェックしない）
    - 設定されているエンティティがすべて認可済みの場合のみ許可
    """
    whitelist = load_whitelist_config()  # キャッシュから読み込み（5分TTL）
    
    # 空のホワイトリスト = すべてのリクエストを許可
    total_entries = len(whitelist["team_ids"]) + len(whitelist["user_ids"]) + len(whitelist["channel_ids"])
    if total_entries == 0:
        return AuthorizationResult(authorized=True, ...)
    
    # 条件付きAND条件: 設定されているエンティティのみをチェック
    unauthorized_entities = []
    
    # team_id がホワイトリストに設定されている場合のみチェック
    if len(whitelist["team_ids"]) > 0:
        if not team_id or team_id not in whitelist["team_ids"]:
            unauthorized_entities.append("team_id")
    
    # user_id がホワイトリストに設定されている場合のみチェック
    if len(whitelist["user_ids"]) > 0:
        if not user_id or user_id not in whitelist["user_ids"]:
            unauthorized_entities.append("user_id")
    
    # channel_id がホワイトリストに設定されている場合のみチェック
    if len(whitelist["channel_ids"]) > 0:
        if not channel_id or channel_id not in whitelist["channel_ids"]:
            unauthorized_entities.append("channel_id")
    
    if len(unauthorized_entities) == 0:
        return AuthorizationResult(authorized=True, ...)
    else:
        return AuthorizationResult(
            authorized=False,
            unauthorized_entities=unauthorized_entities,
            ...
        )
```

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
- [ADR-004](../explanation/adr/004-slack-api-existence-check.md) - Existence Check の採用理由
