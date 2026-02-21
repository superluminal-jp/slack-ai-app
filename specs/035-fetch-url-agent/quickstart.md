# Quickstart: Web Fetch Agent (035-fetch-url-agent)

**Date**: 2026-02-21

---

## Overview

This feature extracts `fetch_url` from `execution-agent` into a standalone `fetch-url-agent`. After implementation:

- `execution-zones/fetch-url-agent/` — new dedicated agent, only `fetch_url` tool
- `execution-zones/execution-agent/` — `fetch_url` removed, file-generation only
- `verification-zones/verification-agent/` — registers new agent via `EXECUTION_AGENT_ARNS` env var

---

## Local Development

### Run fetch-url-agent locally

```bash
cd execution-zones/fetch-url-agent/src

# Install dependencies
pip install -r requirements.txt

# Set required env vars
export BEDROCK_MODEL_ID="jp.anthropic.claude-sonnet-4-5-20250929-v1:0"
export AWS_REGION_NAME="ap-northeast-1"
export AGENTCORE_RUNTIME_URL="http://localhost:9000"

# Start server
python main.py
# Server runs on http://localhost:9000
```

### Test endpoints manually

```bash
# Health check
curl http://localhost:9000/ping

# Agent card discovery
curl http://localhost:9000/.well-known/agent-card.json

# Invoke (requires SigV4 in production; for local dev, invoke directly)
curl -X POST http://localhost:9000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "execute_task",
    "id": "test-001",
    "params": {
      "messages": [{"role": "user", "content": [{"type": "text", "text": "https://example.com の内容を教えて"}]}]
    }
  }'
```

---

## Run Tests

### fetch-url-agent tests (TDD: write before implement)

```bash
cd execution-zones/fetch-url-agent
python -m pytest tests/ -v
```

### execution-agent tests (regression check after fetch_url removal)

```bash
cd execution-zones/execution-agent
python -m pytest tests/ -v
```

### verification-agent tests (routing verification)

```bash
cd verification-zones/verification-agent
python -m pytest tests/ -v
```

---

## Deploy

### Step 1: Deploy fetch-url-agent (new execution zone)

```bash
export DEPLOYMENT_ENV=dev
cd execution-zones/fetch-url-agent
./scripts/deploy.sh
# Note the output: WebFetchAgentRuntimeArn = arn:aws:bedrock-agentcore:...
```

### Step 2: Deploy execution-agent (with fetch_url removed)

```bash
export DEPLOYMENT_ENV=dev
cd execution-zones/execution-agent
./scripts/deploy.sh --force-rebuild
```

### Step 3: Update verification-agent EXECUTION_AGENT_ARNS

Add the new ARN from Step 1 to the verification-agent's CDK context or environment:

```json
{
  "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:ACCOUNT:agent-runtime/FILE_CREATOR_ID",
  "time-agent":   "arn:aws:bedrock-agentcore:ap-northeast-1:ACCOUNT:agent-runtime/TIME_AGENT_ID",
  "web-fetch":    "arn:aws:bedrock-agentcore:ap-northeast-1:ACCOUNT:agent-runtime/WEB_FETCH_ID"
}
```

### Step 4: Deploy verification-agent (pick up new ARN)

```bash
# From repo root (deploy all in correct order)
./scripts/deploy/deploy-all.sh
```

---

## Validation Checklist

After deployment, verify acceptance criteria:

```bash
# SC-001: URL fetch routes to web-fetch agent
# → Send Slack message: "https://example.com の内容を教えて"
# → Verify response comes from SlackAI-WebFetchAgent (check agent card attribution)

# SC-002: File generation still works
# → Send Slack message: "Python で Hello World のスクリプトを書いて"
# → Verify execution-agent (file-creator) responds correctly

# SC-003: Security constraints preserved
# → SSRF: "http://192.168.1.1 を教えて" → blocked
# → Timeout: point at a slow server → 10s timeout message
# → Size limit: very large page → truncated at 14,000 chars

# SC-004: Agent appears in list
# → GET /list_agents on verification-agent → web-fetch included

# SC-005: execution-agent tests pass
cd execution-zones/execution-agent && python -m pytest tests/ -v
```

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Web-fetch agent not found by router | Verify `EXECUTION_AGENT_ARNS` includes `web-fetch` ARN |
| URL fetch blocked | Check SSRF logs — URL may resolve to private IP |
| Routing to wrong agent | Verify agent card description is distinct from file-creator |
| execution-agent tests fail | Confirm fetch_url import removed from agent_factory.py |
