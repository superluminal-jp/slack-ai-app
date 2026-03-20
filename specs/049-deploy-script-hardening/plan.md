# Implementation Plan: Deploy Script Hardening

**Branch**: `049-deploy-script-hardening` | **Date**: 2026-03-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/049-deploy-script-hardening/spec.md`

## Summary

`scripts/deploy.sh` と `scripts/apply-resource-policy.py` に対して、エラーハンドリング・セキュリティ・パフォーマンス・コード重複の各問題を修正する。変更対象はスクリプト 2 ファイルと、新規追加する Python テスト 1 ファイルのみ。エージェントゾーンの CDK・Python コードには一切手を加えない。

## Technical Context

**Language/Version**: Python 3.11+ (`apply-resource-policy.py`), Bash 5.x (`deploy.sh`)
**Primary Dependencies**: `boto3` (PutResourcePolicy API), `botocore.exceptions.ClientError` (エラー捕捉)
**Storage**: N/A（スクリプト変更のみ）
**Testing**: `pytest` + `unittest.mock` (`apply-resource-policy.py` の単体テスト), 手動実行（`deploy.sh` の統合確認）
**Target Platform**: macOS / Linux（CI/CD 環境含む）
**Project Type**: CLI deploy scripts
**Performance Goals**: `cmd_status` 完了時間を逐次比で 40% 以上短縮
**Constraints**: `deploy.sh` の外部インターフェース（サブコマンド・引数・終了コード）は変更しない

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. SDD — spec → plan → tasks → code | ✅ | spec.md 作成済み |
| II. TDD — tests before implementation | ✅ | `apply-resource-policy.py` は pytest で Red→Green。`deploy.sh` は手動確認 |
| III. Security-First | ✅ | シークレット export 削除が本フィーチャの主目的 |
| IV. Fail-Open / Fail-Closed | ✅ | `put_resource_policy` エラーは `deploy.sh` 側で `log_warning` + 継続（fail-open）。`policy` サブコマンドは exit 1（fail-closed が適切）|
| V. Zone-Isolated Architecture | ✅ | エージェントゾーンのコードは変更しない |
| VI. Docs & Deploy-Script Parity | ✅ | `deploy.sh` 自体が対象。CHANGELOG 更新を tasks に含める |
| VII. Clean Code Identifiers | ✅ | 追加コードにスペック番号・ブランチ名を含めない |

**Complexity Tracking**: 違反なし

## Project Structure

### Documentation (this feature)

```text
specs/049-deploy-script-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (変更対象ファイル)

```text
scripts/
├── deploy.sh                   # 変更: trap 順序・export 削除・cmd_status 並列化・jq ヘルパー・ARN チェック統一・ヘルプ修正
└── apply-resource-policy.py    # 変更: import 移動・ClientError 捕捉・region 修正

scripts/tests/                  # 新規作成
└── test_apply_resource_policy.py  # pytest: ClientError ハンドリング・region None 変換
```

**Structure Decision**: スクリプトは単一 `scripts/` ディレクトリに存在。テストは `scripts/tests/` を新規作成し、既存の `execution-zones/`・`verification-zones/` テスト構造とは分離する。
