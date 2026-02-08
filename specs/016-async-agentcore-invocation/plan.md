# Implementation Plan: Async AgentCore Invocation

**Branch**: `016-async-agentcore-invocation` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/016-async-agentcore-invocation/spec.md`  
**User**: AWS MCPや公式ドキュメントを参照して最適なシステムを構築する

## Summary

Slack イベント受信処理（SlackEventHandler Lambda）がエージェント実行の完了を待たずに即座に 200 を返すようにする。受信処理は「実行リクエスト」を SQS キューに投入した時点で成功応答を返し、SQS をトリガーとする別 Lambda（Agent Invoker）が InvokeAgentRuntime を呼び出す。これにより Lambda の実行時間制限に縛られずに AgentCore が長時間実行でき、完了後に Verification Agent が Slack に投稿する現行の責務は維持する。設計・検証は AWS 公式ドキュメントおよび AWS MCP を参照する。

## Technical Context

**Language/Version**: TypeScript (CDK, Node 18+), Python 3.11+ (Lambda)  
**Primary Dependencies**: aws-cdk-lib, boto3 (SQS, bedrock-agentcore), 既存 Verification Agent Runtime  
**Storage**: DynamoDB（既存: dedupe, whitelist, rate limit, token）— 変更なし。SQS キュー（新規: agent-invocation-request）で実行リクエストを渡す。  
**Testing**: Jest (CDK), pytest (Lambda unit)  
**Target Platform**: AWS ap-northeast-1; Lambda (SlackEventHandler + Agent Invoker), SQS, AgentCore runtimes  
**Project Type**: Infrastructure (CDK) + serverless  
**Performance Goals**: 受信から 200 応答まで 10 秒以内; エージェント実行は 60 秒超でも完了後に Slack に返信が届く  
**Constraints**: Slack 3 秒応答要件は受信処理の即時 200 で満たす; SQS 可視性タイムアウト ≥ 消費 Lambda のタイムアウト; 既存重複排除・認可を維持  
**Scale/Scope**: 単一キュー + 1 消費 Lambda; 既存 011 の SQS パターンと概念的に整合

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

プロジェクトの constitution (`.specify/memory/constitution.md`) はテンプレートのままであり、プロジェクト固有の原則は未定義。以下を満たす:

- **Tests**: 変更後も既存の単体・統合テストが通ること。新規 Lambda・SQS に対するテストを追加する。
- **No regressions**: Slack メンション → 200 即返却 → 非同期で Verification Agent 実行 → Slack 投稿のフローが維持されること。
- **Observability**: キュー投入・消費のログとメトリクス（CloudWatch）を構造化ログで出力する。

**Result**: PASS — 非同期化は責務分離の拡張であり、既存の検証ゾーンによる Slack 投稿責務は維持する。

## 016 の流れ（実装で実現するフロー）

実装後に実現するエンドツーエンドの流れを以下に固定する。

1. **Slack** → メンションイベントを **SlackEventHandler Lambda** の Function URL に POST
2. **SlackEventHandler** 内で 署名検証 → Existence Check → Whitelist → レート制限 → 重複排除 → 👀 リアクション付与（015 と同一）
3. **SlackEventHandler** は InvokeAgentRuntime を呼ばず、**実行リクエストを SQS（agent-invocation-request）に送信して即 200 を返す**
4. **SQS** が **Agent Invoker Lambda** を起動
5. **Agent Invoker Lambda** がメッセージから `task_data` を復元し、**InvokeAgentRuntime(Verification Agent)** を呼ぶ
6. **Verification Agent** が payload を受信し、検証パイプライン（Existence / Whitelist / レート制限）を実行
7. **Verification Agent** が A2A で **Execution Agent** を呼ぶ（InvokeAgentRuntime + SigV4）
8. **Execution Agent** が Bedrock で推論し、`response_text` や `file_artifact` を返す
9. **Verification Agent** が Slack API（post_to_slack / post_file_to_slack）でスレッドに投稿
10. ユーザーに返信が表示される（アカウント間は A2A のみ。SQS は検証アカウント内のみ）

**効果**: Slack には SQS 送信直後に 200 が返り、エージェント実行は Agent Invoker Lambda（最大 15 分）で行うため、長時間処理でも返信が届く。

## Project Structure

### Documentation (this feature)

```text
specs/016-async-agentcore-invocation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (SQS message schema, etc.)
├── DATA-FLOW.md         # データの流れの解説
└── tasks.md             # Phase 2 output (実装タスク一覧)
```

### Source Code (repository root)

```text
cdk/
├── lib/
│   └── verification/
│       ├── verification-stack.ts       # Add SQS queue, Agent Invoker Lambda; wire SlackEventHandler → SQS
│       ├── constructs/
│       │   ├── slack-event-handler.ts  # Change: enqueue to SQS then return 200 (remove sync InvokeAgentRuntime)
│       │   ├── agent-invoker.ts        # NEW: Lambda with SQS event source → InvokeAgentRuntime(Verification Agent)
│       │   └── ...                     # Existing (VerificationAgentRuntime, etc.)
│       └── lambda/
│           ├── slack-event-handler/    # Modify handler: SQS send then 200
│           └── agent-invoker/          # NEW: SQS handler → boto3 invoke_agent_runtime
├── test/
│   └── verification-stack.test.ts      # Update: assert SQS, Agent Invoker Lambda, permissions
```

**Structure Decision**: 既存 CDK の verification スタック内に、SQS キューと Agent Invoker Lambda を追加。SlackEventHandler は同期的な InvokeAgentRuntime をやめ、SQS 送信のみ行う。

## Complexity Tracking

不要。Constitution 違反なし。既存 011 の SQS 非同期パターンを「受信 → 実行開始」に適用する拡張である。
