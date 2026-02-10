# Implementation Plan: Echo Mode Disable — Full Pipeline Validation with TDD

**Branch**: `022-echo-mode-disable-validation` | **Date**: 2026-02-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/022-echo-mode-disable-validation/spec.md`

## Summary

Validate the verification pipeline's normal flow (echo mode disabled) by writing comprehensive TDD tests for all pipeline paths — security checks, execution delegation, error handling, and structured logging. Apply AWS Well-Architected best practices: structured JSON logging with correlation IDs, defensive error handling, and security-first pipeline ordering. The existing `pipeline.py` implementation largely works; this feature ensures every path is tested and documented.

## Technical Context

**Language/Version**: Python 3.11 (`python:3.11-slim`, ARM64 container)
**Primary Dependencies**: FastAPI ~0.115.0, uvicorn ~0.34.0, boto3 ~1.34.0, slack-sdk ~3.27.0, strands-agents[a2a] ~1.25.0
**Storage**: DynamoDB (existence check cache, whitelist, rate limit, dedupe), SQS (async invocation, Slack post requests)
**Testing**: pytest with unittest.mock (existing pattern); conftest.py mocks FastAPI, uvicorn, slack_sdk
**Target Platform**: AWS Bedrock AgentCore Runtime (containerized, port 9000, A2A protocol)
**Project Type**: Serverless/container hybrid (Lambda + AgentCore Runtime)
**Performance Goals**: Slack 3-second constraint for initial response; async processing via SQS
**Constraints**: No new dependencies; maintain existing test patterns; TDD commit order
**Scale/Scope**: ~20 new test methods across 4 test classes; minimal pipeline.py changes

## Constitution Check

*GATE: Passed — no constitution violations.*

The project constitution is a placeholder template. Applied implicit principles:
- Test-First (TDD): Explicitly required by spec FR-006
- Simplicity: Minimal code changes; leverage existing patterns
- Observability: Structured logging enhancement

## Project Structure

### Documentation (this feature)

```text
specs/022-echo-mode-disable-validation/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: AWS best practices research
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Development quickstart
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
cdk/lib/verification/agent/verification-agent/
├── main.py              # A2A FastAPI entrypoint
├── pipeline.py          # Verification pipeline (primary target)
├── authorization.py     # Whitelist authorization
├── existence_check.py   # Entity existence verification
├── rate_limiter.py      # Rate limiting
├── a2a_client.py        # Execution Agent client
├── slack_post_request.py # Slack post via SQS
└── tests/
    ├── conftest.py      # Test fixtures
    └── test_main.py     # Unit tests (add Test022* classes)
```

**Structure Decision**: No new files or directories. All new tests go into existing `test_main.py`. All implementation changes go into existing `pipeline.py`.

## Design Decisions

### D-001: Test Organization

New test classes follow existing naming convention (`Test{FeatureNumber}{Description}`):

| Test Class | Purpose | ~Methods |
|------------|---------|----------|
| `Test022NormalFlowDelegation` | Echo mode off → execution delegation path | 5 |
| `Test022ExecutionErrorPaths` | All error code mappings and exception handling | 6 |
| `Test022StructuredLogging` | Log format verification (JSON, correlation_id, event_type) | 4 |
| `Test022EdgeCases` | Env var parsing, invalid responses, file artifact errors | 5 |

### D-002: Log Verification Strategy

Capture `print()` output using pytest's `capsys` fixture to verify structured log format:

```python
def test_log_contains_correlation_id(self, capsys, ...):
    handle_message(payload)
    captured = capsys.readouterr()
    for line in captured.out.strip().split('\n'):
        log = json.loads(line)
        assert 'correlation_id' in log
```

### D-003: Pipeline Enhancement (Minimal)

Based on research, three small improvements to `pipeline.py`:

1. **Log `parse_file_artifact` failures** — currently returns `None` silently on invalid Base64
2. **Handle `json.JSONDecodeError`** in execution result parsing — currently assumes valid JSON
3. **Ensure `is_processing = False`** on all error paths — verify via test

These are minimal changes that make existing code more robust without changing behavior.

### D-004: TDD Commit Strategy

Commit order to satisfy SC-003 (TDD evidence in commit history):

1. `test(022): RED — add Test022 test classes for normal flow validation` (all tests fail)
2. `feat(022): GREEN — pipeline enhancements to pass new tests` (all tests pass)
3. `refactor(022): REFACTOR — improve readability, no behavior change` (if needed)

## AWS Best Practices Applied

### Operational Excellence (OPS)

| Practice | Current State | Enhancement |
|----------|--------------|-------------|
| OPS-01: Structured logging | `_log()` emits JSON with correlation_id | Verify all paths log; add step timing |
| OPS-02: Correlation tracing | correlation_id propagated | Test log traceability end-to-end |
| OPS-03: Error classification | ERROR_MESSAGE_MAP with 9 codes | Test all codes produce friendly messages |

### Reliability (REL)

| Practice | Current State | Enhancement |
|----------|--------------|-------------|
| REL-01: Graceful degradation | try/except around execution delegation | Add json.JSONDecodeError handling |
| REL-02: Error isolation | Each security check independent | Test each check independently |
| REL-03: State management | `is_processing` flag for health check | Verify reset on all error paths |

### Security (SEC)

| Practice | Current State | Enhancement |
|----------|--------------|-------------|
| SEC-01: Defense in depth | Existence → Auth → Rate Limit pipeline | Test pipeline order enforcement |
| SEC-02: No internal leakage | Friendly messages to users | Test no stack traces/ARNs in Slack messages |
| SEC-03: Input validation | Payload parsing with defaults | Test malformed input handling |

## Complexity Tracking

No violations — all changes are within existing files using established patterns.
