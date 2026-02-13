# slack-ai-app Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-11

## Active Technologies
- Python 3.11 (コンテナ: `python:3.11-slim`, ARM64) + `strands-agents[a2a]~=1.25.0`, `fastapi`, `uvicorn`, `boto3`, `slack-sdk` (021-strands-migration-cleanup)
- DynamoDB (既存テーブル: dedupe, whitelist, rate_limit, existence_check_cache) (021-strands-migration-cleanup)
- Python 3.11 (Verification Agent), TypeScript 5.x (CDK), Bash (deploy scripts) + FastAPI, uvicorn, boto3, aws-cdk-lib, zod (023-remove-echo-mode)
- N/A (削除のみ) (023-remove-echo-mode)
- Python 3.11 (agents), TypeScript 5.x (CDK) + FastAPI, uvicorn, boto3, requests, aws-cdk-lib (024-slack-file-attachment)
- S3 (new — temporary file exchange), DynamoDB (existing — dedupe, whitelist, rate limit) (024-slack-file-attachment)
- Markdown (GitHub-flavored) + None (documentation only) (030-audience-docs-restructure)

- Python 3.11 (コンテナ: `python:3.11-slim`, ARM64) + `bedrock-agentcore` v1.2.0 (Starlette ベース), `starlette`, `uvicorn` (020-fix-a2a-routing)

## Project Structure

```text
src/
tests/
```

## Commands

- **Python (agents)**: `cd cdk/lib/execution/agent/execution-agent && python -m pytest tests/ -v` (Execution); `cd cdk/lib/verification/agent/verification-agent && python -m pytest tests/ -v` (Verification)
- **Lint**: `cd src && ruff check .` (when applicable)
- **CDK**: `cd cdk && npm run test` (Jest); `npx cdk deploy SlackAI-Execution-Dev` / `SlackAI-Verification-Dev` (see cdk/README.md)

## Documentation

- Keep documentation in sync with code: update README, CHANGELOG, and API/module docs when behavior or setup changes.
- Follow [Documentation Standards](docs/DOCUMENTATION_STANDARDS.md): inverted pyramid, one idea per paragraph, plain active language, quality checklist.
- CHANGELOG: follow [Keep a Changelog](https://keepachangelog.com/); use Added, Changed, Fixed, Security, etc.
- Module READMEs: include purpose, scope/non-scope, usage, dependencies, configuration, testing, limitations (see docs/DOCUMENTATION_STANDARDS.md).

## Code Style

Python 3.11 (コンテナ: `python:3.11-slim`, ARM64): Follow standard conventions

## Recent Changes
- 030-audience-docs-restructure: Added Markdown (GitHub-flavored) + None (documentation only)
- 026-best-practices-alignment: Bedrock/AgentCore/Strands/CDK ベストプラクティス適用（HTTPS、最小権限、grant*()、暗号化、スコープ定義、計装、評価戦略）。requirements.txt は `~=` でバージョン固定
- Reaction swap on reply: Slack Poster removes 👀 and adds ✅ when posting AI response; `message_ts` in SQS payload


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
