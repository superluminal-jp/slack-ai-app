<!--
Sync Impact Report
==================
Version change: (none) → 1.0.0 (initial ratification)
Modified principles: N/A (first version)
Added sections: Core Principles, Technical Standards, Development Workflow, Governance
Removed sections: N/A
Templates requiring updates:
  ✅ plan-template.md — Constitution Check section references these principles
  ✅ spec-template.md — User stories and acceptance criteria align with TDD principle
  ✅ tasks-template.md — Phase structure and test-first ordering align with TDD principle
Follow-up TODOs: none
-->

# Slack AI App Constitution

## Core Principles

### I. Spec-First

Every code modification MUST begin with a written specification that defines acceptance
criteria before any implementation starts. The specification is the contract; the
implementation fulfills it.

**Non-negotiable rules**:
- No pull request may be opened without a corresponding spec in `specs/`.
- Acceptance criteria in the spec MUST be verifiable (Given/When/Then form).
- Ambiguities MUST be resolved via `/speckit.clarify` before planning begins.

**Rationale**: Eliminates rework caused by misunderstood requirements and provides
traceability from user need to merged code.

### II. Test-Driven Development (NON-NEGOTIABLE)

For every code change, tests MUST be written (or updated) first, confirmed failing,
then implementation written to pass. The Red → Green → Refactor cycle is mandatory.

**Non-negotiable rules**:
- Tests MUST exist and MUST fail before implementation begins.
- Each task that touches production code MUST include a corresponding test task.
- Refactor phase MUST keep all tests green.
- Test commands: `python -m pytest tests/ -v` per agent zone.

**Rationale**: Catches regressions immediately, documents expected behavior, and
forces interface design before implementation.

### III. Security-First

This system processes Slack user messages and invokes AWS Bedrock. Every feature MUST
preserve the multi-layered defense pipeline: existence check → whitelist → rate limit →
execution. No layer may be bypassed or weakened.

**Non-negotiable rules**:
- Security checks (existence, whitelist, rate limit) MUST execute before any AI
  invocation or Slack reply.
- AWS credentials MUST use least-privilege IAM; no wildcard resource policies.
- All external inputs (Slack payloads) MUST be validated before processing.
- Secrets MUST NOT be committed to source control.

**Rationale**: The system operates in enterprise Slack workspaces where unauthorized
access or data leakage has direct business and compliance impact.

### IV. Fail-Open for Infrastructure, Fail-Closed for Security

Infrastructure failures (agent card discovery, rate limit DynamoDB errors, S3 upload
issues) MUST fail open — allowing the pipeline to continue serving users. Security
check failures MUST fail closed — blocking the request.

**Non-negotiable rules**:
- Any `except` block in the security pipeline (existence check, whitelist, rate limit)
  MUST return an error response, not continue.
- Any `except` block outside the security pipeline SHOULD log a WARNING and continue
  with a safe fallback.
- All exceptions MUST be logged with `correlation_id`, `error`, and `error_type`.

**Rationale**: Balances availability (users should not be blocked by infra noise) with
security (compromised checks must never silently pass).

### V. Agent-Centric, Zone-Isolated Architecture

Each agent zone (verification, execution) is an independently deployable unit. Features
MUST respect zone boundaries. Inter-zone communication MUST use the A2A protocol
(Bedrock AgentCore `invoke_agent_runtime` + JSON-RPC 2.0).

**Non-negotiable rules**:
- Verification-zone code MUST NOT import or call execution-zone code directly.
- New execution capabilities MUST be added as new execution agents or new skills on
  existing agents — not as logic inside the verification agent.
- Each agent MUST expose `POST /`, `GET /ping`, and
  `GET /.well-known/agent-card.json`.

**Rationale**: Zone isolation enables independent scaling, deployment, and failure
containment. The A2A protocol provides a stable inter-zone contract.

## Technical Standards

**Runtime**: Python 3.11 (`python:3.11-slim`, ARM64 container)
**Frameworks**: FastAPI + uvicorn (agents), Strands Agents `~=1.25.0` (LLM orchestration)
**IaC**: AWS CDK v2 (TypeScript 5.x), one CDK app per agent zone
**AI Platform**: Amazon Bedrock (model IDs via environment variables — never hardcoded)
**Storage**: DynamoDB (dedupe, whitelist, rate_limit, existence_check_cache), S3
  (temporary file exchange)
**Inter-agent protocol**: JSON-RPC 2.0 over Bedrock AgentCore `invoke_agent_runtime`
  with AWS SigV4 authentication
**Dependency pinning**: `~=` (compatible release) in `requirements.txt`
**Linting**: `ruff check .` from `src/`

## Development Workflow

1. **Specify** — `/speckit.specify`: define user stories with Given/When/Then criteria
2. **Clarify** — `/speckit.clarify`: resolve ambiguities before planning
3. **Plan** — `/speckit.plan`: identify affected files, contracts, data model
4. **Tasks** — `/speckit.tasks`: decompose into atomic tasks; test tasks precede
   implementation tasks
5. **Implement** — `/speckit.implement`: Red → Green → Refactor per task
6. **Validate** — `/speckit.checklist`: confirm spec criteria met, docs updated,
   CHANGELOG entry added

**Spec numbering rule**: Each feature MUST use the next globally-available sequential
number across ALL `specs/` directories. Before running `/speckit.specify`, determine the
correct number by running:
```bash
ls specs/ | grep -E '^[0-9]+' | sed 's/-.*//' | sort -n | tail -1
```
Then use N+1. The `/speckit.specify` `--number` flag MUST be set explicitly to this
value. Do not rely on the script's auto-detection, which only searches by short-name.

**Deploy order**: execution zones → verification zone
(`./scripts/deploy/deploy-all.sh`)

## Governance

This constitution supersedes all other practices within this repository.
Amendments require:
1. A PR updating this file with a version bump (SemVer: MAJOR/MINOR/PATCH).
2. A Sync Impact Report (HTML comment at top) listing changed principles and affected
   templates.
3. Dependent templates (`.specify/templates/`) updated in the same PR.

**Compliance review**: Every PR description MUST include a "Constitution Check" section
confirming no principle is violated. If a violation is necessary, it MUST be justified
in the Complexity Tracking table of `plan.md`.

**Version policy**:
- MAJOR: principle removed or fundamentally redefined
- MINOR: principle added or materially expanded
- PATCH: wording clarification, typo fix

For runtime development guidance, see `CLAUDE.md` and `.claude/rules/`.

**Version**: 1.0.1 | **Ratified**: 2026-02-20 | **Last Amended**: 2026-02-20
