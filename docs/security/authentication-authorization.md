# 認証・認可セキュリティ解説

> 🔒 **Two-Key Defense（2 鍵防御）モデル**
>
> 本システムは、Signing Secret と Bot Token の両方が必要となる 2 鍵防御モデルを採用しています。
> いずれか一方が漏洩しても、もう一方がなければ攻撃は成功しません。

**ドキュメントタイプ**: セキュリティ解説
**ステータス**: 推奨
**バージョン**: 1.0
**最終更新日**: 2025-12-30
**対象読者**: セキュリティ担当者、開発者、アーキテクト

---

## 目次

1. [概要](#概要)
2. [認証・認可の全体像](#認証認可の全体像)
3. [Two-Key Defense（2 鍵防御）モデル](#two-key-defense2鍵防御モデル)
4. [各レイヤーの詳細解説](#各レイヤーの詳細解説)
5. [攻撃シナリオと防御メカニズム](#攻撃シナリオと防御メカニズム)
6. [実装詳細](#実装詳細)
7. [モニタリングとアラート](#モニタリングとアラート)
8. [ベストプラクティス](#ベストプラクティス)

---

## 概要

本システムは、Slack ワークスペースから AWS Bedrock を利用して AI 機能を提供する際の認証・認可を、**多層防御（Defense in Depth）**と**Two-Key Defense（2 鍵防御）**モデルで実現しています。

### セキュリティの基本原則

1. **Fail-Closed（失敗時は閉じる）**: 認証・認可が失敗した場合、リクエストを即座に拒否
2. **最小権限の原則**: 各コンポーネントは必要最小限の権限のみを持つ
3. **多層防御**: 単一の防御レイヤーに依存せず、複数のレイヤーで防御
4. **動的検証**: 静的ホワイトリストではなく、動的にエンティティの実在性を確認

---

## 認証・認可の全体像

### 認証・認可フロー図

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Slack User Request                                       │
│    ↓ SSO + MFA (Slack レイヤー)                            │
│    [認証済みユーザーのみリクエスト可能]                      │
├─────────────────────────────────────────────────────────────┤
│ 2. SlackEventHandler Function URL                            │
│    ↓ Function URL (パブリックエンドポイント)                 │
│    [認証なし、署名検証はLambda内で実施]                      │
├─────────────────────────────────────────────────────────────┤
│ 3. SlackEventHandler (検証層 - Verification Layer)          │
│    ├─ 3a. HMAC SHA256 署名検証                              │
│    │   └─ Signing Secret (鍵1)                             │
│    │   └─ タイムスタンプ検証 (±5分)                         │
│    │   └─ リプレイアタック防止                              │
│    │                                                         │
│    ├─ 3b. Slack API Existence Check (鍵2)                   │
│    │   └─ Bot Token を使用                                  │
│    │   └─ team.info: team_id の実在性確認                   │
│    │   └─ users.info: user_id の実在性確認                  │
│    │   └─ conversations.info: channel_id の実在性確認       │
│    │   └─ DynamoDB キャッシュ (5分TTL)                      │
│    │   └─ fail-closed (検証失敗時は403)                     │
│    │                                                         │
│    ├─ 3c. 認可（ホワイトリスト）                            │
│    │   └─ team_id, user_id, channel_id のホワイトリスト確認  │
│    │   └─ AND条件: すべてのエンティティが認可済み            │
│    │   └─ DynamoDB/Secrets Manager/環境変数から読み込み      │
│    │   └─ メモリ内キャッシュ (5分TTL)                        │
│    │   └─ fail-closed (未認可時は403)                        │
│    │                                                         │
│    ├─ 3d. イベント重複排除                                  │
│    │   └─ DynamoDB (slack-event-dedupe)                     │
│    │   └─ 重複イベントは即座に200 OKを返す                  │
│    │                                                         │
│    └─ 3e. 入力検証                                          │
│        └─ メッセージ長、空文字チェック                       │
│    ↓ すべて成功時のみ次へ                                   │
├─────────────────────────────────────────────────────────────┤
│ 4. ExecutionApi (API Gateway)                                │
│    ↓ IAM 認証                                                │
│    [リソースポリシー: SlackEventHandlerロールのみ許可]       │
│    [内部API保護]                                             │
├─────────────────────────────────────────────────────────────┤
│ 5. BedrockProcessor (実行層)                                 │
│    ↓ IAM ロール認証                                          │
│    [最小権限: Bedrock呼び出しのみ]                           │
│    └─ Bedrock Converse API 呼び出し                          │
└─────────────────────────────────────────────────────────────┘
```

### 各レイヤーの責任範囲

| レイヤー              | 責任範囲                  | 認証方式                     | 失敗時の動作   |
| --------------------- | ------------------------- | ---------------------------- | -------------- |
| **Slack**             | ユーザー認証              | SSO + MFA                    | リクエスト不可 |
| **Function URL**      | エンドポイント公開        | なし（署名検証は Lambda 内） | -              |
| **SlackEventHandler** | 署名検証、Existence Check | Signing Secret + Bot Token   | 401/403 を返す |
| **ExecutionApi**      | 内部 API 保護             | IAM 認証                     | 403 を返す     |
| **BedrockProcessor**  | AI 処理実行               | IAM ロール                   | エラーログ     |

---

## Two-Key Defense（2 鍵防御）モデル

### 概要

Two-Key Defense は、2 つの独立した鍵（Signing Secret と Bot Token）を使用して、いずれか一方が漏洩しても攻撃を防ぐセキュリティモデルです。

### 鍵 1: Signing Secret（署名シークレット）

**目的**: リクエストの真正性を確認

**実装**:

- HMAC SHA256 署名検証
- タイムスタンプ検証（±5 分以内）
- リプレイアタック防止

**検証フロー**:

```
1. Slack がリクエストに X-Slack-Signature ヘッダーを追加
2. Lambda が Signing Secret を使用して署名を再計算
3. 計算された署名と受信した署名を定数時間比較
4. 一致しない場合、401 Unauthorized を返す
```

**コード例**:

```python
# lambda/slack-event-handler/slack_verifier.py
def verify_signature(
    body: str,
    timestamp: str,
    signature: str,
    signing_secret: str
) -> bool:
    # タイムスタンプ検証（リプレイアタック防止）
    current_time = int(time.time())
    request_time = int(timestamp)
    if abs(current_time - request_time) > 300:  # 5分
        return False

    # HMAC SHA256 署名計算
    basestring = f"v0:{timestamp}:{body}".encode("utf-8")
    expected_signature = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        basestring,
        hashlib.sha256
    ).hexdigest()

    # 定数時間比較（タイミング攻撃防止）
    return hmac.compare_digest(expected_signature, signature)
```

### 鍵 2: Bot Token（Existence Check）

**目的**: エンティティ（team_id, user_id, channel_id）の実在性を動的に確認

**実装**:

- Slack API を使用した動的検証
- DynamoDB キャッシュ（5 分 TTL）
- fail-closed 原則（検証失敗時はリクエスト拒否）

**検証フロー**:

```
1. DynamoDB キャッシュをチェック
2. キャッシュミスの場合、Slack API を呼び出し:
   - team.info(team=team_id)
   - users.info(user=user_id)
   - conversations.info(channel=channel_id)
3. すべて成功した場合、DynamoDB にキャッシュ（5分TTL）
4. いずれか失敗した場合、403 Forbidden を返す
```

**コード例**:

```python
# lambda/slack-event-handler/existence_check.py
def check_entity_existence(
    bot_token: str,
    team_id: Optional[str] = None,
    user_id: Optional[str] = None,
    channel_id: Optional[str] = None,
) -> bool:
    # キャッシュチェック
    cache_key = f"{team_id}#{user_id}#{channel_id}"
    cached_result = get_from_cache(cache_key)
    if cached_result:
        return True  # キャッシュヒット

    # Slack API 呼び出し
    client = WebClient(token=bot_token, timeout=2)

    if team_id:
        result = client.team_info(team=team_id)
        if not result.get("ok"):
            raise ExistenceCheckError(f"Team not found: {team_id}")

    if user_id:
        result = client.users_info(user=user_id)
        if not result.get("ok"):
            raise ExistenceCheckError(f"User not found: {user_id}")

    if channel_id:
        result = client.conversations_info(channel=channel_id)
        if not result.get("ok"):
            raise ExistenceCheckError(f"Channel not found: {channel_id}")

    # キャッシュに保存（5分TTL）
    save_to_cache(cache_key, ttl=300)
    return True
```

### Two-Key Defense の利点

1. **攻撃面の縮小**: Signing Secret のみ漏洩しても、Bot Token がなければ攻撃不可
2. **動的検証**: 削除されたユーザー/チャンネルからのリクエストを即座に検出
3. **偽造リクエスト検出**: 攻撃者が任意の team_id/user_id/channel_id を使用したリクエストを検出
4. **パフォーマンス最適化**: DynamoDB キャッシュにより、Slack API 呼び出しを最小化

---

## 各レイヤーの詳細解説

### レイヤー 1: Slack（ユーザー認証）

**責任**: ユーザーの本人確認

**実装**:

- SSO（Single Sign-On）
- MFA（Multi-Factor Authentication）
- IP 制限（オプション）

**セキュリティ効果**:

- 不正アクセス防止
- アカウント乗っ取り防止

### レイヤー 2: Function URL（エンドポイント公開）

**責任**: パブリックエンドポイントの提供

**実装**:

- Lambda Function URL（認証なし）
- 署名検証は Lambda 内で実施

**セキュリティ効果**:

- Function URL が漏洩しても、署名検証で不正アクセスをブロック

### レイヤー 3: SlackEventHandler（検証層）

#### 3a. HMAC SHA256 署名検証

**目的**: リクエストが Slack から送信されたことを確認

**実装詳細**:

- Signing Secret を AWS Secrets Manager から取得
- タイムスタンプ検証（±5 分以内）
- 定数時間比較（タイミング攻撃防止）

**失敗時の動作**:

- 401 Unauthorized を返す
- セキュリティイベントをログに記録

#### 3b. Slack API Existence Check

**目的**: エンティティの実在性を動的に確認

**実装詳細**:

- Bot Token を使用して Slack API を呼び出し
- キャッシュ戦略: DynamoDB（5 分 TTL）
- エラーハンドリング: レート制限時は指数バックオフでリトライ（最大 3 回）
- タイムアウト: 2 秒（fail-closed）

**失敗時の動作**:

- 403 Forbidden を返す
- CloudWatch メトリクス `ExistenceCheckFailed` を発行
- セキュリティイベントをログに記録

#### 3c. 認可（ホワイトリスト）

**目的**: 認可済みのワークスペース、ユーザー、チャンネルのみがAI機能にアクセスできるようにする

**実装詳細**:

- team_id、user_id、channel_id の3つのエンティティすべてがホワイトリストに含まれているか確認（AND条件）
- ホワイトリスト設定ソース（優先順位）:
  1. DynamoDB (推奨): 動的更新、即座に反映（キャッシュTTL 5分を除く）
  2. AWS Secrets Manager (セカンダリ): 機密情報として管理、暗号化、ローテーション対応
  3. 環境変数 (フォールバック): シンプル、再デプロイ必要
- メモリ内キャッシュ（5分TTL）でパフォーマンス最適化
- O(1) ルックアップ（set データ構造使用）

**失敗時の動作**:

- 403 Forbidden を返す
- CloudWatch メトリクス `WhitelistAuthorizationFailed` を発行
- セキュリティイベントをログに記録（unauthorized_entities を含む）

**セキュリティ効果**:

- 未認可アクセスの防止
- 最小権限の原則の実現
- 動的なアクセス制御

#### 3d. イベント重複排除

**目的**: 重複イベントの処理を防止

**実装詳細**:

- DynamoDB テーブル `slack-event-dedupe` を使用
- event_id をキーとして重複チェック
- 重複イベントは即座に 200 OK を返す

**セキュリティ効果**:

- リプレイアタック防止
- 重複処理によるコスト増大防止

#### 3e. 入力検証

**目的**: 不正な入力を検出

**実装詳細**:

- メッセージ長チェック（最大 4000 文字）
- 空文字チェック

**失敗時の動作**:

- ユーザーフレンドリーなエラーメッセージを返す
- リクエストは処理しない

### レイヤー 4: ExecutionApi（IAM 認証）

**目的**: 内部 API の保護

**実装詳細**:

- API Gateway REST API
- IAM 認証のみ（パブリックアクセス不可）
- リソースポリシー: SlackEventHandler ロールのみ許可

**IAM ポリシー例**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:role/SlackEventHandlerRole"
      },
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:REGION:ACCOUNT_ID:API_ID/*"
    }
  ]
}
```

**セキュリティ効果**:

- 内部 API への不正アクセス防止
- 最小権限の原則

### レイヤー 5: BedrockProcessor（実行層）

**目的**: AI 処理の実行

**実装詳細**:

- IAM ロール認証
- 最小権限: Bedrock 呼び出しのみ
- Bedrock Converse API 呼び出し

**IAM ロールポリシー例**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:REGION::inference-profile/MODEL_ID"
    }
  ]
}
```

---

## 攻撃シナリオと防御メカニズム

### シナリオ 1: Signing Secret のみ漏洩

**攻撃者の行動**:

1. Signing Secret を取得
2. 任意の team_id/user_id/channel_id でリクエストを偽造
3. 正しい署名を生成してリクエストを送信

**防御メカニズム**:

- 署名検証（鍵 1）は通過
- Existence Check（鍵 2）で失敗
  - 攻撃者が使用した team_id/user_id/channel_id が実在しない場合、Slack API がエラーを返す
  - Bot Token がなければ Slack API を呼び出せない
- **結果**: 403 Forbidden を返し、攻撃をブロック

### シナリオ 2: Bot Token のみ漏洩

**攻撃者の行動**:

1. Bot Token を取得
2. リクエストを送信

**防御メカニズム**:

- 署名検証（鍵 1）で失敗
  - Signing Secret がないため、正しい署名を生成できない
- **結果**: 401 Unauthorized を返し、攻撃をブロック

### シナリオ 3: Signing Secret + Bot Token の両方漏洩

**攻撃者の行動**:

1. 両方の鍵を取得
2. 正規の team_id/user_id/channel_id でリクエストを送信

**防御メカニズム**:

- 署名検証（鍵 1）は通過
- Existence Check（鍵 2）も通過（実在エンティティのため）
- しかし、後続レイヤーで防御:
  - トークン数制限
- **結果**: 多層防御により、攻撃の影響を最小化

### シナリオ 4: リプレイアタック

**攻撃者の行動**:

1. 正規のリクエストをキャプチャ
2. 同じリクエストを再送信

**防御メカニズム**:

- タイムスタンプ検証（±5 分以内）
- イベント重複排除（DynamoDB）
- **結果**: 重複イベントは即座に 200 OK を返し、処理しない

### シナリオ 5: 削除されたユーザー/チャンネルからのリクエスト

**攻撃者の行動**:

1. 削除されたユーザー/チャンネルの ID を使用
2. リクエストを送信

**防御メカニズム**:

- Existence Check（鍵 2）で失敗
  - Slack API が "user_not_found" または "channel_not_found" を返す
- **結果**: 403 Forbidden を返し、攻撃をブロック

---

## 実装詳細

### 署名検証の実装

**ファイル**: `lambda/slack-event-handler/slack_verifier.py`

```python
def verify_signature(
    body: Optional[str],
    timestamp: Optional[str],
    signature: Optional[str],
    signing_secret: Optional[str]
) -> bool:
    """
    HMAC SHA256 を使用してSlackリクエスト署名を検証する。

    Args:
        body: 生のリクエストボディ（文字列）
        timestamp: X-Slack-Request-Timestampヘッダー値
        signature: X-Slack-Signatureヘッダー値
        signing_secret: AWS Secrets ManagerからのSlack署名シークレット

    Returns:
        署名が有効でタイムスタンプが新しい場合はTrue
    """
    # タイムスタンプの新鮮さを検証（リプレイアタック防止）
    current_time = int(time.time())
    request_time = int(timestamp)

    if abs(current_time - request_time) > 300:  # 5分
        return False

    # 期待される署名を計算
    basestring = f"v0:{timestamp}:{body}".encode("utf-8")
    expected_signature = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        basestring,
        hashlib.sha256
    ).hexdigest()

    # 定数時間比較（タイミング攻撃を防止）
    return hmac.compare_digest(expected_signature, signature)
```

### Existence Check の実装

**ファイル**: `lambda/slack-event-handler/existence_check.py`

```python
def check_entity_existence(
    bot_token: str,
    team_id: Optional[str] = None,
    user_id: Optional[str] = None,
    channel_id: Optional[str] = None,
) -> bool:
    """
    Verify that team_id, user_id, and channel_id exist in Slack.

    This function implements the second key in the two-key defense model.
    """
    # キャッシュチェック
    cache_key = f"{team_id}#{user_id}#{channel_id}"
    cached_result = get_from_cache(cache_key)
    if cached_result:
        return True  # キャッシュヒット

    # Slack API 呼び出し（2秒タイムアウト）
    client = WebClient(token=bot_token, timeout=2)

    # team_id 検証
    if team_id:
        result = client.team_info(team=team_id)
        if not result.get("ok"):
            raise ExistenceCheckError(f"Team not found: {team_id}")

    # user_id 検証
    if user_id:
        result = client.users_info(user=user_id)
        if not result.get("ok"):
            raise ExistenceCheckError(f"User not found: {user_id}")

    # channel_id 検証
    if channel_id:
        result = client.conversations_info(channel=channel_id)
        if not result.get("ok"):
            raise ExistenceCheckError(f"Channel not found: {channel_id}")

    # キャッシュに保存（5分TTL）
    save_to_cache(cache_key, ttl=300)
    return True
```

### Execution API の IAM 認証

**ファイル**: `cdk/lib/constructs/execution-api.ts`

```typescript
// API Gateway リソースポリシー
const resourcePolicy = new iam.PolicyDocument({
  statements: [
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ArnPrincipal(verificationLambdaRoleArn)],
      actions: ["execute-api:Invoke"],
      resources: [api.arnForExecuteApi("*")],
    }),
  ],
});

// API Gateway にリソースポリシーを設定
api.addApiKey("ExecutionApiKey", {
  apiKeyName: `${stackName}-execution-api-key`,
  description: "API Key for Execution API (IAM authentication)",
});

// Lambda に IAM 権限を付与
verificationLambda.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["execute-api:Invoke"],
    resources: [api.arnForExecuteApi("*")],
  })
);
```

---

## モニタリングとアラート

### CloudWatch メトリクス

| メトリクス名              | 説明                         | アラーム閾値      |
| ------------------------- | ---------------------------- | ----------------- |
| `ExistenceCheckFailed`    | Existence Check 失敗回数     | 5 分間に 5 回以上 |
| `ExistenceCheckCacheHit`  | キャッシュヒット回数         | -                 |
| `ExistenceCheckCacheMiss` | キャッシュミス回数           | -                 |
| `SlackAPILatency`         | Slack API 呼び出しレイテンシ | p95 > 500ms       |

### CloudWatch アラーム

**Existence Check 失敗アラーム**:

```typescript
const existenceCheckAlarm = new cloudwatch.Alarm(
  this,
  "ExistenceCheckFailedAlarm",
  {
    alarmName: `${stackName}-existence-check-failed`,
    alarmDescription: "Alert when Existence Check failures exceed threshold",
    metric: new cloudwatch.Metric({
      namespace: "SlackEventHandler",
      metricName: "ExistenceCheckFailed",
      statistic: "Sum",
      period: cdk.Duration.minutes(5),
    }),
    threshold: 5,
    evaluationPeriods: 1,
    comparisonOperator:
      cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  }
);
```

### セキュリティログ

**構造化ログ例**:

```json
{
  "level": "ERROR",
  "event": "existence_check_failed",
  "correlation_id": "req-abc123",
  "team_id": "T12345",
  "user_id": "U67890",
  "channel_id": "C11111",
  "error": "Team not found: T12345",
  "timestamp": "2025-12-30T10:15:30Z"
}
```

---

## ベストプラクティス

### 1. シークレット管理

- ✅ AWS Secrets Manager を使用
- ✅ シークレットローテーション（90 日ごと）
- ✅ 環境変数には保存しない（本番環境）
- ✅ 最小権限の原則（読み取り専用アクセス）

### 2. エラーハンドリング

- ✅ fail-closed 原則（検証失敗時はリクエスト拒否）
- ✅ セキュリティイベントをログに記録
- ✅ ユーザーには詳細なエラー情報を返さない
- ✅ 管理者には CloudWatch アラームで通知

### 3. パフォーマンス最適化

- ✅ DynamoDB キャッシュ（5 分 TTL）
- ✅ キャッシュヒット率の監視（目標: ≥80%）
- ✅ Slack API 呼び出しのタイムアウト設定（2 秒）
- ✅ レート制限時の指数バックオフリトライ

### 4. モニタリング

- ✅ CloudWatch メトリクスの定期監視
- ✅ セキュリティイベントのアラート設定
- ✅ ログの長期保存（365 日）
- ✅ 定期的なセキュリティ監査（30 日ごと）

### 5. インシデント対応

- ✅ セキュリティイベント発生時の即座の対応
- ✅ シークレット漏洩時の即座のローテーション
- ✅ 攻撃パターンの分析と対策
- ✅ 事後レビューと改善

---

## 関連ドキュメント

- [セキュリティ要件](./requirements.md) - 機能的・非機能的セキュリティ要件
- [脅威モデル](./threat-model.md) - リスク分析とアクター
- [セキュリティ実装](./implementation.md) - 多層防御の実装詳細
- [ADR-004](../adr/004-slack-api-existence-check.md) - Existence Check の採用理由
- [アーキテクチャ概要](../architecture/overview.md) - セキュリティ設計の原則

---

**最終更新**: 2025-12-30
**バージョン**: 1.0
