# Research: S3 Agent Registry

**Date**: 2026-03-24
**Feature**: 054-ssm-agent-registry

## Decision 1: S3 vs SSM Parameter Store vs DynamoDB for Agent Registry

**Decision**: S3 (consolidated JSON file)

**Rationale**:
- Single `GetObject` call retrieves all agents regardless of count (scales to 100+ agents without pagination)
- SSM `GetParametersByPath` paginates at 10 parameters per page — 100 agents would require 10 API calls
- S3 versioning provides a free audit trail of registry changes (who changed what, when)
- The project already uses S3 for file exchange between agents, so the team is familiar with S3 patterns
- S3 has effectively no per-object size limit (vs SSM Standard's 4KB per parameter)
- Consolidated JSON in one file means atomic reads — no partial-load risk from pagination failures

**Alternatives considered**:
- **SSM Parameter Store**: Native prefix scan (`GetParametersByPath`), free Standard parameters. However, paginates at 10/page which doesn't scale well beyond ~10 agents. Each agent requires a separate parameter, leading to N parameters to manage
- **DynamoDB**: Over-provisioned for static, small data. Requires table creation, capacity planning, and doesn't offer meaningful advantages over S3 for this use case
- **Environment variables**: Current approach. Doesn't scale (CDK context size limits, verification agent redeploy required for changes)

## Decision 2: S3 Key Structure

**Decision**: `{env}/agent-registry/{agent-id}.json` (one file per agent)

**Rationale**:
- Each deploy script writes only its own agent's file — no risk of accidentally modifying or deleting other agents' entries
- Environment prefix (`prod`/`dev`) as the first path component provides clean isolation
- Environment isolation via key prefix: `dev/agent-registry/time.json` vs `prod/agent-registry/time.json`
- S3 bucket can be shared (existing infra bucket or a new dedicated one created in CDK)
- Prefix-based isolation is a standard S3 pattern, familiar to the team
- VerificationAgent reads via `ListObjectsV2` (prefix scan) + `GetObject` per file — ~6 agents means ~7 API calls total, well under 2 seconds

**Alternatives considered**:
- Consolidated single file (`{env}/agent-registry/registry.json`): Single `GetObject` at read time, but requires read-modify-write at deploy time — risk of corrupting or losing other agents' entries on merge bugs or concurrent deploys
- Flat key without env prefix: Risks cross-environment contamination

## Decision 3: Per-Agent JSON Schema

**Decision**: Each agent file contains a JSON object with `arn`, `description`, `skills`. Agent-id is derived from the filename (`{agent-id}.json`).

```json
// s3://{bucket}/dev/agent-registry/time.json
{
  "arn": "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/SlackAI_TimeAgent_Dev-abc123",
  "description": "現在日時取得専用エージェント...",
  "skills": [{"id": "current-time", "name": "Current Time", "description": "..."}]
}
```

**Rationale**:
- These three fields are what VerificationAgent's `build_agent_tools()` and `make_agent_tool()` consume from agent cards
- `arn` replaces `_AGENT_ARNS` dict (currently from `EXECUTION_AGENT_ARNS` env var)
- `description` and `skills` replace `_AGENT_CARDS` dict (currently from `discover_agent_card()`)
- Agent-id derived from filename (e.g., `time.json` → `"time"`) — no need for an `id` field inside the JSON
- Omits fields not used by VerificationAgent (e.g., `url`, `authentication`, `capabilities`, `protocol`, `version`)

**Alternatives considered**:
- Consolidated JSON with agent-id keys: Natural dict mapping but requires read-modify-write at deploy time
- Storing the full agent card JSON: Would work but includes unused fields only relevant for A2A protocol endpoint

## Decision 4: Deploy Script S3 Write Strategy

**Decision**: Direct `PutObject` per agent — each deploy script writes its own file (`{agent-id}.json`) without reading or modifying other files

**Rationale**:
- Each agent already has a self-contained `scripts/deploy.sh` that knows the agent's identity and can read its ARN from CfnOutput
- Direct `PutObject` is atomic and cannot corrupt other agents' entries — write safety by design
- Agent card data is available in the agent's `src/agent_card.py` — can be extracted at deploy time
- No merge logic needed — simpler deploy scripts, fewer failure modes
- Root deploy script no longer needs to assemble `EXECUTION_AGENT_ARNS_JSON` and pass to verification deploy
- Concurrent deploys are safe — each writes to a different S3 key

**Alternatives considered**:
- Read-modify-write on consolidated JSON: Risk of corrupting other agents' entries on merge bugs, race conditions on concurrent deploys
- CDK custom resource writing to S3: Adds complexity within CDK stack; ties lifecycle to CloudFormation

## Decision 5: VerificationAgent S3 Read Pattern

**Decision**: `ListObjectsV2` (prefix scan) + `GetObject` per file at startup, replacing `discover_agent_card()` loop

**Rationale**:
- `ListObjectsV2` with prefix `{env}/agent-registry/` returns all agent file keys in one call
- Then `GetObject` per file (~6 calls for current agent count) — total latency well under 2 seconds
- Each file is a few hundred bytes — minimal network overhead
- Replaces 4+ sequential `invoke_agent_runtime` calls that each wake an execution agent
- Scales to 100+ agents (S3 `ListObjectsV2` returns up to 1000 keys per page)
- Fail-open: if S3 read fails, empty registry + WARN log (matching current infra fail-open pattern)
- Individual file read failure → skip that agent (ERROR log), continue loading others

**Alternatives considered**:
- Single consolidated JSON with one `GetObject`: Simpler read but requires read-modify-write at deploy time — rejected for write safety
- S3 Select: Over-engineered for small JSON; adds complexity without performance benefit
- S3 event notification (EventBridge): Over-engineered for startup-only reads

## Decision 6: Handling refresh_missing_cards()

**Decision**: Replace with S3 re-read (same `ListObjectsV2` + `GetObject` per file)

**Rationale**:
- Current `refresh_missing_cards()` retries `discover_agent_card()` for entries with `None` cards
- With per-agent S3 files, re-reading the prefix captures any newly added or updated agents
- A "missing" card means it wasn't in S3 at startup time — re-scan picks it up
- Simple, consistent with the startup pattern — same function, same code path

## Decision 7: IAM Permissions

**Decision**:
- VerificationAgent: `s3:GetObject` + `s3:ListBucket` (with condition `s3:prefix`) scoped to `{bucket}/{env}/agent-registry/`
- Deploy scripts (existing IAM role/profile): `s3:PutObject` scoped to `{bucket}/{env}/agent-registry/*`

**Rationale**:
- Least-privilege: VerificationAgent can list and read but not write; deploy scripts can only write their own file
- `s3:ListBucket` with prefix condition needed for `ListObjectsV2` to enumerate agent files
- `s3:GetObject` needed to read each agent's JSON file
- Deploy scripts only need `s3:PutObject` — no read required (direct write, not read-modify-write)
- Scoping to the specific key prefix prevents access to other objects in the bucket
- CDK `grantRead()` method provides clean IAM generation for both `GetObject` and `ListBucket`

## Decision 8: Environment Variable Changes in CDK

**Decision**: Replace `EXECUTION_AGENT_ARNS` + `ENABLE_AGENT_CARD_DISCOVERY` + `SLACK_SEARCH_AGENT_ARN` with `AGENT_REGISTRY_BUCKET` + `AGENT_REGISTRY_KEY_PREFIX`

**Rationale**:
- Two env vars: `AGENT_REGISTRY_BUCKET` (bucket name) and `AGENT_REGISTRY_KEY_PREFIX` (e.g., `dev/agent-registry/`) provide all information needed for `ListObjectsV2` + `GetObject`
- VerificationAgent reads bucket + prefix from env and scans the prefix — no need for pre-populated ARN lists
- Eliminates the complex ARN handoff chain in root deploy script (`build_execution_agent_arns_json`, `EXECUTION_AGENT_ARNS_JSON`, etc.)
- `ENABLE_AGENT_CARD_DISCOVERY` flag becomes unnecessary (S3 read replaces invoke-based discovery)
- Splitting into bucket + prefix (rather than a single S3 URI) aligns with boto3's `list_objects_v2(Bucket=..., Prefix=...)` API

## Decision 9: Backward Compatibility During Migration

**Decision**: Clean cutover — no dual-mode support

**Rationale**:
- This is an internal infrastructure change, not a user-facing API change
- All deploy scripts are updated in the same PR
- No external consumers depend on the `EXECUTION_AGENT_ARNS` env var format
- Maintaining dual-mode (S3 + env var fallback) adds complexity without benefit

## Decision 10: Per-Agent File vs Consolidated JSON

**Decision**: One S3 file per agent (`{env}/agent-registry/{agent-id}.json`) instead of a single consolidated `registry.json`

**Rationale**:
- **Write safety**: Each deploy script writes only its own file via `PutObject` — impossible to corrupt or delete other agents' entries
- **No merge logic**: Deploy scripts don't need `jq` or Python to merge JSON — just construct and upload
- **Concurrent deploy safe**: Multiple agents deploying simultaneously write to different S3 keys — no race conditions
- **Read failure isolation**: If one agent's file is malformed, only that agent is skipped — others load normally
- **Read performance acceptable**: `ListObjectsV2` + ~6 `GetObject` calls total well under 2 seconds (each file is a few hundred bytes)
- **Agent removal**: Deleting an agent = deleting its S3 file — clean, atomic, no risk of partial edits

**Trade-offs**:
- Read requires N+1 API calls instead of 1 (acceptable for ~6 agents, scales to 1000 with `ListObjectsV2` pagination)
- No single "registry snapshot" file — must list prefix to discover agents

**Alternatives considered**:
- Consolidated `registry.json` with read-modify-write: Single `GetObject` at read time, but deploy-time merge logic risks corrupting other agents' entries on bugs or concurrent deploys
- Consolidated `registry.json` with S3 conditional writes (ETags): Adds optimistic locking but still requires merge logic and retry loops — complexity without eliminating the fundamental risk
