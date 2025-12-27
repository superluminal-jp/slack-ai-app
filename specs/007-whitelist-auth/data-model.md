# Data Model: ホワイトリスト認可

**Feature**: 007-whitelist-auth  
**Date**: 2025-01-30

## Entities

### WhitelistEntry

ホワイトリストに登録されるエンティティを表す。

**Attributes**:
- `entity_type` (String, required): エンティティタイプ（"team_id", "user_id", "channel_id"）
- `entity_id` (String, required): エンティティの実際の ID 値（例: "T123ABC", "U111", "C001"）

**Relationships**:
- 各エンティティは独立して管理される
- team_id、user_id、channel_id の 3 つのエンティティすべてがホワイトリストに含まれている場合のみ、リクエストが承認される（AND 条件）

**Validation Rules**:
- `entity_type` は "team_id", "user_id", "channel_id" のいずれかでなければならない
- `entity_id` は空文字列であってはならない
- `entity_id` は Slack の ID 形式に準拠する必要がある（team_id: "T" + 英数字、user_id: "U" + 英数字、channel_id: "C" + 英数字）

**State Transitions**:
- 追加: ホワイトリストにエンティティが追加される
- 削除: ホワイトリストからエンティティが削除される
- 検証: リクエスト時にエンティティがホワイトリストに含まれているかチェックされる

### AuthorizationResult

認可の結果を表す。

**Attributes**:
- `authorized` (Boolean, required): 認可された場合は True、拒否された場合は False
- `team_id` (String, optional): 検証された team_id
- `user_id` (String, optional): 検証された user_id
- `channel_id` (String, optional): 検証された channel_id
- `unauthorized_entities` (List[String], optional): 未認可であったエンティティのリスト（例: ["team_id", "user_id"]）
- `error_message` (String, optional): エラーメッセージ（設定読み込み失敗時など）
- `timestamp` (Number, required): 認可チェックが実行された時刻（Unix timestamp）

**Relationships**:
- 各リクエストに対して 1 つの AuthorizationResult が生成される
- AuthorizationResult はセキュリティログに記録される

**Validation Rules**:
- `authorized` が False の場合、`unauthorized_entities` または `error_message` のいずれかが必須
- `timestamp` は現在時刻より未来であってはならない

## Storage Models

### DynamoDB Table: `slack-whitelist-config`

**Purpose**: ホワイトリスト設定を保存

**Schema**:
```json
{
  "entity_type": "team_id",  // Partition Key (String)
  "entity_id": "T123ABC",    // Sort Key (String)
  "created_at": 1706630400,  // Number (Unix timestamp)
  "updated_at": 1706630400   // Number (Unix timestamp)
}
```

**Access Patterns**:
- Get all team_ids: Query with `entity_type = "team_id"`
- Get all user_ids: Query with `entity_type = "user_id"`
- Get all channel_ids: Query with `entity_type = "channel_id"`
- Check if entity exists: GetItem with `entity_type` and `entity_id`

**Billing Mode**: PAY_PER_REQUEST

**Encryption**: KMS による暗号化（at rest）

### AWS Secrets Manager: `slack-whitelist-config`

**Purpose**: ホワイトリスト設定を機密情報として保存（オプション）

**Schema** (JSON):
```json
{
  "team_ids": ["T123ABC", "T456DEF"],
  "user_ids": ["U111", "U222", "U333"],
  "channel_ids": ["C001", "C002"]
}
```

**Access Pattern**: GetSecretValue API で JSON を取得し、パース

### Environment Variables

**Purpose**: 開発環境や小規模運用でのホワイトリスト設定

**Variables**:
- `WHITELIST_TEAM_IDS`: カンマ区切り文字列（例: "T123ABC,T456DEF"）
- `WHITELIST_USER_IDS`: カンマ区切り文字列（例: "U111,U222,U333"）
- `WHITELIST_CHANNEL_IDS`: カンマ区切り文字列（例: "C001,C002"）

## In-Memory Cache Model

**Purpose**: パフォーマンス最適化のためのメモリ内キャッシュ

**Structure**:
```python
{
  "team_ids": set(["T123ABC", "T456DEF"]),
  "user_ids": set(["U111", "U222", "U333"]),
  "channel_ids": set(["C001", "C002"]),
  "cached_at": 1706630400,  # Unix timestamp
  "ttl": 300  # 5 minutes in seconds
}
```

**Cache Invalidation**:
- TTL 経過後、次回リクエスト時に再読み込み
- Lambda コールドスタート時はキャッシュが空

**Cache Hit/Miss Logic**:
- Cache Hit: `current_time - cached_at < ttl` の場合、キャッシュを使用
- Cache Miss: TTL 経過または初回読み込み時、設定ソースから再読み込み

## Data Flow

1. **設定読み込み**:
   - 優先順位: DynamoDB → Secrets Manager → 環境変数
   - 読み込み成功時、メモリ内キャッシュに保存（5 分 TTL）

2. **認可チェック**:
   - リクエストから team_id、user_id、channel_id を抽出
   - キャッシュから各エンティティタイプのセットを取得
   - 各エンティティがセットに含まれているかチェック（O(1) ルックアップ）
   - すべて含まれている場合: authorized = True
   - いずれかが含まれていない場合: authorized = False、unauthorized_entities に記録

3. **ログ記録**:
   - AuthorizationResult をセキュリティログに記録
   - 未認可の場合、unauthorized_entities をログに含める

## Constraints

1. **Fail-Closed 原則**: 設定読み込み失敗時、ホワイトリストが空の場合、すべてのリクエストを拒否
2. **AND 条件**: team_id、user_id、channel_id の 3 つすべてが認可済みである必要がある
3. **パフォーマンス**: 認可チェックは ≤50ms (p95) で完了する必要がある
4. **スケーラビリティ**: 数百〜数千のエンティティを効率的に管理

