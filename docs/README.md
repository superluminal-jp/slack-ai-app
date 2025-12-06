# Slack to AWS Bedrock AI 統合アーキテクチャ

> 🔒 **セキュリティファースト設計**
> 本ドキュメントは、多層防御による認証・認可を最優先事項として設計されたアーキテクチャを記述しています。

**ドキュメントタイプ**: システムアーキテクチャ & 実装ガイド
**ステータス**: 推奨
**バージョン**: 2.4
**最終更新日**: 2025-12-06
**対象読者**: AI エンジニア、クラウドアーキテクト、DevOps チーム、プロダクトマネージャー

## エグゼクティブサマリー

### 主目的

本ドキュメントは、**Slack ワークスペースから AWS Bedrock を利用して AI 機能を提供する**ためのアーキテクチャと実装ガイドです。Slack ユーザーが Slack 上で AI 機能を利用し、リクエストに対して適切なレスポンスを得られることを目的とします。会話、画像生成、コード生成、データ分析など多様な AI 機能に対応可能です。

### 状況（Situation）

Slack ワークスペース上で AI 機能を提供し、Slack ユーザーの生産性向上を図る必要があります。AWS Bedrock は多様な Foundation Model を提供しますが、Slack の 3 秒タイムアウト制約やセキュリティ要件を満たしながら統合する必要があります。

### 課題（Complication）

実装にあたり以下の技術的課題があります：

- **タイムアウト制約**: Bedrock の 5〜30 秒の処理時間が Slack の 3 秒タイムアウトを超過
- **セキュリティ要件**: 認証情報保護、プロンプトインジェクション防止、PII 保護が必要
- **コスト管理**: モデル乱用によるコスト増大を防止
- **ユーザー体験**: 即座のフィードバックと非ブロッキング処理が必要

### 提案（Solution）

本ドキュメントは、**2 層 Lambda + Bedrock Guardrails + 非同期 response_url**アーキテクチャを定義します：

**機能実現の核心**:

1. **非同期処理**: SlackEventHandler が即座に応答し、BedrockProcessor がバックグラウンドで Bedrock を呼び出して Slack API に投稿
2. **スレッド返信機能**: ボットの応答はスレッド内に投稿され、会話の整理とコンテキスト保持が可能
3. **スレッド履歴管理**: Slack API の `conversations.replies` を使用してスレッド内の会話履歴を取得し、Bedrock に渡すことで文脈を理解した応答を実現
4. **コンテキスト履歴管理**: DynamoDB でユーザー単位の処理コンテキストを保持（会話、画像生成、コード生成など）
5. **AI モデル**: AWS Bedrock の Foundation Model で高品質な出力を提供（モデル選択は要件に応じて決定）
6. **セキュリティ保護**: 多層防御、Guardrails、PII 検出により安全に運用

**実装成果**:

- **ユーザー体験**: 2 秒以内の初期応答、5〜30 秒で最終レスポンス
- **機能性**: コンテキスト履歴を保持した連続的な処理が可能（会話、画像生成、コード生成など）
- **セキュリティ**: プロンプトインジェクション検出率 ≥95%、PII 自動マスキング
- **コスト管理**: トークン制限でユーザー単位$10/月以下

**適用範囲**: 本アーキテクチャは Slack-to-Bedrock に特化していますが、Microsoft Teams、Google Chat など他のチャットプラットフォームにも応用可能です。

### セキュリティファースト設計 (Security-First Design)

本アーキテクチャは、AI システムの特性を考慮した**多層防御による認証・認可**を最優先事項として設計されています：

**多層認証アーキテクチャ（6 層防御）**:

1. **Slack レイヤー**: SSO + MFA による組織レベル認証
2. **API Gateway**: WAF レート制限による DoS 防止
3. **SlackEventHandler (検証層)**:
   - HMAC SHA256 署名検証（Slack Signing Secret）
   - Slack API 動的実在性確認（Bot Token） ← **2 鍵防御モデル**
   - ホワイトリスト認可（team_id, user_id, channel_id）
4. **ExecutionApi**: IAM 認証による内部 API 保護
5. **BedrockProcessor (プロセッサ)**: Bedrock Guardrails, PII 検出
6. **Bedrock**: Automated Reasoning によるプロンプトインジェクション検出

**認証・認可の特徴**:

- **2 鍵防御**: Signing Secret と Bot Token の両方が必要（いずれか漏洩時も攻撃面を縮小）
- **動的検証**: Slack API による実在性確認（偽造リクエスト検出率 ≥95%）
- **fail-closed 原則**: 認証失敗時は即座にリクエスト拒否
- **キャッシュ戦略**: 検証済みエンティティを 5 分間キャッシュ（パフォーマンスとセキュリティのバランス）

**防げる攻撃（脅威対応マトリクス）**:

| 攻撃タイプ                                        | 防御レイヤー                          | 防御効果                                  |
| ------------------------------------------------- | ------------------------------------- | ----------------------------------------- |
| **署名シークレット漏洩** (T-01)                   | 2 鍵防御 (Signing Secret + Bot Token) | ✅ Existence Check で偽造リクエストを検出 |
| **Bot Token 漏洩** (T-01)                         | HMAC SHA256 署名検証                  | ✅ 署名検証失敗で即座にブロック           |
| **削除されたユーザー/チャンネルからのリクエスト** | Slack API 動的実在性確認              | ✅ 実在しないエンティティを即座に検出     |
| **プロンプトインジェクション** (T-09)             | Bedrock Guardrails (L5-6)             | ✅ 99%精度で検出・ブロック                |
| **PII 漏洩** (T-10)                               | PII 検出・自動マスキング (L5)         | ✅ 日本語対応、85%以上の精度              |
| **DDoS / レート乱用** (T-07)                      | WAF レート制限 (L2)                   | ✅ ユーザー単位スロットリング             |
| **リプレイアタック** (T-03)                       | タイムスタンプ検証 (L3)               | ✅ ±5 分以内の検証                        |
| **権限昇格** (T-08)                               | IAM 最小権限 + 認可 (L3-4)            | ✅ ホワイトリスト + ロール分離            |
| **モデル乱用（コスト）** (T-11)                   | トークン制限 (L5)                     | ✅ ユーザー単位クォータ                   |
| **コンテキスト情報漏洩** (T-12)                   | DynamoDB 暗号化 + アクセス制御        | ✅ コンテキスト ID 分離                   |

**セキュリティ成果指標**:

- 署名検証レイテンシ: ≤50ms (p99)
- Existence Check 精度: ≥95%
- プロンプトインジェクション検出率: ≥95%
- セキュリティインシデント: 0 件（目標）

---

## 📚 ドキュメント構成

### I. 機能要件と設計（Requirements & Design）

- [**機能要件**](./requirements/functional-requirements.md) - ビジネス要件と機能仕様
- [**アーキテクチャ概要**](./architecture/overview.md) - システム全体像と設計原則
- [**ユーザー体験**](./architecture/user-experience.md) - エンドユーザーフロー、パフォーマンス期待値
- [**アーキテクチャ詳細**](./architecture/implementation-details.md) - Lambda 構成、データフロー

### II. セキュリティ対策（Security）

- [**セキュリティ要件**](./security/requirements.md) - 機能的・非機能的要件
- [**脅威モデル**](./security/threat-model.md) - リスク分析とアクター
- [**セキュリティ実装**](./security/implementation.md) - 多層防御、認証・認可、AI 保護

### III. 実装（Implementation）

- [**実装ロードマップ**](./implementation/roadmap.md) - 優先順位付きステップ

### IV. 検証と運用（Verification & Operations）

- [**Slack 側設定作業ガイド**](./operations/slack-setup.md) - Slack App の作成と設定手順
- [**テストと検証**](./operations/testing.md) - BDD シナリオ、品質ゲート
- [**モニタリング & インシデントレスポンス**](./operations/monitoring.md) - CloudWatch、プレイブック

### V. アーキテクチャ決定記録（ADR）

- [**ADR インデックス**](./adr/README.md) - アーキテクチャ決定記録の一覧とテンプレート
  - [ADR-001: AWS Bedrock Foundation Model の採用](./adr/001-bedrock-foundation-model.md)
  - [ADR-002: 正規表現ベース PII 検出の採用](./adr/002-regex-pii-detection.md)
  - [ADR-003: response_url 非同期パターンの採用](./adr/003-response-url-async.md)
  - [ADR-004: Slack API Existence Check の採用](./adr/004-slack-api-existence-check.md)

### VI. 参考資料

- [**付録**](./appendix.md) - 用語集と参考資料

---

## 🚀 クイックナビゲーション

**初めての方**: [機能要件](./requirements/functional-requirements.md) → [アーキテクチャ概要](./architecture/overview.md) → [ユーザー体験](./architecture/user-experience.md)

**セキュリティ担当者**: [セキュリティ要件](./security/requirements.md) → [脅威モデル](./security/threat-model.md) → [セキュリティ実装](./security/implementation.md)

**実装担当者**: [アーキテクチャ詳細](./architecture/implementation-details.md) → [実装ロードマップ](./implementation/roadmap.md)

**運用担当者**: [Slack 側設定作業ガイド](./operations/slack-setup.md) → [テストと検証](./operations/testing.md) → [モニタリング](./operations/monitoring.md)

**意思決定者**: [ADR インデックス](./adr/README.md) で技術選択の理由を確認

---

## 📝 ドキュメントメタデータ

- **作成日**: 2025-12-01
- **最終更新日**: 2025-12-06
- **バージョン**: 2.4
- **管理**: このドキュメントは slack-ai-app プロジェクトの一部として管理されています
