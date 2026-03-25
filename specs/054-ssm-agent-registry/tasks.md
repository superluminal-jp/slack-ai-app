# Tasks: S3 Agent Registry

**Input**: Design documents from `/specs/054-ssm-agent-registry/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: TDD required per Constitution Principle II. Test tasks precede implementation tasks.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3, US4)

---

## Phase 1: Setup

**Purpose**: No new project setup needed — existing project. This phase covers prerequisite verification only.

- [x] T001 Verify `pydantic` is available in verification-agent dependencies (already bundled with FastAPI) in verification-zones/verification-agent/src/requirements.txt

---

## Phase 2: Foundational (Pydantic Models + S3 Reader Core)

**Purpose**: Pydantic type definitions and S3 read function that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T002 [P] Write test for `AgentSkill` Pydantic model validation (valid/invalid inputs) in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T003 [P] Write test for `AgentRegistryEntry` Pydantic model validation (valid JSON, missing fields, invalid ARN) in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T004 [P] Write test for `_load_from_s3()`: `ListObjectsV2` returns multiple `.json` keys, each `GetObject` returns valid JSON → entries parsed into Pydantic models correctly, agent-id derived from filename in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T005 [P] Write test for `_load_from_s3()`: `ListObjectsV2` returns no keys → returns empty dict in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T006 [P] Write test for `_load_from_s3()`: `ListObjectsV2` returns mix of valid and invalid agent files → valid entries loaded, invalid skipped with ERROR log in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T007 [P] Write test for `_load_from_s3()`: `ListObjectsV2` raises exception → fail-open returns empty dict with WARN log in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T008 [P] Write test for `_load_from_s3()`: individual `GetObject` fails for one file → skip that agent (ERROR log), load remaining agents successfully in verification-zones/verification-agent/tests/test_agent_registry.py

### Implementation for Foundational

- [x] T009 [P] Add `AgentSkill` and `AgentRegistryEntry` Pydantic models to verification-zones/verification-agent/src/agent_registry.py
- [x] T010 Implement `_load_from_s3(bucket: str, prefix: str)` function with `ListObjectsV2` (prefix scan), `GetObject` per file, filename-to-agent-id derivation, Pydantic validation, per-file error handling, and fail-open in verification-zones/verification-agent/src/agent_registry.py
- [x] T011 Run tests T002–T008 and confirm all pass in verification-zones/verification-agent/

**Checkpoint**: Pydantic models and S3 reader function are tested and working. No integration yet.

---

## Phase 3: User Story 1 — カスケード起動の排除 (Priority: P1) MVP

**Goal**: VerificationAgent reads agent cards from S3 per-agent files at startup instead of invoking execution agents. Eliminates cascade startup and associated billing.

**Independent Test**: Deploy VerificationAgent with `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX` set, manually upload agent JSON files to S3, verify no `invoke_agent_runtime` calls for discovery.

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T012 [P] [US1] Write test for `initialize_registry()`: reads `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX` env vars and calls `_load_from_s3()` in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T013 [P] [US1] Write test for `initialize_registry()`: populates `_AGENT_ARNS` from `entry.arn` and `_AGENT_CARDS` from entry dict in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T014 [P] [US1] Write test for `initialize_registry()`: env vars not set → empty registry with WARN log in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T015 [P] [US1] Write test for `refresh_registry()` (replaces `refresh_missing_cards()`): re-reads S3 and updates both `_AGENT_ARNS` and `_AGENT_CARDS` in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T016 [P] [US1] Write test for `get_all_cards()` returns dict of agent-id → card dict (backward compatible) in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T017 [P] [US1] Write test for `get_agent_arn()` returns ARN string from S3-loaded registry in verification-zones/verification-agent/tests/test_agent_registry.py

### Implementation for User Story 1

- [x] T018 [US1] Rewrite `initialize_registry()` to read `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX` env vars and call `_load_from_s3()`, removing `EXECUTION_AGENT_ARNS` and `ENABLE_AGENT_CARD_DISCOVERY` env var reads in verification-zones/verification-agent/src/agent_registry.py
- [x] T019 [US1] Remove `_load_agent_arns()` function (ARNs now come from S3 registry entries) in verification-zones/verification-agent/src/agent_registry.py
- [x] T020 [US1] Rewrite `refresh_missing_cards()` → `refresh_registry()` to do full S3 re-read in verification-zones/verification-agent/src/agent_registry.py
- [x] T021 [US1] Ensure `get_all_cards()` returns `{agent_id: entry.model_dump()}` for backward compatibility with `build_agent_tools()` in verification-zones/verification-agent/src/agent_registry.py
- [x] T022 [US1] Update any callers of `refresh_missing_cards()` to use `refresh_registry()` in verification-zones/verification-agent/src/pipeline.py (if referenced)
- [x] T023 [US1] Run all tests T012–T017 and confirm pass in verification-zones/verification-agent/
- [x] T024 [US1] Run full test suite `python -m pytest tests/ -v` in verification-zones/verification-agent/ to confirm no regressions

**Checkpoint**: VerificationAgent reads from S3 at startup. No more `invoke_agent_runtime` discovery calls. Backward compatible with `agent_tools.py` and `orchestrator.py`.

---

## Phase 4: User Story 2 — デプロイ時の自動レジストリ登録 (Priority: P2)

**Goal**: Each execution agent's deploy script writes its own agent card JSON file to S3 via direct `PutObject` after CDK deploy. CDK creates/references S3 bucket with security best practices.

**Independent Test**: Run one agent's deploy script and verify its individual JSON file exists in S3 with correct format.

### Tests for User Story 2

> **Deploy scripts are Bash — test via manual execution and S3 verification**

- [x] T025 [P] [US2] Write CDK test asserting `AGENT_REGISTRY_BUCKET` env var is set on VerificationAgent runtime in verification-zones/verification-agent/cdk/test/
- [x] T026 [P] [US2] Write CDK test asserting `AGENT_REGISTRY_KEY_PREFIX` env var is set on VerificationAgent runtime in verification-zones/verification-agent/cdk/test/
- [x] T027 [P] [US2] Write CDK test asserting `EXECUTION_AGENT_ARNS` env var is NOT present in verification-zones/verification-agent/cdk/test/
- [x] T028 [P] [US2] Write CDK test asserting `ENABLE_AGENT_CARD_DISCOVERY` env var is NOT present in verification-zones/verification-agent/cdk/test/
- [x] T029 [P] [US2] Write CDK test asserting `s3:GetObject` and `s3:ListBucket` IAM policies exist with correct resource scope in verification-zones/verification-agent/cdk/test/

### Implementation for User Story 2

- [x] T030 [US2] Update `verification-agent-runtime.ts`: create or reference S3 bucket with `blockPublicAccess`, `enforceSSL`, `encryption: S3_MANAGED`, `versioned: true`, `removalPolicy: RETAIN` in verification-zones/verification-agent/cdk/lib/constructs/agent-registry-bucket.ts
- [x] T031 [US2] Update `verification-agent-runtime.ts`: remove `EXECUTION_AGENT_ARNS`, `ENABLE_AGENT_CARD_DISCOVERY`, `SLACK_SEARCH_AGENT_ARN` env vars; add `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX` in verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts
- [x] T032 [US2] Update `verification-agent-runtime.ts`: add `s3:GetObject` + `s3:ListBucket` (with prefix condition) IAM policy in verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts
- [x] T033 [US2] Update `verification-agent-runtime.ts`: add `agentRegistryBucket` and `agentRegistryKeyPrefix` to props interface in verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts
- [x] T034 [US2] Run CDK tests T025–T029 and confirm pass: `cd verification-zones/verification-agent/cdk && npm test`
- [x] T035 [P] [US2] Add `register_agent_in_s3()` function to execution-zones/time-agent/scripts/deploy.sh — extracts ARN from CfnOutput, constructs JSON from agent card, writes to `{env}/agent-registry/time.json` via direct `PutObject`
- [x] T036 [P] [US2] Add `register_agent_in_s3()` function to execution-zones/docs-agent/scripts/deploy.sh — writes to `{env}/agent-registry/docs.json`
- [x] T037 [P] [US2] Add `register_agent_in_s3()` function to execution-zones/fetch-url-agent/scripts/deploy.sh — writes to `{env}/agent-registry/fetch-url.json`
- [x] T038 [P] [US2] Add `register_agent_in_s3()` function to execution-zones/file-creator-agent/scripts/deploy.sh — writes to `{env}/agent-registry/file-creator.json`
- [x] T039 [US2] Remove `build_execution_agent_arns_json()` and `save_execution_agent_arns_to_config()` from scripts/deploy.sh; remove `EXECUTION_AGENT_ARNS_JSON` passing to verification deploy
- [x] T040 [US2] Remove `EXECUTION_AGENT_ARNS_JSON` and `SLACK_SEARCH_AGENT_ARN` handling from verification-zones/verification-agent/scripts/deploy.sh; remove `executionAgentArns` CDK context parameter
- [x] T041 [US2] Update CDK stack entry point if it references `executionAgentArns`/`slackSearchAgentArn` props from context in verification-zones/verification-agent/cdk/

**Checkpoint**: Execution agent deploy scripts self-register in S3 (each writes only its own file). Verification agent CDK creates S3 bucket and reads from it. Root deploy no longer assembles ARN JSON.

---

## Phase 5: User Story 3 — デプロイ後のアドホック登録 (Priority: P3)

**Goal**: Developers can add/remove agents by uploading/deleting individual JSON files in S3 without redeploying VerificationAgent.

**Independent Test**: Manually upload a new agent JSON file to S3, trigger VerificationAgent restart, verify agent appears in registry.

### Implementation for User Story 3

> **No new code needed** — this capability is inherent in the per-agent file design from US1 (`refresh_registry()` re-reads the S3 prefix). This phase validates the behavior.

- [x] T042 [US3] Write test for `refresh_registry()`: new agent file added to S3 after initial load → appears in registry after refresh in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T043 [US3] Write test for `refresh_registry()`: agent file removed from S3 → disappears from registry after refresh in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T044 [US3] Run tests T042–T043 and confirm pass in verification-zones/verification-agent/

**Checkpoint**: Ad-hoc registration works via S3 file upload/delete + refresh_registry(). No VerificationAgent redeploy required.

---

## Phase 6: User Story 4 — SlackSearch agent の統合管理 (Priority: P3)

**Goal**: SlackSearch agent registered in the same S3 registry, removing the separate `SLACK_SEARCH_AGENT_ARN` env var.

**Independent Test**: Deploy SlackSearch, verify `slack-search.json` exists in S3 registry prefix alongside other agents.

### Tests for User Story 4

- [x] T045 [P] [US4] Write test verifying SlackSearch agent is loaded from S3 registry same as execution agents (no special-case code) in verification-zones/verification-agent/tests/test_agent_registry.py

### Implementation for User Story 4

- [x] T046 [US4] Add `register_agent_in_s3()` function to verification-zones/slack-search-agent/scripts/deploy.sh — writes to `{env}/agent-registry/slack-search.json`
- [x] T047 [US4] Remove any special-case handling for `SLACK_SEARCH_AGENT_ARN` env var in verification-zones/verification-agent/src/ (search all src/ files for references)
- [x] T048 [US4] Run test T045 and full test suite in verification-zones/verification-agent/

**Checkpoint**: SlackSearch managed identically to all other agents via S3 per-agent file. No separate env var.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, deploy script cleanup, and final validation

- [x] T049 [P] Add CHANGELOG.md `[Unreleased]` entry under `Changed` for S3 agent registry migration
- [x] T050 [P] Update CLAUDE.md "Active Technologies" (add S3 agent registry) and "Recent Changes"
- [x] T051 [P] Update verification-zones/verification-agent/README.md configuration section (env vars changed)
- [x] T052 [P] Update scripts/README.md deploy workflow description (S3 self-registration replaces ARN handoff)
- [x] T053 Remove old test cases referencing `discover_agent_card` mock and `EXECUTION_AGENT_ARNS` env var in verification-zones/verification-agent/tests/test_agent_registry.py
- [x] T054 Run full test suite across all affected zones: verification-agent (pytest + CDK Jest)
- [x] T055 Validate quickstart.md commands work against deployed S3 registry

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — verify immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — core S3 reader integration
- **Phase 4 (US2)**: Depends on Phase 2 — can run in PARALLEL with Phase 3
- **Phase 5 (US3)**: Depends on Phase 3 (uses `refresh_registry()`)
- **Phase 6 (US4)**: Depends on Phase 4 (deploy script pattern established)
- **Phase 7 (Polish)**: Depends on all user stories complete

### User Story Dependencies

```
Phase 2 (Foundational)
├── Phase 3 (US1: S3 reader) ──── Phase 5 (US3: ad-hoc registration)
└── Phase 4 (US2: CDK + deploy scripts) ── Phase 6 (US4: SlackSearch)
                                         └── Phase 7 (Polish)
```

- **US1 + US2**: Can proceed in parallel after Phase 2
- **US3**: Depends on US1 (needs `refresh_registry()`)
- **US4**: Depends on US2 (needs deploy script pattern)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation in logical order (models → functions → integration)
- Story complete before checkpoint

### Parallel Opportunities

- T002–T008: All foundational tests can run in parallel (same file, different test functions)
- T012–T017: All US1 tests can run in parallel
- T025–T029: All CDK tests can run in parallel
- T035–T038: All execution agent deploy scripts can be updated in parallel (different files)
- T049–T052: All documentation updates can run in parallel (different files)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all foundational tests in parallel:
Task: "Write test for AgentSkill Pydantic model validation"
Task: "Write test for AgentRegistryEntry Pydantic model validation"
Task: "Write test for _load_from_s3(): ListObjectsV2 + GetObject valid files"
Task: "Write test for _load_from_s3(): no files in prefix"
Task: "Write test for _load_from_s3(): invalid agent files"
Task: "Write test for _load_from_s3(): ListObjectsV2 exception"
Task: "Write test for _load_from_s3(): individual GetObject failure"

# Then implement (sequential):
Task: "Add Pydantic models"
Task: "Implement _load_from_s3()"
Task: "Run all tests"
```

## Parallel Example: Phase 4 (US2 CDK + Deploy Scripts)

```bash
# CDK changes first (sequential within CDK):
Task: "Create S3 bucket in CDK"
Task: "Update verification-agent-runtime.ts env vars"
Task: "Update verification-agent-runtime.ts IAM"
Task: "Run CDK tests"

# Then all deploy scripts in parallel:
Task: "Add register_agent_in_s3() to time-agent deploy → time.json"
Task: "Add register_agent_in_s3() to docs-agent deploy → docs.json"
Task: "Add register_agent_in_s3() to fetch-url-agent deploy → fetch-url.json"
Task: "Add register_agent_in_s3() to file-creator-agent deploy → file-creator.json"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup verification
2. Complete Phase 2: Pydantic models + S3 reader
3. Complete Phase 3: US1 — S3-based initialization
4. **STOP and VALIDATE**: Manually upload per-agent JSON files to S3, deploy VerificationAgent, confirm no cascade
5. Proceed to remaining stories

### Incremental Delivery

1. Phase 2 → Foundation ready (Pydantic + S3 reader tested)
2. Phase 3 (US1) → S3 reader integrated (MVP — cascade eliminated)
3. Phase 4 (US2) → CDK creates S3 bucket + deploy scripts self-register (automation)
4. Phase 5 (US3) → Ad-hoc registration validated
5. Phase 6 (US4) → SlackSearch unified
6. Phase 7 → Docs and cleanup

---

## Notes

- [P] tasks = different files or independent test functions, no dependencies
- Constitution Principle II (TDD): ALL test tasks MUST fail before corresponding implementation
- Constitution Principle VII: No spec numbers, branch names, or task IDs in source code
- Pydantic models ensure type safety at both read (S3 → Python) and write (deploy → S3) boundaries
- `get_all_cards()` must return `dict` (not Pydantic model) for backward compatibility with `agent_tools.py`
- Per-agent S3 files (`{agent-id}.json`) — each deploy writes only its own file, no read-modify-write needed
- Agent-id derived from filename (e.g., `time.json` → `"time"`)
- Deploy scripts use direct `PutObject` — atomic, no merge logic, concurrent-safe
