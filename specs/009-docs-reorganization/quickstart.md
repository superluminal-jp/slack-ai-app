# Quickstart: Documentation Reorganization

**Feature**: 009-docs-reorganization
**Date**: 2025-12-27
**Purpose**: Step-by-step guide to execute the documentation reorganization

## Prerequisites

- [ ] Git リポジトリへのアクセス権
- [ ] Markdown エディタ（VS Code 推奨）
- [ ] 現在のドキュメント構造の理解

## Phase 1: 新規ファイルの作成

### Step 1.1: 標準ファイルの作成

```bash
# ルートディレクトリで実行
touch CONTRIBUTING.md CHANGELOG.md SECURITY.md
```

### Step 1.2: 新規ディレクトリの作成

```bash
# docs/ 配下に新しいディレクトリを作成
mkdir -p docs/tutorials
mkdir -p docs/how-to
mkdir -p docs/reference
mkdir -p docs/explanation
```

## Phase 2: コンテンツの移動

### Step 2.1: 既存フォルダの移動

```bash
# アーキテクチャドキュメントを reference/ に移動
mv docs/architecture docs/reference/architecture

# セキュリティドキュメントを reference/ に移動
mv docs/security docs/reference/security

# 運用ドキュメントを reference/ に移動
mv docs/operations docs/reference/operations

# 要件ドキュメントを reference/ に移動
mv docs/requirements docs/reference/requirements

# ADR を explanation/ に移動
mv docs/adr docs/explanation/adr
```

### Step 2.2: 理論的基盤の抽出

1. `docs/README.md` を開く
2. 「設計原則」セクション（ナッジ理論、ネットワーク効果等）を切り取り
3. `docs/explanation/design-principles.md` として保存
4. 元の場所にリンクを配置

## Phase 3: リンクの更新

### Step 3.1: 内部リンクの更新

すべてのドキュメントで以下のパターンを検索・置換：

| 旧パス | 新パス |
| ------ | ------ |
| `./architecture/` | `./reference/architecture/` |
| `./security/` | `./reference/security/` |
| `./operations/` | `./reference/operations/` |
| `./requirements/` | `./reference/requirements/` |
| `./adr/` | `./explanation/adr/` |

### Step 3.2: リンク検証

```bash
# markdown-link-check をインストール（初回のみ）
npm install -g markdown-link-check

# すべての Markdown ファイルをチェック
find docs -name '*.md' -exec markdown-link-check {} \;
find . -maxdepth 1 -name '*.md' -exec markdown-link-check {} \;
```

## Phase 4: README の簡素化

### Step 4.1: README.md の編集

目標: 200 行以内

1. 理論的基盤を削除（`docs/explanation/design-principles.md` へリンク）
2. 機能リストを簡潔化（カテゴリのみ、詳細は docs/ へ）
3. 冗長な説明を削除

### Step 4.2: docs/README.md の編集

目標: 100 行以内

1. エグゼクティブサマリーを圧縮（3-5 行）
2. 理論的基盤を削除（リンクのみ）
3. 読者別ナビゲーションを追加
4. ドキュメントインデックスを簡潔化

## Phase 5: 新規ドキュメントの作成

### Step 5.1: CONTRIBUTING.md

```markdown
# Contributing to Slack Bedrock MVP

## Welcome

Thank you for your interest in contributing!

## How to Contribute

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Development Setup

See [docs/quickstart.md](docs/quickstart.md)

## Code Style

- Python: PEP 8
- TypeScript: Standard conventions
- Markdown: Consistent formatting

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass
4. Request review
```

### Step 5.2: CHANGELOG.md

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Documentation reorganization (009-docs-reorganization)

## [1.0.0] - 2025-12-27

### Added
- Initial release
- Slack to Bedrock integration
- Multi-layered security
- Thread support
- Attachment processing
```

### Step 5.3: SECURITY.md

```markdown
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities to [security contact].

Do NOT create public GitHub issues for security vulnerabilities.

## Response Process

1. Acknowledgment within 48 hours
2. Investigation within 7 days
3. Fix and disclosure coordinated with reporter
```

## Phase 6: 検証

### Step 6.1: 行数確認

```bash
# README.md の行数確認
wc -l README.md
# 目標: ≤ 200 行

# docs/README.md の行数確認
wc -l docs/README.md
# 目標: ≤ 100 行
```

### Step 6.2: リンク切れ確認

```bash
find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*' -exec markdown-link-check {} \;
```

### Step 6.3: 構造確認

```bash
# ディレクトリ構造の確認
tree docs -d
```

期待される出力：
```
docs
├── explanation
│   └── adr
├── how-to
├── implementation
├── presentation
├── reference
│   ├── architecture
│   ├── operations
│   ├── requirements
│   └── security
└── tutorials
```

## Rollback Plan

問題が発生した場合：

```bash
# すべての変更を取り消し
git checkout .

# 特定のファイルのみ取り消し
git checkout -- <file>
```

## Success Criteria Verification

| 基準 | 確認方法 | 目標 |
| ---- | -------- | ---- |
| README.md 行数 | `wc -l README.md` | ≤ 200 |
| docs/README.md 行数 | `wc -l docs/README.md` | ≤ 100 |
| リンク切れ | markdown-link-check | 0 件 |
| 標準ファイル | `ls *.md` | CONTRIBUTING, CHANGELOG, SECURITY |
| Diátaxis 構造 | `tree docs -d` | tutorials, how-to, reference, explanation |

