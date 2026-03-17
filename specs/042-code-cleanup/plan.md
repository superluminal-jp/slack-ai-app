# Implementation Plan: Code Cleanup — Logs, Comments, Dead Code in verification-zones

**Branch**: `042-code-cleanup` | **Date**: 2026-03-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/042-code-cleanup/spec.md`

## Summary

Remove all spec-number annotations (`(NNN)`), unused imports, dead code, and raw `print()` calls from `verification-zones/` source files. Replace raw `print()` in Lambda handlers with the existing structured logger module. No behavior change; all existing tests must remain green.

## Technical Context

**Language/Version**: Python 3.11 (agent source and Lambda handlers), TypeScript 5.x (CDK constructs and tests)
**Primary Dependencies**: ruff (linting), pytest (Python tests), Jest/npm test (CDK tests)
**Storage**: N/A — cleanup only, no storage changes
**Testing**: `python -m pytest tests/ -v` (verification-agent), `cd cdk && npm test` (CDK zones)
**Target Platform**: verification-zones source files only (no runtime environment changes)
**Project Type**: Multi-zone (Python agent + TypeScript CDK)
**Performance Goals**: N/A
**Constraints**: Zero behavior change; all tests green before and after every task; ruff F401 clean after
**Scale/Scope**: ~20 Python source files, ~10 TypeScript source files across verification-agent and slack-search-agent

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Required checks for every PR (constitution v1.1.0)**:
- [x] **SDD (I)**: spec in `specs/042-code-cleanup/` exists; acceptance criteria are Given/When/Then verifiable
- [x] **TDD (II)**: test tasks precede implementation tasks; Red→Green→Refactor planned — for this cleanup, "Red" = confirm baseline passes, change, confirm still green
- [x] **Security-First (III)**: no security pipeline changes; cleanup is purely cosmetic/dead-code removal
- [x] **Zone Isolation (V)**: no cross-zone imports introduced or changed
- [x] **Doc & Deploy Parity (VI)**: CHANGELOG and CLAUDE.md update tasks included; no CDK stack changes so deploy script unaffected

## Project Structure

### Documentation (this feature)

```text
specs/042-code-cleanup/
├── plan.md              # This file
├── research.md          # Phase 0 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (affected directories)

```text
verification-zones/
├── verification-agent/
│   ├── src/                          # AgentCore container source (primary)
│   │   ├── agent_card.py             # remove unused: json
│   │   ├── agent_tools.py            # remove unused: inspect
│   │   ├── cloudwatch_metrics.py     # remove unused: json
│   │   ├── event_dedupe.py           # remove unused: typing.Optional
│   │   ├── existence_check.py        # remove unused: json
│   │   ├── orchestrator.py           # remove unused: asyncio, field, Literal
│   │   ├── pipeline.py               # remove unused: router imports × 3, invoke_execution_agent,
│   │   │                             #   get_agent_arn, log_execution_agent_error_response
│   │   ├── rate_limiter.py           # remove unused: json
│   │   ├── slack_post_request.py     # remove spec numbers (028)
│   │   ├── slack_poster.py           # remove unused: json
│   │   └── s3_file_manager.py        # remove spec numbers (024, 028)
│   ├── tests/
│   │   └── test_pipeline_usage_history.py  # remove spec numbers (039)
│   └── cdk/
│       ├── lib/
│       │   ├── constructs/
│       │   │   ├── usage-history-archive-bucket.ts   # remove spec numbers (041)
│       │   │   ├── usage-history-replication.ts      # remove spec numbers (041) including inline string
│       │   │   ├── verification-agent-runtime.ts     # remove spec numbers (039, 024)
│       │   │   ├── slack-event-handler.ts            # remove spec numbers (016)
│       │   │   ├── slack-poster.ts                   # remove spec numbers (019)
│       │   │   └── agent-invoker.ts                  # remove spec numbers (016)
│       │   └── verification-stack.ts                 # remove spec numbers (016)
│       ├── lambda/
│       │   ├── dynamodb-export-job/handler.py        # remove spec number (040), remove unused: json
│       │   ├── agent-invoker/handler.py              # remove spec number (016)
│       │   └── slack-event-handler/
│       │       ├── api_gateway_client.py             # remove unused: os, Credentials
│       │       ├── attachment_extractor.py           # remove unused: typing.Optional
│       │       ├── bedrock_client.py                 # DELETE — orphan file, unused, all print()
│       │       ├── event_dedupe.py                   # remove unused: typing.Optional; migrate print() → logger
│       │       ├── handler.py                        # remove unused: time, AuthorizationError, set_lambda_context
│       │       ├── logger.py                         # remove unused: sys
│       │       ├── secrets_manager_client.py         # remove unused: os
│       │       ├── slack_verifier.py                 # migrate print() → log_error
│       │       └── token_storage.py                  # migrate print() → log_error
│       └── test/
│           ├── verification-stack.test.ts            # remove spec numbers (024, 031) from describe labels
│           └── dynamodb-export-job.test.ts           # remove spec number (040) from file header
└── slack-search-agent/
    └── (no changes — ruff clean, no spec numbers)
```

## Implementation Approach

This is a pure refactoring/cleanup with no new logic. Three work streams:

### Stream A — Unused Imports (ruff F401 autofix)

Use `ruff check --select F401 --fix` where safe (stdlib/third-party), then verify. Manual removal for project-internal imports (where auto-fix might need cross-module review first).

**Pre-condition**: Run `pytest` baseline, confirm all pass. Then fix imports, rerun.

### Stream B — Spec-Number Comment Removal

Surgical targeted edits to remove `(NNN)` patterns from:
- Python: module docstrings, function docstrings, inline comments
- TypeScript: JSDoc comments, `describe()` labels, inline property comments
- Preserve `(429)` in `existence_check.py` — HTTP status code, not a spec number
- Preserve all explanatory text around removed spec numbers

**TypeScript inline string exception**: `usage-history-replication.ts` line 47 contains `(041)` inside a CDK construct `description` prop string — remove it from the description value too.

### Stream C — Raw `print()` Migration (Lambda handlers)

Migrate 4 files to use the existing `logger.py` module in `slack-event-handler/`:

| File | Current | Target |
|------|---------|--------|
| `event_dedupe.py` | `print(f"Warning: …")` | `log_warn(…)` |
| `event_dedupe.py` | `print(f"DynamoDB error…")` | `log_error(…)` |
| `slack_verifier.py` | `print(f"Signature verification error: …")` | `log_error(…)` |
| `token_storage.py` | `print(f"Error retrieving token…")` | `log_error(…)` |

Delete `bedrock_client.py` entirely (orphan, unused, no imports from other files).

**Note**: `logger.py`, `slack-poster/handler.py`, `agent-invoker/handler.py`, and `slack-response-handler/logger.py` use `print(json.dumps(…))` as their structured logging output mechanism — this is intentional and must not be changed.

## Quality Gates

| Gate | Check | Tool |
|------|-------|------|
| Baseline passes | `pytest` exits 0 before any change | pytest |
| No F401 in src/ | `ruff check src/ --select F401` exits 0 | ruff |
| No F401 in lambda/ | `ruff check cdk/lib/lambda/ --select F401` exits 0 | ruff |
| No spec numbers | `grep -r '([0-9]\{3\})' src/ cdk/lib/ tests/ \| grep -v '(429)'` returns empty | grep |
| No orphan print() | `grep -rn 'print(' cdk/lib/lambda/ \| grep -v 'json.dumps\|>>>\|doctest'` returns empty (except intentional logger lines) | grep |
| Tests still pass | `pytest tests/ -v` exits 0 | pytest |
| CDK tests pass | `cd cdk && npm test` exits 0 | jest |
