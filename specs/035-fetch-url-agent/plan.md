# Implementation Plan: Web Fetch Agent (fetch_url 独立エージェント化)

**Branch**: `035-fetch-url-agent` | **Date**: 2026-02-21 | **Spec**: [spec.md](spec.md)
**Input**: `fetch_url` ツールを `execution-agent` から分離し、独立した `fetch-url-agent` として展開する。

---

## Summary

`execution-agent` に統合されていた `fetch_url` ツールを分離し、URL コンテンツ取得専用の独立エージェント `fetch-url-agent` を新設する。既存の SSRF 防止・サイズ制限・タイムアウトロジックはそのまま移植する。ルーターはエージェントカード自動発見により新エージェントを認識する。コード変更なしで `EXECUTION_AGENT_ARNS` 環境変数に ARN を追加するだけで統合が完了する。

---

## Technical Context

**Language/Version**: Python 3.11 (`python:3.11-slim`, ARM64)
**Primary Dependencies**: `strands-agents[a2a,otel]~=1.25.0`, `fastapi~=0.115.0`, `uvicorn~=0.34.0`, `boto3~=1.42.0`, `requests~=2.31.0`, `beautifulsoup4~=4.12.0`
**Storage**: N/A（新規ストレージなし。DynamoDB/S3 は verification-agent が管理）
**Testing**: `pytest` (`python -m pytest tests/ -v` — ゾーンごと)
**Target Platform**: AWS AgentCore Runtime（Linux ARM64 コンテナ）
**Project Type**: 新規 Execution Zone（既存パターンに準拠）
**Performance Goals**: URL 取得 10 秒以内（既存タイムアウト）、512 KB 上限（既存制限）
**Constraints**: SSRF 防止必須、http/https のみ許可、最大返却 14,000 文字
**Scale/Scope**: 単一実行エージェント、ツール 1 つ（`fetch_url`）

---

## Constitution Check

*GATE: Phase 0 前に確認。Phase 1 設計後に再確認。*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-First | ✅ PASS | spec.md 存在、Given/When/Then 形式で受け入れ基準定義済み |
| II. TDD | ✅ PASS | タスク設計でテストタスクが実装タスクより先行する |
| III. Security-First | ✅ PASS | SSRF 防止・スキーム検証をそのまま移植、動作変更なし |
| IV. Fail-Open Infra / Fail-Closed Security | ✅ PASS | fetch_url のエラーハンドリングはユーザーフレンドリーメッセージで fail-open |
| V. Zone-Isolated | ✅ PASS | 新エージェント = 新実行ゾーン。A2A プロトコル経由でのみ通信 |

**Constitution Check 再確認（Phase 1 設計後）**: 全原則クリア。ゾーン分離（原則 V）を強化する変更である。

---

## Project Structure

### Documentation (this feature)

```text
specs/035-fetch-url-agent/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── a2a-contract.yaml  # A2A OpenAPI contract
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# New: fetch-url-agent execution zone
execution-zones/fetch-url-agent/
├── src/
│   ├── main.py                    # FastAPI app (POST /, GET /ping, GET /.well-known/agent-card.json)
│   ├── agent_factory.py           # Strands Agent — fetch_url tool only
│   ├── agent_card.py              # SlackAI-WebFetchAgent card
│   ├── system_prompt.py           # Web-fetch focused system prompt
│   ├── logger_util.py             # Structured CloudWatch logging (copy)
│   ├── response_formatter.py      # JSON-RPC response formatting (copy)
│   ├── bedrock_client_converse.py # Bedrock Converse API (copy)
│   ├── requirements.txt           # Minimal: strands, fastapi, requests, beautifulsoup4
│   └── tools/
│       └── fetch_url.py           # Moved from execution-agent (no changes)
├── tests/
│   ├── conftest.py
│   ├── test_fetch_url.py          # 16 tests from execution-agent (moved)
│   ├── test_agent_factory.py      # Verify single tool
│   ├── test_agent_card.py         # Verify SlackAI-WebFetchAgent card
│   └── test_main.py               # Endpoint tests
├── cdk/
│   ├── bin/app.ts
│   ├── lib/
│   │   ├── web-fetch-agent-stack.ts
│   │   └── constructs/
│   │       ├── web-fetch-agent-runtime.ts
│   │       └── web-fetch-agent-ecr.ts
│   ├── types/
│   │   └── stack-config.ts
│   ├── cdk.json
│   └── package.json
├── scripts/
│   └── deploy.sh
└── Dockerfile

# Modified: execution-agent (fetch_url removed)
execution-zones/execution-agent/src/
├── agent_factory.py    # Remove fetch_url import/tool (7 tools remain)
├── agent_card.py       # Remove fetch_url skill; update description
├── system_prompt.py    # Remove fetch_url rule; update tool list
├── requirements.txt    # Remove requests, beautifulsoup4
└── tools/
    └── fetch_url.py    # DELETE (moved to fetch-url-agent)

execution-zones/execution-agent/tests/
├── test_agent_factory.py  # Update: 7 tools, no fetch_url
├── test_agent_card.py     # Update: no fetch_url skill
└── test_fetch_url.py      # DELETE (moved to fetch-url-agent/tests/)

# Modified: verification-agent (config only, no code changes)
# EXECUTION_AGENT_ARNS env var gets new "web-fetch" entry at deploy time
```

**Structure Decision**: Reuse execution-zone pattern (single CDK app per agent). New `fetch-url-agent` zone mirrors `execution-agent` structure exactly except: (1) single tool, (2) no file attachment handling needed (text-only output), (3) smaller requirements.txt.

---

## Implementation Phases

### Phase A: TDD Setup — fetch-url-agent (RED)

Write failing tests for the new agent before any implementation code exists.

1. Create `execution-zones/fetch-url-agent/` directory skeleton
2. Copy `tests/test_fetch_url.py` from execution-agent → confirm 16 tests FAIL (module not found)
3. Write `tests/test_agent_factory.py` — assert `get_tools()` returns exactly `[fetch_url]`
4. Write `tests/test_agent_card.py` — assert card name is `SlackAI-WebFetchAgent`, 1 skill
5. Write `tests/test_main.py` — assert /ping, /.well-known/agent-card.json, POST / respond correctly

### Phase B: Implementation — fetch-url-agent (GREEN)

Implement the new agent to make all Phase A tests pass.

1. Move `fetch_url.py` tool (no changes)
2. Create `agent_factory.py` with single tool
3. Create `agent_card.py` with correct card
4. Create `system_prompt.py` for web-fetch context
5. Create `main.py` (simplified from execution-agent — no attachment handling)
6. Create `requirements.txt` (subset — no file-gen libs)
7. Copy `logger_util.py`, `response_formatter.py`, `bedrock_client_converse.py`

### Phase C: TDD Cleanup — execution-agent (RED → GREEN)

Remove fetch_url from execution-agent with test coverage.

1. Update `tests/test_agent_factory.py` → assert 7 tools, no fetch_url (RED first)
2. Update `tests/test_agent_card.py` → assert no fetch_url skill (RED first)
3. Delete `tests/test_fetch_url.py` from execution-agent
4. Remove fetch_url from `agent_factory.py` → tests GREEN
5. Remove fetch_url skill from `agent_card.py` → tests GREEN
6. Update `system_prompt.py` → remove fetch_url references
7. Remove `requests`, `beautifulsoup4` from `requirements.txt`
8. Delete `src/tools/fetch_url.py` from execution-agent

### Phase D: Infrastructure — CDK Stack

Create CDK stack for fetch-url-agent following execution-agent pattern.

1. Create `cdk/lib/constructs/web-fetch-agent-runtime.ts` (from ExecutionAgentRuntime)
2. Create `cdk/lib/constructs/web-fetch-agent-ecr.ts` (from ExecutionAgentEcr)
3. Create `cdk/lib/web-fetch-agent-stack.ts` (stack name: `SlackAI-WebFetch-{Dev|Prod}`)
4. Create `cdk/bin/app.ts`, `cdk.json`, `package.json`
5. Create `scripts/deploy.sh`
6. Create `Dockerfile`

### Phase E: Integration — Verification-Agent Registration

Register the new agent with the router (config only).

1. Add `web-fetch` ARN to `EXECUTION_AGENT_ARNS` in verification-agent CDK context/env
2. Verify router system prompt includes web-fetch agent capabilities
3. Run verification-agent tests to confirm routing logic picks up new agent

---

## Complexity Tracking

No constitution violations. This change simplifies the system by reducing scope of execution-agent (removal of unrelated capability) and strengthens zone isolation (principle V) by giving fetch_url its dedicated zone.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Router fails to route URL requests to new agent | Agent card description is specific: "URLのWebコンテンツ取得専用エージェント"; router LLM will prefer it |
| execution-agent loses `requests` dep but something else uses it | grep confirmed: only fetch_url.py imports `requests` in execution-agent src/ |
| CDK naming collision with existing stacks | Stack name `SlackAI-WebFetch-*` is distinct from `SlackAI-Execution-*` |
| Cold start regression on smaller container | Smaller image = faster cold start; positive effect |
