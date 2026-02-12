# Implementation Plan: Echo at Verification Agent (AgentCore Runtime)

**Branch**: `018-echo-at-agentcore-runtime` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/018-echo-at-agentcore-runtime/spec.md`  
**Goal**: AWS MCP ベストプラクティスに従い、AgentCore Runtime の動作検証ができる MVP を優先する。

## Summary

エコーモード時もリクエストを **Lambda → SQS → Agent Invoker → Verification Agent (AgentCore Runtime)** まで通し、**Runtime 側**で Execution Zone を呼ばず [Echo] を Slack に返す。017 の「Lambda 内エコー」をやめ、018 では Lambda はエコーモード時も SQS に送り、エコーは Verification Agent のみで行う。これにより AgentCore Runtime まで経路が通っていることを検証できる。

## Technical Context

**Language/Version**: Python 3.11 (Verification Agent, SlackEventHandler Lambda), TypeScript (CDK, Node 18+)  
**Primary Dependencies**: 既存 aws-cdk-lib, bedrock_agentcore.runtime, slack_sdk, boto3 — 追加依存なし  
**Storage**: なし（エコーはリクエストコンテキストからその場で生成）  
**Testing**: 既存 pytest (verification-agent, slack-event-handler), Jest (CDK) — エコー分岐の単体テストを追加  
**Target Platform**: AWS ap-northeast-1; Lambda (SlackEventHandler), Verification Agent (AgentCore Runtime) を変更  
**Project Type**: Infrastructure (CDK) + serverless Lambda + AgentCore Runtime コンテナ  
**Performance Goals**: エコー応答は Slack 再試行を招かない時間（目安 3 秒以内）で完了  
**Constraints**: エコーモード有効時は Execution Zone を一切呼ばない；既存の A2A 入力形式・Agent Invoker は変更しない  
**Scale/Scope**: Validation Zone 内の 2 箇所変更（SlackEventHandler Lambda の 017 エコー分岐の挙動変更、Verification Agent にエコー分岐追加）；Execution Zone は変更しない

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

プロジェクトの constitution (`.specify/memory/constitution.md`) はテンプレートのまま。以下を満たす:

- **Tests**: 既存の Verification Agent / SlackEventHandler 単体テストが通ること。エコーモード有効・無効の分岐に対するテストを追加する。
- **No regressions**: エコーモード無効時は従来どおり Execution Agent が呼ばれること。
- **Observability**: エコーモードで応答した場合に構造化ログ（例: `echo_mode_response`）を出力し、動作確認しやすくする。

**Result**: PASS — Validation Zone 内の分岐追加・017 の挙動変更のみで、既存フローを壊さない。

## 018 のフロー（エコーモード有効時）

1. **Slack** → メンション → **SlackEventHandler Lambda**（署名検証 → Existence Check → Whitelist → レート制限 → 重複排除）
2. **Lambda**: 017 の「エコーモードなら Lambda でエコーして return」を **行わない**。常に SQS に送信して 200 を返す。
3. **Agent Invoker** → SQS からメッセージを取得 → **Verification Agent (AgentCore Runtime)** を InvokeAgentRuntime で呼び出し
4. **Verification Agent**: セキュリティ検証（Existence Check, Whitelist, Rate Limit）の後、**エコーモード有効**なら Execution を呼ばず、[Echo] + 本文を Slack に投稿し、A2A で成功応答を返す。
5. **Slack** に [Echo] が表示される。

## Project Structure

### Documentation (this feature)

```text
specs/018-echo-at-agentcore-runtime/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (echo at runtime)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

変更は Validation Zone に限定する。

```text
cdk/
├── lib/
│   └── verification/
│       ├── constructs/
│       │   ├── slack-event-handler.ts     # 017: エコーモード時も SQS に送る（Lambda でエコーしない）
│       │   └── verification-agent-runtime.ts  # VALIDATION_ZONE_ECHO_MODE を Runtime に渡す
│       └── lambda/
│           └── slack-event-handler/
│               └── handler.py             # 017 のエコー分岐を削除または「echo 時は SQS に送る」に変更
│       └── agent/
│           └── verification-agent/
│               ├── main.py                 # エコーモード時: Execution を呼ばず [Echo] を Slack に投稿
│               └── tests/
│                   └── test_main.py        # エコー分岐のテスト
├── test/
│   └── verification-stack.test.ts          # 任意: Runtime に VALIDATION_ZONE_ECHO_MODE が渡ることを検証
```

**Structure Decision**: 既存の 016/017 構成を維持。018 では (1) SlackEventHandler の 017 エコー分岐を「エコーモード時は SQS に送る」に変更、(2) Verification Agent Runtime に環境変数 `VALIDATION_ZONE_ECHO_MODE` を渡し、(3) Verification Agent のエントリポイントでエコーモード有効時は Execution を呼ばず Slack に [Echo] を投稿する分岐を追加する。

## Complexity Tracking

不要。Constitution 違反なし。既存フローに分岐を追加し、017 の Lambda 側エコーを「SQS に送る」に変更するだけの MVP とする。
