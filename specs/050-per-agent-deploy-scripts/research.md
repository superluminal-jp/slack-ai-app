# Research: Per-Agent Deploy Script Consolidation

## Current State Analysis

### Per-agent scripts (all 6 zones)

All six `<zone>/scripts/deploy.sh` files exist with consistent structure. Key gaps identified by comparing against the main `scripts/deploy.sh`:

| Capability | file-creator | docs | time | fetch-url | slack-search | verification |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| `npm install --prefix "${CDK_DIR}"` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `cdk deploy --force` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `--outputs-file` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (partial) |
| Accept `EXECUTION_AGENT_ARNS_JSON` | N/A | N/A | N/A | N/A | N/A | ❌ |
| Accept `SLACK_SEARCH_AGENT_ARN` | N/A | N/A | N/A | N/A | N/A | ❌ |

All scripts install CDK CLI only if the binary is absent — they do NOT install zone-local `node_modules`. This is the root cause of the wrong-CDK-app bug: when `node_modules` is absent, `npx ts-node` falls back to a parent workspace binary and loads the wrong CDK app.

### Main orchestrator (`scripts/deploy.sh`)

Does not call any per-agent scripts. Duplicates CDK invocation logic for all 6 zones. Also handles:
- Preflight Verification deploy (breaks cross-stack import cycles)
- ARN reads via CloudFormation outputs after each execution zone
- ARN passing to Verification zone via CDK `--context executionAgentArns=...`
- `--outputs-file` temp files for each zone
- `--force-rebuild` propagation
- Post-deploy: resource policy, AgentCore readiness polling

---

## Decision Log

### D-001: npm install strategy

**Decision**: Each per-agent script checks whether `${CDK_DIR}/node_modules` exists. If absent, it runs `npm install --prefix "${CDK_DIR}"` before invoking CDK. The project-root fallback for the CDK binary remains as a secondary fallback.

**Rationale**: Zone-local `node_modules` ensures each CDK app runs with its own resolved TypeScript dependencies, preventing cross-zone contamination. The project-root fallback handles monorepo setups where CDK is hoisted but `ts-node` resolution still needs the zone-local `node_modules` for TypeScript imports.

**Alternative rejected**: Install only at project root (`npm install --prefix "${PROJECT_ROOT}"`). Rejected because hoisting does not guarantee that `ts-node` can resolve zone-local TypeScript path aliases and imports at compile time.

---

### D-002: ARN handoff from execution zones to verification zone

**Decision**: The main orchestrator reads ARNs from CloudFormation stack outputs after each per-agent execution-zone script completes, using the existing `get_stack_output` helper. ARNs are then passed to the verification per-agent script via environment variables.

**Rationale**: This keeps per-agent script interfaces simple (no structured stdout required) and avoids coupling the main orchestrator to output file formats. CloudFormation outputs are the authoritative source of truth for deployed ARNs.

**Alternative rejected**: Have per-agent scripts write ARNs to a temp file or emit structured JSON to stdout. Rejected due to added complexity and fragility (temp file cleanup, stdout pollution from CDK output).

---

### D-003: Verification script ARN input interface

**Decision**: The verification per-agent script accepts `EXECUTION_AGENT_ARNS_JSON` (JSON string) and `SLACK_SEARCH_AGENT_ARN` as environment variables. It passes them to CDK via `--context`. If `EXECUTION_AGENT_ARNS_JSON` is not set, the script reads the current values from its CDK config file (existing fallback).

**Rationale**: Environment variables keep the standalone-usage interface simple. The config-file fallback preserves backward compatibility with the existing standalone workflow.

**Alternative rejected**: Accept ARNs as positional arguments. Rejected because positional arguments are harder to pass selectively and break the existing single-flag interface (`--force-rebuild`).

---

### D-004: Preflight Verification deploy

**Decision**: The main orchestrator retains the preflight logic. It reads current ARNs from CloudFormation, sets `EXECUTION_AGENT_ARNS_JSON` and `SLACK_SEARCH_AGENT_ARN` as env vars, and calls the verification per-agent script. This is identical to the main verification deploy path — just with stale ARNs from CloudFormation rather than freshly deployed ones.

**Rationale**: Reusing the same per-agent script for both preflight and main verification deploys eliminates duplicate CDK invocations and ensures consistent behavior.

---

### D-005: `cdk deploy --force` in per-agent scripts

**Decision**: Add `--force` to all `cdk deploy` calls in per-agent scripts, consistent with the change already made in the main orchestrator.

**Rationale**: Ensures re-deployments work even when CDK detects no diff, which is important for force-rebuild scenarios and first-time deploys with existing stacks.

---

### D-006: TDD approach for shell scripts

**Decision**: Shell script changes are validated using `bash -n` (syntax check) and `shellcheck` (static analysis) as the "test first" step. Since shell scripts cannot be unit-tested without real AWS infrastructure, integration tests are performed by dry-running against a dev environment with `DEPLOYMENT_ENV=dev`.

**Rationale**: The constitution's TDD mandate requires tests to fail before implementation. For shell scripts, syntax errors and `shellcheck` violations serve as the failing test. Running `shellcheck` before writing the new logic satisfies the Red phase; fixing the script to pass satisfies Green.

**Alternative rejected**: BATS (Bash Automated Testing System). Rejected because it requires additional tooling not present in the project and adds setup overhead for what are ultimately integration-level scripts.
