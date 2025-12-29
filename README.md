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

This project uses two independent stacks (VerificationStack and ExecutionStack) that can be deployed separately, supporting cross-account deployments.

**Deployment Steps**:
1. Deploy ExecutionStack → Get `ExecutionApiUrl`
2. Deploy VerificationStack → Get `VerificationLambdaRoleArn` and `ExecutionResponseQueueUrl`
3. Update ExecutionStack → Set resource policy and SQS queue URL

See [CDK README](cdk/README.md) for detailed deployment instructions.

**Quick start with deployment script:**

```bash
# 1. Create configuration file
cp cdk/cdk.config.json.example cdk/cdk.config.dev.json
# Edit cdk/cdk.config.dev.json and set:
# - verificationAccountId, executionAccountId
# - slackBotToken, slackSigningSecret

# 2. Set deployment environment (dev or prod)
export DEPLOYMENT_ENV=dev  # Use 'prod' for production

# 3. Run deployment script (with optional AWS profile)
export AWS_PROFILE=your-profile-name  # Optional: if using AWS profiles
./scripts/deploy-split-stacks.sh
```

**Note**: Slack credentials can be set directly in `cdk.config.{env}.json` file. Environment variables are also supported, but configuration files are easier to manage.

**⚠️ Important**: Configure whitelist after deployment. See [Quick Start Guide](docs/quickstart.md).

### Environment Separation

This project supports environment separation for development (`dev`) and production (`prod`) deployments:

- **Stack Names**: Automatically suffixed with `-Dev` or `-Prod` (e.g., `SlackAI-Execution-Dev`, `SlackAI-Verification-Prod`)
- **Resource Isolation**: All resources (Lambda functions, DynamoDB tables, Secrets Manager, API Gateway, etc.) are automatically separated by environment
- **Resource Tagging**: All resources are tagged with:
  - `Environment`: `dev` or `prod`
  - `Project`: `SlackAI`
  - `ManagedBy`: `CDK`
  - `StackName`: The stack name

**Usage:**

```bash
# Deploy to development environment
export DEPLOYMENT_ENV=dev
./scripts/deploy-split-stacks.sh

# Deploy to production environment
export DEPLOYMENT_ENV=prod
./scripts/deploy-split-stacks.sh
```

**Note**: If `DEPLOYMENT_ENV` is not set, the script defaults to `dev` environment with a warning. Each environment should use separate Slack apps/workspaces or different secrets for security.

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
- **AWS Secrets Manager**: Securely stores Slack credentials and API keys
- **API Gateway**: Dual authentication (IAM and API key) for inter-stack communication
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
│   ├── lib/
│   │   ├── execution/      # Execution Stack (完全自己完結)
│   │   │   ├── execution-stack.ts
│   │   │   ├── constructs/
│   │   │   └── lambda/     # Lambdaコード
│   │   │       └── bedrock-processor/
│   │   ├── verification/   # Verification Stack (完全自己完結)
│   │   │   ├── verification-stack.ts
│   │   │   ├── constructs/
│   │   │   └── lambda/     # Lambdaコード
│   │   │       ├── slack-event-handler/
│   │   │       └── slack-response-handler/
│   │   └── types/         # 共通型定義
│   └── bin/                # CDKエントリーポイント
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
cd cdk/lib/verification/lambda/slack-event-handler && pytest tests/
cd ../../execution/lambda/bedrock-processor && pytest tests/

# View logs
aws logs tail /aws/lambda/slack-event-handler --follow
aws logs tail /aws/lambda/bedrock-processor --follow
```

See [CLAUDE.md](CLAUDE.md) for development guidelines.

## AWS MCP Servers

This project includes AWS Model Context Protocol (MCP) servers for enhanced AI-assisted development. The servers provide access to AWS documentation, API operations, and Infrastructure-as-Code assistance.

### Available Servers

| Server | Purpose | Authentication |
|--------|---------|----------------|
| **aws-documentation-mcp-server** | Access AWS documentation and search content | None |
| **aws-knowledge-mcp-server** | Up-to-date AWS documentation, code samples, regional availability | None (rate limited) |
| **aws-api-mcp-server** | Interact with 15,000+ AWS APIs via natural language | AWS credentials required |
| **aws-iac-mcp-server** | CDK and CloudFormation documentation, template validation | AWS credentials required |

### Prerequisites

Install the `uv` package manager:

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Or using Homebrew
brew install uv
```

### Configuration

The project includes a pre-configured `.claude/mcp.json` file with all four AWS MCP servers. The configuration uses environment variable expansion for flexible setup:

```json
{
  "mcpServers": {
    "aws-documentation-mcp-server": { ... },
    "aws-knowledge-mcp-server": { ... },
    "aws-api-mcp-server": { ... },
    "aws-iac-mcp-server": { ... }
  }
}
```

### Environment Variables

The MCP servers use these environment variables (with defaults):

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `ap-northeast-1` | AWS region for API operations |
| `AWS_PROFILE` | `default` | AWS credential profile to use |
| `HOME` | System default | User home directory |

### Usage

Once configured, Claude Code will automatically detect and use the MCP servers. You can:

- Ask questions about AWS services and get documentation snippets
- Execute AWS API operations through natural language
- Get help with CDK and CloudFormation templates
- Search for code examples and best practices

### Approval

When first using project-scoped MCP servers, Claude Code will prompt for approval. To reset approval choices:

```bash
claude mcp reset-project-choices
```

### References

- [AWS MCP Servers Documentation](https://awslabs.github.io/mcp/)
- [GitHub Repository](https://github.com/awslabs/mcp)
- [Claude Code MCP Guide](https://code.claude.com/docs/en/mcp)

## AWS MCP Orchestrator Skill

This project includes an intelligent AWS MCP Orchestrator skill that automatically routes AWS-related queries to the most appropriate MCP server with built-in safety gates and transparency.

### What It Does

The orchestrator analyzes your AWS queries and:

- **Classifies intent** - Determines what you're trying to accomplish
- **Routes intelligently** - Selects the best MCP server(s) for your query
- **Enforces safety** - Prevents accidental resource modifications with confirmation gates
- **Provides transparency** - Explains which server is being used and why
- **Manages fallbacks** - Automatically switches servers if rate-limited

### Design Priorities

1. **Safety** - Prevents accidental AWS resource modifications
2. **Accuracy** - Ensures correct information from the right server
3. **Freshness** - Uses latest AWS documentation when needed
4. **Transparency** - Always explains routing decisions
5. **Speed** - Optimizes for fast responses
6. **Cost** - Minimizes unnecessary API calls

### Intent Types

The orchestrator recognizes six query types:

| Intent | Description | Example | Server Used |
|--------|-------------|---------|-------------|
| **DOCUMENTATION_LOOKUP** | General AWS concepts and how-to questions | "How do I configure Lambda environment variables?" | knowledge-mcp |
| **LATEST_INFORMATION** | Recent updates, new features, regional availability | "Latest Bedrock models in 2025?" | documentation-mcp |
| **IAC_ASSISTANCE** | CDK/CloudFormation code generation and validation | "Generate CDK code for Lambda + DynamoDB" | iac-mcp |
| **ACCOUNT_INSPECTION** | Read-only AWS account resource queries | "List my Lambda functions" | account-mcp |
| **RESOURCE_MODIFICATION** | Create/update/delete AWS resources | "Update Lambda function memory to 512MB" | resource-mcp (with safety gate) |
| **ARCHITECTURAL_GUIDANCE** | Multi-step architectural decisions | "Best way to implement API authentication?" | Multiple servers |

### Safety Gates

For resource modification queries, the orchestrator:

1. **Detects write operations** - Identifies create/update/delete intent
2. **Shows preview** - Displays exactly what will be executed
3. **Requires confirmation** - Waits for explicit "CONFIRM" response
4. **Analyzes impact** - Warns about irreversibility, cost, dependencies
5. **Provides alternatives** - Suggests safer options when available

**Example**:

```
User: "Delete DynamoDB table my-test-table"

Orchestrator:
⚠️  HIGH RISK OPERATION DETECTED

Operation: DeleteTable
Service: DynamoDB
Resource: my-test-table

Impact:
❌ Permanent data loss (table and all items)
❌ Cannot be undone
⚠️  Dependent resources may break

To proceed, type exactly: CONFIRM DELETE my-test-table
```

### Usage

The orchestrator activates automatically when you ask AWS-related questions:

```bash
# General documentation
"How does Lambda concurrency work?"
→ Routes to: knowledge-mcp (fast, cached)

# Latest information
"What are the latest Lambda runtime versions in 2025?"
→ Routes to: documentation-mcp (fresh, up-to-date)

# Infrastructure code
"Generate CDK code for API Gateway with API key authentication"
→ Routes to: iac-mcp (specialized for IaC)

# Account inspection
"List my DynamoDB tables in ap-northeast-1"
→ Routes to: account-mcp (read-only, requires AWS auth)

# Resource modification (with safety gate)
"Update Lambda function timeout to 60 seconds"
→ Routes to: resource-mcp (preview + confirmation required)
```

### Project Context Optimization

The orchestrator is optimized for this Slack AI App project and recognizes:

- **Technologies**: Lambda, DynamoDB, API Gateway, CDK, Secrets Manager, Bedrock
- **Common patterns**: Slack event handling, Bedrock API integration, API authentication
- **Language preferences**: Python 3.11 for Lambda, TypeScript for CDK

When you ask project-specific questions, the orchestrator automatically:
- Filters results for relevant technologies
- Provides code examples in the right languages
- Suggests patterns that fit the project architecture

### Fallback Chain

If the primary server is unavailable or rate-limited:

```
documentation-mcp (rate-limited)
    ↓
knowledge-mcp (fallback)
    + Warning: "Using cached docs (may not reflect latest updates)"
```

### Transparency

Every response includes:

```
📋 Intent: DOCUMENTATION_LOOKUP
🔍 Server: knowledge-mcp
💡 Reason: General AWS concept, stable documentation
✅ Safety: No auth required, read-only

[Response content]

---
Powered by knowledge-mcp
```

### Documentation

- **Skill Definition**: `.claude/skills/aws-mcp-orchestrator/SKILL.md`
- **Usage Guide**: `.claude/skills/aws-mcp-orchestrator/README.md`
- **Examples**: `.claude/skills/aws-mcp-orchestrator/examples.md` (28 comprehensive examples)

## Environment Variables

| Variable                        | Description                                                      | Default     |
| ------------------------------- | ---------------------------------------------------------------- | ----------- |
| `SLACK_SIGNING_SECRET`          | Slack app signing secret (first deploy only)                     | -           |
| `SLACK_BOT_TOKEN`               | Slack bot OAuth token (first deploy only)                        | -           |
| `BEDROCK_MODEL_ID`              | Bedrock model (configured in cdk.json)                          | -           |
| `EXECUTION_API_AUTH_METHOD`     | Authentication method for Execution API (`iam` or `api_key`)     | `api_key`   |
| `EXECUTION_API_KEY_SECRET_NAME` | Secrets Manager secret name for API key (if using API key auth)  | `execution-api-key-{env}` (environment-specific) |

**Authentication Methods**:
- **IAM Authentication**: Uses AWS Signature Version 4 (SigV4) signing with IAM credentials
- **API Key Authentication**: Uses API key stored in AWS Secrets Manager (default)

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

**Last Updated**: 2025-12-29

## Recent Updates

- **2025-12-29**: Added AWS MCP Servers and AWS MCP Orchestrator Skill
  - Configured 4 AWS MCP servers (documentation, knowledge, api, iac)
  - Created intelligent orchestrator skill with 6 intent types
  - Implemented safety gates for resource modification operations
  - Project-optimized for Slack AI App (Lambda, DynamoDB, API Gateway, CDK, Bedrock)
- **2025-12-28**: Added dual authentication support (IAM and API key) for Execution API Gateway
  - Default authentication method: API key (configurable via `EXECUTION_API_AUTH_METHOD`)
  - API keys stored securely in AWS Secrets Manager
  - Supports future integrations with non-AWS APIs
