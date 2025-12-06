# Implementation Plan: Two-Key Defense (Signing Secret + Bot Token)

**Branch**: `006-existence-check` | **Date**: 2025-01-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-existence-check/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement Slack API Existence Check as a second layer of defense in the two-key security model. When Signing Secret is leaked, attackers can forge request signatures, but they cannot call Slack API without Bot Token. This feature verifies that team_id, user_id, and channel_id exist in Slack by calling Slack API (team.info, users.info, conversations.info) before processing requests. Verification results are cached in DynamoDB for 5 minutes to minimize performance impact. The system fails securely (rejects requests) when Slack API is unavailable, prioritizing security over availability.

## Technical Context

**Language/Version**: Python 3.11+ for Lambda functions, TypeScript for AWS CDK infrastructure  
**Primary Dependencies**: AWS CDK, boto3 (DynamoDB client), slack-sdk (Python WebClient), AWS Lambda runtime  
**Storage**: DynamoDB table for caching verification results (TTL: 5 minutes, partition key: cache_key)  
**Testing**: pytest for Python unit tests, BDD scenarios (Gherkin) for security-critical flows  
**Target Platform**: AWS Lambda (serverless), triggered by Slack events via Function URL  
**Project Type**: Web application (API backend only, no frontend)  
**Performance Goals**: Existence check completes within 500ms for 95% of requests (including cache hits and Slack API calls)  
**Constraints**:

- Slack API rate limits (Tier 2: 20 requests/minute per method)
- Slack API timeout: 2 seconds (fail-closed security model)
- DynamoDB read/write capacity (PAY_PER_REQUEST billing mode)
- Cache hit rate target: ≥80% for repeated requests
- Security takes precedence over availability (fail-closed when verification cannot be performed)
  **Scale/Scope**: Extension to existing SlackEventHandler Lambda; supports single workspace with dynamic entity verification

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Phase 0 Evaluation

| Principle                         | Status       | Compliance                                                                                             | Justification                                                                                                                                                                                                                              |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Security-First Architecture    | ✅ COMPLIANT | Implements 2-key defense model<br>Adds Existence Check as security layer<br>Fail-closed security model | Existence Check is a security feature that reduces attack surface when Signing Secret is leaked. Uses Bot Token (second key) to verify entities exist in Slack. Fail-closed model ensures security takes precedence over availability.     |
| II. Non-Blocking Async Processing | ✅ COMPLIANT | Maintains existing async pattern                                                                       | Existence Check runs synchronously in SlackEventHandler (Lambda①) but completes within 500ms (p95). Does not block async processing pattern. Cache reduces latency to near-zero for cached entries.                                        |
| III. Context History Management   | ✅ N/A       | Not applicable                                                                                         | Existence Check does not require context history changes. Verification cache is separate from context history and has different TTL (5 minutes vs context retention).                                                                      |
| IV. Observability & Monitoring    | ✅ COMPLIANT | Maintains existing logging<br>Adds security event logging for failures                                 | All existence check failures logged as security events with team_id, user_id, channel_id, and error details. No PII in logs (IDs are not PII). CloudWatch metrics track ExistenceCheckFailed, ExistenceCheckCacheHitRate, SlackAPILatency. |
| V. Error Handling & Resilience    | ✅ COMPLIANT | Comprehensive error handling required                                                                  | FR-007, FR-008 require graceful handling of Slack API timeouts, rate limits, and errors. Fail-closed model (reject requests) when verification cannot be performed. Retry logic with exponential backoff for rate limits (429 errors).     |
| VI. Cost Management               | ✅ COMPLIANT | Caching reduces Slack API calls                                                                        | FR-005 requires caching successful verification results for 5 minutes. Target cache hit rate ≥80% reduces Slack API calls by 80%+. DynamoDB PAY_PER_REQUEST billing mode minimizes costs.                                                  |
| VII. Compliance Standards         | ✅ COMPLIANT | No compliance changes                                                                                  | Existence Check uses existing data protection mechanisms. Cache entries contain only team_id, user_id, channel_id (not PII). DynamoDB encryption at rest enabled by default. No new compliance risks introduced.                           |
| VIII. Testing Discipline          | ✅ COMPLIANT | BDD scenarios required for security feature                                                            | FR-009 requires logging all existence check failures as security events. BDD scenarios must cover attack scenarios (Signing Secret leak, fake IDs, Slack API failures). Unit tests for cache logic, retry logic, error handling.           |

### Gate Decision: ✅ PASS

**Rationale**: This feature implements a critical security enhancement (2-key defense) that aligns with Constitution Principle I (Security-First Architecture). All constitution principles are satisfied:

1. **Security**: Implements 2-key defense model; fail-closed security model; security event logging
2. **Async Processing**: Maintains existing async pattern; Existence Check completes within 500ms (p95)
3. **Observability**: Comprehensive security event logging; CloudWatch metrics for monitoring
4. **Error Handling**: Fail-closed model; retry logic for rate limits; graceful degradation when Bot Token unavailable
5. **Cost Management**: Caching reduces Slack API calls by 80%+; DynamoDB PAY_PER_REQUEST minimizes costs
6. **Testing**: BDD scenarios required for security-critical feature; unit tests for cache and error handling

## Project Structure

### Documentation (this feature)

```text
specs/006-existence-check/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── slack-existence-check-api.yaml  # OpenAPI spec for Existence Check API calls
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
lambda/
└── slack-event-handler/            # Slack Event Handler - receives Slack events
    ├── handler.py                  # Main Lambda handler (MODIFY: add Existence Check after signature verification)
    ├── slack_verifier.py          # HMAC SHA256 signature verification (no changes)
    ├── existence_check.py         # NEW: Existence Check module (verify entities via Slack API)
    ├── token_storage.py            # Existing: Get Bot Token (no changes)
    ├── logger.py                   # Existing: Structured logging (no changes)
    ├── requirements.txt            # MODIFY: Ensure slack-sdk is included
    └── tests/
        ├── test_handler.py         # MODIFY: Test Existence Check integration
        └── test_existence_check.py # NEW: Test Existence Check logic, cache, retry, error handling

cdk/
└── lib/
    ├── slack-bedrock-stack.ts      # Main CDK stack (MODIFY: add ExistenceCheckCache DynamoDB table)
    └── constructs/
        └── existence-check-cache.ts # NEW: DynamoDB table construct for Existence Check cache
```

**Structure Decision**: Single project structure maintained. Existence Check is integrated into existing SlackEventHandler Lambda. New DynamoDB table added via CDK construct following existing patterns (TokenStorage, EventDedupe).

## Complexity Tracking

> **No violations - all complexity justified by security requirements**
