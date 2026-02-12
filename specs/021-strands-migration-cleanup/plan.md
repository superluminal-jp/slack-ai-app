# Implementation Plan: strands-agents 移行とインフラ整備

**Branch**: `021-strands-migration-cleanup` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-strands-migration-cleanup/spec.md`

## Summary

BedrockAgentCoreApp SDK の private API 依存を解消し、AWS 公式推奨の strands-agents A2AServer に移行する。併せて CloudWatch Metrics の IAM 名前空間不一致修正、依存パッケージバージョン固定、エコーモード設定の型安全化、E2E テスト自動化を実施する。

## Technical Context

**Language/Version**: Python 3.11 (コンテナ: `python:3.11-slim`, ARM64)
**Primary Dependencies**: `strands-agents[a2a]~=1.25.0`, `fastapi`, `uvicorn`, `boto3`, `slack-sdk`
**Storage**: DynamoDB (既存テーブル: dedupe, whitelist, rate_limit, existence_check_cache)
**Testing**: pytest (各エージェントディレクトリから個別実行)
**Target Platform**: AWS Bedrock AgentCore Runtime (A2A protocol, port 9000)
**Project Type**: CDK multi-stack (Verification + Execution)
**Performance Goals**: A2A レスポンス < 30s (Bedrock 処理含む)
**Constraints**: ARM64 コンテナ、A2A プロトコル準拠、ポート 9000 固定
**Scale/Scope**: 2 エージェント × main.py + tests + requirements.txt + 2 CDK コンストラクト + 1 型定義

## Constitution Check

*プロジェクト固有の Constitution 未定義。以下の一般原則を適用:*

| Gate | Status | Notes |
|------|--------|-------|
| TDD (テストファースト) | PASS | 各 US でテスト先行実装 |
| 後方互換 | PASS | エコーモードの既存指定方法を維持 (FR-012) |
| 最小変更原則 | PASS | 各 US が独立・最小スコープ |
| セキュリティ | PASS | IAM 最小権限の原則に準拠 |

## Project Structure

### Documentation (this feature)

```text
specs/021-strands-migration-cleanup/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── a2a-server-interface.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
cdk/
├── bin/cdk.ts                                        # CDK app entry (echo mode config 読み込み)
├── lib/types/cdk-config.ts                           # 型定義 (validationZoneEchoMode 追加)
├── lib/verification/
│   ├── agent/verification-agent/
│   │   ├── main.py                                   # strands-agents A2AServer に移行
│   │   ├── requirements.txt                          # バージョン固定
│   │   └── tests/
│   │       ├── conftest.py                           # Mock 更新
│   │       └── test_main.py                          # テスト更新
│   └── constructs/
│       └── verification-agent-runtime.ts             # IAM 名前空間修正
├── lib/execution/
│   ├── agent/execution-agent/
│   │   ├── main.py                                   # strands-agents A2AServer に移行
│   │   ├── requirements.txt                          # バージョン固定
│   │   └── tests/
│   │       ├── conftest.py                           # Mock 更新
│   │       └── test_main.py                          # テスト更新
│   └── constructs/
│       └── execution-agent-runtime.ts                # IAM 名前空間修正
└── test/                                              # CDK テスト (変更なし予定)

scripts/
└── deploy-split-stacks.sh                             # echo mode config 対応

tests/
└── e2e/                                               # NEW: E2E テスト
    └── test_slack_flow.py
```

**Structure Decision**: 既存の CDK マルチスタック構造を維持。E2E テストのみリポジトリルートに `tests/e2e/` として新規追加。

## User Story Implementation Design

### US1: CloudWatch Metrics 名前空間修正 (P1)

**Scope**: CDK IAM ポリシー条件の更新のみ。エージェントコード変更なし。

**変更ファイル**:
- `cdk/lib/verification/constructs/verification-agent-runtime.ts` (lines 129-142)
- `cdk/lib/execution/constructs/execution-agent-runtime.ts` (lines 105-118)

**変更内容**:
```typescript
// Before
conditions: {
  StringEquals: {
    "cloudwatch:namespace": "bedrock-agentcore",
  },
},

// After
conditions: {
  StringLike: {
    "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"],
  },
},
```

**テスト戦略**:
- CDK テスト: IAM ポリシー条件のスナップショットテスト更新
- デプロイ後: CloudWatch コンソールでメトリクス記録確認

**リスク**: 低。IAM 条件の拡大のみ（既存権限は削除しない）。

---

### US2: strands-agents A2AServer 移行 (P2)

**Scope**: 両エージェントの main.py を `BedrockAgentCoreApp` → strands-agents `A2AServer` + FastAPI に移行。

#### Verification Agent 移行設計

**Before** (現行パターン):
```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp
app = BedrockAgentCoreApp()

@app.route("/.well-known/agent-card.json", methods=["GET"])
def agent_card_endpoint(): ...

@app.route("/ping", methods=["GET"])
def ping_endpoint(): ...

@app.route("/", methods=["POST"])
async def a2a_root_handler(request):
    return await app._handle_invocation(request)  # Private API

@app.entrypoint
def handle_message(payload):
    return run_pipeline(payload)

app.run(port=9000)
```

**After** (strands-agents パターン):
```python
from strands import Agent
from strands.multiagent.a2a import A2AServer
from fastapi import FastAPI
import uvicorn

# Agent 定義（ツールとして run_pipeline を登録）
agent = Agent(
    name="Verification Agent",
    description="Validates Slack events and routes to Execution Agent",
    tools=[handle_message_tool],
    callback_handler=None,
)

a2a_server = A2AServer(
    agent=agent,
    serve_at_root=True,
    port=9000,
)

app = FastAPI()

@app.get("/ping")
def ping_endpoint(): ...

app.mount("/", a2a_server.to_fastapi_app())

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000)
```

**Key Changes**:
1. `BedrockAgentCoreApp` → `Agent` + `A2AServer` + `FastAPI`
2. `@app.entrypoint` → Agent Tool として登録
3. `@app.route("/")` + `_handle_invocation` → A2AServer 自動ルーティング（削除）
4. Agent Card → A2AServer 自動生成
5. `/ping` → FastAPI route（手動維持）

#### Execution Agent 移行設計

Verification Agent と同様の基本変更に加え:

**追加変更**: 非同期タスク管理パターンの移行
- `app.add_async_task()` / `app.complete_async_task()` → strands-agents の Task 管理に移行
- バックグラウンドスレッドパターンは、Agent の同期実行（executor が非同期化）に置き換え
- Bedrock 呼び出しを strands Tool として実装

**テスト戦略**:
- Mock を strands-agents 対応に更新（conftest.py）
- 既存テストの `@patch("main.app")` パターンを更新
- TDD: 新テスト作成 → FAIL 確認 → 実装 → PASS 確認

**リスク**: 中〜高。Execution Agent の非同期タスクパターンは根本的な再設計が必要。
**軽減策**: エコーモードで段階的に検証。Verification Agent を先行移行し、安定を確認してから Execution Agent に着手。

---

### US3: 依存パッケージバージョン固定 (P3)

**Scope**: 両エージェントの `requirements.txt` を更新。

**変更内容**: US2 完了後に実施（strands-agents 移行で依存関係が変わるため）。

**Verification Agent requirements.txt**:
```
strands-agents[a2a]~=1.25.0
uvicorn~=0.34.0
fastapi~=0.115.0
boto3~=1.34.0
slack-sdk~=3.27.0
requests~=2.31.0
```

**Execution Agent requirements.txt**:
```
strands-agents[a2a]~=1.25.0
uvicorn~=0.34.0
fastapi~=0.115.0
boto3~=1.34.0
requests~=2.31.0
PyPDF2~=3.0.0
openpyxl~=3.1.0
```

**削除**: `bedrock-agentcore`（strands-agents で完全置換）

---

### US4: エコーモード設定型安全化 (P4)

**Scope**: `CdkConfig` 型定義に `validationZoneEchoMode` を追加。

**変更ファイル**:
- `cdk/lib/types/cdk-config.ts`: インターフェース + Zod スキーマ
- `cdk/bin/cdk.ts`: config ファイルからの読み込みロジック

**変更内容**:
```typescript
// cdk-config.ts
interface CdkConfig {
  // ... existing properties
  validationZoneEchoMode?: boolean;  // NEW
}

// Zod schema
validationZoneEchoMode: z.boolean().optional().default(false),
```

**後方互換**: 既存のコンテキスト変数 (`--context validationZoneEchoMode=true`) と環境変数 (`VALIDATION_ZONE_ECHO_MODE=true`) も引き続きサポート。config ファイル > コンテキスト変数 > 環境変数の優先順位。

---

### US5: E2E テスト自動化 (P5)

**Scope**: Slack → Agent → Slack の全フロー検証スクリプト。

**新規ファイル**: `tests/e2e/test_slack_flow.py`

**テスト内容**:
1. Slack API でボットにメンションメッセージを送信
2. 一定時間内にレスポンスが返ることを確認
3. レスポンス内容の検証（エコーモード: `[Echo] {テキスト}`）
4. 各ステップのレイテンシ記録

**前提条件**: デプロイ済み環境 + Slack Bot Token + テスト用チャンネル

---

## Implementation Order

```
US1 (P1, IAM 修正)
  ↓ (独立、最小変更)
US2 (P2, strands-agents 移行)
  ├── Verification Agent (先行)
  └── Execution Agent (後続)
  ↓ (依存: US2 完了後)
US3 (P3, バージョン固定)
  ↓ (独立)
US4 (P4, echo mode config) ← US1 と並行可能
  ↓ (全 US 完了後)
US5 (P5, E2E テスト)
```

**並行実施可能**:
- US1 と US4 は独立（異なるファイル）
- US2 内で Verification Agent と Execution Agent は直列（先行検証のため）

## Complexity Tracking

| Decision | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| FastAPI wrapper around A2AServer | `/ping` エンドポイントの手動登録が必要 | A2AServer 単体では `/ping` 未対応 |
| Agent + Tool パターン | strands-agents の標準アーキテクチャ | `@app.entrypoint` は BedrockAgentCoreApp 固有 |
| `StringLike` for IAM namespace | `SlackAI/*` プレフィックスで将来の名前空間を自動カバー | `StringEquals` + 列挙は名前空間追加のたびにIAM更新必要 |
