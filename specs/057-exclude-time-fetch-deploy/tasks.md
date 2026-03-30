# Tasks: Exclude Time and Web Fetch from Default Deployment

**Input**: Design documents from `/Users/taikiogihara/work/slack-ai-app/specs/057-exclude-time-fetch-deploy/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Included per constitution (TDD): failing test for deploy JSON helper before implementation; verification-agent pytest after routing check.

**Organization**: Tasks grouped by user story (US1 P1 → US2 P2 → US3 P3) plus setup, foundation, and polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story label `[US1]`, `[US2]`, `[US3]` only on story-phase tasks
- Exact file paths in every task description

---

## Phase 1: Setup

**Purpose**: Lock acceptance criteria and registry integration points before editing code.

- [x] T001 Review `specs/057-exclude-time-fetch-deploy/plan.md` and `specs/057-exclude-time-fetch-deploy/contracts/deploy-config-execution-agent-arns.md` and list concrete edit points in `scripts/deploy.sh` (preflight, phases, registry delete, validation, summary)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm CDK outputs and table naming for DynamoDB delete-item; no user story work until complete.

**⚠️ CRITICAL**: User story implementation must not start until T002 completes.

- [x] T002 Verify CloudFormation output key for agent registry table name in `verification-zones/verification-agent/cdk/lib/verification-stack.ts` (and any `CfnOutput` used by deploy scripts) matches how `scripts/deploy.sh` will resolve the table for `delete-item` on `agent_id` `time` and `fetch-url`

**Checkpoint**: Table name resolution path is known — proceed to User Story 1.

---

## Phase 3: User Story 1 — Standard deployment omits Time and Web-fetch (Priority: P1) 🎯 MVP

**Goal**: Unified deploy does not provision Time or Web Fetch; config omits those ARNs; registry rows removed; validation skips excluded agents.

**Independent Test**: Run `DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy` (or dry review) and confirm no Time/Web Fetch phases; `executionAgentArns` has no `time`/`fetch-url`; DynamoDB has no `time`/`fetch-url` items for the env after run.

### Tests for User Story 1 (TDD)

> Write and run **before** implementation tasks T004–T007; expect RED until `scripts/deploy.sh` is updated.

- [x] T003 [US1] Add `tests/scripts/test_execution_agent_arns_json.sh` that exercises the same `jq` construction as `build_execution_agent_arns_json` in `scripts/deploy.sh` and asserts the JSON object has **no** `time` or `fetch-url` keys when third and fourth ARN arguments are empty strings

### Implementation for User Story 1

- [x] T004 [US1] Update preflight block in `cmd_deploy` in `scripts/deploy.sh` to pass empty strings for Time and Web Fetch ARNs into `save_execution_agent_arns_to_config` (so preflight does not reintroduce `time`/`fetch-url` keys when legacy stacks still exist)
- [x] T005 [US1] Remove `execution-zones/time-agent/scripts/deploy.sh` and `execution-zones/fetch-url-agent/scripts/deploy.sh` invocations from `cmd_deploy` in `scripts/deploy.sh`; set `time_arn=""` and `fetch_arn=""` for the main `save_execution_agent_arns_to_config` call; renumber user-visible deploy phase labels (e.g. six phases)
- [x] T006 [US1] After verification stack deploy in `cmd_deploy`, add idempotent `aws dynamodb delete-item` (or equivalent) for items with `agent_id` `time` and `fetch-url` under the current registry `env` in `scripts/deploy.sh` using the table name from T002; failures must log WARNING and not fail closed the security pipeline
- [x] T007 [US1] Ensure resource-policy loop and Phase 8 `wait_for_agent_ready` / `verify_agent_card_runtime` / summary output in `scripts/deploy.sh` skip Time and Web Fetch when ARNs are empty

### Validation for User Story 1

- [x] T008 [US1] Run `bash tests/scripts/test_execution_agent_arns_json.sh` until GREEN; align `scripts/deploy.sh` `build_execution_agent_arns_json` with test if drift occurs

**Checkpoint**: User Story 1 acceptance scenarios in `specs/057-exclude-time-fetch-deploy/spec.md` are satisfied for deploy orchestration and registry data.

---

## Phase 4: User Story 2 — End users not exposed to excluded capabilities (Priority: P2)

**Goal**: Default assistant behavior does not invoke Time or Web-fetch when not in registry/config.

**Independent Test**: `python -m pytest verification-zones/verification-agent/tests/ -v` passes; manual Slack check optional per `specs/057-exclude-time-fetch-deploy/quickstart.md`.

- [x] T009 [US2] Confirm routing uses DynamoDB registry only: review `verification-zones/verification-agent/src/pipeline.py` and `verification-zones/verification-agent/src/orchestrator.py` for hardcoded dispatch to `time` or `fetch-url`; implement minimal change only if a gap is found (prefer no Python change when registry items are absent)
- [x] T010 [US2] Run `cd verification-zones/verification-agent && python -m pytest tests/ -v` and fix regressions tied to this feature

**Checkpoint**: User Story 2 spec acceptance holds under default configuration.

---

## Phase 5: User Story 3 — Clear rationale and boundaries for operators (Priority: P3)

**Goal**: Documentation explains practical and security reasons and optional per-zone deploy.

**Independent Test**: New operator can read repo docs and understand default vs optional agents without reading `scripts/deploy.sh`.

- [x] T011 [P] [US3] Update `README.md` and `README.ja.md`: standard deploy excludes Time and Web Fetch; link or describe optional `execution-zones/time-agent/scripts/deploy.sh` and `execution-zones/fetch-url-agent/scripts/deploy.sh`
- [x] T012 [P] [US3] Update `execution-zones/time-agent/README.md` and `execution-zones/fetch-url-agent/README.md` with explicit “optional — not part of default unified deploy” and Web Fetch security caution
- [x] T013 [US3] Update `docs/developer/quickstart.md` if it documents unified deploy phases including Time or Web Fetch as mandatory
- [x] T014 [US3] Add `CHANGELOG.md` `[Unreleased]` entry and update `CLAUDE.md` Active Technologies / Recent Changes for deploy behavior

**Checkpoint**: User Story 3 documentation acceptance met.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Diagnostics parity, spec quickstart sync, static analysis.

- [x] T015 [P] Update `specs/057-exclude-time-fetch-deploy/quickstart.md` if final `scripts/deploy.sh` commands or phase count differ from the draft
- [x] T016 [P] Update `cmd_status`, `cmd_logs`, and any `check-access` paths in `scripts/deploy.sh` so missing Time/Web Fetch stacks are best-effort (no hard failure when stacks were never deployed)
- [x] T017 Run `shellcheck` on `scripts/deploy.sh` and `tests/scripts/test_execution_agent_arns_json.sh`; resolve new warnings introduced by this feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Start immediately.
- **Phase 2 (Foundational)**: Depends on T001 — **blocks** all user stories.
- **Phase 3 (US1)**: Depends on T002. Order: T003 (RED) → T004–T007 → T008 (GREEN).
- **Phase 4 (US2)**: Depends on US1 complete (registry + deploy path correct).
- **Phase 5 (US3)**: Depends on US1/US2 complete or in parallel with US2 if docs-only (prefer after T010 to avoid doc churn).
- **Phase 6 (Polish)**: Depends on US1–US3 complete.

### User Story Dependencies

- **US1**: After Foundational (T002). No dependency on US2/US3.
- **US2**: After US1 (deploy + registry behavior landed).
- **US3**: Can follow US2; **T011–T012** parallel with each other after US1 story is clear.

### Parallel Opportunities

- **T011** and **T012** — different files, mark **[P]**.
- **T015** and **T016** — different concerns; **[P]** after core merge-ready.

---

## Parallel Example: User Story 3

```bash
# Documentation pass in parallel:
Task T011: README.md + README.ja.md
Task T012: execution-zones/time-agent/README.md + execution-zones/fetch-url-agent/README.md
```

---

## Parallel Example: User Story 1 (after T003)

```bash
# Implementation: T004 preflight and T005 phase removal touch same file — sequence T004 → T005 → T006 → T007 to minimize conflicts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1–2 (T001–T002).
2. T003 RED → T004–T007 → T008 GREEN.
3. Stop and validate against `specs/057-exclude-time-fetch-deploy/spec.md` US1 scenarios.

### Incremental Delivery

1. Add US2 (T009–T010) — routing verification + pytest.
2. Add US3 (T011–T014) — docs and changelog.
3. Polish (T015–T017).

---

## Notes

- Do not embed spec numbers or branch names in code or test names (constitution Principle VII).
- Registry delete is infrastructure-side: follow fail-open logging if AWS API errors (constitution Principle IV for non-security paths).

---

## Task Summary

| Phase        | Task IDs   | Count |
| ------------ | ---------- | ----- |
| Setup        | T001       | 1     |
| Foundational | T002       | 1     |
| US1          | T003–T008  | 6     |
| US2          | T009–T010  | 2     |
| US3          | T011–T014  | 4     |
| Polish       | T015–T017  | 3     |
| **Total**    |            | **17** |

| Story | Tasks | Count |
| ----- | ----- | ----- |
| US1   | T003–T008 | 6 |
| US2   | T009–T010 | 2 |
| US3   | T011–T014 | 4 |

**Format validation**: All tasks use `- [ ]`, sequential IDs `T001`–`T017`, story labels only on US1–US3 phases, `[P]` only on T011, T012, T015, T016, file paths in descriptions.
