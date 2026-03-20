# Research: Deploy Script Hardening

**Branch**: `049-deploy-script-hardening` | **Date**: 2026-03-20

## Decision 1: boto3 ClientError の捕捉方法

**Decision**: `botocore.exceptions.ClientError` を `apply_policy()` 内で捕捉し、`error_code` と `message` を stderr に出力して `sys.exit(2)` する。

**Rationale**: boto3 の AWS API エラーは `botocore.exceptions.ClientError` として統一されており、`e.response['Error']['Code']` と `e.response['Error']['Message']` から原因を特定できる。`sys.exit(2)` はドキュメント済みの終了コード（exit code 2 = AWS API error）に沿っている。

**Alternatives considered**:
- `except Exception` でまとめて捕捉: 意図しないバグまで隠蔽するため却下
- リトライロジックの追加: 本フィーチャのスコープ外（Assumptions に記載）

**Implementation**:
```python
from botocore.exceptions import ClientError

try:
    client.put_resource_policy(...)
except ClientError as exc:
    code = exc.response["Error"]["Code"]
    msg = exc.response["Error"]["Message"]
    print(f"ERROR: AWS API error [{code}]: {msg}", file=sys.stderr)
    sys.exit(2)
```

---

## Decision 2: SLACK_BOT_TOKEN / SLACK_SIGNING_SECRET の export 削除

**Decision**: `export` を削除し、CDK deploy サブシェルに対してスコープ限定の環境変数として渡す。

**Rationale**: CDK の各 deploy コマンドはサブシェル `( cd ... && cdk deploy ... )` で実行されている。シークレットを CDK がどのように使うかを確認すると、CDK 側は `cdk.config.*.json` から読み込むため環境変数渡しは不要。つまり `export` は実質的に不要であり、削除しても動作は変わらない。

**現在の実装**:
```bash
[[ -n "${SLACK_BOT_TOKEN}" ]] && export SLACK_BOT_TOKEN
```

**修正後**:
```bash
[[ -n "${SLACK_BOT_TOKEN}" ]] && log_info "Loaded SLACK_BOT_TOKEN from config"
# 変数はシェルローカルのまま維持（export しない）
```

**Alternatives considered**:
- `env VAR=value cdk deploy` でサブシェルに明示的に渡す: CDK が env var を使わないため不要
- Secrets Manager 経由に移行: 本フィーチャのスコープ外

---

## Decision 3: cmd_status の並列化

**Decision**: `describe-stacks` 5 呼び出しをバックグラウンドジョブ（`&`）で並列実行し、各出力を一時ファイルに保存、`wait` 後に順序付きで表示する。

**Rationale**: Bash の組み込み並列化（`&` + `wait`）は外部ツール不要で macOS/Linux 両対応。各呼び出しが独立しているため並列化に副作用がない。出力を一時ファイル経由で保持することで、表示順を保証できる。

**Pattern**:
```bash
aws cloudformation describe-stacks --stack-name "${EXEC_STACK}" ... > "${exec_out}" 2>&1 &
aws cloudformation describe-stacks --stack-name "${DOCS_STACK}" ... > "${docs_out}" 2>&1 &
# ... 同様に全スタック
wait
cat "${exec_out}"; cat "${docs_out}"; ...
```

**Alternatives considered**:
- GNU parallel: 外部ツール依存のため却下
- xargs -P: 出力順の保証が難しいため却下

---

## Decision 4: trap の mktemp 前配置

**Decision**: `cmd_deploy` 冒頭で、変数宣言と `mktemp` 呼び出しの順序を入れ替え、`trap` → `mktemp` の順にする。

**Rationale**: `set -euo pipefail` 環境では `mktemp` 後のいかなるコマンド失敗でも EXIT trap が発火するが、`trap` 設定前にエラーが起きた場合はクリーンアップされない。`trap` を先に設定し、変数を空文字で初期化しておくことで、`rm -f` が空パスに対しても安全に実行される。

**Pattern**:
```bash
cmd_deploy() {
    local exec_outputs="" docs_outputs="" ...
    trap 'rm -f "${exec_outputs}" "${docs_outputs}" ...' EXIT
    exec_outputs="$(mktemp)"; docs_outputs="$(mktemp)"; ...
    ...
}
```

---

## Decision 5: jq ARN JSON ヘルパー関数

**Decision**: 3 箇所に重複している jq ARN 組み立てロジックを `build_execution_agent_arns_json()` ヘルパーに抽出する。

**Rationale**: 引数（file_creator, docs, time, fetch_url）は統一されており、ロジックは同一。関数化することで新規エージェント追加時の変更を 1 箇所に集約できる。

**Signature**:
```bash
build_execution_agent_arns_json() {
    local file_creator="$1" docs="$2" time_arn="$3" fetch_url="$4"
    jq -cn \
        --arg file_creator "${file_creator}" \
        --arg docs "${docs}" \
        --arg time "${time_arn}" \
        --arg fetch_url "${fetch_url}" \
        '{ "file-creator": $file_creator }
         + (if $docs == "" or $docs == "None" then {} else { docs: $docs } end)
         + (if $time == "" or $time == "None" then {} else { time: $time } end)
         + (if $fetch_url == "" or $fetch_url == "None" then {} else { "fetch-url": $fetch_url } end)'
}
```

---

## Decision 6: ARN チェックパターンの統一

**Decision**: ARN の有効性検証を `[[ -n "${var}" && "${var}" != "None" ]]` パターンに統一する。

**Rationale**: CloudFormation の `--output text` は存在しない出力キーに対して `None` を返す。空文字と `None` の両方を除外するチェックが必要。現在の実装では一部が `[[ -z "${var}" ]]` のみで `None` を見逃している。

---

## Decision 7: apply-resource-policy.py の import 移動と region 修正

**Decision**: `import boto3` をモジュールトップレベルに移動し、`region` の空文字チェックを明示的に行う。

**Rationale**:
- トップレベル import: Python の慣例。関数内動的 import はキャッシュされるが意図が不明瞭
- `region if region else None`: `region or None` と同じ動作だが空文字の扱いが明示的で読みやすい

**Note**: `import boto3` をトップレベルに移動することで、boto3 未インストール時のエラーがスクリプト起動時に発生する。`deploy.sh` の `ensure_boto3()` が事前インストールを保証しているため問題ない。

---

## Decision 8: pytest テストの配置

**Decision**: `scripts/tests/test_apply_resource_policy.py` を新規作成する。

**Rationale**: `scripts/` 以下には既存のテストディレクトリがない。`tests/` サブディレクトリを作成することで、将来の `deploy.sh` 関連テストも同じ場所に置ける。`pytest` は既存プロジェクトのテストランナーとして使用されているため統一性がある。

**Test cases**:
1. `put_resource_policy` が `ClientError` を投げたとき → stderr にエラーメッセージ、`sys.exit(2)` が呼ばれる
2. `region=""` を渡したとき → boto3 Session に `region_name=None` が渡される
3. `--dry-run` フラグ → `put_resource_policy` が呼ばれない
4. 正常系 → 終了コード 0、成功メッセージが stdout に出力される
