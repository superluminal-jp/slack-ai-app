# Quickstart: 053-remove-legacy-code

**Date**: 2026-03-24  
**Branch**: `053-remove-legacy-code`

## Prerequisites

- Python 3.11
- Node.js (for CDK)
- npm workspaces installed (`npm install` at repo root)

## Verification Steps

After implementing each deletion step, run the corresponding verification:

### 1. Verification Agent — Python Tests

```bash
cd verification-zones/verification-agent && python -m pytest tests/ -v
```

### 2. Verification Agent — CDK Tests

```bash
cd verification-zones/verification-agent/cdk && npm test
```

### 3. Slack Event Handler — Lambda Tests

```bash
cd verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler && python -m pytest tests/ -v
```

### 4. CDK Synth (All Zones)

```bash
cd verification-zones/verification-agent/cdk && npx cdk synth
```

### 5. Full Test Suite (All Zones)

```bash
cd execution-zones/file-creator-agent && python -m pytest tests/ -v
cd execution-zones/fetch-url-agent/src && python -m pytest ../tests/ -v
cd execution-zones/time-agent && python -m pytest tests/ -v
cd execution-zones/docs-agent && python -m pytest tests/ -v
cd verification-zones/verification-agent && python -m pytest tests/ -v
cd verification-zones/slack-search-agent && python -m pytest tests/ -v
```

### 6. Reference Check (Post-Deletion)

Verify no dangling references remain:

```bash
rg "agent/verification-agent" --type py --type ts
rg "api_gateway_client" --type py --type ts
rg "from router import" verification-zones/verification-agent/src/
```

Expected: zero matches (excluding specs/ and docs/).

## What Changed

| Deleted | File Count | Reason |
|---------|:----------:|--------|
| `verification-zones/verification-agent/agent/` | ~33 | Superseded by `src/` layout |
| `slack-event-handler/api_gateway_client.py` | 1 | A2A migration made it dead code |
| `slack-event-handler/tests/test_api_gateway_client.py` | 1 | Test for deleted module |
| `verification-agent/src/router.py` | 1 | Deprecated, zero production references |
| `verification-agent/tests/test_router.py` | 1 | Test for deleted module |
| **Total** | **~37** | |
