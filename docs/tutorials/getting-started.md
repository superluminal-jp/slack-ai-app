# Getting Started: Slack AI App チュートリアル

---

title: Getting Started
type: Tutorial
audience: [Developer]
status: Published
created: 2025-12-27
updated: 2026-02-07

---

## 概要

このチュートリアルでは、Slack AI App を初めて使用する開発者向けに、プロジェクトの理解から最初のデプロイまでを段階的に説明します。レガシーパス（API Gateway + SQS）と AgentCore A2A パスの両方に対応しています。

## 学習目標

このチュートリアルを完了すると、以下ができるようになります：

1. プロジェクトのアーキテクチャを理解する
2. 開発環境をセットアップする
3. AWS にデプロイする
4. Slack からボットを使用する

## 前提条件

- AWS アカウント（Bedrock アクセス権限付き）
- Slack ワークスペースの管理者権限
- Node.js 18+ がインストールされていること
- Python 3.11+ がインストールされていること
- AWS CLI が設定されていること
- Docker（ARM64 対応、AgentCore コンテナビルド用。macOS の場合は Colima 推奨）

## ステップ 1: プロジェクトの理解（10 分）

### アーキテクチャの概要

Slack AI App は、以下の 2 つの通信パスをサポートしています：

**レガシーパス（API Gateway + SQS）**:

```
Slack → Function URL → SlackEventHandler → API Gateway → BedrockProcessor → Bedrock
                                                                              ↓
                                                          SQS → SlackResponseHandler → Slack API
```

**AgentCore A2A パス（Feature Flag: USE_AGENTCORE=true）**:

```
Slack → Function URL → SlackEventHandler → Verification Agent → Execution Agent → Bedrock
                                                                                    ↓
                                               Verification Agent → Slack API (直接投稿)
```

**主要コンポーネント**:

1. **SlackEventHandler (Lambda)**: Slack からのリクエストを検証（署名検証、Existence Check、認可）
2. **BedrockProcessor (Lambda)**: Bedrock API を呼び出して応答を生成（レガシー）
3. **Verification Agent (AgentCore)**: セキュリティ検証パイプライン（A2A パス）
4. **Execution Agent (AgentCore)**: Bedrock API 呼び出し、非同期タスク管理（A2A パス）

詳細は [アーキテクチャ概要](../reference/architecture/overview.md) を参照してください。

## ステップ 2: リポジトリのクローン（2 分）

```bash
# リポジトリをクローン
git clone https://github.com/owner/slack-ai-app.git
cd slack-ai-app
```

## ステップ 3: 依存関係のインストール（5 分）

### CDK 依存関係

```bash
cd cdk
npm install
```

### Lambda 依存関係

```bash
cd cdk/lib/verification/lambda/slack-event-handler
pip install -r requirements.txt
```

## ステップ 4: AWS Bedrock の設定（5 分）

1. AWS Console にログイン
2. Amazon Bedrock に移動
3. **Model access** をクリック
4. 使用するモデル（Claude 4.5 Haiku、Claude 4.5 Sonnet など）を有効化
5. アクセスが承認されるまで待機（通常は即座）

## ステップ 5: Slack App の作成（10 分）

1. [Slack API](https://api.slack.com/apps) にアクセス
2. **Create New App** → **From scratch**
3. App 名とワークスペースを選択
4. **OAuth & Permissions** で以下のスコープを追加:

   - `app_mentions:read` - メンション受信
   - `channels:history` - スレッド履歴取得
   - `channels:read` - チャンネル情報（Existence Check 用）
   - `chat:write` - メッセージ送信
   - `files:read` - 添付ファイル処理
   - `team:read` - チーム情報（Existence Check 用）
   - `users:read` - ユーザー情報（Existence Check 用）

5. **Event Subscriptions** を有効化（URL は後で設定）

6. 以下の情報をメモ:
   - **Signing Secret** (Basic Information)
   - **Bot Token** (OAuth & Permissions)

詳細は [Slack 設定ガイド](../reference/operations/slack-setup.md) を参照してください。

## ステップ 6: シークレットの設定（3 分）

```bash
# AWS Secrets Manager にシークレットを作成
aws secretsmanager create-secret \
  --name slack-credentials \
  --secret-string '{
    "SLACK_SIGNING_SECRET": "your-signing-secret",
    "SLACK_BOT_TOKEN": "xoxb-your-bot-token"
  }'
```

## ステップ 7: デプロイ（10 分）

```bash
cd cdk

# CDK Bootstrap（初回のみ）
npx cdk bootstrap

# デプロイスクリプト（推奨）
export DEPLOYMENT_ENV=dev
chmod +x ../scripts/deploy-split-stacks.sh
../scripts/deploy-split-stacks.sh
```

デプロイ完了後、Function URL がコンソールに表示されます。

詳細なデプロイ手順は [クイックスタート](../quickstart.md#初回デプロイ) を参照してください。

## ステップ 8: Slack Event Subscriptions の設定（2 分）

1. Slack App の設定ページに戻る
2. **Event Subscriptions** → **Request URL** にデプロイで出力された Function URL を入力
3. URL 検証が成功することを確認
4. **Subscribe to bot events** で `app_mention` を追加

## ステップ 9: 動作確認（3 分）

1. Slack でボットをチャンネルに招待
2. `@YourBotName こんにちは` とメンション
3. ボットが応答することを確認

## トラブルシューティング

問題が発生した場合は、[トラブルシューティングガイド](../how-to/troubleshooting.md) を参照してください。

## 次のステップ

- [アーキテクチャ詳細](../reference/architecture/implementation-details.md) で実装の詳細を学ぶ
- [セキュリティ要件](../reference/security/requirements.md) でセキュリティ設計を理解する
- [モニタリング](../reference/operations/monitoring.md) で運用監視を設定する

## まとめ

おめでとうございます！Slack AI App のセットアップが完了しました。

**学んだこと**:

- プロジェクトのアーキテクチャ
- 開発環境のセットアップ
- AWS へのデプロイ
- Slack App の設定

**所要時間**: 約 50 分
