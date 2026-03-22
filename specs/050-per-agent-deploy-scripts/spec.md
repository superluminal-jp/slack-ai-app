# Feature Specification: Per-Agent Deploy Script Consolidation

**Feature Branch**: `050-per-agent-deploy-scripts`
**Created**: 2026-03-22
**Status**: Draft
**Input**: User description: "それぞれのagentごとにデプロイスクリプトを作成して、scripts/deploy.sh はそれらを束ねて全体をデプロイするようにする"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy a single agent in isolation (Priority: P1)

An operator needs to redeploy only one agent (e.g. after changing its container image) without triggering the full multi-zone pipeline. They run the agent's own deploy script directly and get a successful, self-contained deployment.

**Why this priority**: The most immediate practical value — enables targeted deploys, faster iteration, and debugging of individual agents without side effects on other zones.

**Independent Test**: Run one agent's deploy script standalone (e.g. `DEPLOYMENT_ENV=dev ./execution-zones/file-creator-agent/scripts/deploy.sh`) and confirm the stack deploys successfully with no dependency on the other agents or the main orchestrator.

**Acceptance Scenarios**:

1. **Given** `node_modules` is absent in the agent's CDK directory, **When** the per-agent deploy script is run, **Then** dependencies are installed automatically before CDK is invoked.
2. **Given** a valid `DEPLOYMENT_ENV`, **When** the per-agent deploy script completes, **Then** the CloudFormation stack reaches a stable complete state.
3. **Given** required credentials are missing, **When** the per-agent deploy script is run for the verification agent, **Then** a clear error message is shown and the script exits non-zero before making any AWS changes.

---

### User Story 2 - Full orchestrated deploy via main deploy.sh (Priority: P2)

An operator runs the main `scripts/deploy.sh` to deploy the entire application. The main script delegates each zone to its respective per-agent script, in the correct dependency order, and passes required outputs (e.g. execution agent ARNs) between stages.

**Why this priority**: Preserves the existing full-pipeline workflow while eliminating duplicated deploy logic between the main script and per-agent scripts.

**Independent Test**: Run `DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy` and confirm all stacks are deployed in the correct order, with the verification stack receiving the correct execution agent ARNs.

**Acceptance Scenarios**:

1. **Given** all per-agent scripts are in place, **When** `./scripts/deploy.sh deploy` runs, **Then** it calls each per-agent script in order (execution zones first, verification zone last) without the main script containing any direct CDK invocations for those zones.
2. **Given** an execution zone deploy fails, **When** the main orchestrator is running, **Then** the pipeline halts immediately with a clear error message identifying which agent failed.
3. **Given** all execution zones deploy successfully, **When** the verification zone per-agent script is called, **Then** it receives the execution agent ARNs and deploys correctly.

---

### User Story 3 - Force rebuild across all agents (Priority: P3)

An operator uses `./scripts/deploy.sh deploy --force-rebuild` to force container image rebuilds for all agents. The main orchestrator propagates the force-rebuild flag to each per-agent script.

**Why this priority**: Required to preserve existing operator behavior; force-rebuild is used whenever container changes need to be picked up.

**Independent Test**: Run `DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy --force-rebuild` and confirm each agent's per-agent script triggers an image rebuild.

**Acceptance Scenarios**:

1. **Given** `--force-rebuild` is passed to the main script, **When** each per-agent script is called, **Then** each script triggers an image rebuild for its own agent only.
2. **Given** `--force-rebuild` is passed directly to an individual per-agent script, **When** that script completes, **Then** only that agent's image is rebuilt; no other zones are affected.

---

### Edge Cases

- What happens when a per-agent script is invoked while its CloudFormation stack is already in an in-progress state?
- How does the main orchestrator halt cleanly when a per-agent script fails mid-pipeline?
- What happens when the CDK CLI is absent at both the zone-local and project-root locations?
- How does the preflight Verification deploy (needed to break cross-stack import cycles) work when the verification zone has its own per-agent script?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each per-agent deploy script MUST install its CDK directory's dependencies automatically if they are absent before invoking CDK.
- **FR-002**: Each per-agent deploy script MUST accept `--force-rebuild` as an argument and apply it only to its own agent's image rebuild.
- **FR-003**: Each per-agent deploy script MUST accept all required configuration via environment variables (`DEPLOYMENT_ENV`, `AWS_REGION`, `AWS_PROFILE`, and agent-specific secrets) with a consistent interface across all agents.
- **FR-004**: Each per-agent deploy script MUST be runnable standalone without the main orchestrator and produce a complete, valid deployment of its own zone.
- **FR-005**: The main `scripts/deploy.sh` deploy command MUST delegate each zone deployment to its respective per-agent script rather than directly invoking CDK for those zones.
- **FR-006**: The main orchestrator MUST read execution agent ARNs from CloudFormation outputs after each execution-zone deploy and pass them to the verification zone per-agent script as environment variables.
- **FR-007**: The main orchestrator MUST preserve the existing deployment order: execution zones first (file-creator, docs, time, slack-search, fetch-url), verification zone last.
- **FR-008**: The main orchestrator MUST propagate `--force-rebuild` to all per-agent scripts when that flag is set.
- **FR-009**: If any per-agent script exits non-zero, the main orchestrator MUST halt immediately and report which agent failed.
- **FR-010**: The preflight Verification deploy MUST continue to work correctly — the per-agent verification script MUST accept existing ARNs via environment variables for the preflight path.

### Key Entities

- **Per-agent deploy script**: A self-contained shell script at `<zone>/scripts/deploy.sh`. Responsible for installing its own CDK dependencies, deploying its stack, and emitting key outputs (e.g. runtime ARN).
- **Main orchestrator** (`scripts/deploy.sh`): Coordinates the full pipeline by calling per-agent scripts in order, reading inter-zone ARN outputs from CloudFormation, and running post-deploy diagnostics.
- **ARN handoff**: The mechanism by which execution agent runtime ARNs are retrieved from CloudFormation after execution-zone deploys and forwarded to the verification zone as environment variables.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any single agent can be deployed in isolation by running its own deploy script, with no manual dependency setup required, regardless of initial `node_modules` state.
- **SC-002**: The full pipeline via `scripts/deploy.sh deploy` produces the same end state as before — all 6 stacks at correct versions with the verification zone holding all execution ARNs.
- **SC-003**: The main orchestrator contains zero direct CDK invocations for zones that have their own per-agent scripts; all CDK calls are encapsulated within per-agent scripts.
- **SC-004**: A pipeline failure is identifiable to the specific failing agent within one screen of terminal output, without searching log files.

## Assumptions

- All six agents already have a `scripts/deploy.sh` at their zone root. This feature standardises and enhances those scripts rather than creating them from scratch.
- The verification zone per-agent script will accept execution agent ARNs via an environment variable (e.g. `EXECUTION_AGENT_ARNS_JSON`) for compatibility with both standalone and orchestrated usage.
- The `--force` CDK flag (present in the current main orchestrator) is retained in all per-agent script CDK calls.
- Post-deploy diagnostics (`status`, `check-access`, resource policy application, AgentCore readiness polling) remain the responsibility of the main orchestrator, not individual per-agent scripts.
- The slack-search agent is treated as an optional execution zone (its ARN absence is non-fatal), consistent with current behaviour.
