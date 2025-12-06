# Slack Bedrock MVP

A minimal Slack bot that integrates with Amazon Bedrock to provide AI-generated responses. This MVP demonstrates basic connectivity between Slack and AWS Bedrock, prioritizing functionality over production-grade features.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Documentation](#documentation)
- [Development Guidelines](#development-guidelines)
- [Development](#development)
- [Known Limitations](#known-limitations-mvp-scope)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## Overview

This project implements a serverless Slack bot that:

- Receives messages from Slack users (direct messages and channel mentions)
- Processes messages using Amazon Bedrock AI models
- Returns AI-generated responses to Slack users
- Handles errors gracefully with user-friendly messages

**Architecture**: Dual Lambda functions with async processing to meet Slack's 3-second timeout requirement. This architecture follows a **multi-layered security approach** with verification, execution, and AI protection layers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Slack Workspace                                             │
│ User triggers: /ask "question" or @bot mentions             │
└────────────────────┬────────────────────────────────────────┘
                     │ [1] HTTPS POST (sync)
                     │ X-Slack-Signature (HMAC SHA256)
                     │ + response_url (Webhook URL)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Verification Layer: Slack Event Handler (Lambda)            │
│ - HMAC SHA256 signature verification                        │
│ - Event deduplication (DynamoDB)                            │
│ - [2] → Immediate "Processing..." response (<3 seconds)     │
│ - [3] → Async invocation of Bedrock Processor               │
└────────────────────┬────────────────────────────────────────┘
                     │ [3] Lambda async invocation
                     │ InvocationType: Event
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Execution Layer: Bedrock Processor (Lambda)                 │
│ - AWS Bedrock API invocation (Claude/Nova models)           │
│ - Error handling and retry logic                            │
│ - [4] → POST response to response_url                       │
└────────────────────┬────────────────────────────────────────┘
                     │ [4] HTTPS POST to response_url
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Slack Workspace                                             │
│ [5] Display AI response in channel                          │
└─────────────────────────────────────────────────────────────┘
```

### Components

- **Slack Event Handler** (`lambda/slack-event-handler/`): Receives Slack events, verifies signatures, and invokes Bedrock Processor asynchronously
  - HMAC SHA256 signature verification
  - Event deduplication using DynamoDB
  - Immediate acknowledgment (<3 seconds)
  - Token storage and retrieval

- **Bedrock Processor** (`lambda/bedrock-processor/`): Invokes Bedrock API and posts responses to Slack
  - AWS Bedrock API integration
  - Multi-model support (Claude, Nova)
  - Error handling and user-friendly messages
  - Response posting via Slack Webhooks
  - **Attachment processing**: Downloads and processes images and documents from Slack
  - **Image analysis**: Supports vision models for image content analysis
  - **Document extraction**: Extracts text from PDF, DOCX, CSV, XLSX, PPTX, TXT files
  - **PPTX conversion**: Converts PowerPoint slides to images using LibreOffice

- **Infrastructure** (`cdk/`): AWS CDK (TypeScript) for provisioning Lambda functions, DynamoDB tables, and IAM roles
  - Lambda function URLs for public access
  - DynamoDB tables for event deduplication and tokens
  - IAM roles with least privilege
  - AWS Secrets Manager integration

For complete architecture details, see [docs/architecture/overview.md](docs/architecture/overview.md).

## Key Features

- ✅ HMAC SHA256 signature verification for Slack requests
- ✅ Event deduplication to prevent duplicate processing
- ✅ Async processing pattern (Slack Event Handler responds <3 seconds)
- ✅ Structured JSON logging for CloudWatch
- ✅ Error handling with user-friendly messages
- ✅ DynamoDB token storage for workspace installations
- ✅ Multi-model support (Claude and Nova models)
- ✅ **Image attachment processing** - Analyze images using AWS Bedrock vision capabilities (PNG, JPEG, GIF, WebP)
- ✅ **Document attachment processing** - Extract text from PDF, DOCX, CSV, XLSX, PPTX, TXT files
- ✅ **PPTX slide-to-image conversion** - Convert PowerPoint slides to images for visual analysis
- ✅ **Multiple attachments support** - Process multiple attachments in a single message

## Quick Start

See [quickstart.md](specs/001-slack-bedrock-mvp/quickstart.md) for detailed deployment instructions.

### Prerequisites

- AWS account with Bedrock access enabled
- Node.js 18+ and AWS CDK CLI
- Python 3.11+
- Slack workspace with admin permissions

### Quick Deploy

```bash
# 1. Configure environment variables (first deployment only)
export SLACK_SIGNING_SECRET=your-signing-secret
export SLACK_BOT_TOKEN=your-bot-token
# Or use .env file - see quickstart.md for details

# 2. Install dependencies
cd cdk && npm install
cd ../lambda/slack-event-handler && pip install --upgrade pip && pip install -r requirements.txt -t .
cd ../bedrock-processor && pip install --upgrade pip && pip install -r requirements.txt -t .

# 3. Deploy infrastructure
cd ../../cdk
cdk deploy

# 4. Configure Slack App
# - Create Slack App at https://api.slack.com/apps
# - Set Event Subscriptions URL to Lambda Function URL
# - Subscribe to message.im and app_mentions events
# - Install app to workspace
```

## Project Structure

```
slack-ai-app/
├── cdk/                          # AWS CDK infrastructure (TypeScript)
│   ├── lib/
│   │   ├── slack-bedrock-stack.ts
│   │   └── constructs/          # CDK constructs
│   └── bin/
│       └── cdk.ts
├── lambda/
│   ├── slack-event-handler/      # Slack Event Handler Lambda
│   │   ├── handler.py
│   │   ├── slack_verifier.py
│   │   ├── token_storage.py
│   │   └── requirements.txt
│   └── bedrock-processor/        # Bedrock Processor Lambda
│       ├── handler.py
│       ├── bedrock_client.py
│       ├── slack_poster.py
│       └── requirements.txt
├── docs/                         # Comprehensive architecture documentation
│   ├── README.md                 # Documentation entry point
│   ├── requirements/             # Business and functional requirements
│   ├── architecture/             # System architecture and design
│   ├── security/                 # Security requirements and implementation
│   ├── implementation/           # Implementation roadmap
│   ├── operations/               # Testing, monitoring, incident response
│   ├── adr/                      # Architecture Decision Records
│   ├── appendix.md               # Glossary and references
│   └── slack-app-manifest.yaml   # Slack App manifest template
├── specs/001-slack-bedrock-mvp/  # Feature specification and docs
│   ├── spec.md                   # Feature specification
│   ├── plan.md                   # Implementation plan
│   ├── quickstart.md             # Deployment guide
│   └── tasks.md                  # Task breakdown
└── CLAUDE.md                     # Development guidelines and policies
```

## Environment Variables

### Initial Deployment

For the **first deployment only**, you need to set the following environment variables so that CDK can create the secrets in AWS Secrets Manager:

- `SLACK_SIGNING_SECRET`: Slack app signing secret (from Slack App settings)
- `SLACK_BOT_TOKEN`: Slack bot OAuth token (from Slack App installation)

After the first deployment, these environment variables are no longer needed. The secrets are stored securely in AWS Secrets Manager and are automatically used by Lambda functions.

### Other Configuration

- `AWS_REGION_NAME`: AWS region (e.g., `ap-northeast-1`) - configured in `cdk.json`
- `BEDROCK_MODEL_ID`: Bedrock model ID (e.g., `amazon.nova-pro-v1:0`) - configured in `cdk.json`

### Secrets Management

Secrets are managed using **AWS Secrets Manager**:

- Secrets are created automatically during CDK deployment
- Secrets are encrypted at rest using AWS managed keys
- Lambda functions are granted read-only access to secrets
- Secrets are automatically injected as environment variables in Lambda functions
- To update secrets after deployment, use AWS CLI or AWS Console (see [quickstart.md](specs/001-slack-bedrock-mvp/quickstart.md) for details)

## Documentation

### 📚 Comprehensive Architecture Documentation

**Start here**: [docs/README.md](docs/README.md) - Complete architecture documentation entry point

#### Documentation Structure

The project includes comprehensive architecture documentation organized by topic:

- **[Requirements](docs/requirements/functional-requirements.md)**: Business and functional requirements
- **[Architecture](docs/architecture/)**:
  - [Overview](docs/architecture/overview.md) - System architecture and components
  - [User Experience](docs/architecture/user-experience.md) - User flows and UX design
  - [Implementation Details](docs/architecture/implementation-details.md) - Technical implementation
- **[Security](docs/security/)**:
  - [Requirements](docs/security/requirements.md) - Security requirements (SR-01 through SR-06)
  - [Threat Model](docs/security/threat-model.md) - Threat analysis and risk assessment
  - [Implementation](docs/security/implementation.md) - Security implementation code
- **[Operations](docs/operations/)**:
  - [Slack Setup Guide](docs/operations/slack-setup.md) - Slack App creation and configuration guide
  - [Testing](docs/operations/testing.md) - Test scenarios, BDD, validation
  - [Monitoring](docs/operations/monitoring.md) - Monitoring, alerts, incident response
- **[Implementation Roadmap](docs/implementation/roadmap.md)**: Phased implementation plan
- **[ADRs (Architecture Decision Records)](docs/adr/)**: Documented architectural decisions
- **[Appendix](docs/appendix.md)**: Glossary and references

### 🚀 Quick Start Documentation

- **[Quickstart Guide](specs/001-slack-bedrock-mvp/quickstart.md)**: Step-by-step deployment instructions
- **[Specification](specs/001-slack-bedrock-mvp/spec.md)**: Feature requirements and user stories
- **[Implementation Plan](specs/001-slack-bedrock-mvp/plan.md)**: Technical architecture and design decisions
- **[Tasks](specs/001-slack-bedrock-mvp/tasks.md)**: Development task breakdown
- **[Slack App Manifest](docs/slack-app-manifest.yaml)**: Template for creating Slack app

## Development Guidelines

**⚠️ IMPORTANT**: All developers and AI agents must follow the guidelines in [CLAUDE.md](CLAUDE.md)

### Key Policies

1. **Documentation Maintenance Policy**:
   - Always read `README.md` and relevant `docs/` sections before making changes
   - Update documentation whenever code changes
   - Create ADRs for architectural decisions

2. **Claude Agents & Skills Usage Policy**:
   - Use appropriate specialized agents for each task type
   - coding-agent for implementation
   - code-review-agent before merging
   - code-documentation-agent for ADRs and docs
   - thinking-agent for complex decisions

See [CLAUDE.md](CLAUDE.md) for complete guidelines, workflows, and mandatory requirements.

## Known Limitations (MVP Scope)

This MVP prioritizes basic functionality over production-grade features. The following are explicitly **out of scope** for this MVP:

### Functionality

- ❌ Multi-turn conversations with context retention
- ❌ Conversation history storage
- ❌ Advanced prompt engineering or custom prompt templates
- ❌ Rate limiting per user or workspace
- ✅ File/image processing (images and documents supported)
- ❌ Custom slash commands
- ❌ Interactive Slack components (buttons, modals, etc.)

### Security & Compliance

- ❌ Comprehensive monitoring and alerting (basic CloudWatch only)
- ❌ Production-grade error handling with exponential backoff
- ❌ Compliance certifications (SOC2, GDPR, HIPAA)
- ❌ Advanced authorization checks (whitelist users/channels)
- ❌ Bedrock Guardrails integration (deferred to post-MVP)
- ❌ PII detection and masking (deferred to post-MVP)

### Infrastructure

- ❌ Multi-region deployment
- ❌ High availability and disaster recovery
- ❌ CI/CD pipeline automation
- ❌ Comprehensive unit tests and integration tests (manual testing only)
- ❌ Cost optimization and granular resource limits

### Testing

- ❌ BDD test scenarios (manual testing per quickstart.md)
- ❌ Integration tests with LocalStack
- ❌ Load testing

**Note**: These limitations are documented in [spec.md](specs/001-slack-bedrock-mvp/spec.md) under "Out of Scope". All deferred features should be implemented before production deployment.

## Development

### Running Tests

```bash
# Signature verification tests
cd lambda/slack-event-handler
pytest tests/

# Error handling tests
cd ../bedrock-processor
pytest tests/
```

### Viewing Logs

```bash
# Slack Event Handler logs
aws logs tail /aws/lambda/slack-event-handler --follow --region ap-northeast-1

# Bedrock Processor logs
aws logs tail /aws/lambda/bedrock-processor --follow --region ap-northeast-1
```

### Local Development

Lambda functions can be tested locally using AWS SAM or by invoking them directly:

```bash
# Test Slack Event Handler
python lambda/slack-event-handler/handler.py

# Test Bedrock Processor
python lambda/bedrock-processor/handler.py
```

## Troubleshooting

See [quickstart.md](specs/001-slack-bedrock-mvp/quickstart.md#troubleshooting) for common issues and solutions.

### Common Issues

- **Slack verification fails**: Check Lambda Function URL and verify the secret value in AWS Secrets Manager
- **Bot doesn't respond**: Verify Event Subscriptions are enabled and bot is installed
- **Bedrock errors**: Check IAM permissions and model access in AWS Console
- **Secret access errors**: Ensure Lambda function has permission to read secrets (should be automatically granted by CDK)

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Read Documentation**: Review [CLAUDE.md](CLAUDE.md) for development guidelines
2. **Follow Policies**: Adhere to Documentation Maintenance and Claude Agents usage policies
3. **Use Appropriate Agents**: Use specialized agents for different task types
4. **Update Documentation**: Always update `README.md` and `docs/` when making changes
5. **Create ADRs**: Document architectural decisions in `docs/adr/`
6. **Write Tests**: Include tests for new features
7. **Follow Code Style**: Python (PEP 8), TypeScript (standard conventions)

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make changes following development guidelines
4. Update documentation
5. Run tests and ensure they pass
6. Submit pull request with clear description
7. Request code review using code-review-agent

## License

[Add license information here]

## Support

For issues or questions:

1. **Check Documentation First**:
   - [docs/README.md](docs/README.md) - Comprehensive architecture documentation
   - [Troubleshooting Guide](specs/001-slack-bedrock-mvp/quickstart.md#troubleshooting)
   - [CLAUDE.md](CLAUDE.md) - Development guidelines

2. **Review Logs**:
   - Check CloudWatch Logs for detailed error information
   - Review structured JSON logs for debugging

3. **External Resources**:
   - [Slack API Documentation](https://api.slack.com/docs)
   - [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
   - [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

4. **Get Help**:
   - Create GitHub issue with:
     - Clear description of the problem
     - Relevant logs and error messages
     - Steps to reproduce
     - Environment details (region, model, etc.)

---

**Documentation Status**: ✅ Up-to-date with comprehensive architecture docs in `docs/`
**Last Updated**: 2025-12-06 (Added attachment processing documentation)
