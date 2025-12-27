# Feature Specification: Documentation Reorganization

**Feature Branch**: `009-docs-reorganization`  
**Created**: 2025-12-27  
**Status**: Draft  
**Input**: User description: "ドキュメントを全て確認してベストプラクティスに則った形に抜本的に再整理"

## Executive Summary

プロジェクトドキュメントを業界標準のベストプラクティスに基づいて抜本的に再整理する。Diátaxis フレームワーク、Single Source of Truth 原則、Progressive Disclosure パターンを採用し、異なる読者層に最適化されたドキュメント構造を実現する。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 新規開発者のオンボーディング (Priority: P1)

新規開発者がプロジェクトに参加する際、5 分以内に開発環境をセットアップし、30 分以内にプロジェクト全体を理解できるようになる。

**Why this priority**: 開発者のオンボーディング時間短縮は直接的な生産性向上につながる。ドキュメントの主要なユースケース。

**Independent Test**: 新規開発者が README.md から開始し、開発環境セットアップ完了までの時間を計測。

**Acceptance Scenarios**:

1. **Given** 新規開発者がリポジトリをクローンした, **When** README.md を開く, **Then** 5 分以内にプロジェクトの目的・価値が理解でき、次のステップが明確
2. **Given** README.md を読んだ開発者, **When** クイックスタートに従う, **Then** 10 分以内に開発環境がセットアップ完了
3. **Given** セットアップ完了した開発者, **When** アーキテクチャドキュメントを読む, **Then** 30 分以内にシステム全体像を理解

---

### User Story 2 - セキュリティ担当者の評価 (Priority: P1)

セキュリティ担当者がシステムのセキュリティ実装を評価する際、セキュリティ関連ドキュメントに迷わずアクセスし、包括的な評価ができる。

**Why this priority**: セキュリティファースト設計のプロジェクトとして、セキュリティドキュメントへのアクセシビリティは重要。

**Independent Test**: セキュリティ担当者がセキュリティ要件、脅威モデル、実装詳細にアクセスし、評価レポートを作成できる。

**Acceptance Scenarios**:

1. **Given** セキュリティ担当者がドキュメントにアクセス, **When** セキュリティセクションを探す, **Then** 3 クリック以内でセキュリティ要件に到達
2. **Given** セキュリティ要件を確認した担当者, **When** 実装詳細を確認したい, **Then** 関連ドキュメントへのリンクが明確で迷わずアクセス可能

---

### User Story 3 - 運用担当者のトラブルシューティング (Priority: P2)

運用担当者が問題発生時に迅速にトラブルシューティングガイドにアクセスし、問題解決できる。

**Why this priority**: 本番環境の安定運用に直結。問題解決時間の短縮。

**Independent Test**: 運用担当者が一般的なエラーシナリオに対するトラブルシューティング手順を 2 分以内に見つけられる。

**Acceptance Scenarios**:

1. **Given** エラーが発生した, **When** 運用担当者がドキュメントを検索, **Then** 2 分以内にトラブルシューティングガイドに到達
2. **Given** トラブルシューティングガイドを開いた, **When** エラーメッセージで検索, **Then** 対応手順が明確に記載されている

---

### User Story 4 - 意思決定者への説明 (Priority: P2)

マネージャーや経営層に対してシステムの価値とセキュリティを説明する際、非技術者向けの資料に迷わずアクセスできる。

**Why this priority**: 組織導入の推進に必要。ステークホルダーへの説明資料。

**Independent Test**: 非技術者向けプレゼンテーション資料が 1 クリックでアクセス可能。

**Acceptance Scenarios**:

1. **Given** マネージャーへの説明が必要, **When** プレゼンテーション資料を探す, **Then** docs/presentation/ から直接アクセス可能
2. **Given** プレゼンテーション資料を開いた, **When** 内容を確認, **Then** 非技術者でも理解できる言葉で説明されている

---

### User Story 5 - コントリビューターの参加 (Priority: P3)

外部コントリビューターがプロジェクトに貢献する際、貢献ガイドラインを迅速に見つけ、適切な方法で貢献できる。

**Why this priority**: オープンソースプロジェクトとしての健全な成長。

**Independent Test**: コントリビューターが CONTRIBUTING.md を見つけ、PR 提出までのプロセスを理解できる。

**Acceptance Scenarios**:

1. **Given** 外部コントリビューターがリポジトリを発見, **When** 貢献方法を探す, **Then** CONTRIBUTING.md がルートに存在し、手順が明確
2. **Given** CONTRIBUTING.md を読んだ, **When** PR を作成, **Then** ガイドラインに沿った PR が作成できる

---

### Edge Cases

- ドキュメント間のリンク切れが発生した場合の検出と修正
- 多言語ドキュメント（日本語/英語）の同期が取れなくなった場合
- 古いドキュメントへの外部リンクが存在する場合のリダイレクト

## Requirements _(mandatory)_

### Functional Requirements

#### 構造と組織

- **FR-001**: ドキュメントは Diátaxis フレームワーク（Tutorials, How-to, Reference, Explanation）に基づいて分類される
- **FR-002**: README.md はプロジェクト概要と主要ナビゲーションのみを含み、詳細は専用ドキュメントへリンク（Progressive Disclosure）
- **FR-003**: 同一情報は単一ソースで管理され、他のドキュメントはリンクで参照（Single Source of Truth）
- **FR-004**: 日本語版と英語版は別ファイルで管理され、相互リンクで接続

#### 標準ファイル

- **FR-005**: CONTRIBUTING.md がルートディレクトリに存在し、貢献ガイドラインを提供
- **FR-006**: CHANGELOG.md がルートディレクトリに存在し、バージョン履歴を追跡（Keep a Changelog 形式）
- **FR-007**: SECURITY.md がルートディレクトリに存在し、セキュリティポリシーと脆弱性報告手順を提供

#### ナビゲーションとアクセシビリティ

- **FR-008**: docs/README.md はナビゲーションハブとして機能し、詳細コンテンツを含まない
- **FR-009**: 各ドキュメントは読者別ナビゲーションパス（開発者、セキュリティ担当者、運用担当者、意思決定者）を提供
- **FR-010**: 各ドキュメントにはメタデータ（作成日、更新日、対象読者、ステータス）が含まれる

#### コンテンツ整理

- **FR-011**: 理論的基盤（ナッジ理論、ネットワーク効果等）は専用ドキュメント（docs/concepts/design-principles.md）に移動
- **FR-012**: クイックスタートガイドは単一ソース（docs/quickstart.md）に統合
- **FR-013**: プレゼンテーション資料は docs/presentation/ に整理され、目的別にアクセス可能

#### 品質保証

- **FR-014**: すべての内部リンクは有効で、リンク切れが存在しない
- **FR-015**: すべてのドキュメントは一貫したフォーマット（Markdown）とスタイルに従う

### Key Entities

- **Document**: タイトル、パス、タイプ（Tutorial/How-to/Reference/Explanation）、言語、対象読者、ステータス
- **Navigation Path**: 読者タイプ、ドキュメントシーケンス、推定所要時間
- **Cross-Reference**: ソースドキュメント、ターゲットドキュメント、コンテキスト

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 新規開発者のオンボーディング時間が 50% 短縮（目標: 30 分以内でプロジェクト理解）
- **SC-002**: 任意のドキュメントへのアクセスが 3 クリック以内で可能
- **SC-003**: ドキュメント間の重複コンテンツが 80% 削減
- **SC-004**: リンク切れが 0 件
- **SC-005**: 各読者タイプ（開発者、セキュリティ担当者、運用担当者、意思決定者）に対して明確なナビゲーションパスが存在
- **SC-006**: README.md が 200 行以内に簡潔化（現状: 486 行）
- **SC-007**: docs/README.md がナビゲーションハブとして 100 行以内に簡潔化（現状: 396 行）

## Assumptions

- 既存ドキュメントのコンテンツは技術的に正確であり、内容の修正は不要（構造の再整理のみ）
- 日本語を主言語とし、英語版は補助的に提供
- Git ベースのバージョン管理を継続使用
- Markdown 形式を継続使用

## Best Practices Applied

### 1. Diátaxis Framework

ドキュメントを 4 つのタイプに分類：

| タイプ      | 目的                           | 例                          |
| ----------- | ------------------------------ | --------------------------- |
| Tutorials   | 学習指向、ステップバイステップ | Getting Started             |
| How-to      | タスク指向、問題解決           | Quickstart, Troubleshooting |
| Reference   | 情報指向、正確な記述           | Architecture, Security      |
| Explanation | 理解指向、背景説明             | Design Principles, ADRs     |

### 2. Progressive Disclosure

- README.md: 概要のみ（5 分で読める）
- docs/README.md: ナビゲーションハブ（読者別パス）
- 詳細ドキュメント: 専門的な内容

### 3. Single Source of Truth

- 各情報は 1 箇所のみに記載
- 他の場所ではリンクで参照
- 重複による不整合を防止

### 4. Audience-First Design

- 読者別ナビゲーションパス
- 技術レベルに応じた説明
- 目的に応じたドキュメント構造

### 5. Standard Files (GitHub/OSS Best Practices)

- README.md - プロジェクト概要
- CONTRIBUTING.md - 貢献ガイドライン
- CHANGELOG.md - バージョン履歴
- SECURITY.md - セキュリティポリシー
- LICENSE - ライセンス情報

## Proposed Structure

```
slack-ai-app/
├── README.md                    # 簡潔な概要（200行以内）
├── README.ja.md                 # 日本語版概要
├── CONTRIBUTING.md              # 貢献ガイドライン（新規）
├── CHANGELOG.md                 # バージョン履歴（新規）
├── SECURITY.md                  # セキュリティポリシー（新規）
├── docs/
│   ├── README.md                # ナビゲーションハブ（100行以内）
│   ├── quickstart.md            # 統合クイックスタート
│   │
│   ├── tutorials/               # 学習指向（新規フォルダ）
│   │   └── getting-started.md
│   │
│   ├── how-to/                  # タスク指向（新規フォルダ）
│   │   ├── deployment.md
│   │   └── troubleshooting.md
│   │
│   ├── reference/               # 情報指向（既存の再整理）
│   │   ├── architecture/
│   │   ├── security/
│   │   └── operations/
│   │
│   ├── explanation/             # 理解指向（新規フォルダ）
│   │   ├── design-principles.md # 理論的基盤を移動
│   │   └── adr/
│   │
│   ├── presentation/            # 非技術者向け（既存維持）
│   │   ├── README.md
│   │   ├── non-technical-overview.md
│   │   └── security-overview.md
│   │
│   └── appendix.md              # 用語集・参照
```

## Out of Scope

- ドキュメントコンテンツの技術的正確性の検証（構造の再整理のみ）
- 自動ドキュメント生成システムの導入
- ドキュメントの翻訳サービス統合
- ドキュメントサイト（Docusaurus, MkDocs 等）の導入
