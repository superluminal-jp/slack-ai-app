# Implementation Plan: Thread Reply

**Branch**: `003-thread-reply` | **Date**: 2025-01-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-thread-reply/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Modify the Slack bot to reply in threads instead of posting new channel messages. The bot must extract the message timestamp from Slack events, pass it through the async processing pipeline, and use it as `thread_ts` parameter when posting responses via Slack API. This change improves conversation organization by keeping bot responses linked to the original messages that triggered them.

## Technical Context

**Language/Version**: Python 3.11+ for Lambda functions, TypeScript for AWS CDK infrastructure  
**Primary Dependencies**: AWS CDK, boto3 (Bedrock SDK), slack-sdk (Python), AWS Lambda runtime  
**Storage**: N/A (no new storage required; uses existing DynamoDB for workspace tokens)  
**Testing**: pytest for Python unit tests, manual E2E testing in Slack workspace  
**Target Platform**: AWS Lambda (serverless), triggered by Slack events via API Gateway  
**Project Type**: Web application (API backend only, no frontend)  
**Performance Goals**: Thread replies maintain same response time as channel messages (within 15 seconds for messages under 500 characters per spec SC-005)  
**Constraints**:
- Slack API `chat.postMessage` supports `thread_ts` parameter for thread replies
- Message timestamp (`event.ts`) must be extracted from Slack events and passed through async pipeline
- Backward compatibility: System must handle missing timestamps gracefully (FR-007)
- Thread replies work for both channel mentions (`app_mention`) and direct messages (`message` with `channel_type: im`)
**Scale/Scope**: Modification to existing MVP functionality; no new infrastructure required

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Evaluation

| Principle | Status | Compliance | Justification |
|-----------|--------|------------|---------------|
| I. Security-First Architecture | ✅ COMPLIANT | No security changes required | Thread reply feature uses existing security mechanisms (HMAC signature verification, async processing). No new attack vectors introduced. |
| II. Non-Blocking Async Processing | ✅ COMPLIANT | Maintains existing async pattern | Thread reply feature works within existing async architecture. No blocking operations added. |
| III. Context History Management | ✅ N/A | Not applicable | Thread reply feature does not require context history changes. Single-turn interactions maintained. |
| IV. Observability & Monitoring | ✅ COMPLIANT | Maintains existing logging | Thread reply feature uses existing structured logging. No new observability requirements. |
| V. Error Handling & Resilience | ✅ COMPLIANT | Graceful error handling included | FR-007 and FR-008 require graceful handling of missing/invalid timestamps. Error messages posted as thread replies. |
| VI. Cost Management | ✅ COMPLIANT | No cost impact | Thread reply feature uses same Bedrock API calls. No additional cost. |
| VII. Compliance Standards | ✅ COMPLIANT | No compliance changes | Thread reply feature does not change data handling or storage patterns. |
| VIII. Testing Discipline | ⚠️ PARTIAL COMPLIANT | Unit tests + manual E2E | Unit tests for timestamp extraction and thread reply logic. Manual E2E testing for thread reply behavior. BDD scenarios deferred (not security-critical). |

### Gate Decision: ✅ PASS

**Rationale**: This feature modification maintains all existing security and architectural patterns. Thread replies are a UX improvement that does not introduce new security risks or architectural complexity. All constitution principles remain satisfied:

1. **Security**: No new attack vectors; uses existing authentication/authorization
2. **Async Processing**: Maintains existing async pattern
3. **Error Handling**: Includes graceful degradation for edge cases
4. **Testing**: Unit tests + manual E2E sufficient for non-security-critical feature

## Project Structure

### Documentation (this feature)

```text
specs/003-thread-reply/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
lambda/
├── slack-event-handler/            # Slack Event Handler - receives Slack events
│   ├── handler.py                  # Main Lambda handler (MODIFY: extract event.ts)
│   ├── slack_verifier.py           # HMAC SHA256 signature verification (no changes)
│   ├── requirements.txt
│   └── tests/
│       └── test_handler.py         # (ADD: test timestamp extraction)
└── bedrock-processor/              # Bedrock Processor - processes with Bedrock
    ├── handler.py                  # Main Lambda handler (MODIFY: accept thread_ts)
    ├── bedrock_client.py           # Bedrock API wrapper (no changes)
    ├── slack_poster.py             # Posts response to Slack (MODIFY: add thread_ts parameter)
    ├── requirements.txt
    └── tests/
        └── test_slack_poster.py    # (ADD: test thread reply posting)
```

**Structure Decision**: Modification to existing MVP codebase. No new infrastructure or Lambda functions required. Changes limited to:
1. **slack-event-handler/handler.py**: Extract `event.ts` from Slack event and include in payload to bedrock-processor
2. **bedrock-processor/handler.py**: Accept `thread_ts` from payload and pass to slack_poster
3. **bedrock-processor/slack_poster.py**: Add optional `thread_ts` parameter to `post_to_slack()` function and pass to `chat_postMessage()` API call

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations identified. This feature modification maintains existing architecture and security patterns.

---

## Post-Phase 1 Constitution Check

*Re-evaluation after design artifacts (research.md, data-model.md, contracts/, quickstart.md) completed.*

### Design Review

**Phase 1 Artifacts Generated**:
- ✅ research.md: Resolved all technical questions about Slack thread reply API and implementation approach
- ✅ data-model.md: Documented payload modifications and data flow changes
- ✅ contracts/internal-api-payload.yaml: OpenAPI spec for internal Lambda payload with thread_ts
- ✅ contracts/slack-api-thread-reply.yaml: OpenAPI spec documenting Slack API thread reply usage
- ✅ quickstart.md: Testing guide with test cases and troubleshooting

**Architecture Decisions**:
1. **Thread Reply Implementation**: Use `thread_ts` parameter in `chat.postMessage` API call
2. **Backward Compatibility**: `thread_ts` is optional; graceful degradation to channel message if missing/invalid
3. **Error Handling**: Fall back to channel message if thread reply fails (parent deleted, invalid timestamp)
4. **Data Flow**: Extract `event.ts` from Slack event → pass through async pipeline → use as `thread_ts` in API call
5. **Testing**: Manual E2E testing + unit tests for timestamp extraction and validation

### Constitution Compliance Re-Check

| Principle | Status Change | Notes |
|-----------|---------------|-------|
| I. Security-First Architecture | ✅ No change (COMPLIANT) | No security changes; uses existing authentication/authorization |
| II. Non-Blocking Async | ✅ No change (COMPLIANT) | Maintains existing async pattern; no blocking operations added |
| III. Context History | ✅ No change (N/A) | Not applicable; no context history changes |
| IV. Observability | ✅ No change (COMPLIANT) | Maintains existing logging; thread_ts included in logs |
| V. Error Handling | ✅ No change (COMPLIANT) | Graceful degradation implemented; error handling for thread failures |
| VI. Cost Management | ✅ No change (COMPLIANT) | No cost impact; same Bedrock API calls |
| VII. Compliance Standards | ✅ No change (COMPLIANT) | No compliance changes; no data handling modifications |
| VIII. Testing Discipline | ✅ No change (PARTIAL COMPLIANT) | Unit tests + manual E2E; BDD scenarios deferred (not security-critical) |

### Gate Decision: ✅ CONFIRMED PASS

**Rationale**: Phase 1 design confirms Pre-Phase 0 assessment. No new violations introduced. Architecture aligns with:
- Feature scope: UX improvement without security/architectural changes
- Backward compatibility: Graceful degradation ensures existing functionality preserved
- Error handling: Comprehensive error handling for edge cases

**Design Quality**:
- ✅ Thread reply implementation correctly uses Slack API `thread_ts` parameter
- ✅ Backward compatibility maintained via optional parameter and graceful degradation
- ✅ Error handling ensures user always receives response (thread or channel message)
- ✅ Quickstart guide enables comprehensive testing
- ✅ Research decisions documented with rationale and alternatives

**Implementation Ready**: Proceed to Phase 2 (`/speckit.tasks`) to generate task breakdown.
