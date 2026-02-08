# Slack リクエストから返信までのデータの流れ

Slack でボットにメンションしてから、スレッドに AI の返信が届くまでに、データがどのコンポーネントをどの順で通過するかを解説する。

---

## 1. 現在の流れ（015: 同期 InvokeAgentRuntime）

ユーザーが Slack でボットをメンションすると、以下の順で処理が進む。

### ステップ 1: Slack → SlackEventHandler Lambda（HTTP）

| 項目 | 内容 |
|------|------|
| **トリガー** | ユーザーがボットをメンション（`app_mention` イベント） |
| **送信元** | Slack サーバー（Event Subscriptions の Request URL） |
| **送信先** | SlackEventHandler Lambda の Function URL |
| **データ** | HTTP POST、Body は JSON。主なフィールド: `type: "event_callback"`, `event.type: "app_mention"`, `event.text`, `event.channel`, `event.ts`, `event.user`, `event_id`, `team_id` など |
| **Slack の期待** | 3 秒以内に HTTP 200 を返すこと（遅いと再送する） |

### ステップ 2: SlackEventHandler Lambda 内の検証・認可

| 処理 | 説明 |
|------|------|
| **署名検証** | `X-Slack-Signature` と Signing Secret でリクエストの正当性を確認 |
| **Existence Check** | Bot Token で Slack API を呼び、`team_id` / `user_id` / `channel_id` が存在するか確認（オプション） |
| **Whitelist 認可** | DynamoDB の whitelist 設定で team/user/channel をチェック |
| **レート制限** | DynamoDB の rate limit テーブルで同一ユーザー・チームの呼び出し回数を制限 |
| **重複排除** | DynamoDB の dedupe テーブルで `event_id` を記録し、同一イベントの二重処理を防止 |
| **👀 リアクション** | Bot Token で `reactions.add`（eyes）を呼び、メッセージに「処理中」を示す |

この時点で、Lambda はまだ **Slack に 200 を返していない**（後続の InvokeAgentRuntime が終わるまで待つ）。

### ステップ 3: SlackEventHandler → InvokeAgentRuntime（同期待ち）

| 項目 | 内容 |
|------|------|
| **呼び出し** | `boto3.client("bedrock-agentcore").invoke_agent_runtime(...)` |
| **渡すデータ** | `payload`: `{"prompt": json.dumps(task_data)}`。`task_data` は `channel`, `text`, `bot_token`, `thread_ts`, `attachments`, `correlation_id`, `team_id`, `user_id` |
| **挙動** | **同期**。Verification Agent が完了してストリームが終了するまで、Lambda はここでブロックする |
| **問題** | エージェント実行が 60 秒（または 120 秒）を超えると Lambda がタイムアウトし、Slack には 200 が返るがユーザーには返信が届かない |

### ステップ 4: Verification Agent（AgentCore）がリクエストを受信

| 項目 | 内容 |
|------|------|
| **受信** | AgentCore が `InvokeAgentRuntime` の payload を A2A エントリポイント（`@app.entrypoint`）に渡す |
| **ペイロード** | `payload["prompt"]` を JSON パース → `channel`, `text`, `bot_token`, `thread_ts`, `attachments`, `correlation_id`, `team_id`, `user_id` |
| **検証パイプライン** | Existence Check（Slack API）、Whitelist 認可（DynamoDB）、レート制限（DynamoDB）を再度実行（検証ゾーンとしての二重チェック） |

### ステップ 5: Verification Agent → Execution Agent（A2A）

| 項目 | 内容 |
|------|------|
| **プロトコル** | A2A（Agent-to-Agent）。JSON-RPC 2.0 over HTTP。認証は SigV4 |
| **呼び出し** | Verification Agent 内の `invoke_execution_agent(execution_payload)`。内部で `bedrock-agentcore-runtime` の `InvokeAgentRuntime`（Execution Agent の ARN）を呼ぶ |
| **渡すデータ** | `channel`, `text`, `bot_token`, `thread_ts`, `attachments`, `correlation_id`, `team_id`, `user_id` |
| **挙動** | **同期**。Execution Agent が結果を返すまで Verification Agent は待つ（非同期タスクの場合は GetAsyncTaskResult でポーリング） |

### ステップ 6: Execution Agent（AgentCore）が Bedrock で推論

| 項目 | 内容 |
|------|------|
| **受信** | A2A で受け取った payload から `text` と `attachments` を取得 |
| **処理** | 添付があればダウンロード・要約し、Bedrock Converse API でモデル推論（例: Nova） |
| **返却** | `status: "success"` + `response_text`、または `status: "error"` + `error_code` / `error_message`。ファイル生成時は `file_artifact`（014） |

### ステップ 7: Verification Agent が結果を受け取り Slack に投稿

| 項目 | 内容 |
|------|------|
| **入力** | Execution Agent から返った JSON（`result_data`） |
| **成功時** | `post_to_slack(channel, response_text, bot_token, thread_ts)` でスレッドにテキストを投稿。`file_artifact` があれば `post_file_to_slack` でファイルも投稿 |
| **エラー時** | `error_code` をユーザー向けメッセージに変換し、`post_to_slack` でエラーメッセージをスレッドに投稿 |
| **出力** | A2A の応答として `{"status": "completed", "correlation_id": "..."}` を返し、InvokeAgentRuntime のストリームが終了する |

### ステップ 8: SlackEventHandler Lambda が 200 を返す

| 項目 | 内容 |
|------|------|
| **タイミング** | InvokeAgentRuntime がストリーム終了を返した直後（または例外時） |
| **応答** | `statusCode: 200`, `body: {"ok": true}` |
| **Slack** | この時点で初めて Slack は 200 を受け取る。ユーザーにはすでにスレッドに返信が表示されている（Verification Agent が投稿済み） |

---

## 2. 016 で予定している流れ（非同期: SQS + Agent Invoker）

016 では「受信 Lambda はすぐ 200 を返し、エージェント実行は SQS 経由で別 Lambda が開始する」形に変える。

### ステップ 1〜2: 同じ

Slack → SlackEventHandler Lambda。署名検証・Existence Check・Whitelist・レート制限・重複排除・👀 リアクションまでは **現在と同じ**。

### ステップ 3': SlackEventHandler → SQS に送信 → 即 200 返却

| 項目 | 内容 |
|------|------|
| **処理** | InvokeAgentRuntime は呼ばない。代わりに **実行リクエスト**（`AgentInvocationRequest`: channel, text, thread_ts, event_id, correlation_id, team_id, user_id, bot_token, attachments）を **SQS キュー（agent-invocation-request）** に送信 |
| **応答** | SQS 送信が成功したら **直ちに** `statusCode: 200`, `body: {"ok": true}` を返す |
| **効果** | Slack は数秒以内に 200 を受け取る。Lambda の実行時間はエージェントの処理時間に依存しない |

### ステップ 4': SQS → Agent Invoker Lambda

| 項目 | 内容 |
|------|------|
| **トリガー** | SQS キューにメッセージが入ると、Agent Invoker Lambda が SQS イベントソースとして起動する |
| **入力** | SQS メッセージ Body（AgentInvocationRequest の JSON） |
| **処理** | メッセージから `task_data` を復元し、`a2a_payload = {"prompt": json.dumps(task_data)}` を組み立て、**InvokeAgentRuntime(Verification Agent)** を呼ぶ |
| **タイムアウト** | この Lambda は最大 15 分まで実行可能。SQS の可視性タイムアウトも 15 分以上に設定する |

### ステップ 5〜7: 同じ

Verification Agent が A2A で Execution Agent を呼び、Execution Agent が Bedrock で推論し、Verification Agent が結果を Slack に投稿する流れは **変更なし**。違いは「InvokeAgentRuntime を呼んでいるのが SlackEventHandler ではなく Agent Invoker Lambda」であることだけ。

### ステップ 8': ユーザーに返信が届く

| 項目 | 内容 |
|------|------|
| **タイミング** | エージェント実行が何分かかっても、**完了後に** Verification Agent が Slack に投稿するため、ユーザーにはその時点で返信が表示される |
| **Slack** | すでに Slack は 200 を受け取っているため、再送は発生しない。返信は「非同期に」スレッドに現れる |

---

## 3. データの流れの比較（図のイメージ）

**現在（015）**

```text
Slack --[event]--> SlackEventHandler --[同期待ち]--> InvokeAgentRuntime
                                                          |
                                                          v
User sees reply <-- post_to_slack <-- Verification Agent <-- Execution Agent (A2A) <-- Bedrock
                     ^                      |
                     |                      +-- ここまで終わって初めて Lambda が 200 を返す
```

**016 予定**

```text
Slack --[event]--> SlackEventHandler --[SQS Send]--> 即 200 返却
                          |
                          v
                    SQS Queue
                          |
                          v
                   Agent Invoker Lambda --[同期待ち]--> InvokeAgentRuntime
                                                              |
                                                              v
User sees reply <-- post_to_slack <-- Verification Agent <-- Execution Agent (A2A) <-- Bedrock
```

---

## 4. まとめ

| 段階 | 現在（015） | 016（非同期） |
|------|-------------|----------------|
| Slack → 200 が返るタイミング | Verification Agent が完了した後（＝遅いと Lambda タイムアウト） | SQS 送信成功直後（数秒以内） |
| 誰が InvokeAgentRuntime を呼ぶか | SlackEventHandler Lambda | Agent Invoker Lambda |
| アカウント間の通信 | Verification Agent ↔ Execution Agent の **A2A のみ** | 同じ（**A2A のみ**）。SQS は検証アカウント内のみ |
| ユーザーに返信が届くタイミング | エージェント完了後（Lambda がタイムアウトしなければ） | エージェント完了後（Lambda タイムアウトの影響を受けない） |
