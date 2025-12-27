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
- Documentation reorganization based on Diátaxis framework (009-docs-reorganization)
- CONTRIBUTING.md with contribution guidelines
- CHANGELOG.md following Keep a Changelog format
- SECURITY.md with security policy

### Changed

- Restructured docs/ directory with tutorials/, how-to/, reference/, explanation/ categories
- Simplified README.md to focus on overview and navigation
- Converted docs/README.md to navigation hub
- CDK entry point now supports multiple deployment modes (single, split, cross-account)

### Deprecated

- `SlackBedrockStack` single-stack deployment (use split-stack instead)

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

