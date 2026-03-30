# Implementation Plan: Exclude Time and Web Fetch from Default Deployment

**Branch**: `057-exclude-time-fetch-deploy` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/057-exclude-time-fetch-deploy/spec.md`

## Summary

Stop including the **Time** and **Web Fetch** execution agents in the **standard** unified deployment (`scripts/deploy.sh deploy`). Operators retain per-zone deploy scripts for explicit opt-in. The verification CDK config must persist **only** the execution ARNs that remain in scope (File Creator, Docs), **omit** `time` and `fetch-url` keys, and the DynamoDB agent registry must **not** retain `time` / `fetch-url` items after a standard run so the assistant does not load those skills. Documentation and diagnostics (`README`, `CHANGELOG`, `CLAUDE.md`, deploy help text, phase summaries) must match the new default.

## Technical Context

**Language/Version**: Bash 5.x (unified deploy), TypeScript 5.x (CDK unchanged structurally), Python 3.11 (verification agent — likely no logic change if registry is clean)  
**Primary Dependencies**: `aws` CLI, `jq`, existing CDK config pattern, DynamoDB agent-registry table (existing)  
**Storage**: DynamoDB agent registry (existing; delete items for `time`, `fetch-url`); verification `cdk.config.<env>.json` (`executionAgentArns`)  
**Testing**: Extend or add tests for deploy helpers; `pytest` for verification-agent if Python changes; `shellcheck` on `scripts/deploy.sh` where applicable  
**Target Platform**: AWS (Bedrock AgentCore); standard deploy no longer provisions two execution runtimes  
**Project Type**: Multi-zone Slack AI system — deploy orchestration change  
**Constraints**: Security pipeline unchanged; fail-open/fail-closed rules unchanged; zone isolation preserved  
**Scale/Scope**: Two agents removed from default path; subcommands (`status`, `logs`) may still reference legacy stacks if present  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. SDD | PASS | Traceability: spec → this plan → tasks → implementation |
| II. TDD | PASS | Tests for jq/bash helpers and any new delete logic before or with implementation |
| III. Security-First | PASS | Removing Web Fetch reduces arbitrary URL retrieval from default posture; no bypass of existence/whitelist/rate limit |
| IV. Fail-Open/Closed | PASS | Registry delete failures: treat as infrastructure — log and follow existing fail-open policy for non-blocking deploy steps; do not weaken security checks |
| V. Zone Isolation | PASS | No verification-zone import of execution code; only deploy orchestration and registry data change |
| VI. Docs & Deploy Parity | PASS | **Same PR** updates `scripts/deploy.sh`, `README.md` / `README.ja.md`, zone READMEs if deploy order changes, `CHANGELOG.md`, `CLAUDE.md`. Principle VI “unified deploy covers zones” means the script reflects **intended** product deployment; optional agents are documented with per-zone scripts (see Complexity note below). |
| VII. Clean Code IDs | PASS | No spec numbers or branch names in code/comments |

**Post-design re-check**: Research decisions in `research.md` resolve all technical unknowns; no outstanding NEEDS CLARIFICATION.

## Project Structure

### Documentation (this feature)

```text
specs/057-exclude-time-fetch-deploy/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── deploy-config-execution-agent-arns.md
└── tasks.md             # Phase 2 (/speckit.tasks — not created by this command)
```

### Source code (repository root — files to touch)

```text
scripts/deploy.sh                          # PRIMARY: remove Time/Web Fetch phases; empty ARNs; registry deletes; renumber phases; preflight
scripts/                                   # Optional: tests or helper for jq/registry (if extracted)
verification-zones/verification-agent/   # README / docs only unless runtime filter needed (prefer registry-only)
execution-zones/time-agent/README.md       # Note: optional deploy path
execution-zones/fetch-url-agent/README.md  # Note: optional deploy path + security
README.md, README.ja.md, CHANGELOG.md, CLAUDE.md
docs/developer/quickstart.md               # If deploy phases documented
```

**Structure Decision**: Single orchestration change at repo root plus documentation; per-agent CDK apps remain but are not invoked by default.

## Key Implementation Details

### 1. Unified `cmd_deploy` — remove two phases

- Delete or skip the blocks that invoke `execution-zones/time-agent/scripts/deploy.sh` and `execution-zones/fetch-url-agent/scripts/deploy.sh`.
- Set `time_arn=""` and `fetch_arn=""` for all `save_execution_agent_arns_to_config` calls in this subcommand, including **preflight** (see Research Decision 3), so `time` / `fetch-url` keys are not written to `executionAgentArns`.
- Renumber phase labels (e.g. six phases total: File Creator → Docs → Slack Search → Verification → resource policy → validation).

### 2. DynamoDB registry cleanup

- After verification deploy (or tied step with table resolution consistent with `AGENT_REGISTRY_TABLE` / stack output), delete items with `agent_id` ∈ `{time, fetch-url}` for the current `env` partition.
- Idempotent: success if item already absent.

### 3. Resource policy and AgentCore validation

- Existing `[[ -n "${time_arn}" ]]` / `[[ -n "${fetch_arn}" ]]` guards should skip Time and Web Fetch when ARNs are empty.
- `wait_for_agent_ready` and `verify_agent_card_runtime` must not run for Time/Web Fetch when excluded.

### 4. Diagnostics subcommands

- `cmd_status`, `cmd_logs`, `check-access` (and similar): ensure they do not **require** Time/Web Fetch stacks to exist; keep best-effort when stacks are present for legacy accounts.

### 5. Documentation

- State practical and security rationale (per FR-004).
- Document optional per-zone deploy for Time and Web Fetch.

### 6. Tests

- Cover `build_execution_agent_arns_json` with empty time/fetch.
- Add tests for any new bash functions or document manual verification steps if automation is not feasible (prefer automation per constitution).

## Complexity Tracking

| Topic | Why needed | Simpler alternative rejected because |
|-------|------------|-------------------------------------|
| Principle VI wording | “Unified deploy covers all zones” could be read as “every agent zone every time” | **Product default** is a subset of available zones; constitution intent is parity between code and docs. Optional agents are still “covered” by the repo via per-zone `scripts/deploy.sh` and this plan explicitly documents that split. |

> No exception to core security or zone-isolation principles.

## Phase 0 Research

**Output**: `research.md` — all decisions recorded; no NEEDS CLARIFICATION remaining.

## Phase 1 Design

**Outputs**:

- `data-model.md` — registry + config semantics
- `contracts/deploy-config-execution-agent-arns.md` — `executionAgentArns` shape
- `quickstart.md` — operator steps

**Agent context**: Run `.specify/scripts/bash/update-agent-context.sh cursor-agent` after updating this plan.
