# Quick Start: 柔軟なホワイトリスト認可

**Feature**: 008-flexible-whitelist  
**Date**: 2025-01-30

## 概要

この機能により、ホワイトリスト認可が柔軟になり、設定されていないエンティティ（team_id、user_id、channel_id）に対して制限をかけないようになります。これにより、部分的なホワイトリスト設定が可能になり、未設定時は全許可となります。

## 主な変更点

### 変更前（007-whitelist-auth）

- すべてのエンティティ（team_id、user_id、channel_id）がホワイトリストに含まれている必要があった（AND条件）
- ホワイトリストが空の場合、エラー（fail-closed）

### 変更後（008-flexible-whitelist）

- 設定されたエンティティのみがチェックされ、設定されていないエンティティは無視される
- ホワイトリストが空の場合、すべてのリクエストが許可される
- 設定読み込み失敗時は従来通りfail-closedを維持

## 使用方法

### 1. ホワイトリスト未設定（全許可）

何も設定しない場合、すべてのリクエストが許可されます。

**DynamoDB**: テーブルが存在しない、またはすべてのエンティティタイプでクエリ結果が空

**Secrets Manager**: シークレットが存在しない、またはすべてのエンティティセットが空

**環境変数**: すべての環境変数が未設定または空文字列

```bash
# 環境変数の例（すべて未設定）
# WHITELIST_TEAM_IDS=
# WHITELIST_USER_IDS=
# WHITELIST_CHANNEL_IDS=
```

### 2. 部分的なホワイトリスト設定

特定のエンティティのみを設定することで、そのエンティティのみを制限できます。

#### channel_idのみ設定

```bash
# 環境変数の例
WHITELIST_CHANNEL_IDS=C001,C002
# WHITELIST_TEAM_IDS=  # 未設定
# WHITELIST_USER_IDS=  # 未設定
```

この場合:
- channel_id="C001"または"C002"のリクエストは許可される
- channel_idがそれ以外のリクエストは拒否される
- team_id、user_idはチェックされない（任意の値が許可される）

#### team_idとchannel_idを設定

```bash
# 環境変数の例
WHITELIST_TEAM_IDS=T123,T456
WHITELIST_CHANNEL_IDS=C001
# WHITELIST_USER_IDS=  # 未設定
```

この場合:
- team_idが"T123"または"T456"、かつchannel_idが"C001"のリクエストは許可される
- user_idはチェックされない（任意の値が許可される）

### 3. 全エンティティ設定（従来動作）

すべてのエンティティを設定した場合、従来通りすべてがチェックされます。

```bash
# 環境変数の例
WHITELIST_TEAM_IDS=T123
WHITELIST_USER_IDS=U456
WHITELIST_CHANNEL_IDS=C001
```

この場合:
- team_id="T123"、user_id="U456"、channel_id="C001"のすべてが一致する場合のみ許可される
- 1つでも不一致の場合は拒否される

## DynamoDB設定例

### 空のホワイトリスト（全許可）

テーブルが存在しない、またはすべてのエンティティタイプでクエリ結果が空の場合、全許可となります。

### channel_idのみ設定

```json
// entity_type="channel_id", entity_id="C001"
{
  "entity_type": "channel_id",
  "entity_id": "C001"
}

// entity_type="channel_id", entity_id="C002"
{
  "entity_type": "channel_id",
  "entity_id": "C002"
}
```

### 全エンティティ設定

```json
// team_id
{
  "entity_type": "team_id",
  "entity_id": "T123"
}

// user_id
{
  "entity_type": "user_id",
  "entity_id": "U456"
}

// channel_id
{
  "entity_type": "channel_id",
  "entity_id": "C001"
}
```

## Secrets Manager設定例

### channel_idのみ設定

```json
{
  "team_ids": [],
  "user_ids": [],
  "channel_ids": ["C001", "C002"]
}
```

### 全エンティティ設定

```json
{
  "team_ids": ["T123"],
  "user_ids": ["U456"],
  "channel_ids": ["C001"]
}
```

## テスト方法

### 1. 空のホワイトリストテスト

```python
# すべての環境変数を未設定または空文字列に設定
# 任意のteam_id、user_id、channel_idでリクエストを送信
# → すべてのリクエストが承認されることを確認

# テストケース例:
# - team_id="T123", user_id="U456", channel_id="C001" → 承認される
# - team_id="T999", user_id="U888", channel_id="C999" → 承認される
# - すべてのリクエストが承認されることを確認
```

### 2. 部分的なホワイトリストテスト

```python
# channel_idのみを設定
WHITELIST_CHANNEL_IDS=C001

# テストケース1: 許可されるリクエスト（channel_idが一致）
team_id="T123", user_id="U456", channel_id="C001"
# → 承認される（team_id、user_idはチェックされない）

# テストケース2: 許可されるリクエスト（異なるteam_id、user_idでもchannel_idが一致）
team_id="T999", user_id="U888", channel_id="C001"
# → 承認される（team_id、user_idはチェックされない）

# テストケース3: 拒否されるリクエスト（channel_idがホワイトリストにない）
team_id="T123", user_id="U456", channel_id="C002"
# → 拒否される（channel_idがホワイトリストにない）
```

### 3. 後方互換性テスト

```python
# すべてのエンティティを設定
WHITELIST_TEAM_IDS=T123
WHITELIST_USER_IDS=U456
WHITELIST_CHANNEL_IDS=C001

# テストケース1: すべて一致
team_id="T123", user_id="U456", channel_id="C001"
# → 承認される（従来のAND条件の動作を維持）

# テストケース2: 1つ不一致（team_id）
team_id="T999", user_id="U456", channel_id="C001"
# → 拒否される（従来の動作を維持）

# テストケース3: 1つ不一致（user_id）
team_id="T123", user_id="U999", channel_id="C001"
# → 拒否される（従来の動作を維持）

# テストケース4: 1つ不一致（channel_id）
team_id="T123", user_id="U456", channel_id="C002"
# → 拒否される（従来の動作を維持）
```

## 注意事項

1. **セキュリティ**: 空のホワイトリストは全許可となるため、本番環境では適切な設定を行うことを推奨します。

2. **設定読み込み失敗**: 設定読み込みに失敗した場合（DynamoDB/Secrets Manager/環境変数すべてが利用不可）、従来通りfail-closed（全拒否）となります。

3. **キャッシュ**: ホワイトリスト設定は5分間キャッシュされます。設定変更後、最大5分間は古い設定が使用される可能性があります。

4. **ログ**: 認可チェック時に、設定されているエンティティとスキップされたエンティティがログに記録されます。セキュリティ監査の観点から、定期的にログを確認することを推奨します。

## トラブルシューティング

### 問題: 期待通りに動作しない

**確認事項**:
1. ホワイトリスト設定が正しく読み込まれているか（ログを確認）
2. キャッシュが有効期限内か（最大5分）
3. 設定ソースの優先順位（DynamoDB → Secrets Manager → 環境変数）

### 問題: すべてのリクエストが拒否される

**確認事項**:
1. 設定読み込みが失敗していないか（`error_message`を確認）
2. ホワイトリストが意図せず空になっていないか
3. リクエストに含まれるエンティティが正しいか

### 問題: 設定変更が反映されない

**確認事項**:
1. キャッシュのTTL（5分）が経過しているか
2. Lambda関数が再起動されているか（コールドスタート時はキャッシュがクリアされる）

