# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Verification Agent missing `import time`**: Restored `import time` in `authorization.py`, `rate_limiter.py`, `slack_poster.py` — dropped during logging refactor, causing `NameError` on every request and silent failure (no Slack response)
- **Deploy script PutResourcePolicy**: Fixed `Resource: "*"` (must match specific ARN); removed unsupported endpoint policy; fixed empty `AWS_PROFILE` causing `ProfileNotFound`
- **AgentCore Runtime CloudWatch logs**: Replaced `print()` with Python `logging` module. Structured JSON logs are output via `logging.StreamHandler(sys.stdout)` with `%(message)s` formatter for CloudWatch compatibility. Added `logger_util` in both agents for centralized configuration.
- **Best-practices optimization**: Added `correlation_id` to all log entries; fixed silent exception in `_get_slack_file_bytes`; added SSRF prevention and memory guard in Slack Poster S3 fetch; input validation in `build_file_artifact`/`build_file_artifact_s3`; `ensure_ascii=False` for Japanese log output; corrected stale docstrings

### Added

- **CDK Logging, Comments, and Error Handling** (029-cdk-logging-error-handling)
  - Structured CDK logging: `cdk-logger` (level, phase, context) and `cdk-error` (message, cause, remediation, source) per log-event and error-report contracts
  - App entry and stack lifecycle logs in `bin/cdk.ts`; entry-point validation throws `CdkError` with remediation hints
  - `LogRetentionAspect` warns on `CfnLogGroup` without retention; applied at app level
  - Documented-unit JSDoc (Purpose, Responsibilities, Inputs, Outputs) for execution/verification constructs and key types
  - Spec, plan, tasks, contracts (log-event, error-report), and quickstart in `specs/029-cdk-logging-error-handling/`
- **S3-backed Large File Transfer** (028-s3-large-file-transfer)
  - Large file artifacts (> 200 KB) uploaded to S3 `generated_files/` prefix, delivered to Slack Poster via pre-signed URL in SQS message — bypasses SQS 256 KB limit
  - Files <= 200 KB continue inline (contentBase64) for backward compatibility
  - Slack Poster Lambda: dual-mode processing — fetches from S3 presigned URL or decodes inline base64
  - S3 lifecycle: 1-day expiration on `generated_files/` prefix for automatic cleanup
  - CDK: `grantReadWrite` for `generated_files/*` on Verification Agent role; lifecycle rule on FileExchangeBucket
  - SSRF prevention: validates S3 URL scheme (HTTPS) and host (`*.amazonaws.com`) before fetch
  - Memory guard: Lambda limits S3 fetch to 10 MB max
  - Tests: pipeline large/small file routing, S3 upload/presigned URL, Slack Poster S3 fetch
- **Slack File Generation (Best Practices)** (027-slack-file-generation-best-practices)
  - Execution Agent file generation tools: Markdown, CSV, TXT (generate_text_file); Excel, Word, PowerPoint (generate_excel, generate_word, generate_powerpoint); chart images (generate_chart_image)
  - Strands Agent with Bedrock Converse; tools invoked via @tool with Japanese docstrings and inputSchema descriptions
  - File size limits: text 1 MB, Office 10 MB, image 5 MB; sanitize_filename for cross-platform names; size-exceed Japanese user notification
  - Attachment-based conversion: documents and images from 024 flow passed to agent; tools receive context for "CSV → Excel"–style requests
  - Error handling: tool_failure mapped to Japanese message (FR-010); max 1 file per request (FR-008)
  - Best practices verified: HTTPS (boto3 default), minimal IAM (InvokeModel only), BP-FG-001/002/003, BP-S-001/002; checklists/best-practices-verification.md
  - Dependencies: openpyxl, python-docx, python-pptx, matplotlib, Pillow
- **Reaction swap on Slack reply**: When posting AI response to Slack, the system now removes the 👀 (eyes) reaction and adds ✅ (white_check_mark) on the original message, providing clear visual feedback that processing completed successfully
- **Slack File Attachment Support** (024-slack-file-attachment)
  - S3-based secure file transfer: Verification Agent downloads from Slack, uploads to S3, generates pre-signed URLs; Execution Agent downloads via pre-signed URL (no bot token in execution zone)
  - Document Q&A: PDF, DOCX, XLSX, CSV, TXT via native Bedrock document blocks; PPTX via text extraction fallback
  - Image analysis: PNG, JPEG, GIF, WebP via Bedrock image blocks
  - Multiple files: up to 5 files per message; limits 10 MB/image, 5 MB/document
  - User-friendly error messages (FR-013), structured logging with correlation IDs (FR-014)
  - `files:read` Slack scope required for attachment downloads
  - Test counts: Verification Agent 93, Execution Agent 110
- **Echo-Mode-Disabled Verification Pipeline Tests** (022-echo-mode-disable-validation)
  - 20 new TDD tests across 4 test classes in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`, covering the echo-mode-off (normal) execution delegation flow
  - `Test022NormalFlowDelegation` (5 tests): verifies that echo off triggers `invoke_execution_agent`, response contains no echo prefix, file artifacts pass through, payload contains all required fields, and `VALIDATION_ZONE_ECHO_MODE` is treated case-insensitively
  - `Test022SecurityCheckPipeline` (5 tests): verifies pipeline ordering — existence check runs before authorization, authorization runs before rate limit, each exception class returns the correct error response, and all checks passing proceeds to execution delegation
  - `Test022ExecutionErrorPaths` (6 tests): verifies Bedrock throttling, access-denied, invalid JSON, and empty-response cases each post a user-facing friendly message, that internal error details are not leaked to Slack, and that `is_processing` is reset on exception
  - `Test022StructuredLogging` (4 tests): verifies all log entries are valid JSON, correlation ID is present across all log entries, security check results appear in logs, and bot token does not appear in error logs
  - `pipeline.py` enhancements: `JSONDecodeError` handling for malformed execution responses, structured log entry on Base64 decode
  - Verification Agent test count raised from 63 to 83; `pipeline.py` line coverage raised to 94%
- **Strands Migration & Cleanup** (021-strands-migration-cleanup)
  - Migrated Verification Agent and Execution Agent from `bedrock-agentcore` SDK (`BedrockAgentCoreApp`) to **FastAPI + uvicorn** with manual route definitions (POST `/`, GET `/.well-known/agent-card.json`, GET `/ping`)
  - CloudWatch IAM policy fix: `StringLike` condition with correct `SlackAI-*` namespace pattern
  - Echo mode configuration: `validationZoneEchoMode` field in CdkConfig with type-safe boolean handling
  - E2E test suite (`tests/e2e/`) for Slack flow integration testing
  - Dependency version pinning with `~=` (compatible release): `strands-agents[a2a]~=1.25.0`, `fastapi~=0.115.0`, `uvicorn~=0.34.0`, `boto3~=1.34.0`, `slack-sdk~=3.33.0`
  - Test coverage: Verification Agent 63 tests, Execution Agent 79 tests, CDK 25 tests (AgentCore constructs)
- **Async AgentCore Invocation** (016-async-agentcore-invocation)
  - SlackEventHandler returns HTTP 200 immediately after enqueueing an agent invocation request to SQS (`agent-invocation-request`), avoiding Slack 3s timeout and Lambda blocking
  - Agent Invoker Lambda consumes SQS messages and calls `InvokeAgentRuntime` (Verification Agent); long-running agent runs no longer hit SlackEventHandler Lambda timeout (up to 15 min in Agent Invoker)
  - SQS Dead Letter Queue (`agent-invocation-dlq`) with `maxReceiveCount: 3` for failed invocations; batchItemFailures returned on InvokeAgentRuntime exception for SQS retry
  - Verification Zone retains Slack posting responsibility; cross-account communication remains A2A only (SQS is within verification account only)
  - Docs: zone-communication §6.6 (016 flow), troubleshooting section for SQS backlog, Agent Invoker errors, DLQ, InvokeAgentRuntime permission
- **AgentCore A2A Migration — Legacy Removal** (015-agentcore-a2a-migration)
  - Slack-to-AI traffic now uses a single AgentCore A2A path; legacy API Gateway, SQS, BedrockProcessor Lambda, and SlackResponseHandler Lambda removed from CDK
  - SlackEventHandler Lambda invokes Verification Agent only via `bedrock-agentcore` `InvokeAgentRuntime` (no `USE_AGENTCORE` flag or legacy path)
  - Execution Stack: Execution Agent ECR + AgentCore Runtime only; output `ExecutionAgentRuntimeArn`
  - Verification Stack: SlackEventHandler, Verification Agent Runtime, DynamoDB, Secrets; no ExecutionResponseQueue or SlackResponseHandler
  - Config and docs: `useAgentCore`, `executionApiUrl`, `executionResponseQueueUrl`, `verificationLambdaRoleArn` removed; deployment is executionAgentArn-only
  - CDK tests and SlackEventHandler pytest updated for A2A-only; all references to USE_AGENTCORE and legacy components removed from application code and CDK
- **A2A File to Slack** (014-a2a-file-to-slack)
  - Execution Agent can return a generated file artifact (`generated_file`) alongside text (A2A result with `file_artifact`)
  - Verification Agent parses file artifact, uploads to Slack via `post_file_to_slack` (Slack SDK `files_upload_v2` / getUploadURLExternal → completeUploadExternal)
  - Post order: text first, then file in the same thread; on upload failure, post user-facing error message to thread (FR-007)
  - File limits: max 5 MB, allowed MIME types `text/csv`, `application/json`, `text/plain` (configurable via env); size/MIME violations return text-only with user-facing message (FR-005, FR-006)
  - Support for text-only, file-only, and text+file responses (US1, US2, US3)
  - Execution: `file_config.py`, `response_formatter.build_file_artifact` / `validate_file_for_artifact`, Agent Card skill `generated-file`
  - Verification: `parse_file_artifact`, `post_file_to_slack` in `slack_poster.py`, structured logging for file post success/failure
  - Documentation: zone-communication §6.5 (014 file artifact flow), README troubleshooting for `files:write`, quickstart and contracts in `specs/014-a2a-file-to-slack/`
  - Tests: Execution 68 tests, Verification 46 tests (including file artifact and file-posting paths)
- **AgentCore A2A Inter-Zone Communication** (013-agentcore-a2a-zones)
  - Amazon Bedrock AgentCore Runtime with A2A (Agent-to-Agent) protocol
  - Verification Agent container (ARM64 Docker) — security pipeline, Slack posting
  - Execution Agent container (ARM64 Docker) — Bedrock processing, attachment handling
  - A2A client with SigV4 authentication and async task polling (exponential backoff)
  - Agent Card (`/.well-known/agent-card.json`) for A2A-compliant Agent Discovery
  - Health check endpoints (`/ping`) with Healthy / HealthyBusy status
  - CDK L1 constructs: `ExecutionAgentRuntime`, `VerificationAgentRuntime`, ECR image builds
  - Cross-account resource-based policies for `InvokeAgentRuntime` permissions
  - Feature Flag (`USE_AGENTCORE`) for zero-downtime migration and rollback
  - `validate_agentcore` step in deployment script with ACTIVE status polling
  - CloudWatch custom metrics for both agents (A2A tasks, Bedrock errors, security events)
  - Structured JSON logging with correlation_id and PII masking
  - 97 TDD tests (41 Execution Agent + 32 Verification Agent + 24 CDK/Jest)
- **Complete Stack Separation Architecture** (Structure Reorganization)
  - Fully separated stack structure with self-contained directories
  - Each stack (Execution/Verification) contains both CDK code and Lambda code
  - Lambda code moved to `cdk/lib/{execution|verification}/lambda/`
  - CDK code organized under `cdk/lib/{execution|verification}/`
  - Simplified path references (e.g., `../lambda/bedrock-processor` instead of `../../../lambda/execution-stack/bedrock-processor`)
- **Cross-Account Zones Architecture** (010-cross-account-zones)
  - Two independent stacks deployment (VerificationStack + ExecutionStack)
  - Cross-account IAM authentication support
  - Independent lifecycle management for each zone
  - Deployment scripts for 3-phase deploy process
  - Graceful error handling for API unavailability
  - Stack-prefixed DynamoDB table names to avoid resource conflicts
  - API Gateway resource policy configuration for secure inter-zone communication
  - Local bundling support for Colima/Docker compatibility
- Documentation reorganization based on Diátaxis framework (009-docs-reorganization)
- CONTRIBUTING.md with contribution guidelines
- CHANGELOG.md following Keep a Changelog format
- SECURITY.md with security policy
- Migration guide from single-stack to two independent stacks architecture
- Cross-account IAM authentication documentation

### Changed

- Verification Agent and Execution Agent: replaced `bedrock-agentcore` SDK (`BedrockAgentCoreApp`, `_handle_invocation`, `add_async_task`/`complete_async_task`) with FastAPI + uvicorn direct routing
- Agent containers now use raw JSON POST on port 9000 (not JSON-RPC 2.0) for AgentCore `invoke_agent_runtime` compatibility
- README.ja.md, README.md, docs/README.md: 014 A2A file-to-Slack feature and recent updates (2026-02-08)
- docs/reference/operations/slack-setup.md: Added `files:write` scope for 014 file uploads; manifest example updated
- docs/slack-app-manifest.yaml: Added `files:write` to bot scopes for 014
- docs/how-to/troubleshooting.md: New section "ファイルがスレッドに表示されない（014）"; log pattern `slack_post_file_failed`
- Architecture overview (`docs/reference/architecture/overview.md`) now includes AgentCore A2A section
- Zone communication docs (`zone-communication.md`) updated with A2A protocol path
- System architecture diagram (`system-architecture-diagram.md`) includes AgentCore resources
- Deployment script (`deploy-split-stacks.sh`) includes AgentCore validation phase
- CDK config types updated with `executionAgentName`, `verificationAgentName`, `useAgentCore`, `executionAgentArn`
- SlackEventHandler Lambda updated with Feature Flag routing (`USE_AGENTCORE` environment variable)
- README.md and README.ja.md updated with AgentCore A2A architecture documentation
- cdk/README.md updated with AgentCore resources, config fields, and test coverage
- docs/README.md updated with AgentCore documentation links
- Restructured docs/ directory with tutorials/, how-to/, reference/, explanation/ categories
- Simplified README.md to focus on overview and navigation
- Converted docs/README.md to navigation hub
- CDK entry point now defaults to two independent stacks mode (single-stack mode removed)
- Lambda folder structure reorganized: `lambda/verification-stack/` and `lambda/execution-stack/` → moved to `cdk/lib/{execution|verification}/lambda/`
- CDK code structure reorganized: stacks and constructs moved to `cdk/lib/{execution|verification}/` for complete stack isolation
- Project structure now reflects complete stack independence with self-contained directories
- DynamoDB table names now include stack name prefix to prevent conflicts
- IAM policy for VerificationStack Lambda uses wildcard resource (access controlled by API Gateway resource policy)
- Updated deployment documentation with `.env` file support and account ID configuration
- All documentation updated to reflect two independent stacks (VerificationStack + ExecutionStack) as the standard deployment method

### Fixed

- Fixed `IndentationError` in `verification-agent/main.py` line 132 (12 spaces → 8 spaces)
- Fixed `useAgentCore` variable declaration order in `verification-stack.ts` (temporal dead zone)
- Resolved DynamoDB table name conflicts between existing and new stacks
- Fixed CloudFormation Early Validation errors for cross-stack resource references
- Improved error handling for Execution API unavailability

### Removed

- `bedrock-agentcore` SDK dependency — replaced by `fastapi`, `uvicorn`, and `strands-agents[a2a]`
- `BedrockAgentCoreApp` / `_handle_invocation` / `add_async_task` / `complete_async_task` patterns from agent containers
- `SlackBedrockStack` single-stack deployment — removed from codebase. Two independent stacks (VerificationStack + ExecutionStack) are the standard.
- Single-stack deployment mode — removed from `cdk/bin/cdk.ts`. Default is two independent stacks deployment.

## [1.0.0] - 2025-12-27

### Added

- Initial release of Slack Bedrock MVP
- Slack to Amazon Bedrock integration via AWS Lambda
- Two-Key Defense security model (HMAC SHA256 + Slack API verification)
- Thread history retrieval and contextual responses
- Attachment processing (images and documents)
- Whitelist-based authorization (team_id, user_id, channel_id)
- Bedrock Guardrails integration for content safety
- DynamoDB for event deduplication and token caching
- CloudWatch monitoring and alerting
- AWS CDK infrastructure as code

### Security

- Multi-layer authentication (Slack signature + API verification)
- Timestamp validation to prevent replay attacks
- PII detection and masking
- Token limits to prevent abuse
- Encrypted context storage (DynamoDB + KMS)

---

[Unreleased]: https://github.com/owner/slack-ai-app/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/owner/slack-ai-app/releases/tag/v1.0.0
