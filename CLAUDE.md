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

- Python 3.11 (コンテナ: `python:3.11-slim`, ARM64) + `bedrock-agentcore` v1.2.0 (Starlette ベース), `starlette`, `uvicorn` (020-fix-a2a-routing)

## Project Structure

```text
src/
tests/
```

## Constitution (Non-Negotiable Rules)

Full text: `.specify/memory/constitution.md` (v1.1.0). These rules apply regardless of whether speckit is used.

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

## Code Style

Python 3.11 (コンテナ: `python:3.11-slim`, ARM64): Follow standard conventions

## Recent Changes
- 038-slack-search-agent: New `verification-zones/slack-search-agent/` zone with Bedrock AgentCore Runtime. Tools: `search_messages`, `get_thread`, `get_channel_history`. Channel access control: calling channel + public channels allowed; private channels denied. CDK stack: `SlackSearchAgentStack`. New `SlackSearchClient` and `make_slack_search_tool` in verification-agent for A2A integration; `OrchestrationRequest` gains `channel` + `bot_token` fields; `SLACK_SEARCH_AGENT_ARN` env var activates the tool. Also fixed 5 pre-existing CDK test failures (stale JS, tsconfig typeRoots, WAF WebACLAssociation assertion).
- 036-iterative-reasoning: Strands agentic loop orchestrator for iterative multi-agent reasoning; no new dependencies (A2A execution agents only)
- 035-fetch-url-agent: New standalone `fetch-url-agent` zone with `fetch_url` tool (SSRF-safe URL fetch). `fetch_url` removed from `execution-agent`. `requests`/`beautifulsoup4` remain in `fetch-url-agent` only. WEB_FETCH_AGENT_ARN env var added to verification-agent CDK.


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
