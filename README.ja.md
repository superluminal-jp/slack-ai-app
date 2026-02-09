# Slack AI App

> **English version**: [README.md](README.md)

Slack と Amazon Bedrock をセキュアに接続し、AI 生成レスポンスを提供する Slack ボット。Amazon Bedrock AgentCore と A2A（Agent-to-Agent）プロトコルによるゾーン間通信、FastAPI ベースのエージェントコンテナ、エンタープライズレベルのセキュリティ多層防御を実現します。

## このシステムの目的

このアプリケーションは、チームが Slack から直接 AI 機能を利用できるようにします。チームメンバーは質問をし、AI 生成の回答を受け取り、知識を共有できます。これらすべてを Slack コミュニケーションプラットフォーム内で実現します。

**主な価値**: Slack と生成 AI サービスをセキュアに接続し、AI 採用の障壁を削減しながら強固なセキュリティ境界を維持します。

## なぜ重要か

### 即座に得られるメリット

- **学習コストゼロ**: Slack から直接 AI を利用—新しいツールを学ぶ必要はありません
- **即座の確認**: リクエストが処理中であることを 2 秒以内に確認できます
- **高速な回答**: Bedrock の処理完了後に AI 生成の回答を受け取れます（処理時間はモデル、入力長、負荷状況に依存）
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
- Docker（ARM64 ビルド対応 — AgentCore コンテナ用）
- AWS CDK CLI v2.215.0+
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

システムは 2 つの独立したゾーンでリクエストを処理し、**AgentCore A2A** の単一通信経路を使用します。

### AgentCore A2A パス（推奨）

```
┌─────────────────────────────────────────────────────────────┐
│ Slack ワークスペース                                          │
│ ユーザー: @bot 質問                                           │
└────────────────────┬────────────────────────────────────────┘
                     │ [1] HTTPS POST
                     │ X-Slack-Signature (HMAC SHA256)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 検証ゾーン (Verification Zone)                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SlackEventHandler Lambda (Function URL)                 │ │
│ │ - 署名検証、リアクション(👀)応答                         │ │
│ │ - AgentCore A2A パス（唯一の経路）                      │ │
│ │ [2] InvokeAgentRuntime (SigV4)                          │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│ ┌─────────────────────▼──────────────────────────────────┐ │
│ │ Verification Agent (AgentCore Runtime, ARM64)           │ │
│ │ - A2A プロトコル (raw JSON POST, port 9000)             │ │
│ │ - セキュリティパイプライン: 存在確認 → 認可 → レート制限│ │
│ │ - Agent Card: /.well-known/agent-card.json              │ │
│ │ [3] InvokeAgentRuntime (SigV4, クロスアカウント対応)    │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [3] A2A (SigV4 認証)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 実行ゾーン (Execution Zone)                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Execution Agent (AgentCore Runtime, ARM64)               │ │
│ │ - FastAPI POST ハンドラ (raw JSON, port 9000)           │ │
│ │ - Bedrock Converse API、添付ファイル処理                │ │
│ │ [4] FastAPI レスポンスで結果返却                         │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │ [4] A2A レスポンス（非同期ポーリング）
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 検証ゾーン（継続）                                           │
│ Verification Agent → Slack API (chat.postMessage)          │
│ [5] AI レスポンスをスレッドに投稿                            │
└─────────────────────────────────────────────────────────────┘

フロー (AgentCore A2A):
[1] ユーザーが @bot で質問を送信
[2] SlackEventHandler → Verification Agent (InvokeAgentRuntime)
[3] Verification Agent → Execution Agent (A2A, SigV4)
[4] Execution Agent → Bedrock → FastAPI で結果返却
[5] Verification Agent → Slack API → スレッド返信
```

### ゾーンの役割

**検証ゾーン**は、リクエストが正当であることを確認します：

- Slack 署名を検証し、リクエストが Slack から来たことを確認
- ユーザー、チャンネル、ワークスペースが実際に存在することを確認
- 認可ルール（ホワイトリスト）を適用
- 重複リクエストを防止

**実行ゾーン**は AI 処理を担当します：

- Amazon Bedrock を呼び出して回答を生成
- 会話コンテキストとスレッド履歴を管理
- 添付ファイル（画像、ドキュメント）を処理
- A2A レスポンスで検証ゾーンに結果を返却

この分離により以下が可能になります：

- **クロスアカウントデプロイ**: 検証と実行を異なる AWS アカウントにデプロイ
- **独立した更新**: 一方のゾーンを更新しても他方に影響しない
- **セキュリティ強化**: SigV4 + リソースベースポリシーによる強固なセキュリティ境界
- **シンプルなアーキテクチャ**: エージェントコンテナで FastAPI による直接ルーティング、SDK 依存なし

## 主な機能

### セキュリティ

**2 鍵防御モデル**: Slack 署名シークレットとボットトークンの両方が必要で、1 つの鍵が侵害されても攻撃を可能にしません。

- HMAC SHA256 署名検証
- Slack API 実在性チェック（ユーザー、チャンネル、ワークスペースが実在することを検証）
- ホワイトリスト認可（team_id、user_id、channel_id）

**AI セキュリティ**:

- AI レスポンスでの PII マスキング
- プロンプトインジェクション検出

### パフォーマンス

- **非同期処理**: 確認応答（Lambda 関数タイムアウト: 10 秒）、Bedrock の処理完了後に完全な回答（処理時間はモデル、入力長、負荷状況に依存し、予測不可能）
- **イベント重複排除**: 同じリクエストを 2 回処理することを防止
- **構造化ログ**: 相関 ID による完全な監査証跡

### AI 機能

- **マルチモデルサポート**: Claude、Nova、その他の Bedrock モデルで動作
- **スレッドコンテキスト**: Slack スレッド内で会話履歴を維持
- **添付ファイル処理**: リクエスト内の画像とドキュメントを処理

### インフラストラクチャ

- **AWS CDK**: TypeScript によるインフラストラクチャ as コード
- **AgentCore Runtime**: A2A プロトコル対応の ARM64 Docker コンテナ (FastAPI)
- **ECR**: AgentCore エージェントの Docker イメージ管理
- **DynamoDB**: トークンを保存し、検証結果をキャッシュし、重複を防止
- **AWS Secrets Manager**: Slack 認証情報と API キーを安全に保存
- **独立したデプロイ**: 検証と実行ゾーンを別々のスタックとしてデプロイ可能

## アーキテクチャ

アプリケーションは **2 つの独立したスタック**を使用し、個別にデプロイ可能です：

- **VerificationStack**: SlackEventHandler Lambda + Verification Agent (AgentCore) + DynamoDB + Secrets Manager
- **ExecutionStack**: Execution Agent (AgentCore Runtime + ECR)

この構成は以下をサポートします：

- ✅ AgentCore A2A プロトコルによるゾーン間通信
- ✅ クロスアカウントデプロイ（SigV4 + リソースベースポリシー）
- ✅ Agent Card (A2A 準拠) による Agent Discovery
- ✅ 独立したライフサイクル管理

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
├── cdk/                        # AWS CDK インフラストラクチャ
│   ├── bin/                    # CDK エントリーポイント
│   ├── lib/
│   │   ├── execution/          # Execution Stack
│   │   │   ├── execution-stack.ts
│   │   │   ├── constructs/
│   │   │   │   ├── execution-agent-runtime.ts   # AgentCore Runtime (A2A)
│   │   │   │   └── execution-agent-ecr.ts       # ECR イメージビルド
│   │   │   ├── agent/
│   │   │   │   └── execution-agent/             # Execution Agent コンテナ
│   │   │   │       ├── main.py                  # A2A サーバー
│   │   │   │       ├── agent_card.py            # Agent Card 定義
│   │   │   │       ├── cloudwatch_metrics.py    # メトリクス
│   │   │   │       └── tests/                   # Python テスト (79 tests)
│   │   │   └── lambda/                          # レガシー Lambda コード
│   │   ├── verification/       # Verification Stack
│   │   │   ├── verification-stack.ts
│   │   │   ├── constructs/
│   │   │   │   ├── verification-agent-runtime.ts # AgentCore Runtime (A2A)
│   │   │   │   ├── verification-agent-ecr.ts     # ECR イメージビルド
│   │   │   │   └── slack-event-handler.ts        # Verification Agent を A2A で呼び出し
│   │   │   ├── agent/
│   │   │   │   └── verification-agent/           # Verification Agent コンテナ
│   │   │   │       ├── main.py                   # A2A サーバー
│   │   │   │       ├── a2a_client.py             # Execution Agent A2A クライアント
│   │   │   │       ├── agent_card.py             # Agent Card 定義
│   │   │   │       ├── cloudwatch_metrics.py     # メトリクス
│   │   │   │       └── tests/                    # Python テスト (63 tests)
│   │   │   └── lambda/                           # SlackEventHandler Lambda
│   │   └── types/              # 共通型定義
│   └── test/                   # CDK/Jest テスト (25 tests)
├── docs/                       # ドキュメント
│   ├── reference/              # アーキテクチャ、セキュリティ、運用
│   ├── explanation/            # 設計原則、ADR
│   ├── tutorials/              # 入門ガイド
│   └── how-to/                 # トラブルシューティング
├── specs/                      # 機能仕様
└── scripts/                    # デプロイスクリプト
```

## 開発

### テスト実行

```bash
# CDK コンストラクトテスト (Jest, 25 tests)
cd cdk && npx jest test/agentcore-constructs.test.ts --verbose

# Execution Agent テスト (pytest, 79 tests)
cd cdk/lib/execution/agent/execution-agent && python -m pytest tests/ -v

# Verification Agent テスト (pytest, 63 tests)
cd cdk/lib/verification/agent/verification-agent && python -m pytest tests/ -v

# SlackEventHandler Lambda テスト
cd cdk/lib/verification/lambda/slack-event-handler && pytest tests/
```

### ログ確認

```bash
# Lambda ログ
aws logs tail /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler --follow

# AgentCore Runtime ログ（AgentCore 有効時）
aws logs tail /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler --follow
```

## 環境変数

| 変数                            | 説明                                                | デフォルト                                     |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| `SLACK_SIGNING_SECRET`          | Slack アプリ署名シークレット（初回デプロイのみ）    | -                                              |
| `SLACK_BOT_TOKEN`               | Slack ボット OAuth トークン（初回デプロイのみ）     | -                                              |
| `BEDROCK_MODEL_ID`              | Bedrock モデル（cdk.json で設定）                   | -                                              |
| `VERIFICATION_AGENT_ARN`        | Verification Agent の AgentCore Runtime ARN（CDK で設定） | - |
| `EXECUTION_AGENT_ARN`           | Execution Agent の AgentCore Runtime ARN（クロススタックまたは設定） | - |

シークレットは初回デプロイ後、AWS Secrets Manager に保存されます。

## 鍵の管理

本システムは、通信の安全性を確保するために複数の鍵を使用しています。すべての鍵は **AWS Secrets Manager** に安全に保存され、実行時に取得されます。

### Two-Key Defense（2 鍵防御）モデル

Slack からのリクエスト検証には、2 つの独立した鍵を使用する **Two-Key Defense** モデルを採用しています。いずれか一方が漏洩しても、もう一方がなければ攻撃は成功しません。

**なぜ両方の鍵が必要なのか**:

リクエストが処理されるには、**両方の検証を通過する必要があります**：

1. **署名検証（鍵 1）**: Signing Secret が必要

   - リクエストに正しい署名が含まれているか確認
   - Signing Secret がないと、正しい署名を生成できない

2. **Existence Check（鍵 2）**: Bot Token が必要
   - Slack API を呼び出してエンティティの実在性を確認
   - Bot Token がないと、Slack API を呼び出せない

**一方の鍵のみ漏洩した場合**:

- **Signing Secret のみ漏洩**: 署名検証は通過するが、Existence Check で Bot Token が必要なため失敗 → **攻撃ブロック**
- **Bot Token のみ漏洩**: Existence Check は可能だが、署名検証で Signing Secret が必要なため失敗 → **攻撃ブロック**

**両方の鍵が漏洩した場合のみ**:

- 署名検証（鍵 1）も通過
- Existence Check（鍵 2）も通過
- すべての検証を通過してしまう → **攻撃が成功する可能性がある**

#### 鍵 1: Signing Secret（署名シークレット）

- **用途**: Slack リクエストの署名検証
- **保存場所**: AWS Secrets Manager（`{StackName}/slack/signing-secret`）
- **使用方法**: HMAC SHA256 署名検証（**リクエストごとに実行**）
  - Slack がリクエストに `X-Slack-Signature` ヘッダーと `X-Slack-Request-Timestamp` ヘッダーを追加
  - Lambda 関数が**リクエストごとに**以下を実行：
    1. タイムスタンプ検証（±5 分以内、リプレイアタック防止）
    2. 署名の再計算: `v0:{timestamp}:{body}` から HMAC SHA256 で計算
    3. 提供された署名と再計算した署名を比較（定数時間比較）
  - 一致する場合のみリクエストを受理
- **保護内容**: リクエストの真正性（リクエストが Slack から送信されたことを証明）

**重要な点**: Signing Secret は固定値として保存されていますが、**署名検証はリクエストごとに実行されます**。各リクエストの署名は、リクエストボディとタイムスタンプに依存するため、リクエストごとに異なります。

**Signing Secret が漏洩した場合の影響**:

Signing Secret が漏洩した場合、攻撃者は任意のリクエストボディとタイムスタンプから正しい署名を生成できます。つまり、**検証ゾーンに Signing Secret と Bot Token を登録した後、それらが漏洩すれば、詐称したリクエストを通すことが技術的に可能です**。

**防御メカニズム**:

1. **Two-Key Defense**: Signing Secret のみ漏洩した場合、Existence Check で Bot Token が必要なため、実在しないエンティティ ID を使った攻撃はブロックされます
2. **タイムスタンプ検証**: ±5 分以内のタイムスタンプのみ有効（リプレイアタック防止）
3. **イベント重複排除**: 同じリクエストの重複処理を防止
4. **ホワイトリスト認可**: ホワイトリストに登録されていないエンティティからのリクエストをブロック

**漏洩なしで騙る攻撃の可能性**:

**正規の Slack リクエストを傍受して再送信する攻撃（リプレイアタック）について**:

攻撃者が正規の Slack リクエストを傍受（中間者攻撃など）して、それを再送信する場合：

1. **完全に同じリクエストを再送信する場合**:

   - 署名検証は通過（署名、タイムスタンプ、ボディが同じ）
   - しかし、**イベント重複排除でブロック**（同じ `event_id` のため）
   - **結果**: 200 OK を返すが、処理は実行されない

2. **リクエストボディを変更して再送信する場合**:

   - 署名は `v0:{timestamp}:{body}` から計算されるため、ボディを変更すると署名が一致しなくなる
   - **結果**: 署名検証で失敗、401 Unauthorized を返す

3. **タイムスタンプを変更して再送信する場合**:
   - 署名は `v0:{timestamp}:{body}` から計算されるため、タイムスタンプを変更すると署名が一致しなくなる
   - 5 分以上古いタイムスタンプは検証で失敗
   - **結果**: 署名検証で失敗、401 Unauthorized を返す

**結論**: 鍵が漏洩しない限り、攻撃者が正規のリクエストを傍受しても、**完全に同じリクエストを再送信する場合はイベント重複排除でブロックされ、リクエストを変更する場合は署名検証で失敗します**。つまり、**鍵が漏洩しない限り、詐称したリクエストを通すことはできません**。

**ただし、以下の条件がすべて満たされた場合のみ、攻撃が成功する可能性があります**:

- Signing Secret と Bot Token の両方が漏洩している
- 攻撃者が正規のリクエストを傍受できる（中間者攻撃など）
- 攻撃者が新しい `event_id` でリクエストを生成できる（Slack の内部システムにアクセスできる場合）

これは極めて稀なケースであり、通常の攻撃シナリオでは実現困難です。

**両方の鍵が漏洩した場合**:

Signing Secret + Bot Token の両方が漏洩した場合、攻撃者は：

- 任意のリクエストに正しい署名を生成できる（Signing Secret を使用）
- 実在するエンティティ ID で Existence Check を通過できる（Bot Token を使用）
- ホワイトリストに登録済みのユーザー ID を使用すれば、すべての検証を通過してしまう

**推奨事項**:

- 鍵の漏洩が疑われる場合、即座に両方の鍵をローテーション
- モニタリングとアラートにより、異常なアクセスパターンを検出
- 定期的なセキュリティ監査と鍵のローテーション

#### 鍵 2: Bot Token（ボットトークン）

- **用途**: Slack API による実在性チェック（Existence Check）
- **保存場所**: AWS Secrets Manager（`{StackName}/slack/bot-token`）
- **使用方法**: Slack API 呼び出し
  - `team.info`: `team_id` の実在性確認
  - `users.info`: `user_id` の実在性確認
  - `conversations.info`: `channel_id` の実在性確認
- **保護内容**: エンティティの実在性（削除されたユーザー/チャンネルからのリクエストをブロック）

**実在ユーザーを騙る攻撃への防御**:

実在する `team_id`/`user_id`/`channel_id` を使用した攻撃（Signing Secret + Bot Token の両方が漏洩した場合）に対しては、**ホワイトリスト認可（レイヤー 3c）** により防御されます：

- 署名検証（鍵 1）は通過
- Existence Check（鍵 2）も通過（実在エンティティのため）
- **ホワイトリスト認可でブロック**: ホワイトリストに登録されていないエンティティからのリクエストは 403 Forbidden で拒否
- ホワイトリストが設定されている場合、実在するユーザー ID でも、ホワイトリストに含まれていなければアクセス不可

**重要な制限事項: ホワイトリスト登録済みユーザーを騙る攻撃**:

**Signing Secret + Bot Token の両方が漏洩した場合、ホワイトリストに登録済みのユーザーを騙ることは技術的に可能です**。この場合：

- 署名検証（鍵 1）は通過
- Existence Check（鍵 2）も通過（実在エンティティのため）
- ホワイトリスト認可（鍵 3）も通過（登録済みユーザー ID のため）

**防御と軽減策**:

1. **鍵の漏洩検出と即座のローテーション**: 漏洩が検出された場合、両方の鍵を即座にローテーション
2. **モニタリングとアラート**: 異常なアクセスパターン（例: 通常とは異なる IP アドレス、時間帯、リクエスト頻度）を検出
3. **レート制限**: ユーザー単位のレート制限により、攻撃の影響を最小化
4. **イベント重複排除**: 同じリクエストの重複処理を防止
5. **最小権限の原則**: Lambda 実行ロールは必要な権限のみを持ち、鍵へのアクセスを制限

**推奨事項**:

- 定期的なセキュリティ監査と鍵のローテーション
- CloudWatch メトリクスとアラートの設定
- 異常なアクセスパターンの監視
- 鍵の漏洩が疑われる場合の即座の対応手順の確立

### 鍵の取得とキャッシュ

- **取得タイミング**: Lambda 関数の実行時に Secrets Manager から取得
- **キャッシュ**: メモリ内キャッシュ（パフォーマンス向上）
  - 同一 Lambda インスタンス内で再利用
  - コールドスタート時のみ Secrets Manager にアクセス
- **アクセス制御**: Lambda 実行ロールに最小権限を付与
  - `secretsmanager:GetSecretValue` 権限
  - 特定のシークレット ARN のみアクセス可能

### 鍵のローテーション

- **Signing Secret**: Slack アプリ設定で再生成後、Secrets Manager を手動更新
- **Bot Token**: Slack アプリ設定で再生成後、Secrets Manager を手動更新

### セキュリティ上の考慮事項

1. **鍵の漏洩時の対応**:

   - Signing Secret のみ漏洩: Existence Check（Bot Token が必要）により攻撃をブロック
   - Bot Token のみ漏洩: 署名検証（Signing Secret が必要）により攻撃をブロック
   - 両方漏洩: 即座に両方の鍵をローテーション

2. **鍵の保存場所**:

   - ✅ AWS Secrets Manager（推奨）: 暗号化、アクセス制御、監査ログ
   - ❌ 環境変数: ログに露出する可能性、ローテーションが困難
   - ❌ コード内: バージョン管理に露出、セキュリティリスク

3. **最小権限の原則**:

   - Lambda 実行ロールは必要なシークレットのみアクセス可能
   - クロスアカウント構成では、リソースポリシーでアクセスを制限

4. **ホワイトリスト認可の重要性**:
   - ホワイトリストが設定されている場合: 実在するユーザー ID でも、ホワイトリストに含まれていなければアクセス不可（実在ユーザーを騙る攻撃を防御）
   - ホワイトリストが空（未設定）の場合: すべてのリクエストが許可される（柔軟な設定のため）
   - **推奨**: 本番環境ではホワイトリストを設定し、認可済みのエンティティのみアクセス可能にする

詳細は [認証・認可セキュリティ解説](docs/reference/security/authentication-authorization.md) を参照してください。

## トラブルシューティング

[トラブルシューティングガイド](docs/how-to/troubleshooting.md)を参照。

**よくある問題**:

| 問題                 | 解決策                                           |
| -------------------- | ------------------------------------------------ |
| 署名検証失敗         | Lambda Function URL と Secrets Manager を確認    |
| Existence Check 失敗 | Bot Token の OAuth スコープを確認                |
| ボットが応答しない   | Event Subscriptions とボットのインストールを確認 |
| ファイルがスレッドに表示されない（014） | Verification 用 Bot に **`files:write`** スコープを付与。Slack アプリの OAuth & Permissions で Bot Token Scopes に追加。 |

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

**最終更新日**: 2026-02-09

## 最近の更新

- **2026-02-09**: Strands マイグレーション & クリーンアップ（021）
  - Verification Agent / Execution Agent を `bedrock-agentcore` SDK から FastAPI + uvicorn に移行（直接ルート定義）
  - CloudWatch IAM ネームスペース修正（`StringLike` + `SlackAI-*` パターン）
  - Echo モード設定（CdkConfig に `validationZoneEchoMode` 追加）
  - 依存関係バージョンピニング（`~=`）、E2E テストスイート追加
  - テスト数: Verification 63、Execution 79、CDK 25
- **2026-02-08**: A2A ファイルを Slack スレッドに返す機能を実装（014）
  - Execution Zone が AI 生成ファイル（CSV/JSON/テキスト）を `generated_file` artifact で返却
  - Verification Zone が artifact をパースし、Slack スレッドにテキスト→ファイルの順で投稿（`post_file_to_slack`、Slack SDK files_upload_v2）
  - ファイル制限: 最大 5 MB、許可 MIME は text/csv / application/json / text/plain。超過時はテキストで理由を返す
  - テキストのみ・ファイルのみ・テキスト＋ファイルの各パターンをサポート。Bot に `files:write` スコープが必要
  - 仕様・契約: `specs/014-a2a-file-to-slack/`、`docs/reference/architecture/zone-communication.md` §6.5
- **2026-02-07**: AgentCore A2A ゾーン間通信を実装
  - Amazon Bedrock AgentCore Runtime と A2A プロトコルによるゾーン間通信
  - Verification Agent / Execution Agent のコンテナ化 (ARM64 Docker)
  - SigV4 認証 + リソースベースポリシーによるクロスアカウント対応
  - Agent Card (`/.well-known/agent-card.json`) による Agent Discovery
  - AgentCore A2A を唯一の通信経路として採用
  - TDD テスト 97 件全パス（Python 73 + CDK/Jest 24、以降 167+ に拡大）
- **2025-12-28**: Execution API Gateway にデュアル認証サポート（IAM 認証と API キー認証）を追加
