# Tasks: ホワイトリスト認可

**Input**: Design documents from `/specs/007-whitelist-auth/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: BDD tests are included for security-critical authorization flows as specified in the constitution.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Lambda function**: `lambda/slack-event-handler/` at repository root
- **Tests**: `lambda/slack-event-handler/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and infrastructure setup

- [x] T001 Create DynamoDB table `slack-whitelist-config` with partition key `entity_type` and sort key `entity_id` (CDK or AWS CLI)
- [x] T002 [P] Update Lambda execution role IAM policy to grant DynamoDB read access for `slack-whitelist-config` table in `cdk/lib/slack-bedrock-stack.ts`
- [x] T003 [P] Update Lambda execution role IAM policy to grant Secrets Manager read access for `slack-whitelist-config` secret in `cdk/lib/slack-bedrock-stack.ts`
- [x] T004 [P] Add environment variables for whitelist configuration (WHITELIST_TABLE_NAME, WHITELIST_SECRET_NAME, WHITELIST_TEAM_IDS, WHITELIST_USER_IDS, WHITELIST_CHANNEL_IDS) in `cdk/lib/slack-bedrock-stack.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create `lambda/slack-event-handler/whitelist_loader.py` with function `load_whitelist_config()` that reads from DynamoDB, Secrets Manager, or environment variables (priority order)
- [x] T006 Implement in-memory cache with 5-minute TTL in `lambda/slack-event-handler/whitelist_loader.py` for whitelist configuration
- [x] T007 Implement `get_whitelist_from_dynamodb()` function in `lambda/slack-event-handler/whitelist_loader.py` to query DynamoDB table
- [x] T008 Implement `get_whitelist_from_secrets_manager()` function in `lambda/slack-event-handler/whitelist_loader.py` to read from Secrets Manager
- [x] T009 Implement `get_whitelist_from_env()` function in `lambda/slack-event-handler/whitelist_loader.py` to parse environment variables
- [x] T010 Implement fail-closed error handling in `lambda/slack-event-handler/whitelist_loader.py` (raise AuthorizationError when config load fails or whitelist is empty)
- [x] T011 [P] Create `lambda/slack-event-handler/tests/test_whitelist_loader.py` with unit tests for DynamoDB, Secrets Manager, and environment variable loading
- [x] T012 [P] Create `lambda/slack-event-handler/tests/test_whitelist_loader.py` with unit tests for cache TTL and invalidation logic
- [x] T013 [P] Create `lambda/slack-event-handler/tests/test_whitelist_loader.py` with unit tests for fail-closed error handling

**Checkpoint**: Foundation ready - whitelist configuration loading is complete and tested. User story implementation can now begin.

---

## Phase 3: User Story 1 - 認可済みユーザーが AI 機能を利用する (Priority: P1) 🎯 MVP

**Goal**: 認可済みのワークスペース、ユーザー、チャンネルからリクエストが送信された場合、システムはリクエストを承認し、AI 処理を実行する。

**Independent Test**: 認可済みの team_id、user_id、channel_id でリクエストを送信し、AI 処理が正常に実行されることを確認できます。これにより、認可機能が正しく動作し、許可されたユーザーがサービスを利用できることを検証できます。

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [P] [US1] Create BDD scenario for authorized user request in `lambda/slack-event-handler/tests/test_authorization.feature` with Given-When-Then for authorized team_id, user_id, channel_id
- [x] T015 [P] [US1] Create unit test for `authorize_request()` with all entities authorized in `lambda/slack-event-handler/tests/test_authorization.py`
- [x] T016 [P] [US1] Create integration test for end-to-end authorized request flow in `lambda/slack-event-handler/tests/test_handler.py`

### Implementation for User Story 1

- [x] T017 [P] [US1] Create `AuthorizationResult` dataclass in `lambda/slack-event-handler/authorization.py` with fields: authorized, team_id, user_id, channel_id, unauthorized_entities, error_message, timestamp
- [x] T018 [US1] Create `AuthorizationError` exception class in `lambda/slack-event-handler/authorization.py` for configuration load failures
- [x] T019 [US1] Implement `authorize_request(team_id, user_id, channel_id)` function in `lambda/slack-event-handler/authorization.py` that checks all three entities against whitelist (AND condition)
- [x] T020 [US1] Implement whitelist lookup logic using sets for O(1) lookup in `lambda/slack-event-handler/authorization.py`
- [x] T021 [US1] Add success logging for authorized requests in `lambda/slack-event-handler/authorization.py` using existing logger module
- [x] T022 [US1] Integrate whitelist authorization call in `lambda/slack-event-handler/handler.py` after Existence Check (3b) succeeds and before Execution API invocation
- [x] T023 [US1] Update `lambda/slack-event-handler/handler.py` to continue processing when authorization succeeds (authorized=True)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Authorized users can successfully use the AI feature.

---

## Phase 4: User Story 2 - 未認可ユーザーがリクエストを送信する (Priority: P1)

**Goal**: 未認可のワークスペース、ユーザー、またはチャンネルからリクエストが送信された場合、システムはリクエストを拒否し、セキュリティイベントを記録する。

**Independent Test**: 未認可の team_id、user_id、または channel_id でリクエストを送信し、403 Forbidden が返され、セキュリティログが記録されることを確認できます。これにより、認可機能がセキュリティを正しく保護することを検証できます。

### Tests for User Story 2

- [x] T024 [P] [US2] Create BDD scenario for unauthorized team_id request in `lambda/slack-event-handler/tests/test_authorization.feature` with Given-When-Then for 403 response and security log
- [x] T025 [P] [US2] Create BDD scenario for unauthorized user_id request in `lambda/slack-event-handler/tests/test_authorization.feature` with Given-When-Then for 403 response and security log
- [x] T026 [P] [US2] Create BDD scenario for unauthorized channel_id request in `lambda/slack-event-handler/tests/test_authorization.feature` with Given-When-Then for 403 response and security log
- [x] T027 [P] [US2] Create unit test for `authorize_request()` with unauthorized team_id in `lambda/slack-event-handler/tests/test_authorization.py`
- [x] T028 [P] [US2] Create unit test for `authorize_request()` with unauthorized user_id in `lambda/slack-event-handler/tests/test_authorization.py`
- [x] T029 [P] [US2] Create unit test for `authorize_request()` with unauthorized channel_id in `lambda/slack-event-handler/tests/test_authorization.py`
- [x] T030 [P] [US2] Create unit test for `authorize_request()` with missing entity IDs (treated as unauthorized) in `lambda/slack-event-handler/tests/test_authorization.py`
- [x] T031 [P] [US2] Create integration test for end-to-end unauthorized request flow returning 403 in `lambda/slack-event-handler/tests/test_handler.py`

### Implementation for User Story 2

- [x] T032 [US2] Update `authorize_request()` in `lambda/slack-event-handler/authorization.py` to populate `unauthorized_entities` list when authorization fails
- [x] T033 [US2] Add error logging for unauthorized requests in `lambda/slack-event-handler/authorization.py` with unauthorized_entities details using existing logger module
- [x] T034 [US2] Update `lambda/slack-event-handler/handler.py` to return 403 Forbidden when authorization fails (authorized=False)
- [x] T035 [US2] Add security event logging in `lambda/slack-event-handler/handler.py` when authorization fails with event type "whitelist_authorization_failed"
- [x] T036 [US2] Implement fail-closed handling in `lambda/slack-event-handler/handler.py` when AuthorizationError is raised (config load failure)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Unauthorized requests are properly rejected with 403 and security logs are recorded.

---

## Phase 5: User Story 3 - 管理者がホワイトリストを管理する (Priority: P2)

**Goal**: 管理者がホワイトリストに team_id、user_id、channel_id を追加または削除できる。

**Independent Test**: ホワイトリストに新しい team_id を追加し、その team_id でリクエストが承認されることを確認できます。また、削除した user_id でリクエストが拒否されることを確認できます。これにより、ホワイトリスト管理機能が正しく動作することを検証できます。

### Tests for User Story 3

- [x] T037 [P] [US3] Create integration test for DynamoDB whitelist update (add team_id) and immediate authorization success in `lambda/slack-event-handler/tests/test_whitelist_loader.py`
- [x] T038 [P] [US3] Create integration test for DynamoDB whitelist update (remove user_id) and immediate authorization failure in `lambda/slack-event-handler/tests/test_whitelist_loader.py`
- [x] T039 [P] [US3] Create integration test for cache TTL expiration and whitelist update reflection in `lambda/slack-event-handler/tests/test_whitelist_loader.py`
- [x] T040 [P] [US3] Create integration test for Secrets Manager whitelist update reflection in `lambda/slack-event-handler/tests/test_whitelist_loader.py`
- [x] T041 [P] [US3] Create integration test for environment variable whitelist update (requires redeploy) in `lambda/slack-event-handler/tests/test_whitelist_loader.py`

### Implementation for User Story 3

- [x] T042 [US3] Update `load_whitelist_config()` in `lambda/slack-event-handler/whitelist_loader.py` to handle cache TTL expiration and reload from source
- [x] T043 [US3] Add cache invalidation logic in `lambda/slack-event-handler/whitelist_loader.py` when TTL expires (5 minutes)
- [x] T044 [US3] Document whitelist management procedures in `specs/007-whitelist-auth/quickstart.md` for DynamoDB, Secrets Manager, and environment variable updates

**Note**: User Story 3 focuses on the ability to manage whitelist entries through configuration sources. The actual management UI/API is out of scope per spec. This phase ensures that whitelist updates are properly reflected when configuration sources are updated.

**Checkpoint**: All user stories should now be independently functional. Whitelist updates through configuration sources are properly reflected.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T045 [P] Add CloudWatch metrics for whitelist authorization (WhitelistAuthorizationSuccess, WhitelistAuthorizationFailed, WhitelistAuthorizationLatency) in `lambda/slack-event-handler/authorization.py`
- [x] T046 [P] Add CloudWatch metrics for whitelist config loading (WhitelistConfigLoadErrors) in `lambda/slack-event-handler/whitelist_loader.py`
- [x] T047 [P] Create CloudWatch alarms for whitelist authorization failures (5 failures in 5 minutes) in `cdk/lib/slack-bedrock-stack.ts`
- [x] T048 [P] Create CloudWatch alarms for whitelist config load errors in `cdk/lib/slack-bedrock-stack.ts`
- [x] T049 Update documentation in `docs/security/implementation.md` to include whitelist authorization (3c) layer details
- [x] T050 Update documentation in `docs/security/authentication-authorization.md` to include whitelist authorization flow
- [x] T051 Update architecture diagram in `docs/architecture/overview.md` to show whitelist authorization layer
- [x] T052 [P] Add performance tests to verify ≤50ms (p95) authorization latency in `lambda/slack-event-handler/tests/test_authorization.py`
- [x] T053 [P] Add edge case tests for empty whitelist (fail-closed) in `lambda/slack-event-handler/tests/test_authorization.py`
- [x] T054 [P] Add edge case tests for config load failure (fail-closed) in `lambda/slack-event-handler/tests/test_authorization.py`
- [x] T055 [P] Add edge case tests for partial authorization (reject) in `lambda/slack-event-handler/tests/test_authorization.py`
- [x] T056 Run quickstart.md validation to ensure all setup steps work correctly
- [x] T057 Code cleanup and refactoring: ensure consistent error handling patterns across authorization.py and whitelist_loader.py
- [x] T058 Security review: verify fail-closed principle is consistently applied, verify no PII in logs

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
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Depends on US1 authorization logic but should be independently testable
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Depends on whitelist_loader.py but should be independently testable

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T002, T003, T004)
- All Foundational test tasks marked [P] can run in parallel (T011, T012, T013)
- Once Foundational phase completes, User Stories 1 and 2 can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- All Polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Create BDD scenario for authorized user request in lambda/slack-event-handler/tests/test_authorization.feature"
Task: "Create unit test for authorize_request() with all entities authorized in lambda/slack-event-handler/tests/test_authorization.py"
Task: "Create integration test for end-to-end authorized request flow in lambda/slack-event-handler/tests/test_handler.py"

# Launch model/exception creation:
Task: "Create AuthorizationResult dataclass in lambda/slack-event-handler/authorization.py"
Task: "Create AuthorizationError exception class in lambda/slack-event-handler/authorization.py"
```

---

## Parallel Example: User Story 2

```bash
# Launch all BDD scenarios together:
Task: "Create BDD scenario for unauthorized team_id request in lambda/slack-event-handler/tests/test_authorization.feature"
Task: "Create BDD scenario for unauthorized user_id request in lambda/slack-event-handler/tests/test_authorization.feature"
Task: "Create BDD scenario for unauthorized channel_id request in lambda/slack-event-handler/tests/test_authorization.feature"

# Launch all unit tests together:
Task: "Create unit test for authorize_request() with unauthorized team_id in lambda/slack-event-handler/tests/test_authorization.py"
Task: "Create unit test for authorize_request() with unauthorized user_id in lambda/slack-event-handler/tests/test_authorization.py"
Task: "Create unit test for authorize_request() with unauthorized channel_id in lambda/slack-event-handler/tests/test_authorization.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (DynamoDB table, IAM permissions, environment variables)
2. Complete Phase 2: Foundational (whitelist_loader.py with all three sources and caching)
3. Complete Phase 3: User Story 1 (authorization logic and handler integration)
4. **STOP and VALIDATE**: Test User Story 1 independently with authorized requests
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (Security hardening)
4. Add User Story 3 → Test independently → Deploy/Demo (Management capability)
5. Add Polish → Final validation → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (authorized flow)
   - Developer B: User Story 2 (unauthorized flow)
3. After US1 and US2 complete:
   - Developer C: User Story 3 (management)
   - Developer A/B: Polish phase (monitoring, documentation)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Security-critical: All authorization failures must be logged
- Performance-critical: Authorization must complete in ≤50ms (p95)
- Fail-closed principle: All errors result in request rejection (403)

---

## Task Summary

- **Total Tasks**: 58
- **Phase 1 (Setup)**: 4 tasks
- **Phase 2 (Foundational)**: 9 tasks
- **Phase 3 (User Story 1)**: 10 tasks
- **Phase 4 (User Story 2)**: 15 tasks
- **Phase 5 (User Story 3)**: 8 tasks
- **Phase 6 (Polish)**: 12 tasks

**Suggested MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1 only) = 23 tasks

**Parallel Opportunities**:

- Setup: 3 parallel tasks
- Foundational tests: 3 parallel tasks
- User Story 1 tests: 3 parallel tasks
- User Story 2 tests: 7 parallel tasks
- User Story 3 tests: 5 parallel tasks
- Polish: 8 parallel tasks
