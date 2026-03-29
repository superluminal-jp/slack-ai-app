# Feature Specification: DynamoDB Agent Registry Migration

**Feature Branch**: `055-dynamodb-agent-registry`
**Created**: 2026-03-25
**Status**: Draft
**Input**: Agent Registry ストレージを S3 から DynamoDB に移行する

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single-Query Registry Read (Priority: P1)

The verification agent reads all registered agent cards from DynamoDB with a single Query operation at startup, replacing the current multi-step S3 ListObjects + GetObject pattern. This gives the orchestrator immediate access to all agent ARNs and metadata.

**Why this priority**: Core read path — every user request depends on the agent registry being loaded. Without this, no agent dispatching works.

**Independent Test**: Deploy the verification agent with the DynamoDB table populated. Confirm `agent_registry.py` loads all agents via a single Query and the orchestrator dispatches requests correctly.

**Acceptance Scenarios**:

1. **Given** a DynamoDB table with 5 agent entries (env=dev), **When** the verification agent starts, **Then** all 5 agents are loaded into the in-memory registry via a single Query operation.
2. **Given** a DynamoDB table that is temporarily unavailable, **When** the verification agent starts, **Then** a WARNING is logged and the agent continues with an empty registry (fail-open).
3. **Given** agents registered under different env values (dev and prod), **When** the verification agent queries with env=dev, **Then** only dev agents are returned.
4. **Given** the registry is loaded, **When** `get_agent_arn("time")` is called, **Then** the correct ARN for the time agent is returned.
5. **Given** the registry is loaded, **When** `refresh_registry()` is called, **Then** a fresh DynamoDB Query replaces the cached data.

---

### User Story 2 - Deploy-Time Auto-Registration (Priority: P2)

Each execution agent's deploy script automatically registers its agent card in DynamoDB after a successful CDK deploy, replacing the current S3 PutObject registration. The deploy script writes a PutItem with the agent's ARN, description, and skills.

**Why this priority**: Without registration, the read path (US1) has no data. Deploy scripts are the write path that populates the registry.

**Independent Test**: Run any single agent's deploy script. Confirm the DynamoDB item is created with correct PK (env), SK (agent_id), ARN, description, skills, and updated_at.

**Acceptance Scenarios**:

1. **Given** a successful CDK deploy of time-agent, **When** the deploy script runs `register_agent_in_dynamodb()`, **Then** a DynamoDB item is written with PK=env, SK="time", arn=runtime ARN, and updated_at in ISO 8601.
2. **Given** a DynamoDB write failure during registration, **When** the deploy script catches the error, **Then** a warning is logged but the deploy is not marked as failed.
3. **Given** an existing registry entry for an agent, **When** the same agent is re-deployed, **Then** the entry is overwritten (upsert via PutItem).
4. **Given** 5 different agent deploy scripts, **When** each runs registration, **Then** the table contains 5 distinct items under the same env partition.

---

### User Story 3 - S3 Registry Resource Removal (Priority: P3)

The S3 agent-registry bucket construct and all S3-related registry code are removed from the CDK stack, deploy scripts, and Python source. The system operates entirely on DynamoDB for agent registration.

**Why this priority**: Cleanup task — only safe after US1 and US2 are verified. Reduces infrastructure footprint and eliminates the unused S3 bucket.

**Independent Test**: After removing S3 constructs, run `npx cdk synth` and confirm no agent-registry S3 bucket appears in the template. Run all tests and confirm no S3 registry references remain.

**Acceptance Scenarios**:

1. **Given** the S3 agent-registry bucket construct exists in CDK, **When** it is removed, **Then** `cdk synth` produces a template without the agent-registry S3 bucket.
2. **Given** deploy scripts contain `register_agent_in_s3()`, **When** replaced with `register_agent_in_dynamodb()`, **Then** no S3 registry function calls remain in any deploy script.
3. **Given** Python source references `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX`, **When** replaced with `AGENT_REGISTRY_TABLE`, **Then** no S3 registry env vars remain in runtime code.
4. **Given** CDK tests assert S3 agent-registry resources, **When** rewritten for DynamoDB, **Then** all CDK tests pass with DynamoDB assertions.

---

### Edge Cases

- What happens when the DynamoDB table exists but contains zero items for the queried env? → Empty registry, no error.
- What happens when a deploy script cannot determine the DynamoDB table name from CloudFormation outputs? → Warning logged, registration skipped, deploy succeeds.
- What happens when an agent entry has a missing or empty `arn` attribute? → Entry is skipped during registry load with a WARNING log.
- What happens when two agents deploy simultaneously and write to the same table? → DynamoDB handles concurrent PutItem safely; no conflict.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create a DynamoDB table named `{stack}-agent-registry` with PK=`env` (String) and SK=`agent_id` (String), using PAY_PER_REQUEST billing.
- **FR-002**: System MUST store agent entries with attributes: `arn` (String), `description` (String), `skills` (List of Map), `updated_at` (String, ISO 8601).
- **FR-003**: The verification agent MUST load all agent cards for its environment via a single DynamoDB Query on PK=env at startup.
- **FR-004**: The verification agent MUST replace `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX` environment variables with a single `AGENT_REGISTRY_TABLE` environment variable.
- **FR-005**: The verification agent's IAM policy MUST include `dynamodb:Query` on the agent-registry table and MUST remove S3 read permissions for the former registry bucket.
- **FR-006**: Each execution agent deploy script MUST write a PutItem to the DynamoDB table after successful CDK deploy, containing agent_id, env, arn, description, skills, and updated_at.
- **FR-007**: Registry read failures (DynamoDB Query errors) MUST be fail-open: log WARNING and continue with an empty registry.
- **FR-008**: Deploy-time registration failures MUST be non-fatal: log a warning and allow the deploy to complete.
- **FR-009**: The `refresh_registry()` function MUST re-execute the DynamoDB Query to reload all agent cards.
- **FR-010**: The S3 agent-registry bucket construct and all S3 registry-related code MUST be removed from the CDK stack, deploy scripts, and Python source.

### Key Entities

- **Agent Registry Entry**: Represents a registered execution agent. Key attributes: env (partition identifier), agent_id (unique agent name), arn (AgentCore Runtime ARN), description (human-readable purpose), skills (list of capability descriptors), updated_at (last registration timestamp).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All agent cards for a given environment are retrieved in a single read operation, replacing the previous multi-step retrieval pattern.
- **SC-002**: All 24 existing agent registry Python tests pass after rewriting to use DynamoDB mocks instead of S3 mocks.
- **SC-003**: All 7 existing CDK agent registry tests pass after rewriting to assert DynamoDB table resources instead of S3 bucket resources.
- **SC-004**: The synthesized CloudFormation template contains zero S3 resources related to agent registry after migration.
- **SC-005**: All 5 agent deploy scripts (time, docs, fetch-url, file-creator, slack-search) successfully register in DynamoDB and the verification agent reads all entries.

## Scope *(mandatory)*

### In Scope

- DynamoDB table creation in CDK (agent-registry table)
- Python `agent_registry.py` rewrite: S3 → DynamoDB Query
- Deploy script rewrite: `register_agent_in_s3()` → `register_agent_in_dynamodb()`
- CDK environment variable swap: S3 vars → `AGENT_REGISTRY_TABLE`
- IAM policy update: S3 read → DynamoDB Query
- S3 agent-registry bucket construct removal
- All existing test rewrites (Python + CDK)

### Out of Scope

- Changes to `invoke_execution_agent()` ARN-direct invocation pattern
- Changes to `agent_card.py` definitions in execution agents (A2A protocol)
- Changes to `executionAgentArns` / `slackSearchAgentArn` in CDK config (IAM scoping)
- DynamoDB TTL or ConditionExpression features (future enhancement)
- Cross-account DynamoDB access

## Assumptions

- The existing DynamoDB infrastructure patterns in this project (5 existing tables) provide a proven operational model.
- PAY_PER_REQUEST billing is appropriate given write frequency is limited to deploy-time only.
- Dev and prod environments can safely coexist in the same table using PK-based isolation.
- The DynamoDB table will be created by the verification agent's CDK stack (same pattern as the S3 bucket it replaces).
- Deploy scripts can look up the table name from the verification stack's CloudFormation outputs.

## Dependencies

- Existing S3-based agent registry (054-ssm-agent-registry) is fully implemented and deployed.
- All 5 agent deploy scripts have working `register_agent_in_s3()` functions to be migrated.
- CDK stack supports DynamoDB table creation (aws-cdk-lib/aws-dynamodb already in use for other tables).
