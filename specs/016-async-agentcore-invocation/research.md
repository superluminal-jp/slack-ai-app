# Research: Async AgentCore Invocation

**Feature**: 016-async-agentcore-invocation  
**Date**: 2026-02-08  
**Purpose**: Slack イベント受信をブロックせず、AgentCore 実行を非同期で行う最適な方式の調査（AWS 公式ドキュメント・ベストプラクティス参照）

## Research Questions

### RQ-01: 受信処理をブロックせずにエージェント実行を開始する方法

**Question**: SlackEventHandler Lambda が InvokeAgentRuntime の完了を待たずに 200 を返すには、どのパターンが最適か？

**Decision**: **SQS キュー経由の非同期起動**を採用する。受信 Lambda は「実行リクエスト」を SQS に送信した時点で 200 を返し、SQS をイベントソースとする別 Lambda（Agent Invoker）がメッセージを受信して InvokeAgentRuntime を呼び出す。

**Rationale**:

1. **InvokeAgentRuntime の性質（AWS 公式ドキュメント）**  
   [Invoke an AgentCore Runtime agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html) によると、InvokeAgentRuntime はストリーミング応答を返すが、呼び出し元は応答ストリームが終了するまでブロックする。つまり「非同期 API」は提供されていない。呼び出し元の実行時間を短くするには、**InvokeAgentRuntime を呼ぶコンポーネントを、受信処理とは分離する**必要がある。

2. **既存パターンとの整合（011 参照）**  
   specs/011-verification-slack-response では、実行ゾーンがレスポンスを SQS で検証ゾーンに渡し、検証ゾーンの Lambda（slack-response-handler）が SQS からメッセージを受信して Slack に投稿するパターンを採用している。今回も「受信処理 → キュー → 別コンポーネントが重い処理」という同じ考え方で、受信 Lambda と InvokeAgentRuntime 呼び出しを SQS で分離する。

3. **選択肢の比較**  
   | 手法 | 長所 | 短所 | 評価 |
   |------|------|------|------|
   | **SQS + 消費 Lambda** | 信頼性（少なくとも1回配信）、DLQ、可視性タイムアウトで長時間処理に対応可能、011 と同一パターン | キューと Lambda の追加 | ✅ 採用 |
   | Lambda 非同期 Invoke（別 Lambda を Event で起動） | 実装が簡単 | 起動のみで「完了待ち」を外すには、起動される Lambda が InvokeAgentRuntime を呼ぶ必要があり、結局その Lambda のタイムアウトが長い必要がある。SQS の方が再試行・DLQ の扱いが明確 | ⚠️ 採用せず |
   | Step Functions | リトライ・可視性が強力 | 本機能の範囲では過剰。SQS + Lambda で十分 | ⚠️ 採用せず |

4. **AWS ドキュメントでの裏付け**  
   - [Lambda を SQS でトリガー](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html): SQS をイベントソースにした Lambda は、メッセージ処理が完了するまで可視性タイムアウト以内に delete すればよい。処理時間が長い場合は SQS の可視性タイムアウトを長く（最大 12 時間）設定できる。  
   - [SQS と Lambda のベストプラクティス](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting): バッチの一部失敗時の部分返却（batchItemFailures）を利用し、失敗したメッセージのみ再表示させることで、リトライが可能。

**Alternatives Considered**:

- **InvokeAgentRuntime を「非同期」で呼ぶ**: API は同期ストリーミングのみ。呼び出し元を切り替える必要があるため不採用。
- **SlackEventHandler のタイムアウトを 15 分に延ばす**: 運用で対処可能だが、Slack の再送やコールドスタート時に長時間ブロックするため、本仕様の「受信はブロックしない」を満たさない。不採用。

**Configuration (方針)**:

- キュー名（論理）: `agent-invocation-request`（検証スタックに配置）
- メッセージ本文: 実行リクエスト（チャンネル、スレッド、ユーザー入力、bot_token 参照用情報、相関 ID、イベント ID 等）を JSON で格納
- SQS 可視性タイムアウト: 消費 Lambda のタイムアウト（例: 300 秒または 900 秒）以上に設定
- メッセージ保持期間: 14 日（デフォルトまたは要件に合わせて設定）
- DLQ: リトライ上限後にメッセージを移す DLQ を設定し、監視・手動対応を可能にする

**References**:

- [Invoke an AgentCore Runtime agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html)
- [Using Lambda with Amazon SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html)
- [Lambda SQS トリガー - コード例](https://docs.aws.amazon.com/lambda/latest/dg/example_serverless_SQS_Lambda_section.html)
- specs/011-verification-slack-response/research.md（非同期コールバックパターン・SQS 採用理由）

---

### RQ-02: 実行リクエストのペイロード形式

**Question**: SQS に投入する「実行リクエスト」に含めるべき項目は何か？

**Decision**: **現行の SlackEventHandler が InvokeAgentRuntime に渡している task_data と同等の内容**を SQS メッセージ本文（JSON）に含める。Verification Agent が受け取る prompt の元となるため、channel, text, bot_token（または Secrets Manager 参照に必要な識別子）, thread_ts, attachments, correlation_id, team_id, user_id、および重複排除用の event_id を含める。

**Rationale**:

- 現在の同期フローでは、handler が `task_data = { channel, text, bot_token, thread_ts, attachments, correlation_id, team_id, user_id }` を組み立て、`a2a_payload = {"prompt": json.dumps(task_data)}` として InvokeAgentRuntime に渡している。
- 非同期化後は、SlackEventHandler がこの task_data に event_id を加えたものを SQS メッセージとして送信し、Agent Invoker Lambda がメッセージから復元して同じ形式で InvokeAgentRuntime に渡せば、Verification Agent のインターフェースは変更不要で済む。
- bot_token は機密のため、メッセージに平文で含めず、既存と同様に Secrets Manager の識別子のみ含め、Agent Invoker または Verification Agent 側で取得する設計も可能。既存の Verification Agent が bot_token を prompt 内で受け取っている場合は、そのままメッセージに含めるか、最小権限で Secrets Manager 参照を渡すかを実装時に決定する。

**References**:

- 現行: `cdk/lib/verification/lambda/slack-event-handler/handler.py` の task_data / a2a_payload 構成
- contracts/ にメッセージスキーマを定義する（Phase 1）

---

### RQ-03: Agent Invoker Lambda のタイムアウトと SQS 可視性タイムアウト

**Question**: 消費 Lambda の実行時間上限と、SQS の可視性タイムアウトはどう設定するか？

**Decision**:  
- **Agent Invoker Lambda のタイムアウト**: 最大 15 分（900 秒）。InvokeAgentRuntime が Verification Agent の完了を待つため、長時間実行を許容する。  
- **SQS 可視性タイムアウト**: Lambda のタイムアウト以上（推奨: 6 倍など余裕を持たせる記載が AWS ドキュメントにある）。ここでは **900 秒（15 分）以上**に設定する。  
- 必要に応じて、Lambda のリザーブドコンカレンシーや SQS のバッチサイズを 1 にし、1 メッセージずつ確実に処理する。

**Rationale**:

- [Using Lambda with SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html): 可視性タイムアウトは、Lambda がメッセージを処理している間、他コンシューマーにメッセージを見せないために必要。Lambda の実行時間が可視性タイムアウトを超えると、メッセージが再表示され重複処理の原因になるため、可視性タイムアウト ≥ Lambda タイムアウトとする。
- AgentCore の実行は数十秒〜数分になる想定のため、60 秒では不足。120 秒に延長した現行 SlackEventHandler でもタイムアウトしていた事象を解消するため、消費側を 15 分まで許容する。

**References**:

- [Configuring a queue (visibility timeout)](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-visibility-timeout.html)
- [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html) — 最大タイムアウト 15 分

---

### RQ-04: 失敗時・DLQ の扱い

**Question**: キュー投入失敗、InvokeAgentRuntime 失敗、繰り返し失敗時の扱いはどうするか？

**Decision**:

- **SlackEventHandler が SQS 送信に失敗した場合**: ログに記録し、HTTP 500 を返す。Slack が再送するため、重複排除で同一イベントの二重処理は防ぐ。必要に応じて限定的なリトライ（boto3 のリトライ）を実装する。
- **Agent Invoker Lambda が InvokeAgentRuntime で失敗した場合**: 例外をログに記録し、SQS メッセージを返却しない（または batchItemFailures で該当メッセージを返す）ことで、可視性タイムアウト後に再表示されリトライされる。最大受信回数に達したメッセージは DLQ に移す。
- **DLQ**: キュー作成時に DLQ を関連付け、最大受信回数（例: 3）を設定。DLQ のメッセージはアラート・手動確認の対象とする。

**Rationale**:

- AWS ベストプラクティス: [SQS DLQ](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-dead-letter-queue.html) で失敗メッセージを隔離し、アプリケーションの障害調査と再処理を可能にする。
- 011 と同様、信頼性を「少なくとも 1 回配信」とリトライで確保し、それでも失敗する場合は DLQ で可視化する。

**References**:

- [Using dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-dead-letter-queue.html)
- [Lambda SQS batch item failures](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting)

---

### RQ-05: AgentCore の非同期機能と「アカウント間通信は A2A のみ」の整理

**Question**: AgentCore に非同期呼び出し API はあるか。アカウント間通信を A2A のみにしたい場合、016 の設計はどうか。

**Decision**: **InvokeAgentRuntime に非同期 API はない。AgentCore の「非同期」はエージェント実装側の機能。016 の SQS 案は検証アカウント内のみで完結し、アカウント間は A2A のみとなる。**

**Rationale**:

1. **AgentCore の非同期機能（AWS 公式ドキュメント）**  
   [Handle asynchronous and long running agents](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-long-run.html) によると、AgentCore Runtime がサポートする「非同期」は**エージェント側の実装パターン**である。
   - エージェント開発者が `add_async_task` / `complete_async_task` を使い、**「タスクを開始したら即座にユーザーに応答し、バックグラウンドで処理を続ける」**形で実装する。
   - クライアント（InvokeAgentRuntime の呼び出し元）は**同じ API のまま**で、エージェントが早く応答を返せばストリームが早く終了する。
   - つまり **InvokeAgentRuntime 自体に「非同期起動だけしてすぐ返る」ような API は存在しない**。呼び出し元がブロックしないようにするには、(a) 呼び出し元を分離する（例: SQS + 別 Lambda）、または (b) エージェント側で即応答してストリームを閉じ、重い処理はバックグラウンドスレッドで行う、のいずれかになる。

2. **エージェント側非同期を採用する場合（代替案）**  
   Verification Agent を「受信 → add_async_task → 即座に短い応答を返してストリーム終了 → バックグラウンドで Execution Agent A2A + Slack 投稿」と実装すれば、SlackEventHandler は従来どおり InvokeAgentRuntime を同期的に呼ぶだけで、エージェントがすぐ応答するため Lambda は短時間で終了できる。  
   - **長所**: SQS と Agent Invoker Lambda が不要になり、構成がシンプル。**アカウント間はもともと Verification Agent → Execution Agent の A2A のみ**なので、A2A のみの要件は満たす。  
   - **短所**: Verification Agent の実装変更が必須。ストリームをいつ閉じるか・エラーハンドリング・リトライはエージェント内で完結するため、SQS/DLQ のような共通基盤での再試行は使えない。  
   - 016 では**呼び出し側の分離（SQS + Agent Invoker）**を採用し、Verification Agent の変更を最小限にしている。

3. **アカウント間通信は A2A のみ**  
   - 016 のフロー: **Slack** → SlackEventHandler Lambda（検証アカウント）→ **SQS**（検証アカウント）→ **Agent Invoker Lambda**（検証アカウント）→ **InvokeAgentRuntime(Verification Agent)**（検証アカウント）→ **A2A** → **Execution Agent**（実行アカウント）→ 必要に応じて Bedrock 等。  
   - SQS も Agent Invoker Lambda も Verification Agent も**検証アカウント内**。**実行アカウント**とやりとりするのは **Verification Agent と Execution Agent の A2A 通信のみ**である。  
   - したがって **「アカウント間通信は A2A のみ」** を満たす。SQS は同一アカウント内の「受信 Lambda と Invoke 実行の分離」にのみ使う。

4. **Bedrock StartAsyncInvoke について**  
   [StartAsyncInvoke](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_StartAsyncInvoke.html) は **Bedrock のモデル推論（InvokeModel）の非同期 API** であり、**AgentCore の InvokeAgentRuntime とは別**。エージェントの起動を非同期にする用途では使えない。

**References**:

- [Handle asynchronous and long running agents with Amazon Bedrock AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-long-run.html)
- [A2A protocol contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html)
- [Host agent or tools with AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html) — "real-time interactions and long-running workloads up to 8 hours"
- [Resource-based policies for AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html) — クロスアカウント時は runtime と endpoint の両方にリソースポリシーが必要
