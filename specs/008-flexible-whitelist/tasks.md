# Tasks: 柔軟なホワイトリスト認可

**Input**: Design documents from `/specs/008-flexible-whitelist/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included as this is a security-critical feature modification requiring validation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `lambda/verification-stack/slack-event-handler/` at repository root
- Paths shown below are relative to repository root

## Phase 1: User Story 1 - ホワイトリスト未設定時の全許可 (Priority: P1) 🎯 MVP

**Goal**: ホワイトリストが完全に空の場合、すべてのリクエストを許可するように変更する。

**Independent Test**: ホワイトリストが空の状態でリクエストを送信し、すべてのリクエストが承認されることを確認できる。これにより、システムが正常に動作し、かつ制限がない場合の動作を検証できる。

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T001 [P] [US1] Add test for empty whitelist allowing all requests in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T002 [P] [US1] Add test for empty whitelist from DynamoDB in lambda/verification-stack/slack-event-handler/tests/test_whitelist_loader.py
- [x] T003 [P] [US1] Add test for empty whitelist from Secrets Manager in lambda/verification-stack/slack-event-handler/tests/test_whitelist_loader.py
- [x] T004 [P] [US1] Add test for empty whitelist from environment variables in lambda/verification-stack/slack-event-handler/tests/test_whitelist_loader.py

### Implementation for User Story 1

- [x] T005 [US1] Remove empty whitelist check from get_whitelist_from_dynamodb() in lambda/verification-stack/slack-event-handler/whitelist_loader.py (remove lines 157-160)
- [x] T006 [US1] Remove empty whitelist check from get_whitelist_from_secrets_manager() in lambda/verification-stack/slack-event-handler/whitelist_loader.py
- [x] T007 [US1] Remove empty whitelist check from get_whitelist_from_env() in lambda/verification-stack/slack-event-handler/whitelist_loader.py (remove lines 292-295)
- [x] T008 [US1] Modify authorize_request() to allow all requests when whitelist is empty in lambda/verification-stack/slack-event-handler/authorization.py (add check before entity validation loop)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Empty whitelist should allow all requests.

---

## Phase 2: User Story 2 - 部分的なホワイトリスト設定 (Priority: P1)

**Goal**: 特定のエンティティ（例：channel_id のみ）のみがホワイトリストに設定されている場合、設定されたエンティティのみをチェックし、設定されていないエンティティは無視する。

**Independent Test**: channel_id のみをホワイトリストに設定し、異なる team_id、user_id の組み合わせでリクエストを送信できる。許可された channel_id のリクエストは承認され、拒否された channel_id のリクエストは拒否されることを確認できる。

### Tests for User Story 2

- [x] T009 [P] [US2] Add test for channel_id-only whitelist allowing any team_id and user_id in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T010 [P] [US2] Add test for channel_id-only whitelist rejecting unauthorized channel_id in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T011 [P] [US2] Add test for team_id-only whitelist in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T012 [P] [US2] Add test for user_id-only whitelist in lambda/verification-stack/slack-event-handler/tests/test_authorization.py

### Implementation for User Story 2

- [x] T013 [US2] Modify authorize_request() to check if whitelist set is empty before validating entity in lambda/verification-stack/slack-event-handler/authorization.py (modify team_id check at lines 147-151)
- [x] T014 [US2] Modify authorize_request() to check if whitelist set is empty before validating entity in lambda/verification-stack/slack-event-handler/authorization.py (modify user_id check at lines 153-157)
- [x] T015 [US2] Modify authorize_request() to check if whitelist set is empty before validating entity in lambda/verification-stack/slack-event-handler/authorization.py (modify channel_id check at lines 159-163)
- [x] T016 [US2] Update docstring for authorize_request() to reflect new flexible whitelist behavior in lambda/verification-stack/slack-event-handler/authorization.py

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Partial whitelist configuration should work correctly.

---

## Phase 3: User Story 3 - 複数エンティティの組み合わせ設定 (Priority: P2)

**Goal**: 複数のエンティティ（例：team_id と channel_id）をホワイトリストに設定した場合、設定されたエンティティのみがチェックされ、設定されていないエンティティは無視される。

**Independent Test**: team_id と channel_id をホワイトリストに設定し、異なる user_id でリクエストを送信できる。許可された team_id と channel_id の組み合わせは承認され、user_id はチェックされないことを確認できる。

### Tests for User Story 3

- [x] T017 [P] [US3] Add test for team_id and channel_id combination allowing any user_id in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T018 [P] [US3] Add test for team_id and user_id combination allowing any channel_id in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T019 [P] [US3] Add test for user_id and channel_id combination allowing any team_id in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T020 [P] [US3] Add test for rejecting when one configured entity is unauthorized in lambda/verification-stack/slack-event-handler/tests/test_authorization.py

### Implementation for User Story 3

- [x] T021 [US3] Add logging for skipped entities (when whitelist set is empty) in lambda/verification-stack/slack-event-handler/authorization.py
- [x] T022 [US3] Update log messages to indicate which entities were checked vs skipped in lambda/verification-stack/slack-event-handler/authorization.py

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work independently. Multiple entity combinations should work correctly.

---

## Phase 4: User Story 4 - 全エンティティ設定時の従来動作維持 (Priority: P2)

**Goal**: team_id、user_id、channel_id のすべてをホワイトリストに設定した場合、従来通りすべてのエンティティがチェックされ、すべてがホワイトリストに含まれている場合のみ承認される（後方互換性の維持）。

**Independent Test**: 3 つのエンティティすべてをホワイトリストに設定し、すべてが一致する場合と、1 つでも不一致の場合でリクエストを送信できる。従来の AND 条件の動作が維持されることを確認できる。

### Tests for User Story 4

- [x] T023 [P] [US4] Add test for all entities configured maintaining AND condition behavior in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T024 [P] [US4] Add test for all entities configured rejecting when one entity is unauthorized in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T025 [P] [US4] Update existing BDD test scenarios to verify backward compatibility in lambda/verification-stack/slack-event-handler/tests/test_authorization.feature

### Implementation for User Story 4

- [x] T026 [US4] Verify existing authorization logic works correctly when all entities are configured in lambda/verification-stack/slack-event-handler/authorization.py
- [x] T027 [US4] Update module docstring to document flexible whitelist behavior and backward compatibility in lambda/verification-stack/slack-event-handler/authorization.py

**Checkpoint**: All user stories should now be independently functional. Backward compatibility is maintained for existing users with all entities configured.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T028 [P] Update documentation in docs/security/authentication-authorization.md to reflect flexible whitelist behavior
- [x] T029 [P] Update quickstart.md validation scenarios in specs/008-flexible-whitelist/quickstart.md
- [x] T030 [P] Add integration tests for end-to-end whitelist scenarios in lambda/verification-stack/slack-event-handler/tests/test_authorization.py
- [x] T031 [P] Update error handling to maintain fail-closed behavior on configuration load failure in lambda/verification-stack/slack-event-handler/authorization.py
- [x] T032 Verify all existing tests pass (backward compatibility check)
- [x] T033 [P] Code cleanup and refactoring in lambda/verification-stack/slack-event-handler/authorization.py
- [x] T034 [P] Code cleanup and refactoring in lambda/verification-stack/slack-event-handler/whitelist_loader.py
- [x] T035 Performance validation: ensure authorization latency remains ≤10ms (p95)

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies - can start immediately (MVP)
- **User Story 2 (Phase 2)**: Depends on Phase 1 completion - builds on empty whitelist logic
- **User Story 3 (Phase 3)**: Depends on Phase 2 completion - extends partial whitelist logic
- **User Story 4 (Phase 4)**: Depends on Phase 3 completion - verifies backward compatibility
- **Polish (Phase 5)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start immediately - No dependencies on other stories
- **User Story 2 (P1)**: Depends on User Story 1 - Uses the empty whitelist logic as foundation
- **User Story 3 (P2)**: Depends on User Story 2 - Extends partial whitelist to multiple entities
- **User Story 4 (P2)**: Depends on User Story 3 - Verifies backward compatibility with new logic

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Core logic modification before logging updates
- Implementation before documentation updates
- Story complete before moving to next priority

### Parallel Opportunities

- All test tasks marked [P] within a user story can run in parallel
- Documentation updates (T028, T029) can run in parallel
- Code cleanup tasks (T033, T034) can run in parallel
- Integration tests (T030) can run in parallel with other polish tasks

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Add test for empty whitelist allowing all requests in lambda/verification-stack/slack-event-handler/tests/test_authorization.py"
Task: "Add test for empty whitelist from DynamoDB in lambda/verification-stack/slack-event-handler/tests/test_whitelist_loader.py"
Task: "Add test for empty whitelist from Secrets Manager in lambda/verification-stack/slack-event-handler/tests/test_whitelist_loader.py"
Task: "Add test for empty whitelist from environment variables in lambda/verification-stack/slack-event-handler/tests/test_whitelist_loader.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: User Story 1 (Empty Whitelist)
2. **STOP and VALIDATE**: Test User Story 1 independently
3. Deploy/demo if ready

### Incremental Delivery

1. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
2. Add User Story 2 → Test independently → Deploy/Demo
3. Add User Story 3 → Test independently → Deploy/Demo
4. Add User Story 4 → Test independently → Deploy/Demo (Backward Compatibility Verified)
5. Polish phase → Final validation → Production ready

### Parallel Team Strategy

With multiple developers:

1. Developer A: User Story 1 (MVP)
2. Once User Story 1 is complete:
   - Developer A: User Story 2
   - Developer B: User Story 3 (can start after US2)
3. Once User Stories 1-3 are complete:
   - Developer A: User Story 4
   - Developer B: Polish tasks

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- This is a modification of existing code - no new infrastructure needed
- Maintain backward compatibility for existing users with all entities configured
- Fail-closed behavior must be maintained for configuration load failures

---

## Task Summary

**Total Tasks**: 35

**Tasks per User Story**:

- User Story 1: 8 tasks (4 tests + 4 implementation)
- User Story 2: 8 tasks (4 tests + 4 implementation)
- User Story 3: 6 tasks (4 tests + 2 implementation)
- User Story 4: 5 tasks (3 tests + 2 implementation)
- Polish: 8 tasks

**Parallel Opportunities**: 20 tasks marked [P]

**Independent Test Criteria**:

- US1: Empty whitelist allows all requests
- US2: Partial whitelist (single entity) works correctly
- US3: Multiple entity combinations work correctly
- US4: All entities configured maintains backward compatibility

**Suggested MVP Scope**: User Story 1 only (8 tasks) - provides basic flexible whitelist functionality
