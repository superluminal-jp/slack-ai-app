# Research: Web Fetch Agent (035-fetch-url-agent)

**Phase**: Phase 0 Output | **Date**: 2026-02-21

---

## 1. fetch_url Tool — Current State

**Decision**: Move `fetch_url` from `execution-agent` to a new `fetch-url-agent` without any behavioral changes.

**Rationale**: The existing implementation is battle-tested and complete. SSRF prevention, size limits, HTML extraction, and error handling are all correct. Zero-delta move preserves correctness.

**Alternatives considered**:
- Rewrite from scratch — Rejected: unnecessary risk of regression
- Add HTTP library switch (httpx) — Rejected: out of scope, no clear benefit

**Current location**: `execution-zones/execution-agent/src/tools/fetch_url.py`

**Constants preserved as-is**:
- `_MAX_RETURN_CHARS = 14_000`
- `_MAX_DOWNLOAD_BYTES = 512 * 1024` (512 KB)
- `_TIMEOUT_SECONDS = 10`
- `_PRIVATE_IP_RANGES` — RFC1918 + loopback SSRF blocks

---

## 2. New Agent Zone Structure

**Decision**: Mirror execution-agent directory layout exactly. Create `execution-zones/fetch-url-agent/`.

**Rationale**: The execution-agent is the canonical reference implementation for execution zones. Reusing its structure (FastAPI + uvicorn, agent_factory, agent_card, A2A endpoints) ensures:
- Consistent deployment patterns
- Identical A2A contract (`POST /`, `GET /ping`, `GET /.well-known/agent-card.json`)
- Reusable CDK constructs (ExecutionAgentRuntime, ExecutionAgentEcr)

**Files shared with execution-agent (copy, not symlink)**:
- `main.py` — simplified (no attachment handling needed for text-only responses)
- `agent_factory.py` — single tool: `fetch_url`
- `agent_card.py` — new name: `SlackAI-WebFetchAgent`
- `system_prompt.py` — web-fetch focused
- `logger_util.py` — identical
- `response_formatter.py` — identical
- `bedrock_client_converse.py` — identical

**Files unique to fetch-url-agent**:
- `src/tools/fetch_url.py` — moved from execution-agent
- `src/requirements.txt` — subset (no file-gen libs)

**Alternatives considered**:
- Shared library for common agent infrastructure — Rejected: premature abstraction, only 2 agents share it currently
- Serverless Lambda instead of AgentCore Runtime — Rejected: violates constitution principle V (zone consistency)

---

## 3. Requirements (fetch-url-agent)

**Decision**: Minimal requirements, removing all file-generation dependencies.

**Rationale**: fetch_url only needs `requests` and `beautifulsoup4`. Smaller container = faster cold start + smaller attack surface.

```
strands-agents[a2a,otel]~=1.25.0
aws-opentelemetry-distro~=0.10.0
uvicorn~=0.34.0
fastapi~=0.115.0
boto3~=1.42.0
requests~=2.31.0
beautifulsoup4~=4.12.0
```

**Removed from execution-agent** (if only used by fetch_url):
- `requests~=2.31.0` — CHECK: also used in execution-agent directly?
- `beautifulsoup4~=4.12.0` — only used by fetch_url

**Finding**: `requests` is not used elsewhere in execution-agent src/ (only in fetch_url.py). `beautifulsoup4` is only in fetch_url.py. Both can be removed from execution-agent after migration.

---

## 4. Agent Registration — Verification-Agent

**Decision**: Add web-fetch-agent ARN to `EXECUTION_AGENT_ARNS` environment variable in verification-agent. No code changes to verification-agent required.

**Rationale**: `agent_registry.py` reads `EXECUTION_AGENT_ARNS` as a JSON dict at startup. The CDK stack for verification-agent already handles this env var. Adding a new entry is purely configuration.

**Current EXECUTION_AGENT_ARNS format**:
```json
{
  "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:ACCOUNT:agent-runtime/RUNTIME_ID",
  "time-agent": "arn:aws:bedrock-agentcore:ap-northeast-1:ACCOUNT:agent-runtime/RUNTIME_ID"
}
```

**New entry**:
```json
{
  "file-creator": "...",
  "time-agent": "...",
  "web-fetch": "arn:aws:bedrock-agentcore:ap-northeast-1:ACCOUNT:agent-runtime/RUNTIME_ID"
}
```

**Alternatives considered**:
- Hardcode ARN in verification-agent code — Rejected: violates 12-factor app principles
- Use SSM Parameter Store for discovery — Rejected: over-engineering for current scale

---

## 5. CDK Stack for fetch-url-agent

**Decision**: Create `execution-zones/fetch-url-agent/cdk/` following execution-agent CDK pattern exactly.

**Key parameters**:
- Stack name: `SlackAI-WebFetch-{Dev|Prod}`
- Agent name: `SlackAI_WebFetchAgent_{Dev|Prod}`
- Constructs: `WebFetchAgentRuntime`, `WebFetchAgentEcr` (rename from Execution prefix)
- Output: `WebFetchAgentRuntimeArn`
- Deploy script: `execution-zones/fetch-url-agent/scripts/deploy.sh`

**Rationale**: Identical CDK structure ensures deploy scripts, CI/CD pipelines, and IAM patterns work consistently across all execution zones.

---

## 6. Routing Update — Verification-Agent

**Decision**: Router model automatically discovers new agent via agent card. No changes to routing code needed.

**Rationale**: `router.py` uses `select_agent()` tool with a dynamic system prompt built from discovered agent cards. The new agent's card (`SlackAI-WebFetchAgent`) describes its capability as web content fetching. The router LLM will correctly route URL-containing requests to it.

**Router discovery flow**:
1. `initialize_registry()` loads ARNs from `EXECUTION_AGENT_ARNS`
2. `discover_agent_card(arn)` fetches `/.well-known/agent-card.json` from each agent
3. System prompt built dynamically with each agent's skills
4. Router LLM selects agent based on skill match

**Agent card description** (new agent): "指定URLのWebコンテンツをテキストとして取得する専用エージェント。SSRFセキュリティ対策済み。"

---

## 7. Execution-Agent Cleanup

**Decision**: Remove `fetch_url` from execution-agent's tool list, agent card, system prompt, and requirements.txt.

**Files to modify**:
1. `src/agent_factory.py` — remove `fetch_url` import and from `get_tools()` list
2. `src/agent_card.py` — remove `fetch_url` skill from skills array; update description
3. `src/system_prompt.py` — remove rule (4) about fetch_url; update tool list
4. `src/requirements.txt` — remove `requests`, `beautifulsoup4`
5. `src/tools/fetch_url.py` — delete (moved to fetch-url-agent)

**Tests**:
- `tests/test_fetch_url.py` — delete (move to fetch-url-agent)
- `tests/test_agent_factory.py` — update to reflect 7 tools (not 8)
- `tests/test_agent_card.py` — update to reflect fetch_url skill removed

---

## 8. Test Strategy

**Decision**: Full TDD cycle per constitution. New tests before new code.

**New agent tests** (`execution-zones/fetch-url-agent/tests/`):
- `test_fetch_url.py` — copy from execution-agent, 16 existing tests preserved
- `test_agent_factory.py` — verify only fetch_url tool registered
- `test_agent_card.py` — verify SlackAI-WebFetchAgent card shape
- `test_main.py` — verify /ping, /.well-known/agent-card.json, POST / endpoints
- `conftest.py` — fixtures

**Modified execution-agent tests** (must pass after removal):
- `test_agent_factory.py` — 7 tools, no fetch_url
- `test_agent_card.py` — no fetch_url skill
- Remove `test_fetch_url.py`

**Alternatives considered**:
- Shared test fixtures via conftest at repo root — Rejected: zone isolation principle
