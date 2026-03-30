# Docs Agent — Execution Zone

Standalone CDK application for the Docs Agent execution zone. Deploys an AWS Bedrock AgentCore Runtime that runs the Docs Agent container via the A2A protocol.

## Structure

```
execution-zones/docs-agent/
├── cdk/              # CDK application (TypeScript)
│   ├── bin/cdk.ts    # Entry point — single stack
│   ├── lib/
│   │   ├── docs-agent-stack.ts
│   │   ├── constructs/
│   │   │   ├── docs-agent-ecr.ts      # Docker image asset
│   │   │   └── docs-agent-runtime.ts  # AgentCore Runtime
│   │   └── types/
│   │       ├── cdk-config.ts   # Zone-specific Zod schema
│   │       └── stack-config.ts # Stack props
│   └── test/
├── src/              # Python agent source
├── tests/            # Python agent tests
└── scripts/
    └── deploy.sh
```

## Prerequisites

- Node.js ≥ 18, npm ≥ 9
- AWS CDK v2 (`npm install -g aws-cdk`)
- Docker (for building container image)
- AWS credentials configured

## Configuration

Copy and edit the dev config:

```bash
cp cdk/cdk.config.dev.json cdk/cdk.config.dev.local.json
# edit account IDs, region, etc.
```

## Deploy

```bash
export DEPLOYMENT_ENV=dev
export AWS_PROFILE=my-profile  # optional
./scripts/deploy.sh
```

Force image rebuild:

```bash
./scripts/deploy.sh --force-rebuild
```

## Test

```bash
# CDK unit tests
cd cdk && npm test

# Python agent tests
python -m pytest tests/ -v
```

## Project documentation (`docs/`)

The agent searches Markdown under `/app/docs` in the container (from `src/docs/` in the Docker build context). The canonical corpus is the repository root **`docs/`**; keep it in sync with `execution-zones/docs-agent/src/docs/` when you need local or image builds to match (e.g. `rsync -a --delete docs/ execution-zones/docs-agent/src/docs/`). For local runs without rebuilding the image, set **`DOCS_PATH`** to the absolute path of the repo root `docs/` folder so `search_docs` reads the same files you edited.
