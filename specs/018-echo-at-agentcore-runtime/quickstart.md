# Quickstart: Echo at Verification Agent (AgentCore Runtime) — 018

**Feature**: 018-echo-at-agentcore-runtime  
**Purpose**: AgentCore Runtime までリクエストを通し、Runtime 側で [Echo] を返して動作検証する。

## 前提

- 016 非同期起動（SQS + Agent Invoker）がデプロイ済みであること。
- 018 の変更がデプロイ済みであること（Lambda は 017 の「Lambda 内エコー」を行わず SQS に送る。Runtime に `VALIDATION_ZONE_ECHO_MODE` が渡り、Verification Agent でエコー分岐が入っている）。

## エコーモードの有効化（018）

### 1. Runtime に環境変数を渡す

Verification Agent の AgentCore Runtime に環境変数を設定する:

| 変数名 | 値 | 説明 |
|--------|-----|------|
| VALIDATION_ZONE_ECHO_MODE | true | エコーモード有効。`"true"` のときのみ有効。 |

- **CDK で渡す場合**: `VerificationAgentRuntime` に `validationZoneEchoMode: true`（または context `-c validationZoneEchoMode=true`）を渡し、`verification-agent-runtime.ts` の `environmentVariables` に `VALIDATION_ZONE_ECHO_MODE: "true"` を追加する。018 では Lambda 側の 017 エコー分岐は削除されているため、Lambda は常に SQS に送り、エコーするかどうかは Runtime 側のこの設定のみで決まる。

### 2. 動作確認手順

1. 上記の設定でスタックをデプロイ（Verification Stack を更新）。
2. Slack でボットにメンション、またはボットが参加しているチャンネルでメッセージを送る。
3. 同じスレッドに、送ったメッセージ本文が [Echo] 付きで返ってくることを確認する。
4. CloudWatch Logs で以下を確認する:
   - SlackEventHandler: `sqs_enqueue_success` が出力されている（Lambda でエコーせず SQS に送っている）。
   - Agent Invoker: `agent_invocation_success` が出力されている。
   - Verification Agent (Runtime): エコーモード分岐のログ（例: `echo_mode_response`）が出力され、`delegating_to_execution_agent` が **出ていない** こと（Execution を呼んでいない）。

### 3. エコーモードの無効化

- Runtime の環境変数 `VALIDATION_ZONE_ECHO_MODE` を削除するか、`"false"` など `"true"` 以外に設定する。
- 再度デプロイする。
- Slack でメッセージを送り、従来どおり AI 応答（Execution 経由）が返ることを確認する。

## アーキテクチャ（018 エコーモード有効時）

1. **Slack** → メンション → **SlackEventHandler Lambda**（署名検証 → Existence Check → Whitelist → レート制限 → 重複排除）→ **SQS に送信** → 200 を返す。
2. **Agent Invoker** → SQS からメッセージ取得 → **Verification Agent (AgentCore Runtime)** を InvokeAgentRuntime で呼び出し。
3. **Verification Agent**: セキュリティ検証の後、**エコーモード有効** → Execution を呼ばず、[Echo] + 本文を Slack に投稿し、A2A で成功応答を返す。
4. **Slack** に [Echo] が表示される。

## トラブルシューティング

- **エコーが返ってこない**
  - Runtime の環境変数 `VALIDATION_ZONE_ECHO_MODE` が `true` になっているか確認。
  - Verification Agent のログでエコー分岐に進入しているか、`post_to_slack` の成功/失敗を確認。
  - SlackEventHandler のログで `sqs_enqueue_success` が出ているか確認（Lambda が SQS に送っているか）。
  - Agent Invoker のログで `agent_invocation_success` が出ているか確認。

- **Execution が呼ばれてしまう**
  - Runtime の `VALIDATION_ZONE_ECHO_MODE` が正しく `true` で渡っているか、CloudFormation テンプレート（Runtime の EnvironmentVariables）を確認。
  - コンテナの再起動が必要な場合がある。数分待つか、Runtime を再デプロイする。

- **017 のように Lambda でエコーしてほしい**
  - 018 では Lambda 側の 017 エコー分岐は削除されている。Lambda のみでエコーする検証が必要な場合は、017 のタグまたはブランチでデプロイする。

**関連ドキュメント**: [トラブルシューティング（018）](../../docs/how-to/troubleshooting.md#018-echo-at-verification-agent-runtime)。
