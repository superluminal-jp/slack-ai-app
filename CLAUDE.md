# slack-ai-app Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-15

## Active Technologies
- Python 3.11 (コンテナ: `python:3.11-slim`, ARM64) + `strands-agents[a2a]~=1.25.0`, `fastapi`, `uvicorn`, `boto3`, `slack-sdk` (021-strands-migration-cleanup)
- DynamoDB (既存テーブル: dedupe, whitelist, rate_limit, existence_check_cache) (021-strands-migration-cleanup)
- Python 3.11 (Verification Agent), TypeScript 5.x (CDK), Bash (deploy scripts) + FastAPI, uvicorn, boto3, aws-cdk-lib, zod (023-remove-echo-mode)
- N/A (削除のみ) (023-remove-echo-mode)
- Python 3.11 (agents), TypeScript 5.x (CDK) + FastAPI, uvicorn, boto3, requests, aws-cdk-lib (024-slack-file-attachment)
- S3 (new — temporary file exchange), DynamoDB (existing — dedupe, whitelist, rate limit) (024-slack-file-attachment)
- Markdown (GitHub-flavored) + None (documentation only) (030-audience-docs-restructure)
- Python 3.11 (`python:3.11-slim`, ARM64) + `strands-agents[a2a,otel]~=1.25.0`, `fastapi~=0.115.0`, `uvicorn~=0.34.0`, `boto3~=1.42.0`, `requests~=2.31.0`, `beautifulsoup4~=4.12.0` — **fetch-url-agent** only; `requests`/`beautifulsoup4` removed from execution-agent (035-fetch-url-agent)
- N/A（新規ストレージなし。DynamoDB/S3 は verification-agent が管理） (035-fetch-url-agent)
- Python 3.11 (`python:3.11-slim`, ARM64 container) + `strands-agents[a2a,otel]~=1.25.0`, `fastapi~=0.115.0`, `uvicorn~=0.34.0`, `boto3~=1.42.0` (no new dependencies) (036-iterative-reasoning)
- No new storage — DynamoDB and S3 schemas unchanged (036-iterative-reasoning)
- Python 3.11 (`python:3.11-slim`, ARM64 container) + `strands-agents[a2a,otel]~=1.25.0`, `fastapi~=0.115.0`, `uvicorn~=0.34.0`, `boto3~=1.42.0`, `slack-sdk~=3.27.0` (038-slack-search-agent)
- N/A（新規ストレージなし。bot_token は A2A params 経由で受け取る） (038-slack-search-agent)
- Python 3.11 (`python:3.11-slim`, ARM64) + TypeScript 5.x (CDK) + boto3 ~=1.42.0, aws-cdk-lib (existing), strands-agents[a2a,otel] ~=1.25.0 (039-usage-history)
- DynamoDB (new `usage-history` table) + S3 (new `usage-history` bucket) (039-usage-history)
- TypeScript 5.x (CDK), Python 3.11 (Lambda trigger handler) + `aws-cdk-lib` 2.215.0 (aws-events, aws-events-targets, aws-lambda, aws-iam, aws-dynamodb, aws-s3), `boto3` (Lambda runtime) (040-dynamodb-pitr-export)
- DynamoDB (existing `usage-history` table, add PITR), S3 (existing `usage-history` bucket, add `dynamodb-exports/` lifecycle + bucket policy) (040-dynamodb-pitr-export)
- TypeScript 5.x (CDK) + `aws-cdk-lib` 2.215.0 (stable) — `aws-s3`, `aws-iam` (041-s3-replication-archive)
- S3 (two buckets: existing source, new archive destination) (041-s3-replication-archive)
- Python 3.11 + ruff (linting), pytest (test runner) (043-exec-cleanup)
- TypeScript 5.x (CDK) + `cdk-nag` (AWS Solutions security scanning) (044-cdk-nag-governance)

- Python 3.11 (コンテナ: `python:3.11-slim`, ARM64) + `bedrock-agentcore` v1.2.0 (Starlette ベース), `starlette`, `uvicorn` (020-fix-a2a-routing)

## Project Structure

```text
src/
tests/
```

## Constitution (Non-Negotiable Rules)

Full text: `.specify/memory/constitution.md` (v1.2.0). These rules apply regardless of whether speckit is used.

### I. Spec-Driven Development
Every code change starts with a spec. No PR without a corresponding spec in `specs/`.
Workflow: **Specify → Clarify → Plan → Tasks → Implement → Validate → Sync**

**Spec numbering**: Before `/speckit.specify`, find the next number:
```bash
ls specs/ | grep -E '^[0-9]+' | sed 's/-.*//' | sort -n | tail -1
```
Use N+1. Pass `--number` explicitly — do not rely on auto-detection.

**PR requirement**: Every PR description MUST include a "Constitution Check" section confirming:
- SDD traceability: spec → plan → tasks → code
- TDD cycle completed: tests written first, all green
- Docs/deploy scripts updated: README, CHANGELOG, CLAUDE.md, deploy.sh

### II. Test-Driven Development
Red → Green → Refactor cycle is mandatory. Tests MUST fail before implementation starts.
Every production-code task MUST have a corresponding test task.

### III. Security-First
Security pipeline order is **non-bypassable**: existence check → whitelist → rate limit → AI invocation.
- IAM: least-privilege only; no wildcard resource policies
- Secrets MUST NOT be committed to source control
- All Slack payloads MUST be validated before processing

### IV. Fail-Open for Infrastructure, Fail-Closed for Security
- Security pipeline `except` blocks → return error response (fail closed)
- Infrastructure `except` blocks → log WARNING + safe fallback (fail open)
- All exceptions MUST log `correlation_id`, `error`, `error_type`

### V. Zone-Isolated Architecture
- Verification-zone code MUST NOT import execution-zone code directly
- Inter-zone communication: A2A via Bedrock AgentCore `invoke_agent_runtime` + JSON-RPC 2.0
- New capabilities → new execution agents, not logic inside verification agent
- Each agent MUST expose `POST /`, `GET /ping`, `GET /.well-known/agent-card.json`

### VI. Documentation & Deploy-Script Parity
Same commit as the code change MUST include:
- `CHANGELOG.md` `[Unreleased]` entry
- `README.md` / `README.ja.md` / zone READMEs (if architecture/behavior changed)
- `CLAUDE.md` "Active Technologies" and "Recent Changes" (after feature merge)
- `scripts/deploy.sh` updated to cover all deployed zones (adding a zone → same PR)
- Deploy script output-key references validated against actual CDK `CfnOutput` names

**Deploy order**: execution zones → verification zone
```bash
DEPLOYMENT_ENV=dev ./scripts/deploy.sh
```

## Commands

- **Python (agents)**: `cd execution-zones/file-creator-agent && python -m pytest tests/ -v` (FileCreator); `cd execution-zones/fetch-url-agent/src && python -m pytest ../tests/ -v` (WebFetch); `cd execution-zones/time-agent && python -m pytest tests/ -v` (Time); `cd execution-zones/docs-agent && python -m pytest tests/ -v` (Docs); `cd verification-zones/verification-agent && python -m pytest tests/ -v` (Verification); `cd verification-zones/slack-search-agent && python -m pytest tests/ -v` (SlackSearch)
- **Lint**: `cd src && ruff check .` (when applicable)
- **CDK (zone)**: `cd execution-zones/file-creator-agent/cdk && npm test` (Jest); `cd execution-zones/fetch-url-agent/cdk && npm test` (WebFetch CDK); `cd verification-zones/slack-search-agent/cdk && npm test` (SlackSearch CDK); zone-specific deploy: `./execution-zones/file-creator-agent/scripts/deploy.sh`, `./execution-zones/fetch-url-agent/scripts/deploy.sh`, `./verification-zones/slack-search-agent/scripts/deploy.sh`
- **CDK (all)**: `DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy` (execution zones → verification zone)

## Documentation

- Keep documentation in sync with code: update README, CHANGELOG, and API/module docs when behavior or setup changes.
- Follow [Documentation Standards](docs/DOCUMENTATION_STANDARDS.md): inverted pyramid, one idea per paragraph, plain active language, quality checklist.
- CHANGELOG: follow [Keep a Changelog](https://keepachangelog.com/); use Added, Changed, Fixed, Security, etc.
- Module READMEs: include purpose, scope/non-scope, usage, dependencies, configuration, testing, limitations (see docs/DOCUMENTATION_STANDARDS.md).

## Python Coding Standards

### Logging

Use `log(logger, level, event_type, data_dict)` from `logger_util.py` — never raw `print()`.

**Required fields by level**:
- `INFO`: `event_type` + context fields relevant to the event
- `WARNING`: `event_type`, `error` (str), optionally `error_type` (class name)
- `ERROR`: `event_type`, `error` (str), `error_type` (class name), `correlation_id`

```python
# Correct
log(_logger, "info", "request.received", {"correlation_id": cid, "channel": ch})
log(_logger, "error", "whitelist.check_failed", {
    "correlation_id": cid, "error": str(exc), "error_type": type(exc).__name__
})

# Incorrect
print(f"Received {ch}")          # raw print — prohibited
logger.info("request received")  # unstructured — use log() helper
```

### Error Handling

Match fail-open/fail-closed to the pipeline layer:

```python
# Security pipeline — fail CLOSED (return error, never continue)
except Exception as exc:
    log(_logger, "error", "security.check_failed", {
        "correlation_id": cid, "error": str(exc), "error_type": type(exc).__name__
    })
    return error_response(...)

# Infrastructure — fail OPEN (log + continue)
except Exception as exc:
    log(_logger, "warning", "storage.write_failed", {
        "correlation_id": cid, "error": str(exc), "error_type": type(exc).__name__
    })
    # continue — non-blocking
```

Never use bare `except:`. Always log before handling.

### Comments and Docstrings

- Docstrings describe **what** and **why**, not **how** the code works
- Inline comments explain non-obvious decisions or business rules
- No spec numbers (e.g. `(027)`), branch names (e.g. `041-s3-replication-archive`), or task IDs (e.g. `T014`) in any code, docstring, or comment

```python
# Correct
def check_whitelist(channel: str) -> bool:
    """Return True if channel is in the allowed list. Fails open on lookup error."""

# Incorrect — embeds process-tracking identifiers
def check_whitelist(channel: str) -> bool:
    """(027): Check whitelist table using DynamoDB GetItem and return bool result."""
```

## Code Style

Python 3.11 (コンテナ: `python:3.11-slim`, ARM64): Follow standard conventions

## Recent Changes
- 043-exec-cleanup: Removed spec-number annotations from all execution-zones comments/docstrings; removed unused imports (ruff F401 clean) and dead assignments (F841); fixed f-string without placeholder (F541); renamed spec-numbered test classes to intent-based names. Zero behavioral changes.
- 042-code-cleanup: Removed spec-number annotations from all verification-zones comments/docstrings; migrated Lambda handler raw print() to structured logger calls; removed unused imports (ruff F401 clean); deleted orphan bedrock_client.py; fixed missing log_warn import in slack-response-handler; updated stale test patches (invoke_execution_agent → run_orchestration_loop).
- 041-s3-replication-archive: S3 SRR from usage-history → usage-history-archive; all prefixes (content/, attachments/, dynamodb-exports/); deleteMarkerReplication disabled; cross-account ready via archiveAccountId config / ARCHIVE_ACCOUNT_ID env; new constructs UsageHistoryArchiveBucket + UsageHistoryReplication; versioning enabled on source bucket.
- 044-cdk-nag-governance: Applied `cdk-nag` AwsSolutions security scanning across all CDK apps (synth + Jest); added targeted suppressions with written justifications; narrowed Bedrock IAM from wildcard to model-scoped ARNs; verified cost allocation tag coverage (including Scheduler); added/clarified governance standards (logging/error handling/comments) and banned process-tracking identifiers in code.


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
