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

> **📖 Full guide**: [docs/developer/quickstart.md](docs/developer/quickstart.md)

### Prerequisites

- AWS account with Bedrock access
- Node.js 18+ and Python 3.11+
- Docker (ARM64 build support — for AgentCore containers)
- AWS CDK CLI v2.215.0+
- Slack workspace admin permissions

### Deploy

This project uses five independent CDK apps (one per agent zone) deployed sequentially. Execution zones deploy first, then the Verification zone.

**Deployment Steps**:

1. Configure each zone's `cdk.config.dev.json` with your account IDs and Slack credentials
2. Deploy all execution zones → Execution Agent ARNs are output
3. Set `executionAgentArns` in the Verification zone config
4. Deploy Verification zone

See [docs/developer/quickstart.md](docs/developer/quickstart.md) for detailed deployment instructions.

**Quick start with deployment script:**

```bash
# 1. Configure each zone (edit account IDs, Slack tokens, etc.)
# execution-zones/file-creator-agent/cdk/cdk.config.dev.json
# execution-zones/time-agent/cdk/cdk.config.dev.json
# execution-zones/docs-agent/cdk/cdk.config.dev.json
# execution-zones/fetch-url-agent/cdk/cdk.config.dev.json
# verification-zones/verification-agent/cdk/cdk.config.dev.json

# 2. Set deployment environment (dev or prod)
export DEPLOYMENT_ENV=dev  # Use 'prod' for production

# 3. Run full deployment (execution zones → verification zone)
export AWS_PROFILE=your-profile-name  # Optional: if using AWS profiles
DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy
```

**Note**: Slack credentials can be set directly in `cdk.config.{env}.json` file. Environment variables are also supported, but configuration files are easier to manage.

**⚠️ Important**: Configure whitelist after deployment. See [Quick Start Guide](docs/developer/quickstart.md).

### Environment Separation

This project supports environment separation for development (`dev`) and production (`prod`) deployments:

- **Stack Names**: Automatically suffixed with `-Dev` or `-Prod` (e.g., `SlackAI-FileCreator-Dev`, `SlackAI-WebFetch-Dev`, `SlackAI-Verification-Prod`)
- **Resource Isolation**: All resources (Lambda functions, DynamoDB tables, Secrets Manager, AgentCore runtimes, etc.) are automatically separated by environment
- **Resource Tagging**: All resources are tagged with:
  - `Environment`: `dev` or `prod`
  - `Project`: `SlackAI`
  - `ManagedBy`: `CDK`
  - `StackName`: The stack name

**Usage:**

```bash
# Deploy to development environment
DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy

# Deploy to production environment
DEPLOYMENT_ENV=prod ./scripts/deploy.sh deploy
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
│ │ - Signature verification, reaction (👀 on receive, ✅ on reply) │ │
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
- **Attachment processing** (024): Images (PNG, JPEG, GIF, WebP) and documents (PDF, DOCX, XLSX, CSV, TXT, PPTX). Files flow via S3 pre-signed URLs; max 5 files per message, 10 MB for images, 5 MB for documents. Native Bedrock document blocks for high-quality Q&A.
- **Iterative multi-agent reasoning** (036): The verification agent runs a Strands agentic loop that can dispatch a single request to multiple specialist agents in parallel, synthesize all results, and iterate across up to 5 reasoning turns until the task is complete. Partial results are returned with an explanatory note when the turn limit fires.
- **Slack channel search** (038): The verification agent can search Slack channel history, retrieve thread content by URL, and fetch the latest messages from a channel via a dedicated Slack Search Agent (A2A). Access is restricted to the calling channel and public channels — private channels are never accessible.

### Infrastructure

- **AWS CDK**: Infrastructure as code in TypeScript
- **AgentCore Runtime**: A2A protocol ARM64 Docker containers with FastAPI
- **ECR**: Docker image management for AgentCore agents
- **DynamoDB**: Stores tokens, caches verification results, prevents duplicates
- **AWS Secrets Manager**: Securely stores Slack credentials and API keys
- **Independent deployment**: Verification and execution zones as separate stacks

## Architecture

The application uses **six independent CDK apps** (one per agent zone), each deployable separately:

- **Verification Zone** (`verification-zones/verification-agent/cdk`): SlackEventHandler Lambda + Verification Agent (AgentCore) + DynamoDB + Secrets Manager
- **Slack Search Agent Zone** (`verification-zones/slack-search-agent/cdk`): Slack channel search agent (AgentCore Runtime + ECR) — deployed within verification zone, called via A2A
- **File-Creator Agent Zone** (`execution-zones/file-creator-agent/cdk`): File-creator agent (AgentCore Runtime + ECR)
- **Time Agent Zone** (`execution-zones/time-agent/cdk`): Current-time agent (AgentCore Runtime + ECR)
- **Docs Agent Zone** (`execution-zones/docs-agent/cdk`): Document-search agent (AgentCore Runtime + ECR)
- **Web Fetch Agent Zone** (`execution-zones/fetch-url-agent/cdk`): URL-fetch agent (AgentCore Runtime + ECR)

This structure supports:

- ✅ AgentCore A2A protocol for inter-zone communication
- ✅ Cross-account deployments (SigV4 + resource-based policies)
- ✅ Agent Card (A2A compliant) for Agent Discovery
- ✅ Independent lifecycle management

For technical details, see [Architecture Overview](docs/developer/architecture.md).

## Documentation

| Audience            | Path                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Getting Started** | [Quick Start](docs/developer/quickstart.md)                                                                                         |
| **Developers**      | [Architecture](docs/developer/architecture.md)                                                                                      |
| **Security Team**   | [Security](docs/developer/security.md)                                                                                             |
| **Operations**      | [Runbook](docs/developer/runbook.md)                                                                                               |
| **Decision Makers** | [Proposal](docs/decision-maker/proposal.md)                                                                                        |

**Full Documentation**: [docs/README.md](docs/README.md)

## Project Structure

```
slack-ai-app/
├── execution-zones/              # Execution agent CDK apps (one per agent)
│   ├── file-creator-agent/       # File-creator / general AI agent
│   │   ├── cdk/                  # Standalone CDK app (TypeScript)
│   │   │   ├── bin/cdk.ts        # Entry point
│   │   │   ├── lib/              # Stack, constructs, types
│   │   │   └── test/             # CDK synthesis tests (Jest)
│   │   ├── src/                  # Python agent source (main.py, agent_card.py, …)
│   │   ├── tests/                # Python unit tests
│   │   └── scripts/deploy.sh     # Zone-specific deploy script
│   ├── time-agent/               # Same structure — current-time agent
│   ├── docs-agent/               # Same structure — docs-search agent
│   └── fetch-url-agent/          # Same structure — URL-fetch agent
├── verification-zones/           # Verification agent CDK apps
│   ├── verification-agent/
│   │   ├── cdk/                  # Standalone CDK app (TypeScript)
│   │   │   ├── bin/cdk.ts
│   │   │   ├── lib/
│   │   │   │   ├── verification-stack.ts
│   │   │   │   ├── constructs/   # AgentCore Runtime, ECR, Lambda, …
│   │   │   │   └── lambda/       # SlackEventHandler Lambda
│   │   │   └── test/
│   │   ├── src/                  # Python agent source
│   │   ├── tests/                # Python unit tests
│   │   └── scripts/deploy.sh
│   └── slack-search-agent/       # Slack channel search agent (A2A)
│       ├── cdk/                  # Standalone CDK app (TypeScript)
│       ├── src/                  # Python agent source (FastAPI + Strands)
│       │   └── tools/            # search_messages, get_thread, get_channel_history
│       ├── tests/                # Python unit tests
│       └── scripts/deploy.sh
├── platform/
│   ├── tooling/                  # @slack-ai-app/cdk-tooling (shared npm package)
│   │   └── src/utils/            # cdk-logger, cdk-error, cost-allocation-tags, …
│   ├── schemas/                  # Shared JSON schemas (placeholder)
│   └── policies/                 # Shared IAM policies (placeholder)
├── scripts/
│   ├── deploy.sh                 # Unified deploy CLI (deploy/status/logs/policy/check-access)
│   └── validate/
├── docs/                         # Documentation
│   ├── developer/                # Architecture, Quickstart, Runbook, Testing, …
│   ├── decision-maker/           # Proposal, cost, governance
│   └── user/                     # User guide, usage policy, FAQ
└── specs/                        # Feature specifications
```

## Development

### Run Tests

```bash
# CDK synthesis tests (Jest) — per zone
cd execution-zones/file-creator-agent/cdk && npm test
cd execution-zones/time-agent/cdk && npm test
cd execution-zones/docs-agent/cdk && npm test
cd execution-zones/fetch-url-agent/cdk && npm test
cd verification-zones/verification-agent/cdk && npm test
cd verification-zones/slack-search-agent/cdk && npm test

# Python agent tests (pytest) — per zone
cd execution-zones/file-creator-agent && python -m pytest tests/ -v
cd execution-zones/time-agent && python -m pytest tests/ -v
cd execution-zones/docs-agent && python -m pytest tests/ -v
cd execution-zones/fetch-url-agent && python -m pytest tests/ -v
cd verification-zones/verification-agent && python -m pytest tests/ -v
cd verification-zones/slack-search-agent && python -m pytest tests/ -v
```

### View Logs

```bash
aws logs tail /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler --follow
aws logs tail /aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent_Dev-<runtime-id>-DEFAULT --follow
```

## Environment Variables

| Variable                        | Description                                                     | Default                                          |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `SLACK_SIGNING_SECRET`          | Slack app signing secret (first deploy only)                    | -                                                |
| `SLACK_BOT_TOKEN`               | Slack bot OAuth token (first deploy only)                       | -                                                |
| `BEDROCK_MODEL_ID`              | Bedrock model (configured in cdk.json)                          | -                                                |
| `VERIFICATION_AGENT_ARN`        | Verification Agent AgentCore Runtime ARN (set by CDK) | - |
| `EXECUTION_AGENT_ARNS`          | Execution agent ARN map (file-creator/docs/time/fetch-url)       | - |

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

For details, see [Security Guide](docs/developer/security.md).

## Troubleshooting

See [Troubleshooting Guide](docs/developer/troubleshooting.md).

**Common Issues**:

| Issue                        | Solution                                       |
| ---------------------------- | ---------------------------------------------- |
| Signature verification fails | Check Lambda Function URL and Secrets Manager  |
| Existence Check fails        | Verify Bot Token OAuth scopes                  |
| Bot doesn't respond          | Check Event Subscriptions and bot installation |
| File not showing in thread (014) | Add **`files:write`** to Bot Token Scopes in Slack App OAuth & Permissions. Reinstall app to workspace. |
| File attachment errors (024) | Add **`files:read`** to Bot Token Scopes for attachment downloads. Supported: images (PNG, JPEG, GIF, WebP), documents (PDF, DOCX, XLSX, CSV, TXT, PPTX). Max 5 files, 10 MB/image, 5 MB/doc. |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Read [CLAUDE.md](CLAUDE.md) for development policies
2. Create feature branch
3. **Update documentation with code changes** — keep README, CHANGELOG, and relevant docs in sync; follow [Documentation Standards](docs/DOCUMENTATION_STANDARDS.md)
4. Submit pull request

## License

[Add license information here]

## Support

1. Check [Documentation](docs/README.md)
2. Review [Troubleshooting Guide](docs/developer/troubleshooting.md)
3. Create GitHub issue with logs and reproduction steps

---

**Last Updated**: 2026-03-18

## Recent Updates

- **2026-03-15**: Slack Search Agent (038)
  - New `verification-zones/slack-search-agent/` zone: Bedrock AgentCore Runtime for searching Slack channel history, retrieving threads by URL, and fetching channel history
  - Three Strands tools: `search_messages` (keyword filter, up to 100 messages), `get_thread` (Slack URL parsing), `get_channel_history` (latest N messages, max 20)
  - Channel access control: calling channel and public channels allowed; private channels (other than calling channel) denied
  - `SlackSearchClient` and `make_slack_search_tool` factory added to verification-agent; `SLACK_SEARCH_AGENT_ARN` env var activates the `slack_search` tool in the orchestrator
  - `slackSearchAgentArn` optional prop added to verification-agent CDK config
  - Fixed 5 pre-existing CDK test failures (stale compiled JS, `tsconfig.json` typeRoots, WAF `WebACLAssociation` intrinsic assertion)
  - Test counts: slack-search-agent 46, verification-agent 219, verification-agent CDK 35

- **2026-02-22**: Iterative multi-agent reasoning (036)
  - Replaced single-pass routing with a Strands agentic loop in the verification agent (`orchestrator.py`, `hooks.py`, `agent_tools.py`)
  - A single request can now dispatch to multiple specialist agents in parallel and iterate across up to 5 reasoning turns
  - Partial results returned with explanatory note when turn limit fires (`MaxTurnsHook`)
  - Structured per-turn observability via `ToolLoggingHook` (agents called, duration, status per tool call)
  - Bug fixes: thread context appeared twice in LLM prompt; attachment filename label always showed "file"; hook status detection failed on string tool results
  - Renamed `execution-zones/execution-agent/` → `execution-zones/file-creator-agent/` to match agent identity
  - Test count: 209 passed, 13 skipped

- **2026-02-19**: Zone-based CDK restructuring
  - Migrated from single `cdk/` monolith to five independent CDK apps: `execution-zones/{execution-agent,time-agent,docs-agent,fetch-url-agent}/cdk` and `verification-zones/verification-agent/cdk`
  - Added `platform/tooling` shared npm package (`@slack-ai-app/cdk-tooling`) for common CDK utilities (logger, error, cost-allocation-tags, log-retention-aspect, config-loader)
  - Added unified deploy scripts (later consolidated into `scripts/deploy.sh`)
  - Each zone has independent `src/`, `tests/`, `scripts/deploy.sh` and zone-specific `cdk.config.dev.json`
- **2026-02-11**: Reaction swap on reply (eyes→checkmark)
  - When posting AI response to Slack, the system removes 👀 and adds ✅ on the original message for clear completion feedback
  - Slack Poster Lambda performs reaction swap after successful post; `message_ts` added to SQS payload for reaction target
- **2026-02-11**: Slack file attachment support (024)
  - S3-based secure file transfer: Verification Agent downloads from Slack, uploads to S3, generates pre-signed URLs; Execution Agent downloads via pre-signed URL (no bot token in execution zone)
  - Document Q&A: PDF, DOCX, XLSX, CSV, TXT via native Bedrock document blocks; PPTX via text extraction fallback
  - Image analysis: PNG, JPEG, GIF, WebP via Bedrock image blocks
  - Multiple files: up to 5 files per message; limits 10 MB/image, 5 MB/document
  - User-friendly error messages (FR-013), structured logging with correlation IDs (FR-014)
  - Test counts: Verification 93, Execution 110
- **2026-02-10**: Normal flow validation test suite (022)
  - Added 20 TDD tests across 4 new test classes in `tests/test_main.py` for the normal pipeline flow (delegation to Execution Agent)
  - `Test022NormalFlowDelegation` (5 tests) — verifies echo off triggers execution delegation without echo prefix
  - `Test022SecurityCheckPipeline` (5 tests) — verifies security check ordering: existence check → authorization → rate limit
  - `Test022ExecutionErrorPaths` (6 tests) — verifies error handling with no internal detail leakage and `is_processing` reset
  - `Test022StructuredLogging` (4 tests) — verifies all logs are valid JSON with correlation IDs and no token leakage
  - pipeline.py enhancements: JSONDecodeError handling, Base64 decode logging
  - Test counts: Verification 83 (was 63), pipeline.py coverage 94%
- **2026-02-09**: Strands migration cleanup (021)
  - Migrated both agents from `bedrock-agentcore` SDK to FastAPI + uvicorn with direct route definitions
  - CloudWatch IAM namespace fix (`StringLike` with `SlackAI-*` pattern)
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
- **2025-12-28**: Added dual authentication support (IAM and API key) for Execution API Gateway *(legacy; replaced by AgentCore A2A in 2026-02-19)*
