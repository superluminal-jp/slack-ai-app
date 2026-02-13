# Tasks: Async AgentCore Invocation (016)

**Input**: Design documents from `specs/016-async-agentcore-invocation/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Strategy**: TDD — 各ユーザーストーリーで「テストを先に追加し失敗を確認 → 実装で成功」の順で実行する。

**Organization**: User story ごとに Phase を分け、各 Phase 内は Tests（失敗する状態）→ Implementation の順。

### 実装状況（Implementation status）

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 1 | SQS + DLQ 作成、キュー公開 | 完了 (T001–T003) |
| Phase 2 | CDK テスト追加、Agent Invoker コンストラクト・スタック組み込み | 完了 (T004–T009) |
| Phase 3 | SlackEventHandler SQS 送信、Agent Invoker ハンドラ、Lambda 単体テスト | 完了 (T010–T020) |
| Phase 4 | US3 責務のテスト・ドキュメント | 完了 (T021–T022) |
| Phase 5 | US4 失敗・DLQ のテスト | 完了 (T023–T025) |
| Phase 6 | ドキュメント・CHANGELOG・全体テスト | 完了 (T026–T028、T029 は任意) |

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 並行実行可能（別ファイル・他タスクに依存しない）
- **[Story]**: US1–US4（spec.md の User Story）
- 説明に**必ずファイルパス**を含める

---

## Phase 1: Setup（共有インフラ）

**Purpose**: 検証スタックに SQS キューと DLQ を追加する。テストは Phase 2 で追加するため、ここではリソース作成のみ。

- [x] T001 In `cdk/lib/verification/verification-stack.ts` create SQS DLQ (e.g. logical id `AgentInvocationRequestDlq`), then create SQS queue `agent-invocation-request` with visibility timeout 900s, message retention 14 days, deadLetterQueue with maxReceiveCount 3 per research.md
- [x] T002 [P] In `cdk/lib/verification/verification-stack.ts` export queue URL (and ARN if needed) for use by SlackEventHandler and Agent Invoker construct
- [x] T003 Run `cdk synth` for Verification stack and confirm SQS queue and DLQ appear in template

**Checkpoint**: SQS と DLQ が CDK に存在し、synth が通る。

---

## Phase 2: Foundational（TDD — テストを先に追加）

**Purpose**: 016 で追加するリソースと権限を CDK テストで期待する。実装前にテストを書き、失敗を確認してから Phase 3 で実装する。

### Tests First (Red)

- [x] T004 [P] [US1] In `cdk/test/verification-stack.test.ts` add assertions: template MUST contain AWS::SQS::Queue for agent-invocation-request (or equivalent logical id), template MUST contain a Lambda function for Agent Invoker (e.g. AgentInvoker or similar logical id), SlackEventHandler Lambda role MUST have sqs:SendMessage on the agent-invocation queue resource, Agent Invoker Lambda role MUST have bedrock-agentcore:InvokeAgentRuntime; run test and confirm it FAILS (resources not yet added)
- [x] T005 [P] [US1] In `cdk/test/agentcore-constructs.test.ts` if it asserts SlackEventHandler permissions: add expectation for SQS SendMessage on agent-invocation queue; ensure no assertion that SlackEventHandler has InvokeAgentRuntime (or update to Agent Invoker only); run and confirm FAIL if construct not updated yet

### Implementation (Green)

- [x] T006 Create `cdk/lib/verification/constructs/agent-invoker.ts`: Lambda (Python 3.11, handler from `lambda/agent-invoker/`), timeout 900s, environment VERIFICATION_AGENT_ARN and AWS_REGION_NAME; add SQS event source mapping to agent-invocation-request queue with batch size 1
- [x] T007 In `cdk/lib/verification/constructs/agent-invoker.ts` grant Lambda role: bedrock-agentcore:InvokeAgentRuntime on Verification Agent runtime ARN and `${runtimeArn}/runtime-endpoint/DEFAULT`; sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes on the queue
- [x] T008 In `cdk/lib/verification/verification-stack.ts` instantiate Agent Invoker construct (pass verificationAgentArn and queue reference), wire queue to Lambda as event source; pass queue to SlackEventHandler construct for AGENT_INVOCATION_QUEUE_URL
- [x] T009 Run `cdk/test/verification-stack.test.ts` and `cdk/test/agentcore-constructs.test.ts`; fix until tests PASS

**Checkpoint**: CDK テストが通り、SQS と Agent Invoker Lambda がスタックに存在する。

---

## Phase 3: User Story 1 & 2 — メンションで返信が届く / 受信はブロックしない (P1) — MVP

**Goal**: SlackEventHandler は SQS に実行リクエストを送って即 200 を返す。Agent Invoker が InvokeAgentRuntime(Verification Agent) を呼ぶ。長時間実行でも返信が届く。

**Independent Test**: Slack でメンション → 数秒以内に 200 → 完了後にスレッドに返信。受信から 200 まで 10 秒以内。

### TDD: SlackEventHandler のテストを先に追加（Red）

- [x] T010 [US1] In `cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py` add or update test: when app_mention is processed and AGENT_INVOCATION_QUEUE_URL is set, handler MUST call sqs.send_message with Body containing channel, text, thread_ts, event_id, correlation_id, team_id, user_id (AgentInvocationRequest shape) and MUST NOT call bedrock-agentcore invoke_agent_runtime; assert response statusCode 200 on success; mock boto3 client for SQS
- [x] T011 [US1] In `cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py` add test: when SQS send_message raises, handler returns statusCode 500 and logs error; assert no invoke_agent_runtime call
- [x] T012 Run pytest in `cdk/lib/verification/lambda/slack-event-handler/tests/` and confirm new/updated tests FAIL (handler still calls InvokeAgentRuntime)

### TDD: Agent Invoker のテストを先に追加（Red）

- [x] T013 [P] [US1] Create `cdk/lib/verification/lambda/agent-invoker/tests/test_handler.py`: test that lambda_handler given SQS event with Body = JSON of AgentInvocationRequest calls boto3 bedrock-agentcore invoke_agent_runtime with payload {"prompt": json.dumps(task_data)} and correct agentRuntimeArn; mock boto3 client; test that on InvokeAgentRuntime exception handler returns batchItemFailures with failed message id(s)
- [x] T014 Run pytest in `cdk/lib/verification/lambda/agent-invoker/tests/` and confirm tests FAIL (handler not implemented)

### Implementation: Agent Invoker Handler（Green）

- [x] T015 [US1] Create `cdk/lib/verification/lambda/agent-invoker/handler.py`: lambda_handler(event, context) for SQS events; parse each record Body as JSON → AgentInvocationRequest; build a2a_payload = {"prompt": json.dumps(task_data)}; call boto3.client("bedrock-agentcore").invoke_agent_runtime(agentRuntimeArn=os.environ["VERIFICATION_AGENT_ARN"], runtimeSessionId=str(uuid.uuid4()), payload=json.dumps(a2a_payload).encode()); on exception append messageId to batchItemFailures and return { batchItemFailures }; structured JSON logging per plan
- [x] T016 [US1] Create `cdk/lib/verification/lambda/agent-invoker/requirements.txt` with boto3 and any logger deps; ensure handler is wired in `cdk/lib/verification/constructs/agent-invoker.ts` (code asset path)
- [x] T017 Run pytest in `cdk/lib/verification/lambda/agent-invoker/tests/` and fix until PASS

### Implementation: SlackEventHandler を SQS 送信に変更（Green）

- [x] T018 [US1] In `cdk/lib/verification/lambda/slack-event-handler/handler.py` replace InvokeAgentRuntime block: build AgentInvocationRequest (channel, text, bot_token, thread_ts, attachments, correlation_id, team_id, user_id, event_id from slack_event); call boto3.client("sqs").send_message(QueueUrl=os.environ["AGENT_INVOCATION_QUEUE_URL"], MessageBody=json.dumps(request)); on success return 200; on exception log and return 500
- [x] T019 [US1] In `cdk/lib/verification/constructs/slack-event-handler.ts` add env AGENT_INVOCATION_QUEUE_URL from queue.queueUrl; grant handler role sqs:SendMessage on agent-invocation-request queue; remove VERIFICATION_AGENT_ARN from env if no longer used by handler
- [x] T020 [US1] Run pytest in `cdk/lib/verification/lambda/slack-event-handler/tests/` and fix until PASS

**Checkpoint**: US1/US2 の Independent Test を満たす。SlackEventHandler は SQS 送信のみ、Agent Invoker が InvokeAgentRuntime を呼ぶ。

---

## Phase 4: User Story 3 — 実行結果の Slack 投稿責務は検証ゾーン (P1)

**Goal**: 非同期化後も Slack への投稿は Verification Agent が行う（変更なし）。設計の確認とテストで保証する。

**Independent Test**: フロー追跡で、エージェント完了から Slack 投稿までが Verification Agent 経由であることを確認。

- [x] T021 [P] [US3] In `cdk/lib/verification/lambda/agent-invoker/tests/test_handler.py` add test: invoke_agent_runtime is called with VERIFICATION_AGENT_ARN (from env mock), not Execution Agent ARN — ensures invocation target is Verification Agent which retains Slack posting responsibility
- [x] T022 [US3] In `docs/reference/architecture/zone-communication.md` or equivalent document: add 016 flow (SlackEventHandler → SQS → Agent Invoker → InvokeAgentRuntime(Verification Agent) → A2A → Execution Agent → Slack); state that Slack posting is still done by Verification Zone only; cross-account remains A2A only

**Checkpoint**: US3 の責務分離がテストとドキュメントで明示されている。

---

## Phase 5: User Story 4 — 障害・再試行 (P2)

**Goal**: SQS 送信失敗時は 500 とログ。InvokeAgentRuntime 失敗時は batchItemFailures でリトライ。最大受信回数後に DLQ へ。

**Independent Test**: SQS 送信失敗で 500；Agent Invoker で InvokeAgentRuntime が失敗した場合に batchItemFailures を返すこと；DLQ 設定の確認。

### TDD: 失敗シナリオのテスト（Red → Green）

- [x] T023 [US4] In `cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py` ensure test exists: SQS send_message raises → handler returns 500, error logged (T011 で追加済みならスキップ可)
- [x] T024 [US4] In `cdk/lib/verification/lambda/agent-invoker/tests/test_handler.py` ensure test exists: when invoke_agent_runtime raises, response includes batchItemFailures with at least one item (T013 で追加済みならスキップ可)
- [x] T025 [US4] In `cdk/test/verification-stack.test.ts` assert SQS queue has redrivePolicy with deadLetterTargetArn and maxReceiveCount (e.g. 3) per research.md

**Checkpoint**: US4 の失敗・再試行・DLQ がテストでカバーされている。

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: ドキュメント、CHANGELOG、既存テストの調整。

- [x] T026 [P] Update `docs/how-to/troubleshooting.md`: add section for 016 (SQS backlog, Agent Invoker errors, DLQ messages, InvokeAgentRuntime permission)
- [x] T027 Update `CHANGELOG.md` with 016-async-agentcore-invocation: SlackEventHandler returns 200 after SQS enqueue; Agent Invoker Lambda invokes Verification Agent; long-running agent no longer hits Lambda timeout
- [x] T028 Run full CDK test suite (`cdk && npm test`) and all Lambda pytest; fix any regressions
- [ ] T029 [P] Optional: run quickstart.md validation (deploy dev, send mention, confirm 200 and reply)

---

## Dependencies & Execution Order

### Phase Order

1. **Phase 1 (Setup)**: T001–T003 — SQS/DLQ 作成。他に依存しない。
2. **Phase 2 (Foundational)**: T004–T009 — CDK テストを先に追加（Red）→ Agent Invoker コンストラクトとスタック組み込み（Green）。Phase 1 完了後。
3. **Phase 3 (US1/US2)**: T010–T020 — SlackEventHandler と Agent Invoker の**テストを先に追加（Red）** → ハンドラ実装と SlackEventHandler 変更（Green）。Phase 2 完了後。
4. **Phase 4 (US3)**: T021–T022 — 責務のテストとドキュメント。Phase 3 完了後。
5. **Phase 5 (US4)**: T023–T025 — 失敗・DLQ のテストとアサーション。Phase 3 完了後でよい。
6. **Phase 6 (Polish)**: T026–T029 — 全 Phase 後。

### TDD Within Phases

- **Phase 2**: T004–T005 でテスト追加 → 実行して FAIL 確認 → T006–T009 で実装 → PASS 確認。
- **Phase 3**: T010–T014 でテスト追加 → FAIL 確認 → T015–T020 で実装 → PASS 確認。

### Parallel Opportunities

- T004 と T005 は並行可能 [P]。
- T010–T011 と T013 は別ディレクトリのため並行可能（T013 は [P]）。
- T021, T026 は他タスクに依存しないため [P]。

---

## Implementation Strategy (TDD)

1. **Phase 1** を完了 → SQS/DLQ が存在。
2. **Phase 2** で CDK テストを書き、失敗を確認 → Agent Invoker コンストラクトとスタックを追加 → テストを通す。
3. **Phase 3** で SlackEventHandler と Agent Invoker の単体テストを書き、失敗を確認 → ハンドラ実装と SlackEventHandler の SQS 送信に変更 → テストを通す。ここで MVP（US1/US2）完了。
4. **Phase 4–5** で US3/US4 のテストとドキュメントを整える。
5. **Phase 6** でドキュメント・CHANGELOG・全体テスト。

---

## Notes

- 各タスクは「実行すれば LLM が文脈なしで実装できる」レベルで具体化する。
- [P] のタスクは別ファイル・依存なし。同じファイルを触るタスクは順序を守る。
- 完了したタスクは `- [ ]` を `- [x]` に変更する。
