# Slack Bedrock MVP ドキュメント

> **English version**: Coming soon

Slack から AWS Bedrock AI を利用するためのアーキテクチャと実装ガイド。

## 🚀 クイックナビゲーション

| 目的 | ドキュメント |
| ---- | ------------ |
| **今すぐ始める** | [クイックスタート](./quickstart.md) |
| **システム理解** | [アーキテクチャ概要](./reference/architecture/overview.md) |
| **セキュリティ確認** | [セキュリティ要件](./reference/security/requirements.md) |
| **運用設定** | [Slack 設定ガイド](./reference/operations/slack-setup.md) |

## 👥 読者別ガイド

### 開発者

1. [クイックスタート](./quickstart.md) - 環境セットアップ
2. [アーキテクチャ概要](./reference/architecture/overview.md) - システム全体像
3. [実装詳細](./reference/architecture/implementation-details.md) - Lambda 構成、データフロー
4. [チュートリアル](./tutorials/getting-started.md) - ステップバイステップガイド

### セキュリティ担当者

1. [セキュリティ要件](./reference/security/requirements.md) - 機能・非機能要件
2. [脅威モデル](./reference/security/threat-model.md) - リスク分析
3. [セキュリティ実装](./reference/security/implementation.md) - 多層防御
4. [認証・認可](./reference/security/authentication-authorization.md) - Two-Key Defense

### 運用担当者

1. [クイックスタート](./quickstart.md) - デプロイ手順
2. [Slack 設定ガイド](./reference/operations/slack-setup.md) - Slack App 設定
3. [モニタリング](./reference/operations/monitoring.md) - CloudWatch、アラート
4. [トラブルシューティング](./how-to/troubleshooting.md) - 問題解決

### 意思決定者・マネージャー

1. [非技術者向け概要](./presentation/non-technical-overview.md) - ビジネス価値
2. [セキュリティ概要](./presentation/security-overview.md) - セキュリティ説明
3. [設計原則](./explanation/design-principles.md) - 理論的基盤

## 📚 ドキュメント一覧

### Tutorials（学習指向）

- [Getting Started](./tutorials/getting-started.md) - 初心者向けチュートリアル

### How-to（タスク指向）

- [クイックスタート](./quickstart.md) - デプロイ手順
- [トラブルシューティング](./how-to/troubleshooting.md) - 問題解決ガイド

### Reference（情報指向）

**アーキテクチャ**:
- [概要](./reference/architecture/overview.md) | [実装詳細](./reference/architecture/implementation-details.md) | [ユーザー体験](./reference/architecture/user-experience.md)

**セキュリティ**:
- [要件](./reference/security/requirements.md) | [脅威モデル](./reference/security/threat-model.md) | [実装](./reference/security/implementation.md) | [認証・認可](./reference/security/authentication-authorization.md)

**運用**:
- [Slack 設定](./reference/operations/slack-setup.md) | [テスト](./reference/operations/testing.md) | [モニタリング](./reference/operations/monitoring.md)

**要件**:
- [機能要件](./reference/requirements/functional-requirements.md)

### Explanation（理解指向）

- [設計原則](./explanation/design-principles.md) - ナッジ理論、ネットワーク効果
- [ADR 一覧](./explanation/adr/README.md) - アーキテクチャ決定記録

### Presentation（非技術者向け）

- [非技術者向け概要](./presentation/non-technical-overview.md)
- [セキュリティ概要](./presentation/security-overview.md)

### その他

- [付録](./appendix.md) - 用語集、参考文献
- [実装ロードマップ](./implementation/roadmap.md)
- [Slack App マニフェスト](./slack-app-manifest.yaml)

---

**最終更新日**: 2025-12-27
