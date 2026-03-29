# クイックスタートガイド

**目的**: Slack AI App の環境構築からデプロイ、動作確認までの手順を提供する。
**対象読者**: 開発者、DevOps エンジニア
**最終更新日**: 2026-03-29

### このガイドでできること

このガイドを完了すると、以下ができるようになります：

1. **プロジェクトのアーキテクチャを理解する** — [アーキテクチャ概要](./architecture.md) で全体構成（Slack → Verification Agent → Execution Agent → Bedrock）を把握する
2. **開発環境をセットアップする** — リポジトリのクローン、CDK・Python 依存関係、設定ファイル（`cdk.config.dev.json`）の準備
3. **AWS にデプロイする** — 分割スタック（Execution / Verification）のデプロイと Slack Event Subscriptions の設定
4. **Slack からボットを使用する** — メンションによる動作確認と次のステップへのリンク

**目安時間**: 初回は約 30–60 分（前提条件の整備状況により変動）

---

## 目次

1. [前提条件](#前提条件)
2. [セットアップ手順](#セットアップ手順)
3. [Slack App の設定](#slack-app-の設定)
4. [初回デプロイ](#初回デプロイ)
5. [動作確認](#動作確認)
6. [トラブルシューティング](#トラブルシューティング)
7. [次のステップ](#次のステップ)

---

## 前提条件

### 必要なアカウントと権限

- ✅ **AWS アカウント**（管理者権限または CDK デプロイ権限）
- ✅ **Slack ワークスペース**（管理者権限）
- ✅ **Git**（リポジトリのクローン用）

### 必要なツール

- ✅ **Node.js 18.x 以上**（CDK 用）
- ✅ **Python 3.11 以上**（Lambda 関数用）
- ✅ **AWS CLI**（設定済み、認証情報設定済み）
- ✅ **AWS CDK CLI** — リポジトリルートで `npm install` 後は `npx cdk` または `./node_modules/.bin/cdk` で実行可能（グローバル `npm install -g aws-cdk` は任意）
- ✅ **jq**（`./scripts/deploy.sh deploy` が JSON 設定のマージに使用）
- ✅ **Docker**（ARM64 対応、AgentCore コンテナビルド用。macOS の場合は Colima 推奨）

#### Colima で Docker を使う（macOS）

macOS では Docker Desktop の代わりに [Colima](https://github.com/abiosoft/colima) を使うと、CDK の Lambda バンドル・ECR イメージビルドや `npx jest` の Verification Stack テストが安定して動作します。

1. **Colima と Docker CLI のインストール**

   ```bash
   # Homebrew で Colima と Docker CLI をインストール
   brew install colima docker
   ```

2. **Colima の起動**

   ```bash
   colima start
   ```

   起動後、`docker` コマンドは Colima のコンテキストを自動的に使います（`docker context` で `colima` が選択されます）。

3. **デプロイ・テスト前の確認**

   ```bash
   docker context ls   # current が colima であること
   docker info         # Server が表示されれば OK
   ```

   CDK デプロイ（`./scripts/deploy.sh`）や CDK Jest テスト（`cd cdk && npx jest`）実行時は、先に `colima start` しておいてください。Lambda のローカル pip バンドルが失敗した場合に Docker にフォールバックするため、Colima が動いている必要があります。

### AWS サービス要件

以下の AWS サービスへのアクセス権限が必要です：

- Lambda
- DynamoDB
- Secrets Manager
- CloudWatch
- IAM
- Bedrock（使用するモデルへのアクセス権限）
- ECR（AgentCore コンテナイメージ保管）
- Amazon Bedrock AgentCore（A2A 通信）

---

## セットアップ手順

### ステップ 1: リポジトリのクローン

```bash
git clone <repository-url>
cd slack-ai-app
```

以降の `npx cdk`・`./scripts/deploy.sh` は **リポジトリルートで `npm install` を実行したあと** を前提にしています（`node_modules` が無いと失敗します）。

### ステップ 2: 依存関係のインストール

#### CDK 依存関係のインストール（npm workspaces）

プロジェクトルートで実行すると、すべてのゾーン CDK と共有ツールが一括でインストールされます：

```bash
# プロジェクトルートから（推奨）
npm install
```

個別ゾーンのみインストールする場合：

```bash
cd execution-zones/file-creator-agent/cdk && npm install
```

#### Python 依存関係のインストール（開発用）

```bash
# SlackEventHandler Lambda の依存関係
cd verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler
pip install -r requirements.txt
```

（Execution / Verification Agent はコンテナベースのため、CDK デプロイ時に ECR からビルド・プッシュされます。）

### ステップ 3: 設定ファイルの作成

プロジェクトはゾーンごとに独立した CDK 設定ファイルを使用します。`cdk.config.dev.json` / `cdk.config.prod.json` は `.gitignore` 対象のため、リポジトリには含まれません。各 CDK アプリの **`cdk.config.json.example`** をコピーしてから編集してください（キー名はゾーンごとに異なります）。

**実行ゾーン**（各ディレクトリで `cdk.config.dev.json` を作成）:

```bash
# 同一アカウントで検証ゾーンとデプロイする場合、verification / execution（または zone 専用）の各 ID は同じ 12 桁でよい
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

cp execution-zones/file-creator-agent/cdk/cdk.config.json.example \
   execution-zones/file-creator-agent/cdk/cdk.config.dev.json
cp execution-zones/docs-agent/cdk/cdk.config.json.example \
   execution-zones/docs-agent/cdk/cdk.config.dev.json
cp execution-zones/time-agent/cdk/cdk.config.json.example \
   execution-zones/time-agent/cdk/cdk.config.dev.json
cp execution-zones/fetch-url-agent/cdk/cdk.config.json.example \
   execution-zones/fetch-url-agent/cdk/cdk.config.dev.json
cp verification-zones/slack-search-agent/cdk/cdk.config.json.example \
   verification-zones/slack-search-agent/cdk/cdk.config.dev.json

# 上記ファイル内の 000000000000 を ACCOUNT_ID に置換（エディタまたは sed 等で）
```

**File Creator Agent**（`execution-zones/file-creator-agent/cdk/cdk.config.dev.json`）のフィールド例:

```json
{
  "awsRegion": "ap-northeast-1",
  "bedrockModelId": "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "deploymentEnv": "dev",
  "fileCreatorStackName": "SlackAI-FileCreator",
  "verificationAccountId": "123456789012",
  "fileCreatorAccountId": "123456789012"
}
```

**Docs / Time Agent**（`docsExecutionStackName` + `executionAccountId`、`timeExecutionStackName` + `executionAccountId`）、**Web Fetch Agent**（`webFetchStackName` + `webFetchAccountId`）、**Slack Search Agent**（`slackSearchStackName` + `slackSearchAccountId`）は、それぞれ同ディレクトリの `cdk.config.json.example` と `cdk/lib/types/cdk-config.ts` の必須フィールドと一致させてください。

**検証ゾーン**（`verification-zones/verification-agent/cdk/cdk.config.dev.json` を設定ファイル例からコピーして編集）:

```bash
cp verification-zones/verification-agent/cdk/cdk.config.json.example \
   verification-zones/verification-agent/cdk/cdk.config.dev.json
```

`slackBotToken` と `slackSigningSecret` は **後述の [Slack App の設定](#slack-app-の設定)** でアプリ作成・インストール後に取得してから記入してください。トークンが未設定のまま `./scripts/deploy.sh deploy` を実行すると失敗します。

```json
{
  "awsRegion": "ap-northeast-1",
  "deploymentEnv": "dev",
  "verificationStackName": "SlackAI-Verification",
  "verificationAccountId": "YOUR_AWS_ACCOUNT_ID",
  "executionAccountId": "YOUR_AWS_ACCOUNT_ID",
  "slackBotToken": "xoxb-your-bot-token",
  "slackSigningSecret": "your-signing-secret"
}
```

**重要**:

- 設定ファイルには機密情報が含まれるため、Git にコミットしないでください（`.gitignore` に含まれています）
- 環境変数（`SLACK_BOT_TOKEN`、`SLACK_SIGNING_SECRET`）として設定することも可能ですが、設定ファイルの方が管理しやすくなります

### ステップ 4: CDK ブートストラップ（初回のみ）

初めて CDK を使用する AWS アカウント/リージョンの場合（**ステップ 2** の `npm install` 済みであること）：

```bash
# プロジェクトルートで（グローバルに cdk が無くても npx で可）
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

例：

```bash
npx cdk bootstrap aws://123456789012/ap-northeast-1
```

### ステップ 5: デプロイ前チェック（Docker 必須）

Execution / Verification / Slack Search の CDK は **AgentCore 用コンテナイメージ**を Docker でビルドします（`DockerImageAsset`、プラットフォーム **linux/arm64**）。Docker デーモンに接続できない状態で `cdk deploy` すると、`Cannot connect to the Docker daemon`、`failed to find image`、`no basic auth credentials`、または日本語の **コンテナが見つかりません** に近いメッセージでビルドが止まります。

デプロイまたは `cd cdk && npx cdk synth` の直前に必ず次を確認してください。

```bash
# 1. Docker が応答するか（エラーなら Colima / Docker Desktop を起動）
docker info

# 2. このリポジトリのビルドは ARM64 前提。動作確認（失敗時は Colima の arch や Docker Desktop の Rosetta/QEMU 設定を確認）
docker run --rm --platform linux/arm64 alpine echo ok
```

macOS + Colima の場合は **`colima start`** 済みで、`docker context ls` の `current` が `colima` であることを確認してください。CI や Docker のない環境では synth が失敗するため、ローカルまたは Docker 利用可能なランナーでデプロイしてください。

---

## Slack App の設定

### ステップ 1: Slack App の作成

1. [Slack API サイト](https://api.slack.com/apps) にアクセス
2. 「Create New App」をクリック
3. 「From scratch」を選択
4. App 名とワークスペースを選択して作成

### ステップ 2: Bot Token の取得

1. 左メニューから「OAuth & Permissions」を選択
2. 「Scopes」セクションで以下の Bot Token Scopes を追加：

   **必須スコープ**:

   - `app_mentions:read` - メンションを読み取る
   - `channels:history` - チャンネルのメッセージ履歴を読み取る
   - `channels:read` - チャンネル情報を読み取る（Existence Check 用）
   - `chat:write` - メッセージを送信する
   - `files:read` - ファイルを読み取る（添付ファイル処理用）
   - `reactions:write` - リアクションを追加/削除する（受付時 👀、返信成功時に 👀→✅ に差し替え）
   - `team:read` - チーム情報を読み取る（Existence Check 用）
   - `users:read` - ユーザー情報を読み取る（Existence Check 用）

   **オプションスコープ**（DM・プライベートチャンネル対応時に追加）:

   - `groups:history` - プライベートチャンネルの履歴を読み取る
   - `groups:read` - プライベートチャンネル情報を読み取る
   - `im:history` - ダイレクトメッセージの履歴を読み取る
   - `im:read` - ダイレクトメッセージ情報を読み取る
   - `mpim:history` - グループ DM の履歴を読み取る
   - `mpim:read` - グループ DM 情報を読み取る

3. 「Install to Workspace」をクリックしてワークスペースにインストール
4. **Bot User OAuth Token**（`xoxb-...`）をコピーして環境変数に設定

### ステップ 3: Signing Secret の取得

1. 左メニューから「Basic Information」を選択
2. 「App Credentials」セクションの「Signing Secret」を表示
3. **Signing Secret** をコピーして環境変数に設定

### ステップ 4: Event Subscriptions の設定（デプロイ後）

**注意**: このステップは CDK デプロイ完了後に行います。

1. 左メニューから「Event Subscriptions」を選択
2. 「Enable Events」を ON にする
3. 「Request URL」に CDK デプロイ時に出力される Function URL を入力
   - 例: `https://xxxxxxxxxx.lambda-url.ap-northeast-1.on.aws/`
4. Slack が URL を検証（`url_verification` イベント）
5. 「Subscribe to bot events」で以下のイベントを追加：
   - `app_mentions` - ボットへのメンション
   - `message.channels` - チャンネルメッセージ（オプション）
   - `message.groups` - プライベートチャンネルメッセージ（オプション）
   - `message.im` - ダイレクトメッセージ（オプション）

詳細は [Slack 側設定作業ガイド](./runbook.md) を参照してください。

---

## 初回デプロイ

セットアップ手順の「ステップ 5: デプロイ前チェック（Docker 必須）」を済ませてから続行してください。

### ステップ 1: CDK スタックのデプロイ

このプロジェクトは **6 つの独立した CDK アプリ**（実行ゾーン 5 + 検証ゾーン 1: File Creator、Docs、Time、Slack Search、Web Fetch、Verification）を使用します。統合スクリプト `scripts/deploy.sh` の実際の順序は **File Creator → Docs → Time → Slack Search → Web Fetch → Verification** です（`scripts/deploy.sh` の Phase 1〜6 に対応）。

#### 方法 1: デプロイスクリプトを使用（推奨）

```bash
# プロジェクトルートから
# デプロイ環境を設定（dev または prod）
export DEPLOYMENT_ENV=dev  # 本番環境の場合は 'prod' を使用

# AWS プロファイルを使用する場合（オプション）
export AWS_PROFILE=your-profile-name

# 全ゾーンをデプロイ（実行ゾーン → 検証ゾーンの順）
DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy

# デプロイ後の状態確認
DEPLOYMENT_ENV=dev ./scripts/deploy.sh status

# ログの確認
DEPLOYMENT_ENV=dev ./scripts/deploy.sh logs --latest

# 特定ゾーンのみ（Docker イメージ強制再ビルド付き）
./execution-zones/file-creator-agent/scripts/deploy.sh --force-rebuild
./execution-zones/fetch-url-agent/scripts/deploy.sh --force-rebuild
```

**注意**: 各ゾーンのデプロイスクリプトはゾーン固有の `cdk.config.{env}.json` から設定を自動的に読み込みます。

**デプロイ順序**（`DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy` が自動で実行する順。手動で行う場合も同じ順が安全）:

1. File Creator → Docs → Time → Slack Search → Web Fetch の各スタックをデプロイし、Runtime ARN を取得（スクリプトが `verification-zones/verification-agent/cdk/cdk.config.{env}.json` の `executionAgentArns` 等を更新）
2. 検証ゾーン（Verification）をデプロイ

初回デプロイ前に `executionAgentArns` を手で埋める必要はありません（デプロイ後にスクリプトが反映します）。手動 `npx cdk deploy` だけ使う場合は、各実行スタックの出力 ARN を `cdk.config.dev.json` に記入してから Verification をデプロイしてください。

#### 方法 2: 手動デプロイ

```bash
# 1. 実行ゾーンを scripts/deploy.sh と同じ順でデプロイ
export DEPLOYMENT_ENV=dev

cd execution-zones/file-creator-agent/cdk
npx cdk deploy SlackAI-FileCreator-Dev --require-approval never

cd ../../docs-agent/cdk
npx cdk deploy SlackAI-DocsExecution-Dev --require-approval never

cd ../../time-agent/cdk
npx cdk deploy SlackAI-TimeExecution-Dev --require-approval never

cd ../../../verification-zones/slack-search-agent/cdk
npx cdk deploy SlackAI-SlackSearch-Dev --require-approval never

cd ../../../execution-zones/fetch-url-agent/cdk
npx cdk deploy SlackAI-WebFetch-Dev --require-approval never

# 2. 各スタックの Runtime ARN を verification 側設定へ反映
# verification-zones/verification-agent/cdk/cdk.config.dev.json
# executionAgentArns と slackSearchAgentArn を設定

# 3. 検証ゾーンをデプロイ
cd ../../../verification-zones/verification-agent/cdk
npx cdk deploy SlackAI-Verification-Dev --require-approval never
```

**重要**:

- スタック名には環境サフィックス（`-Dev` または `-Prod`）が自動的に追加されます
- `DEPLOYMENT_ENV` 環境変数を設定することで、正しい環境のスタックがデプロイされます
- `cdk.config.{env}.json` ファイルに値を設定することで、`--context` オプションの代わりに使用できます

デプロイ中に以下のリソースが作成されます：

**Execution Stacks**（A2A のみ）:

- File Creator Agent（`SlackAI-FileCreator-{Env}`）
- Time Agent（`SlackAI-TimeExecution-{Env}`）
- Docs Agent（`SlackAI-DocsExecution-{Env}`）
- Web Fetch Agent（`SlackAI-WebFetch-{Env}`）
- CloudWatch ログ・メトリクス

**Slack Search Agent Stack**（Verification Zone に配置）:

- Slack Search Agent（`SlackAI-SlackSearch-{Env}`）
- AgentCore Runtime + ECR

**VerificationStack**:

- Lambda 関数（SlackEventHandler）
- DynamoDB テーブル（Token Storage, Event Dedupe, Existence Check Cache, Whitelist Config, Rate Limit, Usage History — 計 6 テーブル）
- S3 バケット（usage-history、usage-history-archive）
- Verification Agent（AgentCore Runtime + ECR）
- Secrets Manager シークレット（Slack Signing Secret, Bot Token）
- CloudWatch アラームとメトリクス
- IAM ロールとポリシー

### ステップ 2: デプロイ出力の確認

デプロイ完了後、以下の出力が表示されます：

**VerificationStack の出力**:

```
SlackAI-Verification-Dev.SlackEventHandlerUrl = https://xxxxxxxxxx.lambda-url.ap-northeast-1.on.aws/
SlackAI-Verification-Dev.VerificationAgentRuntimeArn = arn:aws:bedrock-agentcore:...
SlackAI-Verification-Dev.VerificationLambdaRoleArn = arn:aws:iam::123456789012:role/...
```

**Execution Stacks の出力**:

```
SlackAI-FileCreator-Dev.FileCreatorAgentRuntimeArn = arn:aws:bedrock-agentcore:...
SlackAI-TimeExecution-Dev.TimeAgentRuntimeArn = arn:aws:bedrock-agentcore:...
SlackAI-DocsExecution-Dev.DocsAgentRuntimeArn = arn:aws:bedrock-agentcore:...
SlackAI-WebFetch-Dev.WebFetchAgentRuntimeArn = arn:aws:bedrock-agentcore:...
SlackAI-SlackSearch-Dev.SlackSearchAgentRuntimeArn = arn:aws:bedrock-agentcore:...
```

（クロスアカウント時は各実行ゾーンで Runtime/Endpoint の追加出力が作成されます。詳細は [VALIDATION.md §5.1](../specs/015-agentcore-a2a-migration/VALIDATION.md#51-agentcore-とアカウント間通信のベストプラクティスaws-mcp-準拠) を参照。）

**重要**: `SlackEventHandlerUrl` をコピーして、Slack App の Event Subscriptions に設定してください。

### ステップ 3: ホワイトリストの設定（必須）

**重要**: ホワイトリスト認可機能は有効化されており、ホワイトリストが設定されていない場合、**すべてのリクエストが 403 Forbidden で拒否されます**（fail-closed 原則）。

本番環境でシステムを動作させるには、**必ずホワイトリストを設定してください**。以下のいずれかの方法で認可済みエンティティを設定します。

#### 方法 1: DynamoDB（推奨）

```bash
# 開発環境の場合
# team_id の追加
aws dynamodb put-item \
  --table-name SlackAI-Verification-Dev-whitelist-config \
  --item '{
    "entity_type": {"S": "team_id"},
    "entity_id": {"S": "T01234567"}
  }'

# user_id の追加
aws dynamodb put-item \
  --table-name SlackAI-Verification-Dev-whitelist-config \
  --item '{
    "entity_type": {"S": "user_id"},
    "entity_id": {"S": "U01234567"}
  }'

# channel_id の追加
aws dynamodb put-item \
  --table-name SlackAI-Verification-Dev-whitelist-config \
  --item '{
    "entity_type": {"S": "channel_id"},
    "entity_id": {"S": "C01234567"}
  }'

# 本番環境の場合（テーブル名に -Prod が含まれます）
aws dynamodb put-item \
  --table-name SlackAI-Verification-Prod-whitelist-config \
  --item '{
    "entity_type": {"S": "team_id"},
    "entity_id": {"S": "T01234567"}
  }'
```

**注意**: DynamoDB テーブル名は`{StackName}-whitelist-config`の形式で、スタック名には環境サフィックス（`-Dev`または`-Prod`）が含まれます。

#### 方法 2: Secrets Manager

```bash
# 開発環境の場合
aws secretsmanager create-secret \
  --name SlackAI-Verification-Dev/slack/whitelist-config \
  --secret-string '{
    "team_ids": ["T01234567"],
    "user_ids": ["U01234567"],
    "channel_ids": ["C01234567"]
  }'

# 本番環境の場合
aws secretsmanager create-secret \
  --name SlackAI-Verification-Prod/slack/whitelist-config \
  --secret-string '{
    "team_ids": ["T01234567"],
    "user_ids": ["U01234567"],
    "channel_ids": ["C01234567"]
  }'
```

**注意**: Secrets Manager の名前は`{StackName}/slack/whitelist-config`の形式で、スタック名には環境サフィックス（`-Dev`または`-Prod`）が含まれます。

#### 方法 3: 環境変数（開発環境のみ）

CDK スタックの環境変数として設定（再デプロイが必要）。

**注意事項**:

- **ホワイトリスト未設定時**: すべてのリクエストが 403 Forbidden で拒否されます
- **AND 条件**: `team_id`、`user_id`、`channel_id` の**すべて**がホワイトリストに含まれている必要があります
- **エンティティ未指定**: `team_id`、`user_id`、`channel_id` のいずれかが `None` または空文字列の場合、そのエンティティは未認可として扱われ、リクエストは拒否されます
- **キャッシュ**: ホワイトリスト設定は 5 分間キャッシュされます。更新後、反映まで最大 5 分かかる場合があります

詳細は [ホワイトリスト認可のクイックスタート](../specs/007-whitelist-auth/quickstart.md) を参照してください。

---

## 動作確認

### ステップ 1: Slack でのテスト

1. Slack ワークスペースでボットにメンション：

   ```
   @your-bot-name こんにちは
   ```

2. ボットが即座に「処理中です...」と応答することを確認（3 秒以内）

3. Bedrock の処理完了後にスレッド内に AI レスポンスが表示されることを確認（処理時間はモデル、入力長、負荷状況に依存）

### ステップ 2: CloudWatch ログの確認

```bash
# SlackEventHandler のログを確認
aws logs tail /aws/lambda/SlackAI-Verification-SlackEventHandler-XXXXX --follow

# Verification Agent / Execution Agent は AgentCore のロググループ（/aws/bedrock-agentcore/...）で確認
```

### ステップ 3: メトリクスの確認

AWS コンソールで CloudWatch メトリクスを確認：

- `SlackEventHandler` 名前空間
  - `SignatureVerificationSuccess` / `SignatureVerificationFailed`
  - `ExistenceCheckSuccess` / `ExistenceCheckFailed`
  - `WhitelistAuthorizationSuccess` / `WhitelistAuthorizationFailed`
- `bedrock-agentcore` 名前空間（Execution Agent 等）
  - AgentCore ランタイムのメトリクス

---

## トラブルシューティング

### 問題 1: CDK デプロイが失敗する

**原因**: 環境変数が設定されていない、権限不足、**Docker 未起動**、または `cdk.config.{env}.json` 未作成

**解決策**:

```bash
# 環境変数を確認
echo $SLACK_SIGNING_SECRET
echo $SLACK_BOT_TOKEN

# AWS 認証情報を確認
aws sts get-caller-identity

# CDK ブートストラップを確認
cdk bootstrap --show-template

# Docker（コンテナイメージビルドに必須）
docker info
```

### 問題 1b: Docker / コンテナ関連のエラー（デプロイや synth の途中で失敗）

**症状**: `Cannot connect to the Docker daemon`、`error during connect`、`failed to solve`、`no matching manifest for linux/arm64`、`コンテナ` や `image` が見つからないといったメッセージ。

**解決策**:

1. **Docker を起動**する（macOS: `colima start` または Docker Desktop）。
2. `docker context ls` で意図したコンテキスト（例: `colima`）が `current` か確認する。
3. `docker run --rm --platform linux/arm64 alpine echo ok` が成功するか確認する（ARM64 ビルドの前提）。
4. 企業プロキシ環境では Docker のプロキシ設定が必要な場合がある。
5. 設定ファイルが無いゾーンがないか確認する（各 `cdk/cdk.config.json.example` を `cdk.config.dev.json` にコピー済みか）。
6. synth / deploy の先頭ログが **別ゾーンのアプリ**（例: File Creator なのに `Verification Zone CDK app starting`）になっている場合、`node_modules/.bin/cdk` が誤ったパッケージを指している可能性があります。リポジトリルートで `npm install` をやり直し、まだ直らなければ `rm -f node_modules/.bin/cdk && npm install` で **aws-cdk** の CLI に向け直してください。
7. **`Agent Dockerfile not found`** かつ `ls execution-zones/file-creator-agent/src/Dockerfile` でファイルが無い場合、**古いコミットのクローン**か、グローバル gitignore で `Dockerfile` が除外されている可能性があります。`git pull` で最新にし、`git ls-files execution-zones/file-creator-agent/src/Dockerfile` でリポジトリに含まれることを確認してください。手元だけ欠けている場合は `git checkout -- execution-zones/*/src/Dockerfile verification-zones/*/src/Dockerfile` で復元できます。

詳細は [トラブルシューティング](./troubleshooting.md) の Docker / ECR 節も参照してください。

### 問題 2: Slack からのリクエストが 403 で拒否される

**原因**: 署名検証失敗、Existence Check 失敗、またはホワイトリスト認可失敗

**解決策**:

1. CloudWatch ログでエラー詳細を確認
2. Signing Secret が正しく設定されているか確認
3. Bot Token が有効か確認（Slack API で確認）
4. ホワイトリストが設定されているか確認（使用している場合）

```bash
# ログでエラーを検索
aws logs filter-log-events \
  --log-group-name /aws/lambda/SlackAI-Verification-SlackEventHandler-XXXXX \
  --filter-pattern "ERROR"
```

### 問題 3: AI レスポンスが返ってこない

**原因**: Bedrock アクセス権限不足、モデル ID が無効、またはネットワークエラー

**解決策**:

1. Bedrock モデルへのアクセス権限を確認
2. モデル ID が正しいか確認（`amazon.nova-pro-v1:0` など）
3. Execution Agent（AgentCore）のログを確認（`/aws/bedrock-agentcore/` のロググループ）

```bash
# Bedrock モデルリストを確認
aws bedrock list-foundation-models --region ap-northeast-1
```

### 問題 4: すべてのリクエストが 403 で拒否される（ホワイトリスト関連）

**原因**: ホワイトリストが未設定、空、または設定が読み込めない

**解決策**:

1. **ホワイトリストが設定されているか確認**:

   ```bash
   # DynamoDB テーブルの内容を確認（環境サフィックス付き）
   # 開発環境の場合
   aws dynamodb scan --table-name SlackAI-Verification-Dev-whitelist-config

   # 本番環境の場合
   aws dynamodb scan --table-name SlackAI-Verification-Prod-whitelist-config

   # または Secrets Manager のシークレットを確認（環境サフィックス付き）
   # 開発環境の場合
   aws secretsmanager get-secret-value \
     --secret-id SlackAI-Verification-Dev/slack/whitelist-config

   # 本番環境の場合
   aws secretsmanager get-secret-value \
     --secret-id SlackAI-Verification-Prod/slack/whitelist-config
   ```

2. **すべてのエンティティタイプが設定されているか確認**:

   - `team_id`、`user_id`、`channel_id` のすべてが設定されている必要があります（AND 条件）
   - いずれかが未設定の場合、リクエストは拒否されます

3. **Lambda 実行ロールに DynamoDB 読み取り権限があるか確認**:

   ```bash
   aws iam get-role-policy \
     --role-name SlackAI-Verification-SlackEventHandler-XXXXX \
     --policy-name <policy-name>
   ```

4. **環境変数が正しく設定されているか確認**:

   - `WHITELIST_TABLE_NAME` が設定されているか（DynamoDB を使用する場合）
   - `WHITELIST_SECRET_NAME` が設定されているか（Secrets Manager を使用する場合）

5. **CloudWatch ログでエラー詳細を確認**:
   ```bash
   aws logs filter-log-events \
     --log-group-name /aws/lambda/SlackAI-Verification-SlackEventHandler-XXXXX \
     --filter-pattern "whitelist"
   ```

### 問題 5: タイムアウトエラー

**原因**: Lambda 関数のタイムアウト設定が短すぎる、または Bedrock / AgentCore の処理が遅い

**解決策**:

1. Lambda 関数のタイムアウト設定を確認（SlackEventHandler: 10 秒）
2. Bedrock モデルのレイテンシを確認
3. CloudWatch メトリクスでパフォーマンスを確認

---

## レスポンス配信（A2A）

このシステムは、実行ゾーン（Execution Zone）から検証ゾーン（Verification Zone）へのレスポンスを **AgentCore A2A** で配信します（非同期タスクのポーリング）。SQS は使用しません。クロスアカウントの場合は Execution Agent の Runtime と Endpoint の両方にリソースポリシーを設定してください。詳細は [クロスアカウント](./architecture.md) と [VALIDATION.md §5.1](../specs/015-agentcore-a2a-migration/VALIDATION.md#51-agentcore-とアカウント間通信のベストプラクティスaws-mcp-準拠) を参照してください。

## 次のステップ

### 基本機能の確認

- ✅ [機能要件](./requirements.md) - 実装済み機能の確認
- ✅ [アーキテクチャ概要](./architecture.md) - システム全体像の理解
- ✅ [ユーザー体験](./architecture.md) - エンドユーザーフローの確認

### セキュリティ設定

- ✅ [セキュリティ要件](./security.md) - セキュリティ要件の確認
- ✅ [認証・認可セキュリティ解説](./security.md) - Two-Key Defense の理解
- ✅ [ホワイトリスト認可の設定](../specs/007-whitelist-auth/quickstart.md) - アクセス制御の設定

### 運用とモニタリング

- ✅ [モニタリング & インシデントレスポンス](./runbook.md) - CloudWatch ダッシュボードの設定
- ✅ [テストと検証](./testing.md) - テストシナリオの実行
- ✅ [Slack 側設定作業ガイド](./runbook.md) - 詳細な設定手順

### カスタマイズ

- ✅ [アーキテクチャ詳細](./architecture.md) - Lambda 関数のカスタマイズ
- ✅ [実装ロードマップ](./requirements.md) - 追加機能の実装
- ✅ [ADR インデックス](./adr/README.md) - 技術選択の理由とカスタマイズ指針

---

## よくある質問（FAQ）

### Q: どの Bedrock モデルを使用できますか？

A: AWS Bedrock で利用可能なすべての Foundation Model を使用できます。デフォルトは `jp.anthropic.claude-haiku-4-5-20251001-v1:0` です。環境変数 `BEDROCK_MODEL_ID` で変更可能です。

### Q: ホワイトリスト認可は必須ですか？

A: **はい、必須です**。ホワイトリスト認可機能は常に有効化されており、ホワイトリストが設定されていない場合、**すべてのリクエストが 403 Forbidden で拒否されます**（fail-closed 原則）。

本番環境でシステムを動作させるには、必ずホワイトリストを設定してください。`team_id`、`user_id`、`channel_id` のすべてがホワイトリストに含まれている必要があります（AND 条件）。

### Q: コストはどのくらいかかりますか？

A: 主なコスト要因：

- Lambda 実行時間（従量課金）
- Bedrock モデル使用量（モデルごとに異なる）
- DynamoDB 読み書き（従量課金）
- AgentCore ランタイム（コンテナ実行）

詳細は AWS の料金ページを参照してください。

### Q: 複数の Slack ワークスペースに対応できますか？

A: はい、対応できます。各ワークスペースの `team_id` ごとに Bot Token を DynamoDB に保存し、リクエスト時に動的に取得します。

### Q: エラーハンドリングはどうなっていますか？

A: すべてのエラーは CloudWatch Logs に記録され、ユーザーには分かりやすいエラーメッセージが表示されます。セキュリティエラー（認証・認可失敗）は 403 を返し、処理エラーは 500 を返します。

---

## サポート

問題が解決しない場合：

1. [トラブルシューティング](#トラブルシューティング) セクションを確認
2. CloudWatch ログでエラー詳細を確認
3. [GitHub Issues](https://github.com/your-repo/issues) で既存の Issue を検索
4. 新しい Issue を作成（ログとエラーメッセージを含める）
