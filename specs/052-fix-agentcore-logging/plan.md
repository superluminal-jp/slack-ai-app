# Implementation Plan: Fix AgentCore Runtime Logging to CloudWatch

**Branch**: `052-fix-agentcore-logging` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/052-fix-agentcore-logging/spec.md`

## Summary

All 6 AgentCore agent `logger_util.py` files set `logger.propagate = False`, preventing Python log records from reaching the OTel logging bridge on the root logger. Because AgentCore does not capture raw container stdout, only OTel telemetry reaches CloudWatch. The fix is a one-line change per file: remove `logger.propagate = False`. No Dockerfile or requirements changes are needed. Tests must be written first (TDD) to confirm propagation behavior before and after the fix.

## Technical Context

**Language/Version**: Python 3.11 (`python:3.11-slim`, ARM64)
**Primary Dependencies**: `aws-opentelemetry-distro~=0.10.0` (already installed in all agents), `strands-agents[a2a,otel]~=1.25.0`, `pytest`
**Storage**: N/A (logging infrastructure change only)
**Testing**: pytest (`python -m pytest tests/ -v` from each agent zone)
**Target Platform**: Amazon Bedrock AgentCore Runtime (ARM64 container, `opentelemetry-instrument python main.py` entrypoint)
**Project Type**: Multi-zone multi-agent service
**Performance Goals**: Log entries appear in CloudWatch within 60 seconds of `log()` call
**Constraints**: `_StdoutHandler` must remain functional for local/pytest use; no duplicate CloudWatch entries; no OTel import at module level (avoids hard import failure when OTel not present)
**Scale/Scope**: 6 agent source directories across 5 execution zones + 1 verification zone

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. SDD — spec exists with Given/When/Then | ✅ | `specs/052-fix-agentcore-logging/spec.md` complete |
| II. TDD — tests written before implementation | ✅ | Test tasks precede implementation tasks in `tasks.md` |
| III. Security-First — security pipeline unchanged | ✅ | Only `_setup()` propagation flag changed; security checks untouched |
| IV. Fail-open/Fail-closed semantics | ✅ | `log()` call sites not modified; fail-open/fail-closed exception blocks unchanged |
| V. Zone isolation | ✅ | Each agent's `logger_util.py` changed independently; no cross-zone imports added |
| VI. Docs & deploy-script parity | ✅ | CHANGELOG, README, CLAUDE.md updated in same commit |
| VII. Clean code identifiers | ✅ | No spec numbers or branch names in code, docstrings, or comments |

No violations. Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/052-fix-agentcore-logging/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── tasks.md             # Phase 2 output (/speckit.tasks)
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (affected files only)

```text
verification-zones/
├── verification-agent/src/
│   └── logger_util.py                          ← propagate fix
└── slack-search-agent/src/
    └── logger_util.py                          ← propagate fix

execution-zones/
├── docs-agent/src/
│   └── logger_util.py                          ← propagate fix
├── file-creator-agent/src/
│   └── logger_util.py                          ← propagate fix
├── time-agent/src/
│   └── logger_util.py                          ← propagate fix
└── fetch-url-agent/src/
    └── logger_util.py                          ← propagate fix

# Tests added alongside each logger_util.py:
verification-zones/verification-agent/tests/
└── test_logger_util.py                         ← NEW (TDD)
verification-zones/slack-search-agent/tests/
└── test_logger_util.py                         ← NEW (TDD)
execution-zones/docs-agent/tests/
└── test_logger_util.py                         ← NEW (TDD)
execution-zones/file-creator-agent/tests/
└── test_logger_util.py                         ← NEW (TDD)
execution-zones/time-agent/tests/
└── test_logger_util.py                         ← NEW (TDD)
execution-zones/fetch-url-agent/tests/
└── test_logger_util.py                         ← NEW (TDD)

# Documentation (same commit):
CHANGELOG.md                                    ← [Unreleased] entry
CLAUDE.md                                       ← Recent Changes update
```

**Structure Decision**: Single-project fix pattern. Each agent zone is independently updated with its own test file. No new modules, interfaces, or infrastructure.

## Design: The Fix

### Official Pattern Confirmation (AWS MCP)

AWS Starter Toolkit and official examples do not use `propagate = False`. Two confirmed patterns:

```python
# Pattern 1 — A2A official example (my_a2a_server.py):
logging.basicConfig(level=logging.INFO)  # configures root logger directly
logging.info(f"Runtime URL: {runtime_url}")

# Pattern 2 — BedrockAgentCoreApp internal SDK:
self.logger = logging.getLogger("bedrock_agentcore.app")
handler = logging.StreamHandler()
self.logger.addHandler(handler)
# propagate NOT set to False → defaults to True → root logger receives records
```

Both patterns allow records to reach the OTel bridge installed on the root logger by `opentelemetry-instrument`. Our `propagate = False` is the sole deviation.

### Root Cause

```python
# _setup() in every logger_util.py — current (broken) state:
def _setup() -> None:
    logger = logging.getLogger(LOGGER_NAME)
    if logger.handlers:
        return
    logger.setLevel(...)
    logger.propagate = False          # ← blocks OTel bridge on root logger
    handler = _StdoutHandler()
    logger.addHandler(handler)
```

### Fix

```python
# _setup() after fix — remove propagate = False:
def _setup() -> None:
    logger = logging.getLogger(LOGGER_NAME)
    if logger.handlers:
        return
    logger.setLevel(...)
    # propagate defaults to True — records flow to root logger → OTel bridge → CloudWatch
    handler = _StdoutHandler()
    logger.addHandler(handler)
```

### Log Flow After Fix

```
log() call
  │
  ├── _StdoutHandler → sys.stdout (captured by pytest; not captured by AgentCore)
  │
  └── [propagate = True] → root logger
        └── OTel LoggingHandler (installed by opentelemetry-instrument)
              └── ADOT OTLP exporter → CloudWatch otel-rt-logs ✅
```

### Also Fix: Dockerfile Comments

All 6 Dockerfiles contain `# Unbuffer stdout/stderr so logs appear in CloudWatch immediately (AgentCore captures container stdout)`. This is factually incorrect. The comment must be corrected to: `# Unbuffer stdout/stderr for local development; OTel telemetry is routed to CloudWatch via opentelemetry-instrument`.

### Not Changed

- `_StdoutHandler` class — remains for pytest capsys compatibility
- `log()` function signature and behavior — unchanged
- Log schema fields (`level`, `event_type`, `service`, `timestamp`) — unchanged
- `agent/verification-agent/logger_util.py` — not deployed (CDK uses `src/`)
- `cdk/lib/lambda/slack-response-handler/logger_util.py` — Lambda captures stdout natively
- `requirements.txt` — ADOT already present in all agents
- CDK stacks — no infrastructure changes needed

## Test Strategy (TDD)

Each `test_logger_util.py` must verify:

1. **Propagation enabled**: `get_logger().propagate is True` (red before fix; green after)
2. **Stdout still works**: `log()` call appears in `capsys.readouterr().out` (must remain green throughout)
3. **OTel bridge receives records**: mock root logger with a `Mock` handler; after `log()`, assert `mock_handler.emit.called`
4. **No duplicate stdout emission**: exactly one line per `log()` call in captured stdout

Test structure example:
```python
import logging
import json
from logger_util import get_logger, log

def test_logger_propagates_to_root():
    assert get_logger().propagate is True

def test_log_writes_to_stdout(capsys):
    logger = get_logger()
    log(logger, "info", "test.event", {"key": "value"})
    out = capsys.readouterr().out
    assert '"event_type": "test.event"' in out

def test_root_logger_handler_receives_record():
    root_logger = logging.getLogger()
    mock_handler = logging.handlers.MemoryHandler(capacity=10)
    root_logger.addHandler(mock_handler)
    try:
        logger = get_logger()
        log(logger, "info", "test.otel", {"key": "val"})
        assert any("test.otel" in r.getMessage() for r in mock_handler.buffer)
    finally:
        root_logger.removeHandler(mock_handler)
        mock_handler.close()
```

---

## Phase 2 Fix: Enable OTel Python Logging Bridge (2026-03-24)

### Root Cause Correction

The Phase 1 fix (removing `propagate = False`) was necessary but insufficient. Per [AWS ADOT Python docs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLP-UsingADOT.html), `opentelemetry-instrument` does NOT auto-instrument Python logging. The environment variable `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` must be set explicitly to install the OTel logging bridge handler on the root logger.

### Fix

Add `ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` to each agent Dockerfile. This is set alongside `PYTHONUNBUFFERED=1` as a container-level environment variable.

### Log Flow After Phase 2 Fix

```
log() call
  │
  ├── _StdoutHandler → sys.stdout (local dev, pytest capture)
  │
  └── [propagate = True] → root logger
        └── OTel LoggingHandler (NOW INSTALLED by opentelemetry-instrument
              because OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true)
              └── ADOT OTLP exporter → AgentCore collector → CloudWatch ✅
```

### Affected Dockerfiles

All 6 agent Dockerfiles need the new ENV line:
- `verification-zones/verification-agent/src/Dockerfile`
- `verification-zones/slack-search-agent/src/Dockerfile`
- `execution-zones/docs-agent/src/Dockerfile`
- `execution-zones/file-creator-agent/src/Dockerfile`
- `execution-zones/time-agent/src/Dockerfile`
- `execution-zones/fetch-url-agent/src/Dockerfile`
