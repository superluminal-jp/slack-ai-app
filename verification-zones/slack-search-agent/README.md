# Slack Search Agent

A Bedrock AgentCore Runtime that enables the Verification Agent to search Slack channels, retrieve thread content, and fetch channel history via A2A (agent-to-agent) calls.

## Purpose

The Verification Agent calls this agent when a user requests Slack search, provides a Slack URL, or asks for channel history. Access is restricted to the calling channel and public channels — private channels (other than the originating channel) are never accessible.

## Structure

```
verification-zones/slack-search-agent/
├── src/
│   ├── main.py                    # FastAPI app — JSON-RPC 2.0 handler
│   ├── agent_factory.py           # Strands Agent factory
│   ├── system_prompt.py           # Agent system prompt
│   ├── agent_card.py              # A2A agent card
│   ├── channel_access.py          # Channel access control (calling + public)
│   ├── slack_client.py            # Slack SDK wrapper
│   ├── tools/
│   │   ├── search_messages.py     # @tool: keyword search in channel history
│   │   ├── get_thread.py          # @tool: retrieve thread from Slack URL
│   │   └── get_channel_history.py # @tool: fetch latest N messages
│   ├── requirements.txt
│   └── Dockerfile
├── tests/                         # Python unit tests (pytest)
├── cdk/                           # Standalone CDK app (TypeScript)
│   ├── bin/cdk.ts
│   ├── lib/
│   │   ├── slack-search-agent-stack.ts
│   │   ├── constructs/
│   │   └── types/
│   ├── cdk.config.json.example
│   ├── cdk.config.dev.json   # gitignored — copy from .example
│   └── package.json
└── scripts/
    └── deploy.sh
```

## Tools

| Tool | Description |
|------|-------------|
| `search_messages` | Fetches up to 100 messages from a channel and filters by keyword |
| `get_thread` | Parses a Slack URL and retrieves all replies in the thread |
| `get_channel_history` | Returns the latest N messages (max 20) from a channel |

## Channel Access Control

- **Calling channel**: always accessible (the channel that sent the request)
- **Public channels**: accessible via `conversations.info` check
- **Private channels** (other than calling channel): denied

## Prerequisites

- Slack Search Agent stack deployed first (to obtain runtime ARN)
- Verification Agent CDK re-deployed with `SLACK_SEARCH_AGENT_ARN` / `slackSearchAgentArn`

## Setup

```bash
cd verification-zones/slack-search-agent/cdk
npm install
```

Create `cdk.config.dev.json` from the template (`cp cdk.config.json.example cdk.config.dev.json` from the `cdk/` directory), set account IDs, then deploy:

```bash
DEPLOYMENT_ENV=dev ./verification-zones/slack-search-agent/scripts/deploy.sh
```

After deployment, copy the runtime ARN from the stack output (`SlackSearchAgentRuntimeArn`) and set it in the Verification Agent's config:

```json
// verification-zones/verification-agent/cdk/cdk.config.dev.json
{
  "slackSearchAgentArn": "arn:aws:bedrock-agentcore:ap-northeast-1:ACCOUNT:runtime/SlackAI_SlackSearch_Dev-SUFFIX"
}
```

Then re-deploy the Verification Agent:

```bash
DEPLOYMENT_ENV=dev ./verification-zones/verification-agent/scripts/deploy.sh
```

## Testing

```bash
# Unit tests (from verification-zones/slack-search-agent/)
python -m pytest tests/ -v

# CDK tests
cd cdk && npm test
```

## Environment Variables (Runtime)

| Variable | Description |
|----------|-------------|
| `AWS_REGION_NAME` | AWS region (default: `ap-northeast-1`) |
| `BEDROCK_MODEL_ID` | Bedrock model ID for the Strands agent |

## Dependencies

- `strands-agents[a2a,otel]~=1.25.0`
- `fastapi~=0.115.0`
- `uvicorn~=0.34.0`
- `boto3~=1.42.0`
- `slack-sdk~=3.27.0`
