# Implementation Plan: AgentCore A2A Migration — Deprecate Legacy Infrastructure

**Branch**: `015-agentcore-a2a-migration` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/015-agentcore-a2a-migration/spec.md`

## Summary

Migrate to a single AgentCore A2A communication path by removing legacy Lambda (BedrockProcessor, SlackResponseHandler), API Gateway (ExecutionApi), and SQS (ExecutionResponseQueue) from CDK stacks. Remove the `USE_AGENTCORE` feature flag and all conditional branching so that Slack-to-AI traffic flows exclusively Verification Agent → Execution Agent via A2A. Preserve DynamoDB, Secrets Manager, and AgentCore runtime configuration. Validate implementation and best practices using AWS MCP.

## Technical Context

**Language/Version**: TypeScript (CDK, Node 18+), Python 3.11+ (Lambda/Agent runtimes)  
**Primary Dependencies**: aws-cdk-lib, AWS AgentCore Runtime (Bedrock AgentCore), existing ECR/Agent constructs  
**Storage**: DynamoDB (token, dedupe, existence check, whitelist, rate limit), Secrets Manager (Slack credentials) — preserved; no schema changes  
**Testing**: Jest (CDK unit/integration), pytest (Lambda/agent unit tests)  
**Target Platform**: AWS (ap-northeast-1); Lambda (SlackEventHandler only), AgentCore runtimes (Verification + Execution), ECR  
**Project Type**: Infrastructure (CDK) + serverless/container agents  
**Performance Goals**: No degradation in Slack-to-AI response time; A2A path already validated in 013/014  
**Constraints**: Zero references to legacy components after migration; least-privilege IAM; SigV4 for cross-account A2A  
**Scale/Scope**: Single communication path; reduced CDK surface (fewer constructs, fewer lines)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is a template with placeholders; no project-specific principles are defined. Standard quality gates apply:

- **Tests**: All existing unit and integration tests must pass after changes; tests referencing removed constructs must be updated or removed.
- **No regressions**: A2A flow (Slack → Verification Agent → Execution Agent → Slack) and file-artifact flow (014) must remain functional.
- **Observability**: Structured logging and CloudWatch metrics from AgentCore runtimes (already required by spec).

**Result**: PASS — no constitution violations; migration is a removal/simplification.

## Project Structure

### Documentation (this feature)

```text
specs/015-agentcore-a2a-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (A2A protocol reference; no new APIs)
└── tasks.md             # Phase 2 output (/speckit.tasks — not created by plan)
```

### Source Code (repository root)

```text
cdk/
├── bin/
│   └── cdk.ts                    # Stack app; remove useAgentCore, ExecutionApiUrl flow
├── lib/
│   ├── execution/
│   │   ├── execution-stack.ts    # Remove BedrockProcessor, ExecutionApi, related outputs
│   │   ├── constructs/
│   │   │   ├── bedrock-processor.ts      # DELETE (construct + lambda/)
│   │   │   ├── execution-api.ts         # DELETE
│   │   │   ├── api-gateway-monitoring.ts # DELETE or keep only if reused
│   │   │   ├── execution-agent-runtime.ts # KEEP
│   │   │   └── execution-agent-ecr.ts    # KEEP
│   │   └── lambda/
│   │       └── bedrock-processor/       # DELETE
│   ├── verification/
│   │   ├── verification-stack.ts  # Remove SQS, SlackResponseHandler; keep SlackEventHandler + AgentCore
│   │   ├── constructs/
│   │   │   ├── slack-event-handler.ts   # KEEP; remove USE_AGENTCORE, legacy env
│   │   │   ├── slack-response-handler.ts # DELETE
│   │   │   └── ...                      # KEEP (runtime, ECR, DynamoDB, etc.)
│   │   └── lambda/
│   │       ├── slack-event-handler/     # KEEP; remove feature-flag branching
│   │       └── slack-response-handler/  # DELETE
│   └── types/
│       └── stack-config.ts        # Remove legacy props (executionApiUrl, executionResponseQueueUrl, useAgentCore)
├── test/
│   ├── execution-stack.test.ts   # Update: remove legacy resource assertions
│   ├── verification-stack.test.ts # Update: remove SQS/SlackResponseHandler assertions
│   └── ...
```

**Structure Decision**: Existing CDK monorepo with execution/ and verification/ stacks. This feature removes constructs and Lambda code under execution/ and verification/; no new top-level directories.

## Complexity Tracking

> Not applicable — no constitution violations. This feature reduces complexity by removing code and infrastructure.
