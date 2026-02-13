# 運用ガイド（Runbook）

**目的**: Slack App 設定、モニタリング、IAM ポリシー、インシデント対応の運用手順を提供する。
**対象読者**: 開発者、運用担当者
**最終更新日**: 2026-02-14

---

## 目次

1. [Slack App 設定](#1-slack-app-設定)
2. [モニタリングとアラーム](#2-モニタリングとアラーム)
3. [インシデント対応](#3-インシデント対応)
4. [IAM ポリシー](#4-iam-ポリシー)

---

## 1. Slack App 設定

### 概要

このセクションは、Slack AI App を動作させるために必要な **Slack 側での設定作業**をまとめたガイドです。AWS 側のインフラストラクチャのデプロイが完了した後、Slack App の作成と設定を行います。

**前提条件**:

- AWS 側のインフラストラクチャがデプロイ済み（CDK deploy 完了）
- Lambda Function URL が取得済み
- Slack ワークスペースの管理者権限があること
- [Slack API](https://api.slack.com/apps) へのアクセス権限があること

**作業の流れ**:

1. **Slack App の作成** - 新しい Slack アプリを作成
2. **OAuth & Permissions の設定** - Bot Token Scopes を設定
3. **Signing Secret の取得** - 認証に必要なシークレットを取得
4. **ワークスペースへのインストール** - Bot User OAuth Token を取得
5. **Event Subscriptions の設定** - Lambda Function URL を設定し、イベントを購読
6. **動作確認** - ダイレクトメッセージとチャンネルメンションをテスト

---

### 1.1 Slack App の作成

#### 1.1.1 アプリの作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. **"Create New App"** をクリック
3. **"From scratch"** を選択
4. 以下の情報を入力：
   - **App Name**: `Bedrock AI Assistant`（任意の名前）
   - **Pick a workspace**: テスト用のワークスペースを選択
5. **"Create App"** をクリック

**注意**: アプリ名は後から変更可能ですが、ワークスペースは変更できません。

#### 1.1.2 Manifest を使用した作成（オプション）

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
      - files:write # 014: AI 生成ファイルをスレッドに投稿

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

### 1.2 OAuth & Permissions の設定

#### 1.2.1 Bot Token Scopes の設定

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
| `files:read`        | ファイルを読み取り           | 024: 添付ファイル（画像・ドキュメント）のダウンロード・S3 転送 |
| `files:write`       | ファイルをアップロード       | 014: AI 生成ファイルをスレッドに投稿      |
| `reactions:write`   | リアクションを追加/削除      | 受付時👀、返信成功時に👀→✅に差し替え |
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

#### 1.2.2 User Token Scopes（不要）

本アプリは Bot Token のみを使用するため、**User Token Scopes は設定不要**です。

---

### 1.3 Signing Secret の取得

#### 1.3.1 Signing Secret の確認

1. Slack App の設定画面で、左サイドバーから **"Basic Information"** を選択
2. **"App Credentials"** セクションまでスクロール
3. **"Signing Secret"** の値を確認（例: `a1b2c3d4e5f6...`）

#### 1.3.2 Signing Secret の表示

- **"Show"** をクリックして値を表示
- **"Reset"** をクリックすると新しい値が生成されます（既存の設定が無効になるため注意）

#### 1.3.3 値の保存

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

### 1.4 ワークスペースへのインストール

#### 1.4.1 アプリのインストール

1. Slack App の設定画面で、左サイドバーから **"OAuth & Permissions"** を選択
2. ページ上部の **"Install to Workspace"** をクリック
3. 権限の確認画面が表示されるので、内容を確認
4. **"Allow"** をクリック

#### 1.4.2 Bot User OAuth Token の取得

インストール完了後、**"OAuth & Permissions"** ページに戻ると：

1. **"Bot User OAuth Token"** が表示されます（例: `xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx`）
2. **"Copy"** をクリックして値をコピー

#### 1.4.3 値の保存

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

#### 1.4.4 再インストール

以下の場合、アプリを再インストールする必要があります：

- Bot Token Scopes を変更した後
- Event Subscriptions を変更した後
- ワークスペースの権限が変更された場合

**再インストール手順**:

1. **"OAuth & Permissions"** ページで **"Reinstall to Workspace"** をクリック
2. **"Allow"** をクリック
3. 新しい Bot User OAuth Token が生成される場合は、AWS Secrets Manager を更新してください

---

### 1.5 Event Subscriptions の設定

#### 1.5.1 Event Subscriptions の有効化

1. Slack App の設定画面で、左サイドバーから **"Event Subscriptions"** を選択
2. **"Enable Events"** トグルを **ON** に切り替え

#### 1.5.2 Request URL の設定

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

#### 1.5.3 Bot Events の購読

1. **"Subscribe to bot events"** セクションまでスクロール
2. **"Add Bot User Event"** をクリック
3. 以下のイベントを追加：

| イベント       | 説明                 | 用途                                 |
| -------------- | -------------------- | ------------------------------------ |
| `message.im`   | ダイレクトメッセージ | Bot へのダイレクトメッセージを受信   |
| `app_mentions` | アプリメンション     | チャンネルでの @bot メンションを受信 |

4. 各イベントを追加後、**"Save Changes"** をクリック

**注意**: イベントを追加・変更した後は、**必ずアプリを再インストール**してください（手順 1.4.4 参照）。

#### 1.5.4 イベントの動作確認

Event Subscriptions が正しく設定されているか確認：

1. **"Event Subscriptions"** ページで、購読しているイベントが表示されていることを確認
2. **"Subscribe to bot events"** セクションに以下が表示されていることを確認：
   - `message.im`
   - `app_mentions`

---

### 1.6 動作確認

#### 1.6.1 ダイレクトメッセージのテスト

1. Slack ワークスペースを開く
2. 左サイドバーの **"Apps"** セクションから、作成した Bot（例: "Bedrock AI Assistant"）をクリック
3. ダイレクトメッセージを送信：
   ```
   Hello! Can you help me?
   ```
4. **期待される動作**:
   - Bot が即座に "考え中です..." のような応答を返す（3 秒以内）
   - Bedrock の処理完了後に AI が生成したレスポンスが表示される（処理時間はモデル、入力長、負荷状況に依存）

**トラブルシューティング**: Bot が応答しない場合

- CloudWatch Logs で Lambda 関数の実行ログを確認
- Event Subscriptions が有効になっているか確認
- Bot がワークスペースにインストールされているか確認（Slack → Apps → Manage Apps）
- `chat:write` スコープが設定されているか確認

#### 1.6.2 チャンネルメンションのテスト

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
   - Bedrock の処理完了後に AI が生成したレスポンスがチャンネルに表示される（処理時間はモデル、入力長、負荷状況に依存）

**トラブルシューティング**: メンションに応答しない場合

- `app_mentions` イベントが購読されているか確認
- Bot がチャンネルに参加しているか確認
- `app_mentions:read` スコープが設定されているか確認

#### 1.6.3 エラーハンドリングのテスト

以下のエラーケースをテストして、適切なエラーメッセージが表示されることを確認：

1. **空のメッセージ**: 空のメッセージを送信
2. **長すぎるメッセージ**: 4000 文字を超えるメッセージを送信
3. **Bedrock API エラー**: Bedrock へのアクセス権限がない場合のエラー

**期待される動作**:

- ユーザーフレンドリーなエラーメッセージが表示される
- エラーの詳細が CloudWatch Logs に記録される

---

### 1.7 設定の確認チェックリスト

以下のチェックリストで、すべての設定が完了しているか確認してください：

**Slack App 基本設定**:

- [ ] Slack App が作成されている
- [ ] App Name が設定されている
- [ ] 適切なワークスペースが選択されている

**OAuth & Permissions**:

- [ ] `chat:write` スコープが追加されている
- [ ] `im:history` スコープが追加されている
- [ ] `app_mentions:read` スコープが追加されている
- [ ] `team:read` スコープが追加されている（Existence Check 用）
- [ ] `users:read` スコープが追加されている（Existence Check 用）
- [ ] `channels:read` スコープが追加されている（Existence Check 用）
- [ ] アプリがワークスペースにインストールされている
- [ ] Bot User OAuth Token が取得されている

**App Credentials**:

- [ ] Signing Secret が取得されている
- [ ] Signing Secret が AWS Secrets Manager に保存されている（初回デプロイ時）

**Event Subscriptions**:

- [ ] Event Subscriptions が有効になっている
- [ ] Request URL が Lambda Function URL に設定されている
- [ ] Request URL が "Verified ✓" になっている
- [ ] `message.im` イベントが購読されている
- [ ] `app_mentions` イベントが購読されている

**動作確認**:

- [ ] ダイレクトメッセージで Bot が応答する
- [ ] チャンネルメンションで Bot が応答する
- [ ] エラーメッセージが適切に表示される
- [ ] CloudWatch Logs に正常なログが記録されている

---

### 1.8 よくある問題と解決方法

#### 問題 1: Request URL の検証が失敗する

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

#### 問題 2: Bot がメッセージに応答しない

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

#### 問題 3: Bot がメッセージを送信できない

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

#### 問題 4: 署名検証エラー

**症状**: CloudWatch Logs に "Invalid signature" エラーが記録される

**原因と解決方法**:

1. **Signing Secret が間違っている**

   - Slack App の Signing Secret を再確認
   - AWS Secrets Manager の値を更新

2. **タイムスタンプが古い**
   - Slack のリクエストタイムスタンプ検証（±5 分）を確認
   - システム時刻が正しいか確認

#### 問題 5: Existence Check エラー（missing_scope）

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

### 1.9 セキュリティベストプラクティス

#### 1.9.1 認証情報の管理

- **Signing Secret と Bot Token は機密情報**です
- Git リポジトリにコミットしないでください
- AWS Secrets Manager に安全に保存されています
- 定期的にローテーションを検討してください（90 日ごと推奨）

#### 1.9.2 最小権限の原則

- 必要な Bot Token Scopes のみを追加してください
- 不要なスコープは削除してください
- 定期的にスコープを見直してください

#### 1.9.3 イベント購読の見直し

- 必要なイベントのみを購読してください
- 不要なイベントは削除してください
- イベントの変更後は必ずアプリを再インストールしてください

#### 1.9.4 監視とログ

- CloudWatch Logs で Lambda 関数の実行ログを定期的に確認してください
- 異常なリクエストパターンを監視してください
- セキュリティインシデントが疑われる場合は、Signing Secret と Bot Token を即座にローテーションしてください

---

## 2. モニタリングとアラーム

### 2.1 CloudWatch アラーム

| アラーム                                | メトリクス                                                                                                 | 閾値                     | アクション                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------ |
| **署名検証失敗**                        | カスタム: `SignatureVerificationFailed`                                                                     | 5 分間に 5 回以上        | SNS → PagerDuty → セキュリティチーム |
| **Guardrails ブロック**                 | カスタム: `GuardrailsBlocked`                                                                               | 1 時間に 20 回以上       | SNS → AI 運用チーム                  |
| **Bedrock コスト超過**                  | Cost Explorer                                                                                               | ユーザー単位で$10/月超過 | SNS → 財務チーム                     |
| **Bedrock エラー率**                    | `Errors`                                                                                                    | 5%以上                   | SNS → エンジニアリングチーム         |
| **レイテンシ**                          | `Duration`                                                                                                  | p95 で 5 秒以上          | SNS → エンジニアリングチーム         |
| **Existence Check 失敗**                | カスタム: `ExistenceCheckFailed` (namespace: `SlackEventHandler`)                                           | 5 分間に 5 回以上        | SNS → PagerDuty → セキュリティチーム |
| **Slack API レート制限**                | カスタム: `ExistenceCheckFailed` (rate_limit エラー)                                                        | 1 時間に 10 回以上       | SNS → エンジニアリングチーム         |
| **Existence Check キャッシュヒット率**  | カスタム: `ExistenceCheckCacheHit` / (`ExistenceCheckCacheHit` + `ExistenceCheckCacheMiss`)                 | <80% が 10 分間継続      | SNS → エンジニアリングチーム         |
| **Slack API レイテンシ**                | カスタム: `SlackAPILatency` (namespace: `SlackEventHandler`)                                                | p95 > 500ms が 5 分間継続 | SNS → エンジニアリングチーム         |

### 2.2 AgentCore A2A メトリクス

AgentCore A2A パスが有効な場合、以下の追加メトリクスが監視対象となります：

| メトリクス                 | 名前空間          | 説明                               |
| -------------------------- | ----------------- | ---------------------------------- |
| `A2AInvocationSuccess`     | VerificationAgent | A2A 通信成功回数                   |
| `A2AInvocationFailed`      | VerificationAgent | A2A 通信失敗回数                   |
| `A2AInvocationLatency`     | VerificationAgent | A2A 通信レイテンシ（ミリ秒）       |
| `AsyncTaskCompleted`       | ExecutionAgent    | 非同期タスク完了回数               |
| `AsyncTaskFailed`          | ExecutionAgent    | 非同期タスク失敗回数               |
| `BedrockInvocationLatency` | ExecutionAgent    | Bedrock 呼び出しレイテンシ（ミリ秒）|

**AgentCore Runtime ログの確認**:

```bash
# Verification Agent ログ
aws logs tail /aws/agentcore/verification-agent --follow

# Execution Agent ログ
aws logs tail /aws/agentcore/execution-agent --follow
```

### 2.3 システム概要

このアーキテクチャは、**Slack ワークスペースから AWS Bedrock を利用して AI 機能を提供する**ことを実現します。

**主な成果**:

1. **機能実現**: Slack から AI 機能を利用できる環境を構築（会話、画像生成、コード生成、データ分析など）
2. **優れたユーザー体験**: 2 秒以内の初期応答、Bedrock の処理完了後に最終レスポンス、非ブロッキング処理
3. **コンテキスト履歴管理**: コンテキストを保持した連続的な処理が可能
4. **セキュリティ保護**: 多層防御、Guardrails により安全に運用
5. **モデル選択の柔軟性**: AWS Bedrock の多様な Foundation Model から要件に応じて選択可能
6. **コスト管理**: トークン制限でユーザー単位$10/月以下を実現
7. **スケーラビリティ**: サーバーレスアーキテクチャで自動スケール

**技術仕様（2025 年 11 月最新）**:

- **モデル**: AWS Bedrock Foundation Model（要件に応じて選択：Claude、Titan、Llama など）
- **Model ID**: 環境変数 `BEDROCK_MODEL_ID` で設定（デフォルト例: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`）
- **Guardrails**: Automated Reasoning checks、60 言語対応、コーディングユースケース対応
- **セキュリティ**: 多層防御による安全な実行

---

## 3. インシデント対応

### 3.1 シナリオ: 不正リクエストの大規模試行

**検出**:

- 署名検証失敗アラームが継続的にトリガー
- 特定ユーザーまたは IP から大量の不正リクエスト
- Guardrails ブロック率の急増

**対応手順**:

1. **即時対応（T+0 分）**:

   - 攻撃元ユーザー ID を特定（CloudWatch ログ）
   - 該当ユーザーを一時的にホワイトリストから削除
   - WAF ルールで攻撃パターンをブロック
   - セキュリティチームにアラート

2. **短期対応（T+1 時間）**:

   - CloudWatch Logs で攻撃パターンを分析
   - 新しいインジェクションパターンを検出ルールに追加
   - Bedrock Guardrails 設定を強化
   - 影響を受けたコンテキスト履歴を確認

3. **中期対応（T+24 時間）**:

   - セキュリティ検出ルールを更新
   - SlackEventHandler と BedrockProcessor のコードをデプロイ
   - 攻撃パターンをドキュメント化
   - 脅威モデルを更新

4. **長期対応（T+1 週間）**:
   - Red Team によるペネトレーションテスト実施
   - プロンプトエンジニアリングトレーニング（ユーザー向け）
   - Bedrock Guardrails のカスタムワードリスト更新

### 3.2 シナリオ: Existence Check 失敗の大規模発生（Signing Secret 漏洩疑い）

**検出**:

- Existence Check 失敗アラームが継続的にトリガー
- 偽造された team_id/user_id/channel_id を使用した大量のリクエスト
- CloudWatch Logs に "team_not_found" エラーが頻発

**初期対応（0-15 分）**:

1. セキュリティチームにページャー通知
2. CloudWatch Logs Insights でアクセスパターンを分析:
   ```
   fields @timestamp, team_id, user_id, channel_id, source_ip
   | filter event = "ExistenceCheckFailed"
   | stats count() by team_id, source_ip
   | sort count desc
   ```
3. 攻撃元 IP を特定し、WAF でブロック
4. Signing Secret 漏洩の可能性を評価

**封じ込め（15-60 分）**:

1. **Signing Secret の即時ローテーション**:
   - AWS Secrets Manager で新しい Signing Secret を生成
   - Slack App 設定で新しい Signing Secret を更新
   - 古い Signing Secret は無効化
2. Bot Token のローテーション（念のため）
3. すべてのチーム・ユーザーに通知

**根絶（1-4 時間）**:

1. GitHub、CloudWatch Logs、S3 で Signing Secret 漏洩元を調査
2. 漏洩原因を特定し、修正
3. 侵害されたリソースを洗い出し

**回復（4-24 時間）**:

1. 通常運用に復帰
2. モニタリング強化（異常検知）
3. インシデントレポート作成

**事後対応（1-2 週間）**:

1. Signing Secret ローテーションプロセスの自動化を検討
2. Existence Check のしきい値調整
3. セキュリティトレーニング実施

---

## 4. IAM ポリシー

### 4.1 PutResourcePolicy 要件

`deploy-split-stacks.sh` が Execution Agent の Runtime へ `PutResourcePolicy` を適用します（Endpoint は `PutResourcePolicy` 非対応）。**デプロイ用 IAM に `PutResourcePolicy` 権限が必要**です。

次の警告が出る場合は、下記の IAM 権限を追加してください。

```
[WARNING] Could not apply resource policy (check bedrock-agentcore-control PutResourcePolicy permissions)
```

### 4.2 必要な追加権限

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock-agentcore-control:PutResourcePolicy",
      "Resource": "arn:aws:bedrock-agentcore:*:*:runtime/*"
    }
  ]
}
```

### 4.3 AWS CLI でポリシーを追加する手順

```bash
# カスタマー管理ポリシーを作成
aws iam create-policy \
  --policy-name SlackAIDeploymentAgentCorePolicy \
  --policy-document file:///tmp/deployment-agentcore-policy.json \
  --description "Allows PutResourcePolicy for AgentCore Runtime/Endpoint (deployment script)"

# デプロイ用ユーザーにアタッチ
aws iam attach-user-policy \
  --user-name YOUR_DEPLOYMENT_USER \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/SlackAIDeploymentAgentCorePolicy
```

---

## 関連ドキュメント

- [クイックスタートガイド](../quickstart.md) - デプロイメント全体の手順
- [アーキテクチャ概要](./architecture.md) - システム全体のアーキテクチャ
- [セキュリティ実装](./security.md) - セキュリティ実装の詳細
- [Slack App Manifest](../slack-app-manifest.yaml) - Manifest テンプレート
- [Slack API ドキュメント](https://api.slack.com/docs) - 公式ドキュメント
- [Resource-based policies for Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html)
- [PutResourcePolicy - Control Plane API](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_PutResourcePolicy.html)
- [トラブルシューティング](../how-to/troubleshooting.md) - A2A デプロイのトラブルシューティング
- [Amazon Bedrock Foundation Models](https://docs.aws.amazon.com/bedrock/latest/userguide/foundation-models.html)
- [Amazon Bedrock Guardrails - Coding Use Cases (Nov 2025)](https://aws.amazon.com/about-aws/whats-new/2025/11/amazon-bedrock-guardrails-coding-use-cases/)
- [Automated Reasoning checks in Bedrock Guardrails (Aug 2025)](https://aws.amazon.com/about-aws/whats-new/2025/08/automated-reasoning-checks-amazon-bedrock-guardrails/)

---

**最終更新日**: 2026-02-14
