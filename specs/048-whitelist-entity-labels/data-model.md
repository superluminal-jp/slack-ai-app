# Data Model: Whitelist Team and User Labels

## Overview

このフィーチャはストレージスキーマを変更しない。DynamoDB の `label` 属性はすでにスパース属性として設計されており、`team_id` / `user_id` エントリに追加するだけでよい。変更はすべてアプリケーション層（Python）内のメモリ構造と型定義に限定される。

---

## 変更されるデータ構造

### WhitelistConfig（内部キャッシュ辞書）

ホワイトリスト設定を全ソース（DynamoDB / Secrets Manager / 環境変数）から読み込んだ後に生成されるメモリ上の辞書。

#### 現在の構造

```python
{
    "team_ids": Set[str],       # 許可チームIDの集合
    "user_ids": Set[str],       # 許可ユーザーIDの集合
    "channel_ids": Set[str],    # 許可チャンネルIDの集合
    "channel_labels": Dict[str, str],  # channel_id → label マッピング
    "cached_at": int,           # キャッシュ時刻（Unix timestamp）
    "ttl": int,                 # TTL秒数（300）
}
```

#### 変更後の構造

```python
{
    "team_ids": Set[str],
    "user_ids": Set[str],
    "channel_ids": Set[str],
    "team_labels": Dict[str, str],     # NEW: team_id → label マッピング
    "user_labels": Dict[str, str],     # NEW: user_id → label マッピング
    "channel_labels": Dict[str, str],
    "cached_at": int,
    "ttl": int,
}
```

**Validation rules**:
- `team_labels` / `user_labels` のキーは対応する `team_ids` / `user_ids` の要素でなければならない
- `label` 値は非空文字列のみ格納（空文字列は格納しない）
- `label` が未設定のエントリは `team_labels` / `user_labels` のキーに存在しない

---

### AuthorizationResult（Python dataclass）

`authorize_request()` の戻り値。

#### 現在の構造

```python
@dataclass
class AuthorizationResult:
    authorized: bool
    team_id: Optional[str] = None
    user_id: Optional[str] = None
    channel_id: Optional[str] = None
    channel_label: Optional[str] = None
    unauthorized_entities: Optional[List[str]] = None
    error_message: Optional[str] = None
    timestamp: int = 0
```

#### 変更後の構造

```python
@dataclass
class AuthorizationResult:
    authorized: bool
    team_id: Optional[str] = None
    user_id: Optional[str] = None
    channel_id: Optional[str] = None
    team_label: Optional[str] = None   # NEW
    user_label: Optional[str] = None   # NEW
    channel_label: Optional[str] = None
    unauthorized_entities: Optional[List[str]] = None
    error_message: Optional[str] = None
    timestamp: int = 0
```

**Field semantics**:
- `team_label`: チェックした `team_id` に対応するラベル。未設定または未チェックの場合 `None`
- `user_label`: チェックした `user_id` に対応するラベル。未設定または未チェックの場合 `None`
- これらのフィールドは認証判定に影響しない

---

## DynamoDB スキーマ（変更なし）

既存の whitelist テーブルスキーマはそのまま。`label` はスパース属性として全エンティティタイプで使用可能（既に設計済み）。

| 属性 | 型 | 必須 | 説明 |
|------|-----|------|------|
| `entity_type` | String (PK) | ✅ | `"team_id"` / `"user_id"` / `"channel_id"` |
| `entity_id` | String (SK) | ✅ | Slack エンティティ ID |
| `label` | String | ❌ | 人間可読な名称（スパース属性） |

**Migration**: 不要。既存エントリは `label` 属性なしで継続動作する。

---

## Secrets Manager スキーマ（拡張）

既存のホワイトリストシークレットに対して `team_ids` / `user_ids` のオブジェクト形式を追加サポートする。

#### 現在サポートされる形式

```json
{
    "team_ids": ["T001", "T002"],
    "user_ids": ["U001", "U002"],
    "channel_ids": ["C001", {"id": "C002", "label": "#general"}]
}
```

#### 変更後にサポートされる形式

```json
{
    "team_ids": [
        "T001",
        {"id": "T002", "label": "My Workspace"}
    ],
    "user_ids": [
        {"id": "U001", "label": "@alice"},
        "U002"
    ],
    "channel_ids": ["C001", {"id": "C002", "label": "#general"}]
}
```

**Backward compatibility**: 文字列形式は引き続き有効。混在形式もサポート。

---

## 環境変数スキーマ（拡張）

#### 現在サポートされる形式

```
WHITELIST_TEAM_IDS=T001,T002
WHITELIST_USER_IDS=U001,U002
WHITELIST_CHANNEL_IDS=C001,C002:#general
```

#### 変更後にサポートされる形式

```
WHITELIST_TEAM_IDS=T001:My Workspace,T002:Other Workspace
WHITELIST_USER_IDS=U001:@alice,U002
WHITELIST_CHANNEL_IDS=C001,C002:#general
```

**Parse rule**: `token.split(":", 1)` — 最初のコロンのみ区切り文字として使用。ラベルにコロンが含まれる場合は正しく保持される。
