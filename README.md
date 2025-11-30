# Slack Bedrock MVP

A minimal Slack bot that integrates with Amazon Bedrock to provide AI-generated responses. This MVP demonstrates basic connectivity between Slack and AWS Bedrock, prioritizing functionality over production-grade features.

## Overview

This project implements a serverless Slack bot that:

- Receives messages from Slack users (direct messages and channel mentions)
- Processes messages using Amazon Bedrock AI models
- Returns AI-generated responses to Slack users
- Handles errors gracefully with user-friendly messages

**Architecture**: Dual Lambda functions with async processing to meet Slack's 3-second timeout requirement.

## Architecture

```
Slack → Slack Event Handler (Lambda) → Bedrock Processor (Lambda) → Bedrock → Slack
```

### Components

- **Slack Event Handler** (`lambda/slack-event-handler/`): Receives Slack events, verifies signatures, and invokes Bedrock Processor asynchronously
- **Bedrock Processor** (`lambda/bedrock-processor/`): Invokes Bedrock API and posts responses to Slack
- **Infrastructure** (`cdk/`): AWS CDK (TypeScript) for provisioning Lambda functions, DynamoDB tables, and IAM roles

### Key Features

- ✅ HMAC SHA256 signature verification for Slack requests
- ✅ Event deduplication to prevent duplicate processing
- ✅ Async processing pattern (Slack Event Handler responds <3 seconds)
- ✅ Structured JSON logging for CloudWatch
- ✅ Error handling with user-friendly messages
- ✅ DynamoDB token storage for workspace installations
- ✅ Multi-model support (Claude and Nova models)

## Quick Start

See [quickstart.md](specs/001-slack-bedrock-mvp/quickstart.md) for detailed deployment instructions.

### Prerequisites

- AWS account with Bedrock access enabled
- Node.js 18+ and AWS CDK CLI
- Python 3.11+
- Slack workspace with admin permissions

### Quick Deploy

```bash
# 1. Configure environment variables
cp .env.example .env
# Edit .env with your Slack credentials and AWS region

# 2. Install dependencies
cd cdk && npm install
cd ../lambda/slack-event-handler && pip install -r requirements.txt -t .
cd ../bedrock-processor && pip install -r requirements.txt -t .

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
├── specs/001-slack-bedrock-mvp/  # Feature specification and docs
│   ├── spec.md                   # Feature specification
│   ├── plan.md                   # Implementation plan
│   ├── quickstart.md             # Deployment guide
│   └── tasks.md                  # Task breakdown
└── docs/
    └── slack-app-manifest.yaml   # Slack App manifest template
```

## Environment Variables

See `.env.example` for required environment variables:

- `SLACK_SIGNING_SECRET`: Slack app signing secret
- `SLACK_BOT_TOKEN`: Slack bot OAuth token
- `AWS_REGION_NAME`: AWS region (e.g., `ap-northeast-1`)
- `BEDROCK_MODEL_ID`: Bedrock model ID (e.g., `amazon.nova-pro-v1:0`)

## Documentation

- **[Quickstart Guide](specs/001-slack-bedrock-mvp/quickstart.md)**: Step-by-step deployment instructions
- **[Specification](specs/001-slack-bedrock-mvp/spec.md)**: Feature requirements and user stories
- **[Implementation Plan](specs/001-slack-bedrock-mvp/plan.md)**: Technical architecture and design decisions
- **[Tasks](specs/001-slack-bedrock-mvp/tasks.md)**: Development task breakdown
- **[Slack App Manifest](docs/slack-app-manifest.yaml)**: Template for creating Slack app

## Known Limitations (MVP Scope)

This MVP prioritizes basic functionality over production-grade features. The following are explicitly **out of scope** for this MVP:

### Functionality

- ❌ Multi-turn conversations with context retention
- ❌ Conversation history storage
- ❌ Advanced prompt engineering or custom prompt templates
- ❌ Rate limiting per user or workspace
- ❌ File/image processing
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

- **Slack verification fails**: Check Lambda Function URL and `SLACK_SIGNING_SECRET`
- **Bot doesn't respond**: Verify Event Subscriptions are enabled and bot is installed
- **Bedrock errors**: Check IAM permissions and model access in AWS Console

## License

[Add license information here]

## Support

For issues or questions:

- Check CloudWatch Logs first
- Review [Slack API Documentation](https://api.slack.com/docs)
- Review [Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- Create GitHub issue with logs and error messages
