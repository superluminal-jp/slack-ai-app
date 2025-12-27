# Slack Bedrock MVP

> **English version**: [README.md](README.md)

Amazon Bedrock と統合して AI 生成レスポンスを提供するサーバーレス Slack ボット。多層セキュリティ、スレッドサポート、添付ファイル処理機能を備えています。

## クイックスタート

> **📖 詳細ガイド**: [docs/quickstart.md](docs/quickstart.md)

### 前提条件

- Bedrock アクセスが有効な AWS アカウント
- Node.js 18+ および Python 3.11+
- Slack ワークスペース管理者権限

### デプロイ

```bash
# 1. 認証情報を設定（初回デプロイのみ）
export SLACK_SIGNING_SECRET=your-signing-secret
export SLACK_BOT_TOKEN=xoxb-your-bot-token

# 2. 依存関係をインストール
cd cdk && npm install
cd ../lambda/slack-event-handler && pip install -r requirements.txt -t .
cd ../bedrock-processor && pip install -r requirements.txt -t .

# 3. デプロイ
cd ../../cdk && cdk deploy
```

**⚠️ 重要**: デプロイ後にホワイトリストを設定してください。[クイックスタートガイド](docs/quickstart.md)を参照。

## 概要

**主な価値提案**:

- **ワークフローへの自然な統合**: 新しいツールを学ぶ必要なく、Slack 上で AI を利用
- **最小限の操作**: ワンクリックアクセス（`@bot 質問` とメンション）
- **知識共有**: チームメンバー間で効果的な使用パターンを共有

**設計原則**: ナッジ理論とネットワーク効果を活用。[設計原則](docs/explanation/design-principles.md)を参照。

## アーキテクチャ

```
Slack → Lambda① (検証) → API Gateway → Lambda② (Bedrock) → Slack
          ↓                                 ↓
    Two-Key Defense                    Converse API
    (署名 + Existence Check)           スレッド履歴
```

**コンポーネント**:

| コンポーネント          | 説明                                        |
| ----------------------- | ------------------------------------------- |
| **Slack Event Handler** | 署名検証、Existence Check、イベント重複排除 |
| **Execution API**       | IAM 認証された内部 API                      |
| **Bedrock Processor**   | Converse API、スレッド履歴、添付ファイル    |

詳細は[アーキテクチャ概要](docs/reference/architecture/overview.md)を参照。

## 主な機能

### 🔒 セキュリティ

- Two-Key Defense (HMAC SHA256 + Slack API Existence Check)
- ホワイトリスト認可 (team_id, user_id, channel_id)
- PII マスキング、プロンプトインジェクション検出

### ⚡ 処理

- 非同期処理（3 秒以内に応答）
- イベント重複排除
- 構造化 JSON ログ

### 🤖 AI と統合

- マルチモデルサポート (Claude, Nova)
- スレッド返信と履歴コンテキスト
- 添付ファイル処理（画像、ドキュメント）

### 🏗️ インフラストラクチャ

- AWS CDK (TypeScript)
- DynamoDB (トークン、キャッシュ、重複排除)
- AWS Secrets Manager

## ドキュメント

| 対象者                 | パス                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **はじめに**           | [クイックスタート](docs/quickstart.md)                                                                                        |
| **開発者**             | [アーキテクチャ](docs/reference/architecture/overview.md) → [実装詳細](docs/reference/architecture/implementation-details.md) |
| **セキュリティチーム** | [セキュリティ要件](docs/reference/security/requirements.md) → [脅威モデル](docs/reference/security/threat-model.md)           |
| **運用**               | [Slack 設定](docs/reference/operations/slack-setup.md) → [モニタリング](docs/reference/operations/monitoring.md)              |
| **意思決定者**         | [非技術者向け概要](docs/presentation/non-technical-overview.md)                                                               |

**全ドキュメント**: [docs/README.md](docs/README.md)

## プロジェクト構造

```
slack-ai-app/
├── cdk/                    # AWS CDK インフラストラクチャ
├── lambda/
│   ├── slack-event-handler/  # 検証レイヤー
│   └── bedrock-processor/    # 実行レイヤー
├── docs/                   # ドキュメント
│   ├── reference/          # アーキテクチャ、セキュリティ、運用
│   ├── explanation/        # 設計原則、ADR
│   ├── tutorials/          # 入門ガイド
│   └── how-to/             # トラブルシューティング
└── specs/                  # 機能仕様
```

## 開発

```bash
# テスト実行
cd lambda/slack-event-handler && pytest tests/
cd ../bedrock-processor && pytest tests/

# ログ確認
aws logs tail /aws/lambda/slack-event-handler --follow
aws logs tail /aws/lambda/bedrock-processor --follow
```

開発ガイドラインは [CLAUDE.md](CLAUDE.md) を参照。

## 環境変数

| 変数                   | 説明                                             |
| ---------------------- | ------------------------------------------------ |
| `SLACK_SIGNING_SECRET` | Slack アプリ署名シークレット（初回デプロイのみ） |
| `SLACK_BOT_TOKEN`      | Slack ボット OAuth トークン（初回デプロイのみ）  |
| `BEDROCK_MODEL_ID`     | Bedrock モデル（cdk.json で設定）                |

シークレットは初回デプロイ後、AWS Secrets Manager に保存されます。

## トラブルシューティング

[トラブルシューティングガイド](docs/how-to/troubleshooting.md)を参照。

**よくある問題**:

| 問題                 | 解決策                                           |
| -------------------- | ------------------------------------------------ |
| 署名検証失敗         | Lambda Function URL と Secrets Manager を確認    |
| Existence Check 失敗 | Bot Token の OAuth スコープを確認                |
| ボットが応答しない   | Event Subscriptions とボットのインストールを確認 |

## コントリビューション

ガイドラインは [CONTRIBUTING.md](CONTRIBUTING.md) を参照。

1. [CLAUDE.md](CLAUDE.md) で開発ポリシーを確認
2. 機能ブランチを作成
3. コード変更とともにドキュメントを更新
4. プルリクエストを提出

## ライセンス

[ライセンス情報をここに追加]

## サポート

1. [ドキュメント](docs/README.md)を確認
2. [トラブルシューティングガイド](docs/how-to/troubleshooting.md)を確認
3. ログと再現手順を含めて GitHub Issue を作成

---

**最終更新日**: 2025-12-27
