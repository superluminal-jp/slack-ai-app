# Quickstart: 036-iterative-reasoning

**Branch**: `036-iterative-reasoning`

## What Changes

| Component | Change |
|---|---|
| `verification-zones/verification-agent/src/orchestrator.py` | **New file** — `OrchestrationAgent` class |
| `verification-zones/verification-agent/src/agent_tools.py` | **New file** — per-agent `@tool` functions |
| `verification-zones/verification-agent/src/hooks.py` | **New file** — `MaxTurnsHook`, `ToolLoggingHook` |
| `verification-zones/verification-agent/src/pipeline.py` | Replace `route_request()` + `invoke_execution_agent()` section with `run_orchestration_loop()` |
| `verification-zones/verification-agent/src/router.py` | Obsoleted — logic absorbed into orchestrator |
| `verification-zones/verification-agent/cdk/` | Add `MAX_AGENT_TURNS` env var |
| `verification-zones/verification-agent/tests/` | New test files for orchestrator, tools, hooks |

## Local Test Commands

```bash
# Run all verification agent tests
cd verification-zones/verification-agent && python -m pytest tests/ -v

# Run only new orchestrator tests
cd verification-zones/verification-agent && python -m pytest tests/test_orchestrator.py tests/test_agent_tools.py tests/test_hooks.py -v

# Lint
cd verification-zones/verification-agent/src && ruff check .
```

## Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MAX_AGENT_TURNS` | `5` | Maximum agentic loop turns per request |
| `AWS_REGION` | (required) | AWS region for Bedrock |
| Existing: `ROUTER_MODEL_ID`, `*_AGENT_ARN` | (unchanged) | All existing env vars preserved |

## Deploy

```bash
# Verification zone only (no execution zone changes)
./execution-zones/verification-agent/scripts/deploy.sh
# Or full deploy:
./scripts/deploy/deploy-all.sh
```
