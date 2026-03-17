# Research: Code Cleanup — verification-zones

**Branch**: `042-code-cleanup` | **Date**: 2026-03-17 | **Phase**: 0

## 1. Scope Boundaries

**Decision**: Clean `src/`, `cdk/lib/lambda/`, `cdk/lib/constructs/`, `cdk/lib/`, `cdk/test/`, and `tests/` within `verification-zones/`. Exclude `cdk.out/`, `node_modules/`, compiled `.d.ts`/`.js`, and the legacy `agent/verification-agent/` directory.

**Rationale**: CDK builds from `src/` (confirmed in `verification-agent-ecr.ts`: `path.join(__dirname, "../../../src")`). Tests in `tests/` use `src/` via `conftest.py` sys.path injection. The `agent/` directory is a git-tracked legacy snapshot not used for builds or tests; cleaning it would create divergence without value, and it does not affect any running system.

**Alternatives considered**: Including `agent/` — rejected because it would double the change surface with no operational benefit since `src/` is the authoritative source.

---

## 2. Logging Patterns in Use

**Decision**: Two distinct logging mechanisms exist and are both correct for their context; do not unify.

| Context | Mechanism | Pattern |
|---------|-----------|---------|
| AgentCore container (`src/`) | `logger_util.log()` | `log(logger, "INFO", "event_type", {…, "correlation_id": …})` |
| Lambda handlers (`cdk/lib/lambda/*/`) | `print(json.dumps(…))` via per-Lambda `logger.py` module | `log_info(…)` / `log_warn(…)` / `log_error(…)` |

**Rationale**: AgentCore containers capture structured stdout. Lambda functions similarly capture stdout → CloudWatch. Each zone has its own logger module already in place. The fix is not to change the mechanism but to migrate files that call raw `print()` instead of using the local logger.

**Files using raw `print()` instead of Lambda logger (`cdk/lib/lambda/slack-event-handler/`):**
- `bedrock_client.py`: 8 raw `print()` calls — not used by any other handler file (orphan module). Entire file is unused; remove it along with its `print()` calls.
- `event_dedupe.py`: 4 raw `print()` calls — must migrate to `log_warn`/`log_error` from local `logger` module.
- `slack_verifier.py`: 1 raw `print()` call — migrate to `log_error`.
- `token_storage.py`: 1 raw `print()` call — migrate to `log_error`.

**Lambda files that use `print(json.dumps(…))` as the logging mechanism itself** (`logger.py` in each Lambda zone, `slack-poster/handler.py`, `agent-invoker/handler.py`) — these are intentional and correct; do not change.

---

## 3. Spec-Number Patterns — Complete Inventory

**Decision**: Remove all patterns matching `\(\d{3}\)` from comments/docstrings, preserving explanatory intent.

**Note**: `(429)` in `existence_check.py` is an HTTP status code, not a spec number. It matches the regex but should be preserved as-is (it documents retry behavior for HTTP 429 errors). Disambiguate by context, not purely by regex.

### TypeScript files (`cdk/lib/constructs/`, `cdk/lib/`, `cdk/test/`):

| File | Pattern | Line type |
|------|---------|-----------|
| `constructs/usage-history-archive-bucket.ts` | `(041)` | JSDoc comment |
| `constructs/usage-history-replication.ts` | `(041)` × 2 | JSDoc + inline string |
| `constructs/verification-agent-runtime.ts` | `(039)` × 2, `(024)` | JSDoc |
| `constructs/slack-event-handler.ts` | `(016)` | JSDoc |
| `constructs/slack-poster.ts` | `(019)` | JSDoc |
| `constructs/agent-invoker.ts` | `(016)` | JSDoc |
| `lib/verification-stack.ts` | `(016)` | JSDoc |
| `test/verification-stack.test.ts` | `(024)`, `(031)` | `describe()` label |
| `test/dynamodb-export-job.test.ts` | `(040)` | file-level comment |

### Python files (`src/`, `cdk/lib/lambda/`, `tests/`):

| File | Pattern | Line type |
|------|---------|-----------|
| `src/slack_post_request.py` | `(028)` × 2 | module docstring, function docstring |
| `src/s3_file_manager.py` | `(024)`, `(028)` × 3 | module docstring, function docstrings |
| `cdk/lib/lambda/dynamodb-export-job/handler.py` | `(040)` | module docstring |
| `cdk/lib/lambda/agent-invoker/handler.py` | `(016)` | module docstring |
| `tests/test_pipeline_usage_history.py` | `(039)` × 2 | module docstring, inline comment |

**Preserve**: `existence_check.py` line 214 — `(429)` is HTTP status code documentation.

---

## 4. Unused Imports — Complete Inventory

### `verification-zones/verification-agent/src/`

| File | Unused symbol |
|------|---------------|
| `agent_card.py` | `json` |
| `agent_tools.py` | `inspect` |
| `cloudwatch_metrics.py` | `json` |
| `event_dedupe.py` | `typing.Optional` |
| `existence_check.py` | `json` |
| `orchestrator.py` | `asyncio`, `dataclasses.field`, `typing.Literal` |
| `pipeline.py` | `a2a_client.invoke_execution_agent`, `agent_registry.get_agent_arn`, `router.route_request`, `router.UNROUTED_AGENT_ID`, `router.LIST_AGENTS_AGENT_ID`, `error_debug.log_execution_agent_error_response` |
| `rate_limiter.py` | `json` |
| `slack_poster.py` | `json` |

### `verification-zones/verification-agent/cdk/lib/lambda/` (production files only)

| File | Unused symbol |
|------|---------------|
| `dynamodb-export-job/handler.py` | `json` |
| `slack-event-handler/api_gateway_client.py` | `os`, `botocore.credentials.Credentials` |
| `slack-event-handler/attachment_extractor.py` | `typing.Optional` |
| `slack-event-handler/event_dedupe.py` | `typing.Optional` |
| `slack-event-handler/handler.py` | `time`, `authorization.AuthorizationError`, `logger.set_lambda_context` |
| `slack-event-handler/logger.py` | `sys` |
| `slack-event-handler/secrets_manager_client.py` | `os` |

### `verification-zones/verification-agent/cdk/lib/lambda/` (test files only)

Test-only F401 violations exist in `tests/test_*.py` under `slack-event-handler/` and `agent-invoker/` — unused `pytest`, `MagicMock`, `Mock`, `patch`, and error class imports.

### `slack-search-agent/src/`

No violations — `ruff` reports "All checks passed!"

---

## 5. Orphan / Unused Production File

**Decision**: `cdk/lib/lambda/slack-event-handler/bedrock_client.py` is unused — no other handler file imports it. Remove the file.

**Rationale**: The file has 8 raw `print()` calls, stale "Phase 5/6" roadmap comments, and is not referenced by `handler.py` or any other module in the same Lambda. Removing it eliminates dead code and the associated `print()` violations in one step.

**Verification**: `grep -rn "bedrock_client\|BedrockClient" verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/` returns hits only within `bedrock_client.py` itself and its doctest examples.

---

## 6. TDD Approach for a Cleanup Feature

**Decision**: Follow constitution-required Red → Green → Refactor, but the "Red" step for import removal and comment cleanup is: confirm tests pass before changes, remove imports/comments, confirm tests still pass. For logging changes (migrating `print()` → logger), write/update test assertions to verify structured log output before making the change.

**Rationale**: Import removal and comment cleanup cannot cause test failures by themselves (no behavioral change). Logging migration can affect test fixtures that assert on log output — these must be updated atomically.
