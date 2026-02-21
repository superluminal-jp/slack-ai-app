# セキュリティ

**目的**: 認証・認可、脅威モデル、セキュリティ要件、実装詳細、CMK を包括的に説明する。
**対象読者**: 開発者、セキュリティエンジニア
**最終更新日**: 2026-02-14

---

## 目次

1. [概要（Two-Key Defense）](#概要two-key-defense)
2. [認証・認可](#認証認可)
3. [脅威モデル](#脅威モデル)
4. [セキュリティ要件](#セキュリティ要件)
5. [実装詳細](#実装詳細)
6. [Bedrock CMK 検討](#bedrock-cmk-検討)

---

## 概要（Two-Key Defense）

> **Two-Key Defense（2 鍵防御）モデル**
>
> 本システムは、Signing Secret と Bot Token の両方が必要となる 2 鍵防御モデルを採用しています。
> いずれか一方が漏洩しても、もう一方がなければ攻撃は成功しません。

本システムは、Slack ワークスペースから AWS Bedrock を利用して AI 機能を提供する際の認証・認可を、**多層防御（Defense in Depth）**と**Two-Key Defense（2 鍵防御）**モデルで実現しています。

### セキュリティの基本原則

1. **Fail-Closed（失敗時は閉じる）**: 認証・認可が失敗した場合、リクエストを即座に拒否
2. **最小権限の原則**: 各コンポーネントは必要最小限の権限のみを持つ
3. **多層防御**: 単一の防御レイヤーに依存せず、複数のレイヤーで防御
4. **動的検証**: 静的ホワイトリストではなく、動的にエンティティの実在性を確認

### 各レイヤーの責任範囲

| レイヤー              | 責任範囲                  | 認証方式                     | 失敗時の動作   |
| --------------------- | ------------------------- | ---------------------------- | -------------- |
| **Slack**             | ユーザー認証              | SSO + MFA                    | リクエスト不可 |
| **Function URL**      | エンドポイント公開        | なし（署名検証は Lambda 内） | -              |
| **SlackEventHandler** | 署名検証、Existence Check | Signing Secret + Bot Token   | 401/403 を返す |
| **Execution Runtime** | 実行ゾーン保護            | IAM + リソースポリシー       | AccessDenied   |
| **Execution Agent**   | AI 処理実行               | IAM ロール                   | エラーログ     |

---

## 認証・認可

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
│ 4. Execution Runtime (AgentCore A2A)                         │
│    ↓ IAM + リソースポリシー                                  │
│    [InvokeAgentRuntime を許可された Runtime/Endpoint のみ]   │
│    [実行ゾーン保護]                                           │
├─────────────────────────────────────────────────────────────┤
│ 5. Execution Agent (実行層)                                  │
│    ↓ IAM ロール認証                                          │
│    [最小権限: Bedrock呼び出しのみ]                           │
│    └─ Bedrock Converse API 呼び出し                          │
└─────────────────────────────────────────────────────────────┘
```

### Two-Key Defense（2 鍵防御）モデル

Two-Key Defense は、2 つの独立した鍵（Signing Secret と Bot Token）を使用して、いずれか一方が漏洩しても攻撃を防ぐセキュリティモデルです。

#### 鍵 1: Signing Secret（署名シークレット）

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
# verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/slack_verifier.py
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

#### 鍵 2: Bot Token（Existence Check）

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
# cdk/lib/verification/lambda/slack-event-handler/existence_check.py
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

#### Two-Key Defense の利点

1. **攻撃面の縮小**: Signing Secret のみ漏洩しても、Bot Token がなければ攻撃不可
2. **動的検証**: 削除されたユーザー/チャンネルからのリクエストを即座に検出
3. **偽造リクエスト検出**: 攻撃者が任意の team_id/user_id/channel_id を使用したリクエストを検出
4. **パフォーマンス最適化**: DynamoDB キャッシュにより、Slack API 呼び出しを最小化

### 各レイヤーの詳細解説

#### レイヤー 1: Slack（ユーザー認証）

**責任**: ユーザーの本人確認

**実装**:

- SSO（Single Sign-On）
- MFA（Multi-Factor Authentication）
- IP 制限（オプション）

**セキュリティ効果**:

- 不正アクセス防止
- アカウント乗っ取り防止

#### レイヤー 2: Function URL（エンドポイント公開）

**責任**: パブリックエンドポイントの提供

**実装**:

- Lambda Function URL（認証なし）
- 署名検証は Lambda 内で実施

**セキュリティ効果**:

- Function URL が漏洩しても、署名検証で不正アクセスをブロック

#### レイヤー 3: SlackEventHandler（検証層）

##### 3a. HMAC SHA256 署名検証

**目的**: リクエストが Slack から送信されたことを確認

**実装詳細**:

- Signing Secret を AWS Secrets Manager から取得
- タイムスタンプ検証（±5 分以内）
- 定数時間比較（タイミング攻撃防止）

**失敗時の動作**:

- 401 Unauthorized を返す
- セキュリティイベントをログに記録

##### 3b. Slack API Existence Check

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

##### 3c. 認可（ホワイトリスト）

**目的**: 認可済みのワークスペース、ユーザー、チャンネルのみが AI 機能にアクセスできるようにする

**実装詳細**:

- 柔軟なホワイトリスト認可: 設定されたエンティティのみをチェック（条件付き AND 条件）
- team_id、user_id、channel_id のうち、ホワイトリストに設定されているエンティティのみがチェックされる
- 設定されていないエンティティ（空のセット）はチェックをスキップ（制限なし）
- すべてのエンティティが未設定（空のホワイトリスト）の場合、すべてのリクエストが許可される
- すべてのエンティティが設定されている場合、従来通りすべてがホワイトリストに含まれている必要がある（後方互換性）
- ホワイトリスト設定ソース（優先順位）:
  1. DynamoDB (推奨): 動的更新、即座に反映（キャッシュ TTL 5 分を除く）
  2. AWS Secrets Manager (セカンダリ): 機密情報として管理、暗号化、ローテーション対応
  3. 環境変数 (フォールバック): シンプル、再デプロイ必要
- メモリ内キャッシュ（5 分 TTL）でパフォーマンス最適化
- O(1) ルックアップ（set データ構造使用）

**失敗時の動作**:

- 設定読み込み失敗時: 403 Forbidden を返す（fail-closed 動作を維持）
- 設定されたエンティティが未認可の場合: 403 Forbidden を返す
- CloudWatch メトリクス `WhitelistAuthorizationFailed` を発行
- セキュリティイベントをログに記録（unauthorized_entities、checked_entities、skipped_entities を含む）

**セキュリティ効果**:

- 未認可アクセスの防止
- 最小権限の原則の実現
- 動的なアクセス制御

##### 3d. イベント重複排除

**目的**: 重複イベントの処理を防止

**実装詳細**:

- DynamoDB テーブル `slack-event-dedupe` を使用
- event_id をキーとして重複チェック
- 重複イベントは即座に 200 OK を返す

**セキュリティ効果**:

- リプレイアタック防止
- 重複処理によるコスト増大防止

##### 3e. 入力検証

**目的**: 不正な入力を検出

**実装詳細**:

- メッセージ長チェック（最大 4000 文字）
- 空文字チェック

**失敗時の動作**:

- ユーザーフレンドリーなエラーメッセージを返す
- リクエストは処理しない

#### レイヤー 4: Execution Runtime（AgentCore A2A 認可）

**目的**: 実行ゾーン Runtime への不正呼び出し防止

**実装詳細**:

- 呼び出し元 IAM: Verification 実行ロールに `bedrock-agentcore:InvokeAgentRuntime` を付与
- 呼び出し先リソースポリシー: 各 Execution Runtime で Principal を限定
- 対象リソース: Runtime ARN と DEFAULT Endpoint ARN の両方

**リソースポリシー例**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowVerificationAgentInvoke",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:role/SlackAI-Verification-Dev-ExecutionRole"
      },
      "Action": "bedrock-agentcore:InvokeAgentRuntime",
      "Resource": "arn:aws:bedrock-agentcore:REGION:ACCOUNT_ID:runtime/RUNTIME_ID",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "ACCOUNT_ID"
        }
      }
    }
  ]
}
```

**セキュリティ効果**:

- 実行 Runtime への不正呼び出し防止
- 最小権限の原則
- クロスアカウント境界の明確化

#### レイヤー 5: Execution Agent（実行層）

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

### 攻撃シナリオと防御メカニズム

#### シナリオ 1: Signing Secret のみ漏洩

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

#### シナリオ 2: Bot Token のみ漏洩

**攻撃者の行動**:

1. Bot Token を取得
2. リクエストを送信

**防御メカニズム**:

- 署名検証（鍵 1）で失敗
  - Signing Secret がないため、正しい署名を生成できない
- **結果**: 401 Unauthorized を返し、攻撃をブロック

#### シナリオ 3: Signing Secret + Bot Token の両方漏洩

**攻撃者の行動**:

1. 両方の鍵を取得
2. 正規の team_id/user_id/channel_id でリクエストを送信

**防御メカニズム**:

- 署名検証（鍵 1）は通過
- Existence Check（鍵 2）も通過（実在エンティティのため）
- しかし、後続レイヤーで防御:
  - トークン数制限
- **結果**: 多層防御により、攻撃の影響を最小化

#### シナリオ 4: リプレイアタック

**攻撃者の行動**:

1. 正規のリクエストをキャプチャ
2. 同じリクエストを再送信

**防御メカニズム**:

- タイムスタンプ検証（±5 分以内）
- イベント重複排除（DynamoDB）
- **結果**: 重複イベントは即座に 200 OK を返し、処理しない

#### シナリオ 5: 削除されたユーザー/チャンネルからのリクエスト

**攻撃者の行動**:

1. 削除されたユーザー/チャンネルの ID を使用
2. リクエストを送信

**防御メカニズム**:

- Existence Check（鍵 2）で失敗
  - Slack API が "user_not_found" または "channel_not_found" を返す
- **結果**: 403 Forbidden を返し、攻撃をブロック

### 署名検証の実装

**ファイル**: `cdk/lib/verification/lambda/slack-event-handler/slack_verifier.py`

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

**ファイル**: `cdk/lib/verification/lambda/slack-event-handler/existence_check.py`

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

### AgentCore A2A の IAM 認証

**ファイル**: `verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts` ほか

```typescript
// Verification 実行ロールに Runtime/Endpoint 両方を許可
verificationRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["bedrock-agentcore:InvokeAgentRuntime"],
    resources: [runtimeArn, endpointArn],
  })
);
```

```python
# Execution Runtime 側にリソースポリシーを適用
client.put_resource_policy(
    resourceArn=execution_agent_arn,
    policy=json.dumps(policy_document),
)
```

### モニタリングとアラート

#### CloudWatch メトリクス

| メトリクス名              | 説明                         | アラーム閾値      |
| ------------------------- | ---------------------------- | ----------------- |
| `ExistenceCheckFailed`    | Existence Check 失敗回数     | 5 分間に 5 回以上 |
| `ExistenceCheckCacheHit`  | キャッシュヒット回数         | -                 |
| `ExistenceCheckCacheMiss` | キャッシュミス回数           | -                 |
| `SlackAPILatency`         | Slack API 呼び出しレイテンシ | p95 > 500ms       |

#### CloudWatch アラーム

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

#### セキュリティログ

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

### ベストプラクティス

#### 1. シークレット管理

- AWS Secrets Manager を使用
- シークレットローテーション（90 日ごと）
- 環境変数には保存しない（本番環境）
- 最小権限の原則（読み取り専用アクセス）

#### 2. エラーハンドリング

- fail-closed 原則（検証失敗時はリクエスト拒否）
- セキュリティイベントをログに記録
- ユーザーには詳細なエラー情報を返さない
- 管理者には CloudWatch アラームで通知

#### 3. パフォーマンス最適化

- DynamoDB キャッシュ（5 分 TTL）
- キャッシュヒット率の監視（目標: ≥80%）
- Slack API 呼び出しのタイムアウト設定（2 秒）
- レート制限時の指数バックオフリトライ

#### 4. モニタリング

- CloudWatch メトリクスの定期監視
- セキュリティイベントのアラート設定
- ログの長期保存（365 日）
- 定期的なセキュリティ監査（30 日ごと）

#### 5. インシデント対応

- セキュリティイベント発生時の即座の対応
- シークレット漏洩時の即座のローテーション
- 攻撃パターンの分析と対策
- 事後レビューと改善

---

## 脅威モデル

### 5.1 脅威アクター

| アクター                   | 能力                                       | 意図                                         |
| -------------------------- | ------------------------------------------ | -------------------------------------------- |
| 外部攻撃者                 | ネットワークアクセス、漏洩したシークレット | データ流出、サービス妨害                     |
| 悪意のある内部者           | Slack ワークスペースアクセス               | 不正質問、機密情報抽出、モデル乱用           |
| 侵害されたボットアカウント | フルボットトークンスコープ                 | 自動化されたプロンプト攻撃、コスト増大       |
| 好奇心旺盛なユーザー       | 正規 Slack アクセス                        | ジェイルブレイク試行、システムプロンプト抽出 |

### 5.2 脅威分析（AI 特有の脅威を含む）

| 脅威 ID  | 脅威                               | 攻撃ベクター                         | 影響                                       | 可能性 | リスク         | 緩和レイヤー                                                    |
| -------- | ---------------------------------- | ------------------------------------ | ------------------------------------------ | ------ | -------------- | --------------------------------------------------------------- |
| T-01     | 署名シークレット漏洩               | GitHub コミット、ログ露出、内部者    | リクエスト偽造（但し実在エンティティのみ） | 中     | 中（従来: 高） | Slack API Existence Check、SlackEventHandler 認可、モニタリング |
| T-02     | Slack アカウント乗っ取り           | フィッシング、認証情報総当たり       | 不正質問実行                               | 中     | 高             | SSO+MFA、IP 制限                                                |
| T-03     | リプレイアタック                   | ネットワークキャプチャ               | 重複質問実行                               | 低     | 中             | タイムスタンプ検証、nonce 追跡                                  |
| T-04     | Function URL 漏洩                  | ログ露出、ドキュメント               | 直接呼び出し試行                           | 高     | 中             | 署名検証（シークレットなしで失敗）                              |
| T-05     | SlackEventHandler IAM ロール侵害   | AWS 認証情報漏洩                     | 内部 API アクセス                          | 低     | 致命的         | 最小権限、認証情報ローテーション                                |
| T-06     | コマンドインジェクション           | サニタイズされていない Slack 入力    | Execution Agent での不正実行               | 低     | 致命的         | 入力検証、パラメータ化クエリ                                    |
| T-07     | DDoS / レート乱用                  | Slack API 自動化                     | サービス利用不可、高額コスト               | 中     | 中             | WAF レート制限、ユーザー単位スロットリング                      |
| T-08     | 権限昇格                           | 誤設定された IAM ポリシー            | 不正リソースアクセス                       | 低     | 高             | IAM ポリシーレビュー、最小権限                                  |
| **T-11** | **モデル乱用（コスト）**           | **大量リクエスト、長いコンテキスト** | **高額な Bedrock コスト**                  | **高** | **中**         | **トークン制限、クォータ**                                      |
| **T-12** | **コンテキスト履歴からの情報漏洩** | **他ユーザーのコンテキストアクセス** | **機密情報露出**                           | **低** | **高**         | **コンテキスト ID の分離、アクセス制御**                        |

**リスク評価**: 致命的 = 即時対応、高 = 優先修正、中 = 計画的緩和、低 = モニタリング

### T-01 詳細分析: 署名シークレット漏洩時の防御メカニズム

Slack API Existence Check により、署名シークレット漏洩時のリスクは「高」から「中」に軽減されます：

**攻撃シナリオ 1: Signing Secret のみ漏洩**

- 攻撃者は正しい署名を生成可能
- 任意の team_id/user_id/channel_id を使用したリクエストは Existence Check で失敗
- Slack API 呼び出しには Bot Token が必要（攻撃者は持っていない）
- **結果**: 攻撃はブロックされる

**攻撃シナリオ 2: 実在エンティティへの攻撃**

- 攻撃者が正規の team_id/user_id/channel_id を発見
- Existence Check は通過（実在するため）
- しかし、認可レイヤー（ホワイトリスト）で検出可能
- **結果**: 認可レイヤーで防御

**攻撃シナリオ 3: Signing Secret + Bot Token の両方漏洩**

- 両方の鍵が漏洩した場合、Existence Check は突破される
- これは正規ワークスペースの完全侵害を意味する
- **結果**: Guardrails などの後続レイヤーで防御

**セキュリティ原則**: 防御の深層化（Defense in Depth）

- Existence Check は単独の防御ではなく、多層防御の 1 層として機能
- Signing Secret 漏洩の影響範囲を大幅に縮小

---

## セキュリティ要件

> **セキュリティファースト原則**
>
> 本システムは、AI の特性を考慮した**多層認証・認可**を採用しています。
> すべてのリクエストは以下の認証・認可レイヤーを通過する必要があります：
>
> 1. Slack 署名検証（HMAC SHA256）
> 2. Slack API 動的実在性確認（team_id, user_id, channel_id）
> 3. ホワイトリスト認可
> 4. IAM 認証（内部 API）
>
> **2 鍵防御**: いずれかの鍵（Signing Secret または Bot Token）が漏洩しても、
> 両方なければ攻撃は成功しません。

### 防御可能な脅威一覧

本システムの多層防御アーキテクチャは、以下の脅威に対して効果的な防御を提供します：

#### 認証・認可関連の脅威

- **T-01: 署名シークレット漏洩** → 2 鍵防御（Existence Check）により影響を「高」から「中」に軽減
- **T-02: Slack アカウント乗っ取り** → SSO + MFA、IP 制限で防御
- **T-03: リプレイアタック** → タイムスタンプ検証（±5 分）で防御
- **T-04: Function URL 漏洩** → 署名検証により不正アクセスをブロック
- **T-05: Lambda IAM ロール侵害** → 最小権限の原則、認証情報ローテーション
- **T-08: 権限昇格** → ホワイトリスト認可、IAM ポリシーレビュー

#### AI 特有の脅威

- **T-11: モデル乱用（コスト）** → トークン制限（モデル最大値）、ユーザー単位レート制限
- **T-12: コンテキスト履歴情報漏洩** → コンテキスト ID 分離、DynamoDB 暗号化
- **T-13: プロンプトインジェクション** → パターンベース検出、入力検証強化

#### その他の脅威

- **T-06: コマンドインジェクション** → 入力検証、パラメータ化クエリ、プロンプトインジェクション検出
- **T-07: DDoS / レート乱用** → DynamoDB ベースのユーザー単位スロットリング（実装済み）

### 認証・認可フロー

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Slack User Request                                       │
│    ↓ SSO + MFA (Slack レイヤー)                            │
├─────────────────────────────────────────────────────────────┤
│ 2. SlackEventHandler Function URL                            │
│    ↓ Function URL (認証なし、署名検証はLambda内で実施)      │
├─────────────────────────────────────────────────────────────┤
│ 3. SlackEventHandler (検証層)                                │
│    ├─ 3a. 署名検証 (Signing Secret) ← 鍵1                  │
│    ├─ 3b. Existence Check (Bot Token) ← 鍵2                │
│    │   └─ Slack API (team.info, users.info, conversations) │
│    └─ 3c. 認可 (ホワイトリスト)                            │
│    ↓ すべて成功時のみ次へ                                   │
├─────────────────────────────────────────────────────────────┤
│ 4. Execution Runtime (IAM + リソースポリシー)               │
│    ↓                                                         │
├─────────────────────────────────────────────────────────────┤
│ 5. Execution Agent → Bedrock                                 │
│    └─ Guardrails                                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.1 機能的セキュリティ要件

#### SR-01: Slack 署名検証

- Slack からのすべてのリクエストは、HMAC SHA256 署名を使用して検証されなければなりません
- タイムスタンプが ±5 分以内であることを確認し、リプレイアタックを防止

#### SR-02: 認可

- team_id、user_id、channel_id によるホワイトリスト認可

#### SR-03: トークン数制限（AI 特有）

- 各リクエストはモデルが許容する最大トークン数を使用します
- モデルごとの最大値:
  - Claude 4.5 Sonnet/Haiku/Opus: 8192 tokens (すべての4.5シリーズ)
  - Amazon Nova Pro: 8192 tokens
  - Amazon Nova Lite: 4096 tokens
- 環境変数 `BEDROCK_MAX_TOKENS` で上書き可能

#### SR-04: Slack API Existence Check (Dynamic Entity Verification)

すべてのリクエストは、Slack API を使用して team_id、user_id、channel_id が実在するエンティティであることを動的に検証しなければなりません。

**セキュリティモデル**:

- Slack API (team.info, users.info, conversations.info) による実在性確認

#### SR-05: 添付ファイルセキュリティ

添付ファイル処理に関するセキュリティ要件：

- **SR-07-01**: ファイルサイズ検証 - 画像は最大 10MB、ドキュメントは最大 5MB を超えるファイルは処理を拒否
- **SR-07-02**: ファイルタイプ検証 - 対応ファイル形式（画像: PNG, JPEG, GIF, WebP、ドキュメント: PDF, DOCX, CSV, XLSX, PPTX, TXT）のみ処理
- **SR-07-03**: ダウンロード URL 検証 - Slack CDN からのダウンロードのみ許可、`files.info` API を使用して最新の URL を取得
- **SR-07-04**: ボットトークン認証 - すべてのファイルダウンロードはボットトークンで認証
- **SR-07-05**: メモリ保護 - 大きなファイルによるメモリ枯渇を防ぐため、ファイルサイズを事前に検証
- **SR-07-06**: タイムアウト保護 - ファイルダウンロードと処理にタイムアウトを設定（30 秒）
- **SR-07-07**: エラーハンドリング - すべての添付ファイル処理エラーはユーザーフレンドリーなメッセージにマッピングし、システム情報を漏洩しない
- Bot Token (xoxb-...) を使用した API 呼び出し
- 2 鍵防御モデル: Signing Secret と Bot Token の両方が必要

**実装レイヤー**: SlackEventHandler（検証層）

**キャッシュ戦略**:

- 検証成功したエンティティを 5 分間キャッシュ（DynamoDB）
- キャッシュキー: `{team_id}#{user_id}#{channel_id}`
- TTL: 300 秒

**パフォーマンス要件**: Slack API 呼び出しレイテンシ ≤500ms (p95)

### 4.2 非機能的セキュリティ要件

| ID     | 要件                               | 目標値                          | 測定方法                       |
| ------ | ---------------------------------- | ------------------------------- | ------------------------------ |
| NFR-01 | 署名検証レイテンシ                 | ≤50ms（p99）                    | CloudWatch メトリクス          |
| NFR-02 | シークレットローテーション         | 90 日ごと                       | AWS Secrets Manager            |
| NFR-03 | 認証失敗アラートレイテンシ         | ≤1 分                           | CloudWatch アラーム            |
| NFR-04 | セキュリティログ保持               | 365 日                          | S3 + Glacier                   |
| NFR-05 | IAM ポリシーレビュー               | 30 日ごと                       | 手動監査                       |
| NFR-06 | 脆弱性スキャン                     | 週次                            | Snyk、Trivy                    |
| NFR-07 | ペネトレーションテスト             | 四半期ごと                      | 外部企業                       |
| NFR-08 | Bedrock 呼び出しレイテンシ         | ≤5 秒（p95）                    | CloudWatch メトリクス          |
| NFR-09 | ユーザー単位 Bedrock コスト        | ≤$10/月                         | Cost Explorer                  |
| NFR-10 | コンテキスト履歴暗号化             | すべての DynamoDB データ        | KMS 暗号化確認                 |
| NFR-11 | Existence Check レイテンシ         | ≤500ms（p95、キャッシュミス時） | CloudWatch メトリクス          |
| NFR-12 | Existence Check キャッシュヒット率 | ≥80%                            | DynamoDB + CloudWatch          |
| NFR-13 | Slack API 呼び出し成功率           | ≥99%                            | CloudWatch メトリクス          |
| NFR-14 | レート制限超過アラートレイテンシ   | ≤1 分                           | CloudWatch アラーム            |
| NFR-15 | PII ログマスキング                 | 100% (すべてのログレベル)       | ログ監査                       |
| NFR-16 | プロンプトインジェクション検出率     | ≥90% (既知パターン)             | セキュリティログ               |

---

## 実装詳細

### 6.1 多層防御アーキテクチャ

セキュリティは機能実現のための重要な要素として、以下の多層防御を実装します：

- **レイヤー 1（Slack）**: SSO + MFA による認証
- **レイヤー 2（SlackEventHandler Function URL）**: Function URL (認証なし、署名検証はLambda内で実施)
- **レイヤー 3（SlackEventHandler）**:
  - 3a. HMAC SHA256 署名検証
  - **3b. Slack API Existence Check（NEW）**
  - 3c. 認可（ホワイトリスト）
- **レイヤー 4（Execution Runtime）**: IAM + リソースポリシーによる Runtime 保護
- **レイヤー 5（Execution Agent）**: Bedrock Guardrails
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

### 6.2 Slack API Existence Check 実装コード

#### Python 実装例（SlackEventHandler）

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

#### TypeScript 実装例（CDK スタック）

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

## Bedrock CMK 検討

**ドキュメントタイプ**: セキュリティガイド
**ステータス**: 推奨
**バージョン**: 1.0
**関連 spec**: 026-best-practices-alignment

### 概要

Amazon Bedrock および Bedrock AgentCore は、デフォルトで AWS 管理キー（SSE）によりデータを暗号化します。規制要件（HIPAA、PCI-DSS、GDPR 等）や組織ポリシーでカスタマー管理キー（CMK）の使用が求められる場合、本セクションを参照して検討してください。

### 現状

- **Bedrock Converse API**（Execution Agent の bedrock-runtime クライアント）: AWS 管理キー使用
- **InvokeAgentRuntime**（AgentCore）: AWS 管理キー使用
- **AgentCore Runtime コンテナ**: デフォルトの EBS/ボリューム暗号化

### CMK が必要なケース

| 要件 | 説明 |
|------|------|
| HIPAA | 医療データの暗号化キーを顧客管理とする要件 |
| PCI-DSS | クレジットカードデータのキー管理要件 |
| 組織ポリシー | すべての AI 入出力を CMK で暗号化する方針 |
| キーローテーション | 独自のローテーション周期でキーを管理したい場合 |

### Bedrock での CMK 有効化

- [Encryption of agent resources with customer managed keys (CMK)](https://docs.aws.amazon.com/bedrock/latest/userguide/cmk-agent-resources.html)
- CMK 対応フィールド: エージェントの説明、指示、プロンプトテンプレート等。アクション名・知識ベース名は CMK 非対応のため、PII を含めないこと。

### AgentCore Runtime での CMK

- AgentCore Runtime はコンテナベース。ランタイムの暗号化設定は AWS ドキュメントで確認。
- コンテナイメージ（ECR）: ECR の暗号化設定で CMK を指定可能。

### 推奨アクション

1. **規制要件がない場合**: 現状の AWS 管理キーで十分。追加対応不要。
2. **規制要件がある場合**:
   - Bedrock の CMK 対応フィールドを確認
   - KMS キーポリシーを作成し、Bedrock サービスに必要な権限を付与
   - デプロイ前に cdk.config 等で CMK ARN を設定
3. **検討時**: キー管理の運用負荷（ローテーション、アクセス監査）を評価する。

### 参照

- [Preventative security best practice for agents](https://docs.aws.amazon.com/bedrock/latest/userguide/security-best-practice-agents.html)
- [Security, privacy, and responsible AI](https://aws.amazon.com/bedrock/security-privacy-responsible-ai/)

---

## 関連ドキュメント

- [アーキテクチャ概要](./architecture.md) - セキュリティ設計の原則
- [トラブルシューティング](./troubleshooting.md) - セキュリティ関連の問題解決
- [運用ランブック](./runbook.md) - セキュリティインシデント対応手順
- [テストと検証](./testing.md) - セキュリティ検証シナリオ
- [ADR-004](../explanation/adr/004-slack-api-existence-check.md) - Existence Check の採用理由
