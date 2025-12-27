# API Contract: 柔軟なホワイトリスト認可

**Feature**: 008-flexible-whitelist  
**Date**: 2025-01-30

## Function: `authorize_request`

### Signature

```python
def authorize_request(
    team_id: Optional[str],
    user_id: Optional[str],
    channel_id: Optional[str],
) -> AuthorizationResult
```

### Description

リクエストをホワイトリストに基づいて認可する。設定されたエンティティのみをチェックし、設定されていないエンティティは無視する。すべてのエンティティが未設定の場合、すべてのリクエストを許可する。

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `team_id` | `Optional[str]` | No | Slack team ID。ホワイトリストに設定されていない場合はチェックをスキップ |
| `user_id` | `Optional[str]` | No | Slack user ID。ホワイトリストに設定されていない場合はチェックをスキップ |
| `channel_id` | `Optional[str]` | No | Slack channel ID。ホワイトリストに設定されていない場合はチェックをスキップ |

### Return Value

`AuthorizationResult` オブジェクト。以下の属性を持つ:

| Attribute | Type | Description |
|-----------|------|-------------|
| `authorized` | `bool` | 認可された場合はTrue、拒否された場合はFalse |
| `team_id` | `Optional[str]` | 検証されたteam_id（リクエストに含まれていた場合） |
| `user_id` | `Optional[str]` | 検証されたuser_id（リクエストに含まれていた場合） |
| `channel_id` | `Optional[str]` | 検証されたchannel_id（リクエストに含まれていた場合） |
| `unauthorized_entities` | `Optional[List[str]]` | 未認可であったエンティティのリスト。設定されていないエンティティは含まれない |
| `error_message` | `Optional[str]` | エラーメッセージ（設定読み込み失敗時など） |
| `timestamp` | `int` | 認可チェックが実行された時刻（Unix timestamp） |

### Behavior

1. **ホワイトリスト読み込み**:
   - キャッシュからホワイトリスト設定を取得（5分TTL）
   - キャッシュミスの場合、DynamoDB → Secrets Manager → 環境変数の優先順位で読み込み
   - 設定読み込み失敗時: `authorized=False`、`error_message`にエラー内容を設定して返す（fail-closed）

2. **認可チェック**:
   - 各エンティティタイプ（team_id、user_id、channel_id）について:
     - ホワイトリストに設定されている場合（セットが空でない）:
       - リクエストにエンティティが含まれていない場合: 拒否（既存の動作を維持）
       - リクエストのエンティティがホワイトリストに含まれていない場合: 拒否
       - リクエストのエンティティがホワイトリストに含まれている場合: 承認
     - ホワイトリストに設定されていない場合（セットが空）:
       - チェックをスキップ（制限なし）

3. **結果判定**:
   - すべての設定されたエンティティが承認された場合、またはすべてのエンティティが未設定の場合: `authorized=True`
   - 1つ以上の設定されたエンティティが拒否された場合: `authorized=False`、`unauthorized_entities`に拒否されたエンティティを記録

### Error Conditions

| Condition | Behavior |
|-----------|----------|
| ホワイトリスト設定読み込み失敗 | `authorized=False`、`error_message`にエラー内容を設定（fail-closed） |
| リクエストにエンティティが欠落（設定されているエンティティの場合） | `authorized=False`、`unauthorized_entities`に欠落したエンティティを記録 |
| リクエストのエンティティがホワイトリストにない（設定されているエンティティの場合） | `authorized=False`、`unauthorized_entities`に該当エンティティを記録 |

### Side Effects

- CloudWatchメトリクスを発行:
  - `WhitelistAuthorizationSuccess`: 認可成功時（Count）
  - `WhitelistAuthorizationFailed`: 認可失敗時（Count）
  - `WhitelistAuthorizationLatency`: 認可チェックのレイテンシ（Milliseconds）
- 構造化ログを出力:
  - `whitelist_authorization_success`: 認可成功時
  - `whitelist_authorization_failed`: 認可失敗時（`unauthorized_entities`を含む）
  - `whitelist_config_load_failed`: 設定読み込み失敗時

### Performance

- レイテンシ: ≤10ms (p95)
- 計算量: O(1) per entity check（セットメンバーシップチェック）

### Examples

#### Example 1: 空のホワイトリスト（全許可）

```python
# ホワイトリスト: team_ids={}, user_ids={}, channel_ids={}
result = authorize_request(
    team_id="T123",
    user_id="U456",
    channel_id="C001"
)
# result.authorized == True
# result.unauthorized_entities == None
```

#### Example 2: channel_idのみ設定

```python
# ホワイトリスト: team_ids={}, user_ids={}, channel_ids={"C001"}
result = authorize_request(
    team_id="T123",
    user_id="U456",
    channel_id="C001"
)
# result.authorized == True (channel_idが一致、team_id/user_idはチェックされない)

result = authorize_request(
    team_id="T999",
    user_id="U888",
    channel_id="C002"
)
# result.authorized == False
# result.unauthorized_entities == ["channel_id"]
```

#### Example 3: 全エンティティ設定（従来動作）

```python
# ホワイトリスト: team_ids={"T123"}, user_ids={"U456"}, channel_ids={"C001"}
result = authorize_request(
    team_id="T123",
    user_id="U456",
    channel_id="C001"
)
# result.authorized == True

result = authorize_request(
    team_id="T123",
    user_id="U456",
    channel_id="C002"
)
# result.authorized == False
# result.unauthorized_entities == ["channel_id"]
```

#### Example 4: 設定読み込み失敗（fail-closed）

```python
# ホワイトリスト設定読み込み失敗
result = authorize_request(
    team_id="T123",
    user_id="U456",
    channel_id="C001"
)
# result.authorized == False
# result.error_message == "Failed to load whitelist configuration: ..."
```

