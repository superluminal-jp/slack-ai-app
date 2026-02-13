# Implementation Plan: CDK Logging, Comments, and Error Handling (Best Practices)

**Branch**: `029-cdk-logging-error-handling` | **Date**: 2026-02-13 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/029-cdk-logging-error-handling/spec.md`  
**User directive**: AWS MCP サーバーを用いてベストプラクティスを適用 (Apply best practices using AWS MCP server)

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Strengthen CDK infrastructure code with observability (structured logging at key lifecycle points), clarity (consistent module and API documentation), and resilience (actionable errors with context, no secrets). Approach is informed by AWS CDK best practices (via AWS IaC MCP): use of Aspects and Annotations for validation errors, structured messages for toolkit/deploy, and consistent JSDoc and comment style so operators and new contributors can diagnose failures and understand intent without reading implementation details.

## Technical Context

**Language/Version**: TypeScript 5.x (cdk/), Node.js 18+  
**Primary Dependencies**: aws-cdk-lib 2.215.x, constructs ^10.x, Jest (tests), zod (config validation)  
**Storage**: N/A (infrastructure definitions only; runtime state is in AWS)  
**Testing**: Jest in `cdk/test/`; assertions via `aws-cdk-lib/assertions` (Template, etc.)  
**Target Platform**: AWS (ap-northeast-1 primary); CDK CLI (synth/deploy)  
**Project Type**: Single IaC codebase (cdk/ at repo root)  
**Performance Goals**: Synthesis and deploy remain within acceptable CLI UX; no new latency targets for app runtime  
**Constraints**: No secrets in logs or error output; logging must work when output is redirected or in CI  
**Scale/Scope**: Existing CDK app (Execution + Verification stacks, ~20+ constructs); apply improvements across bin/ and lib/

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is a template and not yet ratified. Gates are derived from **project guidelines** (CLAUDE.md, user rules):

| Gate | Status | Notes |
|------|--------|------|
| Structured logging with correlation/context | Pass | FR-001, SC-005; research recommends consistent format at lifecycle points |
| No secrets/PII in logs or errors | Pass | FR-005, SC-004; explicit requirement |
| Error handling: clear, actionable, context preserved | Pass | FR-004, FR-007; CDK Annotations/Aspects and wrapped errors support this |
| Documentation: module and contract clarity | Pass | FR-002, FR-003, FR-006; JSDoc and comment style to be standardized |
| Testability | Pass | Existing Jest tests; new behavior verifiable via unit tests and manual synth/deploy |

No constitution violations. Re-check after Phase 1: contracts and data-model define log/error shape; implementation must adhere.

## Project Structure

### Documentation (this feature)

```text
specs/029-cdk-logging-error-handling/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── log-event.schema.json
│   └── error-report.schema.json
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
cdk/
├── bin/
│   └── cdk.ts                    # App entry: config load, validation, stack creation
├── lib/
│   ├── types/
│   │   ├── cdk-config.ts
│   │   └── stack-config.ts
│   ├── execution/
│   │   ├── execution-stack.ts
│   │   └── constructs/           # ExecutionAgentEcr, ExecutionAgentRuntime, etc.
│   └── verification/
│       ├── verification-stack.ts
│       └── constructs/           # SlackEventHandler, AgentInvoker, TokenStorage, etc.
└── test/
    ├── cdk.test.ts
    ├── execution-stack.test.ts
    ├── verification-stack.test.ts
    ├── lifecycle.test.ts
    ├── cross-account.test.ts
    └── agentcore-constructs.test.ts
```

**Structure Decision**: Single CDK app under `cdk/`. Entry point `bin/cdk.ts` loads config, validates environment, and instantiates ExecutionStack and VerificationStack. All changes for this feature are confined to `cdk/` (bin + lib); no new top-level apps or packages.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Not applicable; no violations.
