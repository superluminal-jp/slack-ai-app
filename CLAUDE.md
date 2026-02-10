# slack-ai-app Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-08

## Active Technologies
- Python 3.11 (コンテナ: `python:3.11-slim`, ARM64) + `strands-agents[a2a]~=1.25.0`, `fastapi`, `uvicorn`, `boto3`, `slack-sdk` (021-strands-migration-cleanup)
- DynamoDB (既存テーブル: dedupe, whitelist, rate_limit, existence_check_cache) (021-strands-migration-cleanup)
- Python 3.11 (`python:3.11-slim`, ARM64 container) + FastAPI ~0.115.0, uvicorn ~0.34.0, boto3 ~1.34.0, slack-sdk ~3.27.0, strands-agents[a2a] ~1.25.0 (022-echo-mode-disable-validation)
- DynamoDB (existence check cache, whitelist, rate limit, dedupe), SQS (async invocation, Slack post requests) (022-echo-mode-disable-validation)

- Python 3.11 (コンテナ: `python:3.11-slim`, ARM64) + `bedrock-agentcore` v1.2.0 (Starlette ベース), `starlette`, `uvicorn` (020-fix-a2a-routing)

## Project Structure

```text
src/
tests/
```

## Commands

cd src [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] pytest [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] ruff check .

## Code Style

Python 3.11 (コンテナ: `python:3.11-slim`, ARM64): Follow standard conventions

## Recent Changes
- 022-echo-mode-disable-validation: Added Python 3.11 (`python:3.11-slim`, ARM64 container) + FastAPI ~0.115.0, uvicorn ~0.34.0, boto3 ~1.34.0, slack-sdk ~3.27.0, strands-agents[a2a] ~1.25.0
- 021-strands-migration-cleanup: Added Python 3.11 (コンテナ: `python:3.11-slim`, ARM64) + `strands-agents[a2a]~=1.25.0`, `fastapi`, `uvicorn`, `boto3`, `slack-sdk`

- 020-fix-a2a-routing: Added Python 3.11 (コンテナ: `python:3.11-slim`, ARM64) + `bedrock-agentcore` v1.2.0 (Starlette ベース), `starlette`, `uvicorn`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
