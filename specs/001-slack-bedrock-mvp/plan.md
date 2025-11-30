# Implementation Plan: Slack Bedrock MVP

**Branch**: `001-slack-bedrock-mvp` | **Date**: 2025-11-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-slack-bedrock-mvp/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a minimal Slack bot that integrates with Amazon Bedrock to provide AI-generated responses. The bot must handle direct messages and channel mentions, authenticate with both Slack and AWS Bedrock, and respond within 10 seconds. This is an MVP prioritizing basic functionality over production-grade features, security hardening, and comprehensive error handling.

## Technical Context

**Language/Version**: Python 3.11+ for Lambda functions, TypeScript for AWS CDK infrastructure
**Primary Dependencies**: AWS CDK, boto3 (Bedrock SDK), slack-sdk (Python), AWS Lambda runtime
**Storage**: NEEDS CLARIFICATION - DynamoDB for workspace tokens, but constitution requires DynamoDB with KMS encryption for context history (deferred for MVP?)
**Testing**: NEEDS CLARIFICATION - pytest for Python, but BDD test scenarios required by constitution for security features
**Target Platform**: AWS Lambda (serverless), triggered by Slack events via API Gateway or Lambda Function URL
**Project Type**: Web application (API backend only, no frontend)
**Performance Goals**: 10-second maximum response time (per spec), acknowledge within 2-3 seconds (Slack timeout)
**Constraints**:
- Slack enforces 3-second HTTP response timeout (requires async pattern per constitution)
- Bedrock API calls take 5-30 seconds (per constitution)
- AWS Lambda 15-minute maximum execution time
- Must implement HMAC SHA256 signature verification (per constitution)
**Scale/Scope**: Single workspace MVP, minimal user concurrency expected for testing phase

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Evaluation

| Principle | MVP Status | Compliance | Justification |
|-----------|-----------|------------|---------------|
| I. Security-First Architecture | ⚠️ PARTIAL VIOLATION | HMAC SHA256 signature verification: YES<br>Authorization checks: DEFERRED<br>Input sanitization: DEFERRED<br>AI protections (Guardrails, PII): DEFERRED | **VIOLATION JUSTIFIED**: Spec explicitly states "ベストプラクティスに従った構成や要件は全て後回しに" (defer all best practices). MVP prioritizes basic connectivity. Signature verification included as minimum security. Full multi-layer defense deferred to post-MVP. |
| II. Non-Blocking Async Processing | ✅ COMPLIANT | Must implement async pattern | Slack's 3-second timeout and Bedrock's 5-30 second latency mandate async processing (Lambda① acknowledgment + Lambda② background processing). |
| III. Context History Management | ⚠️ VIOLATION | DEFERRED | **VIOLATION JUSTIFIED**: Spec explicitly lists "Multi-turn conversations with context retention" and "Conversation history storage" as Out of Scope. Single-turn interactions only for MVP. |
| IV. Observability & Monitoring | ⚠️ PARTIAL VIOLATION | Basic CloudWatch: YES<br>Structured JSON logs: DEFERRED<br>Correlation IDs: DEFERRED<br>PII filtering in logs: DEFERRED | **VIOLATION JUSTIFIED**: Spec defers "Comprehensive monitoring and alerting" to post-MVP. Basic CloudWatch logs sufficient for MVP debugging. |
| V. Error Handling & Resilience | ✅ PARTIAL COMPLIANT | Basic error handling: YES<br>Production-grade retry logic: DEFERRED | Spec requires "graceful error handling" (User Story 3, P2) with user-friendly messages. Advanced retry logic explicitly deferred. |
| VI. Cost Management | ⚠️ VIOLATION | DEFERRED | **VIOLATION JUSTIFIED**: Spec defers "Cost optimization and granular resource limits". MVP accepts AWS free tier limits. Token limits needed for basic Bedrock API call structure. |
| VII. Compliance Standards | ⚠️ VIOLATION | DEFERRED | **VIOLATION JUSTIFIED**: Spec explicitly defers "Compliance certifications (SOC2, GDPR, HIPAA, etc.)". MVP for testing only, not production. |
| VIII. Testing Discipline | ⚠️ PARTIAL VIOLATION | Manual testing: YES<br>BDD scenarios: DEFERRED<br>Integration tests: DEFERRED | **VIOLATION JUSTIFIED**: Spec defers "Comprehensive unit tests and integration tests". MVP validated via manual testing in test workspace. |

### Gate Decision: ⚠️ CONDITIONAL PASS

**Rationale**: This is an explicitly scoped MVP with user requirement to defer all best practices and prioritize basic AI functionality ("AI機能へのアクセスができることを最優先"). Constitution violations are acknowledged and justified by:

1. **Explicit user intent**: "ベストプラクティスに従った構成や要件は全て後回し" directly conflicts with constitution's NON-NEGOTIABLE security-first principle
2. **Out of Scope documentation**: Spec comprehensively lists 20+ items deferred to post-MVP
3. **Minimum viable scope**: Only Principles II (Async) and partial V (Error Handling) are feasible within MVP constraints

**Critical requirements retained**:
- HMAC SHA256 signature verification (minimum security gate)
- Async processing pattern (technical requirement for Slack timeout compliance)
- Basic error handling with user-friendly messages

**Post-MVP migration path**: All deferred constitution principles MUST be implemented before production deployment. This MVP serves as proof-of-concept only.

## Project Structure

### Documentation (this feature)

```text
specs/001-slack-bedrock-mvp/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── slack-events-api.yaml  # OpenAPI spec for Slack event handling
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
cdk/
├── lib/
│   ├── slack-bedrock-stack.ts     # CDK infrastructure stack
│   ├── constructs/
│   │   ├── slack-event-handler.ts  # Lambda① construct
│   │   ├── bedrock-processor.ts    # Lambda② construct
│   │   └── token-storage.ts        # DynamoDB construct
│   └── config/
│       └── env.ts                  # Environment configuration
├── bin/
│   └── app.ts                      # CDK app entry point
└── test/
    └── slack-bedrock-stack.test.ts

lambda/
├── slack-event-handler/            # Lambda① - receives Slack events
│   ├── handler.py                  # Main Lambda handler
│   ├── slack_verifier.py           # HMAC SHA256 signature verification
│   ├── requirements.txt
│   └── tests/
│       └── test_handler.py
└── bedrock-processor/              # Lambda② - processes with Bedrock
    ├── handler.py                  # Main Lambda handler
    ├── bedrock_client.py           # Bedrock API wrapper
    ├── slack_poster.py             # Posts response to Slack
    ├── requirements.txt
    └── tests/
        └── test_handler.py

.env.example                        # Environment variables template
README.md                           # Repository documentation
```

**Structure Decision**: Dual infrastructure (CDK TypeScript + Lambda Python)
- **cdk/**: AWS CDK infrastructure as code (TypeScript) for provisioning Lambda, DynamoDB, IAM roles
- **lambda/**: Python 3.11 Lambda functions separated by responsibility
  - `slack-event-handler`: Validates requests, acknowledges within 3 seconds, triggers async processing
  - `bedrock-processor`: Invokes Bedrock API, posts response to Slack via response_url
- Separation supports async pattern required by Slack timeout constraints

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Deferred AI protections (Guardrails, PII detection) | MVP scope prioritizes basic connectivity | User explicitly requested "ベストプラクティスに従った構成や要件は全て後回し". Full protection requires additional AWS services (Comprehend unavailable for Japanese) and architectural complexity incompatible with MVP timeline. |
| Deferred context history with KMS encryption | MVP is single-turn only | Multi-turn conversation requires DynamoDB schema design, KMS key management, and session isolation logic. Spec explicitly lists "Conversation history storage" as Out of Scope. |
| Deferred comprehensive testing (BDD, integration) | MVP validated via manual testing | BDD test scenarios require Gherkin specs, pytest-bdd framework, and mock infrastructure. Manual testing in test workspace sufficient for proof-of-concept. |
| Deferred structured logging with correlation IDs | Basic CloudWatch logs sufficient for MVP debugging | Structured JSON logging requires custom Lambda layer, log parsing infrastructure, and correlation ID propagation across async Lambda invocations. Over-engineered for single-workspace MVP. |

---

## Post-Phase 1 Constitution Check

*Re-evaluation after design artifacts (research.md, data-model.md, contracts/, quickstart.md) completed.*

### Design Review

**Phase 1 Artifacts Generated**:
- ✅ research.md: Resolved all NEEDS CLARIFICATION items with justified decisions
- ✅ data-model.md: Defined entities (WorkspaceInstallation, SlackEvent, BedrockRequest/Response)
- ✅ contracts/slack-events-api.yaml: OpenAPI 3.0 spec for Slack event endpoint
- ✅ quickstart.md: Deployment and testing guide with troubleshooting

**Architecture Decisions**:
1. **Async Processing**: Lambda① (event handler) + Lambda② (Bedrock processor) pattern confirmed
2. **Storage**: DynamoDB with AWS-managed encryption (not KMS CMK) for workspace tokens only
3. **Model**: Claude 3 Haiku for speed (1-3 seconds) within 10-second constraint
4. **Event Delivery**: Lambda Function URL (no API Gateway) for simplicity
5. **Testing**: Manual E2E + pytest unit tests for signature verification only

### Constitution Compliance Re-Check

| Principle | Status Change | Notes |
|-----------|---------------|-------|
| I. Security-First Architecture | ⚠️ No change (PARTIAL VIOLATION) | HMAC SHA256 signature verification designed in contracts/. Timestamp validation (±5 minutes) specified. AI protections remain deferred. |
| II. Non-Blocking Async | ✅ No change (COMPLIANT) | Dual-Lambda architecture confirmed in data-model.md. Lambda① <3s acknowledgment, Lambda② async Bedrock processing. |
| III. Context History | ⚠️ No change (VIOLATION) | Single-turn only confirmed. DynamoDB schema in data-model.md excludes context history table. |
| IV. Observability | ⚠️ No change (PARTIAL VIOLATION) | Basic CloudWatch only. No structured logging designed. Correlation IDs deferred. |
| V. Error Handling | ✅ No change (PARTIAL COMPLIANT) | Error message catalog defined in research.md (7 user-friendly messages). Graceful degradation confirmed. |
| VI. Cost Management | ⚠️ No change (VIOLATION) | Token limits specified (4000 char input, 1024 token output). Per-user quotas deferred. |
| VII. Compliance | ⚠️ No change (VIOLATION) | Remains deferred to post-MVP. |
| VIII. Testing Discipline | ⚠️ No change (PARTIAL VIOLATION) | Manual testing confirmed in quickstart.md. BDD scenarios remain deferred. pytest unit tests scoped to signature verification. |

### Gate Decision: ✅ CONFIRMED PASS

**Rationale**: Phase 1 design reinforces Pre-Phase 0 assessment. No new violations introduced. Architecture aligns with:
- MVP scope: Basic connectivity over production hardening
- User intent: "AI機能へのアクセスができることを最優先"
- Justified deferrals: All violations remain justified per Complexity Tracking table

**Design Quality**:
- ✅ Async pattern correctly addresses Slack 3-second timeout
- ✅ HMAC signature verification provides minimum security gate
- ✅ Error handling catalog ensures graceful user experience
- ✅ Quickstart guide enables rapid deployment validation
- ✅ Research decisions documented with rationale and alternatives

**Implementation Ready**: Proceed to Phase 2 (`/speckit.tasks`) to generate task breakdown.
