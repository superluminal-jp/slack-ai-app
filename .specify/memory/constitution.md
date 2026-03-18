<!--
Sync Impact Report
==================
Version change: 1.1.0 → 1.2.0
Modified principles: N/A
Added sections:
  - Principle VII: Clean Code Identifiers (new non-negotiable)
Templates requiring updates:
  ✅ plan.md — Constitution Check section must reference Principle VII
  ✅ CLAUDE.md — Python Coding Standards section added with comment/docstring rule
Follow-up TODOs: none
-->

<!--
Sync Impact Report (previous)
==================
Version change: 1.0.1 → 1.1.0
Modified principles:
  - Principle I: renamed to "Spec-Driven Development (SDD)" for explicit labelling; content unchanged
  - Principle II: updated test-command list to include all current zones (slack-search-agent)
  - Development Workflow: added Step 7 (documentation & deploy-script sync)
  - Deploy order: updated command reference to scripts/deploy.sh
Added sections:
  - Principle VI: Documentation & Deploy-Script Parity (new non-negotiable)
Removed sections: N/A
Templates requiring updates:
  ✅ plan-template.md — Constitution Check section must reference Principle VI
  ✅ tasks-template.md — Final phase must include doc/deploy-script update tasks
Follow-up TODOs: none
-->

# Slack AI App Constitution

## Core Principles

### I. Spec-Driven Development (SDD)

Every code modification MUST begin with a written specification that defines acceptance
criteria before any implementation starts. The specification is the contract; the
implementation fulfills it. No implementation decision is made without a corresponding
spec artifact: Specify → Plan → Tasks → Implement.

**Non-negotiable rules**:
- No pull request may be opened without a corresponding spec in `specs/`.
- Acceptance criteria in the spec MUST be verifiable (Given/When/Then form).
- Ambiguities MUST be resolved via `/speckit.clarify` before planning begins.
- Every PR description MUST include a "Constitution Check" section confirming traceability
  from spec → plan → tasks → code.

**Rationale**: Eliminates rework caused by misunderstood requirements and provides
end-to-end traceability from user need to merged code.

### II. Test-Driven Development (NON-NEGOTIABLE)

For every code change, tests MUST be written (or updated) first, confirmed failing,
then implementation written to pass. The Red → Green → Refactor cycle is mandatory.

**Non-negotiable rules**:
- Tests MUST exist and MUST fail before implementation begins.
- Each task that touches production code MUST include a corresponding test task.
- Refactor phase MUST keep all tests green.
- Test commands (run from each zone root):
  ```bash
  python -m pytest tests/ -v   # all agent zones
  cd verification-zones/verification-agent/cdk && npm test
  cd verification-zones/slack-search-agent/cdk && npm test
  cd execution-zones/file-creator-agent/cdk && npm test
  cd execution-zones/fetch-url-agent/cdk && npm test
  cd execution-zones/docs-agent/cdk && npm test
  cd execution-zones/time-agent/cdk && npm test
  ```

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

### VII. Clean Code Identifiers

Source code, docstrings, inline comments, and test names MUST NOT contain
process-tracking identifiers that are specific to the spec-kit workflow.

**Non-negotiable rules**:
- Spec numbers (e.g. `(027)`, `026 US1`) MUST NOT appear in code, docstrings, or comments.
- Branch names (e.g. `041-s3-replication-archive`) MUST NOT appear in code or docstrings.
- Task IDs (e.g. `T014`) and user story labels (e.g. `US1`) in isolation MUST NOT appear in code.
- Test class and function names MUST describe the behavior under test, not reference spec numbers.

**Permitted**: HTTP status codes, numeric literals, and business-domain numbers
(e.g., rate limit counts) are not spec numbers and are permitted.

**Rationale**: Spec numbers and branch names become meaningless after the feature
lifecycle ends. Embedding them creates cleanup debt requiring periodic removal
sprints. Code must be readable without external process context.

### VI. Documentation & Deploy-Script Parity

Every merged change MUST leave all documentation and deployment scripts in a state that
accurately reflects the actual codebase. Stale docs and broken deploy scripts are
treated as bugs, not tech debt.

**Non-negotiable rules**:
- `README.md` and `README.ja.md` MUST be updated in the same commit as any change that
  alters architecture, project structure, prerequisites, or user-facing behavior.
- `CHANGELOG.md` MUST receive an `[Unreleased]` entry for every feature, fix, or
  breaking change — added in the same commit as the code.
- Zone-level `README.md` files (e.g. `verification-zones/verification-agent/README.md`)
  MUST stay synchronized with their zone's implementation.
- `CLAUDE.md` "Active Technologies" and "Recent Changes" sections MUST be updated after
  every feature merge to reflect current dependencies, commands, and stack state.
- `scripts/deploy.sh` (unified deploy) MUST cover all deployed agent zones. Adding a new
  zone requires a corresponding update to this script in the same PR.
- Zone-level `scripts/deploy.sh` files MUST be created or updated whenever their zone's
  CDK stack name, output keys, or required environment variables change.
- Deploy scripts MUST be validated against actual stack outputs (CDK `CfnOutput` keys)
  before merge — no assumed output key names.

**Rationale**: Docs and deploy scripts that lag behind the code create operational
failures and force every new contributor to reverse-engineer the system. Parity removes
this hidden cost.

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
5. **Implement (TDD)** — `/speckit.implement`: Red → Green → Refactor per task
6. **Validate** — `/speckit.checklist`: confirm spec criteria met, all tests green
7. **Sync** — update docs and deploy scripts to match the implemented state:
   - `README.md`, `README.ja.md`, zone READMEs, `CHANGELOG.md`, `CLAUDE.md`
   - `scripts/deploy.sh` and any affected zone-level `scripts/deploy.sh`
   - Verify deploy script output-key references against actual CDK `CfnOutput` names

**Spec numbering rule**: Each feature MUST use the next globally-available sequential
number across ALL `specs/` directories. Before running `/speckit.specify`, determine the
correct number by running:
```bash
ls specs/ | grep -E '^[0-9]+' | sed 's/-.*//' | sort -n | tail -1
```
Then use N+1. The `/speckit.specify` `--number` flag MUST be set explicitly to this
value. Do not rely on the script's auto-detection, which only searches by short-name.

**Deploy order**: execution zones → verification zone
(`DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy`)

## Governance

This constitution supersedes all other practices within this repository.
Amendments require:
1. A PR updating this file with a version bump (SemVer: MAJOR/MINOR/PATCH).
2. A Sync Impact Report (HTML comment at top) listing changed principles and affected
   templates.
3. Dependent templates (`.specify/templates/`) updated in the same PR.

**Compliance review**: Every PR description MUST include a "Constitution Check" section
confirming:
- SDD traceability (Principle I): spec → plan → tasks → code
- TDD cycle completed (Principle II): tests written first, all green
- Docs and deploy scripts updated (Principle VI): README, CHANGELOG, CLAUDE.md, deploy.sh

If a violation is necessary, it MUST be justified in the Complexity Tracking table of
`plan.md`.

**Version policy**:
- MAJOR: principle removed or fundamentally redefined
- MINOR: principle added or materially expanded
- PATCH: wording clarification, typo fix

For runtime development guidance, see `CLAUDE.md` and `.claude/rules/`.

**Version**: 1.2.0 | **Ratified**: 2026-02-20 | **Last Amended**: 2026-03-18
