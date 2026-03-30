# Research: Exclude Time and Web Fetch from Default Deployment

**Feature**: 057-exclude-time-fetch-deploy  
**Date**: 2026-03-30

## Decision 1: Remove unified-deploy phases (no optional env toggle in scope)

**Decision**: The root `scripts/deploy.sh` `deploy` subcommand stops invoking `execution-zones/time-agent/scripts/deploy.sh` and `execution-zones/fetch-url-agent/scripts/deploy.sh`. Preflight and `save_execution_agent_arns_to_config` pass empty strings for Time and Web Fetch ARNs so `executionAgentArns` in verification CDK config never includes `time` or `fetch-url` keys after a standard run.

**Rationale**:

- Matches the spec: standard procedure must not provision or register those capabilities.
- Per-zone deploy scripts remain the supported path for teams that explicitly need these agents (spec assumption: separate documented workflow).
- Avoids extra configuration surface (env toggles) unless a later spec asks for them.

**Alternatives considered**:

- **Feature flags** (`DEPLOY_TIME_AGENT=1`): Rejected for initial delivery — spec marks opt-in path as out of scope; can be added later without changing the default.
- **Leave phases but no-op**: Rejected — would still imply support burden and confuse operators reading logs.

## Decision 2: Clear stale DynamoDB agent-registry entries

**Decision**: After the main verification deploy (or in a dedicated step tied to the same standard run), remove registry items for `agent_id` `time` and `fetch-url` for the configured `env` partition, using the same table resolved as today (`AGENT_REGISTRY_TABLE` / CloudFormation output). Use idempotent deletes (`aws dynamodb delete-item` or equivalent) so missing items do not fail the deploy.

**Rationale**:

- The verification agent loads skills from DynamoDB; leaving old `PutItem` rows would still expose Time and Web-fetch after ARNs were cleared from CDK config, violating FR-002.
- Deletes are deploy-time infrastructure actions; they do not change the security pipeline or zone isolation.

**Alternatives considered**:

- **Runtime denylist env var** on the verification agent: Rejected as primary — duplicates source of truth and risks skew between config and registry.
- **Manual cleanup only**: Rejected — error-prone and fails SC-002 in practice.

## Decision 3: Preflight behavior with legacy stacks

**Decision**: Preflight continues to read existing stack outputs if stacks exist, but when persisting ARNs for IAM scoping the unified script overwrites Time and Web Fetch with empty strings (same as main path). Resource policy steps and AgentCore validation skip Time and Web Fetch when ARNs are empty (existing `[[ -n "${time_arn}" ]]` patterns).

**Rationale**:

- Ensures CDK `executionAgentArns` and IAM invoke targets align with “not part of default product” even when old CloudFormation stacks remain in the account.
- Avoids requiring stack deletion before the next verification deploy.

**Alternatives considered**:

- **Fail if legacy stacks exist**: Rejected — spec edge case says resources may remain until explicitly torn down.

## Decision 4: Phase numbering and diagnostics

**Decision**: Renumber deploy phases in user-visible logs (e.g., six phases instead of eight after removing two execution zones). Update `status`, `logs`, and `check-access` only where they assume Time/Web Fetch are always deployed—prefer “if stack exists” behavior so legacy environments still diagnose.

**Rationale**: Operator clarity and Principle VI (docs/scripts parity).

**Alternatives considered**: Leave “Phase x/8” with gaps — Rejected as confusing.

## Decision 5: Testing strategy

**Decision**: Add or extend automated coverage for (1) `build_execution_agent_arns_json` / `save_execution_agent_arns_to_config` behavior with empty third and fourth arguments, and (2) any new bash helper for registry deletes (mock AWS CLI or unit-test jq payloads). Run existing verification-agent and CDK tests to ensure no regressions.

**Rationale**: Principle II (TDD) — deploy script behavior is production-critical.

**Alternatives considered**: Manual testing only — Rejected.
