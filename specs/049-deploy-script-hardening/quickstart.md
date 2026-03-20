# Quickstart: Deploy Script Hardening

## 変更されるファイル

| ファイル | 変更種別 |
|---|---|
| `scripts/apply-resource-policy.py` | 修正 |
| `scripts/deploy.sh` | 修正 |
| `scripts/tests/test_apply_resource_policy.py` | 新規作成 |
| `CHANGELOG.md` | 更新 |

## テスト実行

```bash
# apply-resource-policy.py の単体テスト
cd scripts && python -m pytest tests/ -v

# deploy.sh の手動確認（resource policy フロー）
DEPLOYMENT_ENV=dev ./scripts/deploy.sh policy --dry-run

# シークレット漏洩チェック
DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy 2>&1; export -p | grep -E "SLACK_BOT|SLACK_SIGNING"
# → 何も出力されないことを確認

# cmd_status 並列化確認
time ./scripts/deploy.sh status
```

## apply-resource-policy.py の変更概要

1. `import boto3` / `from botocore.exceptions import ClientError` をモジュールトップに移動
2. `apply_policy()` 内で `ClientError` を捕捉 → stderr + exit 2
3. `region or None` → `region if region else None`

## deploy.sh の変更概要

1. **trap 順序修正**: `local` 変数を空文字で宣言 → `trap` → `mktemp` の順に変更
2. **export 削除**: `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` の `export` を除去
3. **ARN JSON ヘルパー**: `build_execution_agent_arns_json()` を Shared helpers セクションに追加し、3 箇所の重複を置換
4. **ARN チェック統一**: `[[ -n "${var}" && "${var}" != "None" ]]` パターンに統一
5. **cmd_status 並列化**: 各 `describe-stacks` を `&` で並列実行、temp ファイル経由で順序付き表示
6. **ヘルプ修正**: `all` サブコマンドの説明を「常に --force-rebuild」と記述

## exit codes（変更なし）

| Code | 意味 |
|---|---|
| 0 | 成功 |
| 1 | 引数エラー / boto3 import 失敗 |
| 2 | AWS API エラー（新規: ClientError 捕捉） |
