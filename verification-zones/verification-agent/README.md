# Verification Agent — Standalone CDK App

This directory contains the **Verification Zone**: an independently deployable CDK application for the Slack AI App's verification agent.

## Structure

```
verification-zones/verification-agent/
├── src/                          # Python AgentCore agent source (ARM64)
│   ├── main.py
│   ├── requirements.txt
│   ├── a2a_client.py
│   ├── agent_card.py
│   ├── slack_search_client.py    # A2A client for Slack Search Agent
│   ├── slack_search_tool.py      # Strands @tool factory for slack_search
│   └── …
├── tests/                        # Python unit tests
├── cdk/                          # Standalone CDK app (TypeScript)
│   ├── bin/cdk.ts                # Entry point — VerificationStack only
│   ├── lib/
│   │   ├── verification-stack.ts
│   │   ├── constructs/
│   │   ├── lambda/               # SlackEventHandler Lambda
│   │   ├── utils/
│   │   ├── aspects/
│   │   └── types/
│   ├── test/
│   ├── cdk.json
│   ├── cdk.config.json.example
│   ├── package.json
│   └── tsconfig.json
└── scripts/
    └── deploy.sh                 # Zone-specific deploy script
```

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate credentials
- Execution Zone deployed first (to obtain agent runtime ARNs)

## Setup

```bash
cd verification-zones/verification-agent/cdk

# Install dependencies
npm install

# Copy and fill in configuration
cp cdk.config.json.example cdk.config.dev.json
# Edit cdk.config.dev.json with your values:
# - verificationAccountId, executionAccountId
# - slackBotToken, slackSigningSecret
# - executionAgentArns (from execution zone stack outputs)
```

## Deploy

```bash
cd verification-zones/verification-agent/cdk

# Build
npm run build

# Synthesize (requires Slack credentials)
npx cdk synth

# Deploy
npx cdk deploy SlackAI-Verification-Dev
```

## CDK security scanning

This CDK app runs `cdk-nag` (AWS Solutions checks) during:

- **Synthesis** (`npx cdk synth`): `bin/cdk.ts` applies the nag pack to the app.
- **Tests** (`npm test`): Jest includes a `"cdk-nag security scan"` assertion that requires zero unresolved violations.

See `verification-zones/verification-agent/cdk/README.md` for suppression rules and IAM scope notes.

## Clean code identifiers

The repository constitution prohibits embedding spec numbers, branch names, and task IDs in source code, comments, docstrings, and test names. See `.specify/memory/constitution.md` (Principle VII).

## Execution Agent ARNs

After deploying the execution zone, set the ARNs in `cdk.config.dev.json`:

```json
{
  "executionAgentArns": {
    "file-creator": "arn:aws:bedrock-agentcore:...",
    "docs": "arn:aws:bedrock-agentcore:...",
    "time": "arn:aws:bedrock-agentcore:..."
  },
  "slackSearchAgentArn": "arn:aws:bedrock-agentcore:..."
}
```

Or set via environment variables before deploying:

```bash
export FILE_CREATOR_AGENT_ARN="arn:aws:bedrock-agentcore:..."
export DOCS_AGENT_ARN="arn:aws:bedrock-agentcore:..."
export TIME_AGENT_ARN="arn:aws:bedrock-agentcore:..."
npx cdk deploy
```

## Channel Response Modes

A single deployed stack supports two response patterns simultaneously:

| Mode | Trigger | Configuration |
|------|---------|---------------|
| **@mention** | User writes `@BotName message` in any channel | Default — no configuration needed.<br>Restrict to specific channels with `mentionChannelIds`. |
| **Auto-reply** | Bot responds to **every post** in specified channels | Set `autoReplyChannelIds` at deploy time. |

Both modes can be active in the same stack at the same time.

### Configuring @Mention Channels (`mentionChannelIds`)

By default, the bot responds to `@BotName` in **every** channel. Set `mentionChannelIds` to restrict @mention responses to a specific set of channels. Events from other channels are silently ignored (200 OK returned to Slack).

Three methods are supported, applied in this priority order:

**1. Environment variable (highest priority)**

```bash
MENTION_CHANNEL_IDS=C01234567,C89ABCDEF npx cdk deploy
```

**2. CDK `--context` flag**

```bash
npx cdk deploy --context mentionChannelIds=C01234567,C89ABCDEF
# or JSON array:
npx cdk deploy --context 'mentionChannelIds=["C01234567","C89ABCDEF"]'
```

**3. Config file (`cdk.config.{env}.json`)**

Accepts plain IDs or objects with an optional `label` for easier management (label never affects authorization):

```json
{
  "mentionChannelIds": [
    "C01234567",
    { "id": "C89ABCDEF", "label": "#ai-bot" }
  ]
}
```

To restore unrestricted @mention mode, set `mentionChannelIds` to an empty array (or omit the field):

```bash
MENTION_CHANNEL_IDS="" npx cdk deploy
```

### Configuring Auto-Reply Channels (`autoReplyChannelIds`)

Three methods are supported, applied in this priority order:

**1. Environment variable (highest priority)**

```bash
AUTO_REPLY_CHANNEL_IDS=C01234567,C89ABCDEF npx cdk deploy
```

**2. CDK `--context` flag**

```bash
# Comma-separated
npx cdk deploy --context autoReplyChannelIds=C01234567,C89ABCDEF

# JSON array
npx cdk deploy --context 'autoReplyChannelIds=["C01234567","C89ABCDEF"]'
```

**3. Config file (`cdk.config.{env}.json`)**

Accepts plain IDs or objects with an optional `label` for easier management (label never affects authorization):

```json
{
  "autoReplyChannelIds": [
    "C01234567",
    { "id": "C89ABCDEF", "label": "#general" }
  ]
}
```

To find a channel ID: open Slack → right-click the channel name → **Copy link**. The ID is the last segment of the URL (starts with `C` for public channels, `G` for private groups).

### Removing Auto-Reply

Set `autoReplyChannelIds` to an empty array (or omit the field) to revert all channels to @mention-only mode:

```bash
AUTO_REPLY_CHANNEL_IDS="" npx cdk deploy
```

## Multiple Deployments in the Same AWS Account

**One stack handles both modes — a second stack is not required.** Configure `autoReplyChannelIds` on a single stack to mix @mention and auto-reply channels.

When a second stack is genuinely needed (e.g., isolated Dev/Prod environments):

| Requirement | Why |
|------------|-----|
| Unique `verificationStackName` per stack | Avoids DynamoDB table and Secrets Manager name collisions |
| Unique `verificationAgentName` per stack | AgentCore Runtime names must be unique per AWS account |
| Separate Slack App per stack | Slack allows only **one** event subscription URL per app — two stacks in the same workspace require two apps with different bot tokens |

Example config for a second stack in the same account:

```json
// cdk.config.prod.json
{
  "verificationStackName": "SlackAI-Verification",
  "verificationAgentName": "SlackAI_VerificationAgent_Prod",
  "slackBotToken": "xoxb-PROD-TOKEN",
  "slackSigningSecret": "PROD-SIGNING-SECRET",
  "autoReplyChannelIds": ["CPROD00001"]
}
```

```bash
DEPLOYMENT_ENV=prod npx cdk deploy SlackAI-Verification-Prod
```

## Whitelist Authorization

The Lambda authorizer restricts access by `team_id`, `user_id`, and `channel_id`. Only configured entities are checked — empty sets bypass that dimension.

Configuration is loaded with the following priority (first that succeeds wins):

1. **DynamoDB** — `WHITELIST_TABLE_NAME` table, `entity_type` PK / `entity_id` SK
2. **Secrets Manager** — `WHITELIST_SECRET_NAME` JSON secret
3. **Environment variables** — `WHITELIST_TEAM_IDS`, `WHITELIST_USER_IDS`, `WHITELIST_CHANNEL_IDS`

### Optional labels

Each whitelist entry can carry an optional human-readable label. Labels appear in authorization log events (`team_label`, `user_label`, `channel_label`) but **never affect access control**.

| Source | team_id / user_id label format | channel_id label format |
|--------|-------------------------------|------------------------|
| DynamoDB | `"label"` sparse attribute on `team_id` / `user_id` items | `"label"` sparse attribute on `channel_id` items |
| Secrets Manager | `{"id": "T001", "label": "My Workspace"}` in `team_ids` array | `{"id": "C001", "label": "#general"}` in `channel_ids` array |
| Env vars | `T001:My Workspace,T002` in `WHITELIST_TEAM_IDS` | `C001:general,C002` in `WHITELIST_CHANNEL_IDS` |

Plain string entries and labeled entries can be mixed freely in the same list.

```bash
# Env var examples
WHITELIST_TEAM_IDS="T0123456789:My Workspace,T9876543210"
WHITELIST_USER_IDS="U0123456789:@alice,U1111111111:@bob"
WHITELIST_CHANNEL_IDS="C001,C002:#general"
```

```json
// Secrets Manager example
{
  "team_ids": [{"id": "T0123456789", "label": "My Workspace"}, "T9876543210"],
  "user_ids": [{"id": "U0123456789", "label": "@alice"}],
  "channel_ids": ["C001", {"id": "C002", "label": "#general"}]
}
```

## Architecture: Orchestration Loop (036)

The verification agent uses a **Strands agentic loop** to dispatch requests to multiple execution agents and synthesize their results into a single Slack reply.

```
User Slack message
       │
       ▼
pipeline.py (run_orchestration_loop)
       │
       ▼
OrchestrationAgent (src/orchestrator.py)
  ├── Agent(model=Bedrock, tools=[invoke_*, slack_search], hooks=[MaxTurnsHook, ToolLoggingHook])
  └── Iterates until complete or MAX_AGENT_TURNS reached
       │
       ├── invoke_docs-agent  ──► docs-agent (A2A)
       ├── invoke_time-agent  ──► time-agent (A2A)
       ├── slack_search       ──► slack-search-agent (A2A, if SLACK_SEARCH_AGENT_ARN set)
       └── invoke_*           ──► any registered agent (A2A)
       │
       ▼
synthesized reply → Slack
```

**Key components:**
- `src/orchestrator.py` — `OrchestrationAgent`, `run_orchestration_loop`, dataclasses (`OrchestrationRequest` includes `channel` + `bot_token` for Slack Search)
- `src/agent_tools.py` — `build_agent_tools()` generates one Strands `@tool` per registered agent
- `src/slack_search_tool.py` — `make_slack_search_tool(channel, bot_token, correlation_id)` factory; activated when `SLACK_SEARCH_AGENT_ARN` is set
- `src/hooks.py` — `MaxTurnsHook` (turn limiter), `ToolLoggingHook` (structured logging)
- `MAX_AGENT_TURNS` env var — maximum reasoning turns (default: 5, range: 1–10)

**Behavior:**
- Multi-domain requests invoke multiple agents in parallel within one turn
- Partial failures return successful results plus a note
- Turn limit reached → `completion_status="partial"`, partial-result note appended
- All agents fail → `completion_status="error"`, user-friendly message

## Slack Search Agent Integration (038)

The verification agent can optionally delegate Slack search tasks to a dedicated **Slack Search Agent**. When `SLACK_SEARCH_AGENT_ARN` is configured, the orchestrator gains a `slack_search` tool that can:

- Search channel history by keyword
- Retrieve thread content from a Slack URL
- Fetch the latest messages from a channel

Access is restricted to the calling channel and public channels. Private channels (other than the one that sent the request) are never accessible.

### Prerequisites

1. Deploy the Slack Search Agent: `DEPLOYMENT_ENV=dev ./verification-zones/slack-search-agent/scripts/deploy.sh`
2. Copy the `SlackSearchAgentRuntimeArn` output
3. Set it in `cdk.config.dev.json`:

```json
{
  "slackSearchAgentArn": "arn:aws:bedrock-agentcore:ap-northeast-1:ACCOUNT:runtime/SlackAI_SlackSearch_Dev-SUFFIX"
}
```

4. Re-deploy the verification agent: `DEPLOYMENT_ENV=dev ./scripts/deploy.sh`

If `slackSearchAgentArn` is omitted, the `slack_search` tool is not added to the orchestrator and the feature is silently disabled.

## Usage History (039)

Every request processed by the verification agent is automatically recorded for audit and debugging purposes.

### What is recorded

| Data | Storage | Retention |
|------|---------|-----------|
| Request metadata (channel, user, timestamps, pipeline results, duration) | DynamoDB `{stack}-usage-history` | 90 days (TTL) |
| Input text (user message) | S3 `{stack}-usage-history` `content/` prefix | 90 days (lifecycle rule) |
| Output text (agent response) | S3 `{stack}-usage-history` `content/` prefix | 90 days (lifecycle rule) |
| Slack file attachments | S3 `{stack}-usage-history` `attachments/` prefix | 90 days (lifecycle rule) |
| Full DynamoDB table snapshots | S3 `{stack}-usage-history` `dynamodb-exports/` prefix | 90 days (lifecycle rule) |

Input/output text is stored in S3 only (not in DynamoDB) for confidentiality — the DynamoDB record holds a pointer (`s3_content_prefix`) and metadata only.

### Storage names

| Resource | Name pattern |
|----------|-------------|
| DynamoDB table | `{stackName}-usage-history` |
| S3 bucket | `{stackName.toLowerCase()}-usage-history` |
| S3 archive bucket | `{stackName.toLowerCase()}-usage-history-archive` |

### Archive Replication (041)

All objects written to the usage-history S3 bucket (`content/`, `attachments/`, `dynamodb-exports/` prefixes) are automatically replicated to an independent archive bucket (`{stack}-usage-history-archive`) via S3 Same-Region Replication.

- **Scope**: All prefixes — conversations, attachments, and DynamoDB exports.
- **Delete isolation**: Deletes in the primary bucket do NOT propagate to the archive (`deleteMarkerReplication: Disabled`).
- **Retention**: Archive objects expire after 90 days per prefix (same as primary); noncurrent versions expire after 7 days.
- **Cross-account ready**: Set `archiveAccountId` in `cdk.config.{env}.json` (or `ARCHIVE_ACCOUNT_ID` env var) to switch to cross-account replication with zero code changes. Omit for same-account (default).

### S3 key structure

```
content/{channel_id}/{YYYY/MM/DD}/{correlation_id}/input.json
content/{channel_id}/{YYYY/MM/DD}/{correlation_id}/output.json
attachments/{channel_id}/{YYYY/MM/DD}/{correlation_id}/{filename}
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `USAGE_HISTORY_TABLE_NAME` | DynamoDB table for metadata (injected by CDK) |
| `USAGE_HISTORY_BUCKET_NAME` | S3 bucket for content and attachments (injected by CDK) |

### Fail-open behavior

Write failures (DynamoDB or S3) are logged as `WARNING` and silently swallowed. Users always receive their response regardless of storage availability.

### Querying history

- **By channel**: DynamoDB `Query` on PK=`channel_id`, SK prefix `{timestamp}` for date range
- **By correlation_id**: DynamoDB `Query` on GSI `correlation_id-index`

### DynamoDB PITR and Daily Export (040)

Point-in-Time Recovery (PITR) is enabled on the `{stack}-usage-history` DynamoDB table. A daily full export runs at **JST 00:00 (UTC 15:00)** via EventBridge Scheduler, writing a native DynamoDB JSON export to the usage-history S3 bucket under the `dynamodb-exports/{YYYY/MM/DD}/` prefix.

Export objects are automatically deleted after **90 days** via an S3 lifecycle rule on the `dynamodb-exports/` prefix.

A CloudWatch Alarm (`{stack}-dynamodb-export-job-failure`) fires if the export Lambda logs any errors, enabling early detection of failed exports.

The export Lambda is fail-open: any exception is logged as `WARNING` and the Lambda returns `{"status": "error"}` — it never affects user Slack responses.

## Testing

```bash
# CDK unit tests
cd verification-zones/verification-agent/cdk
npm test

# Python agent tests
cd verification-zones/verification-agent
python -m pytest tests/ -v
```
