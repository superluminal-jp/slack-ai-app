# Slack Bedrock MVP

Amazon Bedrock と統合して AI 生成レスポンスを提供する最小限の Slack ボット。この MVP は、Slack と AWS Bedrock 間の基本的な接続性を示し、本番レベルの機能よりも機能性を優先しています。

## 目次

- [概要](#概要)
- [アーキテクチャ](#アーキテクチャ)
- [主な機能](#主な機能)
- [クイックスタート](#クイックスタート)
- [プロジェクト構造](#プロジェクト構造)
- [環境変数](#環境変数)
- [ドキュメント](#ドキュメント)
  - [ビジネス価値と導入](#-ビジネス価値と導入)
- [開発ガイドライン](#開発ガイドライン)
- [開発](#開発)
- [既知の制限事項](#既知の制限事項-mvpスコープ)
- [トラブルシューティング](#トラブルシューティング)
- [コントリビューション](#コントリビューション)
- [ライセンス](#ライセンス)
- [サポート](#サポート)

## 概要

このプロジェクトは、以下の機能を実装するサーバーレス Slack ボットです：

- Slack ユーザーからのメッセージを受信（ダイレクトメッセージとチャンネルメンション）
- Amazon Bedrock AI モデルを使用してメッセージを処理
- AI 生成レスポンスを Slack ユーザーに返信
- エラーを適切に処理し、ユーザーフレンドリーなメッセージを表示

**主な価値提案**：

- **ワークフローへの自然な統合**: 既に使用している Slack 上で AI アプリケーションを利用でき、新しいツールを学ぶ必要がありません
- **最小限の操作**: AI アプリケーションへのワンクリックアクセス（3 ステップから 1 ステップに削減：「Web アプリを開く → アプリを選択 → データを入力」 → 直接 Slack メンション）
- **組織的な知識共有**: チームメンバー間での効果的な使用方法の蓄積と共有により、組織的価値が向上します

**アーキテクチャ**: Slack の 3 秒タイムアウト要件を満たすため、非同期処理を備えたデュアル Lambda 関数。このアーキテクチャは、検証、実行、AI 保護レイヤーを含む**多層セキュリティアプローチ**に従います。

**設計原則 - 理論的基盤**：

この設計は、AI アプリケーションの採用を促進するために複数の学術理論を活用しています：

- **ナッジ理論** (Thaler & Sunstein, 2008): 既存ツール（Slack）を活用し、アクションステップを最小化（3 → 1）、即座のフィードバックを提供することで摩擦を削減。ステップを 1 つ減らすことで完了率が 10-20%向上することが研究で示されています（Baymard Institute, 2020）。
- **ネットワーク効果** (メトカーフの法則, 1993): チームメンバー間の知識共有により、正のフィードバックループが生まれます。ネットワーク価値はユーザー数の二乗に比例してスケールし、転換点に達した後に採用が加速します。
- **認知的負荷理論** (Sweller, 1988): 慣れ親しんだインターフェース（Slack）を使用することで、新しいインターフェースと比較して認知的負荷を 40%削減（Nielsen, 1994）。
- **技術受容モデル** (Davis, 1989): 既存ツール統合と即座のフィードバックにより、知覚的有用性と使いやすさが最適化されます。
- **社会的証明** (Cialdini, 1984): 他のメンバーの使用を受動的に発見することで、自然な社会的証明が提供され、採用率が 30-50%向上します。
- **習慣形成理論** (Lally et al., 2010): AI アプリの使用を既存の Slack 習慣に統合することで、習慣形成時間が 30-40%短縮されます。
- **情報探索理論** (Pirolli & Card, 1999): 検索コストを削減することで、探索行動が 20-30%増加します。
- **イノベーション普及理論** (Rogers, 1962): 相対的優位性、互換性、観察可能性により、組織全体でのイノベーション普及が加速します。

詳細な理論的基盤については、[docs/README.md - 設計原則](docs/README.md#設計原則-行動心理学とネットワーク理論に基づく設計)（日本語）を参照してください。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ Slack Workspace                                             │
│ User triggers: /ask "question" or @bot mentions             │
│ + attachments (images, documents)                            │
└────────────────────┬────────────────────────────────────────┘
                     │ [1] HTTPS POST (sync)
                     │ X-Slack-Signature (HMAC SHA256)
                     │ + response_url (Webhook URL)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Verification Layer: Slack Event Handler (Lambda Function URL)│
│ - HMAC SHA256 signature verification (Key 1)                 │
│ - Slack API Existence Check (Key 2 - Two-Key Defense)       │
│ - Event deduplication (DynamoDB)                            │
│ - Attachment metadata extraction                             │
│ - [2] → Immediate "Processing..." response (<3 seconds)     │
│ - [3] → Invoke Execution API (API Gateway, IAM auth)        │
└────────────────────┬────────────────────────────────────────┘
                     │ [3] API Gateway POST /execute
                     │ IAM authentication
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Execution Layer: Execution API (API Gateway)                 │
│ - IAM authentication (internal API protection)                │
│ - Lambda proxy integration                                   │
└────────────────────┬────────────────────────────────────────┘
                     │ [4] Lambda invocation
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Execution Layer: Bedrock Processor (Lambda)                  │
│ - AWS Bedrock Converse API invocation                        │
│ - Thread history retrieval (conversations.replies)           │
│ - Attachment processing (images, documents)                  │
│ - Error handling and retry logic                            │
│ - [5] → POST response to Slack (thread reply)                │
└────────────────────┬────────────────────────────────────────┘
                     │ [5] HTTPS POST to Slack API
                     │ (chat.postMessage with thread_ts)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Slack Workspace                                             │
│ [6] Display AI response in thread                            │
└─────────────────────────────────────────────────────────────┘
```

### コンポーネント

- **Slack Event Handler** (`lambda/slack-event-handler/`): Slack イベントを受信し、署名を検証し、Execution API を呼び出します

  - HMAC SHA256 署名検証（二鍵防御の第 1 鍵）
  - **Slack API Existence Check**（二鍵防御の第 2 鍵）- team_id、user_id、channel_id が Slack に存在することを確認
  - Existence Check 結果の**DynamoDB キャッシュ**（5 分 TTL）
  - DynamoDB を使用したイベント重複排除
  - 添付ファイルメタデータ抽出
  - 即座の応答（3 秒以内）
  - トークンストレージと取得
  - IAM 認証を使用して Execution API（API Gateway）を呼び出し

- **Execution API** (`cdk/lib/constructs/execution-api.ts`): 安全な Lambda 呼び出しのための内部 API Gateway

  - IAM 認証を備えた API Gateway REST API
  - リソースポリシーは検証レイヤー Lambda ロールのみにアクセスを制限
  - Bedrock Processor への Lambda プロキシ統合

- **Bedrock Processor** (`lambda/bedrock-processor/`): Bedrock Converse API を呼び出し、レスポンスを Slack に投稿します

  - AWS Bedrock Converse API 統合（統一インターフェース、マルチモーダルサポート）
  - マルチモデルサポート（Claude、Nova）
  - **スレッド履歴取得**: Slack スレッドから会話履歴を取得
  - **スレッド返信**: スレッド内にレスポンスを投稿（新しいチャンネルメッセージとしてではなく）
  - エラーハンドリングとユーザーフレンドリーなメッセージ
  - Slack API 経由でのレスポンス投稿（chat.postMessage）
  - **添付ファイル処理**: Slack から画像とドキュメントをダウンロードして処理
  - **画像分析**: 画像コンテンツ分析のためのビジョンモデルサポート（PNG、JPEG、GIF、WebP）
  - **ドキュメント抽出**: PDF、DOCX、CSV、XLSX、PPTX、TXT ファイルからテキストを抽出
  - **PPTX 変換**: LibreOffice を使用して PowerPoint スライドを画像に変換（オプション）
  - **複数添付ファイル**: 単一メッセージ内の複数の添付ファイルを処理

- **インフラストラクチャ** (`cdk/`): Lambda 関数、DynamoDB テーブル、IAM ロールをプロビジョニングするための AWS CDK（TypeScript）
  - Slack Event Handler 用の Lambda Function URL（パブリックアクセス）
  - 実行レイヤー用の API Gateway REST API（IAM 認証）
  - イベント重複排除、トークン、Existence Check キャッシュ用の DynamoDB テーブル
  - 最小権限の IAM ロール（CloudWatch メトリクス権限を含む）
  - AWS Secrets Manager 統合
  - Existence Check 失敗用の CloudWatch アラーム

完全なアーキテクチャの詳細については、[docs/architecture/overview.md](docs/architecture/overview.md)を参照してください。

## 主な機能

- ✅ Slack リクエストの HMAC SHA256 署名検証
- ✅ **二鍵防御セキュリティモデル** - Existence Check が Slack API 経由でエンティティを検証（Signing Secret + Bot Token）
- ✅ 重複処理を防ぐイベント重複排除
- ✅ 非同期処理パターン（Slack Event Handler は 3 秒以内に応答）
- ✅ CloudWatch 用の構造化 JSON ロギング
- ✅ ユーザーフレンドリーなメッセージによるエラーハンドリング
- ✅ ワークスペースインストール用の DynamoDB トークンストレージ
- ✅ **Existence Check 用の DynamoDB キャッシュ** - Slack API 呼び出しを最小化する 5 分 TTL キャッシュ
- ✅ マルチモデルサポート（Claude および Nova モデル）
- ✅ **スレッド返信サポート** - ボットレスポンスはスレッド内に投稿されます（新しいチャンネルメッセージとしてではなく）
- ✅ **スレッド履歴取得** - コンテキスト対応レスポンスのために Slack スレッドから会話履歴を取得
- ✅ **画像添付ファイル処理** - AWS Bedrock Converse API のビジョン機能を使用して画像を分析（PNG、JPEG、GIF、WebP）
- ✅ **ドキュメント添付ファイル処理** - PDF、DOCX、CSV、XLSX、PPTX、TXT ファイルからテキストを抽出
- ✅ **PPTX スライドから画像への変換** - 視覚分析のために PowerPoint スライドを画像に変換（オプション、LibreOffice Layer が必要）
- ✅ **複数添付ファイルサポート** - 単一メッセージ内の複数の添付ファイルを処理
- ✅ **Bedrock Converse API** - マルチモーダル入力（テキスト + 画像）の統一インターフェース

## クイックスタート

詳細なデプロイ手順については、[quickstart.md](specs/001-slack-bedrock-mvp/quickstart.md)を参照してください。

### 前提条件

- Bedrock アクセスが有効な AWS アカウント
- Node.js 18+および AWS CDK CLI
- Python 3.11+
- 管理者権限を持つ Slack ワークスペース
- **必要な OAuth スコープを持つ Slack App**：
  - `team:read`、`users:read`、`channels:read`（Existence Check 用）
  - `files:read`（添付ファイル処理用）
  - `chat:write`（レスポンス投稿用）
  - `channels:history`、`groups:history`、`im:history`（スレッド履歴取得用）

### クイックデプロイ

```bash
# 1. 環境変数を設定（初回デプロイ時のみ）
export SLACK_SIGNING_SECRET=your-signing-secret
export SLACK_BOT_TOKEN=your-bot-token
# または.envファイルを使用 - 詳細はquickstart.mdを参照

# 2. 依存関係をインストール
cd cdk && npm install
cd ../lambda/slack-event-handler && pip install --upgrade pip && pip install -r requirements.txt -t .
cd ../bedrock-processor && pip install --upgrade pip && pip install -r requirements.txt -t .

# 3. インフラストラクチャをデプロイ
cd ../../cdk
cdk deploy

# 4. Slack Appを設定
# - https://api.slack.com/apps でSlack Appを作成
# - Event Subscriptions URLをLambda Function URLに設定
# - message.imとapp_mentionsイベントを購読
# - ワークスペースにアプリをインストール
```

## プロジェクト構造

```
slack-ai-app/
├── cdk/                          # AWS CDKインフラストラクチャ（TypeScript）
│   ├── lib/
│   │   ├── slack-bedrock-stack.ts
│   │   └── constructs/          # CDKコンストラクト
│   └── bin/
│       └── cdk.ts
├── lambda/
│   ├── slack-event-handler/      # Slack Event Handler Lambda（検証レイヤー）
│   │   ├── handler.py
│   │   ├── slack_verifier.py
│   │   ├── existence_check.py    # Existence Checkモジュール（二鍵防御）
│   │   ├── token_storage.py
│   │   ├── attachment_extractor.py
│   │   ├── api_gateway_client.py
│   │   └── requirements.txt
│   └── bedrock-processor/        # Bedrock Processor Lambda（実行レイヤー）
│       ├── handler.py
│       ├── bedrock_client_converse.py  # Bedrock Converse APIクライアント
│       ├── thread_history.py     # スレッド履歴取得
│       ├── attachment_processor.py
│       ├── document_extractor.py
│       ├── file_downloader.py
│       ├── slack_poster.py
│       └── requirements.txt
├── docs/                         # 包括的なアーキテクチャドキュメント
│   ├── README.md                 # ドキュメントエントリーポイント
│   ├── requirements/             # ビジネスおよび機能要件
│   ├── architecture/             # システムアーキテクチャと設計
│   ├── security/                 # セキュリティ要件と実装
│   ├── implementation/           # 実装ロードマップ
│   ├── operations/               # テスト、監視、インシデント対応
│   ├── adr/                      # アーキテクチャ決定記録
│   ├── appendix.md               # 用語集と参照
│   └── slack-app-manifest.yaml   # Slack Appマニフェストテンプレート
├── specs/001-slack-bedrock-mvp/  # 機能仕様とドキュメント
│   ├── spec.md                   # 機能仕様
│   ├── plan.md                   # 実装計画
│   ├── quickstart.md             # デプロイガイド
│   └── tasks.md                  # タスク分解
└── CLAUDE.md                     # 開発ガイドラインとポリシー
```

## 環境変数

### 初回デプロイ

**初回デプロイ時のみ**、CDK が AWS Secrets Manager にシークレットを作成できるように、以下の環境変数を設定する必要があります：

- `SLACK_SIGNING_SECRET`: Slack アプリの署名シークレット（Slack App 設定から）
- `SLACK_BOT_TOKEN`: Slack ボット OAuth トークン（Slack App インストールから）

初回デプロイ後、これらの環境変数は不要になります。シークレットは AWS Secrets Manager に安全に保存され、Lambda 関数によって自動的に使用されます。

### その他の設定

- `AWS_REGION_NAME`: AWS リージョン（例：`ap-northeast-1`）- `cdk.json`で設定
- `BEDROCK_MODEL_ID`: Bedrock モデル ID（例：`amazon.nova-pro-v1:0`）- `cdk.json`で設定
- `EXISTENCE_CHECK_CACHE_TABLE`: Existence Check キャッシュ用の DynamoDB テーブル名（CDK によって自動設定）
- `EXECUTION_API_URL`: Execution API Gateway URL（CDK によって自動設定）

### シークレット管理

シークレットは**AWS Secrets Manager**を使用して管理されます：

- シークレットは CDK デプロイ中に自動的に作成されます
- シークレットは AWS 管理キーを使用して保存時に暗号化されます
- Lambda 関数にはシークレットへの読み取り専用アクセスが付与されます
- シークレットは Lambda 関数の環境変数として自動的に注入されます
- デプロイ後にシークレットを更新するには、AWS CLI または AWS コンソールを使用してください（詳細は[quickstart.md](specs/001-slack-bedrock-mvp/quickstart.md)を参照）

## ドキュメント

### 📚 包括的なアーキテクチャドキュメント

**ここから始める**: [docs/README.md](docs/README.md) - 完全なアーキテクチャドキュメントエントリーポイント

#### ドキュメント構造

プロジェクトには、トピック別に整理された包括的なアーキテクチャドキュメントが含まれています：

- **[要件](docs/requirements/functional-requirements.md)**: ビジネスおよび機能要件
- **[アーキテクチャ](docs/architecture/)**:
  - [概要](docs/architecture/overview.md) - システムアーキテクチャとコンポーネント
  - [ユーザーエクスペリエンス](docs/architecture/user-experience.md) - ユーザーフローと UX 設計
  - [実装詳細](docs/architecture/implementation-details.md) - 技術実装
- **[セキュリティ](docs/security/)**:
  - [要件](docs/security/requirements.md) - セキュリティ要件（SR-01 から SR-06）
  - [脅威モデル](docs/security/threat-model.md) - 脅威分析とリスク評価
  - [実装](docs/security/implementation.md) - セキュリティ実装コード
- **[運用](docs/operations/)**:
  - [Slack セットアップガイド](docs/operations/slack-setup.md) - Slack App 作成と設定ガイド
  - [テスト](docs/operations/testing.md) - テストシナリオ、BDD、検証
  - [監視](docs/operations/monitoring.md) - 監視、アラート、インシデント対応
- **[実装ロードマップ](docs/implementation/roadmap.md)**: 段階的実装計画
- **[ADR（アーキテクチャ決定記録）](docs/adr/)**: 文書化されたアーキテクチャ決定
- **[付録](docs/appendix.md)**: 用語集と参照

### 🚀 クイックスタートドキュメント

- **[クイックスタートガイド](specs/001-slack-bedrock-mvp/quickstart.md)**: ステップバイステップのデプロイ手順
- **[仕様](specs/001-slack-bedrock-mvp/spec.md)**: 機能要件とユーザーストーリー
- **[実装計画](specs/001-slack-bedrock-mvp/plan.md)**: 技術アーキテクチャと設計決定
- **[タスク](specs/001-slack-bedrock-mvp/tasks.md)**: 開発タスク分解
- **[Slack App マニフェスト](docs/slack-app-manifest.yaml)**: Slack アプリ作成用テンプレート

### 📋 ビジネス価値と導入

**期待される効果**：

- **使用頻度と組織的浸透の向上**: アクセス手順の簡素化と既存ツールへの統合により、AI アプリケーションの使用頻度が大幅に向上し、組織全体への浸透が促進されます
- **作業品質の向上**: AI による提案と分析、人的エラーの削減、作業効率の向上により、作業品質が向上します
- **組織的知識の蓄積**: 効果的な使用方法の共有により、組織全体でのスキル向上が促進されます
- **イノベーション促進**: アクセスしやすい環境により、新しい使用方法の発見が容易になります

**段階的導入**：

1. **フェーズ 1: 限定導入**: 特定の部門またはプロジェクトチャンネルでのみ導入
2. **フェーズ 2: 組織全体への展開**: すべてのチームメンバーが利用できる専用チャンネルを設定
3. **フェーズ 3: 完全なビジネス統合**: 問い合わせチャンネルでの初期応答に使用

ビジネス価値、導入戦略、KPI、リスク軽減の詳細については、[docs/README.md](docs/README.md)（日本語）を参照してください。

## 開発ガイドライン

**⚠️ 重要**: すべての開発者と AI エージェントは、[CLAUDE.md](CLAUDE.md)のガイドラインに従う必要があります

### 主要なポリシー

1. **ドキュメントメンテナンスポリシー**:

   - 変更を行う前に、常に`README.md`と関連する`docs/`セクションを読む
   - コードが変更されたら、常にドキュメントを更新する
   - アーキテクチャ決定に対して ADR を作成する

2. **Claude エージェントとスキル使用ポリシー**:
   - 各タスクタイプに適切な専門エージェントを使用する
   - 実装には coding-agent
   - マージ前には code-review-agent
   - ADR とドキュメントには code-documentation-agent
   - 複雑な決定には thinking-agent

完全なガイドライン、ワークフロー、必須要件については、[CLAUDE.md](CLAUDE.md)を参照してください。

## 既知の制限事項（MVP スコープ）

この MVP は、本番レベルの機能よりも基本的な機能性を優先しています。以下は、この MVP のスコープから**明示的に除外**されています：

### 機能性

- ✅ 履歴取得を伴うスレッドベースの会話
- ✅ スレッド内でのコンテキスト保持
- ❌ スレッド間でのコンテキスト保持
- ❌ 高度なプロンプトエンジニアリングまたはカスタムプロンプトテンプレート
- ❌ ユーザーまたはワークスペースごとのレート制限
- ✅ ファイル/画像処理（画像とドキュメントがサポートされています）
- ❌ カスタムスラッシュコマンド
- ❌ インタラクティブな Slack コンポーネント（ボタン、モーダルなど）

### セキュリティとコンプライアンス

- ❌ 包括的な監視とアラート（基本的な CloudWatch のみ）
- ❌ 指数バックオフを備えた本番レベルのエラーハンドリング
- ❌ コンプライアンス認証（SOC2、GDPR、HIPAA）
- ❌ 高度な認可チェック（ホワイトリストユーザー/チャンネル）
- ❌ Bedrock Guardrails 統合（MVP 後まで延期）

### インフラストラクチャ

- ❌ マルチリージョンデプロイ
- ❌ 高可用性と災害復旧
- ❌ CI/CD パイプライン自動化
- ❌ 包括的なユニットテストと統合テスト（手動テストのみ）
- ❌ コスト最適化と詳細なリソース制限

### テスト

- ❌ BDD テストシナリオ（quickstart.md に従った手動テスト）
- ❌ LocalStack を使用した統合テスト
- ❌ 負荷テスト

**注意**: これらの制限事項は、[spec.md](specs/001-slack-bedrock-mvp/spec.md)の「スコープ外」に記載されています。すべての延期された機能は、本番デプロイ前に実装する必要があります。

## 開発

### テストの実行

```bash
# 署名検証テスト
cd lambda/slack-event-handler
pytest tests/

# エラーハンドリングテスト
cd ../bedrock-processor
pytest tests/
```

### ログの表示

```bash
# Slack Event Handlerログ
aws logs tail /aws/lambda/slack-event-handler --follow --region ap-northeast-1

# Bedrock Processorログ
aws logs tail /aws/lambda/bedrock-processor --follow --region ap-northeast-1
```

### ローカル開発

Lambda 関数は、AWS SAM を使用するか、直接呼び出すことでローカルでテストできます：

```bash
# Slack Event Handlerをテスト
python lambda/slack-event-handler/handler.py

# Bedrock Processorをテスト
python lambda/bedrock-processor/handler.py
```

## トラブルシューティング

一般的な問題と解決策については、[quickstart.md](specs/001-slack-bedrock-mvp/quickstart.md#troubleshooting)を参照してください。

### 一般的な問題

- **Slack 検証が失敗する**: Lambda Function URL を確認し、AWS Secrets Manager のシークレット値を検証してください
- **Existence Check が失敗する**:
  - Bot Token に必要な OAuth スコープがあることを確認: `team:read`、`users:read`、`channels:read`
  - CloudWatch ログで"missing_scope"エラーを確認
  - Bot Token が DynamoDB または環境変数で利用可能であることを確認
- **CloudWatch メトリクスが出力されない**: Lambda IAM ロールに`cloudwatch:PutMetricData`権限があることを確認（CDK によって自動的に付与されます）
- **ボットが応答しない**: Event Subscriptions が有効で、ボットがインストールされていることを確認してください
- **Bedrock エラー**: IAM 権限と AWS コンソールでのモデルアクセスを確認してください
- **シークレットアクセスエラー**: Lambda 関数にシークレットを読み取る権限があることを確認（CDK によって自動的に付与されるはずです）

## コントリビューション

コントリビューションを歓迎します！以下のガイドラインに従ってください：

1. **ドキュメントを読む**: 開発ガイドラインについては[CLAUDE.md](CLAUDE.md)を確認してください
2. **ポリシーに従う**: ドキュメントメンテナンスと Claude エージェント使用ポリシーに準拠してください
3. **適切なエージェントを使用する**: 異なるタスクタイプに専門エージェントを使用してください
4. **ドキュメントを更新する**: 変更を行う際は、常に`README.md`と`docs/`を更新してください
5. **ADR を作成する**: アーキテクチャ決定を`docs/adr/`に文書化してください
6. **テストを書く**: 新機能にテストを含めてください
7. **コードスタイルに従う**: Python（PEP 8）、TypeScript（標準規約）

### プルリクエストプロセス

1. リポジトリをフォーク
2. 機能ブランチを作成
3. 開発ガイドラインに従って変更を行う
4. ドキュメントを更新
5. テストを実行し、合格することを確認
6. 明確な説明付きでプルリクエストを提出
7. code-review-agent を使用してコードレビューを依頼

## ライセンス

[ここにライセンス情報を追加]

## サポート

問題や質問がある場合：

1. **まずドキュメントを確認**:

   - [docs/README.md](docs/README.md) - 包括的なアーキテクチャドキュメント
   - [トラブルシューティングガイド](specs/001-slack-bedrock-mvp/quickstart.md#troubleshooting)
   - [CLAUDE.md](CLAUDE.md) - 開発ガイドライン

2. **ログを確認**:

   - 詳細なエラー情報については CloudWatch Logs を確認
   - デバッグのために構造化 JSON ログを確認

3. **外部リソース**:

   - [Slack API ドキュメント](https://api.slack.com/docs)
   - [AWS Bedrock ドキュメント](https://docs.aws.amazon.com/bedrock/)
   - [AWS CDK ドキュメント](https://docs.aws.amazon.com/cdk/)

4. **ヘルプを取得**:
   - 以下の情報を含む GitHub issue を作成：
     - 問題の明確な説明
     - 関連するログとエラーメッセージ
     - 再現手順
     - 環境詳細（リージョン、モデルなど）

---

**ドキュメントステータス**: ✅ `docs/`の包括的なアーキテクチャドキュメントと最新の状態
**最終更新**: 2025-12-30（現在の実装を反映するように更新：Converse API、Execution API、スレッド機能、添付ファイル処理）
