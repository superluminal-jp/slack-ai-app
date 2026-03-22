# Tasks: Per-Agent Deploy Script Consolidation

**Input**: Design documents from `specs/050-per-agent-deploy-scripts/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅

**Organization**: Tasks grouped by user story; US1 (standalone per-agent scripts) must complete before US2 (orchestrator refactor) since the orchestrator calls the enhanced scripts.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (TDD Baseline)

**Purpose**: Establish the failing-test state before making changes (TDD Red phase for shell scripts per research.md D-006).

- [ ] T001 Run `shellcheck` on all six per-agent scripts and `scripts/deploy.sh`; record any pre-existing warnings as the baseline. At least the missing `--force` and `npm install` logic represents the failing acceptance criteria.

---

## Phase 2: User Story 1 — Per-Agent Scripts Self-Contained (Priority: P1)

**Goal**: Each per-agent deploy script is runnable standalone, installs its own CDK zone-local dependencies automatically, and uses `--force` on CDK deploy.

**Independent Test**: `DEPLOYMENT_ENV=dev ./execution-zones/file-creator-agent/scripts/deploy.sh` succeeds from a clean checkout with no pre-existing `node_modules` in the CDK directory.

- [ ] T002 [P] [US1] Update `execution-zones/file-creator-agent/scripts/deploy.sh`: add `npm install --prefix "${CDK_DIR}"` guard (only when `${CDK_DIR}/node_modules` is absent) and add `--force` to the `cdk deploy` call
- [ ] T003 [P] [US1] Update `execution-zones/docs-agent/scripts/deploy.sh`: add `npm install --prefix "${CDK_DIR}"` guard and `--force` to the `cdk deploy` call
- [ ] T004 [P] [US1] Update `execution-zones/time-agent/scripts/deploy.sh`: add `npm install --prefix "${CDK_DIR}"` guard and `--force` to the `cdk deploy` call
- [ ] T005 [P] [US1] Update `execution-zones/fetch-url-agent/scripts/deploy.sh`: add `npm install --prefix "${CDK_DIR}"` guard and `--force` to the `cdk deploy` call
- [ ] T006 [P] [US1] Update `verification-zones/slack-search-agent/scripts/deploy.sh`: add `npm install --prefix "${CDK_DIR}"` guard and `--force` to the `cdk deploy` call
- [ ] T007 [US1] Update `verification-zones/verification-agent/scripts/deploy.sh`: add `npm install --prefix "${CDK_DIR}"` guard, `--force` to the `cdk deploy` call, and accept `EXECUTION_AGENT_ARNS_JSON` and `SLACK_SEARCH_AGENT_ARN` environment variables — pass `EXECUTION_AGENT_ARNS_JSON` as `--context executionAgentArns=...` and `SLACK_SEARCH_AGENT_ARN` as a CDK env var; fall back to config file when `EXECUTION_AGENT_ARNS_JSON` is unset
- [ ] T008 [US1] Run `shellcheck` on all six updated per-agent scripts; confirm zero new warnings (TDD Green validation for US1)

**Checkpoint**: T002–T007 can be implemented in parallel (different files). US1 is done when T008 passes.

---

## Phase 3: User Story 2 — Main Orchestrator Delegates to Per-Agent Scripts (Priority: P2)

**Goal**: `scripts/deploy.sh cmd_deploy` calls per-agent scripts instead of invoking CDK directly; all zones deploy in correct order with ARNs passed between stages.

**Independent Test**: `DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy` runs end-to-end with zero direct `cdk deploy` calls remaining in `cmd_deploy` for zones that have per-agent scripts; verified by `grep -c 'cdk deploy' scripts/deploy.sh`.

> **⚠️ Depends on Phase 2**: The enhanced per-agent scripts (T002–T007) must be complete before these tasks.

- [ ] T009 [US2] Update `scripts/deploy.sh` `cmd_deploy`: replace the Phase 1 inline CDK block (file-creator) with a call to `execution-zones/file-creator-agent/scripts/deploy.sh`; pass `--force-rebuild` when set; read `FileCreatorAgentRuntimeArn` from CloudFormation via `get_stack_output` after the script exits
- [ ] T010 [US2] Update `scripts/deploy.sh` `cmd_deploy`: replace the Phase 2 inline CDK block (docs) with a call to `execution-zones/docs-agent/scripts/deploy.sh`; pass `--force-rebuild` when set; read `DocsAgentRuntimeArn` from CloudFormation
- [ ] T011 [US2] Update `scripts/deploy.sh` `cmd_deploy`: replace the Phase 3 inline CDK block (time) with a call to `execution-zones/time-agent/scripts/deploy.sh`; pass `--force-rebuild` when set; read `TimeAgentRuntimeArn` from CloudFormation
- [X] T012 [US2] Update `scripts/deploy.sh` `cmd_deploy`: replace the Phase 4 inline CDK block (slack-search) with a call to `verification-zones/slack-search-agent/scripts/deploy.sh`; pass `--force-rebuild` when set; read `SlackSearchAgentRuntimeArn` from CloudFormation
- [X] T013 [US2] Update `scripts/deploy.sh` `cmd_deploy`: replace the Phase 5 inline CDK block (fetch-url) with a call to `execution-zones/fetch-url-agent/scripts/deploy.sh`; pass `--force-rebuild` when set; read `WebFetchAgentRuntimeArn` from CloudFormation
- [X] T014 [US2] Update `scripts/deploy.sh` `cmd_deploy`: replace the preflight Verification CDK block with a call to `verification-zones/verification-agent/scripts/deploy.sh`, passing current (pre-update) ARNs via `EXECUTION_AGENT_ARNS_JSON` and `SLACK_SEARCH_AGENT_ARN` env vars
- [X] T015 [US2] Update `scripts/deploy.sh` `cmd_deploy`: replace the Phase 6 (main Verification) CDK block with a call to `verification-zones/verification-agent/scripts/deploy.sh`, passing newly deployed ARNs via `EXECUTION_AGENT_ARNS_JSON` and `SLACK_SEARCH_AGENT_ARN` env vars; capture `SlackEventHandlerApiGatewayUrl` and `VerificationAgentRuntimeArn` via `get_output_from_file_or_stack` or CloudFormation after the script exits
- [X] T016 [US2] Remove the execution-zone `--outputs-file` temp file declarations and `trap` cleanup for those zones from `scripts/deploy.sh` `cmd_deploy` (exec_outputs, docs_outputs, time_outputs, fetch_outputs, slack_search_outputs are no longer needed; keep verify_outputs for handler URL)
- [X] T017 [US2] Run `shellcheck` on updated `scripts/deploy.sh`; confirm zero new warnings (TDD Green validation for US2)

**Checkpoint**: T009–T015 must be sequential (all modify `cmd_deploy` in the same file). US2 is done when T017 passes and a manual `grep -c 'cdk deploy' scripts/deploy.sh` shows only non-cmd_deploy occurrences.

---

## Phase 4: User Story 3 — Force Rebuild Propagation Verification (Priority: P3)

**Goal**: Confirm `--force-rebuild` passed to `scripts/deploy.sh` is correctly forwarded to all per-agent script calls.

**Independent Test**: Inspect `scripts/deploy.sh` and confirm every per-agent script call includes the `${force_rebuild_flag}` (or equivalent) conditional argument.

> **Depends on Phase 3**: Requires T009–T015 complete.

- [X] T018 [US3] Verify `scripts/deploy.sh` `cmd_deploy`: confirm all six per-agent script call sites pass `--force-rebuild` when `force_rebuild="true"`, using a consistent pattern (e.g. `${force_rebuild:+--force-rebuild}` or equivalent); add the argument if missing from any call site

**Checkpoint**: US3 is done when T018 passes and `--force-rebuild` propagation is confirmed across all agents.

---

## Phase 5: Polish & Documentation

**Purpose**: Keep docs in sync with the new implementation (Constitution Principle VI).

- [X] T019 [P] Update `scripts/README.md`: revise the deployment section to reflect that each zone is deployed via its own per-agent script; update the Phase table in the "deploy subcommand" description
- [X] T020 [P] Update `CHANGELOG.md`: add `[Unreleased]` entry describing the refactor (per-agent delegation, automatic npm install, `--force` CDK flag)
- [X] T021 [P] Update `CLAUDE.md` "Recent Changes" section to reflect the deploy script changes for feature 050

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1 (baseline recorded)
- **Phase 3 (US2)**: Depends on Phase 2 complete (per-agent scripts must be enhanced before orchestrator calls them)
- **Phase 4 (US3)**: Depends on Phase 3 complete
- **Phase 5 (Polish)**: Can run after Phase 3 is complete (no need to wait for Phase 4)

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 1 baseline
- **US2 (P2)**: Depends on US1 complete (calls the enhanced scripts)
- **US3 (P3)**: Depends on US2 complete (propagation logic is in the orchestrator)

### Within Each Phase

- T002–T007 (US1): fully parallel — each touches a different file
- T009–T016 (US2): sequential — all modify `cmd_deploy` in `scripts/deploy.sh`
- T019–T021 (Polish): fully parallel — different files

### Parallel Opportunities

```bash
# Phase 2: launch all per-agent script updates together
Task: T002 "Update file-creator-agent/scripts/deploy.sh"
Task: T003 "Update docs-agent/scripts/deploy.sh"
Task: T004 "Update time-agent/scripts/deploy.sh"
Task: T005 "Update fetch-url-agent/scripts/deploy.sh"
Task: T006 "Update slack-search-agent/scripts/deploy.sh"
# T007 can also start in parallel but is more complex — can run alongside T002–T006

# Phase 5: documentation updates in parallel
Task: T019 "Update scripts/README.md"
Task: T020 "Update CHANGELOG.md"
Task: T021 "Update CLAUDE.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: establish baseline
2. Complete Phase 2: T002–T008 in parallel where possible
3. **STOP and VALIDATE**: Run any one per-agent script standalone against dev environment
4. Proceed to Phase 3 only after US1 is validated

### Incremental Delivery

1. Phase 1 → Phase 2 (US1): per-agent scripts work standalone ← first usable milestone
2. Phase 3 (US2): main orchestrator delegates → full pipeline works without direct CDK calls
3. Phase 4 (US3): force-rebuild propagation confirmed
4. Phase 5: docs in sync

---

## Notes

- T002–T007 each make only surgical additions to existing scripts (2–10 lines each); use targeted edits, not full rewrites
- T009–T015 replace named code blocks in `cmd_deploy`; work top-to-bottom through the function
- The `get_stack_output` and `get_output_from_file_or_stack` helpers in `scripts/deploy.sh` remain unchanged
- Post-deploy diagnostics (resource policy, AgentCore readiness polling, `status`, `check-access`) are NOT moved to per-agent scripts
- T016 removes 5 temp-file declarations; keep `verify_outputs` (used for handler URL in summary)
