# Contributing to Slack Bedrock MVP

[English](#contributing-to-slack-bedrock-mvp) | [日本語](#slack-bedrock-mvp-への貢献)

Thank you for your interest in contributing to Slack Bedrock MVP! This document provides guidelines for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. We expect all contributors to:

- Be respectful and considerate in all interactions
- Accept constructive criticism gracefully
- Focus on what is best for the community and project
- Show empathy towards other community members

## How to Contribute

### Reporting Issues

1. Check existing issues to avoid duplicates
2. Use the issue template when creating new issues
3. Provide clear reproduction steps for bugs
4. Include relevant environment information

### Suggesting Features

1. Open an issue with the "enhancement" label
2. Describe the use case and expected behavior
3. Explain why this feature would benefit the project

### Submitting Code

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes following our style guidelines
4. Write or update tests as needed
5. Submit a pull request

## Development Setup

See [docs/quickstart.md](docs/quickstart.md) for detailed setup instructions.

### Quick Start

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/slack-ai-app.git
cd slack-ai-app

# Install dependencies
cd src && npm install

# Run tests
cd ../lambda/verification-stack/slack-event-handler && pytest
cd ../../execution-stack/bedrock-processor && pytest
```

## Pull Request Process

1. **Update documentation** if your changes affect user-facing features
2. **Add tests** for new features or bug fixes
3. **Ensure all tests pass** before submitting
4. **Request review** from maintainers
5. **Address feedback** promptly and constructively

### PR Title Format

Use conventional commit format:

- `feat: Add new feature`
- `fix: Fix bug description`
- `docs: Update documentation`
- `refactor: Refactor code`
- `test: Add tests`

## Style Guidelines

### Python (Lambda Functions)

- Follow PEP 8
- Use type hints on all functions
- Use Google/NumPy docstring style
- Maximum line length: 88 characters (Black formatter)

### TypeScript (CDK Infrastructure)

- Use ESLint with recommended rules
- Use Prettier for formatting
- Prefer `const` over `let`
- Use explicit types for function parameters

### Markdown (Documentation)

- Use consistent heading hierarchy
- Include language tags in code blocks
- Use relative links for internal references
- Keep line length reasonable for readability

---

# Slack Bedrock MVP への貢献

Slack Bedrock MVP への貢献に興味を持っていただきありがとうございます！このドキュメントでは、プロジェクトへの貢献に関するガイドラインを提供します。

## 目次

- [行動規範](#行動規範)
- [貢献方法](#貢献方法)
- [開発環境のセットアップ](#開発環境のセットアップ)
- [プルリクエストプロセス](#プルリクエストプロセス)
- [スタイルガイドライン](#スタイルガイドライン)

## 行動規範

このプロジェクトに参加することで、敬意ある包括的な環境を維持することに同意します。すべての貢献者に期待すること：

- すべてのやり取りにおいて敬意を持ち、思いやりを持つ
- 建設的な批判を受け入れる
- コミュニティとプロジェクトにとって最善なことに焦点を当てる
- 他のコミュニティメンバーへの共感を示す

## 貢献方法

### Issue の報告

1. 重複を避けるために既存の Issue を確認する
2. 新しい Issue を作成する際は Issue テンプレートを使用する
3. バグの場合は明確な再現手順を提供する
4. 関連する環境情報を含める

### 機能の提案

1. "enhancement" ラベル付きで Issue を開く
2. ユースケースと期待される動作を説明する
3. この機能がプロジェクトにどのように役立つかを説明する

### コードの提出

1. リポジトリをフォークする
2. `main` から機能ブランチを作成する
3. スタイルガイドラインに従って変更を行う
4. 必要に応じてテストを作成または更新する
5. プルリクエストを提出する

## 開発環境のセットアップ

詳細なセットアップ手順については [docs/quickstart.md](docs/quickstart.md) を参照してください。

## プルリクエストプロセス

1. 変更がユーザー向け機能に影響する場合は**ドキュメントを更新**する
2. 新機能やバグ修正には**テストを追加**する
3. 提出前に**すべてのテストが通る**ことを確認する
4. メンテナーに**レビューをリクエスト**する
5. フィードバックに**迅速かつ建設的に対応**する

## スタイルガイドライン

### Python（Lambda 関数）

- PEP 8 に従う
- すべての関数に型ヒントを使用する
- Google/NumPy docstring スタイルを使用する
- 最大行長: 88 文字（Black フォーマッター）

### TypeScript（CDK インフラストラクチャ）

- 推奨ルールで ESLint を使用する
- フォーマットには Prettier を使用する
- `let` より `const` を優先する
- 関数パラメータには明示的な型を使用する

### Markdown（ドキュメント）

- 一貫した見出し階層を使用する
- コードブロックに言語タグを含める
- 内部参照には相対リンクを使用する
- 読みやすさのために行の長さを適切に保つ

