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
│ User: @bot question                                          │
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
│ │ - Dual auth: IAM or API key (default: API key)          │ │
│ │ - Resource policy: Verification Lambda role + API key   │ │
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
│ [6] AI response displayed in thread (👀 → ✅/❌)              │
└────────────────────────────────────────────────────────────┘

Flow:
[1] User sends request via Slack
[2] Verification Zone responds with reaction (Lambda function timeout: 10 seconds)
[3] Verification Zone calls Execution API (IAM or API key auth, default: API key)
[4] Execution Zone processes with Bedrock and sends response to SQS
[5] SlackResponseHandler in Verification Zone consumes SQS and posts to Slack
[6] Response appears in Slack thread (after Bedrock processing completes)
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

## Environment Variables

| Variable                        | Description                                                     | Default                                          |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `SLACK_SIGNING_SECRET`          | Slack app signing secret (first deploy only)                    | -                                                |
| `SLACK_BOT_TOKEN`               | Slack bot OAuth token (first deploy only)                       | -                                                |
| `BEDROCK_MODEL_ID`              | Bedrock model (configured in cdk.json)                          | -                                                |
| `EXECUTION_API_AUTH_METHOD`     | Authentication method for Execution API (`iam` or `api_key`)    | `api_key`                                        |
| `EXECUTION_API_KEY_SECRET_NAME` | Secrets Manager secret name for API key (if using API key auth) | `execution-api-key-{env}` (environment-specific) |

**Authentication Methods**:

- **IAM Authentication**: Uses AWS Signature Version 4 (SigV4) signing with IAM credentials
- **API Key Authentication**: Uses API key stored in AWS Secrets Manager (default)

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

### Execution API Authentication Keys

Communication from Verification Zone to Execution Zone uses one of the following authentication methods.

#### API Key Authentication (Default)

- **Purpose**: Authenticate to Execution API Gateway
- **Storage**: AWS Secrets Manager (`execution-api-key-{env}`)
  - Development: `execution-api-key-dev`
  - Production: `execution-api-key-prod`
- **Usage**: Set API key in `x-api-key` header
- **Retrieval**: Lambda function retrieves from Secrets Manager at runtime

#### IAM Authentication (Alternative)

- **Purpose**: Authenticate to Execution API Gateway (alternative to API key)
- **Storage**: IAM role (Lambda execution role)
- **Usage**: AWS Signature Version 4 (SigV4) signing
- **Configuration**: Set environment variable `EXECUTION_API_AUTH_METHOD=iam`

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
- **Execution API Key**: Generate new API key in API Gateway, then update Secrets Manager (zero downtime)

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

- **2025-12-28**: Added dual authentication support (IAM and API key) for Execution API Gateway
  - Default authentication method: API key (configurable via `EXECUTION_API_AUTH_METHOD`)
  - API keys stored securely in AWS Secrets Manager
  - Supports future integrations with non-AWS APIs
