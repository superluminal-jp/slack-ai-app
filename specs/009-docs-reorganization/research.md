# Research: Documentation Reorganization

**Feature**: 009-docs-reorganization
**Date**: 2025-12-27
**Status**: Complete

## Research Tasks

### 1. Diátaxis Framework Implementation

**Decision**: Diátaxis フレームワークを採用し、ドキュメントを 4 つのカテゴリに分類

**Rationale**:

- 業界標準のドキュメント構造化フレームワーク
- 読者の目的（学習、実行、参照、理解）に基づく分類
- 多くの OSS プロジェクト（Python, Django, Kubernetes）で採用実績

**Alternatives Considered**:
| Alternative | Pros | Cons | Decision |
| ----------- | ---- | ---- | -------- |
| 機能別分類 | シンプル | 読者目的と合致しない | ❌ 不採用 |
| 読者別分類のみ | 読者に最適化 | 情報の重複が発生 | ❌ 不採用 |
| Diátaxis + 読者パス | 両方の利点を組み合わせ | 複雑性増加 | ✅ 採用 |

**Implementation**:

```
docs/
├── tutorials/      # 学習指向
├── how-to/         # タスク指向
├── reference/      # 情報指向
└── explanation/    # 理解指向
```

---

### 2. Progressive Disclosure Pattern

**Decision**: 3 層の情報開示構造を採用

**Rationale**:

- 読者の認知負荷を軽減
- 必要な情報に迅速にアクセス可能
- 詳細が必要な読者のみ深く掘り下げ可能

**Implementation**:

| 層  | ファイル       | 内容                                     | 目標行数   |
| --- | -------------- | ---------------------------------------- | ---------- |
| L1  | README.md      | プロジェクト概要、クイックスタートリンク | 150-200 行 |
| L2  | docs/README.md | ナビゲーションハブ、読者別パス           | 80-100 行  |
| L3  | docs/_/_.md    | 詳細ドキュメント                         | 制限なし   |

---

### 3. Standard OSS Files

**Decision**: GitHub/OSS 標準ファイルを追加

**Rationale**:

- コミュニティ標準に準拠
- GitHub が自動認識しリンクを表示
- コントリビューターの期待に合致

**Files to Create**:

| File            | Purpose              | Template/Reference                                                                                                                                      |
| --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONTRIBUTING.md | 貢献ガイドライン     | [GitHub Guide](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors) |
| CHANGELOG.md    | バージョン履歴       | [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)                                                                                                |
| SECURITY.md     | セキュリティポリシー | [GitHub Security Policy](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository)                          |

---

### 4. Single Source of Truth Strategy

**Decision**: 重複コンテンツを特定し、単一ソースに統合

**Current Duplications Identified**:

| Content                    | Current Locations                              | Single Source                                |
| -------------------------- | ---------------------------------------------- | -------------------------------------------- |
| プロジェクト概要           | README.md, docs/README.md                      | README.md                                    |
| 理論的基盤（ナッジ理論等） | README.md, docs/README.md                      | docs/explanation/design-principles.md        |
| クイックスタート           | specs/001-\*/quickstart.md, docs/quickstart.md | docs/quickstart.md                           |
| アーキテクチャ図           | README.md, docs/architecture/overview.md       | docs/reference/architecture/overview.md      |
| 機能リスト                 | README.md, docs/README.md                      | README.md（簡潔版）→ docs/（詳細版）へリンク |

**Consolidation Strategy**:

1. 各コンテンツの「正規ソース」を決定
2. 他の場所はリンクで参照
3. 必要に応じて要約版を配置（リンク付き）

---

### 5. Link Validation Strategy

**Decision**: Markdown リンク検証を実装

**Options Evaluated**:

| Tool                | Pros                     | Cons                   | Decision  |
| ------------------- | ------------------------ | ---------------------- | --------- |
| markdown-link-check | シンプル、npm で利用可能 | 設定が必要             | ✅ 推奨   |
| lychee              | 高速、Rust 製            | 追加インストール必要   | 代替案    |
| 手動確認            | ツール不要               | 時間がかかる、漏れ発生 | ❌ 不採用 |

**Implementation**:

```bash
# package.json に追加
npm install --save-dev markdown-link-check

# スクリプト追加
"scripts": {
  "check-links": "find docs -name '*.md' -exec markdown-link-check {} \\;"
}
```

---

### 6. Audience Navigation Paths

**Decision**: 4 つの読者タイプに対応したナビゲーションパスを定義

**Paths Defined**:

| 読者タイプ         | 開始点         | パス                                                                   | 推定時間 |
| ------------------ | -------------- | ---------------------------------------------------------------------- | -------- |
| 開発者             | README.md      | → quickstart.md → architecture/overview.md → implementation-details.md | 30 分    |
| セキュリティ担当者 | docs/README.md | → security/requirements.md → threat-model.md → implementation.md       | 45 分    |
| 運用担当者         | docs/README.md | → quickstart.md → operations/slack-setup.md → monitoring.md            | 30 分    |
| 意思決定者         | docs/README.md | → presentation/non-technical-overview.md → security-overview.md        | 20 分    |

---

## Existing Documentation Analysis

### Current Structure Issues

1. **docs/README.md が長すぎる** (396 行):

   - エグゼクティブサマリー、理論的基盤、ドキュメント構成が混在
   - ナビゲーションハブとしての役割が不明確

2. **README.md の冗長性**:

   - 理論的基盤が概要に含まれている（本来は別ドキュメント）
   - 機能リストが詳細すぎる

3. **重複コンテンツ**:

   - quickstart.md が 2 箇所に存在
   - アーキテクチャ図が複数箇所に存在
   - 設計原則が README と docs/README の両方に記載

4. **標準ファイルの欠如**:
   - CONTRIBUTING.md が存在しない
   - CHANGELOG.md が存在しない
   - SECURITY.md が存在しない

### Content Migration Plan

| 移動元                                  | 移動先                                | アクション |
| --------------------------------------- | ------------------------------------- | ---------- |
| docs/README.md (理論的基盤)             | docs/explanation/design-principles.md | 移動       |
| docs/README.md (エグゼクティブサマリー) | docs/README.md (簡潔化)               | 圧縮       |
| specs/001-\*/quickstart.md              | docs/quickstart.md                    | 統合       |
| README.md (理論的基盤)                  | 削除（docs/explanation へリンク）     | 参照化     |
| docs/architecture/                      | docs/reference/architecture/          | リネーム   |
| docs/security/                          | docs/reference/security/              | リネーム   |
| docs/operations/                        | docs/reference/operations/            | リネーム   |
| docs/adr/                               | docs/explanation/adr/                 | 移動       |

---

## Conclusion

すべての調査項目が完了し、実装方針が決定された。次のフェーズ（Phase 1: Design & Contracts）に進む準備が整った。
