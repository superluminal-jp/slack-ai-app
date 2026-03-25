# Quickstart: S3 Agent Registry

**Date**: 2026-03-24
**Feature**: 054-ssm-agent-registry

## Prerequisites

- AWS CLI configured with S3 read/write permissions
- `DEPLOYMENT_ENV` set to `dev` or `prod`
- S3 bucket created (via CDK deploy of verification-agent stack)

## Register an Agent Manually

```bash
# Create agent card JSON file
cat > /tmp/time.json << 'EOF'
{
  "arn": "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/SlackAI_TimeAgent_Dev-abc",
  "description": "現在日時取得専用エージェント",
  "skills": [{"id": "current-time", "name": "Current Time", "description": "Get current date/time"}]
}
EOF

# Upload to S3
aws s3 cp /tmp/time.json s3://${BUCKET}/dev/agent-registry/time.json
```

## Read All Registered Agents

```bash
# List all agent files
aws s3 ls s3://${BUCKET}/dev/agent-registry/

# Read a specific agent's card
aws s3 cp s3://${BUCKET}/dev/agent-registry/time.json -
```

## Remove an Agent

```bash
aws s3 rm s3://${BUCKET}/dev/agent-registry/time.json
```

## Deploy Flow

1. Deploy execution agent: `./execution-zones/time-agent/scripts/deploy.sh`
   - CDK deploys the agent stack
   - Script writes agent card to `{env}/agent-registry/time.json` via direct `PutObject`
2. Deploy verification agent: `./verification-zones/verification-agent/scripts/deploy.sh`
   - Reads `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX` env vars
   - At startup, calls `ListObjectsV2` + `GetObject` per file to load all registered agents
3. Full deploy: `DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy`
   - Deploys all execution agents (each writes its own JSON file to S3)
   - Deploys verification agent (reads all agent files from S3 prefix)
