# Slack 側設定作業ガイド

**ドキュメントタイプ**: セットアップガイド  
**ステータス**: 推奨  
**バージョン**: 1.0  
**最終更新日**: 2025-12-06  
**対象読者**: DevOps エンジニア、Slack 管理者、デプロイ担当者

## 概要

本ドキュメントは、Slack AI App を動作させるために必要な **Slack 側での設定作業**をまとめたガイドです。AWS 側のインフラストラクチャのデプロイが完了した後、Slack App の作成と設定を行います。

### 前提条件

- AWS 側のインフラストラクチャがデプロイ済み（CDK deploy 完了）
- Lambda Function URL が取得済み
- Slack ワークスペースの管理者権限があること
- [Slack API](https://api.slack.com/apps) へのアクセス権限があること

### 作業の流れ

1. **Slack App の作成** - 新しい Slack アプリを作成
2. **OAuth & Permissions の設定** - Bot Token Scopes を設定
3. **Signing Secret の取得** - 認証に必要なシークレットを取得
4. **ワークスペースへのインストール** - Bot User OAuth Token を取得
5. **Event Subscriptions の設定** - Lambda Function URL を設定し、イベントを購読
6. **動作確認** - ダイレクトメッセージとチャンネルメンションをテスト

---

## 1. Slack App の作成

### 1.1 アプリの作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. **"Create New App"** をクリック
3. **"From scratch"** を選択
4. 以下の情報を入力：
   - **App Name**: `Bedrock AI Assistant`（任意の名前）
   - **Pick a workspace**: テスト用のワークスペースを選択
5. **"Create App"** をクリック

**注意**: アプリ名は後から変更可能ですが、ワークスペースは変更できません。

### 1.2 Manifest を使用した作成（オプション）

Manifest ファイルを使用してアプリを作成することも可能です：

1. [Slack API](https://api.slack.com/apps) にアクセス
2. **"Create New App"** → **"From manifest"** を選択
3. ワークスペースを選択
4. YAML 形式で以下の内容を貼り付け（`docs/slack-app-manifest.yaml` を参照）：

```yaml
display_information:
  name: Bedrock AI Assistant
  description: AI-powered Slack bot using AWS Bedrock for intelligent responses
  background_color: "#2c2d30"

features:
  bot_user:
    display_name: Bedrock AI Assistant
    always_online: true

oauth_config:
  scopes:
    bot:
      - chat:write
      - im:history
      - app_mentions:read
      - team:read # Existence Check: team_id 検証
      - users:read # Existence Check: user_id 検証
      - channels:read # Existence Check: channel_id 検証

event_subscriptions:
  bot_events:
    - message.im
    - app_mentions

settings:
  event_subscriptions:
    request_url: "REPLACE_WITH_LAMBDA_FUNCTION_URL"
  interactivity:
    is_enabled: false
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

5. **"Create"** をクリック

**注意**: Manifest を使用する場合でも、後で `request_url` を実際の Lambda Function URL に置き換える必要があります。

---

## 2. OAuth & Permissions の設定

### 2.1 Bot Token Scopes の設定

1. Slack App の設定画面で、左サイドバーから **"OAuth & Permissions"** を選択
2. **"Scopes"** セクションまでスクロール
3. **"Bot Token Scopes"** に以下のスコープを追加：

**必須スコープ**:

| スコープ            | 説明                         | 用途                                      |
| ------------------- | ---------------------------- | ----------------------------------------- |
| `app_mentions:read` | メンションを読み取り         | チャンネルでの @bot メンションを受信      |
| `channels:history`  | チャンネルの履歴を読み取り   | スレッド履歴取得（conversations.replies） |
| `channels:read`     | チャンネル情報を読み取り     | Existence Check で channel_id 検証        |
| `chat:write`        | メッセージを送信             | Slack に AI レスポンスを投稿              |
| `files:read`        | ファイルを読み取り           | 添付ファイル（画像・ドキュメント）処理    |
| `team:read`         | ワークスペース情報を読み取り | Existence Check で team_id 検証           |
| `users:read`        | ユーザー情報を読み取り       | Existence Check で user_id 検証           |

**オプションスコープ**（DM・プライベートチャンネル対応時に追加）:

| スコープ         | 説明                                   | 用途                                     |
| ---------------- | -------------------------------------- | ---------------------------------------- |
| `groups:history` | プライベートチャンネルの履歴を読み取り | プライベートチャンネルのスレッド履歴     |
| `groups:read`    | プライベートチャンネル情報を読み取り   | プライベートチャンネルの Existence Check |
| `im:history`     | ダイレクトメッセージの履歴を読み取り   | DM のスレッド履歴取得                    |
| `im:read`        | ダイレクトメッセージ情報を読み取り     | DM の Existence Check                    |
| `mpim:history`   | グループ DM の履歴を読み取り           | グループ DM のスレッド履歴               |
| `mpim:read`      | グループ DM 情報を読み取り             | グループ DM の Existence Check           |

4. 各スコープを追加後、**"Save Changes"** をクリック

**セキュリティ注意**: 最小権限の原則に従い、必要なスコープのみを追加してください。

### 2.2 User Token Scopes（不要）

本アプリは Bot Token のみを使用するため、**User Token Scopes は設定不要**です。

---

## 3. Signing Secret の取得

### 3.1 Signing Secret の確認

1. Slack App の設定画面で、左サイドバーから **"Basic Information"** を選択
2. **"App Credentials"** セクションまでスクロール
3. **"Signing Secret"** の値を確認（例: `a1b2c3d4e5f6...`）

### 3.2 Signing Secret の表示

- **"Show"** をクリックして値を表示
- **"Reset"** をクリックすると新しい値が生成されます（既存の設定が無効になるため注意）

### 3.3 値の保存

Signing Secret の値を安全に保存してください。この値は：

- AWS Secrets Manager に保存されます（初回デプロイ時）
- Lambda 関数で HMAC SHA256 署名検証に使用されます
- **機密情報のため、Git にコミットしないでください**

**保存方法**:

```bash
# 環境変数として一時的に保存（初回デプロイ時のみ）
export SLACK_SIGNING_SECRET=a1b2c3d4e5f6...
```

---

## 4. ワークスペースへのインストール

### 4.1 アプリのインストール

1. Slack App の設定画面で、左サイドバーから **"OAuth & Permissions"** を選択
2. ページ上部の **"Install to Workspace"** をクリック
3. 権限の確認画面が表示されるので、内容を確認
4. **"Allow"** をクリック

### 4.2 Bot User OAuth Token の取得

インストール完了後、**"OAuth & Permissions"** ページに戻ると：

1. **"Bot User OAuth Token"** が表示されます（例: `xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx`）
2. **"Copy"** をクリックして値をコピー

### 4.3 値の保存

Bot User OAuth Token の値を安全に保存してください。この値は：

- AWS Secrets Manager に保存されます（初回デプロイ時）
- Lambda 関数で Slack API 呼び出しに使用されます
- **機密情報のため、Git にコミットしないでください**

**保存方法**:

```bash
# 環境変数として一時的に保存（初回デプロイ時のみ）
# 実際のBot Tokenに置き換えてください（例: xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx）
export SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 4.4 再インストール

以下の場合、アプリを再インストールする必要があります：

- Bot Token Scopes を変更した後
- Event Subscriptions を変更した後
- ワークスペースの権限が変更された場合

**再インストール手順**:

1. **"OAuth & Permissions"** ページで **"Reinstall to Workspace"** をクリック
2. **"Allow"** をクリック
3. 新しい Bot User OAuth Token が生成される場合は、AWS Secrets Manager を更新してください

---

## 5. Event Subscriptions の設定

### 5.1 Event Subscriptions の有効化

1. Slack App の設定画面で、左サイドバーから **"Event Subscriptions"** を選択
2. **"Enable Events"** トグルを **ON** に切り替え

### 5.2 Request URL の設定

1. **"Request URL"** フィールドに、AWS CDK デプロイ時に取得した **Lambda Function URL** を貼り付け

   **例**:

   ```
   https://abc123def456.lambda-url.ap-northeast-1.on.aws/
   ```

2. URL を入力すると、Slack が自動的に検証リクエストを送信します
3. 数秒以内に **"Verified ✓"** のステータスが表示されることを確認

**検証の仕組み**:

- Slack が `url_verification` イベントを送信
- Lambda 関数が `challenge` パラメータをそのまま返す
- Slack が検証に成功すると "Verified ✓" が表示される

**トラブルシューティング**: 検証が失敗する場合

- Lambda Function URL が正しいか確認
- Lambda 関数が正常に動作しているか CloudWatch Logs で確認
- Signing Secret が AWS Secrets Manager に正しく保存されているか確認
- Lambda 関数のタイムアウト設定（10 秒以上推奨）を確認

### 5.3 Bot Events の購読

1. **"Subscribe to bot events"** セクションまでスクロール
2. **"Add Bot User Event"** をクリック
3. 以下のイベントを追加：

| イベント       | 説明                 | 用途                                 |
| -------------- | -------------------- | ------------------------------------ |
| `message.im`   | ダイレクトメッセージ | Bot へのダイレクトメッセージを受信   |
| `app_mentions` | アプリメンション     | チャンネルでの @bot メンションを受信 |

4. 各イベントを追加後、**"Save Changes"** をクリック

**注意**: イベントを追加・変更した後は、**必ずアプリを再インストール**してください（手順 4.4 参照）。

### 5.4 イベントの動作確認

Event Subscriptions が正しく設定されているか確認：

1. **"Event Subscriptions"** ページで、購読しているイベントが表示されていることを確認
2. **"Subscribe to bot events"** セクションに以下が表示されていることを確認：
   - `message.im`
   - `app_mentions`

---

## 6. 動作確認

### 6.1 ダイレクトメッセージのテスト

1. Slack ワークスペースを開く
2. 左サイドバーの **"Apps"** セクションから、作成した Bot（例: "Bedrock AI Assistant"）をクリック
3. ダイレクトメッセージを送信：
   ```
   Hello! Can you help me?
   ```
4. **期待される動作**:
   - Bot が即座に "考え中です..." のような応答を返す（3 秒以内）
   - 5〜30 秒後に AI が生成したレスポンスが表示される

**トラブルシューティング**: Bot が応答しない場合

- CloudWatch Logs で Lambda 関数の実行ログを確認
- Event Subscriptions が有効になっているか確認
- Bot がワークスペースにインストールされているか確認（Slack → Apps → Manage Apps）
- `chat:write` スコープが設定されているか確認

### 6.2 チャンネルメンションのテスト

1. 任意のパブリックチャンネル（またはテストチャンネル）を開く
2. Bot をチャンネルに招待（まだ招待していない場合）：
   ```
   /invite @Bedrock AI Assistant
   ```
3. Bot をメンションしてメッセージを送信：
   ```
   @Bedrock AI Assistant What is the capital of France?
   ```
4. **期待される動作**:
   - Bot がチャンネル内で即座に応答を開始（3 秒以内）
   - 5〜30 秒後に AI が生成したレスポンスがチャンネルに表示される

**トラブルシューティング**: メンションに応答しない場合

- `app_mentions` イベントが購読されているか確認
- Bot がチャンネルに参加しているか確認
- `app_mentions:read` スコープが設定されているか確認

### 6.3 エラーハンドリングのテスト

以下のエラーケースをテストして、適切なエラーメッセージが表示されることを確認：

1. **空のメッセージ**: 空のメッセージを送信
2. **長すぎるメッセージ**: 4000 文字を超えるメッセージを送信
3. **Bedrock API エラー**: Bedrock へのアクセス権限がない場合のエラー

**期待される動作**:

- ユーザーフレンドリーなエラーメッセージが表示される
- エラーの詳細が CloudWatch Logs に記録される

---

## 7. 設定の確認チェックリスト

以下のチェックリストで、すべての設定が完了しているか確認してください：

### Slack App 基本設定

- [ ] Slack App が作成されている
- [ ] App Name が設定されている
- [ ] 適切なワークスペースが選択されている

### OAuth & Permissions

- [ ] `chat:write` スコープが追加されている
- [ ] `im:history` スコープが追加されている
- [ ] `app_mentions:read` スコープが追加されている
- [ ] `team:read` スコープが追加されている（Existence Check 用）
- [ ] `users:read` スコープが追加されている（Existence Check 用）
- [ ] `channels:read` スコープが追加されている（Existence Check 用）
- [ ] アプリがワークスペースにインストールされている
- [ ] Bot User OAuth Token が取得されている

### App Credentials

- [ ] Signing Secret が取得されている
- [ ] Signing Secret が AWS Secrets Manager に保存されている（初回デプロイ時）

### Event Subscriptions

- [ ] Event Subscriptions が有効になっている
- [ ] Request URL が Lambda Function URL に設定されている
- [ ] Request URL が "Verified ✓" になっている
- [ ] `message.im` イベントが購読されている
- [ ] `app_mentions` イベントが購読されている

### 動作確認

- [ ] ダイレクトメッセージで Bot が応答する
- [ ] チャンネルメンションで Bot が応答する
- [ ] エラーメッセージが適切に表示される
- [ ] CloudWatch Logs に正常なログが記録されている

---

## 8. よくある問題と解決方法

### 問題 1: Request URL の検証が失敗する

**症状**: "Your URL didn't respond with the value of the challenge parameter"

**原因と解決方法**:

1. **Lambda Function URL が正しくない**

   - CDK デプロイ時の出力を再確認
   - AWS Console → Lambda → Function URL で確認

2. **Lambda 関数が正常に動作していない**

   - CloudWatch Logs でエラーを確認
   - Lambda 関数のタイムアウト設定を確認（10 秒以上推奨）

3. **Signing Secret が正しく設定されていない**
   - AWS Secrets Manager で `SlackBedrockStack/slack/signing-secret` の値を確認
   - 環境変数が正しく設定されているか確認（初回デプロイ時のみ）

### 問題 2: Bot がメッセージに応答しない

**症状**: メッセージを送信しても Bot が応答しない

**原因と解決方法**:

1. **Event Subscriptions が有効になっていない**

   - Event Subscriptions ページで "Enable Events" が ON になっているか確認

2. **Bot Events が購読されていない**

   - `message.im` と `app_mentions` が購読されているか確認
   - イベントを追加した後、アプリを再インストールしたか確認

3. **Bot がワークスペースにインストールされていない**

   - Slack → Apps → Manage Apps で確認
   - 必要に応じて再インストール

4. **Lambda 関数でエラーが発生している**
   - CloudWatch Logs でエラーログを確認
   - IAM 権限が正しく設定されているか確認

### 問題 3: Bot がメッセージを送信できない

**症状**: Bot がイベントを受信しているが、レスポンスを送信できない

**原因と解決方法**:

1. **`chat:write` スコープが設定されていない**

   - OAuth & Permissions でスコープを確認
   - スコープを追加した後、アプリを再インストール

2. **Bot User OAuth Token が無効**

   - Bot Token を再取得（再インストール）
   - AWS Secrets Manager で Bot Token を更新

3. **チャンネルに Bot が参加していない**
   - チャンネルメンションの場合、Bot をチャンネルに招待

### 問題 4: 署名検証エラー

**症状**: CloudWatch Logs に "Invalid signature" エラーが記録される

**原因と解決方法**:

1. **Signing Secret が間違っている**

   - Slack App の Signing Secret を再確認
   - AWS Secrets Manager の値を更新

2. **タイムスタンプが古い**
   - Slack のリクエストタイムスタンプ検証（±5 分）を確認
   - システム時刻が正しいか確認

### 問題 5: Existence Check エラー（missing_scope）

**症状**: CloudWatch Logs に "Slack API error verifying team: missing_scope" エラーが記録される

**原因と解決方法**:

1. **必要な OAuth スコープが設定されていない**

   - OAuth & Permissions で以下のスコープが追加されているか確認:
     - `team:read` - ワークスペース情報の取得
     - `users:read` - ユーザー情報の取得
     - `channels:read` - チャンネル情報の取得
   - スコープを追加した後、**アプリを再インストール**（重要: スコープ変更後は再インストールが必要）

2. **Bot Token が古い**

   - スコープを追加した後、Bot Token が更新されていない可能性
   - OAuth & Permissions で "Reinstall App" を実行
   - 新しい Bot Token を AWS Secrets Manager に更新

3. **CloudWatch メトリクスエラー（AccessDenied）**

   - Lambda IAM ロールに `cloudwatch:PutMetricData` 権限が不足している可能性
   - CDK スタックを再デプロイして CloudWatch 権限を追加

---

## 9. セキュリティベストプラクティス

### 9.1 認証情報の管理

- **Signing Secret と Bot Token は機密情報**です
- Git リポジトリにコミットしないでください
- AWS Secrets Manager に安全に保存されています
- 定期的にローテーションを検討してください（90 日ごと推奨）

### 9.2 最小権限の原則

- 必要な Bot Token Scopes のみを追加してください
- 不要なスコープは削除してください
- 定期的にスコープを見直してください

### 9.3 イベント購読の見直し

- 必要なイベントのみを購読してください
- 不要なイベントは削除してください
- イベントの変更後は必ずアプリを再インストールしてください

### 9.4 監視とログ

- CloudWatch Logs で Lambda 関数の実行ログを定期的に確認してください
- 異常なリクエストパターンを監視してください
- セキュリティインシデントが疑われる場合は、Signing Secret と Bot Token を即座にローテーションしてください

---

## 10. 関連ドキュメント

- [クイックスタートガイド](../../specs/001-slack-bedrock-mvp/quickstart.md) - デプロイメント全体の手順
- [アーキテクチャ概要](../architecture/overview.md) - システム全体のアーキテクチャ
- [セキュリティ実装](../security/implementation.md) - セキュリティ実装の詳細
- [Slack App Manifest](../slack-app-manifest.yaml) - Manifest テンプレート
- [Slack API ドキュメント](https://api.slack.com/docs) - 公式ドキュメント

---

## 11. 更新履歴

| 日付       | バージョン | 変更内容                 |
| ---------- | ---------- | ------------------------ |
| 2025-12-05 | 1.0        | 初版作成                 |
| 2025-12-06 | 1.1        | 添付ファイル処理機能追加 |

---

**ドキュメントステータス**: ✅ 最新  
**最終確認日**: 2025-12-06  
**次回レビュー予定**: 機能追加時または設定変更時
