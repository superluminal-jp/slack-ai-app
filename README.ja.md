# Slack AI App

> **English version**: [README.md](README.md)

Slack と Amazon Bedrock をセキュアに接続し、AI 生成レスポンスを提供するサーバーレス Slack ボット。エンタープライズレベルのセキュリティとパフォーマンスを実現します。

## このシステムの目的

このアプリケーションは、チームが Slack から直接 AI 機能を利用できるようにします。チームメンバーは質問をし、AI 生成の回答を受け取り、知識を共有できます。これらすべてを Slack コミュニケーションプラットフォーム内で実現します。

**主な価値**: Slack と生成 AI サービスをセキュアに接続し、AI 採用の障壁を削減しながら強固なセキュリティ境界を維持します。

## なぜ重要か

### 即座に得られるメリット

- **学習コストゼロ**: Slack から直接 AI を利用—新しいツールを学ぶ必要はありません
- **即座の確認**: リクエストが処理中であることを 2 秒以内に確認できます
- **高速な回答**: 5〜30 秒で AI 生成の回答を受け取れます
- **チーム知識共有**: 同僚が効果的に AI を使用する方法を観察し、ネットワーク効果を生み出します
- **エンタープライズセキュリティ**: 多層防御により、不正アクセスやデータ漏洩から保護します

### ビジネスへの影響

- **生産性の向上**: Slack 内で AI との対話を維持し、コンテキストスイッチングを削減
- **意思決定の高速化**: ワークフローを離れることなく質問への回答を取得
- **組織的な学習**: チームメンバーが観察を通じて効果的な AI 使用パターンを自然に発見
- **コスト効率**: 使用量ベースの課金モデルと、組み込みのレート制限およびトークン管理

## クイックスタート

> **📖 詳細ガイド**: [docs/quickstart.md](docs/quickstart.md)

### 前提条件

- Bedrock アクセスが有効な AWS アカウント
- Node.js 18+ および Python 3.11+
- Slack ワークスペース管理者権限

### デプロイ

このプロジェクトは 2 つの独立したスタック（VerificationStack と ExecutionStack）を使用し、個別にデプロイ可能で、クロスアカウントデプロイをサポートします。

**デプロイ手順**:

1. ExecutionStack をデプロイ → `ExecutionApiUrl` を取得
2. VerificationStack をデプロイ → `VerificationLambdaRoleArn` と `ExecutionResponseQueueUrl` を取得
3. ExecutionStack を更新 → リソースポリシーと SQS キュー URL を設定

詳細なデプロイ手順は [CDK README](cdk/README.md) を参照してください。

**クイックスタート（デプロイスクリプト使用）**:

```bash
# 1. 設定ファイルを作成
cp cdk/cdk.config.json.example cdk/cdk.config.dev.json
# cdk/cdk.config.dev.json を編集して以下を設定:
# - verificationAccountId, executionAccountId
# - slackBotToken, slackSigningSecret

# 2. デプロイ環境を設定（dev または prod）
export DEPLOYMENT_ENV=dev  # 本番環境の場合は 'prod' を使用

# 3. デプロイスクリプトを実行（AWSプロファイルはオプション）
export AWS_PROFILE=your-profile-name  # オプション: AWSプロファイルを使用する場合
./scripts/deploy-split-stacks.sh
```

**注意**: Slack 認証情報は`cdk.config.{env}.json`ファイルに直接設定できます。環境変数として設定することも可能ですが、設定ファイルの方が管理しやすくなります。

**⚠️ 重要**: デプロイ後にホワイトリストを設定してください。[クイックスタートガイド](docs/quickstart.md)を参照。

### 環境分離

このプロジェクトは開発環境（`dev`）と本番環境（`prod`）の分離をサポートしています：

- **スタック名**: 自動的に `-Dev` または `-Prod` のサフィックスが付加されます（例: `SlackAI-Execution-Dev`, `SlackAI-Verification-Prod`）
- **リソース分離**: すべてのリソース（Lambda 関数、DynamoDB テーブル、Secrets Manager、API Gateway など）が環境ごとに自動的に分離されます
- **リソースタグ付け**: すべてのリソースに以下のタグが付与されます：
  - `Environment`: `dev` または `prod`
  - `Project`: `SlackAI`
  - `ManagedBy`: `CDK`
  - `StackName`: スタック名

**使用方法:**

```bash
# 開発環境にデプロイ
export DEPLOYMENT_ENV=dev
./scripts/deploy-split-stacks.sh

# 本番環境にデプロイ
export DEPLOYMENT_ENV=prod
./scripts/deploy-split-stacks.sh
```

**注意**: `DEPLOYMENT_ENV` が設定されていない場合、スクリプトは警告を表示してデフォルトで `dev` 環境を使用します。セキュリティのため、各環境では別々の Slack アプリ/ワークスペースを使用するか、異なるシークレットを設定することを推奨します。

## 動作の仕組み

システムは、セキュリティ強化のために個別にデプロイ可能な 2 つの独立したゾーンを通じてリクエストを処理します：

```
┌─────────────────────────────────────────────────────────────┐
│ Slack ワークスペース                                          │
│ ユーザー: @bot 質問 または /ask "質問"                       │
└────────────────────┬────────────────────────────────────────┘
                     │ [1] HTTPS POST
                     │ X-Slack-Signature (HMAC SHA256)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 検証ゾーン (Verification Zone)                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SlackEventHandler (Function URL)                        │ │
│ │ - 署名検証（鍵 1）                                       │ │
│ │ - Slack API 実在性チェック（鍵 2）                       │ │
│ │ - ホワイトリスト認可                                    │ │
│ │ - イベント重複排除                                      │ │
│ │ [2] → 即座に応答 "処理中です..."（3 秒以内）            │ │
│ │ [3] → Execution API を呼び出し（IAM 認証）              │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [3] API Gateway (IAM認証 または APIキー認証)
                         │ POST /execute
                         │ 認証: IAM (SigV4) または APIキー (x-api-key ヘッダー)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 実行ゾーン (Execution Zone)                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Execution API (API Gateway)                             │ │
│ │ - デュアル認証: IAM認証 または APIキー認証（デフォルト: APIキー認証）│ │
│ │ - リソースポリシー: 検証 Lambda ロール + APIキー        │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│ ┌─────────────────────▼──────────────────────────────────┐ │
│ │ BedrockProcessor                                        │ │
│ │ - Amazon Bedrock Converse API を呼び出し               │ │
│ │ - 添付ファイルを処理（画像、ドキュメント）            │ │
│ │ [4] → SQS キューにレスポンスを送信                     │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [4] SQS メッセージ
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 検証ゾーン（継続）                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ExecutionResponseQueue (SQS)                            │ │
│ │ - 実行ゾーンからのレスポンスを受信                        │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│ ┌─────────────────────▼──────────────────────────────────┐ │
│ │ SlackResponseHandler                                    │ │
│ │ - SQS メッセージを処理                                  │ │
│ │ - Slack API にレスポンスを投稿                          │ │
│ │ [5] → Slack に投稿 (chat.postMessage)                 │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [5] HTTPS POST
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Slack ワークスペース                                          │
│ [6] スレッド内に AI レスポンスが表示                         │
└────────────────────────────────────────────────────────────┘
│ │ - 添付ファイルを処理（画像、ドキュメント）              │ │
│ │ [4] → Slack にレスポンスを投稿（スレッド返信）          │ │
│ └────────────────────┬───────────────────────────────────┘ │
│                      │ [4] HTTPS POST to Slack API         │
│                      ↓                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ AWS Bedrock Converse API                                 │ │
│ │ - Foundation Model (Claude、Nova など)                  │ │
│ │ - マルチモーダル入力（テキスト + 画像）                   │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────────────┐
│ Slack ワークスペース                                           │
│ [5] AI レスポンスがスレッド内に表示（5〜30 秒後）             │
└──────────────────────────────────────────────────────────────┘

フロー:
[1] ユーザーが Slack からリクエストを送信
[2] 検証ゾーンが即座に応答（3 秒以内）
[3] 検証ゾーンが Execution API を呼び出し（IAM認証 または APIキー認証、デフォルト: APIキー認証）
[4] 実行ゾーンが Bedrock で処理し、Slack に投稿
[5] レスポンスが Slack スレッド内に表示（5〜30 秒後）
```

**検証ゾーン**は、リクエストが正当であることを確認します：

- Slack 署名を検証し、リクエストが Slack から来たことを確認
- ユーザー、チャンネル、ワークスペースが実際に存在することを確認
- 認可ルール（ホワイトリスト）を適用
- 重複リクエストを防止

**実行ゾーン**は AI 処理を担当します：

- Amazon Bedrock を呼び出して回答を生成
- 会話コンテキストとスレッド履歴を管理
- 添付ファイル（画像、ドキュメント）を処理
- 回答を Slack に投稿

この分離により以下が可能になります：

- **クロスアカウントデプロイ**: 検証と実行を異なる AWS アカウントにデプロイ
- **独立した更新**: 一方のゾーンを更新しても他方に影響しない
- **セキュリティ強化**: 検証と処理の間に強固なセキュリティ境界

## 主な機能

### セキュリティ

**2 鍵防御モデル**: Slack 署名シークレットとボットトークンの両方が必要で、1 つの鍵が侵害されても攻撃を可能にしません。

- HMAC SHA256 署名検証
- Slack API 実在性チェック（ユーザー、チャンネル、ワークスペースが実在することを検証）
- ホワイトリスト認可（team_id、user_id、channel_id）
- AI レスポンスでの PII マスキング
- プロンプトインジェクション検出

### パフォーマンス

- **非同期処理**: 3 秒以内に確認応答、5〜30 秒で完全な回答
- **イベント重複排除**: 同じリクエストを 2 回処理することを防止
- **構造化ログ**: 相関 ID による完全な監査証跡

### AI 機能

- **マルチモデルサポート**: Claude、Nova、その他の Bedrock モデルで動作
- **スレッドコンテキスト**: Slack スレッド内で会話履歴を維持
- **添付ファイル処理**: リクエスト内の画像とドキュメントを処理

### インフラストラクチャ

- **AWS CDK**: TypeScript によるインフラストラクチャ as コード
- **DynamoDB**: トークンを保存し、検証結果をキャッシュし、重複を防止
- **AWS Secrets Manager**: Slack 認証情報と API キーを安全に保存
- **API Gateway**: デュアル認証（IAM 認証と API キー認証）によるスタック間通信
- **独立したデプロイ**: 検証と実行ゾーンを別々のスタックとしてデプロイ可能

## アーキテクチャ

アプリケーションは、**2 つの独立したスタック**を使用し、個別にデプロイ可能です：

- **VerificationStack**: SlackEventHandler + DynamoDB + Secrets Manager
- **ExecutionStack**: BedrockProcessor + API Gateway

この構成は以下をサポートします：

- ✅ クロスアカウントデプロイ
- ✅ 独立したライフサイクル管理
- ✅ セキュリティ境界の強化
- ✅ 柔軟なデプロイオプション

技術的な詳細については、[アーキテクチャ概要](docs/reference/architecture/overview.md)を参照してください。

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
│   ├── lib/
│   │   ├── execution/      # Execution Stack (完全自己完結)
│   │   │   ├── execution-stack.ts
│   │   │   ├── constructs/
│   │   │   └── lambda/     # Lambdaコード
│   │   │       └── bedrock-processor/
│   │   ├── verification/   # Verification Stack (完全自己完結)
│   │   │   ├── verification-stack.ts
│   │   │   ├── constructs/
│   │   │   └── lambda/     # Lambdaコード
│   │   │       ├── slack-event-handler/
│   │   │       └── slack-response-handler/
│   │   └── types/         # 共通型定義
│   └── bin/              # CDKエントリーポイント
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
cd cdk/lib/verification/lambda/slack-event-handler && pytest tests/
cd ../../execution/lambda/bedrock-processor && pytest tests/

# ログ確認
aws logs tail /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler --follow
aws logs tail /aws/lambda/SlackAI-Execution-Dev-BedrockProcessor --follow
```

開発ガイドラインは [CLAUDE.md](CLAUDE.md) を参照。

## AWS MCP Servers

このプロジェクトには、AI 支援開発を強化する AWS Model Context Protocol (MCP) サーバーが含まれています。これらのサーバーは、AWS ドキュメント、API 操作、Infrastructure-as-Code 支援へのアクセスを提供します。

### 利用可能なサーバー

| サーバー | 目的 | 認証 |
|--------|------|------|
| **aws-documentation-mcp-server** | AWS ドキュメントへのアクセスとコンテンツ検索 | なし |
| **aws-knowledge-mcp-server** | 最新の AWS ドキュメント、コードサンプル、リージョン可用性情報 | なし（レート制限あり） |
| **aws-api-mcp-server** | 15,000 以上の AWS API を自然言語で操作 | AWS 認証情報が必要 |
| **aws-iac-mcp-server** | CDK と CloudFormation のドキュメント、テンプレート検証 | AWS 認証情報が必要 |

### 前提条件

`uv` パッケージマネージャーをインストール:

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# または Homebrew を使用
brew install uv
```

### 設定

プロジェクトには、4 つの AWS MCP サーバーすべてが事前設定された `.claude/mcp.json` ファイルが含まれています。設定では、柔軟なセットアップのために環境変数展開を使用します:

```json
{
  "mcpServers": {
    "aws-documentation-mcp-server": { ... },
    "aws-knowledge-mcp-server": { ... },
    "aws-api-mcp-server": { ... },
    "aws-iac-mcp-server": { ... }
  }
}
```

### 環境変数

MCP サーバーは以下の環境変数を使用します（デフォルト値あり）:

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `AWS_REGION` | `ap-northeast-1` | API 操作用の AWS リージョン |
| `AWS_PROFILE` | `default` | 使用する AWS 認証情報プロファイル |
| `HOME` | システムデフォルト | ユーザーホームディレクトリ |

### 使用方法

設定が完了すると、Claude Code が自動的に MCP サーバーを検出して使用します。以下のことができます:

- AWS サービスについて質問し、ドキュメントスニペットを取得
- 自然言語で AWS API 操作を実行
- CDK と CloudFormation テンプレートのヘルプを取得
- コード例とベストプラクティスを検索

### 承認

プロジェクトスコープの MCP サーバーを初めて使用するとき、Claude Code が承認を求めます。承認の選択をリセットするには:

```bash
claude mcp reset-project-choices
```

### 参考資料

- [AWS MCP Servers ドキュメント](https://awslabs.github.io/mcp/)
- [GitHub リポジトリ](https://github.com/awslabs/mcp)
- [Claude Code MCP ガイド](https://code.claude.com/docs/en/mcp)

## AWS MCP Orchestrator Skill

このプロジェクトには、組み込みの安全ゲートと透明性を備えた、AWS 関連のクエリを最適な MCP サーバーに自動的にルーティングするインテリジェントな AWS MCP Orchestrator スキルが含まれています。

### 機能

Orchestrator は AWS クエリを分析し、以下を行います:

- **インテント分類** - 達成しようとしていることを判断
- **インテリジェントルーティング** - クエリに最適な MCP サーバーを選択
- **安全性の確保** - 確認ゲートによる偶発的なリソース変更を防止
- **透明性の提供** - どのサーバーが使用されているか、その理由を説明
- **フォールバックの管理** - レート制限時に自動的にサーバーを切り替え

### 設計優先順位

1. **安全性** - 偶発的な AWS リソース変更を防止
2. **正確性** - 適切なサーバーから正しい情報を確保
3. **最新性** - 必要に応じて最新の AWS ドキュメントを使用
4. **透明性** - 常にルーティング決定を説明
5. **速度** - 高速応答のために最適化
6. **コスト** - 不要な API 呼び出しを最小化

### インテントタイプ

Orchestrator は 6 つのクエリタイプを認識します:

| インテント | 説明 | 例 | 使用サーバー |
|-----------|------|-----|-------------|
| **DOCUMENTATION_LOOKUP** | 一般的な AWS コンセプトとハウツー質問 | "Lambda 環境変数の設定方法は？" | knowledge-mcp |
| **LATEST_INFORMATION** | 最近の更新、新機能、リージョン可用性 | "2025 年の最新 Bedrock モデルは？" | documentation-mcp |
| **IAC_ASSISTANCE** | CDK/CloudFormation コード生成と検証 | "Lambda + DynamoDB の CDK コードを生成" | iac-mcp |
| **ACCOUNT_INSPECTION** | 読み取り専用 AWS アカウントリソースクエリ | "Lambda 関数一覧を表示" | account-mcp |
| **RESOURCE_MODIFICATION** | AWS リソースの作成/更新/削除 | "Lambda 関数メモリを 512MB に更新" | resource-mcp（安全ゲート付き） |
| **ARCHITECTURAL_GUIDANCE** | 複数ステップのアーキテクチャ判断 | "API 認証を実装する最良の方法は？" | 複数サーバー |

### 安全ゲート

リソース変更クエリに対して、Orchestrator は:

1. **書き込み操作を検出** - 作成/更新/削除インテントを識別
2. **プレビューを表示** - 実行される内容を正確に表示
3. **確認を要求** - 明示的な "CONFIRM" 応答を待機
4. **影響を分析** - 不可逆性、コスト、依存関係について警告
5. **代替案を提供** - 可能な場合、より安全なオプションを提案

**例**:

```
ユーザー: "DynamoDB テーブル my-test-table を削除"

Orchestrator:
⚠️  高リスク操作が検出されました

操作: DeleteTable
サービス: DynamoDB
リソース: my-test-table

影響:
❌ 永続的なデータ損失（テーブルとすべてのアイテム）
❌ 元に戻せません
⚠️  依存リソースが壊れる可能性があります

続行するには、次を正確に入力してください: CONFIRM DELETE my-test-table
```

### 使用方法

AWS 関連の質問をすると、Orchestrator が自動的にアクティブ化されます:

```bash
# 一般ドキュメント
"Lambda の同時実行はどのように機能しますか？"
→ ルーティング先: knowledge-mcp（高速、キャッシュ済み）

# 最新情報
"2025 年の最新 Lambda ランタイムバージョンは？"
→ ルーティング先: documentation-mcp（最新、正確）

# インフラストラクチャコード
"API キー認証付き API Gateway の CDK コードを生成"
→ ルーティング先: iac-mcp（IaC 専門）

# アカウント検査
"ap-northeast-1 の DynamoDB テーブル一覧"
→ ルーティング先: account-mcp（読み取り専用、AWS 認証が必要）

# リソース変更（安全ゲート付き）
"Lambda 関数のタイムアウトを 60 秒に更新"
→ ルーティング先: resource-mcp（プレビュー + 確認が必要）
```

### プロジェクトコンテキスト最適化

Orchestrator はこの Slack AI App プロジェクト用に最適化されており、以下を認識します:

- **技術**: Lambda、DynamoDB、API Gateway、CDK、Secrets Manager、Bedrock
- **一般的なパターン**: Slack イベント処理、Bedrock API 統合、API 認証
- **言語設定**: Lambda 用 Python 3.11、CDK 用 TypeScript

プロジェクト固有の質問をすると、Orchestrator は自動的に:
- 関連技術の結果をフィルタリング
- 適切な言語でコード例を提供
- プロジェクトアーキテクチャに適合するパターンを提案

### フォールバックチェーン

プライマリサーバーが利用できないか、レート制限されている場合:

```
documentation-mcp（レート制限）
    ↓
knowledge-mcp（フォールバック）
    + 警告: "キャッシュされたドキュメントを使用（最新の更新を反映していない可能性）"
```

### 透明性

すべての応答に含まれます:

```
📋 インテント: DOCUMENTATION_LOOKUP
🔍 サーバー: knowledge-mcp
💡 理由: 一般的な AWS コンセプト、安定したドキュメント
✅ 安全性: 認証不要、読み取り専用

[応答内容]

---
Powered by knowledge-mcp
```

### ドキュメント

- **スキル定義**: `.claude/skills/aws-mcp-orchestrator/SKILL.md`
- **使用ガイド**: `.claude/skills/aws-mcp-orchestrator/README.md`
- **例**: `.claude/skills/aws-mcp-orchestrator/examples.md`（28 の包括的な例）

## 環境変数

| 変数                            | 説明                                                | デフォルト                                     |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| `SLACK_SIGNING_SECRET`          | Slack アプリ署名シークレット（初回デプロイのみ）    | -                                              |
| `SLACK_BOT_TOKEN`               | Slack ボット OAuth トークン（初回デプロイのみ）     | -                                              |
| `BEDROCK_MODEL_ID`              | Bedrock モデル（cdk.json で設定）                   | -                                              |
| `EXECUTION_API_AUTH_METHOD`     | Execution API の認証方法（`iam` または `api_key`）  | `api_key`                                      |
| `EXECUTION_API_KEY_SECRET_NAME` | API キー認証使用時の Secrets Manager シークレット名 | `execution-api-key-{env}` (環境ごとに自動設定) |

**認証方法**:

- **IAM 認証**: AWS Signature Version 4 (SigV4) 署名による認証
- **API キー認証**: AWS Secrets Manager に保存された API キーを使用（デフォルト）

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

**最終更新日**: 2025-12-29

## 最近の更新

- **2025-12-29**: AWS MCP Servers と AWS MCP Orchestrator Skill を追加
  - 4つの AWS MCP サーバーを設定（documentation、knowledge、api、iac）
  - 6つのインテントタイプを持つインテリジェントオーケストレータースキルを作成
  - リソース変更操作用の安全ゲートを実装
  - Slack AI App 用に最適化（Lambda、DynamoDB、API Gateway、CDK、Bedrock）
- **2025-12-28**: Execution API Gateway にデュアル認証サポート（IAM 認証と API キー認証）を追加
  - デフォルト認証方法: API キー認証（`EXECUTION_API_AUTH_METHOD` 環境変数で設定可能）
  - API キーは AWS Secrets Manager に安全に保存
  - 将来的な非 AWS API との統合に対応
