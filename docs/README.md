# Slack AI App ドキュメント

**目的**: 読者別のドキュメント入口を提供し、開発者・意思決定者・ユーザーが目的の文書に 2 クリックで到達できるようにする。
**対象読者**: ドキュメント利用者全般（開発者、意思決定者、エンドユーザー、メンテナー）
**最終更新日**: 2026-02-14

Slack から Amazon Bedrock AI を利用するためのシステムドキュメント。AgentCore Runtime と A2A によるゾーン間通信を採用しています。

---

## クイックナビゲーション

| 目的 | ドキュメント |
|------|----------------|
| **デプロイ** | [クイックスタート](developer/quickstart.md) |
| **セキュリティ** | [セキュリティ（開発者）](developer/security.md) / [セキュリティ概要（意思決定者）](decision-maker/security-overview.md) |
| **使い方（エンドユーザー）** | [ユーザーガイド](user/user-guide.md) |
| **障害対応** | [トラブルシューティング](developer/troubleshooting.md) |

---

## 開発者向け（Developer）

デプロイ、アーキテクチャ、運用、テスト、要件、セキュリティ、障害対応は次の文書を参照してください。

| 文書 | 説明 |
|------|------|
| [クイックスタート](developer/quickstart.md) | 初回デプロイ・環境構築の手順 |
| [アーキテクチャ](developer/architecture.md) | 概要・コンポーネント・データフロー・クロスアカウント・実装詳細・ユーザー体験・用語集 |
| [運用ガイド（Runbook）](developer/runbook.md) | Slack App 設定、モニタリング・アラーム、IAM ポリシー、インシデント対応 |
| [テスト](developer/testing.md) | テストの実行方法・範囲・検証観点 |
| [要件・設定リファレンス](developer/requirements.md) | 機能要件一覧・設定項目（cdk.config 等） |
| [ADR 一覧](developer/adr/README.md) | アーキテクチャ決定記録（001–004） |
| [セキュリティ](developer/security.md) | 認証・認可（Two-Key Defense）、脅威モデル、要件、実装、CMK 検討 |
| [トラブルシューティング](developer/troubleshooting.md) | よくあるエラー、返信なし診断、処理フロー検証 |

---

## 意思決定者向け（Decision-Maker）

ビジネス価値、セキュリティ概要、設計原則、コスト・リソース、ガバナンスは次の文書を参照してください。

| 文書 | 説明 |
|------|------|
| [プロジェクト提案書](decision-maker/proposal.md) | 背景・課題・ソリューション概要・期待効果・機能概要・段階的導入の推奨 |
| [セキュリティ概要](decision-maker/security-overview.md) | 多層防御・2 鍵防御・監視・役割・FAQ・用語集 |
| [設計原則](decision-maker/design-principles.md) | 組織にとっての意味と学術的参考文献 |
| [コストとリソース](decision-maker/cost-and-resources.md) | AWS 利用の概要・コスト要因・概算・運用負荷・推奨事項 |
| [ガバナンス](decision-maker/governance.md) | アクセス制御・利用範囲・レビュー・コンプライアンス・PII・更新方針 |

---

## ユーザー向け（User）

ボットの使い方、利用上の注意、よくある質問は次の文書を参照してください。

| 文書 | 説明 |
|------|------|
| [ユーザーガイド](user/user-guide.md) | メンションの仕方、応答の流れ、対応機能、効果的な質問のコツ |
| [利用ポリシー](user/usage-policy.md) | 許可・禁止、ファイルルール、レート制限、不正利用の報告 |
| [よくある質問（FAQ）](user/faq.md) | 応答しない／遅い／ファイル共有／データの安全／利用範囲 など |

---

## ドキュメント運営（Governance）

- **[Documentation Standards](DOCUMENTATION_STANDARDS.md)** — ドキュメントのベストプラクティス（構成・文体・CHANGELOG・モジュール README・品質チェックリスト）。ドキュメントの追加・更新時はここに従ってください。
- **[読者別ドキュメントマップ](audience-document-map.md)** — 開発者・意思決定者・ユーザー向けにどの文書を用意するかの一覧とフォルダ方針。

**更新の目安**: 機能追加・修正・セットアップ変更時に、README / CHANGELOG / 該当ドキュメントを同時に更新してください。
