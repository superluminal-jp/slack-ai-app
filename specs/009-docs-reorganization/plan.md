# Implementation Plan: Documentation Reorganization

**Branch**: `009-docs-reorganization` | **Date**: 2025-12-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-docs-reorganization/spec.md`

## Summary

プロジェクトドキュメントを Diátaxis フレームワークに基づいて再整理し、Single Source of Truth 原則と Progressive Disclosure パターンを適用。読者別ナビゲーションパスを提供し、GitHub/OSS 標準ファイル（CONTRIBUTING.md, CHANGELOG.md, SECURITY.md）を追加。

## Technical Context

**Language/Version**: Markdown (CommonMark), YAML 1.2
**Primary Dependencies**: markdown-link-check (npm, リンク検証用)
**Storage**: Git (ファイルベース)
**Testing**: markdown-link-check, wc -l (行数確認)
**Target Platform**: GitHub / Local Markdown viewer
**Project Type**: Documentation only (コード変更なし)
**Performance Goals**: N/A (ドキュメントのみ)
**Constraints**: README.md ≤ 200 行, docs/README.md ≤ 100 行
**Scale/Scope**: 約 30 個の Markdown ファイル

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Check ✅

| Principle | Applicable | Compliant | Notes |
| --------- | ---------- | --------- | ----- |
| I. Security-First Architecture | ❌ N/A | - | ドキュメントのみ、コード変更なし |
| II. Non-Blocking Async Processing | ❌ N/A | - | ドキュメントのみ |
| III. Context History Management | ❌ N/A | - | ドキュメントのみ |
| IV. Observability & Monitoring | ❌ N/A | - | ドキュメントのみ |
| V. Error Handling & Resilience | ❌ N/A | - | ドキュメントのみ |
| VI. Cost Management | ❌ N/A | - | ドキュメントのみ |
| VII. Compliance Standards | ✅ 適用 | ✅ 準拠 | ドキュメントに機密情報を含めない |
| VIII. Testing Discipline | ✅ 適用 | ✅ 準拠 | リンク検証でテスト |

### Post-Phase 1 Check ✅

すべての Constitution 原則に準拠。ドキュメント再整理はコード変更を含まないため、セキュリティ・パフォーマンス関連の原則は適用外。

## Project Structure

### Documentation (this feature)

```text
specs/009-docs-reorganization/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Research findings
├── data-model.md        # Document structure definition
├── quickstart.md        # Implementation guide
├── contracts/           # Document templates
│   └── document-templates.yaml
└── checklists/
    └── requirements.md  # Quality checklist
```

### Source Code (repository root)

```text
# Documentation Structure (After Reorganization)
slack-ai-app/
├── README.md                    # L1: プロジェクト概要 (≤200行)
├── README.ja.md                 # L1: 日本語版
├── CONTRIBUTING.md              # 新規: 貢献ガイドライン
├── CHANGELOG.md                 # 新規: バージョン履歴
├── SECURITY.md                  # 新規: セキュリティポリシー
│
└── docs/
    ├── README.md                # L2: ナビゲーションハブ (≤100行)
    ├── quickstart.md            # How-to: 統合クイックスタート
    │
    ├── tutorials/               # 学習指向 (新規)
    │   └── getting-started.md
    │
    ├── how-to/                  # タスク指向 (新規)
    │   ├── deployment.md
    │   └── troubleshooting.md
    │
    ├── reference/               # 情報指向 (既存の再整理)
    │   ├── architecture/
    │   ├── security/
    │   ├── operations/
    │   └── requirements/
    │
    ├── explanation/             # 理解指向 (新規)
    │   ├── design-principles.md # 理論的基盤 (docs/README.md から移動)
    │   └── adr/
    │
    ├── presentation/            # 非技術者向け (維持)
    │   ├── README.md
    │   ├── non-technical-overview.md
    │   └── security-overview.md
    │
    ├── implementation/          # 維持
    │   └── roadmap.md
    │
    ├── appendix.md              # 維持
    └── slack-app-manifest.yaml  # 維持
```

**Structure Decision**: Diátaxis フレームワークに基づく 4 カテゴリ構造（tutorials, how-to, reference, explanation）を採用。既存の architecture/, security/, operations/ は reference/ 配下に移動。理論的基盤は explanation/ に分離。

## Implementation Phases

### Phase 1: 準備 (Day 1)

1. 新規ディレクトリ作成 (`tutorials/`, `how-to/`, `reference/`, `explanation/`)
2. 標準ファイル作成 (`CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`)
3. バックアップ確認

### Phase 2: コンテンツ移動 (Day 1-2)

1. `docs/architecture/` → `docs/reference/architecture/`
2. `docs/security/` → `docs/reference/security/`
3. `docs/operations/` → `docs/reference/operations/`
4. `docs/requirements/` → `docs/reference/requirements/`
5. `docs/adr/` → `docs/explanation/adr/`
6. 理論的基盤を `docs/explanation/design-principles.md` に抽出

### Phase 3: リンク更新 (Day 2)

1. すべてのドキュメントで内部リンクを更新
2. README.md のリンクを更新
3. docs/README.md のリンクを更新

### Phase 4: 簡素化 (Day 2-3)

1. README.md を 200 行以内に圧縮
2. docs/README.md を 100 行以内に圧縮
3. 重複コンテンツの削除

### Phase 5: 検証 (Day 3)

1. リンク切れ検証 (markdown-link-check)
2. 行数確認
3. ナビゲーションパステスト

## Complexity Tracking

> **No violations** - This feature involves documentation only, no code changes.

## Generated Artifacts

| Artifact | Path | Status |
| -------- | ---- | ------ |
| Specification | `specs/009-docs-reorganization/spec.md` | ✅ Complete |
| Research | `specs/009-docs-reorganization/research.md` | ✅ Complete |
| Data Model | `specs/009-docs-reorganization/data-model.md` | ✅ Complete |
| Contracts | `specs/009-docs-reorganization/contracts/document-templates.yaml` | ✅ Complete |
| Quickstart | `specs/009-docs-reorganization/quickstart.md` | ✅ Complete |
| Checklist | `specs/009-docs-reorganization/checklists/requirements.md` | ✅ Complete |

## Next Steps

1. **タスク作成**: `/speckit.tasks` を実行してタスク一覧を生成
2. **実装開始**: `quickstart.md` に従って実装
3. **検証**: 成功基準に従って検証
