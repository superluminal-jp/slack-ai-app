# クイックスタートガイド

**目的**: Slack AI App の環境構築からデプロイ、動作確認までの手順を提供する。
**対象読者**: 開発者、DevOps エンジニア
**最終更新日**: 2026-02-14

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
- ✅ **AWS CDK CLI**（`npm install -g aws-cdk`）
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

### ステップ 2: 依存関係のインストール

#### CDK 依存関係のインストール（npm workspaces）

プロジェクトルートで実行すると、すべてのゾーン CDK と共有ツールが一括でインストールされます：

```bash
# プロジェクトルートから（推奨）
npm install
```

個別ゾーンのみインストールする場合：

```bash
cd execution-zones/execution-agent/cdk && npm install
```

#### Python 依存関係のインストール（開発用）

```bash
# SlackEventHandler Lambda の依存関係
cd verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler
pip install -r requirements.txt
```

（Execution / Verification Agent はコンテナベースのため、CDK デプロイ時に ECR からビルド・プッシュされます。）

### ステップ 3: 設定ファイルの作成

プロジェクトはゾーンごとに独立した CDK 設定ファイルを使用します。各ゾーンの設定ファイルに AWS アカウント ID と Slack 認証情報を設定してください：

**実行ゾーン**（`execution-zones/*/cdk/cdk.config.dev.json` を編集）:

```json
{
  "awsRegion": "ap-northeast-1",
  "bedrockModelId": "jp.anthropic.claude-haiku-4-5-20251001-v1:0",
  "deploymentEnv": "dev",
  "executionStackName": "SlackAI-Execution",
  "verificationAccountId": "YOUR_AWS_ACCOUNT_ID",
  "executionAccountId": "YOUR_AWS_ACCOUNT_ID"
}
```

**検証ゾーン**（`verification-zones/verification-agent/cdk/cdk.config.dev.json` を設定ファイル例からコピーして編集）:

```bash
cp verification-zones/verification-agent/cdk/cdk.config.json.example \
   verification-zones/verification-agent/cdk/cdk.config.dev.json
```

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

初めて CDK を使用する AWS アカウント/リージョンの場合：

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

例：

```bash
cdk bootstrap aws://123456789012/ap-northeast-1
```

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

### ステップ 1: CDK スタックのデプロイ

このプロジェクトは 2 つの独立したスタック（VerificationStack と ExecutionStack）を使用します。3 段階のデプロイプロセスが必要です。

#### 方法 1: デプロイスクリプトを使用（推奨）

```bash
# プロジェクトルートから
# デプロイ環境を設定（dev または prod）
export DEPLOYMENT_ENV=dev  # 本番環境の場合は 'prod' を使用

# AWS プロファイルを使用する場合（オプション）
export AWS_PROFILE=your-profile-name

# 全ゾーンをデプロイ（実行ゾーン → 検証ゾーンの順）
./scripts/deploy/deploy-all.sh

# 実行ゾーンのみ
./scripts/deploy/deploy-execution-all.sh

# 検証ゾーンのみ
./scripts/deploy/deploy-verification-all.sh

# 特定ゾーンのみ（Docker イメージ強制再ビルド付き）
./execution-zones/execution-agent/scripts/deploy.sh --force-rebuild
```

**注意**: 各ゾーンのデプロイスクリプトはゾーン固有の `cdk.config.{env}.json` から設定を自動的に読み込みます。

**デプロイ順序**:

1. 実行ゾーン（execution-agent → time-agent → docs-agent）をデプロイし、出力された AgentCore Runtime ARN をメモ
2. 検証ゾーンの `cdk.config.dev.json` の `executionAgentArns` に実行ゾーンの ARN を設定
3. 検証ゾーンをデプロイ

#### 方法 2: 手動デプロイ

```bash
# 1. 実行ゾーンをデプロイ
cd execution-zones/execution-agent/cdk
export DEPLOYMENT_ENV=dev
npx cdk deploy SlackAI-Execution-Dev --require-approval never

# 出力から ExecutionAgentRuntimeArn を取得し、
# verification-zones/verification-agent/cdk/cdk.config.dev.json の
# executionAgentArns.file-creator に設定

# 同様に time-agent, docs-agent もデプロイ

# 2. 検証ゾーンをデプロイ（executionAgentArns 設定済みの状態で）
cd verification-zones/verification-agent/cdk
npx cdk deploy SlackAI-Verification-Dev \
  --profile YOUR_PROFILE \
  --require-approval never
```

**重要**:

- スタック名には環境サフィックス（`-Dev` または `-Prod`）が自動的に追加されます
- `DEPLOYMENT_ENV` 環境変数を設定することで、正しい環境のスタックがデプロイされます
- `cdk.config.{env}.json` ファイルに値を設定することで、`--context` オプションの代わりに使用できます

デプロイ中に以下のリソースが作成されます：

**ExecutionStack**（A2A のみ）:

- Execution Agent（AgentCore Runtime + ECR）
- CloudWatch ログ・メトリクス

**VerificationStack**:

- Lambda 関数（SlackEventHandler）
- DynamoDB テーブル（Token Storage, Event Dedupe, Existence Check Cache, Whitelist Config, Rate Limit）
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

**ExecutionStack の出力**:

```
SlackAI-Execution-Dev.ExecutionAgentRuntimeArn = arn:aws:bedrock-agentcore:...
```

（クロスアカウント時は `ExecutionEndpointArn` も出力されます。Runtime と Endpoint の両方にリソースポリシー設定が必要です。詳細は [VALIDATION.md §5.1](../specs/015-agentcore-a2a-migration/VALIDATION.md#51-agentcore-とアカウント間通信のベストプラクティスaws-mcp-準拠) を参照。）

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

**原因**: 環境変数が設定されていない、または権限不足

**解決策**:

```bash
# 環境変数を確認
echo $SLACK_SIGNING_SECRET
echo $SLACK_BOT_TOKEN

# AWS 認証情報を確認
aws sts get-caller-identity

# CDK ブートストラップを確認
cdk bootstrap --show-template
```

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
