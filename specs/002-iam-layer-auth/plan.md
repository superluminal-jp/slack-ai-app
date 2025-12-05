# Implementation Plan: Authenticated Communication Between Layers

**Branch**: `002-iam-layer-auth` | **Date**: 2025-01-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-iam-layer-auth/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Modify the communication between Verification Layer (slack-event-handler Lambda) and Execution Layer (bedrock-processor Lambda) to use API Gateway with IAM authentication instead of direct Lambda invocation. This adds an additional security layer by requiring IAM-authenticated requests through API Gateway, preventing unauthorized access even if Lambda invoke permissions are compromised. The change must maintain existing asynchronous processing behavior and preserve all request payload data while ensuring end-user experience remains unchanged.

## Technical Context

**Language/Version**: Python 3.11+ for Lambda functions, TypeScript for AWS CDK infrastructure
**Primary Dependencies**: AWS CDK, boto3 (AWS SDK), requests (for API Gateway calls), AWS Lambda runtime, AWS API Gateway
**Current Implementation**: 
- Verification Layer calls Execution Layer via `lambda_client.invoke()` with `InvocationType="Event"` (async)
- Direct Lambda-to-Lambda invocation using IAM role permissions
- No API Gateway currently exists for Execution Layer
**Target Implementation**:
- Verification Layer calls Execution Layer via API Gateway REST API endpoint
- API Gateway uses IAM authentication (AWS Signature Version 4)
- API Gateway resource policy restricts access to Verification Layer's IAM role only
- Execution Layer Lambda function remains unchanged (only invocation method changes)
**Storage**: No changes required (DynamoDB usage unchanged)
**Testing**: pytest for Python unit tests, manual integration testing for API Gateway IAM authentication
**Target Platform**: AWS Lambda (serverless), AWS API Gateway (REST API)
**Project Type**: Security enhancement to existing web application backend
**Performance Goals**: 
- End-to-end request processing time increases by ≤5% compared to direct invocation (p95)
- Authentication overhead ≤200ms (per spec assumption)
- Maintain existing 3-second Slack acknowledgment requirement
**Constraints**:
- Must maintain asynchronous processing behavior (non-blocking)
- Must preserve existing request payload structure
- Must not change Execution Layer Lambda function implementation
- Must support zero-downtime migration (both old and new methods can coexist)
- API Gateway IAM authentication requires AWS Signature Version 4 signing
**Scale/Scope**: Production security enhancement affecting all Verification Layer → Execution Layer communications

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Evaluation

| Principle | Status | Compliance | Justification |
|-----------|--------|------------|---------------|
| I. Security-First Architecture | ✅ COMPLIANT | Adding IAM authentication layer | This feature directly implements Principle I by adding an additional authentication layer between internal components. API Gateway IAM authentication provides defense-in-depth, preventing unauthorized access even if Lambda invoke permissions are compromised. |
| II. Non-Blocking Async Processing | ✅ COMPLIANT | Async pattern maintained | API Gateway supports asynchronous invocation patterns. Verification Layer will call API Gateway endpoint and immediately return acknowledgment to Slack, maintaining existing async behavior. |
| III. Context History Management | ✅ NO CHANGE | Not affected | This feature does not modify context history management. Execution Layer Lambda function remains unchanged. |
| IV. Observability & Monitoring | ✅ COMPLIANT | API Gateway CloudWatch integration | API Gateway automatically logs all requests with IAM authentication events to CloudWatch. Authentication successes and failures will be logged for security monitoring. |
| V. Error Handling & Resilience | ✅ COMPLIANT | Graceful error handling | API Gateway IAM authentication errors will be handled gracefully. Verification Layer will log authentication failures and return appropriate error responses without exposing internal details. |
| VI. Cost Management | ⚠️ MINOR IMPACT | API Gateway costs | API Gateway adds minimal cost ($3.50 per million requests). This is justified by security benefits. No cost optimization needed for this security enhancement. |
| VII. Compliance Standards | ✅ COMPLIANT | IAM authentication supports compliance | IAM authentication provides audit trail through CloudTrail, supporting compliance requirements. API Gateway resource policies provide fine-grained access control. |
| VIII. Testing Discipline | ✅ COMPLIANT | Unit and integration tests required | API Gateway IAM authentication requires integration testing to verify signature generation and resource policy enforcement. Unit tests will verify boto3 API Gateway client usage. |

### Gate Decision: ✅ PASS

**Rationale**: This feature directly enhances security (Principle I) without violating any constitution principles. All principles are either compliant or not affected. The feature aligns with security-first architecture by adding defense-in-depth authentication layer.

**Key Compliance Points**:
- ✅ Security-First: Adds IAM authentication layer (defense-in-depth)
- ✅ Async Processing: Maintains existing non-blocking pattern
- ✅ Observability: API Gateway CloudWatch logs provide authentication monitoring
- ✅ Error Handling: Graceful handling of authentication failures
- ✅ Testing: Integration tests required for IAM authentication verification

**No Violations**: All constitution principles are satisfied or not applicable.

## Project Structure

### Documentation (this feature)

```text
specs/002-iam-layer-auth/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── execution-api.yaml  # OpenAPI spec for Execution Layer API Gateway
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code Changes (repository root)

```text
cdk/
├── lib/
│   ├── slack-bedrock-stack.ts          # MODIFY: Add execution-api API Gateway
│   └── constructs/
│       ├── bedrock-processor.ts        # MODIFY: Add API Gateway integration
│       └── execution-api.ts            # NEW: API Gateway construct for Execution Layer
│
lambda/
├── slack-event-handler/
│   ├── handler.py                      # MODIFY: Replace lambda_client.invoke() with API Gateway call
│   ├── api_gateway_client.py           # NEW: API Gateway IAM authentication client
│   └── requirements.txt                # MODIFY: Add requests library if needed
└── bedrock-processor/
    └── handler.py                       # NO CHANGE: Function remains unchanged
```

**Structure Decision**: 
- **cdk/lib/constructs/execution-api.ts**: New construct for API Gateway REST API with IAM authentication
- **cdk/lib/constructs/bedrock-processor.ts**: Modified to integrate with API Gateway instead of direct Lambda URL
- **lambda/slack-event-handler/api_gateway_client.py**: New module for API Gateway IAM authentication using boto3 SigV4 signing
- **lambda/slack-event-handler/handler.py**: Modified to use API Gateway client instead of Lambda invoke

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations - all constitution principles are compliant.

---

## Post-Phase 1 Constitution Check

*Re-evaluation after design artifacts (research.md, data-model.md, contracts/, quickstart.md) completed.*

### Design Review

**Phase 1 Artifacts Generated**:
- ✅ research.md: Resolved all technical decisions (API Gateway IAM authentication, SigV4 signing, resource policies)
- ✅ data-model.md: Defined request/response entities for API Gateway communication
- ✅ contracts/execution-api.yaml: OpenAPI 3.0 spec for Execution Layer API Gateway endpoint
- ✅ quickstart.md: Migration guide with testing steps

**Architecture Decisions**:
1. **API Gateway Type**: REST API (not HTTP API) for IAM authentication support
2. **Authentication**: AWS Signature Version 4 (SigV4) using boto3's request signer
3. **Resource Policy**: API Gateway resource policy restricts access to Verification Layer IAM role ARN only
4. **Integration**: API Gateway Lambda proxy integration (preserves existing Lambda handler interface)
5. **Migration**: Zero-downtime migration by supporting both invocation methods temporarily

### Constitution Compliance Re-Check

| Principle | Status Change | Notes |
|-----------|---------------|-------|
| I. Security-First Architecture | ✅ No change (COMPLIANT) | API Gateway IAM authentication adds defense-in-depth layer. Resource policy enforces least privilege access. |
| II. Non-Blocking Async | ✅ No change (COMPLIANT) | API Gateway supports async invocation. Verification Layer calls API Gateway and immediately returns acknowledgment. |
| III. Context History | ✅ No change (NO CHANGE) | Not affected by this feature. |
| IV. Observability | ✅ No change (COMPLIANT) | API Gateway CloudWatch logs provide authentication event monitoring. CloudTrail logs API Gateway calls. |
| V. Error Handling | ✅ No change (COMPLIANT) | API Gateway IAM authentication errors handled gracefully. Error responses don't expose internal details. |
| VI. Cost Management | ⚠️ No change (MINOR IMPACT) | API Gateway costs are minimal ($3.50 per million requests). Justified by security benefits. |
| VII. Compliance | ✅ No change (COMPLIANT) | IAM authentication provides audit trail. Resource policies support compliance requirements. |
| VIII. Testing | ✅ No change (COMPLIANT) | Integration tests designed for API Gateway IAM authentication verification. Unit tests for SigV4 signing. |

### Gate Decision: ✅ CONFIRMED PASS

**Rationale**: Phase 1 design confirms Pre-Phase 0 assessment. No new violations introduced. Architecture aligns with:
- Security-first: IAM authentication adds defense-in-depth
- Async pattern: Maintained through API Gateway
- Observability: CloudWatch and CloudTrail integration
- Testing: Integration tests designed for authentication verification

**Design Quality**:
- ✅ API Gateway IAM authentication correctly implements security enhancement
- ✅ SigV4 signing preserves request payload structure
- ✅ Resource policy enforces least privilege access
- ✅ Zero-downtime migration path supports production deployment
- ✅ Research decisions documented with rationale and alternatives

**Implementation Ready**: Proceed to Phase 2 (`/speckit.tasks`) to generate task breakdown.

