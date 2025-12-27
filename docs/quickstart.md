# クイックスタートガイド

> 🚀 **Slack to AWS Bedrock AI 統合システムを 5 分で始める**

**ドキュメントタイプ**: セットアップガイド  
**ステータス**: 推奨  
**バージョン**: 1.0  
**最終更新日**: 2025-12-27  
**対象読者**: 開発者、DevOps エンジニア、システム管理者

---

## 📋 目次

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

### AWS サービス要件

以下の AWS サービスへのアクセス権限が必要です：

- Lambda
- API Gateway
- DynamoDB
- Secrets Manager
- CloudWatch
- IAM
- Bedrock（使用するモデルへのアクセス権限）

---

## セットアップ手順

### ステップ 1: リポジトリのクローン

```bash
git clone <repository-url>
cd slack-ai-app
```

### ステップ 2: 依存関係のインストール

#### CDK 依存関係のインストール

```bash
cd cdk
npm install
```

#### Python 依存関係のインストール（開発用）

```bash
# Lambda 関数の依存関係
cd lambda/verification-stack/slack-event-handler
pip install -r requirements.txt

cd ../../execution-stack/bedrock-processor
pip install -r requirements.txt
```

### ステップ 3: 環境変数の設定

プロジェクトルートに `.env` ファイルを作成（または環境変数を設定）：

```bash
# Slack 認証情報（必須）
export SLACK_SIGNING_SECRET="your-slack-signing-secret"
export SLACK_BOT_TOKEN="xoxb-your-bot-token"

# AWS 設定（オプション、AWS CLI の設定を使用する場合は不要）
export AWS_REGION="ap-northeast-1"
export AWS_ACCOUNT_ID="your-account-id"

# Bedrock モデル設定（オプション、デフォルト: amazon.nova-pro-v1:0）
export BEDROCK_MODEL_ID="amazon.nova-pro-v1:0"
```

**重要**: `.env` ファイルは Git にコミットしないでください（`.gitignore` に含まれています）。

### ステップ 4: CDK ブートストラップ（初回のみ）

初めて CDK を使用する AWS アカウント/リージョンの場合：

```bash
cd cdk
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

詳細は [Slack 側設定作業ガイド](./reference/operations/slack-setup.md) を参照してください。

---

## 初回デプロイ

### ステップ 1: CDK スタックのデプロイ

このプロジェクトは 2 つの独立したスタック（VerificationStack と ExecutionStack）を使用します。3段階のデプロイプロセスが必要です。

#### 方法 1: デプロイスクリプトを使用（推奨）

```bash
# プロジェクトルートから
cd scripts
chmod +x deploy-split-stacks.sh
./deploy-split-stacks.sh
```

#### 方法 2: 手動デプロイ

```bash
cd cdk

# .env ファイルから環境変数を読み込む
set -a && source ../.env && set +a

# 1. Execution Stack をデプロイ
npx cdk deploy SlackAI-Execution \
  --context deploymentMode=split \
  --profile YOUR_PROFILE \
  --require-approval never

# 出力から ExecutionApiUrl を取得

# 2. Verification Stack をデプロイ
npx cdk deploy SlackAI-Verification \
  --context deploymentMode=split \
  --context executionApiUrl=<ExecutionApiUrl from step 1> \
  --profile YOUR_PROFILE \
  --require-approval never

# 出力から VerificationLambdaRoleArn を取得

# 3. Execution Stack を更新（リソースポリシー追加）
npx cdk deploy SlackAI-Execution \
  --context deploymentMode=split \
  --context verificationLambdaRoleArn=<VerificationLambdaRoleArn from step 2> \
  --context verificationAccountId=YOUR_AWS_ACCOUNT_ID \
  --profile YOUR_PROFILE \
  --require-approval never
```

デプロイ中に以下のリソースが作成されます：

**ExecutionStack**:
- Lambda 関数（BedrockProcessor）
- API Gateway（Execution API）
- CloudWatch アラームとメトリクス

**VerificationStack**:
- Lambda 関数（SlackEventHandler）
- DynamoDB テーブル（Token Storage, Event Dedupe, Existence Check Cache, Whitelist Config, Rate Limit）
- Secrets Manager シークレット（Slack Signing Secret, Bot Token）
- CloudWatch アラームとメトリクス
- IAM ロールとポリシー

### ステップ 2: デプロイ出力の確認

デプロイ完了後、以下の出力が表示されます：

**VerificationStack の出力**:
```
SlackAI-Verification.SlackEventHandlerUrl = https://xxxxxxxxxx.lambda-url.ap-northeast-1.on.aws/
SlackAI-Verification.VerificationLambdaRoleArn = arn:aws:iam::123456789012:role/...
```

**ExecutionStack の出力**:
```
SlackAI-Execution.ExecutionApiUrl = https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod/
SlackAI-Execution.ExecutionApiArn = arn:aws:execute-api:ap-northeast-1:123456789012:xxx/*/*/*
```

**重要**: `SlackEventHandlerUrl` をコピーして、Slack App の Event Subscriptions に設定してください。

### ステップ 3: ホワイトリストの設定（必須）

**重要**: ホワイトリスト認可機能は有効化されており、ホワイトリストが設定されていない場合、**すべてのリクエストが 403 Forbidden で拒否されます**（fail-closed 原則）。

本番環境でシステムを動作させるには、**必ずホワイトリストを設定してください**。以下のいずれかの方法で認可済みエンティティを設定します。

#### 方法 1: DynamoDB（推奨）

```bash
# team_id の追加
aws dynamodb put-item \
  --table-name slack-whitelist-config \
  --item '{
    "entity_type": {"S": "team_id"},
    "entity_id": {"S": "T01234567"}
  }'

# user_id の追加
aws dynamodb put-item \
  --table-name slack-whitelist-config \
  --item '{
    "entity_type": {"S": "user_id"},
    "entity_id": {"S": "U01234567"}
  }'

# channel_id の追加
aws dynamodb put-item \
  --table-name slack-whitelist-config \
  --item '{
    "entity_type": {"S": "channel_id"},
    "entity_id": {"S": "C01234567"}
  }'
```

#### 方法 2: Secrets Manager

```bash
aws secretsmanager create-secret \
  --name SlackAI-Verification/slack/whitelist-config \
  --secret-string '{
    "team_ids": ["T01234567"],
    "user_ids": ["U01234567"],
    "channel_ids": ["C01234567"]
  }'
```

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

3. 5〜30 秒後にスレッド内に AI レスポンスが表示されることを確認

### ステップ 2: CloudWatch ログの確認

```bash
# SlackEventHandler のログを確認
aws logs tail /aws/lambda/SlackAI-Verification-SlackEventHandler-XXXXX --follow

# BedrockProcessor のログを確認
aws logs tail /aws/lambda/SlackAI-Execution-BedrockProcessor-XXXXX --follow
```

### ステップ 3: メトリクスの確認

AWS コンソールで CloudWatch メトリクスを確認：

- `SlackEventHandler` 名前空間
  - `SignatureVerificationSuccess` / `SignatureVerificationFailed`
  - `ExistenceCheckSuccess` / `ExistenceCheckFailed`
  - `WhitelistAuthorizationSuccess` / `WhitelistAuthorizationFailed`
- `BedrockProcessor` 名前空間
  - `BedrockInvocationSuccess` / `BedrockInvocationFailed`
  - `BedrockInvocationLatency`

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
3. BedrockProcessor のログを確認

```bash
# Bedrock モデルリストを確認
aws bedrock list-foundation-models --region ap-northeast-1

# BedrockProcessor のログを確認
aws logs tail /aws/lambda/SlackAI-Execution-BedrockProcessor-XXXXX --follow
```

### 問題 4: すべてのリクエストが 403 で拒否される（ホワイトリスト関連）

**原因**: ホワイトリストが未設定、空、または設定が読み込めない

**解決策**:

1. **ホワイトリストが設定されているか確認**:

   ```bash
   # DynamoDB テーブルの内容を確認
   aws dynamodb scan --table-name slack-whitelist-config

   # または Secrets Manager のシークレットを確認
   aws secretsmanager get-secret-value \
     --secret-id SlackAI-Verification/slack/whitelist-config
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

```bash
# DynamoDB テーブルの内容を確認
aws dynamodb scan --table-name slack-whitelist-config

# Lambda ロールの権限を確認
aws iam get-role-policy \
  --role-name SlackBedrockStack-SlackEventHandler-XXXXX \
  --policy-name <policy-name>
```

### 問題 5: タイムアウトエラー

**原因**: Lambda 関数のタイムアウト設定が短すぎる、または Bedrock の処理が遅い

**解決策**:

1. Lambda 関数のタイムアウト設定を確認（SlackEventHandler: 10 秒、BedrockProcessor: 30 秒）
2. Bedrock モデルのレイテンシを確認
3. CloudWatch メトリクスでパフォーマンスを確認

---

## 次のステップ

### 基本機能の確認

- ✅ [機能要件](./reference/requirements/functional-requirements.md) - 実装済み機能の確認
- ✅ [アーキテクチャ概要](./reference/architecture/overview.md) - システム全体像の理解
- ✅ [ユーザー体験](./reference/architecture/user-experience.md) - エンドユーザーフローの確認

### セキュリティ設定

- ✅ [セキュリティ要件](./reference/security/requirements.md) - セキュリティ要件の確認
- ✅ [認証・認可セキュリティ解説](./reference/security/authentication-authorization.md) - Two-Key Defense の理解
- ✅ [ホワイトリスト認可の設定](../specs/007-whitelist-auth/quickstart.md) - アクセス制御の設定

### 運用とモニタリング

- ✅ [モニタリング & インシデントレスポンス](./reference/operations/monitoring.md) - CloudWatch ダッシュボードの設定
- ✅ [テストと検証](./reference/operations/testing.md) - テストシナリオの実行
- ✅ [Slack 側設定作業ガイド](./reference/operations/slack-setup.md) - 詳細な設定手順

### カスタマイズ

- ✅ [アーキテクチャ詳細](./reference/architecture/implementation-details.md) - Lambda 関数のカスタマイズ
- ✅ [実装ロードマップ](./implementation/roadmap.md) - 追加機能の実装
- ✅ [ADR インデックス](./explanation/adr/README.md) - 技術選択の理由とカスタマイズ指針

---

## よくある質問（FAQ）

### Q: どの Bedrock モデルを使用できますか？

A: AWS Bedrock で利用可能なすべての Foundation Model を使用できます。デフォルトは `amazon.nova-pro-v1:0` です。環境変数 `BEDROCK_MODEL_ID` で変更可能です。

### Q: ホワイトリスト認可は必須ですか？

A: **はい、必須です**。ホワイトリスト認可機能は常に有効化されており、ホワイトリストが設定されていない場合、**すべてのリクエストが 403 Forbidden で拒否されます**（fail-closed 原則）。

本番環境でシステムを動作させるには、必ずホワイトリストを設定してください。`team_id`、`user_id`、`channel_id` のすべてがホワイトリストに含まれている必要があります（AND 条件）。

### Q: コストはどのくらいかかりますか？

A: 主なコスト要因：

- Lambda 実行時間（従量課金）
- Bedrock モデル使用量（モデルごとに異なる）
- DynamoDB 読み書き（従量課金）
- API Gateway リクエスト（従量課金）

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

---

**最終更新**: 2025-12-27  
**バージョン**: 1.0
