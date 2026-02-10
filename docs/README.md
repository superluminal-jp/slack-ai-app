# Slack AI App ドキュメント

Slack から Amazon Bedrock AI を利用するためのシステムドキュメント。
AgentCore Runtime + FastAPI による A2A ゾーン間通信アーキテクチャ。

## クイックナビゲーション

| 目的 | ドキュメント |
| ---- | ------------ |
| **デプロイ** | [クイックスタート](./quickstart.md) |
| **セキュリティ** | [認証・認可 (Two-Key Defense)](./reference/security/authentication-authorization.md) |
| **Slack 設定** | [Slack App 設定ガイド](./reference/operations/slack-setup.md) |
| **障害対応** | [トラブルシューティング](./how-to/troubleshooting.md) |

## ドキュメント一覧

### How-to（運用・タスク）

- [クイックスタート](./quickstart.md) — デプロイ手順
- [トラブルシューティング](./how-to/troubleshooting.md) — 問題解決ガイド
- [返信なし診断](./how-to/troubleshooting-no-reply.md) — メンションに無応答時のチェックリスト
- [処理フロー検証](./how-to/verify-processing-flow.md) — E2E フローの確認手順

### Reference（仕様・構成）

**セキュリティ**:
- [認証・認可](./reference/security/authentication-authorization.md) — Two-Key Defense モデル
- [脅威モデル](./reference/security/threat-model.md) — リスク分析

**運用**:
- [Slack App 設定](./reference/operations/slack-setup.md) — OAuth スコープ、イベント設定
- [モニタリング](./reference/operations/monitoring.md) — CloudWatch アラーム、インシデント対応

**要件**:
- [機能要件](./reference/requirements/functional-requirements.md)

### Explanation（設計思想）

- [設計原則](./explanation/design-principles.md) — ナッジ理論、ネットワーク効果
- [ADR 一覧](./explanation/adr/README.md) — アーキテクチャ決定記録

### Presentation（非技術者向け）

- [非技術者向け概要](./presentation/non-technical-overview.md) — ビジネス価値
- [セキュリティ概要](./presentation/security-overview.md) — セキュリティ説明

### その他

- [付録](./appendix.md) — 用語集、参考文献
- [Slack App マニフェスト](./slack-app-manifest.yaml)

---

**最終更新日**: 2026-02-10
