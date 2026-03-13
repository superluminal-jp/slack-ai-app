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

## Execution Agent ARNs

After deploying the execution zone, set the ARNs in `cdk.config.dev.json`:

```json
{
  "executionAgentArns": {
    "file-creator": "arn:aws:bedrock-agentcore:...",
    "docs": "arn:aws:bedrock-agentcore:...",
    "time": "arn:aws:bedrock-agentcore:..."
  }
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
| **@mention** | User writes `@BotName message` in any channel | Default — no configuration needed |
| **Auto-reply** | Bot responds to **every post** in specified channels | Set `autoReplyChannelIds` at deploy time |

Both modes can be active in the same stack at the same time. A channel listed in `autoReplyChannelIds` receives auto-replies; all other channels remain in @mention-only mode.

### Configuring Auto-Reply Channels at Deploy Time

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

```json
{
  "autoReplyChannelIds": ["C01234567", "C89ABCDEF"]
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
  ├── Agent(model=Bedrock, tools=[invoke_*], hooks=[MaxTurnsHook, ToolLoggingHook])
  └── Iterates until complete or MAX_AGENT_TURNS reached
       │
       ├── invoke_docs-agent  ──► docs-agent (A2A)
       ├── invoke_time-agent  ──► time-agent (A2A)
       └── invoke_*           ──► any registered agent (A2A)
       │
       ▼
synthesized reply → Slack
```

**Key components:**
- `src/orchestrator.py` — `OrchestrationAgent`, `run_orchestration_loop`, dataclasses
- `src/agent_tools.py` — `build_agent_tools()` generates one Strands `@tool` per registered agent
- `src/hooks.py` — `MaxTurnsHook` (turn limiter), `ToolLoggingHook` (structured logging)
- `MAX_AGENT_TURNS` env var — maximum reasoning turns (default: 5, range: 1–10)

**Behavior:**
- Multi-domain requests invoke multiple agents in parallel within one turn
- Partial failures return successful results plus a note
- Turn limit reached → `completion_status="partial"`, partial-result note appended
- All agents fail → `completion_status="error"`, user-friendly message

## Testing

```bash
# CDK unit tests
cd verification-zones/verification-agent/cdk
npm test

# Python agent tests
cd verification-zones/verification-agent
python -m pytest tests/ -v
```
