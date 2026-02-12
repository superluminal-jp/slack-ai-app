# Quickstart: Validation Zone Echo for AgentCore Verification (017)

**Feature**: 017-validation-zone-echo  
**Purpose**: AgentCore（検証ゾーン）の動作確認のため、Execution zone への通信を止め、Slack から受信した内容をそのまま Slack に返すエコーモードを有効にする。

## 前提

- 016 相当がデプロイ済み（SlackEventHandler が SQS または InvokeAgentRuntime で Verification Agent に渡している状態）。
- Slack アプリの Event Subscriptions は SlackEventHandler の Function URL を指している。

## エコーモードの有効化

### 1. 環境変数で有効化（MVP）

SlackEventHandler Lambda に環境変数を追加する:

| 変数名 | 値 | 説明 |
|--------|-----|------|
| VALIDATION_ZONE_ECHO_MODE | true | エコーモード有効。`"true"` のときのみ有効（大文字小文字は実装で正規化可）。 |

- **CDK で渡す場合**: デプロイ時に `-c validationZoneEchoMode=true` を付ける（例: `cdk deploy VerificationStack -c validationZoneEchoMode=true`）。または `VerificationStack` の props で `validationZoneEchoMode: true` を渡す。未指定の場合はエコーモード無効（従来どおり SQS/AgentCore）。
- **コンソールで渡す場合**: Lambda の「設定」→「環境変数」で上記を追加し、保存。

### 2. 動作確認手順

1. エコーモードを有効にした状態でスタックをデプロイ（または Lambda の環境変数を更新）。
2. Slack でボットにメンション、またはボットが参加しているチャンネルでメッセージを送る。
3. 同じスレッドに、送ったメッセージ本文がそのまま（または `[Echo] ` 付きで）返ってくることを確認する。
4. CloudWatch Logs で SlackEventHandler のログを確認し、`echo_mode_response` 等が出力され、SQS 送信や InvokeAgentRuntime が呼ばれていないことを確認する。

### 3. エコーモードの無効化

- 環境変数 `VALIDATION_ZONE_ECHO_MODE` を削除するか、`"false"` など `"true"` 以外に設定する。
- 再度デプロイまたは Lambda の設定を保存する。
- Slack でメッセージを送り、従来どおり AI 応答（または SQS → Agent 経由の応答）が返ることを確認する。

## アーキテクチャ（エコーモード有効時）

1. **Slack** → イベント → **SlackEventHandler Lambda**（署名検証 → Existence Check → Whitelist → レート制限 → 重複排除）
2. **event_callback** かつ **message / app_mention** のとき:
   - **エコーモード有効** → 受信したメッセージ本文を `chat_postMessage` で同じスレッドに投稿 → **200** を返す（SQS 送信・InvokeAgentRuntime は行わない）。
3. **Slack** にエコーが表示される。

## トラブルシューティング

- **エコーが返ってこない**
  - 環境変数 `VALIDATION_ZONE_ECHO_MODE` が `"true"` になっているか確認。
  - SlackEventHandler のログでエコー分岐に進入しているか、`chat_postMessage` の成功/失敗を確認。
  - Bot Token が取得できているか（既存のリアクション 👀 が付くか）で確認。

- **エコー後も AI 応答が返る**
  - エコーモード有効時は SQS 送信・InvokeAgentRuntime を行わない実装になっているか確認。分岐の順序（先にエコーモード判定）を確認。

- **別スレッドにエコーが投稿される**
  - `thread_ts` に `event.thread_ts` または `event.ts` を正しく渡しているか確認。contracts/echo-response.md を参照。
