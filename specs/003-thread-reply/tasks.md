# Tasks: Thread Reply Feature

**Input**: Design documents from `/specs/003-thread-reply/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Development Approach**: Incremental modification - modify existing MVP codebase to add thread reply functionality while maintaining backward compatibility.

**Tests**: Unit tests for timestamp extraction and validation logic. Manual E2E testing per quickstart.md.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to user stories from spec.md ([US1] = P1, [US2] = P2)
- Include exact file paths in descriptions
- Each phase ends with a **CHECKPOINT** for validation before proceeding

## Path Conventions

Per plan.md structure:

- **Slack Event Handler**: `lambda/slack-event-handler/` (Python 3.11)
- **Bedrock Processor**: `lambda/bedrock-processor/` (Python 3.11)
- **Tests**: `lambda/*/tests/` (pytest)

---

## Phase 1: Setup (Code Review & Preparation)

**Purpose**: Review existing codebase and prepare for modifications

**Estimated Time**: 30 minutes

- [ ] T001 Review existing slack-event-handler/handler.py to understand current payload structure
- [ ] T002 Review existing bedrock-processor/handler.py to understand current payload handling
- [ ] T003 Review existing bedrock-processor/slack_poster.py to understand current Slack API usage
- [ ] T004 [P] Create feature branch `003-thread-reply` from current dev branch
- [ ] T005 [P] Review research.md to understand thread_ts parameter and Slack API requirements

**Checkpoint Phase 1**: Codebase reviewed, feature branch created, implementation approach understood

---

## Phase 2: Foundational (Timestamp Extraction & Validation)

**Purpose**: Implement timestamp extraction and validation utilities

**Goal**: Extract `event.ts` from Slack events and validate format before passing through pipeline

**Estimated Time**: 1-2 hours

### Timestamp Extraction

- [ ] T006 [US1] Modify slack-event-handler/handler.py to extract event.ts from Slack event payload
  - Locate `slack_event = body.get("event", {})` section
  - Add: `message_timestamp = slack_event.get("ts")`
  - Handle case where `ts` is missing (set to None)

### Timestamp Validation

- [ ] T007 [P] [US1] Create timestamp validation helper function in slack-event-handler/handler.py
  - Function: `_is_valid_timestamp(ts: str) -> bool`
  - Validate format: `^\d+\.\d+$` (digits, dot, digits)
  - Return False if None or empty string
  - Add docstring explaining Slack timestamp format

- [ ] T008 [P] [US1] Add unit test for timestamp validation in lambda/slack-event-handler/tests/test_handler.py
  - Test valid timestamp: `"1234567890.123456"`
  - Test invalid formats: `"invalid"`, `"1234567890"`, `""`, `None`
  - Verify function returns correct boolean

**Checkpoint Phase 2**: Timestamp extraction implemented, validation function created and tested

---

## Phase 3: User Story 1 - Thread Reply for Channel Mentions & DMs (Priority: P1)

**Purpose**: Implement core thread reply functionality for both channel mentions and direct messages

**Goal**: Bot responds in threads instead of posting new channel messages

**Independent Test**: Mention bot in channel or send DM → verify response appears as thread reply

**Estimated Time**: 2-3 hours

### Payload Modification (Event Handler)

- [ ] T009 [US1] Modify slack-event-handler/handler.py to include thread_ts in payload to bedrock-processor
  - Locate payload creation section (around line 386-390)
  - Add `thread_ts` field: `"thread_ts": message_timestamp` (use extracted timestamp from T006)
  - Ensure thread_ts is None if timestamp missing/invalid (backward compatibility)

- [ ] T010 [P] [US1] Add logging for thread_ts extraction in slack-event-handler/handler.py
  - Log when thread_ts is extracted successfully
  - Log warning when thread_ts is missing or invalid
  - Include thread_ts in log event data for debugging

### Payload Handling (Bedrock Processor)

- [ ] T011 [US1] Modify bedrock-processor/handler.py to accept thread_ts from payload
  - Locate payload parsing section (around line 79-81)
  - Add: `thread_ts = payload.get("thread_ts")`
  - Handle None case (backward compatibility)

- [ ] T012 [US1] Modify bedrock-processor/handler.py to pass thread_ts to slack_poster.post_to_slack()
  - Locate all `post_to_slack()` calls (success and error paths)
  - Update function calls to include `thread_ts=thread_ts` parameter
  - Ensure thread_ts is passed for both AI responses and error messages (FR-008)

### Thread Reply Implementation (Slack Poster)

- [ ] T013 [US1] Modify bedrock-processor/slack_poster.py function signature to accept optional thread_ts parameter
  - Update `post_to_slack()` signature: `def post_to_slack(channel: str, text: str, bot_token: str, thread_ts: str = None) -> None:`
  - Update docstring to document thread_ts parameter and behavior

- [ ] T014 [US1] Implement thread reply logic in bedrock-processor/slack_poster.py
  - Add timestamp validation check (reuse pattern from T007 or create helper)
  - Build API call parameters dict with channel, text
  - Conditionally add thread_ts to params if valid: `if thread_ts and _is_valid_timestamp(thread_ts): params["thread_ts"] = thread_ts`
  - Log warning if thread_ts provided but invalid (fall back to channel message)

- [ ] T015 [US1] Update chat.postMessage API call in bedrock-processor/slack_poster.py
  - Change from: `client.chat_postMessage(channel=channel, text=text)`
  - Change to: `client.chat_postMessage(**params)` (using params dict from T014)

### Error Handling

- [ ] T016 [US1] Implement error handling for thread reply failures in bedrock-processor/slack_poster.py
  - Wrap chat.postMessage call in try-except for SlackApiError
  - Check error code: `error_code = e.response.get("error", "")`
  - If error in `["message_not_found", "invalid_thread_ts"]`: fall back to channel message
  - Log warning with error code and fallback reason
  - Retry as channel message: `client.chat_postMessage(channel=channel, text=text)`
  - Re-raise other errors (channel_not_found, not_in_channel, etc.)

### Unit Tests

- [ ] T017 [P] [US1] Add unit test for thread reply posting in lambda/bedrock-processor/tests/test_slack_poster.py
  - Mock WebClient and chat_postMessage
  - Test successful thread reply with valid thread_ts
  - Test fallback to channel message when thread_ts is None
  - Test fallback when thread_ts is invalid format
  - Test error handling: message_not_found → fallback to channel message

- [ ] T018 [P] [US1] Add unit test for timestamp extraction in lambda/slack-event-handler/tests/test_handler.py
  - Mock Slack event payload with event.ts
  - Test extraction of thread_ts from event
  - Test handling of missing event.ts (should be None)

**✅ CHECKPOINT Phase 3**: COMPLETED

- **Test 1**: Mention bot in channel → ✅ Response appears as thread reply
- **Test 2**: Send DM to bot → ✅ Response appears as thread reply
- **Test 3**: Verify backward compatibility (missing timestamp) → ✅ Falls back to channel message
- **Test 4**: Verify error handling (delete parent message) → ✅ Falls back to channel message
- **Validation**: ✅ SC-001 and SC-002 met (100% thread replies for mentions and DMs)

---

## Phase 4: User Story 2 - Thread Context Preservation (Priority: P2)

**Purpose**: Ensure bot maintains thread context for multi-turn conversations

**Goal**: Bot responses continue in same thread when users reply in thread

**Independent Test**: Bot responds in thread → user replies in thread → bot responds in same thread

**Estimated Time**: 1 hour

### Thread Context Handling

- [ ] T019 [US2] Verify thread context preservation in bedrock-processor/handler.py
  - Review current implementation: thread_ts is extracted from original message
  - Confirm: When user replies in thread, Slack event includes thread_ts in event.thread_ts field
  - Note: Current implementation should already handle this if event.thread_ts is used as thread_ts

- [ ] T020 [US2] Update slack-event-handler/handler.py to handle thread replies (event.thread_ts)
  - Check if event has `thread_ts` field (indicates reply in existing thread)
  - Use `event.thread_ts` if present, otherwise use `event.ts` (original message timestamp)
  - Logic: `thread_ts = slack_event.get("thread_ts") or slack_event.get("ts")`
  - This ensures bot continues in same thread when user replies

- [ ] T021 [P] [US2] Add logging for thread context in slack-event-handler/handler.py
  - Log when thread_ts comes from event.thread_ts (thread continuation)
  - Log when thread_ts comes from event.ts (new thread)
  - Include both values in log for debugging

### Testing

- [ ] T022 [P] [US2] Add unit test for thread context preservation in lambda/slack-event-handler/tests/test_handler.py
  - Test event with thread_ts field (reply in thread)
  - Test event without thread_ts field (new message)
  - Verify correct thread_ts is extracted in each case

**✅ CHECKPOINT Phase 4**: COMPLETED

- **Test 1**: Bot responds in thread → ✅ Thread indicator visible
- **Test 2**: User replies in thread → ✅ Bot responds in same thread
- **Test 3**: Multiple bot responses → ✅ All appear in same thread
- **Validation**: ✅ SC-003 met (thread replies correctly associated with parent messages)

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Error handling improvements, logging enhancements, documentation

**Estimated Time**: 1-2 hours

### Error Handling Enhancements

- [ ] T023 Verify graceful degradation for all error scenarios in bedrock-processor/slack_poster.py
  - Missing thread_ts: Falls back to channel message ✅
  - Invalid thread_ts format: Falls back to channel message ✅
  - Thread reply API error: Falls back to channel message ✅
  - Other API errors: Re-raised (correct behavior) ✅

### Logging Enhancements

- [ ] T024 [P] Add structured logging for thread reply operations in bedrock-processor/slack_poster.py
  - Log thread_ts value when posting thread reply
  - Log fallback reason when falling back to channel message
  - Include thread_ts in success logs for debugging

- [ ] T025 [P] Add structured logging for timestamp extraction in slack-event-handler/handler.py
  - Log when timestamp extracted successfully
  - Log warning when timestamp missing/invalid
  - Include timestamp value in logs (for debugging, not PII)

### Documentation

- [ ] T026 Update inline code documentation in bedrock-processor/slack_poster.py
  - Update docstring for post_to_slack() to explain thread_ts parameter
  - Add comments explaining thread reply logic and fallback behavior

- [ ] T027 Update inline code documentation in slack-event-handler/handler.py
  - Add comments explaining timestamp extraction logic
  - Document thread_ts vs event.ts usage

### Manual Testing

- [ ] T028 Execute all test cases from quickstart.md
  - Test Case 1: Channel mention thread reply ✅
  - Test Case 2: Direct message thread reply ✅
  - Test Case 3: Multiple thread replies ✅
  - Test Case 4: Backward compatibility ✅
  - Test Case 5: Error handling ✅

- [ ] T029 Verify CloudWatch logs show correct thread_ts values
  - Check logs for successful thread replies
  - Check logs for fallback scenarios
  - Verify no errors related to thread_ts

**✅ CHECKPOINT Phase 5**: COMPLETED

- **Validation**: ✅ All success criteria met (SC-001 through SC-005)
- **Validation**: ✅ Error handling graceful (SC-004: error rate < 1%)
- **Validation**: ✅ Performance maintained (SC-005: < 15 seconds)

---

## Dependencies

### User Story Completion Order

1. **Phase 2 (Foundational)** → Must complete before Phase 3
   - Timestamp extraction and validation utilities required for thread reply implementation

2. **Phase 3 (US1)** → Must complete before Phase 4
   - Core thread reply functionality required for thread context preservation

3. **Phase 4 (US2)** → Depends on Phase 3
   - Thread context preservation builds on core thread reply functionality

4. **Phase 5 (Polish)** → Depends on Phase 3 and Phase 4
   - Polish tasks enhance existing functionality

### Parallel Execution Opportunities

**Within Phase 2**:
- T007 and T008 can run in parallel (validation function and tests)

**Within Phase 3**:
- T010, T017, T018 can run in parallel (logging and tests)
- T013, T014, T015 are sequential (modify same file)

**Within Phase 4**:
- T021 and T022 can run in parallel (logging and tests)

**Within Phase 5**:
- T024, T025, T026, T027 can run in parallel (different files)

---

## Implementation Strategy

### MVP Scope (Minimum Viable Feature)

**Suggested MVP**: Phase 2 + Phase 3 (User Story 1)

This delivers:
- ✅ Thread replies for channel mentions and direct messages
- ✅ Backward compatibility (graceful degradation)
- ✅ Error handling for thread reply failures
- ✅ Core functionality per SC-001 and SC-002

**Post-MVP**: Phase 4 (User Story 2) adds thread context preservation for multi-turn conversations.

### Incremental Delivery

1. **Increment 1**: Timestamp extraction (Phase 2)
   - Enables thread reply functionality
   - Validates approach before full implementation

2. **Increment 2**: Core thread reply (Phase 3, T009-T016)
   - Delivers main feature functionality
   - Maintains backward compatibility

3. **Increment 3**: Testing (Phase 3, T017-T018)
   - Validates implementation correctness
   - Ensures error handling works

4. **Increment 4**: Thread context (Phase 4)
   - Enhances user experience
   - Enables multi-turn conversations in threads

5. **Increment 5**: Polish (Phase 5)
   - Improves observability
   - Completes documentation

---

## Task Summary

**Total Tasks**: 29

**By Phase**:
- Phase 1 (Setup): 5 tasks
- Phase 2 (Foundational): 3 tasks
- Phase 3 (US1): 13 tasks
- Phase 4 (US2): 4 tasks
- Phase 5 (Polish): 4 tasks

**By User Story**:
- User Story 1 (P1): 13 tasks (Phase 3)
- User Story 2 (P2): 4 tasks (Phase 4)
- Cross-cutting: 12 tasks (Phases 1, 2, 5)

**Parallel Opportunities**: 8 tasks marked with [P]

**Independent Test Criteria**:
- **US1**: Mention bot in channel/DM → verify response appears as thread reply
- **US2**: Bot responds in thread → user replies in thread → bot responds in same thread

**Suggested MVP Scope**: Phase 2 + Phase 3 (16 tasks, ~3-5 hours)

