# Tasks: Deploy Script Hardening

**Input**: Design documents from `/specs/049-deploy-script-hardening/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, quickstart.md ✅

**TDD方針**:
- `apply-resource-policy.py` (Python): pytest で Red → Green → Refactor
- `deploy.sh` (Bash): 手動検証（`export -p`・`time`・意図的エラー）

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（異なるファイル、未完了タスクへの依存なし）
- **[Story]**: 対応するユーザーストーリー（US1〜US5）

---

## Phase 1: Setup

**Purpose**: テストディレクトリの作成

- [x] T001 `scripts/tests/__init__.py` を作成し `scripts/tests/` ディレクトリを Python パッケージとして初期化する

**Checkpoint**: `scripts/tests/` が存在し、pytest が対象ディレクトリとして認識できる

---

## Phase 2: Foundational（共通前提）

**Purpose**: US1〜US5 全体に共通する前提確認

**⚠️ CRITICAL**: このフェーズ完了後に各ユーザーストーリー実装を開始する

- [x] T002 `scripts/apply-resource-policy.py` と `scripts/deploy.sh` の現行動作をリードして変更対象箇所を特定・コメントアウトせず把握する（変更前のベースライン確認）

**Checkpoint**: 変更対象の関数・行番号が特定されている

---

## Phase 3: US1 — AWS API エラーの明確な報告（Priority: P1）🎯 MVP

**Goal**: `apply-resource-policy.py` の `put_resource_policy` 呼び出し失敗時に、原因と終了コード 2 が出力される

**Independent Test**: 不正 ARN を引数に `python3 scripts/apply-resource-policy.py --execution-agent-arn invalid --verification-role-arn arn:aws:iam::123456789012:role/test --account-id 123456789012` を実行し、stderr にエラーメッセージ、終了コード 2 が返ることを `echo $?` で確認する

### Tests for User Story 1（TDD — 先に書いて FAIL を確認）

- [x] T003 [P] [US1] `scripts/tests/test_apply_resource_policy.py` に `ClientError` 発生時に stderr 出力と `sys.exit(2)` が呼ばれるテストケースを追加し、実行して FAIL を確認する
- [x] T004 [P] [US1] `scripts/tests/test_apply_resource_policy.py` に `region=""` を渡したとき `boto3.Session` に `region_name=None` が渡されるテストケースを追加し、実行して FAIL を確認する
- [x] T005 [P] [US1] `scripts/tests/test_apply_resource_policy.py` に `--dry-run` フラグ時に `put_resource_policy` が呼ばれないテストケースを追加し、実行して FAIL を確認する

### Implementation for User Story 1

- [x] T006 [US1] `scripts/apply-resource-policy.py` の `import boto3` と `from botocore.exceptions import ClientError` をモジュールトップレベルに移動し、`apply_policy()` 内の `try: import boto3 except ImportError` ブロックを削除する
- [x] T007 [US1] `scripts/apply-resource-policy.py` の `apply_policy()` 内で `client.put_resource_policy(...)` 呼び出しを `try/except ClientError` で囲み、`exc.response["Error"]["Code"]` と `exc.response["Error"]["Message"]` を stderr に出力して `sys.exit(2)` する
- [x] T008 [US1] `scripts/apply-resource-policy.py` の `apply_policy()` 内の `region or None` を `region if region else None` に修正する
- [x] T009 [US1] `python -m pytest scripts/tests/ -v` を実行して全テストが GREEN になることを確認する

**Checkpoint**: `apply-resource-policy.py` が `ClientError` を捕捉し終了コード 2 で終了する。`--dry-run` は正常動作。全 pytest テストが GREEN

---

## Phase 4: US2 — シークレットの子プロセス漏洩防止（Priority: P1）

**Goal**: `deploy.sh` が `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` を `export` しない

**Independent Test**: `DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy 2>&1 | head -5` 実行後、`export -p | grep -E "SLACK_BOT_TOKEN|SLACK_SIGNING_SECRET"` が何も出力しないことを確認する

### Implementation for User Story 2

- [x] T010 [US2] `scripts/deploy.sh` の `cmd_deploy()` 内 `[[ -n "${SLACK_BOT_TOKEN}" ]] && export SLACK_BOT_TOKEN` を `[[ -n "${SLACK_BOT_TOKEN}" ]] && log_info "Loaded SLACK_BOT_TOKEN from config"` に変更する（`export` を削除）
- [x] T011 [US2] `scripts/deploy.sh` の `cmd_deploy()` 内 `[[ -n "${SLACK_SIGNING_SECRET}" ]] && export SLACK_SIGNING_SECRET` を `[[ -n "${SLACK_SIGNING_SECRET}" ]] && log_info "Loaded SLACK_SIGNING_SECRET from config"` に変更する（`export` を削除）
- [x] T012 [US2] `export -p | grep -E "SLACK_BOT_TOKEN|SLACK_SIGNING_SECRET"` が空出力であることを手動確認する

**Checkpoint**: `export -p` にシークレットが現れない。CDK deploy フローが正常に動作する（Prerequisites OK が表示される）

---

## Phase 5: US3 — `cmd_status` の高速化（Priority: P2）

**Goal**: `cmd_status` の 5 回 CloudFormation 呼び出しが並列実行され完了時間が短縮される

**Independent Test**: `time ./scripts/deploy.sh status` を実行し、全スタックのステータスが表示され、逐次実行（推定 10-25s）と比較して完了時間が短いことを確認する

### Implementation for User Story 3

- [x] T013 [US3] `scripts/deploy.sh` の `cmd_status()` を次のように書き換える: 各スタックの `describe-stacks` 呼び出し前に一時ファイルを `mktemp` で作成し、各 `aws cloudformation describe-stacks` を `> tempfile 2>&1 &` でバックグラウンド実行する。全呼び出し後に `wait` し、その後 `cat` で各一時ファイルを順序付きで表示、最後に一時ファイルを削除する（`rm -f` via EXIT trap または明示削除）
- [x] T014 [US3] `time ./scripts/deploy.sh status` を手動実行し、全スタックの出力が正しい順序で表示され、完了時間が短縮されていることを確認する

**Checkpoint**: `cmd_status` が全スタック情報を並列取得して表示する。一部スタックが存在しなくてもエラーで中断しない

---

## Phase 6: US4 — 一時ファイルの確実なクリーンアップ（Priority: P2）

**Goal**: `cmd_deploy()` 冒頭で `trap EXIT` が `mktemp` より前に設定され、早期エラー時も一時ファイルが残留しない

**Independent Test**: `cmd_deploy()` 内の `mktemp` 直後に意図的に `false` を挿入してスクリプトを失敗させ、`ls /tmp/tmp.*` で残留ファイルがないことを確認する（確認後 `false` を削除）

### Implementation for User Story 4

- [x] T015 [US4] `scripts/deploy.sh` の `cmd_deploy()` 冒頭を次の順序に変更する:
  1. `local exec_outputs="" docs_outputs="" time_outputs="" fetch_outputs="" slack_search_outputs="" verify_outputs=""`（空文字で宣言）
  2. `trap 'rm -f "${exec_outputs}" "${docs_outputs}" "${time_outputs}" "${fetch_outputs}" "${slack_search_outputs}" "${verify_outputs}"' EXIT`
  3. `exec_outputs="$(mktemp)"; docs_outputs="$(mktemp)"; ...`（既存の mktemp 呼び出し）
- [x] T016 [US4] 手動テスト: `cmd_deploy()` の `mktemp` 直後に `exit 1` を一時挿入してスクリプトを実行し、`/tmp` に残留ファイルがないことを確認後、`exit 1` を削除する

**Checkpoint**: early exit 時も `trap EXIT` が発火して全一時ファイルが削除される

---

## Phase 7: US5 — ARN JSON 重複排除・チェック統一・ヘルプ修正（Priority: P3）

**Goal**: `build_execution_agent_arns_json()` ヘルパーが 1 箇所に存在し、重複 jq ブロックが削除される。ARN チェックと ヘルプが統一・正確になる

**Independent Test**: `grep -n "jq -cn" scripts/deploy.sh` が 1 行のみ（ヘルパー関数内）を返すことを確認する。`./scripts/deploy.sh help` の出力が `all` サブコマンドの説明を正確に記述していることを確認する

### Implementation for User Story 5

- [x] T017 [US5] `scripts/deploy.sh` の `# ── Shared helpers ───` セクションに `build_execution_agent_arns_json()` 関数を追加する。引数: `file_creator docs time_arn fetch_url`。内容: 現在 3 箇所に重複している jq -cn ブロック（`{ "file-creator": ... }` 組み立て）をそのまま移植する
- [x] T018 [US5] `scripts/deploy.sh` の `save_execution_agent_arns_to_config()` 内の jq ARN 組み立てを `build_execution_agent_arns_json()` 呼び出しに置き換える
- [x] T019 [US5] `scripts/deploy.sh` の preflight セクション（`preflight_execution_agent_arns_json=` 部分）の jq ARN 組み立てを `build_execution_agent_arns_json()` 呼び出しに置き換える
- [x] T020 [US5] `scripts/deploy.sh` の Phase 6/8 `execution_agent_arns_json=` 部分の jq ARN 組み立てを `build_execution_agent_arns_json()` 呼び出しに置き換える
- [x] T021 [P] [US5] `scripts/deploy.sh` 全体の ARN 有効性チェックを `[[ -n "${var}" && "${var}" != "None" ]]` パターンに統一する。`[[ -z "${var}" ]]` のみのチェックや `!= "None"` が欠けている箇所を修正する
- [x] T022 [P] [US5] `scripts/deploy.sh` の `cmd_help()` 内 `all` サブコマンドの説明を `Full pipeline: always force-rebuilds all images + status + check-access` に修正する

**Checkpoint**: `grep -n "jq -cn" scripts/deploy.sh` が 1 行のみ。ARN チェックが全箇所で一貫している。`./scripts/deploy.sh help` の説明が正確

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: ドキュメント更新・最終検証

- [x] T023 `CHANGELOG.md` の `[Unreleased]` セクションに本変更のエントリを追加する（Changed: deploy.sh エラーハンドリング強化・シークレット export 削除・cmd_status 並列化・ARN JSON ヘルパー追加; Fixed: apply-resource-policy.py ClientError 捕捉・region 空文字処理）
- [x] T024 `DEPLOYMENT_ENV=dev ./scripts/deploy.sh` を実行してエンドツーエンドで全フェーズが正常完了することを確認する

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 即時開始可能
- **Foundational (Phase 2)**: Phase 1 完了後
- **US1 (Phase 3)**: Phase 2 完了後（`apply-resource-policy.py` のみ変更、他 US と並列実行可能）
- **US2 (Phase 4)**: Phase 2 完了後（`deploy.sh` 変更）
- **US3 (Phase 5)**: Phase 2 完了後（`deploy.sh` の異なるセクション、US2 と直列推奨）
- **US4 (Phase 6)**: Phase 2 完了後（`deploy.sh` の異なるセクション）
- **US5 (Phase 7)**: Phase 2 完了後（`deploy.sh` の複数箇所、US2/US3/US4 完了後に実施推奨）
- **Polish (Phase 8)**: 全 US フェーズ完了後

### User Story Dependencies

- **US1 (P1)**: Phase 2 完了後 — `apply-resource-policy.py` のみ。他 US と並列実行可能
- **US2 (P1)**: Phase 2 完了後 — `deploy.sh` 変更
- **US3 (P2)**: Phase 2 完了後 — `deploy.sh` の `cmd_status` セクション
- **US4 (P2)**: Phase 2 完了後 — `deploy.sh` の `cmd_deploy` 冒頭
- **US5 (P3)**: US2/US3/US4 完了後推奨（同じファイルの複数セクション変更）

### Parallel Opportunities

- T003・T004・T005（US1 テスト）: 全て並列実行可能
- T021・T022（US5 内）: 異なる箇所のため並列実行可能
- US1 全体 と US2/US3/US4: 異なるファイルのため並列実行可能（`apply-resource-policy.py` vs `deploy.sh`）

---

## Parallel Example: US1（apply-resource-policy.py テスト）

```bash
# TDD Red フェーズ: 3 テストを同時に追加
Task: "T003 ClientError テストケース追加"
Task: "T004 region='' → None テストケース追加"
Task: "T005 --dry-run テストケース追加"
```

---

## Implementation Strategy

### MVP First（US1 のみ）

1. Phase 1: Setup（T001）
2. Phase 2: Foundational（T002）
3. Phase 3: US1（T003-T009）— `apply-resource-policy.py` エラーハンドリング
4. **STOP & VALIDATE**: `python -m pytest scripts/tests/ -v` が全 GREEN
5. `./scripts/deploy.sh policy` で実際の動作確認

### Incremental Delivery

1. Setup + Foundational → 基盤完了
2. US1 → `apply-resource-policy.py` 安全化（pytest GREEN）
3. US2 → シークレット漏洩防止（`export -p` 確認）
4. US3 → `cmd_status` 高速化（`time` 計測）
5. US4 → 一時ファイルクリーンアップ（early exit テスト）
6. US5 → コード品質（`grep` で重複ゼロ確認）
7. Polish → CHANGELOG + E2E デプロイ確認

---

## Notes

- **TDD**: T003-T005（US1 のテスト）は必ず実装（T006-T008）より先に書き、FAIL を確認してから実装する
- `deploy.sh` の変更は **同じファイル** への複数変更のため、US2→US3→US4→US5 の順で直列実施を推奨
- `apply-resource-policy.py`（US1）は独立ファイルのため、`deploy.sh` 変更と並列で実施可能
- 各 Checkpoint で手動確認を行い、問題があれば次フェーズに進まない
- [P] マークのタスクは異なる箇所を変更するため並列実行安全
