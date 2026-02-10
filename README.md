# Slack AI App

> **日本語版**: [README.ja.md](README.ja.md)

A Slack bot that securely connects Slack with Amazon Bedrock to provide AI-generated responses. Uses Amazon Bedrock AgentCore with A2A (Agent-to-Agent) protocol for inter-zone communication, with FastAPI-based agent containers and enterprise-grade multi-layered defense security.

## What This System Does

This application enables teams to use AI capabilities directly from Slack. Team members can ask questions, get AI-generated responses, and share knowledge—all within the Slack communication platform.

**Key Value**: Secure connection between Slack and generative AI services that reduces barriers to AI adoption while maintaining strong security boundaries.

## Why It Matters

### Immediate Benefits

- **Zero learning curve**: Use AI directly from Slack—no new tools to learn
- **Instant acknowledgment**: Get confirmation within 2 seconds that your request is being processed
- **Fast responses**: Receive AI-generated answers after Bedrock processing completes (processing time varies based on model, input length, and load conditions)
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
- Docker (ARM64 build support — for AgentCore containers)
- AWS CDK CLI v2.215.0+
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

The system processes requests through two independent zones via a single **AgentCore A2A** communication path.

### AgentCore A2A Path (Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│ Slack Workspace                                              │
│ User: @bot question                                          │
└────────────────────┬────────────────────────────────────────┘
                     │ [1] HTTPS POST
                     │ X-Slack-Signature (HMAC SHA256)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Verification Zone                                            │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SlackEventHandler Lambda (Function URL)                 │ │
│ │ - Signature verification, reaction (👀) response         │ │
│ │ - AgentCore A2A path (only path)                          │ │
│ │ [2] InvokeAgentRuntime (SigV4)                          │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│ ┌─────────────────────▼──────────────────────────────────┐ │
│ │ Verification Agent (AgentCore Runtime, ARM64)           │ │
│ │ - A2A protocol (raw JSON POST, port 9000)              │ │
│ │ - Security pipeline: existence → auth → rate limit      │ │
│ │ - Agent Card: /.well-known/agent-card.json              │ │
│ │ [3] InvokeAgentRuntime (SigV4, cross-account)           │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [3] A2A (SigV4 auth)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Execution Zone                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Execution Agent (AgentCore Runtime, ARM64)               │ │
│ │ - FastAPI POST handler (raw JSON, port 9000)           │ │
│ │ - Bedrock Converse API, attachment processing           │ │
│ │ [4] Return JSON result via FastAPI response             │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │ [4] A2A response (async polling)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Verification Zone (continued)                                │
│ Verification Agent → Slack API (chat.postMessage)           │
│ [5] Posts AI response to thread                              │
└─────────────────────────────────────────────────────────────┘

Flow (AgentCore A2A):
[1] User sends @bot question
[2] SlackEventHandler → Verification Agent (InvokeAgentRuntime)
[3] Verification Agent → Execution Agent (A2A, SigV4)
[4] Execution Agent → Bedrock → return result via FastAPI
[5] Verification Agent → Slack API → thread reply
```

### Zone Responsibilities

**Verification Zone** ensures requests are legitimate:

- Verifies Slack signatures to confirm requests come from Slack
- Checks that users, channels, and workspaces actually exist
- Enforces authorization rules (whitelist)
- Prevents duplicate requests

**Execution Zone** handles AI processing:

- Calls Amazon Bedrock to generate responses
- Manages conversation context and thread history
- Processes attachments (images, documents)
- Returns results via A2A response to Verification Zone

This separation enables:

- **Cross-account deployment**: Deploy verification and execution in different AWS accounts
- **Independent updates**: Update one zone without affecting the other
- **Enhanced security**: SigV4 + resource-based policies for strong security boundaries
- **Simplified architecture**: Direct FastAPI routing in agent containers, no SDK dependency

## Key Features

### Security

**Two-Key Defense Model**: Requires both Slack signing secret and bot token, so compromise of one key doesn't enable attacks.

- HMAC SHA256 signature verification
- Slack API existence checks (validates users, channels, workspaces are real)
- Whitelist authorization (team_id, user_id, channel_id)

**AI Security**:

- PII masking in AI responses
- Prompt injection detection

### Performance

- **Async processing**: Acknowledgment (Lambda function timeout: 10 seconds), full response after Bedrock processing completes (processing time varies based on model, input length, and load conditions, and is unpredictable)
- **Event deduplication**: Prevents processing the same request twice
- **Structured logging**: Complete audit trail with correlation IDs

### AI Capabilities

- **Multi-model support**: Works with Claude, Nova, and other Bedrock models
- **Thread context**: Maintains conversation history within Slack threads
- **Attachment processing**: Handles images and documents in requests

### Infrastructure

- **AWS CDK**: Infrastructure as code in TypeScript
- **AgentCore Runtime**: A2A protocol ARM64 Docker containers with FastAPI
- **ECR**: Docker image management for AgentCore agents
- **DynamoDB**: Stores tokens, caches verification results, prevents duplicates
- **AWS Secrets Manager**: Securely stores Slack credentials and API keys
- **Independent deployment**: Verification and execution zones as separate stacks

## Architecture

The application uses **two independent stacks** that can be deployed separately:

- **VerificationStack**: SlackEventHandler Lambda + Verification Agent (AgentCore) + DynamoDB + Secrets Manager
- **ExecutionStack**: Execution Agent (AgentCore Runtime + ECR)

This structure supports:

- ✅ AgentCore A2A protocol for inter-zone communication
- ✅ Cross-account deployments (SigV4 + resource-based policies)
- ✅ Agent Card (A2A compliant) for Agent Discovery
- ✅ Independent lifecycle management

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
├── cdk/                        # AWS CDK infrastructure
│   ├── bin/                    # CDK entry point
│   ├── lib/
│   │   ├── execution/          # Execution Stack
│   │   │   ├── execution-stack.ts
│   │   │   ├── constructs/
│   │   │   │   ├── execution-agent-runtime.ts   # AgentCore Runtime (A2A)
│   │   │   │   └── execution-agent-ecr.ts       # ECR image build
│   │   │   ├── agent/
│   │   │   │   └── execution-agent/             # Execution Agent container
│   │   │   │       ├── main.py                  # A2A server
│   │   │   │       ├── agent_card.py            # Agent Card definition
│   │   │   │       ├── cloudwatch_metrics.py    # Metrics
│   │   │   │       └── tests/                   # Python tests (79 tests)
│   │   │   └── lambda/                          # Legacy Lambda code
│   │   ├── verification/       # Verification Stack
│   │   │   ├── verification-stack.ts
│   │   │   ├── constructs/
│   │   │   │   ├── verification-agent-runtime.ts # AgentCore Runtime (A2A)
│   │   │   │   ├── verification-agent-ecr.ts     # ECR image build
│   │   │   │   └── slack-event-handler.ts        # Invokes Verification Agent via A2A
│   │   │   ├── agent/
│   │   │   │   └── verification-agent/           # Verification Agent container
│   │   │   │       ├── main.py                   # A2A server
│   │   │   │       ├── a2a_client.py             # Execution Agent A2A client
│   │   │   │       ├── agent_card.py             # Agent Card definition
│   │   │   │       ├── cloudwatch_metrics.py     # Metrics
│   │   │   │       └── tests/                    # Python tests (83 tests, 94% pipeline.py coverage)
│   │   │   └── lambda/                           # SlackEventHandler Lambda
│   │   └── types/              # Shared type definitions
│   └── test/                   # CDK/Jest tests (25 tests)
├── docs/                       # Documentation
│   ├── reference/              # Architecture, Security, Operations
│   ├── explanation/            # Design Principles, ADRs
│   ├── tutorials/              # Getting Started
│   └── how-to/                 # Troubleshooting
├── specs/                      # Feature specifications
└── scripts/                    # Deployment scripts
```

## Development

### Run Tests

```bash
# CDK construct tests (Jest, 25 tests)
cd cdk && npx jest test/agentcore-constructs.test.ts --verbose

# Execution Agent tests (pytest, 79 tests)
cd cdk/lib/execution/agent/execution-agent && python -m pytest tests/ -v

# Verification Agent tests (pytest, 83 tests)
cd cdk/lib/verification/agent/verification-agent && python -m pytest tests/ -v

# SlackEventHandler Lambda tests
cd cdk/lib/verification/lambda/slack-event-handler && pytest tests/
```

### View Logs

```bash
aws logs tail /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler --follow
aws logs tail /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler --follow
```

## Environment Variables

| Variable                        | Description                                                     | Default                                          |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `SLACK_SIGNING_SECRET`          | Slack app signing secret (first deploy only)                    | -                                                |
| `SLACK_BOT_TOKEN`               | Slack bot OAuth token (first deploy only)                       | -                                                |
| `BEDROCK_MODEL_ID`              | Bedrock model (configured in cdk.json)                          | -                                                |
| `VERIFICATION_AGENT_ARN`        | Verification Agent AgentCore Runtime ARN (set by CDK) | - |
| `EXECUTION_AGENT_ARN`           | Execution Agent AgentCore Runtime ARN (cross-stack or config)    | - |

Secrets are stored in AWS Secrets Manager after first deployment.

## Key Management

This system uses multiple keys to ensure secure communication. All keys are securely stored in **AWS Secrets Manager** and retrieved at runtime.

### Two-Key Defense Model

Slack request verification uses a **Two-Key Defense** model with two independent keys. Even if one key is leaked, an attack cannot succeed without the other.

**Why Both Keys Are Required**:

For a request to be processed, **both verifications must pass**:

1. **Signature Verification (Key 1)**: Requires Signing Secret
   - Verifies that the request contains a valid signature
   - Without Signing Secret, a valid signature cannot be generated

2. **Existence Check (Key 2)**: Requires Bot Token
   - Calls Slack API to verify entity existence
   - Without Bot Token, Slack API cannot be called

**If Only One Key Is Leaked**:

- **Only Signing Secret leaked**: Signature verification passes, but Existence Check fails because Bot Token is required → **Attack blocked**
- **Only Bot Token leaked**: Existence Check is possible, but signature verification fails because Signing Secret is required → **Attack blocked**

**Only When Both Keys Are Leaked**:

- Signature verification (Key 1) passes
- Existence Check (Key 2) also passes
- All verifications pass → **Attack may succeed**

#### Key 1: Signing Secret

- **Purpose**: Verify Slack request signatures
- **Storage**: AWS Secrets Manager (`{StackName}/slack/signing-secret`)
- **Usage**: HMAC SHA256 signature verification (**executed for each request**)
  - Slack adds `X-Slack-Signature` header and `X-Slack-Request-Timestamp` header to requests
  - Lambda function **executes for each request**:
    1. Timestamp validation (within ±5 minutes, prevents replay attacks)
    2. Signature recalculation: Computes HMAC SHA256 from `v0:{timestamp}:{body}`
    3. Compares provided signature with recalculated signature (constant-time comparison)
  - Request is accepted only if signatures match
- **Protection**: Request authenticity (proves request was sent from Slack)

**Important Point**: While Signing Secret is stored as a fixed value, **signature verification is executed for each request**. Each request's signature depends on the request body and timestamp, so it differs for each request.

**Impact of Signing Secret Leakage**:

If Signing Secret is leaked, an attacker can generate valid signatures for any request body and timestamp. In other words, **after registering Signing Secret and Bot Token in the verification zone, if they are leaked, it is technically possible to pass spoofed requests**.

**Defense Mechanisms**:

1. **Two-Key Defense**: If only Signing Secret is leaked, Existence Check requires Bot Token, so attacks using non-existent entity IDs are blocked
2. **Timestamp Validation**: Only timestamps within ±5 minutes are valid (prevents replay attacks)
3. **Event Deduplication**: Prevents duplicate processing of the same request
4. **Whitelist Authorization**: Blocks requests from entities not in the whitelist

**Possibility of Spoofing Attacks Without Key Leakage**:

**Regarding replay attacks by intercepting legitimate Slack requests**:

If an attacker intercepts a legitimate Slack request (e.g., via man-in-the-middle attack) and replays it:

1. **Replaying the exact same request**:
   - Signature verification passes (signature, timestamp, body are the same)
   - However, **blocked by event deduplication** (same `event_id`)
   - **Result**: Returns 200 OK but does not process the request

2. **Modifying the request body and replaying**:
   - Since signature is computed from `v0:{timestamp}:{body}`, modifying the body causes signature mismatch
   - **Result**: Signature verification fails, returns 401 Unauthorized

3. **Modifying the timestamp and replaying**:
   - Since signature is computed from `v0:{timestamp}:{body}`, modifying the timestamp causes signature mismatch
   - Timestamps older than 5 minutes fail validation
   - **Result**: Signature verification fails, returns 401 Unauthorized

**Conclusion**: As long as keys are not leaked, even if an attacker intercepts legitimate requests, **replaying the exact same request is blocked by event deduplication, and modifying the request causes signature verification to fail**. In other words, **spoofed requests cannot pass unless keys are leaked**.

**However, an attack may succeed only if ALL of the following conditions are met**:

- Both Signing Secret and Bot Token are leaked
- Attacker can intercept legitimate requests (e.g., man-in-the-middle attack)
- Attacker can generate requests with new `event_id` (if they have access to Slack's internal systems)

This is an extremely rare case and difficult to achieve in normal attack scenarios.

**If Both Keys Are Leaked**:

If both Signing Secret + Bot Token are leaked, an attacker can:
- Generate valid signatures for any request (using Signing Secret)
- Pass Existence Check with real entity IDs (using Bot Token)
- If using whitelisted user IDs, pass all verifications

**Recommendations**:

- Immediately rotate both keys if key leakage is suspected
- Detect anomalous access patterns through monitoring and alerts
- Regular security audits and key rotation

#### Key 2: Bot Token

- **Purpose**: Existence Check via Slack API
- **Storage**: AWS Secrets Manager (`{StackName}/slack/bot-token`)
- **Usage**: Slack API calls
  - `team.info`: Verify `team_id` exists
  - `users.info`: Verify `user_id` exists
  - `conversations.info`: Verify `channel_id` exists
- **Protection**: Entity existence (blocks requests from deleted users/channels)

**Defense Against Spoofing Attacks Using Real User IDs**:

For attacks using real `team_id`/`user_id`/`channel_id` (when both Signing Secret and Bot Token are leaked), the system is protected by **Whitelist Authorization (Layer 3c)**:

- Signature verification (Key 1) passes
- Existence Check (Key 2) also passes (real entities)
- **Blocked by Whitelist Authorization**: Requests from entities not in the whitelist are rejected with 403 Forbidden
- When a whitelist is configured, even real user IDs cannot access the system unless they are included in the whitelist

**Important Limitation: Spoofing Attacks Using Whitelisted User IDs**:

**If both Signing Secret and Bot Token are leaked, it is technically possible for a third party to impersonate whitelisted users**. In this case:

- Signature verification (Key 1) passes
- Existence Check (Key 2) also passes (real entities)
- Whitelist authorization (Key 3) also passes (whitelisted user IDs)

**Defense and Mitigation**:

1. **Key Leakage Detection and Immediate Rotation**: If leakage is detected, immediately rotate both keys
2. **Monitoring and Alerts**: Detect anomalous access patterns (e.g., unusual IP addresses, time periods, request frequencies)
3. **Rate Limiting**: Minimize attack impact through per-user rate limiting
4. **Event Deduplication**: Prevent duplicate processing of the same request
5. **Principle of Least Privilege**: Lambda execution roles have only necessary permissions, limiting key access

**Recommendations**:

- Regular security audits and key rotation
- CloudWatch metrics and alert configuration
- Monitor anomalous access patterns
- Establish immediate response procedures when key leakage is suspected

### Key Retrieval and Caching

- **Retrieval Timing**: Retrieved from Secrets Manager when Lambda function executes
- **Caching**: In-memory caching (for performance)
  - Reused within the same Lambda instance
  - Secrets Manager accessed only on cold start
- **Access Control**: Minimum permissions granted to Lambda execution role
  - `secretsmanager:GetSecretValue` permission
  - Access limited to specific secret ARNs

### Key Rotation

- **Signing Secret**: Regenerate in Slack app settings, then manually update Secrets Manager
- **Bot Token**: Regenerate in Slack app settings, then manually update Secrets Manager

### Security Considerations

1. **Response to Key Leakage**:
   - Signing Secret only leaked: Blocked by Existence Check (requires Bot Token)
   - Bot Token only leaked: Blocked by signature verification (requires Signing Secret)
   - Both leaked: Immediately rotate both keys

2. **Key Storage**:
   - ✅ AWS Secrets Manager (recommended): Encryption, access control, audit logs
   - ❌ Environment variables: May appear in logs, difficult to rotate
   - ❌ In code: Exposed in version control, security risk

3. **Principle of Least Privilege**:
   - Lambda execution role can access only required secrets
   - Cross-account configurations restrict access via resource policies

4. **Importance of Whitelist Authorization**:
   - When whitelist is configured: Even real user IDs cannot access unless included in whitelist (defends against spoofing attacks using real user IDs)
   - When whitelist is empty (not configured): All requests are allowed (for flexible configuration)
   - **Recommendation**: Configure whitelist in production to allow only authorized entities

For details, see [Authentication & Authorization Security Guide](docs/reference/security/authentication-authorization.md).

## Troubleshooting

See [Troubleshooting Guide](docs/how-to/troubleshooting.md).

**Common Issues**:

| Issue                        | Solution                                       |
| ---------------------------- | ---------------------------------------------- |
| Signature verification fails | Check Lambda Function URL and Secrets Manager  |
| Existence Check fails        | Verify Bot Token OAuth scopes                  |
| Bot doesn't respond          | Check Event Subscriptions and bot installation |
| File not showing in thread (014) | Add **`files:write`** to Bot Token Scopes in Slack App OAuth & Permissions. Reinstall app to workspace. |

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

**Last Updated**: 2026-02-10

## Recent Updates

- **2026-02-10**: Echo-mode-disabled validation test suite (022)
  - Added 20 TDD tests across 4 new test classes in `tests/test_main.py` for the echo-mode-off (normal) pipeline flow
  - `Test022NormalFlowDelegation` (5 tests) — verifies echo off triggers execution delegation without echo prefix
  - `Test022SecurityCheckPipeline` (5 tests) — verifies security check ordering: existence check → authorization → rate limit
  - `Test022ExecutionErrorPaths` (6 tests) — verifies error handling with no internal detail leakage and `is_processing` reset
  - `Test022StructuredLogging` (4 tests) — verifies all logs are valid JSON with correlation IDs and no token leakage
  - pipeline.py enhancements: JSONDecodeError handling, Base64 decode logging
  - Test counts: Verification 83 (was 63), pipeline.py coverage 94%
- **2026-02-09**: Strands migration cleanup (021)
  - Migrated both agents from `bedrock-agentcore` SDK to FastAPI + uvicorn with direct route definitions
  - CloudWatch IAM namespace fix (`StringLike` with `SlackAI-*` pattern)
  - Echo mode config (`validationZoneEchoMode` in CdkConfig)
  - Dependency version pinning (`~=`), E2E test suite
  - Test counts: Verification 63, Execution 79, CDK 25
- **2026-02-08**: A2A file to Slack (014)
  - Execution Agent returns AI-generated files (CSV/JSON/text) as `generated_file` artifact
  - Verification Agent parses artifact and posts to thread (text then file) via `post_file_to_slack` (Slack SDK files_upload_v2)
  - File limits: 5 MB max, MIME types text/csv, application/json, text/plain. Bot scope `files:write` required
  - Spec and contracts in `specs/014-a2a-file-to-slack/`; zone-communication §6.5 documents the flow
- **2026-02-07**: Implemented AgentCore A2A inter-zone communication
  - Amazon Bedrock AgentCore Runtime with A2A protocol for inter-zone communication
  - Containerized Verification Agent / Execution Agent (ARM64 Docker)
  - SigV4 authentication + resource-based policies for cross-account support
  - Agent Card (`/.well-known/agent-card.json`) for Agent Discovery
  - AgentCore A2A as the only communication path
  - 97 TDD tests all passing (Python 73 + CDK/Jest 24, since expanded to 187+)
- **2025-12-28**: Added dual authentication support (IAM and API key) for Execution API Gateway
