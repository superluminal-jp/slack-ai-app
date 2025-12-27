# Tasks: Canvas for Long Replies

**Input**: Design documents from `/specs/005-canvas-long-reply/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Unit tests are included per plan.md (unit tests + manual E2E). Tests are written before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Lambda functions**: `lambda/execution-stack/bedrock-processor/` at repository root
- **Tests**: `lambda/execution-stack/bedrock-processor/tests/`
- Paths follow existing MVP codebase structure

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure validation

- [x] T001 Verify existing project structure in lambda/execution-stack/bedrock-processor/
- [x] T002 [P] Verify slack-sdk dependency in lambda/execution-stack/bedrock-processor/requirements.txt
- [x] T003 [P] Review existing handler.py structure in lambda/execution-stack/bedrock-processor/handler.py

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create formatting_detector.py module structure in lambda/execution-stack/bedrock-processor/formatting_detector.py
- [x] T005 [P] Create reply_router.py module structure in lambda/execution-stack/bedrock-processor/reply_router.py
- [x] T006 [P] Create canvas_creator.py module structure in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T007 [P] Create canvas_sharer.py module structure in lambda/execution-stack/bedrock-processor/canvas_sharer.py
- [x] T008 Review existing error handling patterns in lambda/execution-stack/bedrock-processor/handler.py for Canvas error handling integration
- [x] T009 Review existing logging patterns in lambda/execution-stack/bedrock-processor/logger.py for Canvas event logging

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Use Canvas for Long Replies and Structured Documents (Priority: P1) 🎯 MVP

**Goal**: Automatically detect long replies (>800 chars) or structured formatting, create Canvas, share it in thread/channel, and post summary message

**Independent Test**: Trigger bot response exceeding 800 chars or with structured formatting, verify Canvas is created and shared with summary message. Can be tested independently by sending a long message or structured content to bot.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T010 [P] [US1] Create test_formatting_detector.py with tests for heading detection in lambda/execution-stack/bedrock-processor/tests/test_formatting_detector.py
- [x] T011 [P] [US1] Create test_formatting_detector.py with tests for list detection in lambda/execution-stack/bedrock-processor/tests/test_formatting_detector.py
- [x] T012 [P] [US1] Create test_formatting_detector.py with tests for code block detection in lambda/execution-stack/bedrock-processor/tests/test_formatting_detector.py
- [x] T013 [P] [US1] Create test_formatting_detector.py with tests for table detection in lambda/execution-stack/bedrock-processor/tests/test_formatting_detector.py
- [x] T014 [P] [US1] Create test_formatting_detector.py with tests for multiple pattern detection (2+ elements) in lambda/execution-stack/bedrock-processor/tests/test_formatting_detector.py
- [x] T015 [P] [US1] Create test_reply_router.py with tests for length threshold (>800 chars) in lambda/execution-stack/bedrock-processor/tests/test_reply_router.py
- [x] T016 [P] [US1] Create test_reply_router.py with tests for structured formatting detection in lambda/execution-stack/bedrock-processor/tests/test_reply_router.py
- [x] T017 [P] [US1] Create test_reply_router.py with tests for regular message decision (<800 chars, no formatting) in lambda/execution-stack/bedrock-processor/tests/test_reply_router.py
- [x] T018 [P] [US1] Create test_canvas_creator.py with tests for successful Canvas creation in lambda/execution-stack/bedrock-processor/tests/test_canvas_creator.py
- [x] T019 [P] [US1] Create test_canvas_sharer.py with tests for Canvas sharing in thread in lambda/execution-stack/bedrock-processor/tests/test_canvas_sharer.py
- [x] T020 [P] [US1] Create test_canvas_sharer.py with tests for Canvas sharing in channel in lambda/execution-stack/bedrock-processor/tests/test_canvas_sharer.py

### Implementation for User Story 1

- [x] T021 [P] [US1] Implement detect_structured_formatting() function with heading pattern detection in lambda/execution-stack/bedrock-processor/formatting_detector.py
- [x] T022 [P] [US1] Implement detect_structured_formatting() function with list pattern detection in lambda/execution-stack/bedrock-processor/formatting_detector.py
- [x] T023 [P] [US1] Implement detect_structured_formatting() function with code block pattern detection in lambda/execution-stack/bedrock-processor/formatting_detector.py
- [x] T024 [P] [US1] Implement detect_structured_formatting() function with table pattern detection in lambda/execution-stack/bedrock-processor/formatting_detector.py
- [x] T025 [US1] Complete detect_structured_formatting() function with threshold logic (2+ elements) in lambda/execution-stack/bedrock-processor/formatting_detector.py
- [x] T026 [P] [US1] Implement should_use_canvas() function with length check (>800 chars) in lambda/execution-stack/bedrock-processor/reply_router.py
- [x] T027 [US1] Complete should_use_canvas() function with formatting check integration in lambda/execution-stack/bedrock-processor/reply_router.py (depends on T025)
- [x] T028 [P] [US1] Implement format_canvas_content() function to structure reply content for Canvas in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T029 [US1] Implement create_canvas() function with Slack API call (assumed canvas.create method) in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T030 [US1] Implement create_canvas() function with success response handling (extract canvas_id) in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T031 [P] [US1] Implement share_canvas() function with thread_ts support in lambda/execution-stack/bedrock-processor/canvas_sharer.py
- [x] T032 [US1] Implement share_canvas() function with channel-only sharing (no thread_ts) in lambda/execution-stack/bedrock-processor/canvas_sharer.py
- [x] T033 [US1] Integrate Canvas creation logic in handler.py after Bedrock response in lambda/execution-stack/bedrock-processor/handler.py (depends on T027, T029, T031)
- [x] T034 [US1] Add Canvas summary message posting in handler.py after Canvas sharing in lambda/execution-stack/bedrock-processor/handler.py (depends on T033)
- [x] T035 [US1] Add logging for Canvas creation attempts in lambda/execution-stack/bedrock-processor/handler.py (per FR-013)
- [x] T036 [US1] Add logging for Canvas creation successes in lambda/execution-stack/bedrock-processor/handler.py (per FR-013)
- [x] T037 [US1] Ensure backward compatibility: regular messages for short, non-structured replies in lambda/execution-stack/bedrock-processor/handler.py (per FR-009)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Bot should create Canvas for long replies (>800 chars) or structured formatting, share it, and post summary message.

---

## Phase 4: User Story 2 - Fallback to Regular Message When Canvas Creation Fails (Priority: P2)

**Goal**: Handle Canvas creation failures gracefully by falling back to regular message posting, ensuring users always receive responses

**Independent Test**: Simulate Canvas creation failures (API errors, permissions) and verify bot posts regular message with appropriate error handling. Can be tested independently by mocking Canvas API failures.

### Tests for User Story 2

- [x] T038 [P] [US2] Create test_canvas_creator.py with tests for API error handling in lambda/execution-stack/bedrock-processor/tests/test_canvas_creator.py
- [x] T039 [P] [US2] Create test_canvas_creator.py with tests for permission error handling in lambda/execution-stack/bedrock-processor/tests/test_canvas_creator.py
- [x] T040 [P] [US2] Create test_canvas_creator.py with tests for rate limit error handling in lambda/execution-stack/bedrock-processor/tests/test_canvas_creator.py
- [x] T041 [P] [US2] Create test_canvas_sharer.py with tests for sharing failure handling in lambda/execution-stack/bedrock-processor/tests/test_canvas_sharer.py
- [x] T042 [P] [US2] Create test_handler.py with tests for fallback to regular message on Canvas creation failure in lambda/execution-stack/bedrock-processor/tests/test_handler.py
- [x] T043 [P] [US2] Create test_handler.py with tests for message truncation when fallback message exceeds 4000 chars in lambda/execution-stack/bedrock-processor/tests/test_handler.py

### Implementation for User Story 2

- [x] T044 [US2] Implement error code mapping for Canvas API errors (api_error, permission_error, rate_limit, content_too_large) in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T045 [US2] Implement create_canvas() function with error response handling in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T046 [US2] Implement share_canvas() function with error handling in lambda/execution-stack/bedrock-processor/canvas_sharer.py
- [x] T047 [US2] Implement fallback_to_regular_message() helper function with message truncation logic in lambda/execution-stack/bedrock-processor/handler.py
- [x] T048 [US2] Integrate fallback logic in handler.py when Canvas creation fails in lambda/execution-stack/bedrock-processor/handler.py (depends on T044, T047)
- [x] T049 [US2] Integrate fallback logic in handler.py when Canvas sharing fails in lambda/execution-stack/bedrock-processor/handler.py (depends on T046, T047)
- [x] T050 [US2] Add error logging for Canvas creation failures in lambda/execution-stack/bedrock-processor/handler.py (per FR-013)
- [x] T051 [US2] Add error logging for Canvas sharing failures in lambda/execution-stack/bedrock-processor/handler.py (per FR-013)
- [x] T052 [US2] Ensure user-friendly error messages (no system crashes) per FR-007 in lambda/execution-stack/bedrock-processor/handler.py

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Bot should handle Canvas failures gracefully and always post responses.

---

## Phase 5: User Story 3 - Canvas Content Formatting and Structure (Priority: P3)

**Goal**: Format Canvas content in readable, structured manner preserving headings, lists, code blocks, tables for better user experience

**Independent Test**: Generate long reply with structured formatting, create Canvas, verify content is well-formatted with preserved structure. Can be tested independently by creating Canvas with structured content.

### Tests for User Story 3

- [x] T053 [P] [US3] Create test_canvas_creator.py with tests for heading preservation in Canvas content in lambda/execution-stack/bedrock-processor/tests/test_canvas_creator.py
- [x] T054 [P] [US3] Create test_canvas_creator.py with tests for list preservation in Canvas content in lambda/execution-stack/bedrock-processor/tests/test_canvas_creator.py
- [x] T055 [P] [US3] Create test_canvas_creator.py with tests for code block preservation in Canvas content in lambda/execution-stack/bedrock-processor/tests/test_canvas_creator.py
- [x] T056 [P] [US3] Create test_canvas_creator.py with tests for table preservation in Canvas content in lambda/execution-stack/bedrock-processor/tests/test_canvas_creator.py
- [x] T057 [P] [US3] Create test_canvas_creator.py with tests for Canvas title/header formatting in lambda/execution-stack/bedrock-processor/tests/test_canvas_creator.py

### Implementation for User Story 3

- [x] T058 [US3] Enhance format_canvas_content() function to preserve heading structure in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T059 [US3] Enhance format_canvas_content() function to preserve list structure in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T060 [US3] Enhance format_canvas_content() function to preserve code block structure in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T061 [US3] Enhance format_canvas_content() function to preserve table structure in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T062 [US3] Add Canvas title/header with "AI Response" indicator in lambda/execution-stack/bedrock-processor/canvas_creator.py (per FR-010, FR-011)
- [x] T063 [US3] Ensure Canvas content structure improves readability (paragraphs, sections) in lambda/execution-stack/bedrock-processor/canvas_creator.py

**Checkpoint**: All user stories should now be independently functional. Canvas content should be well-formatted with preserved structure.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T064 [P] Add comprehensive error handling for Canvas API rate limits with retry logic in lambda/execution-stack/bedrock-processor/canvas_creator.py (per FR-014)
- [x] T065 [P] Add comprehensive error handling for Canvas API timeouts in lambda/execution-stack/bedrock-processor/canvas_creator.py (per FR-014)
- [x] T066 [P] Add content size validation before Canvas creation (100KB limit) in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T067 [P] Add Canvas title length validation (100 char limit) in lambda/execution-stack/bedrock-processor/canvas_creator.py
- [x] T068 [P] Enhance logging with correlation IDs for all Canvas operations in lambda/execution-stack/bedrock-processor/handler.py (per FR-013)
- [x] T069 [P] Add performance monitoring for Canvas creation time in lambda/execution-stack/bedrock-processor/handler.py (target: <5 seconds per SC-002)
- [x] T070 [P] Update documentation in README.md with Canvas feature description
- [ ] T071 [P] Run quickstart.md validation tests in test workspace (REQUIRES MANUAL TESTING)
- [x] T072 Code cleanup and refactoring across all Canvas modules
- [ ] T073 [P] Manual E2E testing: Canvas creation for long replies in test Slack workspace (REQUIRES MANUAL TESTING)
- [ ] T074 [P] Manual E2E testing: Canvas creation for structured formatting in test Slack workspace (REQUIRES MANUAL TESTING)
- [ ] T075 [P] Manual E2E testing: Fallback behavior on Canvas failures in test Slack workspace (REQUIRES MANUAL TESTING)
- [ ] T076 [P] Manual E2E testing: Canvas sharing in threads in test Slack workspace (REQUIRES MANUAL TESTING)
- [ ] T077 [P] Manual E2E testing: Canvas sharing in channels in test Slack workspace (REQUIRES MANUAL TESTING)
- [ ] T078 [P] Manual E2E testing: Backward compatibility (regular messages) in test Slack workspace (REQUIRES MANUAL TESTING)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Depends on US1 Canvas creation logic for fallback testing
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Depends on US1 Canvas creation for formatting enhancement

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Formatting detector before reply router
- Reply router before Canvas creator
- Canvas creator before Canvas sharer
- Canvas modules before handler integration
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, user stories can start sequentially (US1 → US2 → US3)
- All tests for a user story marked [P] can run in parallel
- Formatting detection patterns marked [P] can run in parallel
- Canvas creator and sharer tests marked [P] can run in parallel
- Polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all formatting detection tests together:
Task: "Create test_formatting_detector.py with tests for heading detection in lambda/execution-stack/bedrock-processor/tests/test_formatting_detector.py"
Task: "Create test_formatting_detector.py with tests for list detection in lambda/execution-stack/bedrock-processor/tests/test_formatting_detector.py"
Task: "Create test_formatting_detector.py with tests for code block detection in lambda/execution-stack/bedrock-processor/tests/test_formatting_detector.py"
Task: "Create test_formatting_detector.py with tests for table detection in lambda/execution-stack/bedrock-processor/tests/test_formatting_detector.py"

# Launch all formatting detection pattern implementations together:
Task: "Implement detect_structured_formatting() function with heading pattern detection in lambda/execution-stack/bedrock-processor/formatting_detector.py"
Task: "Implement detect_structured_formatting() function with list pattern detection in lambda/execution-stack/bedrock-processor/formatting_detector.py"
Task: "Implement detect_structured_formatting() function with code block pattern detection in lambda/execution-stack/bedrock-processor/formatting_detector.py"
Task: "Implement detect_structured_formatting() function with table pattern detection in lambda/execution-stack/bedrock-processor/formatting_detector.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Sequential Team Strategy

With single developer or small team:

1. Complete Setup + Foundational together
2. Once Foundational is done:
   - Complete User Story 1 (P1) → Test → Deploy
   - Complete User Story 2 (P2) → Test → Deploy
   - Complete User Story 3 (P3) → Test → Deploy
3. Stories complete and integrate sequentially

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Canvas API methods are assumed and require validation through testing
- All Canvas API calls should include error handling and fallback logic
- Maintain backward compatibility: regular messages for short, non-structured replies

---

## Summary

- **Total Tasks**: 78
- **Tasks per User Story**:
  - User Story 1 (P1): 37 tasks (17 tests + 20 implementation)
  - User Story 2 (P2): 15 tasks (6 tests + 9 implementation)
  - User Story 3 (P3): 11 tasks (5 tests + 6 implementation)
  - Setup: 3 tasks
  - Foundational: 6 tasks
  - Polish: 15 tasks
- **Parallel Opportunities**: 35+ tasks can run in parallel
- **Independent Test Criteria**:
  - US1: Trigger bot response >800 chars or with structured formatting, verify Canvas created and shared
  - US2: Simulate Canvas creation failures, verify fallback to regular message
  - US3: Generate structured reply, verify Canvas content preserves formatting
- **Suggested MVP Scope**: User Story 1 only (P1) - Core Canvas functionality
- **Format Validation**: ✅ All tasks follow checklist format (checkbox, ID, labels, file paths)
