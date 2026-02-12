# Quickstart: Echo Mode Disable — Full Pipeline Validation with TDD

**Branch**: `022-echo-mode-disable-validation` | **Date**: 2026-02-09

## Prerequisites

- Python 3.11+
- pytest installed (`pip install pytest`)
- Working directory: `cdk/lib/verification/agent/verification-agent/`

## Run Tests

```bash
# Run all verification agent tests
cd cdk/lib/verification/agent/verification-agent
pytest tests/ -v

# Run only 022 tests (after implementation)
pytest tests/test_main.py -v -k "Test022"

# Run with coverage
pytest tests/ --cov=. --cov-report=term-missing
```

## TDD Workflow

```bash
# 1. RED: Write failing tests
#    Edit tests/test_main.py — add Test022 classes
pytest tests/test_main.py -v -k "Test022"
# Expected: FAILED (tests written, implementation not yet updated)

# 2. GREEN: Implement to pass tests
#    Edit pipeline.py — add/modify logic
pytest tests/test_main.py -v -k "Test022"
# Expected: PASSED

# 3. REFACTOR: Clean up while keeping green
pytest tests/ -v
# Expected: All tests PASSED (no regressions)
```

## Echo Mode Configuration

```bash
# Enable echo mode (returns [Echo] prefix, skips execution)
export VALIDATION_ZONE_ECHO_MODE=true

# Disable echo mode (delegates to Execution Agent — this feature)
export VALIDATION_ZONE_ECHO_MODE=false
# or
unset VALIDATION_ZONE_ECHO_MODE
```

## Key Files

| File | Purpose |
|------|---------|
| `pipeline.py` | Verification pipeline business logic |
| `tests/test_main.py` | Unit tests (add Test022 classes here) |
| `tests/conftest.py` | Mock fixtures for FastAPI, uvicorn, slack_sdk |
| `main.py` | A2A FastAPI entrypoint (calls `pipeline.run()`) |
| `a2a_client.py` | Execution Agent invocation client |

## Verify Normal Flow (Manual)

1. Set `VALIDATION_ZONE_ECHO_MODE=false` in CDK context or environment
2. Deploy verification agent: `cdk deploy SlackAI-Verification-Dev`
3. Send message to Slack bot
4. Verify: AI response appears (not `[Echo]` prefix)
5. Check CloudWatch logs for correlation_id tracing
