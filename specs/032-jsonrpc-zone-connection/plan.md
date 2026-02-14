# Implementation Plan: CSP に依らない A2A 接続（JSON-RPC 2.0）

**Branch**: `032-jsonrpc-zone-connection` | **Date**: 2026-02-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/032-jsonrpc-zone-connection/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

**CSP に依らない A2A 接続**を実現するため、Verification Zone と Execution Zone 間のリクエスト/レスポンスを、現行のカスタム envelope（`{"prompt": "<task_json>"}` / `{"status": "success"|"error", ...}`）から **JSON-RPC 2.0** に変更する。Verification は JSON-RPC 2.0 Request（method, params, id）を送信し、Execution は JSON-RPC 2.0 Response（result または error, id）を返す。**アプリケーション層の契約はトランスポート・CSP に依存しない**設計とし、現在は AWS InvokeAgentRuntime をトランスポートの一実装として利用するが、同一契約で他 CSP や直接 HTTPS への切り替えを可能にする。research と contracts で単一メソッド（`execute_task`）、params/result/error の形、および JSON-RPC 2.0 標準エラーコードを定義する。

## Technical Context

**Language/Version**: Python 3.11 (Verification Agent, Execution Agent; containers `python:3.11-slim`, ARM64)  
**Primary Dependencies**: Verification: FastAPI, uvicorn, boto3 (bedrock-agentcore), slack-sdk. Execution: Starlette/FastAPI, uvicorn, bedrock-agentcore, boto3. CDK: TypeScript 5.x, aws-cdk-lib.  
**Storage**: N/A for this feature (protocol only). Existing: DynamoDB, S3, Secrets Manager unchanged.  
**Testing**: pytest (Verification: `cdk/lib/verification/agent/verification-agent`, Execution: `cdk/lib/execution/agent/execution-agent`); contract tests for JSON-RPC request/response shapes.  
**Target Platform**: AWS (Lambda/AgentCore Runtime), ap-northeast-1, ARM64.  
**Project Type**: Multi-component (Verification Zone, Execution Zone, CDK); agents under `cdk/lib/{verification,execution}/agent/`.  
**Performance Goals**: No regression in end-to-end latency; JSON-RPC envelope adds negligible overhead.  
**Constraints**: アプリケーション層は JSON-RPC 2.0 に統一しトランスポート非依存。現行は InvokeAgentRuntime のバイナリペイロード（最大 100 MB）に JSON-RPC Request を載せる。Execution は body で JSON-RPC を受け取り JSON-RPC で返す。認証（例: SigV4）はトランスポートごとに設定可能。  
**Scale/Scope**: 単一 JSON-RPC メソッド（execute task）のみ。バッチ・通知は対象外。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution file (`.specify/memory/constitution.md`) is a template with placeholder principles; no project-specific gates are defined. This feature does not introduce new services or storage; it only changes the application-layer protocol between existing Verification and Execution agents. No violations asserted.

## Project Structure

### Documentation (this feature)

```text
specs/032-jsonrpc-zone-connection/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (JSON-RPC method schema)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
cdk/
├── lib/
│   ├── verification/
│   │   └── agent/verification-agent/   # A2A client (invoke_execution_agent), pipeline
│   │       ├── a2a_client.py            # Change: build JSON-RPC Request, parse JSON-RPC Response
│   │       ├── pipeline.py
│   │       └── tests/
│   └── execution/
│       └── agent/execution-agent/      # POST / handler
│           ├── main.py                 # Change: accept JSON-RPC body, return JSON-RPC Response
│           └── tests/
├── README.md
└── (stacks, config)
```

**Structure Decision**: 既存の多ゾーン構成を維持。Verification Zone (a2a_client.py) は JSON-RPC 2.0 Request を組み立て、**トランスポート抽象**（現状は InvokeAgentRuntime のバイナリペイロード）で送信する。Execution Zone (main.py) は JSON-RPC Request をパースし、method でディスパッチして JSON-RPC 2.0 Response を返す。A2A 契約は CSP 非依存のため、トランスポート層（例: AWS 専用クライアント）は差し替え可能とする。新規ディレクトリは不要; 変更は Request/Response のエンコード/デコードとエラー写像に限定する。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
