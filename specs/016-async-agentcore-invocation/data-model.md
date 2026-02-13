# Data Model: Async AgentCore Invocation

**Feature**: 016-async-agentcore-invocation  
**Date**: 2026-02-08

## Entities

### AgentInvocationRequest

**Purpose**: Slack イベント受信処理が SQS に投入する「実行リクエスト」。Agent Invoker Lambda がこの内容を InvokeAgentRuntime の payload に変換する。

| 属性 | 型 | 必須 | 説明 |
|------|-----|------|------|
| channel | string | はい | Slack チャンネル ID |
| text | string | はい | ユーザーが入力したテキスト（メンション除去後） |
| bot_token | string \| null | いいえ | Slack Bot Token（取得できた場合）。機密のためログに出力しない。null の場合は Verification Agent 側で Secrets Manager 等から取得する想定 |
| thread_ts | string | はい | スレッドのタイムスタンプ（スレッド返信用） |
| attachments | array | いいえ | Slack 添付データの配列（現行と同様） |
| correlation_id | string | いいえ | トレース用相関 ID（例: Lambda request_id） |
| team_id | string | はい | Slack チーム ID |
| user_id | string | はい | Slack ユーザー ID |
| event_id | string | はい | Slack イベント ID。重複排除およびログ紐付けに使用 |

**Validation**:

- channel, text, thread_ts, team_id, user_id, event_id は空文字不可。
- attachments は配列（省略時は []）。

**Lifecycle**:

1. SlackEventHandler が app_mention 等を検証・認可したのち、上記属性を組み立てて SQS に送信する。
2. Agent Invoker Lambda が SQS から受信し、Verification Agent の prompt 用 payload（a2a_payload）に変換して InvokeAgentRuntime に渡す。
3. Verification Agent は既存と同様、実行結果を Slack に投稿する（本機能では変更しない）。

---

### SQS Message (Agent Invocation Request Queue)

**Purpose**: agent-invocation-request キューに格納されるメッセージの本体。

- **Body**: AgentInvocationRequest を JSON シリアライズした文字列。
- **MessageAttributes**（任意）: 送信時刻、送信元識別子などを付与可能。実装で必要に応じて定義する。
- **制約**: SQS メッセージサイズ上限 256 KB。AgentInvocationRequest は通常この範囲に収まる。

---

## Relationships

- **Slack イベント** → (1) 検証・認可 → **AgentInvocationRequest** → (2) SQS 送信 → **agent-invocation-request キュー**
- **agent-invocation-request キュー** → (3) SQS イベント → **Agent Invoker Lambda** → (4) InvokeAgentRuntime → **Verification Agent**
- **Verification Agent** → (5) 完了時 → **Slack API**（スレッドに投稿）

既存の **Event Dedupe**（DynamoDB）は、SlackEventHandler がイベントを処理する前に event_id で重複をチェックするため、そのまま利用する。SQS 経由で同じイベントが複数回メッセージ化されることは、Slack の再送時に SlackEventHandler が再度キューに投入する場合にのみ起こり得るが、その時点で event_id による重複排除が先に適用される。

## State Transitions

- AgentInvocationRequest は「キューに投入」「消費」「削除」のライフサイクルを持つ。メッセージ単位の状態は SQS の可視性タイムアウトと削除で管理する。
- 最大受信回数超過後は DLQ に移り、手動確認・再処理または破棄の対象とする。
