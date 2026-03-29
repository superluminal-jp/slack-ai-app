# Implementation Plan: S3 Agent Registry

**Branch**: `054-ssm-agent-registry` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/054-ssm-agent-registry/spec.md`

## Summary

Migrate VerificationAgent's agent card registry from runtime `invoke_agent_runtime`-based discovery to per-agent S3 JSON files, eliminating the cascade startup of 4 execution agents during AgentCore's periodic container restarts. Each deploy script writes its own agent card + ARN to a dedicated S3 file (`{agent-id}.json`) via direct `PutObject`; VerificationAgent reads all agent files from S3 with `ListObjectsV2` + `GetObject` per file at startup.

## Technical Context

**Language/Version**: Python 3.11 (agents), TypeScript 5.x (CDK), Bash 5.x (deploy scripts)
**Primary Dependencies**: `boto3 ~=1.42.0` (S3 client), `pydantic` (validation), `aws-cdk-lib` 2.215.0 (S3 bucket, IAM grants), `strands-agents[a2a,otel] ~=1.25.0`
**Storage**: S3 (per-agent JSON files: `{env}/agent-registry/{agent-id}.json`)
**Testing**: `pytest` (Python agents), Jest (CDK)
**Target Platform**: AWS (Bedrock AgentCore containers, ARM64)
**Project Type**: Multi-agent system (verification + execution zones)
**Performance Goals**: Agent card load < 2 seconds at startup (`ListObjectsV2` + ~6 `GetObject` calls)
**Constraints**: Per-agent files (atomic writes, no merge logic); ~6 agents
**Scale/Scope**: 5-6 agents registered (scales to 1000+ with `ListObjectsV2` pagination), single AWS account, Prod/Dev environment separation via S3 key prefix

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec `054-ssm-agent-registry/spec.md` created with acceptance criteria |
| II. Test-Driven Development | PASS | Plan includes test tasks before implementation for each component |
| III. Security-First | PASS | IAM least-privilege: `s3:GetObject` scoped to registry key prefix only. S3 bucket with `blockPublicAccess`, `enforceSSL`, SSE-S3 encryption |
| IV. Fail-Open/Fail-Closed | PASS | S3 read failure → fail-open (WARN + empty registry). Matches existing `initialize_registry()` pattern |
| V. Zone-Isolated Architecture | PASS | No cross-zone imports. Each agent's deploy script writes its own entry via read-modify-write. VerificationAgent reads only |
| VI. Documentation & Deploy-Script Parity | PASS | Plan includes deploy script updates, README, CHANGELOG, CLAUDE.md updates |
| VII. Clean Code Identifiers | PASS | No spec numbers or branch names in code |

## Project Structure

### Documentation (this feature)

```text
specs/054-ssm-agent-registry/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
# Files to MODIFY (existing):
verification-zones/verification-agent/
├── src/
│   ├── agent_registry.py          # Replace discover logic with S3 read
│   └── pipeline.py                # Minor: remove ENABLE_AGENT_CARD_DISCOVERY reference if any
├── tests/
│   └── test_agent_registry.py     # Rewrite tests for S3-based registry
└── cdk/
    └── lib/constructs/
        └── verification-agent-runtime.ts  # Replace env vars, add S3 IAM, create/reference S3 bucket

# Files to MODIFY (deploy scripts):
scripts/deploy.sh                                    # Remove EXECUTION_AGENT_ARNS_JSON assembly
verification-zones/verification-agent/scripts/deploy.sh  # Remove EXECUTION_AGENT_ARNS_JSON passing
execution-zones/time-agent/scripts/deploy.sh              # Add S3 registry read-modify-write post-deploy
execution-zones/docs-agent/scripts/deploy.sh              # Add S3 registry read-modify-write post-deploy
execution-zones/fetch-url-agent/scripts/deploy.sh         # Add S3 registry read-modify-write post-deploy
execution-zones/file-creator-agent/scripts/deploy.sh      # Add S3 registry read-modify-write post-deploy
verification-zones/slack-search-agent/scripts/deploy.sh   # Add S3 registry read-modify-write post-deploy

# Files to MODIFY (CDK tests):
verification-zones/verification-agent/cdk/test/       # Update CDK test assertions

# Files NOT changed:
execution-zones/*/src/agent_card.py                   # Retained for A2A protocol endpoint
verification-zones/verification-agent/src/a2a_client.py  # invoke_execution_agent() unchanged
verification-zones/verification-agent/src/agent_tools.py  # build_agent_tools() interface unchanged
verification-zones/verification-agent/src/orchestrator.py  # Consumes registry unchanged
```

**Structure Decision**: No new files or directories in `src/`. The S3 read logic is added to the existing `agent_registry.py` module, replacing the `discover_agent_card()` calls. Deploy scripts gain a direct S3 `PutObject` function (no read-modify-write needed). CDK gains S3 bucket creation/reference and IAM permissions.

## Implementation Phases

### Phase A: S3 Registry Reader (VerificationAgent Python)

**Scope**: Replace `agent_registry.py` internals to read from S3 instead of invoking agents.

**Changes**:
1. **`agent_registry.py`** — Pydantic models for type safety:
   - `AgentSkill(BaseModel)`: `id: str`, `name: str`, `description: str = ""`
   - `AgentRegistryEntry(BaseModel)`: `arn: str` (ARN pattern validated), `description: str` (min_length=1), `skills: list[AgentSkill] = []`
   - Used at both read (S3 → Python) and write (deploy → S3) boundaries

2. **`agent_registry.py`** — `_load_from_s3(bucket: str, prefix: str)` function:
   - Uses `boto3.client("s3").list_objects_v2(Bucket=bucket, Prefix=prefix)` to enumerate agent files
   - For each key matching `*.json`: `get_object(Bucket=bucket, Key=key)` → parse JSON → validate via `AgentRegistryEntry.model_validate(data)`
   - Derives agent-id from filename (e.g., `dev/agent-registry/time.json` → `"time"`)
   - Populates `_AGENT_ARNS` (from `entry.arn`) and `_AGENT_CARDS` (from `entry.model_dump()`)
   - Skips individual files with JSON parse or Pydantic `ValidationError` (ERROR log per file)
   - Returns on any S3 `ListObjectsV2` exception with WARN log (fail-open)

3. **`agent_registry.py`** — `initialize_registry()` rewrite:
   - Reads `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX` env vars
   - Calls `_load_from_s3(bucket, prefix)` instead of `_load_agent_arns()` + `discover_agent_card()` loop
   - Removes `EXECUTION_AGENT_ARNS` and `ENABLE_AGENT_CARD_DISCOVERY` env var reads

4. **`agent_registry.py`** — `refresh_missing_cards()` → `refresh_registry()` rewrite:
   - Calls `_load_from_s3(bucket, prefix)` again (full re-read replaces per-agent retry)
   - Updates both `_AGENT_ARNS` and `_AGENT_CARDS` atomically

5. **`agent_registry.py`** — Remove `_load_agent_arns()` (no longer needed; ARNs come from S3)

6. **`get_all_cards()`** — Returns `{agent_id: entry.model_dump()}` for backward compatibility with `build_agent_tools()`
7. **`get_agent_arn()`** — Interface unchanged (returns `str`)

### Phase B: CDK Changes (S3 Bucket + IAM + Environment Variables)

**Scope**: Update `verification-agent-runtime.ts` to create/reference S3 bucket, grant S3 read permission, and replace env vars.

**Changes**:
1. **Create or reference S3 bucket** in CDK with best practices:
   - `blockPublicAccess: BlockPublicAccess.BLOCK_ALL`
   - `enforceSSL: true`
   - `encryption: BucketEncryption.S3_MANAGED`
   - `versioned: true`
   - `removalPolicy: RemovalPolicy.RETAIN`
2. **Remove** `EXECUTION_AGENT_ARNS` env var injection
3. **Remove** `ENABLE_AGENT_CARD_DISCOVERY` env var
4. **Remove** `SLACK_SEARCH_AGENT_ARN` env var
5. **Add** `AGENT_REGISTRY_BUCKET` env var (bucket name)
6. **Add** `AGENT_REGISTRY_KEY_PREFIX` env var (e.g., `dev/agent-registry/`)
7. **Add** IAM: `s3:GetObject` on `arn:aws:s3:::{bucket}/{env}/agent-registry/*` + `s3:ListBucket` with prefix condition
8. **Keep** existing `AgentCoreInvoke` IAM policy (still needed for `invoke_execution_agent`)
9. **Update** props interface: remove `executionAgentArns` and `slackSearchAgentArn`, add `registryBucket` and `registryKeyPrefix` references
10. **Update** CDK tests to match new env var and IAM assertions

**Note on AgentCoreInvoke IAM**: With S3-based registry, the ARNs are no longer known at CDK deploy time. The IAM policy for `invoke_agent_runtime` must use a wildcard resource pattern (already exists as fallback) or be dynamically scoped.

### Phase C: Deploy Script S3 Writes

**Scope**: Each agent's deploy script writes its own card file to S3 via direct `PutObject` after successful CDK deploy.

**Changes per execution agent deploy script** (`time-agent`, `docs-agent`, `fetch-url-agent`, `file-creator-agent`, `slack-search-agent`):
1. Add a function `register_agent_in_s3()` that:
   - Reads the agent's ARN from CfnOutput (already available via `get_stack_output`)
   - Constructs the agent's entry JSON from `agent_card.py` (fields: `arn`, `description`, `skills`)
   - Uploads directly to S3 as `{env}/agent-registry/{agent-id}.json` (`aws s3 cp` or `aws s3api put-object`)
   - No read or merge needed — each agent writes only its own file
   - Logs success/failure (non-fatal: WARN on failure)
2. Call `register_agent_in_s3` after CDK deploy completes

**Changes to root `scripts/deploy.sh`**:
1. Remove `build_execution_agent_arns_json()` function
2. Remove `save_execution_agent_arns_to_config()` function
3. Remove `EXECUTION_AGENT_ARNS_JSON` env var passing to verification deploy
4. Per-agent deploy scripts now self-register; root script no longer assembles ARN JSON

**Changes to `verification-zones/verification-agent/scripts/deploy.sh`**:
1. Remove `EXECUTION_AGENT_ARNS_JSON` handling (no longer receives this env var)
2. Remove `SLACK_SEARCH_AGENT_ARN` env var passing
3. CDK context parameter `executionAgentArns` removed

### Phase D: Tests

**Scope**: Update all affected tests.

**Python tests** (`test_agent_registry.py`):
1. Replace `@patch("agent_registry.discover_agent_card")` with S3 boto3 mock (using `unittest.mock` or `botocore.stub.Stubber`)
2. Test: S3 `ListObjectsV2` returns multiple files, each `GetObject` returns valid JSON → `_AGENT_ARNS` and `_AGENT_CARDS` populated correctly
3. Test: S3 `ListObjectsV2` returns empty (no files) → empty registry (no error)
4. Test: S3 returns mix of valid and invalid agent files → valid entries loaded, invalid skipped
5. Test: S3 `ListObjectsV2` raises exception → fail-open with empty registry
6. Test: Individual `GetObject` failure → skip that agent, load others
7. Test: `refresh_registry()` re-reads S3 and updates state
8. Test: `get_all_cards()` and `get_agent_arn()` return expected values

**CDK tests** (`verification-agent-runtime.test.ts` or similar):
1. Assert `AGENT_REGISTRY_BUCKET` env var is set
2. Assert `AGENT_REGISTRY_KEY_PREFIX` env var is set
3. Assert `EXECUTION_AGENT_ARNS` env var is NOT set
4. Assert `ENABLE_AGENT_CARD_DISCOVERY` env var is NOT set
5. Assert `s3:GetObject` and `s3:ListBucket` IAM policies are present with correct resource scope

### Phase E: Documentation & Deploy Parity

**Scope**: Update all affected documentation per Constitution Principle VI.

1. **CHANGELOG.md**: Add `[Unreleased]` entry under `Changed` category
2. **CLAUDE.md**: Update "Active Technologies" (add S3 agent registry) and "Recent Changes"
3. **verification-agent README**: Update configuration section (env vars changed)
4. **scripts/README.md**: Update deploy workflow description (S3 self-registration replaces ARN handoff)

## Complexity Tracking

No constitution violations. No complexity exceptions needed.
