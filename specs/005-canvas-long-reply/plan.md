# Implementation Plan: Canvas for Long Replies

**Branch**: `005-canvas-long-reply` | **Date**: 2025-01-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-canvas-long-reply/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enable the Slack bot to automatically use Slack Canvas for long replies (exceeding 800 characters) or structured document formatting (headings, lists, tables, code blocks). The system must detect when a reply should use Canvas, create a Canvas containing the formatted content, share it in the appropriate thread or channel, and post a brief summary message. If Canvas creation fails, the system gracefully falls back to posting a regular message. This improves readability for long AI responses and structured documents while maintaining backward compatibility with short, plain text replies.

## Technical Context

**Language/Version**: Python 3.11+ for Lambda functions, TypeScript for AWS CDK infrastructure  
**Primary Dependencies**: AWS CDK, boto3 (Bedrock SDK), slack-sdk (Python), AWS Lambda runtime  
**Storage**: N/A (Canvas content created and shared via Slack API; no persistent storage required per spec Out of Scope)  
**Testing**: pytest for Python unit tests, manual E2E testing in Slack workspace  
**Target Platform**: AWS Lambda (serverless), triggered by Slack events via API Gateway  
**Project Type**: Web application (API backend only, no frontend)  
**Performance Goals**: Canvas creation and sharing adds no more than 5 seconds to total response time compared to regular message posting (per spec SC-002)  
**Constraints**:

- Slack Canvas API availability and rate limits (NEEDS CLARIFICATION: What are the exact API endpoints and rate limits?)
- Canvas content size limits (NEEDS CLARIFICATION: Are there content size limits for Canvas?)
- Bot token permissions for Canvas creation and sharing (`canvas:write` scope or equivalent)
- Reply length threshold: 800 characters (per spec FR-016)
- Structured formatting detection: Must identify headings, lists, tables, code blocks (NEEDS CLARIFICATION: What patterns/markers indicate structured formatting?)
- Canvas sharing in threads: Must support `thread_ts` parameter for thread context
- Fallback behavior: Must handle Canvas creation failures gracefully

**Scale/Scope**: Extension to existing MVP functionality; supports single workspace with Canvas capabilities for long replies and structured documents

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Evaluation

| Principle                         | Status               | Compliance                                                                                               | Justification                                                                                                                                                                                                                                                     |
| --------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Security-First Architecture    | ✅ COMPLIANT         | Maintains existing security mechanisms<br>Canvas creation uses bot token authentication<br>No new attack vectors introduced | Canvas creation and sharing use existing bot token authentication. No new authentication/authorization mechanisms required. Canvas content is generated from AI responses (already processed through security layers). No PII exposure beyond existing patterns. |
| II. Non-Blocking Async Processing | ✅ COMPLIANT         | Maintains existing async pattern                                                                         | Canvas creation occurs in Bedrock Processor (Lambda②) asynchronously. Canvas API calls happen in background, not blocking Slack Event Handler response. Maintains <3 second response time for initial acknowledgment. |
| III. Context History Management   | ✅ N/A               | Not applicable                                                                                           | Canvas creation does not require context history changes. Canvas content is generated per-message without persistent storage (per spec Out of Scope). |
| IV. Observability & Monitoring    | ✅ COMPLIANT         | Maintains existing logging<br>Adds Canvas-specific events                                            | Canvas creation attempts, successes, and failures logged with correlation IDs (per FR-013). Canvas API errors logged. No PII in logs. Canvas creation metrics tracked. |
| V. Error Handling & Resilience    | ✅ COMPLIANT         | Comprehensive error handling required                                                                    | FR-007 requires graceful handling of Canvas creation failures. Fallback to regular messages when Canvas creation fails. Canvas API errors don't crash system. User-friendly error messages. |
| VI. Cost Management               | ✅ COMPLIANT         | No additional cost impact                                                                                | Canvas creation uses Slack API (no AWS service costs). No additional Bedrock API calls. Canvas creation may add API call overhead but within Slack API rate limits. |
| VII. Compliance Standards         | ✅ COMPLIANT         | No compliance changes                                                                                   | Canvas creation uses existing data protection mechanisms. Canvas content contains AI-generated responses (already processed through security layers). No PII extraction beyond existing patterns. |
| VIII. Testing Discipline          | ⚠️ PARTIAL COMPLIANT | Unit tests + manual E2E                                                                                  | Unit tests for Canvas creation, structured formatting detection, fallback behavior. Manual E2E testing for Canvas creation flows. BDD scenarios deferred (not security-critical feature). |

### Gate Decision: ✅ PASS

**Rationale**: This feature extension maintains all existing security and architectural patterns. Canvas creation is a functional enhancement that improves user experience for long replies and structured documents. All constitution principles remain satisfied:

1. **Security**: Uses existing authentication/authorization; Canvas creation uses bot token
2. **Async Processing**: Maintains existing async pattern; Canvas creation in background
3. **Error Handling**: Comprehensive error handling required per spec (FR-007)
4. **Cost Management**: No additional AWS costs; uses Slack API only
5. **Testing**: Unit tests + manual E2E sufficient for functional feature

## Project Structure

### Documentation (this feature)

```text
specs/005-canvas-long-reply/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── slack-canvas-api.yaml  # OpenAPI spec for Canvas creation and sharing
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
lambda/
├── slack-event-handler/            # Slack Event Handler - receives Slack events
│   └── handler.py                  # No changes (passes through to bedrock-processor)
└── bedrock-processor/              # Bedrock Processor - processes with Bedrock
    ├── handler.py                  # MODIFY: Add Canvas creation logic
    ├── bedrock_client.py           # No changes
    ├── slack_poster.py             # MODIFY: Add Canvas creation and sharing
    ├── canvas_creator.py          # NEW: Create Canvas via Slack API
    ├── canvas_sharer.py            # NEW: Share Canvas in thread/channel
    ├── formatting_detector.py     # NEW: Detect structured document formatting
    ├── reply_router.py            # NEW: Determine Canvas vs regular message
    ├── requirements.txt            # MODIFY: Ensure slack-sdk is present
    └── tests/
        ├── test_handler.py         # MODIFY: Test Canvas creation logic
        ├── test_canvas_creator.py  # NEW: Test Canvas creation
        ├── test_canvas_sharer.py   # NEW: Test Canvas sharing
        ├── test_formatting_detector.py  # NEW: Test structured formatting detection
        └── test_reply_router.py    # NEW: Test Canvas vs regular message routing
```

**Structure Decision**: Extension to existing MVP codebase. No new infrastructure or Lambda functions required. Changes limited to:

1. **bedrock-processor/handler.py**: Add logic to determine if reply should use Canvas, create Canvas, and share it
2. **bedrock-processor/slack_poster.py**: MODIFY to support Canvas creation and sharing in addition to regular messages
3. **bedrock-processor/canvas_creator.py**: NEW module to create Canvas via Slack API
4. **bedrock-processor/canvas_sharer.py**: NEW module to share Canvas in thread/channel
5. **bedrock-processor/formatting_detector.py**: NEW module to detect structured document formatting (headings, lists, tables, code blocks)
6. **bedrock-processor/reply_router.py**: NEW module to determine when to use Canvas vs regular message based on length and formatting

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations identified. This feature extension maintains existing architecture and security patterns. Canvas creation adds functional capabilities without introducing architectural complexity.

---

## Post-Phase 1 Constitution Check

_Re-evaluation after Phase 1 design completion._

### Post-Phase 1 Evaluation

| Principle                         | Status               | Compliance                                                                                                                           | Justification                                                                                                                                                                                                                                                      |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Security-First Architecture    | ✅ COMPLIANT         | Canvas creation uses bot token authentication<br>No new attack vectors introduced<br>Content validation prevents abuse | Canvas creation and sharing use existing bot token authentication. No new authentication/authorization mechanisms. Canvas content is generated from AI responses (already processed through security layers). Content size validation prevents resource exhaustion. |
| II. Non-Blocking Async Processing | ✅ COMPLIANT         | Canvas creation in Bedrock Processor (async)                                                                                       | Canvas creation and sharing occur in Bedrock Processor Lambda (background), not blocking Slack Event Handler response. Maintains <3 second response time. Canvas creation may add 2-5 seconds but occurs asynchronously.                                          |
| III. Context History Management   | ✅ N/A               | Not applicable                                                                                                                       | Canvas creation does not require context history. Canvas content generated per-message without persistent storage.                                                                                                                                                 |
| IV. Observability & Monitoring    | ✅ COMPLIANT         | Canvas creation events logged                                                                                                        | Canvas creation attempts, successes, failures logged with correlation IDs. Canvas API errors logged. No PII in logs. Canvas creation metrics tracked (success rate, failure rate, creation time).                                                                  |
| V. Error Handling & Resilience    | ✅ COMPLIANT         | Comprehensive error handling designed                                                                                                | Canvas creation failures, sharing failures, permission errors all handled gracefully. Fallback to regular messages ensures users always receive responses. Error messages logged for debugging.                                                                      |
| VI. Cost Management               | ✅ COMPLIANT         | No additional AWS costs                                                                                                              | Canvas creation uses Slack API only (no AWS service costs). No additional Bedrock API calls. Canvas creation adds API call overhead but within Slack API rate limits.                                                                                             |
| VII. Compliance Standards         | ✅ COMPLIANT         | No compliance changes                                                                                                                | Canvas creation uses existing data protection mechanisms. Canvas content contains AI-generated responses (already processed through security layers). No PII extraction beyond existing patterns.                                                                     |
| VIII. Testing Discipline          | ⚠️ PARTIAL COMPLIANT | Unit tests + manual E2E planned                                                                                                    | Unit tests for Canvas creation, formatting detection, reply routing. Manual E2E testing for Canvas creation flows. BDD scenarios deferred (not security-critical feature).                                                                                     |

### Gate Decision: ✅ PASS

**Rationale**: Phase 1 design maintains all constitution principles. Canvas creation architecture:

1. **Security**: Uses existing authentication; content validation prevents abuse
2. **Async**: Maintains existing async pattern; Canvas creation in background
3. **Error Handling**: Comprehensive error handling designed per spec (FR-007)
4. **Cost Management**: No additional AWS costs; uses Slack API only
5. **Testing**: Unit tests + manual E2E sufficient for functional feature

**Design Validation**:

- Data model defines clear entity boundaries (Canvas Creation Request, Result, Share Request)
- API contracts specify Canvas API payload structures (assumed patterns)
- Error handling covers all edge cases (permissions, rate limits, content size, sharing failures)
- Backward compatibility maintained (regular messages for short, non-structured replies)
- Fallback behavior ensures users always receive responses

**Ready for Phase 2**: `/speckit.tasks` to generate implementation tasks.
