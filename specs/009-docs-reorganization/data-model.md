# Data Model: Documentation Reorganization

**Feature**: 009-docs-reorganization
**Date**: 2025-12-27

## Overview

ドキュメント再整理における「データモデル」は、ドキュメント構造とメタデータの定義を指す。

## Entities

### Document

ドキュメントファイルを表すエンティティ。

| Field        | Type   | Description                                    | Required |
| ------------ | ------ | ---------------------------------------------- | -------- |
| path         | string | ファイルパス（リポジトリルートからの相対パス） | ✅       |
| title        | string | ドキュメントタイトル（H1 見出し）              | ✅       |
| type         | enum   | Tutorial, How-to, Reference, Explanation       | ✅       |
| language     | enum   | ja, en                                         | ✅       |
| audience     | enum[] | Developer, Security, Operations, DecisionMaker | ✅       |
| status       | enum   | Draft, Published, Deprecated                   | ✅       |
| created_date | date   | 作成日                                         | ✅       |
| updated_date | date   | 最終更新日                                     | ✅       |
| version      | string | ドキュメントバージョン                         | ❌       |

### Navigation Path

読者別ナビゲーションパスを表すエンティティ。

| Field          | Type       | Description                                    | Required |
| -------------- | ---------- | ---------------------------------------------- | -------- |
| audience_type  | enum       | Developer, Security, Operations, DecisionMaker | ✅       |
| documents      | Document[] | パスに含まれるドキュメントの順序付きリスト     | ✅       |
| estimated_time | number     | 推定所要時間（分）                             | ✅       |
| description    | string     | パスの目的・説明                               | ✅       |

### Cross-Reference

ドキュメント間の参照を表すエンティティ。

| Field     | Type     | Description                              | Required |
| --------- | -------- | ---------------------------------------- | -------- |
| source    | Document | 参照元ドキュメント                       | ✅       |
| target    | Document | 参照先ドキュメント                       | ✅       |
| context   | string   | 参照コンテキスト（なぜリンクしているか） | ❌       |
| link_type | enum     | Internal, External, Anchor               | ✅       |

## Document Types (Diátaxis)

### Tutorial

学習指向のドキュメント。読者がプロジェクトを学ぶ際に使用。

**Characteristics**:

- ステップバイステップ形式
- 完全な例を含む
- 学習目標が明確

**Examples**:

- Getting Started Guide
- First Project Tutorial

### How-to

タスク指向のドキュメント。特定の問題を解決する際に使用。

**Characteristics**:

- 問題解決に焦点
- 前提知識を仮定
- 結果が明確

**Examples**:

- Quickstart Guide
- Troubleshooting Guide
- Deployment Guide

### Reference

情報指向のドキュメント。正確な情報を参照する際に使用。

**Characteristics**:

- 完全で正確
- 構造化された情報
- 検索しやすい

**Examples**:

- Architecture Overview
- Security Requirements
- API Reference

### Explanation

理解指向のドキュメント。背景や理由を理解する際に使用。

**Characteristics**:

- 背景と理由を説明
- 代替案と比較
- 設計判断の根拠

**Examples**:

- Design Principles
- Architecture Decision Records (ADRs)

## Proposed Directory Structure

```
slack-ai-app/
├── README.md                           # L1: プロジェクト概要
├── README.ja.md                        # L1: 日本語版
├── CONTRIBUTING.md                     # 新規: 貢献ガイドライン
├── CHANGELOG.md                        # 新規: バージョン履歴
├── SECURITY.md                         # 新規: セキュリティポリシー
│
└── docs/
    ├── README.md                       # L2: ナビゲーションハブ
    ├── quickstart.md                   # How-to: クイックスタート
    │
    ├── tutorials/                      # 新規フォルダ
    │   └── getting-started.md          # Tutorial: 初心者向けガイド
    │
    ├── how-to/                         # 新規フォルダ
    │   ├── deployment.md               # How-to: デプロイ手順
    │   └── troubleshooting.md          # How-to: トラブルシューティング
    │
    ├── reference/                      # リネーム: 既存フォルダの再整理
    │   ├── architecture/               # 移動元: docs/architecture/
    │   │   ├── overview.md
    │   │   ├── user-experience.md
    │   │   └── implementation-details.md
    │   ├── security/                   # 移動元: docs/security/
    │   │   ├── requirements.md
    │   │   ├── threat-model.md
    │   │   ├── implementation.md
    │   │   └── authentication-authorization.md
    │   ├── operations/                 # 移動元: docs/operations/
    │   │   ├── slack-setup.md
    │   │   ├── testing.md
    │   │   └── monitoring.md
    │   └── requirements/               # 移動元: docs/requirements/
    │       └── functional-requirements.md
    │
    ├── explanation/                    # 新規フォルダ
    │   ├── design-principles.md        # 新規: 理論的基盤（docs/README.md から移動）
    │   └── adr/                        # 移動元: docs/adr/
    │       ├── README.md
    │       ├── 001-bedrock-foundation-model.md
    │       ├── 002-regex-pii-detection.md
    │       ├── 003-response-url-async.md
    │       └── 004-slack-api-existence-check.md
    │
    ├── presentation/                   # 維持: 非技術者向け
    │   ├── README.md
    │   ├── non-technical-overview.md
    │   └── security-overview.md
    │
    ├── implementation/                 # 維持
    │   └── roadmap.md
    │
    ├── appendix.md                     # 維持: 用語集
    └── slack-app-manifest.yaml         # 維持
```

## Document Metadata Template

各ドキュメントの冒頭に含めるメタデータ形式：

```markdown
---
title: [Document Title]
type: [Tutorial | How-to | Reference | Explanation]
audience: [Developer, Security, Operations, DecisionMaker]
status: [Draft | Published | Deprecated]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

## Migration Matrix

| 現在のパス                      | 新しいパス                            | アクション |
| ------------------------------- | ------------------------------------- | ---------- |
| docs/architecture/\*            | docs/reference/architecture/\*        | 移動       |
| docs/security/\*                | docs/reference/security/\*            | 移動       |
| docs/operations/\*              | docs/reference/operations/\*          | 移動       |
| docs/requirements/\*            | docs/reference/requirements/\*        | 移動       |
| docs/adr/\*                     | docs/explanation/adr/\*               | 移動       |
| docs/README.md (理論的基盤部分) | docs/explanation/design-principles.md | 抽出・移動 |
| specs/001-\*/quickstart.md      | docs/quickstart.md                    | 統合       |
| (新規)                          | docs/tutorials/getting-started.md     | 作成       |
| (新規)                          | docs/how-to/deployment.md             | 作成       |
| (新規)                          | docs/how-to/troubleshooting.md        | 作成       |
| (新規)                          | CONTRIBUTING.md                       | 作成       |
| (新規)                          | CHANGELOG.md                          | 作成       |
| (新規)                          | SECURITY.md                           | 作成       |
