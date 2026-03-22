# Implementation Plan: Per-Agent Deploy Script Consolidation

**Branch**: `050-per-agent-deploy-scripts` | **Date**: 2026-03-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/050-per-agent-deploy-scripts/spec.md`

## Summary

Standardise the six existing per-agent deploy scripts so each is fully self-contained (auto-installs CDK deps, uses `--force`, passes its own ARN context), then refactor `scripts/deploy.sh` to delegate CDK invocations to those scripts rather than duplicating the logic. The main orchestrator retains preflight, ARN reads from CloudFormation, post-deploy diagnostics, and `--force-rebuild` propagation.

## Technical Context

**Language/Version**: Bash 5.x (deploy scripts), TypeScript 5.x (CDK apps — no changes needed)
**Primary Dependencies**: aws-cdk-lib 2.215.0 (existing), npm (workspace root), jq, aws CLI, shellcheck (validation)
**Storage**: N/A (scripts only — no storage changes)
**Testing**: `bash -n` (syntax check), `shellcheck` (static analysis) as Red phase; integration test against dev environment as Green phase
**Target Platform**: macOS/Linux (developer machines and CI)
**Project Type**: Deployment tooling / CLI scripts
**Performance Goals**: No regression in total deploy wall-clock time
**Constraints**: Must preserve existing deployment order; must not break standalone per-agent script interface; backward-compatible env var interface
**Scale/Scope**: 6 agent zones, 2 script files changed per zone (per-agent + main orchestrator)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | ✅ PASS | spec.md exists with Given/When/Then criteria |
| II. Test-Driven Development | ✅ PASS | shellcheck + bash -n serve as failing tests before implementation (see D-006 in research.md) |
| III. Security-First | ✅ PASS | No changes to security pipeline; scripts do not handle secrets differently |
| IV. Fail-Open/Fail-Closed | ✅ PASS | Error handling patterns preserved; non-zero exit on failure |
| V. Zone-Isolated Architecture | ✅ PASS | Per-agent scripts respect zone boundaries; no cross-zone imports |
| VI. Documentation & Deploy-Script Parity | ✅ PASS | README, CHANGELOG, CLAUDE.md updates planned as part of implementation |
| VII. Clean Code Identifiers | ✅ PASS | No spec numbers or branch names in scripts |

## Project Structure

### Documentation (this feature)

```text
specs/050-per-agent-deploy-scripts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # N/A — no data entities (omitted)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (affected files)

```text
execution-zones/
  file-creator-agent/scripts/deploy.sh   # Add npm install, --force CDK flag
  docs-agent/scripts/deploy.sh           # Add npm install, --force CDK flag
  time-agent/scripts/deploy.sh           # Add npm install, --force CDK flag
  fetch-url-agent/scripts/deploy.sh      # Add npm install, --force CDK flag

verification-zones/
  slack-search-agent/scripts/deploy.sh   # Add npm install, --force CDK flag
  verification-agent/scripts/deploy.sh   # Add npm install, --force CDK flag,
                                         # accept EXECUTION_AGENT_ARNS_JSON +
                                         # SLACK_SEARCH_AGENT_ARN env vars

scripts/deploy.sh                        # Refactor cmd_deploy to call per-agent scripts;
                                         # remove direct CDK invocations for delegated zones

scripts/README.md                        # Update deployment section

CHANGELOG.md                             # [Unreleased] entry
CLAUDE.md                                # Recent Changes section
```

**Structure Decision**: All changes are within existing files. No new files are created (data-model.md omitted — feature involves no data entities).

## Design: Per-Agent Script Changes

### Execution agents (file-creator, docs, time, fetch-url) and slack-search

Each script gains two changes:

1. **npm install guard** — before CDK invocation:
   ```bash
   if [[ ! -d "${CDK_DIR}/node_modules" ]]; then
       log_info "Installing CDK dependencies for this zone..."
       npm install --prefix "${CDK_DIR}"
   fi
   ```

2. **`--force` CDK flag** — added to the `cdk deploy` call:
   ```bash
   "${CDK_CLI}" deploy "${STACK_NAME}" \
       --require-approval never --force \
       ...
   ```

### Verification agent script

In addition to the above two changes, the verification script accepts two new optional env vars to support being called by the main orchestrator:

- `EXECUTION_AGENT_ARNS_JSON` — JSON string of `{ "file-creator": "arn:...", ... }`, passed as `--context executionAgentArns=...` to CDK
- `SLACK_SEARCH_AGENT_ARN` — passed as CDK env var `SLACK_SEARCH_AGENT_ARN=...`

If `EXECUTION_AGENT_ARNS_JSON` is unset, the script falls back to reading `executionAgentArns` from `cdk.config.${DEPLOYMENT_ENV}.json` (existing behavior for standalone use).

## Design: Main Orchestrator Refactor

`cmd_deploy` in `scripts/deploy.sh` replaces each inline CDK block with a call to the corresponding per-agent script:

```bash
# Phase 1 — was: ( cd "${EXEC_CDK_DIR}" && "${CDK_CLI}" deploy ... )
# Now:
"${PROJECT_ROOT}/execution-zones/file-creator-agent/scripts/deploy.sh" ${force_rebuild_flag} \
    || { log_error "Failed to deploy File Creator Agent"; exit 1; }
exec_arn=$(get_stack_output "${EXEC_STACK}" "FileCreatorAgentRuntimeArn")
```

The `--force-rebuild` flag is translated: when set, each call passes `--force-rebuild` as an argument to the per-agent script.

The preflight Verification deploy is preserved:

```bash
EXECUTION_AGENT_ARNS_JSON="${preflight_execution_agent_arns_json}" \
SLACK_SEARCH_AGENT_ARN="${pre_slack_search_arn:-}" \
"${PROJECT_ROOT}/verification-zones/verification-agent/scripts/deploy.sh" \
    || { log_error "Preflight failed"; exit 1; }
```

Post-deploy diagnostics (resource policy, AgentCore readiness polling, `--outputs-file` for Verification URL) remain inline in `scripts/deploy.sh`.

## Complexity Tracking

No constitution violations. No complexity justification needed.
