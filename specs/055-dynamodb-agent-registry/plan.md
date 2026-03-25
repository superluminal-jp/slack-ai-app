# Implementation Plan: DynamoDB Agent Registry Migration

**Branch**: `055-dynamodb-agent-registry` | **Date**: 2026-03-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/055-dynamodb-agent-registry/spec.md`

## Summary

Migrate the agent registry storage backend from S3 (per-agent JSON files with ListObjectsV2 + GetObject × N) to DynamoDB (single Query for all agents). This aligns with the project's existing 5-table DynamoDB pattern, eliminates the S3 bucket, and simplifies the read path from O(N+1) API calls to O(1).

## Technical Context

**Language/Version**: Python 3.11 (`python:3.11-slim`, ARM64), TypeScript 5.x (CDK), Bash 5.x (deploy scripts)
**Primary Dependencies**: `boto3 ~=1.42.0` (DynamoDB client), `aws-cdk-lib` 2.215.0 (`aws-dynamodb`), `pydantic` (validation), `strands-agents[a2a,otel] ~=1.25.0`
**Storage**: DynamoDB (new `{stack}-agent-registry` table, replacing S3 `{stack}-agent-registry` bucket)
**Testing**: `pytest` (Python), `jest` (CDK TypeScript)
**Target Platform**: AWS (Bedrock AgentCore Runtime — ARM64 container)
**Project Type**: Multi-agent Slack AI system (verification + execution zones)
**Constraints**: Fail-open for registry reads; deploy scripts must be non-fatal on write failures
**Scale/Scope**: 5 agent entries per environment; write at deploy-time only; read at agent startup + refresh

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. SDD | PASS | Spec → Plan → Tasks → Implement workflow followed |
| II. TDD | PASS | Tests rewritten before implementation (24 Python + 7 CDK) |
| III. Security-First | PASS | IAM least-privilege: `grantReadData` scoped to table; no wildcard |
| IV. Fail-Open/Closed | PASS | Registry read = infrastructure → fail-open; no security pipeline change |
| V. Zone Isolation | PASS | No cross-zone imports; deploy scripts write via AWS CLI, not code import |
| VI. Docs & Deploy Parity | PASS | README, CHANGELOG, CLAUDE.md, deploy scripts updated in same PR |
| VII. Clean Code IDs | PASS | No spec numbers in code |

## Project Structure

### Documentation (this feature)

```text
specs/055-dynamodb-agent-registry/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (files to modify/create)

```text
# CDK — Verification Agent
verification-zones/verification-agent/cdk/
├── lib/
│   ├── constructs/
│   │   ├── agent-registry-table.ts        # NEW (replaces agent-registry-bucket.ts)
│   │   ├── agent-registry-bucket.ts       # DELETE
│   │   └── verification-agent-runtime.ts  # MODIFY (env vars + IAM)
│   └── verification-stack.ts              # MODIFY (wire table instead of bucket)
└── test/
    └── verification-stack.test.ts         # MODIFY (DynamoDB assertions)

# Python — Verification Agent
verification-zones/verification-agent/
├── src/
│   └── agent_registry.py                  # MODIFY (S3 → DynamoDB)
└── tests/
    └── test_agent_registry.py             # MODIFY (S3 mocks → DynamoDB mocks)

# Deploy Scripts (5 agents)
execution-zones/time-agent/scripts/deploy.sh          # MODIFY
execution-zones/docs-agent/scripts/deploy.sh           # MODIFY
execution-zones/fetch-url-agent/scripts/deploy.sh      # MODIFY
execution-zones/file-creator-agent/scripts/deploy.sh   # MODIFY
verification-zones/slack-search-agent/scripts/deploy.sh # MODIFY

# Root deploy script
scripts/deploy.sh                                       # MODIFY (output key reference)

# Documentation
CHANGELOG.md                                            # MODIFY
CLAUDE.md                                               # MODIFY
verification-zones/verification-agent/README.md         # MODIFY
```

**Structure Decision**: No new directories. The `agent-registry-table.ts` construct replaces `agent-registry-bucket.ts` in the existing constructs directory.

## Key Implementation Details

### 1. CDK Construct: `AgentRegistryTable`

New construct following the `WhitelistConfig` pattern:
- `tableName: ${stackName}-agent-registry`
- PK: `env` (String), SK: `agent_id` (String)
- `PAY_PER_REQUEST`, `AWS_MANAGED` encryption, `DESTROY` removal policy
- Exposes `public readonly table: dynamodb.Table`

### 2. Verification Stack Wiring

In `verification-stack.ts`:
- Replace `AgentRegistryBucket` instantiation with `AgentRegistryTable`
- Pass `agentRegistryTable` (instead of `agentRegistryBucket`) to `VerificationAgentRuntime`
- Change `CfnOutput` from `AgentRegistryBucketName` to `AgentRegistryTableName`

In `verification-agent-runtime.ts`:
- Replace props: `agentRegistryBucket?/agentRegistryKeyPrefix?` → `agentRegistryTable?/agentRegistryEnv?`
- Set env vars: `AGENT_REGISTRY_TABLE` + `AGENT_REGISTRY_ENV` (instead of `AGENT_REGISTRY_BUCKET` + `AGENT_REGISTRY_KEY_PREFIX`)
- Replace `bucket.grantRead()` with `table.grantReadData()`

### 3. Python `agent_registry.py`

Replace `_load_from_s3()` with `_load_from_dynamodb()`:
- `dynamodb.query(TableName=table, KeyConditionExpression="env = :e", ExpressionAttributeValues={":e": {"S": env}})`
- Parse DynamoDB item format → same `AgentRegistryEntry` Pydantic model
- Env vars: `AGENT_REGISTRY_TABLE` + `AGENT_REGISTRY_ENV`

### 4. Deploy Script `register_agent_in_dynamodb()`

Replace `register_agent_in_s3()` in all 5 deploy scripts:
- Get table name: `$AGENT_REGISTRY_TABLE` env var → fall back to CloudFormation output `AgentRegistryTableName`
- Write item: `aws dynamodb put-item --table-name $table --item '{...}'`
- Same non-fatal error handling pattern

### 5. Test Rewrites

Python tests (24 tests):
- Replace `boto3.client("s3")` mocks with `boto3.resource("dynamodb")` or `boto3.client("dynamodb")` mocks
- Replace `list_objects_v2`/`get_object` stubs with `query` stubs returning DynamoDB item format
- Replace `os.environ` patches: `AGENT_REGISTRY_TABLE`+`AGENT_REGISTRY_ENV` instead of `AGENT_REGISTRY_BUCKET`+`AGENT_REGISTRY_KEY_PREFIX`

CDK tests (7 tests):
- Assert `AWS::DynamoDB::Table` with `agent-registry` in name
- Assert `AGENT_REGISTRY_TABLE`/`AGENT_REGISTRY_ENV` in env vars
- Assert no S3 agent-registry bucket
- Assert IAM includes DynamoDB read permissions

## Complexity Tracking

> No constitution violations — table is empty.
