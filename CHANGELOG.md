# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

