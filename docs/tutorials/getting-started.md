# Getting Started: Slack Bedrock MVP チュートリアル

---

title: Getting Started
type: Tutorial
audience: [Developer]
status: Published
created: 2025-12-27
updated: 2025-12-27

---

## 概要

このチュートリアルでは、Slack Bedrock MVP を初めて使用する開発者向けに、プロジェクトの理解から最初のデプロイまでを段階的に説明します。

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

## ステップ 1: プロジェクトの理解（10 分）

### アーキテクチャの概要

Slack Bedrock MVP は、以下のコンポーネントで構成されています：

```
Slack → API Gateway → Lambda① (検証) → API Gateway② → Lambda② (処理) → Bedrock
                                                                            ↓
                                                                        Slack API
```

**主要コンポーネント**:

1. **Lambda① (SlackEventHandler)**: Slack からのリクエストを検証
2. **Lambda② (BedrockProcessor)**: Bedrock API を呼び出して応答を生成
3. **API Gateway**: 外部からのアクセスポイント

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
cd src
npm install
```

### Lambda 依存関係

```bash
cd ../cdk/lib/verification/lambda/slack-event-handler
pip install -r requirements.txt
```

## ステップ 4: AWS Bedrock の設定（5 分）

1. AWS Console にログイン
2. Amazon Bedrock に移動
3. **Model access** をクリック
4. **Claude 3.5 Sonnet** を有効化
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
cd src

# CDK Bootstrap（初回のみ）
npx cdk bootstrap

# デプロイ
npx cdk deploy
```

デプロイ完了後、API Gateway の URL がコンソールに表示されます。

## ステップ 8: Slack Event Subscriptions の設定（2 分）

1. Slack App の設定ページに戻る
2. **Event Subscriptions** → **Request URL** にデプロイした URL を入力
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

おめでとうございます！Slack Bedrock MVP のセットアップが完了しました。

**学んだこと**:

- プロジェクトのアーキテクチャ
- 開発環境のセットアップ
- AWS へのデプロイ
- Slack App の設定

**所要時間**: 約 50 分
