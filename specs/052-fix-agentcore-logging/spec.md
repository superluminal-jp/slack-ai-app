# Feature Specification: Fix AgentCore Runtime Logging to CloudWatch

**Feature Branch**: `052-fix-agentcore-logging`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "aws mcp や公式ドキュメントを参照して @verification-zones/ のログ設定を正しくcloudwatchに記録が残るように修正"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator Investigates Agent Failure via CloudWatch (Priority: P1)

An operator receives an alert that a Slack request was not processed. They open CloudWatch Logs and search for the correlation ID to trace what happened inside the agent — existence check, whitelist validation, rate limit, A2A invocation.

**Why this priority**: Structured application logs are the primary diagnostic tool for production incidents. Without them, root-cause analysis is impossible.

**Independent Test**: Deploy the agent, invoke it with a Slack event, then query CloudWatch Logs for the `correlation_id`. Verify that log entries from each pipeline stage appear.

**Acceptance Scenarios**:

1. **Given** an agent is running in AgentCore Runtime, **When** a Slack event is processed, **Then** structured JSON log entries for each pipeline stage appear in CloudWatch Logs within 60 seconds.
2. **Given** a security pipeline stage rejects a request (e.g., rate limit exceeded), **When** the rejection occurs, **Then** an ERROR-level log entry with `correlation_id`, `error`, and `error_type` fields appears in CloudWatch Logs.
3. **Given** the agent encounters an infrastructure failure (e.g., DynamoDB timeout), **When** the failure is caught, **Then** a WARNING-level log entry with `correlation_id` and `error` appears in CloudWatch Logs (fail-open behavior preserved).

---

### User Story 2 - Developer Verifies Log Output During Local Testing (Priority: P2)

A developer runs the agent locally with pytest and expects `log()` calls to produce readable output in the terminal, confirming application logic is executing correctly.

**Why this priority**: Local test visibility ensures the change does not break existing test behavior.

**Independent Test**: Run the full pytest suite for each agent and confirm all existing tests pass; confirm `log()` output is capturable via pytest's stdout capture.

**Acceptance Scenarios**:

1. **Given** the agent is run locally without OTel instrumentation, **When** `log()` is called, **Then** structured JSON appears in terminal stdout without error.
2. **Given** pytest captures stdout, **When** `log()` is called in a test, **Then** the output is capturable without modifying any test code.

---

### Edge Cases

- What happens when OTel is not available at import time (local run without `opentelemetry-instrument`)? The logger must fall back gracefully to stdout-only output without import errors.
- What if the same log record is emitted twice (once via OTel handler, once via stdout handler)? Each `log()` call must produce exactly one entry in CloudWatch — no duplicates.
- Each agent has its own `logger_util.py` with a different logger name — all must be fixed independently and consistently.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-01**: When an agent runs inside AgentCore Runtime under `opentelemetry-instrument`, all `log()` calls at INFO level and above must produce log entries visible in the agent's CloudWatch log stream.
- **FR-02**: Each CloudWatch log entry must preserve the structured fields produced by `log()` — `level`, `event_type`, `service`, `timestamp`, and all caller-supplied data fields.
- **FR-03**: When an agent runs locally without OTel, `log()` calls must continue to write structured JSON to stdout without error.
- **FR-04**: Existing pytest tests that capture stdout must pass without modification.
- **FR-05**: The fix must apply to all agents in `verification-zones/` (verification-agent, slack-search-agent) and all agents in `execution-zones/`.
- **FR-06**: Each `log()` call must produce exactly one log entry in CloudWatch — no duplicates.

### Non-Functional Requirements

- **NFR-01**: Log entries must appear in CloudWatch within 60 seconds of the `log()` call under normal conditions.
- **NFR-02**: The change must not increase agent cold-start latency by more than 500 ms.
- **NFR-03**: The change must be backward-compatible with agents run without OTel instrumentation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-01**: After deploying the fixed agents, a CloudWatch Logs query for a `correlation_id` from a real Slack invocation returns at least one structured log entry per pipeline stage.
- **SC-02**: The full pytest suite for each affected agent produces zero new test failures.
- **SC-03**: A CloudWatch Logs query returns no duplicate entries for any single `log()` call.
- **SC-04**: Running an agent locally with `python main.py` (no OTel) produces structured JSON to stdout without crashing.

## Scope

### In Scope

- `logger_util.py` in each agent under `verification-zones/` and `execution-zones/`
- Any Dockerfile or startup configuration change needed to route application logs through OTel
- Unit tests validating both the OTel-active path and the stdout-only fallback path

### Out of Scope

- Changing the log schema (fields, format) — existing structured JSON format is preserved
- Adding `APPLICATION_LOGS` delivery configuration via CloudWatch Logs delivery API — separate infrastructure concern
- Adding new log levels or log categories
- Changing the OTel `otel-rt-logs` stream name or destination

## Assumptions

1. AgentCore Runtime forwards only OTel telemetry to CloudWatch (`otel-rt-logs` stream). Raw container stdout is not separately captured. **Confirmed by two independent sources**: (a) live `aws logs describe-log-streams` shows only `otel-rt-logs` with no separate stdout stream; (b) AWS MCP / Starter Toolkit Quickstart documents the log location as `CloudWatch → /aws/bedrock-agentcore/runtimes/{agent-id}-DEFAULT` with no mention of a separate stdout stream.
2. `opentelemetry-instrument python main.py` is already in use in all agent Dockerfiles; the ADOT SDK is already installed. No infrastructure changes required.
3. ~~The OTel logging bridge installs a handler on the Python root logger when `opentelemetry-instrument` runs.~~ **CORRECTED (2026-03-24)**: The OTel Python logging bridge is **NOT** auto-installed by `opentelemetry-instrument`. Per [AWS ADOT docs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLP-UsingADOT.html), `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` must be explicitly set to enable the logging bridge. Without it, only traces/metrics are instrumented. The 052 Phase 1 fix (removing `propagate = False`) was necessary but insufficient — log records propagate to root but no OTel handler exists to export them.
4. With `propagate = True` AND `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true`, stdout output (via `_StdoutHandler`) and CloudWatch export (via OTel bridge on root logger) go to different destinations. No duplicate entries occur in CloudWatch.

## Dependencies

- ADOT SDK (`aws-opentelemetry-distro`) already installed in all agent containers
- `opentelemetry-instrument` already used as the container entrypoint in all agent Dockerfiles
- Each agent has its own `logger_util.py` — all must be updated independently
