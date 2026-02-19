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

## Testing

```bash
# CDK unit tests
cd verification-zones/verification-agent/cdk
npm test

# Python agent tests
cd verification-zones/verification-agent
python -m pytest tests/ -v
```
