# Implementation Plan: Validation Zone Echo for AgentCore Verification

**Branch**: `017-validation-zone-echo` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/017-validation-zone-echo/spec.md`  
**User**: AWS MCP を使用してベストプラクティスに従った実装の計画を立てる。MVPとして動作することが最重要

## Summary

Execution zone への通信を一時停止し、Validation zone 内で Slack から受信した内容をそのまま Slack に返す「エコーモード」を導入する。**目的は AgentCore（検証ゾーン側の Verification Agent / AgentCore Runtime）の動作確認**である。MVP では SlackEventHandler Lambda に環境変数でエコーモードを有効化し、有効時は SQS 送信・AgentCore 呼び出しを行わず、受信メッセージ本文をスレッドに投稿して 200 を返す。AWS の Lambda 環境変数ベストプラクティス（設定の切り替えに環境変数を使用）に従い、最小変更で動作する MVP を優先する。

## Technical Context

**Language/Version**: TypeScript (CDK, Node 18+), Python 3.11 (Lambda)  
**Primary Dependencies**: 既存 aws-cdk-lib, slack_sdk (WebClient), boto3 — 追加依存なし  
**Storage**: なし（エコー内容はリクエストからその場で生成）  
**Testing**: 既存 pytest (slack-event-handler), Jest (CDK) — エコーモード分岐の単体テストを追加  
**Target Platform**: AWS ap-northeast-1; Lambda (SlackEventHandler) のみ変更  
**Project Type**: Infrastructure (CDK) + serverless Lambda  
**Performance Goals**: エコー時も Slack 3 秒以内応答（既存の即時 200 + chat_postMessage で達成）  
**Constraints**: エコーモード有効時は SQS 送信・InvokeAgentRuntime を一切呼ばない；既存の署名検証・Existence Check・Whitelist・レート制限・重複排除は維持  
**Scale/Scope**: 検証ゾーンの 1 Lambda の分岐追加；Execution zone および Verification Agent コードは変更しない（MVP）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

プロジェクトの constitution (`.specify/memory/constitution.md`) はテンプレートのままであり、プロジェクト固有の原則は未定義。以下を満たす:

- **Tests**: 既存の SlackEventHandler 単体テストが通ること。エコーモード有効・無効の分岐に対するテストを追加する。
- **No regressions**: エコーモード無効時は従来どおり SQS 送信または AgentCore 呼び出しが行われること。
- **Observability**: エコーモードで応答した場合に構造化ログで `echo_mode_response` 等を出力し、動作確認しやすくする。

**Result**: PASS — 検証ゾーン内の分岐追加のみで、既存フローを壊さない。

## 017 のフロー（エコーモード有効時）

1. **Slack** → メンション/メッセージを **SlackEventHandler Lambda** の Function URL に POST
2. **SlackEventHandler** 内で 署名検証 → Existence Check → Whitelist → レート制限 → 重複排除（従来どおり）
3. **event_callback** かつ **message / app_mention** のとき、bot メッセージ除外・本文検証の後、
   - **エコーモード有効**（環境変数で判定）:
     - 👀 リアクションは既存どおり付与可能
     - **SQS 送信・InvokeAgentRuntime は行わない**
     - 受信したメッセージ本文（`user_text`）をそのスレッドに `chat_postMessage` で投稿
     - 直後に **200** を返す
   - **エコーモード無効**:
     - 従来どおり SQS へ送信（キュー URL が設定されている場合）または InvokeAgentRuntime を呼び、200 を返す

## Project Structure

### Documentation (this feature)

```text
specs/017-validation-zone-echo/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (echo response format)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

変更は検証ゾーンの SlackEventHandler に限定する（MVP）。

```text
cdk/
├── lib/
│   └── verification/
│       ├── constructs/
│       │   └── slack-event-handler.ts   # Add env VALIDATION_ZONE_ECHO_MODE (optional)
│       └── lambda/
│           └── slack-event-handler/
│               ├── handler.py          # Branch: if echo mode → post echo to Slack, return 200; else existing SQS/AgentCore path
│               └── tests/
│                   └── test_handler.py  # Tests for echo mode on/off, no SQS/AgentCore when on
├── test/
│   └── verification-stack.test.ts      # Optional: assert env var is configurable (no change if env is optional)
```

**Structure Decision**: 既存 CDK の verification スタック内の SlackEventHandler のみ変更。エコーモードは環境変数 `VALIDATION_ZONE_ECHO_MODE`（例: `"true"`）で有効化し、CDK ではオプションの環境変数として渡す（未設定時は従来動作）。Verification Agent や Execution zone 側のコードは触れない。

## Complexity Tracking

不要。Constitution 違反なし。既存フローに分岐を 1 本追加するだけの MVP とする。
