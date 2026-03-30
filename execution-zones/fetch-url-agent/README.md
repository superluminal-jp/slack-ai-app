# Web Fetch Agent — Execution Zone

Standalone CDK application for the Web Fetch (URL retrieval) execution zone. Deploys an AWS Bedrock AgentCore Runtime that runs the agent via the A2A protocol.

**Not part of the default unified deploy**: The repository root `scripts/deploy.sh deploy` does not invoke this zone. Use `./scripts/deploy.sh` in this directory only after a deliberate security review: fetching arbitrary URLs on behalf of users increases data-exfiltration and SSRF-style risk surface.

## Structure

```
execution-zones/fetch-url-agent/
├── cdk/              # CDK application (TypeScript)
├── src/              # Python agent source
├── scripts/
│   └── deploy.sh     # Zone deploy; registers `fetch-url` in DynamoDB agent registry
└── tests/
```

## Deploy (optional)

```bash
export DEPLOYMENT_ENV=dev
./scripts/deploy.sh
```

Force image rebuild: `./scripts/deploy.sh --force-rebuild`

## Tests

```bash
cd cdk && npm test
cd .. && python -m pytest tests/ -v
```
