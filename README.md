# Slack Bedrock MVP

> **日本語版**: [README.ja.md](README.ja.md)

A serverless Slack bot that integrates with Amazon Bedrock to provide AI-generated responses. Features multi-layered security, thread support, and attachment processing.

## Quick Start

> **📖 Full guide**: [docs/quickstart.md](docs/quickstart.md)

### Prerequisites

- AWS account with Bedrock access
- Node.js 18+ and Python 3.11+
- Slack workspace admin permissions

### Deploy

```bash
# 1. Set credentials (first deployment only)
export SLACK_SIGNING_SECRET=your-signing-secret
export SLACK_BOT_TOKEN=xoxb-your-bot-token

# 2. Install dependencies
cd cdk && npm install
cd ../lambda/verification-stack/slack-event-handler && pip install -r requirements.txt -t .
cd ../../execution-stack/bedrock-processor && pip install -r requirements.txt -t .

# 3. Deploy
cd ../../cdk && cdk deploy
```

**⚠️ Important**: Configure whitelist after deployment. See [Quick Start Guide](docs/quickstart.md).

## Overview

**Key Value Propositions**:

- **Natural workflow integration**: Use AI on Slack without learning new tools
- **Minimal actions**: One-click access (mention `@bot question`)
- **Knowledge sharing**: Team members see effective usage patterns

**Design Principles**: Leverages Nudge Theory and network effects. See [Design Principles](docs/explanation/design-principles.md).

## Architecture

```
Slack → Lambda① (Verification) → API Gateway → Lambda② (Bedrock) → Slack
          ↓                                        ↓
    Two-Key Defense                         Converse API
    (Signature + Existence Check)           Thread History
```

**Components**:

| Component               | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| **Slack Event Handler** | Signature verification, Existence Check, event deduplication |
| **Execution API**       | IAM-authenticated internal API                               |
| **Bedrock Processor**   | Converse API, thread history, attachments                    |

For details, see [Architecture Overview](docs/reference/architecture/overview.md).

## Key Features

### 🔒 Security

- Two-Key Defense (HMAC SHA256 + Slack API Existence Check)
- Whitelist authorization (team_id, user_id, channel_id)
- PII masking, prompt injection detection

### ⚡ Processing

- Async processing (<3 second acknowledgment)
- Event deduplication
- Structured JSON logging

### 🤖 AI & Integration

- Multi-model support (Claude, Nova)
- Thread replies with history context
- Attachment processing (images, documents)

### 🏗️ Infrastructure

- AWS CDK (TypeScript)
- DynamoDB (tokens, cache, deduplication)
- AWS Secrets Manager
- **Split-stack deployment** (cross-account ready)

### 🔀 Deployment Options

| Mode             | Description                     | Use Case                             |
| ---------------- | ------------------------------- | ------------------------------------ |
| **Single Stack** | All resources in one stack      | Simple deployments                   |
| **Split Stack**  | Verification + Execution stacks | Cross-account, independent lifecycle |

See [CDK README](cdk/README.md) for deployment options.

## Documentation

| Audience            | Path                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Getting Started** | [Quick Start](docs/quickstart.md)                                                                                                 |
| **Developers**      | [Architecture](docs/reference/architecture/overview.md) → [Implementation](docs/reference/architecture/implementation-details.md) |
| **Security Team**   | [Security Requirements](docs/reference/security/requirements.md) → [Threat Model](docs/reference/security/threat-model.md)        |
| **Operations**      | [Slack Setup](docs/reference/operations/slack-setup.md) → [Monitoring](docs/reference/operations/monitoring.md)                   |
| **Decision Makers** | [Non-Technical Overview](docs/presentation/non-technical-overview.md)                                                             |

**Full Documentation**: [docs/README.md](docs/README.md)

## Project Structure

```
slack-ai-app/
├── cdk/                    # AWS CDK infrastructure
├── lambda/
│   ├── verification-stack/  # Verification Zone (検証層)
│   │   └── slack-event-handler/
│   └── execution-stack/     # Execution Zone (実行層)
│       └── bedrock-processor/
├── docs/                   # Documentation
│   ├── reference/          # Architecture, Security, Operations
│   ├── explanation/        # Design Principles, ADRs
│   ├── tutorials/          # Getting Started
│   └── how-to/             # Troubleshooting
└── specs/                  # Feature specifications
```

## Development

```bash
# Run tests
cd lambda/verification-stack/slack-event-handler && pytest tests/
cd ../../execution-stack/bedrock-processor && pytest tests/

# View logs
aws logs tail /aws/lambda/slack-event-handler --follow
aws logs tail /aws/lambda/bedrock-processor --follow
```

See [CLAUDE.md](CLAUDE.md) for development guidelines.

## Environment Variables

| Variable               | Description                                  |
| ---------------------- | -------------------------------------------- |
| `SLACK_SIGNING_SECRET` | Slack app signing secret (first deploy only) |
| `SLACK_BOT_TOKEN`      | Slack bot OAuth token (first deploy only)    |
| `BEDROCK_MODEL_ID`     | Bedrock model (configured in cdk.json)       |

Secrets are stored in AWS Secrets Manager after first deployment.

## Troubleshooting

See [Troubleshooting Guide](docs/how-to/troubleshooting.md).

**Common Issues**:

| Issue                        | Solution                                       |
| ---------------------------- | ---------------------------------------------- |
| Signature verification fails | Check Lambda Function URL and Secrets Manager  |
| Existence Check fails        | Verify Bot Token OAuth scopes                  |
| Bot doesn't respond          | Check Event Subscriptions and bot installation |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Read [CLAUDE.md](CLAUDE.md) for development policies
2. Create feature branch
3. Update documentation with code changes
4. Submit pull request

## License

[Add license information here]

## Support

1. Check [Documentation](docs/README.md)
2. Review [Troubleshooting Guide](docs/how-to/troubleshooting.md)
3. Create GitHub issue with logs and reproduction steps

---

**Last Updated**: 2025-12-27
