# Execution Agent Zone

Standalone CDK application for the Execution Agent — an Amazon Bedrock AgentCore Runtime that handles file generation, document creation, and AI-powered task execution via A2A protocol.

## Structure

```
execution-zones/execution-agent/
├── cdk/                    # CDK infrastructure (standalone app)
│   ├── bin/cdk.ts          # Entry point
│   ├── lib/
│   │   ├── execution-agent-stack.ts
│   │   ├── constructs/
│   │   └── types/
│   ├── test/               # CDK synthesis tests
│   ├── cdk.config.dev.json # Dev environment config
│   └── package.json
├── src/                    # Python agent source
├── tests/                  # Python tests
├── scripts/
│   └── deploy.sh           # Zone-specific deploy script
└── README.md
```

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 18+ and npm
- Python 3.11+
- Docker (for building container images)

## Setup

```bash
# Install CDK dependencies (from workspace root)
npm install

# Or from this zone's CDK directory
cd cdk && npm install
```

## Configuration

Create `cdk/cdk.config.dev.json` (already provided as example):

```json
{
  "awsRegion": "ap-northeast-1",
  "bedrockModelId": "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "deploymentEnv": "dev",
  "executionStackName": "SlackAI-Execution",
  "verificationAccountId": "<YOUR_ACCOUNT_ID>",
  "executionAccountId": "<YOUR_ACCOUNT_ID>"
}
```

## Deploy

```bash
export DEPLOYMENT_ENV=dev
./scripts/deploy.sh
./scripts/deploy.sh --force-rebuild  # Force Docker image rebuild
```

## Tests

```bash
# CDK synthesis tests
cd cdk && npm test

# Python unit tests
python -m pytest tests/ -v
```
