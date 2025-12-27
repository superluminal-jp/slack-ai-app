# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Cross-Account Zones Architecture** (010-cross-account-zones)
  - Split-stack deployment (VerificationStack + ExecutionStack)
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
- Migration guide from single-stack to split-stack architecture
- Cross-account IAM authentication documentation

### Changed

- Restructured docs/ directory with tutorials/, how-to/, reference/, explanation/ categories
- Simplified README.md to focus on overview and navigation
- Converted docs/README.md to navigation hub
- CDK entry point now defaults to split-stack mode (single-stack mode removed)
- Lambda folder structure reorganized: `lambda/verification-stack/` and `lambda/execution-stack/`
- DynamoDB table names now include stack name prefix to prevent conflicts
- IAM policy for VerificationStack Lambda uses wildcard resource (access controlled by API Gateway resource policy)
- Updated deployment documentation with `.env` file support and account ID configuration
- All documentation updated to reflect split-stack architecture as the standard deployment method

### Fixed

- Resolved DynamoDB table name conflicts between existing and new stacks
- Fixed CloudFormation Early Validation errors for cross-stack resource references
- Improved error handling for Execution API unavailability

### Removed

- `SlackBedrockStack` single-stack deployment - コードベースから完全に削除されました。split-stack アーキテクチャが標準です。
- Single-stack deployment mode - `cdk/bin/cdk.ts` から削除されました。デフォルトは split-stack です。

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

