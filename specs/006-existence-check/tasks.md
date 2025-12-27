# Tasks: Two-Key Defense (Signing Secret + Bot Token)

**Input**: Design documents from `/specs/006-existence-check/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: BDD scenarios required for security-critical feature per Constitution Principle VIII. Unit tests for cache logic, retry logic, error handling.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Lambda functions: `lambda/verification-stack/slack-event-handler/`
- CDK infrastructure: `cdk/lib/constructs/`
- Tests: `lambda/verification-stack/slack-event-handler/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependency management, and CDK infrastructure setup

- [x] T001 Create DynamoDB table construct for Existence Check cache in `cdk/lib/constructs/existence-check-cache.ts` with partition key `cache_key`, TTL attribute `ttl`, PAY_PER_REQUEST billing mode
- [x] T002 Modify CDK stack to instantiate ExistenceCheckCache construct in `cdk/lib/slack-bedrock-stack.ts`
- [x] T003 Grant SlackEventHandler Lambda read/write permissions to ExistenceCheckCache table in `cdk/lib/slack-bedrock-stack.ts`
- [x] T004 Update SlackEventHandler Lambda environment variable for cache table name in `cdk/lib/constructs/slack-event-handler.ts` (add `EXISTENCE_CHECK_CACHE_TABLE`)
- [x] T005 [P] Verify slack-sdk dependency exists in `lambda/verification-stack/slack-event-handler/requirements.txt` (should already be present)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Existence Check infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Create ExistenceCheckError exception class in `lambda/verification-stack/slack-event-handler/existence_check.py`
- [x] T007 Create cache helper functions `get_from_cache()` and `save_to_cache()` in `lambda/verification-stack/slack-event-handler/existence_check.py` for DynamoDB cache operations
- [x] T008 Create `check_entity_existence()` function skeleton in `lambda/verification-stack/slack-event-handler/existence_check.py` with Bot Token parameter and team_id, user_id, channel_id parameters
- [x] T009 Implement cache key generation function `_generate_cache_key()` in `lambda/verification-stack/slack-event-handler/existence_check.py` using format `{team_id}#{user_id}#{channel_id}`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Verify Real Slack Entities (Priority: P1) 🎯 MVP

**Goal**: When a request arrives from Slack, the system verifies that the team, user, and channel mentioned in the request actually exist in Slack before processing the request. This prevents attackers who have stolen only the Signing Secret from creating fake requests with made-up IDs.

**Independent Test**: Send a request with valid signature but invalid team_id/user_id/channel_id, and verify the system rejects it with a 403 error. Can be fully tested independently without caching or error handling features.

### Implementation for User Story 1

- [x] T010 [US1] Implement team_id verification using `client.team_info(team=team_id)` in `lambda/verification-stack/slack-event-handler/existence_check.py`
- [x] T011 [US1] Implement user_id verification using `client.users_info(user=user_id)` in `lambda/verification-stack/slack-event-handler/existence_check.py`
- [x] T012 [US1] Implement channel_id verification using `client.conversations_info(channel=channel_id)` in `lambda/verification-stack/slack-event-handler/existence_check.py`
- [x] T013 [US1] Add error handling for "team_not_found" error in `lambda/verification-stack/slack-event-handler/existence_check.py` (raise ExistenceCheckError)
- [x] T014 [US1] Add error handling for "user_not_found" error in `lambda/verification-stack/slack-event-handler/existence_check.py` (raise ExistenceCheckError)
- [x] T015 [US1] Add error handling for "channel_not_found" error in `lambda/verification-stack/slack-event-handler/existence_check.py` (raise ExistenceCheckError)
- [x] T016 [US1] Integrate Existence Check into handler after signature verification in `lambda/verification-stack/slack-event-handler/handler.py` (call `check_entity_existence()` after signature verification succeeds)
- [x] T017 [US1] Add 403 Forbidden response when ExistenceCheckError is raised in `lambda/verification-stack/slack-event-handler/handler.py`
- [x] T018 [US1] Add security event logging for existence check failures in `lambda/verification-stack/slack-event-handler/handler.py` (log team_id, user_id, channel_id, error details)
- [x] T019 [US1] Handle missing team_id, user_id, or channel_id gracefully in `lambda/verification-stack/slack-event-handler/handler.py` (skip existence check for missing fields, verify only available fields per FR-012)
- [x] T020 [US1] Handle Bot Token unavailability gracefully in `lambda/verification-stack/slack-event-handler/handler.py` (skip existence check, log warning per FR-011)
- [x] T021 [US1] Write BDD scenario for valid signature with fake team_id in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.feature` (Given/When/Then format)
- [x] T022 [US1] Write BDD scenario for valid signature with fake user_id in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.feature`
- [x] T023 [US1] Write BDD scenario for valid signature with fake channel_id in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.feature`
- [x] T024 [US1] Write unit test for team_id verification success in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py`
- [x] T025 [US1] Write unit test for user_id verification success in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py`
- [x] T026 [US1] Write unit test for channel_id verification success in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py`
- [x] T027 [US1] Write unit test for team_id verification failure in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py`
- [x] T028 [US1] Write unit test for user_id verification failure in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py`
- [x] T029 [US1] Write unit test for channel_id verification failure in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py`
- [x] T030 [US1] Write integration test for handler with Existence Check in `lambda/verification-stack/slack-event-handler/tests/test_handler.py` (mock Slack API calls)

**Checkpoint**: ✅ User Story 1 is fully functional - system verifies entities exist in Slack and rejects invalid requests

---

## Phase 4: User Story 2 - Cache Verification Results (Priority: P2)

**Goal**: To minimize performance impact, the system caches successful verification results so that repeated requests from the same team/user/channel combination don't require additional Slack API calls.

**Independent Test**: Send two identical requests and verify the second request uses cached result (no Slack API calls) and completes faster. Can be fully tested independently without error handling features.

### Implementation for User Story 2

- [x] T031 [US2] Implement cache lookup before Slack API calls in `lambda/verification-stack/slack-event-handler/existence_check.py` (check cache using `get_from_cache()`)
- [x] T032 [US2] Return early if cache hit found in `lambda/verification-stack/slack-event-handler/existence_check.py` (skip Slack API calls)
- [x] T033 [US2] Implement cache write after successful verification in `lambda/verification-stack/slack-event-handler/existence_check.py` (call `save_to_cache()` with TTL 300 seconds)
- [x] T034 [US2] Add cache hit logging in `lambda/verification-stack/slack-event-handler/existence_check.py` (log "existence_check_cache_hit" event)
- [x] T035 [US2] Add cache miss logging in `lambda/verification-stack/slack-event-handler/existence_check.py` (log "existence_check_cache_miss" event)
- [x] T036 [US2] Handle cache read failures gracefully in `lambda/verification-stack/slack-event-handler/existence_check.py` (log warning, proceed to Slack API call)
- [x] T037 [US2] Handle cache write failures gracefully in `lambda/verification-stack/slack-event-handler/existence_check.py` (log warning, continue processing)
- [x] T038 [US2] Write unit test for cache hit scenario in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py` (mock DynamoDB get_item returning valid cache entry)
- [x] T039 [US2] Write unit test for cache miss scenario in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py` (mock DynamoDB get_item returning None)
- [x] T040 [US2] Write unit test for cache write after verification in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py` (verify put_item called with correct TTL)
- [x] T041 [US2] Write unit test for expired cache entry in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py` (cache entry with ttl < current_time)
- [x] T042 [US2] Write integration test for cache hit in `lambda/verification-stack/slack-event-handler/tests/test_handler.py` (send two identical requests, verify second uses cache)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - system verifies entities and caches results

---

## Phase 5: User Story 3 - Handle Slack API Failures Securely (Priority: P2)

**Goal**: When Slack API is unavailable or returns errors, the system must fail securely by rejecting requests rather than allowing potentially forged requests through.

**Independent Test**: Simulate Slack API timeouts or errors and verify the system rejects requests with 403. Can be fully tested independently without caching features.

### Implementation for User Story 3

- [x] T043 [US3] Add 2-second timeout to Slack API client in `lambda/verification-stack/slack-event-handler/existence_check.py` (set `timeout=2` in WebClient initialization)
- [x] T044 [US3] Implement timeout error handling in `lambda/verification-stack/slack-event-handler/existence_check.py` (catch timeout exception, raise ExistenceCheckError)
- [x] T045 [US3] Implement retry logic for rate limit errors (429) in `lambda/verification-stack/slack-event-handler/existence_check.py` (max 3 retries with exponential backoff: 1s, 2s, 4s)
- [x] T046 [US3] Add retry attempt logging in `lambda/verification-stack/slack-event-handler/existence_check.py` (log retry attempt number and delay)
- [x] T047 [US3] Implement fail-closed behavior for all Slack API errors in `lambda/verification-stack/slack-event-handler/existence_check.py` (reject request with 403 on any error after retries)
- [x] T048 [US3] Add security event logging for timeout errors in `lambda/verification-stack/slack-event-handler/handler.py` (log "existence_check_timeout" event)
- [x] T049 [US3] Add security event logging for rate limit errors in `lambda/verification-stack/slack-event-handler/handler.py` (log "existence_check_rate_limit" event)
- [x] T050 [US3] Add security event logging for other Slack API errors in `lambda/verification-stack/slack-event-handler/handler.py` (log "existence_check_api_error" event)
- [x] T051 [US3] Write unit test for timeout handling in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py` (mock timeout exception)
- [x] T052 [US3] Write unit test for rate limit retry logic in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py` (mock 429 error, verify retries with backoff)
- [x] T053 [US3] Write unit test for rate limit exhaustion in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py` (mock 429 error after 3 retries, verify ExistenceCheckError raised)
- [x] T054 [US3] Write unit test for other Slack API errors in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.py` (mock other error codes)
- [x] T055 [US3] Write BDD scenario for Slack API timeout in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.feature` (Given/When/Then format)
- [x] T056 [US3] Write BDD scenario for Slack API rate limit in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.feature`
- [x] T057 [US3] Write BDD scenario for Slack API complete failure in `lambda/verification-stack/slack-event-handler/tests/test_existence_check.feature`

**Checkpoint**: ✅ All user stories are fully functional - system verifies entities, caches results, and handles failures securely

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Monitoring, documentation, and final integration

- [x] T058 Add CloudWatch metric for ExistenceCheckFailed in `lambda/verification-stack/slack-event-handler/existence_check.py` (emit metric on failure)
- [x] T059 Add CloudWatch metric for ExistenceCheckCacheHitRate in `lambda/verification-stack/slack-event-handler/existence_check.py` (calculate hit rate)
- [x] T060 Add CloudWatch metric for SlackAPILatency in `lambda/verification-stack/slack-event-handler/existence_check.py` (measure API call duration)
- [x] T061 Create CloudWatch alarm for ExistenceCheckFailed in `cdk/lib/slack-bedrock-stack.ts` (alarm when 5+ failures in 5 minutes)
- [x] T062 Update handler documentation with Existence Check flow in `lambda/verification-stack/slack-event-handler/handler.py` (add docstring explaining 2-key defense)
- [x] T063 Update existence_check module documentation in `lambda/verification-stack/slack-event-handler/existence_check.py` (add module docstring explaining security model)
- [x] T064 Verify all security events are logged with correlation IDs in `lambda/verification-stack/slack-event-handler/handler.py` (check all log_error calls include correlation context)
- [ ] T065 Run end-to-end test: Send valid request, verify Existence Check passes and request is processed (MANUAL: Requires deployed environment)
- [ ] T066 Run end-to-end test: Send request with fake team_id, verify 403 response and security event logged (MANUAL: Requires deployed environment)
- [ ] T067 Run end-to-end test: Send two identical requests, verify second request uses cache (check logs for cache hit) (MANUAL: Requires deployed environment)
- [ ] T068 Run end-to-end test: Simulate Slack API timeout, verify 403 response and security event logged (MANUAL: Requires deployed environment)

---

## Dependencies

### User Story Completion Order

1. **Phase 1 (Setup)**: Must complete before any other phase
2. **Phase 2 (Foundational)**: Must complete before user story phases
3. **Phase 3 (User Story 1 - P1)**: Can be implemented independently (MVP)
4. **Phase 4 (User Story 2 - P2)**: Depends on Phase 3 (uses Existence Check from US1)
5. **Phase 5 (User Story 3 - P2)**: Depends on Phase 3 (enhances error handling from US1)
6. **Phase 6 (Polish)**: Depends on all user story phases

### Parallel Execution Opportunities

**Within Phase 3 (User Story 1)**:

- T010, T011, T012 can be implemented in parallel (different Slack API methods)
- T013, T014, T015 can be implemented in parallel (different error handlers)
- T024, T025, T026 can be written in parallel (different unit tests)
- T027, T028, T029 can be written in parallel (different failure tests)

**Within Phase 4 (User Story 2)**:

- T038, T039, T040, T041 can be written in parallel (different cache test scenarios)

**Within Phase 5 (User Story 3)**:

- T051, T052, T053, T054 can be written in parallel (different error handling tests)
- T055, T056, T057 can be written in parallel (different BDD scenarios)

**Across Phases**:

- Phase 4 and Phase 5 can be implemented in parallel after Phase 3 completes (both depend on US1 but are independent of each other)

## Implementation Strategy

### MVP Scope (Minimum Viable Product)

**MVP includes**: Phase 1 (Setup) + Phase 2 (Foundational) + Phase 3 (User Story 1)

**MVP delivers**: Core security feature - system verifies entities exist in Slack and rejects invalid requests. This provides the essential 2-key defense capability.

**Post-MVP**: Phase 4 (caching) and Phase 5 (error handling) add performance optimization and resilience, but MVP is fully functional for security purposes.

### Incremental Delivery

1. **Week 1**: Setup + Foundational + User Story 1 (MVP)

   - Deploy infrastructure (DynamoDB table)
   - Implement core Existence Check
   - Test with valid/invalid entities
   - **Deliverable**: Security feature working, blocks forged requests

2. **Week 2**: User Story 2 (Caching)

   - Add cache lookup/write
   - Test cache hit/miss scenarios
   - **Deliverable**: Performance optimized, 80%+ cache hit rate

3. **Week 3**: User Story 3 (Error Handling)

   - Add timeout and retry logic
   - Test failure scenarios
   - **Deliverable**: Resilient to Slack API failures

4. **Week 4**: Polish & Monitoring
   - Add CloudWatch metrics and alarms
   - Documentation updates
   - End-to-end testing
   - **Deliverable**: Production-ready feature

## Task Summary

- **Total Tasks**: 68
- **Phase 1 (Setup)**: 5 tasks
- **Phase 2 (Foundational)**: 4 tasks
- **Phase 3 (User Story 1 - P1)**: 21 tasks (MVP)
- **Phase 4 (User Story 2 - P2)**: 12 tasks
- **Phase 5 (User Story 3 - P2)**: 15 tasks
- **Phase 6 (Polish)**: 11 tasks

**Parallel Opportunities**: 20+ tasks can be executed in parallel across different files/modules

**Independent Test Criteria**:

- **User Story 1**: Send request with valid signature but invalid entity IDs → verify 403 rejection
- **User Story 2**: Send two identical requests → verify second uses cache (no Slack API calls)
- **User Story 3**: Simulate Slack API timeout/error → verify 403 rejection with security event logged
