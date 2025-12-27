# Slack AI App

> **日本語版**: [README.ja.md](README.ja.md)

A serverless Slack bot that securely connects Slack with Amazon Bedrock to provide AI-generated responses. This solution enables teams to use AI capabilities directly from Slack while maintaining enterprise-grade security and performance.

## What This System Does

This application enables teams to use AI capabilities directly from Slack. Team members can ask questions, get AI-generated responses, and share knowledge—all within the Slack communication platform.

**Key Value**: Secure connection between Slack and generative AI services that reduces barriers to AI adoption while maintaining strong security boundaries.

## Why It Matters

### Immediate Benefits

- **Zero learning curve**: Use AI directly from Slack—no new tools to learn
- **Instant acknowledgment**: Get confirmation within 2 seconds that your request is being processed
- **Fast responses**: Receive AI-generated answers in 5-30 seconds
- **Team knowledge sharing**: See how colleagues effectively use AI, creating network effects
- **Enterprise security**: Multi-layered defense protects against unauthorized access and data breaches

### Business Impact

- **Increased productivity**: Keep AI interactions within Slack to reduce context switching
- **Faster decision-making**: Get answers to questions without leaving your workflow
- **Organizational learning**: Team members naturally discover effective AI usage patterns through observation
- **Cost efficiency**: Pay-per-use model with built-in rate limiting and token management

## Quick Start

> **📖 Full guide**: [docs/quickstart.md](docs/quickstart.md)

### Prerequisites

- AWS account with Bedrock access
- Node.js 18+ and Python 3.11+
- Slack workspace admin permissions

### Deploy

This project uses two independent stacks (VerificationStack and ExecutionStack) that can be deployed separately, supporting cross-account deployments. See [CDK README](cdk/README.md) for detailed deployment instructions.

**Quick start with deployment script:**

```bash
# 1. Create .env file with credentials
cat > .env << EOF
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
EOF

# 2. Update cdk.json with account IDs
# Add "verificationAccountId" and "executionAccountId" to context

# 3. Run deployment script (with optional AWS profile)
export AWS_PROFILE=your-profile-name  # Optional: if using AWS profiles
set -a && source .env && set +a
./scripts/deploy-split-stacks.sh
```

**⚠️ Important**: Configure whitelist after deployment. See [Quick Start Guide](docs/quickstart.md).

## How It Works

The system processes requests through two independent zones that can be deployed separately for enhanced security:

```
┌─────────────────────────────────────────────────────────────┐
│ Slack Workspace                                              │
│ User: @bot question or /ask "question"                      │
└────────────────────┬────────────────────────────────────────┘
                     │ [1] HTTPS POST
                     │ X-Slack-Signature (HMAC SHA256)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Verification Zone                                            │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SlackEventHandler (Function URL)                        │ │
│ │ - Signature verification (Key 1)                       │ │
│ │ - Existence Check via Slack API (Key 2)                │ │
│ │ - Whitelist authorization                             │ │
│ │ - Event deduplication                                  │ │
│ │ [2] → Immediate response "Processing..." (<3 sec)      │ │
│ │ [3] → Calls Execution API (IAM authenticated)          │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [3] API Gateway (IAM auth)
                         │ POST /execute
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Execution Zone                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Execution API (API Gateway)                             │ │
│ │ - IAM authentication only                                │ │
│ │ - Resource policy: Verification Lambda role only        │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│ ┌─────────────────────▼──────────────────────────────────┐ │
│ │ BedrockProcessor                                        │ │
│ │ - Calls Amazon Bedrock Converse API                    │ │
│ │ - Processes attachments (images, documents)            │ │
│ │ [4] → Sends response to SQS queue                     │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [4] SQS Message
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Verification Zone (continued)                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ExecutionResponseQueue (SQS)                            │ │
│ │ - Receives responses from Execution Zone               │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│ ┌─────────────────────▼──────────────────────────────────┐ │
│ │ SlackResponseHandler                                    │ │
│ │ - Processes SQS messages                                │ │
│ │ - Posts responses to Slack API                         │ │
│ │ [5] → Posts to Slack (chat.postMessage)               │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [5] HTTPS POST
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Slack Workspace                                              │
│ [6] AI response displayed in thread                         │
└────────────────────────────────────────────────────────────┘
│ │ - Processes attachments (images, documents)            │ │
│ │ [4] → Posts response to Slack (thread reply)           │ │
│ └────────────────────┬───────────────────────────────────┘ │
│                      │ [4] HTTPS POST to Slack API         │
│                      ↓                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ AWS Bedrock Converse API                                 │ │
│ │ - Foundation Model (Claude, Nova, etc.)                │ │
│ │ - Multimodal input (text + images)                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────────────┐
│ Slack Workspace                                               │
│ [5] AI response displayed in thread (5-30 seconds)          │
└──────────────────────────────────────────────────────────────┘

Flow:
[1] User sends request via Slack
[2] Verification Zone responds immediately (<3 seconds)
[3] Verification Zone calls Execution API (IAM authenticated)
[4] Execution Zone processes with Bedrock and posts to Slack
[5] Response appears in Slack thread (5-30 seconds)
```

**Verification Zone** ensures requests are legitimate:

- Verifies Slack signatures to confirm requests come from Slack
- Checks that users, channels, and workspaces actually exist
- Enforces authorization rules (whitelist)
- Prevents duplicate requests

**Execution Zone** handles AI processing:

- Calls Amazon Bedrock to generate responses
- Manages conversation context and thread history
- Processes attachments (images, documents)
- Posts responses back to Slack

This separation enables:

- **Cross-account deployment**: Deploy verification and execution in different AWS accounts
- **Independent updates**: Update one zone without affecting the other
- **Enhanced security**: Stronger security boundaries between validation and processing

## Key Features

### Security

**Two-Key Defense Model**: Requires both Slack signing secret and bot token, so compromise of one key doesn't enable attacks.

- HMAC SHA256 signature verification
- Slack API existence checks (validates users, channels, workspaces are real)
- Whitelist authorization (team_id, user_id, channel_id)
- PII masking in AI responses
- Prompt injection detection

### Performance

- **Async processing**: Acknowledgment within 3 seconds, full response in 5-30 seconds
- **Event deduplication**: Prevents processing the same request twice
- **Structured logging**: Complete audit trail with correlation IDs

### AI Capabilities

- **Multi-model support**: Works with Claude, Nova, and other Bedrock models
- **Thread context**: Maintains conversation history within Slack threads
- **Attachment processing**: Handles images and documents in requests

### Infrastructure

- **AWS CDK**: Infrastructure as code in TypeScript
- **DynamoDB**: Stores tokens, caches verification results, prevents duplicates
- **AWS Secrets Manager**: Securely stores Slack credentials
- **Independent deployment**: Verification and execution zones can be deployed as separate stacks

## Architecture

The application uses **two independent stacks** that can be deployed separately:

- **VerificationStack**: SlackEventHandler + DynamoDB + Secrets Manager
- **ExecutionStack**: BedrockProcessor + API Gateway

This structure supports:

- ✅ Cross-account deployments
- ✅ Independent lifecycle management
- ✅ Enhanced security boundaries
- ✅ Flexible deployment options

For technical details, see [Architecture Overview](docs/reference/architecture/overview.md).

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

**Last Updated**: 2025-12-28
