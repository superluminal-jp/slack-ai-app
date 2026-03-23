# Research: Fix AgentCore Runtime Logging to CloudWatch

## Decision 1: Does AgentCore capture container stdout/stderr?

**Decision**: No. AgentCore Runtime does NOT capture raw container stdout/stderr as a separate CloudWatch log stream. Only OTel telemetry (forwarded via the ADOT SDK to the `otel-rt-logs` stream) reaches CloudWatch.

**Rationale**: Live inspection of the CloudWatch log group for `SlackAI_VerificationAgent_Dev` shows a single stream `otel-rt-logs` containing OTel JSON records. No separate stdout stream exists. The Dockerfile comment "AgentCore captures container stdout" is incorrect.

**Source**: AWS documentation (AgentCore generated runtime observability data), confirmed via `aws logs describe-log-streams` on the live Dev environment.

**Alternatives considered**:
- `APPLICATION_LOGS` delivery configuration (CloudWatch Logs delivery API) — would require additional CDK infrastructure; deferred as separate concern
- Stdout capture via `PYTHONUNBUFFERED=1` — does not apply; AgentCore does not route stdout

---

## Decision 2: How does OTel logging bridge work with Python's logging module?

**Decision**: When `opentelemetry-instrument python main.py` runs with `aws-opentelemetry-distro`, the ADOT SDK instruments the Python root logger by adding a `LoggingHandler` (OTel bridge) to it. Any Python `logging.Logger` with `propagate = True` (the default) will forward log records up the hierarchy to the root logger, where the OTel bridge handler picks them up and exports them to CloudWatch.

**Rationale**: Python logging propagation does not re-check the parent logger's effective level — it invokes parent handlers directly. Handler level defaults to NOTSET (0), so all records pass through. The OTel bridge on the root logger therefore receives all propagated records regardless of the parent logger's level.

**Official confirmation (AWS MCP — Starter Toolkit source code)**: The `BedrockAgentCoreApp` class itself uses a named logger without `propagate = False`:
```python
# bedrock_agentcore/runtime (official SDK)
self.logger = logging.getLogger("bedrock_agentcore.app")
if not self.logger.handlers:
    handler = logging.StreamHandler()
    self.logger.addHandler(handler)
    # propagate is NOT set to False → defaults to True
```
The official A2A example uses `logging.basicConfig(level=logging.INFO)` directly on the root logger. Neither pattern uses `propagate = False`. Our `propagate = False` is a non-standard deviation that breaks OTel routing.

**Log destination confirmed (AWS MCP — Quickstart guide)**:
> Agent Logs → `CloudWatch → /aws/bedrock-agentcore/runtimes/{agent-id}-DEFAULT`

This matches the live `otel-rt-logs` stream observed in the Dev environment.

**Current bug**: All `logger_util.py` files set `logger.propagate = False`, preventing records from reaching the OTel bridge handler on the root logger. Records only go to `_StdoutHandler` → stdout, which AgentCore does not capture.

**Alternatives considered**:
- Explicitly import and add `LoggingHandler` to named logger — works but creates an OTel import dependency at the module level; fails gracefully in local environments but adds complexity
- Detect OTel availability at startup and conditionally configure — unnecessary complexity when simply enabling propagation achieves the same result
- Replace `_StdoutHandler` with OTel handler entirely — breaks local/pytest use case where OTel is not active

---

## Decision 3: Will removing `propagate = False` cause duplicate logs in CloudWatch?

**Decision**: No. With `propagate = True`:
- `_StdoutHandler` on the named logger → writes to stdout (not captured by AgentCore)
- OTel bridge handler on root logger → exports to CloudWatch `otel-rt-logs`

The two outputs go to different destinations (stdout vs CloudWatch). There is no duplication in CloudWatch.

**Rationale**: A single record traverses: named logger → `_StdoutHandler` (stdout) → propagates to root logger → `LoggingHandler` (CloudWatch). Each handler fires exactly once per record.

---

## Decision 4: Which `logger_util.py` files are deployed (AgentCore containers)?

**Decision**: Only the `src/logger_util.py` files in each agent directory. `agent/verification-agent/logger_util.py` is not deployed (CDK ECR build uses `src/`). `cdk/lib/lambda/slack-response-handler/logger_util.py` is for Lambda, which DOES capture stdout automatically — no change needed there.

**Files to change** (6 files):
1. `verification-zones/verification-agent/src/logger_util.py`
2. `verification-zones/slack-search-agent/src/logger_util.py`
3. `execution-zones/docs-agent/src/logger_util.py`
4. `execution-zones/file-creator-agent/src/logger_util.py`
5. `execution-zones/time-agent/src/logger_util.py`
6. `execution-zones/fetch-url-agent/src/logger_util.py`

**Files NOT changed**:
- `verification-zones/verification-agent/agent/verification-agent/logger_util.py` — not used by CDK ECR build
- `verification-zones/verification-agent/cdk/lib/lambda/slack-response-handler/logger_util.py` — Lambda (stdout captured natively)

---

## Decision 5: Are Dockerfile or requirements.txt changes needed?

**Decision**: No.

- `aws-opentelemetry-distro~=0.10.0` is already present in all 6 `requirements.txt` files
- All Dockerfiles already use `CMD ["opentelemetry-instrument", "python", "main.py"]`
- `opentelemetry-distro` uninstall is already in all Dockerfiles (prevents duplicate configurator warning)

**However**: All Dockerfiles contain a misleading comment: `# Unbuffer stdout/stderr so logs appear in CloudWatch immediately (AgentCore captures container stdout)`. This comment is factually incorrect and should be corrected to reflect the actual mechanism (OTel routing).

---

## Decision 6: Will existing tests break?

**Decision**: No. No existing test in any agent zone directly tests `logger.propagate` state or the internal handler list of the named logger. Tests use `capsys` (pytest's stdout capture) which captures `_StdoutHandler` output via `sys.stdout` — this behavior is unchanged.

**Evidence**: `grep -r "propagate" tests/` across all 6 agent test suites returns only unrelated code (S3 failure propagation, A2A callback propagation). No test asserts `propagate is False`.

---

## Runbook Queries (correlation_id lookup)

Use CloudWatch Logs Insights in `/aws/bedrock-agentcore/runtimes/{agent-id}-DEFAULT`:

```sql
fields @timestamp, event_type, level, service, correlation_id, error, error_type
| filter correlation_id = "corr-<your-id>"
| sort @timestamp asc
| limit 200
```

To verify no obvious duplicates for a specific event type:

```sql
fields correlation_id, event_type, @message
| filter correlation_id = "corr-<your-id>" and event_type = "test.root"
| stats count(*) as count by correlation_id, event_type
```

Expected: `count = 1` per single invocation path for the same logical event.

---

## Validation Evidence (local TDD)

- Added `tests/test_logger_util.py` in all 6 affected agent directories.
- Red phase confirmed before implementation (`propagate=False` caused failing assertions).
- Green phase confirmed after removing `logger.propagate = False` in all 6 runtime `src/logger_util.py` files.
- Per-directory command result after fix: `4 passed` for each new logger test file.
