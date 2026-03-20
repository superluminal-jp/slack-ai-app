# Quickstart: Whitelist Team and User Labels

## シナリオ 1 — DynamoDB でチームとユーザーにラベルを付ける（US1, P1）

### セットアップ

DynamoDB のホワイトリストテーブルに `label` 属性を追加する（既存エントリはそのまま動作する）:

```bash
# team_id エントリにラベルを付けて登録
aws dynamodb put-item \
  --table-name <WHITELIST_TABLE_NAME> \
  --item '{
    "entity_type": {"S": "team_id"},
    "entity_id":   {"S": "T0123456789"},
    "label":       {"S": "My Workspace"}
  }'

# user_id エントリにラベルを付けて登録
aws dynamodb put-item \
  --table-name <WHITELIST_TABLE_NAME> \
  --item '{
    "entity_type": {"S": "user_id"},
    "entity_id":   {"S": "U0123456789"},
    "label":       {"S": "@alice"}
  }'
```

### 検証

認証成功時のログを確認:

```json
{
  "event_type": "whitelist_authorization_success",
  "team_id": "T0123456789",
  "team_label": "My Workspace",
  "user_id": "U0123456789",
  "user_label": "@alice",
  "channel_id": "C001"
}
```

---

## シナリオ 2 — Secrets Manager でチームとユーザーにラベルを付ける（US2, P2）

### セットアップ

Secrets Manager のシークレットをオブジェクト形式に更新する（文字列形式との混在も可）:

```json
{
  "team_ids": [
    {"id": "T0123456789", "label": "My Workspace"},
    "T9876543210"
  ],
  "user_ids": [
    {"id": "U0123456789", "label": "@alice"},
    {"id": "U1111111111", "label": "@bob"}
  ],
  "channel_ids": ["C001", {"id": "C002", "label": "#general"}]
}
```

```bash
aws secretsmanager update-secret \
  --secret-id <WHITELIST_SECRET_NAME> \
  --secret-string '{"team_ids": [{"id": "T0123456789", "label": "My Workspace"}], "user_ids": [{"id": "U0123456789", "label": "@alice"}], "channel_ids": ["C001"]}'
```

### 検証

ログに `team_label` / `user_label` が含まれること、`T9876543210` のようにラベルなしエントリではフィールドが省略されることを確認する。

---

## シナリオ 3 — 環境変数でチームとユーザーにラベルを付ける（US3, P3）

### セットアップ

`ID:ラベル` 形式でカンマ区切り（従来の ID のみ形式と混在可）:

```bash
export WHITELIST_TEAM_IDS="T0123456789:My Workspace,T9876543210:Other Workspace"
export WHITELIST_USER_IDS="U0123456789:@alice,U1111111111"
```

### 検証

```bash
python -c "
from src.authorization import _get_whitelist_from_env
import os
os.environ['WHITELIST_TEAM_IDS'] = 'T001:My Workspace,T002'
os.environ['WHITELIST_USER_IDS'] = 'U001:@alice,U002'
os.environ['WHITELIST_CHANNEL_IDS'] = ''
w = _get_whitelist_from_env()
assert w['team_labels'] == {'T001': 'My Workspace'}
assert w['user_labels'] == {'U001': '@alice'}
print('OK')
"
```

---

## 後方互換の確認

ラベルを持たない既存エントリは、フィーチャ適用後も変更なしに動作する:

```bash
# ラベルなしエントリ — 認証は変わらず成功
aws dynamodb put-item \
  --table-name <WHITELIST_TABLE_NAME> \
  --item '{
    "entity_type": {"S": "team_id"},
    "entity_id":   {"S": "T_LEGACY"}
  }'
# → ログに team_label フィールドは出力されない（省略される）
```

---

## テスト実行

```bash
cd verification-zones/verification-agent
python -m pytest tests/test_authorization.py -v -k "team_label or user_label"
```
