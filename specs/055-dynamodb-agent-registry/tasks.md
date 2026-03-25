# Tasks: DynamoDB Agent Registry Migration

**Input**: Design documents from `/specs/055-dynamodb-agent-registry/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: TDD required per constitution (Principle II). Test tasks precede implementation tasks.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create the new DynamoDB construct (shared by all user stories)

- [x] T001 Create `AgentRegistryTable` CDK construct in verification-zones/verification-agent/cdk/lib/constructs/agent-registry-table.ts following the WhitelistConfig pattern (PK=env, SK=agent_id, PAY_PER_REQUEST, AWS_MANAGED encryption, DESTROY removal policy)

**Checkpoint**: New construct exists and compiles

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire the new DynamoDB table into the CDK stack and runtime — MUST complete before user story work

- [x] T002 Add `agentRegistryTable` prop (type `dynamodb.ITable`) and `agentRegistryEnv` prop (type `string`) to `VerificationAgentRuntimeProps` interface in verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts, replacing `agentRegistryBucket` and `agentRegistryKeyPrefix` props
- [x] T003 Update environment variable block in verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts: set `AGENT_REGISTRY_TABLE` from `props.agentRegistryTable.tableName` and `AGENT_REGISTRY_ENV` from `props.agentRegistryEnv`; remove `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX` assignments
- [x] T004 Replace S3 `grantRead` with `table.grantReadData(this.executionRole)` for agent registry IAM in verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts
- [x] T005 Update verification-zones/verification-agent/cdk/lib/verification-stack.ts: replace `AgentRegistryBucket` instantiation with `AgentRegistryTable`; pass `agentRegistryTable` and `agentRegistryEnv` to `VerificationAgentRuntime`; change CfnOutput from `AgentRegistryBucketName` to `AgentRegistryTableName`
- [x] T006 Update import statements in verification-zones/verification-agent/cdk/lib/verification-stack.ts: remove `AgentRegistryBucket` import, add `AgentRegistryTable` import

**Checkpoint**: `npm run build` succeeds in CDK directory; `npx cdk synth` produces template with DynamoDB table instead of S3 bucket

---

## Phase 3: User Story 1 — Single-Query Registry Read (Priority: P1)

**Goal**: Verification agent reads all agent cards from DynamoDB with a single Query

**Independent Test**: Run `python -m pytest tests/test_agent_registry.py -v` — all 24 tests pass with DynamoDB mocks

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [US1] Rewrite `TestLoadFromS3Valid` → `TestLoadFromDynamoDBValid` in verification-zones/verification-agent/tests/test_agent_registry.py: mock `boto3.resource("dynamodb").Table().query()` returning items with env/agent_id/arn/description/skills/updated_at; assert arns and cards populated correctly
- [x] T008 [US1] Rewrite `TestLoadFromS3Empty` → `TestLoadFromDynamoDBEmpty` in verification-zones/verification-agent/tests/test_agent_registry.py: mock Query returning empty Items list; assert empty dicts
- [x] T009 [US1] Rewrite `TestLoadFromS3Mixed` → `TestLoadFromDynamoDBMixed` in verification-zones/verification-agent/tests/test_agent_registry.py: include items with missing/empty arn; assert invalid entries skipped, valid ones loaded
- [x] T010 [US1] Rewrite `TestLoadFromS3ListException` → `TestLoadFromDynamoDBQueryException` in verification-zones/verification-agent/tests/test_agent_registry.py: mock Query raising ClientError; assert fail-open (empty dicts, warning logged)
- [x] T011 [US1] Rewrite `TestLoadFromS3GetObjectFailure` test class — repurpose as `TestLoadFromDynamoDBPartialFailure` in verification-zones/verification-agent/tests/test_agent_registry.py: mock Query returning items where one has invalid data; assert valid items loaded, invalid skipped
- [x] T012 [US1] Rewrite `TestInitializeRegistry` in verification-zones/verification-agent/tests/test_agent_registry.py: patch `os.environ` with `AGENT_REGISTRY_TABLE` and `AGENT_REGISTRY_ENV` instead of S3 vars; assert `initialize_registry()` calls DynamoDB Query and populates globals
- [x] T013 [US1] Rewrite `TestRefreshRegistry` in verification-zones/verification-agent/tests/test_agent_registry.py: assert `refresh_registry()` re-executes DynamoDB Query and replaces state
- [x] T014 [US1] Rewrite `TestSlackSearchRegistry` in verification-zones/verification-agent/tests/test_agent_registry.py: assert slack-search agent loaded from DynamoDB identically to other agents

### Implementation for User Story 1

- [x] T015 [US1] Rewrite `_load_from_s3()` → `_load_from_dynamodb(table_name, env)` in verification-zones/verification-agent/src/agent_registry.py: use `boto3.resource("dynamodb").Table(table_name).query(KeyConditionExpression=Key("env").eq(env))`; parse items into arns/cards dicts; validate via AgentRegistryEntry Pydantic model; fail-open on errors
- [x] T016 [US1] Update `initialize_registry()` in verification-zones/verification-agent/src/agent_registry.py: read `AGENT_REGISTRY_TABLE` and `AGENT_REGISTRY_ENV` env vars; call `_load_from_dynamodb()`; update log event source to "dynamodb"
- [x] T017 [US1] Update `refresh_registry()` in verification-zones/verification-agent/src/agent_registry.py: read same env vars; call `_load_from_dynamodb()`
- [x] T018 [US1] Run `cd verification-zones/verification-agent && python -m pytest tests/test_agent_registry.py -v` — all 24 tests must pass

**Checkpoint**: All Python agent registry tests green; `get_agent_arn()`, `get_all_cards()`, `refresh_registry()` work with DynamoDB backend

---

## Phase 4: User Story 2 — Deploy-Time Auto-Registration (Priority: P2)

**Goal**: Each agent's deploy script writes a PutItem to DynamoDB after CDK deploy

**Independent Test**: Run any single agent's deploy script — DynamoDB item created with correct PK/SK/attributes

### Tests for User Story 2

> Deploy script tests are validated by running the scripts with mocked AWS CLI — manual verification via quickstart.md scenarios

- [x] T019 [US2] Rewrite `register_agent_in_s3()` → `register_agent_in_dynamodb()` in execution-zones/time-agent/scripts/deploy.sh: get table name from `$AGENT_REGISTRY_TABLE` env var or CloudFormation output `AgentRegistryTableName`; get runtime ARN from stack output; write DynamoDB item with `aws dynamodb put-item` containing env, agent_id, arn, description, skills, updated_at; non-fatal on failure
- [x] T020 [P] [US2] Rewrite `register_agent_in_s3()` → `register_agent_in_dynamodb()` in execution-zones/docs-agent/scripts/deploy.sh with same pattern as T019 (agent_id="docs")
- [x] T021 [P] [US2] Rewrite `register_agent_in_s3()` → `register_agent_in_dynamodb()` in execution-zones/fetch-url-agent/scripts/deploy.sh with same pattern as T019 (agent_id="fetch-url")
- [x] T022 [P] [US2] Rewrite `register_agent_in_s3()` → `register_agent_in_dynamodb()` in execution-zones/file-creator-agent/scripts/deploy.sh with same pattern as T019 (agent_id="file-creator")
- [x] T023 [P] [US2] Rewrite `register_agent_in_s3()` → `register_agent_in_dynamodb()` in verification-zones/slack-search-agent/scripts/deploy.sh with same pattern as T019 (agent_id="slack-search")
- [x] T024 [US2] Update scripts/deploy.sh root orchestrator: change CloudFormation output reference from `AgentRegistryBucketName` to `AgentRegistryTableName`; pass `AGENT_REGISTRY_TABLE` env var instead of `AGENT_REGISTRY_BUCKET` to per-agent deploys

**Checkpoint**: All 5 deploy scripts have `register_agent_in_dynamodb()` function; root deploy.sh references correct output key

---

## Phase 5: User Story 3 — S3 Registry Resource Removal (Priority: P3)

**Goal**: Remove S3 agent-registry bucket construct and all S3 registry references

**Independent Test**: `npx cdk synth` produces no S3 agent-registry bucket; `grep -r "AGENT_REGISTRY_BUCKET" .` returns zero matches

### Tests for User Story 3

> **Write CDK test updates FIRST, ensure they FAIL before implementation**

- [x] T025 [US3] Rewrite the 7 S3 agent registry CDK tests in verification-zones/verification-agent/cdk/test/verification-stack.test.ts: (1) assert `AWS::DynamoDB::Table` with `agent-registry` in TableName; (2) assert `AGENT_REGISTRY_TABLE` in env vars; (3) assert `AGENT_REGISTRY_ENV` in env vars; (4) assert `AGENT_REGISTRY_BUCKET` NOT in env vars; (5) assert `AGENT_REGISTRY_KEY_PREFIX` NOT in env vars; (6) assert IAM includes dynamodb read permissions; (7) assert CfnOutput `AgentRegistryTableName` exists

### Implementation for User Story 3

- [x] T026 [US3] Delete verification-zones/verification-agent/cdk/lib/constructs/agent-registry-bucket.ts
- [x] T027 [US3] Delete compiled verification-zones/verification-agent/cdk/lib/constructs/agent-registry-bucket.js and agent-registry-bucket.d.ts (if present)
- [x] T028 [US3] Run `cd verification-zones/verification-agent/cdk && npm run build && npm test` — all CDK tests must pass
- [x] T029 [US3] Run `cd verification-zones/verification-agent && python -m pytest tests/ -v` — all Python tests must pass (verify no S3 references remain)

**Checkpoint**: Zero S3 agent-registry references in codebase; all tests green

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, CHANGELOG, and final validation

- [x] T030 [P] Update CHANGELOG.md: add `### Changed` entry under `[Unreleased]` for DynamoDB agent registry migration
- [x] T031 [P] Update CLAUDE.md: update Active Technologies (DynamoDB table replaces S3 bucket) and Recent Changes section
- [x] T032 [P] Update verification-zones/verification-agent/README.md: update architecture section to reference DynamoDB agent registry instead of S3; update environment variables section
- [x] T033 Run quickstart.md Scenario 5 validation: `cd verification-zones/verification-agent/cdk && npx cdk synth` — verify template contains DynamoDB table, no S3 agent-registry bucket, correct env vars and IAM
- [x] T034 Final validation: run all test suites (`cd verification-zones/verification-agent && python -m pytest tests/ -v` and `cd verification-zones/verification-agent/cdk && npm test`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001)
- **US1 (Phase 3)**: Depends on Phase 2 (CDK wiring complete)
- **US2 (Phase 4)**: Depends on Phase 2 (CfnOutput key changed to `AgentRegistryTableName`)
- **US3 (Phase 5)**: Depends on Phase 2 (bucket construct replaced by table)
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Independent after Foundational — Python-only changes
- **US2 (P2)**: Independent after Foundational — Bash deploy scripts only; can run in parallel with US1
- **US3 (P3)**: Independent after Foundational — CDK deletions and test rewrites; can run in parallel with US1/US2

### Within Each User Story

- Tests written and failing before implementation (TDD)
- Implementation in dependency order (models → services)
- Validation checkpoint at end of each story

### Parallel Opportunities

- **Phase 4**: T020, T021, T022, T023 can all run in parallel (different deploy scripts)
- **Phase 3 + Phase 4**: US1 (Python) and US2 (Bash) touch different files — can run in parallel
- **Phase 6**: T030, T031, T032 can all run in parallel (different docs files)

---

## Parallel Example: User Story 2

```bash
# After T019 (time-agent) establishes the pattern, remaining agents can run in parallel:
Task: T020 "Rewrite register_agent_in_dynamodb in docs-agent deploy.sh"
Task: T021 "Rewrite register_agent_in_dynamodb in fetch-url-agent deploy.sh"
Task: T022 "Rewrite register_agent_in_dynamodb in file-creator-agent deploy.sh"
Task: T023 "Rewrite register_agent_in_dynamodb in slack-search-agent deploy.sh"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T006)
3. Complete Phase 3: User Story 1 (T007–T018)
4. **STOP and VALIDATE**: All Python tests pass with DynamoDB backend

### Incremental Delivery

1. Setup + Foundational → CDK compiles with DynamoDB table
2. Add US1 → Python reads from DynamoDB → Test independently
3. Add US2 → Deploy scripts write to DynamoDB → Test independently
4. Add US3 → S3 artifacts removed → Test independently
5. Polish → Docs updated, final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- TDD mandated by constitution: tests MUST fail before implementation
- Commit after each task or logical group
- 24 existing Python tests + 7 existing CDK tests must all pass after migration
- The `AgentSkill` and `AgentRegistryEntry` Pydantic models remain unchanged — only the storage backend changes
