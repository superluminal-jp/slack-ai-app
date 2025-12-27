# Tasks: Cross-Account Zones Architecture

**Input**: Design documents from `/specs/010-cross-account-zones/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Unit tests included for CDK stacks (Jest). Tests are recommended for infrastructure changes.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **CDK**: `cdk/lib/`, `cdk/bin/`, `cdk/test/`
- **Lambda**: `lambda/` (no changes required)

---

## Phase 1: Setup

**Purpose**: Project preparation and infrastructure for stack separation

- [x] T001 Update CDK dependencies and verify versions in `cdk/package.json`
- [x] T002 [P] Create stack configuration interfaces in `cdk/lib/types/stack-config.ts`
- [x] T003 [P] Update `cdk/cdk.json` with cross-account context parameters

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create ExecutionStack in `cdk/lib/execution-stack.ts` with BedrockProcessor and ExecutionApi constructs
- [x] T005 Create VerificationStack in `cdk/lib/verification-stack.ts` with SlackEventHandler, DynamoDB tables, and Secrets
- [x] T006 Update `cdk/bin/cdk.ts` to support both single-stack and two independent stacks deployment modes
- [x] T007 [P] Add cross-account resource policy support to ExecutionApi construct in `cdk/lib/constructs/execution-api.ts`
- [x] T008 [P] Add Verification Lambda role ARN output to VerificationStack for resource policy configuration

**Checkpoint**: Foundation ready - both stacks can be instantiated independently

---

## Phase 3: User Story 1 - 同一アカウント内でのゾーン分離デプロイ (Priority: P1) 🎯 MVP

**Goal**: Deploy Verification Stack and Execution Stack as independent units within a single AWS account

**Independent Test**: Deploy both stacks to same account, verify Slack requests are processed end-to-end

### Tests for User Story 1

- [x] T009 [P] [US1] Create ExecutionStack unit test in `cdk/test/execution-stack.test.ts`
- [x] T010 [P] [US1] Create VerificationStack unit test in `cdk/test/verification-stack.test.ts`

### Implementation for User Story 1

- [x] T011 [US1] Implement ExecutionStack with all Execution Zone resources in `cdk/lib/execution-stack.ts`
  - BedrockProcessor Lambda
  - ExecutionApi (API Gateway with IAM auth)
  - CloudWatch alarms for execution layer
  - Stack outputs: API URL, API ARN
- [x] T012 [US1] Implement VerificationStack with all Verification Zone resources in `cdk/lib/verification-stack.ts`
  - SlackEventHandler Lambda with Function URL
  - DynamoDB tables (token, dedupe, existence-check, whitelist, rate-limit)
  - Secrets Manager (Slack credentials)
  - CloudWatch alarms for verification layer
  - Stack outputs: Function URL, Lambda Role ARN
- [x] T013 [US1] Add environment variable configuration for Execution API URL in VerificationStack
- [x] T014 [US1] Update CDK entry point to register both stacks in `cdk/bin/cdk.ts`
- [x] T015 [US1] Add deploy/destroy scripts for two independent stacks mode in `cdk/README.md`

**Checkpoint**: Both stacks deploy independently, Slack E2E flow works

---

## Phase 4: User Story 3 - クロスアカウント対応の通信パターン検証 (Priority: P1)

**Goal**: Implement and verify cross-account compatible IAM authentication pattern

**Independent Test**: Verify API Gateway accepts requests only from authorized Lambda role, rejects all others

### Tests for User Story 3

- [x] T016 [P] [US3] Create cross-account IAM authentication test in `cdk/test/cross-account.test.ts`

### Implementation for User Story 3

- [x] T017 [US3] Enhance ExecutionApi resource policy to accept external account/role ARN in `cdk/lib/constructs/execution-api.ts`
- [x] T018 [US3] Add `verificationAccountId` and `verificationRoleArn` props to ExecutionStack
- [x] T019 [US3] Implement resource policy update method for post-deployment configuration in `cdk/lib/execution-stack.ts`
- [x] T020 [US3] Add execute-api:Invoke IAM policy to VerificationStack Lambda for cross-account API access
- [x] T021 [US3] Create deployment script for 3-phase deploy (Execution → Verification → Execution update) in `scripts/deploy-split-stacks.sh`
- [x] T022 [US3] Document cross-account IAM pattern in `docs/reference/architecture/cross-account.md`

**Checkpoint**: IAM authentication works, unauthorized access is blocked

---

## Phase 5: User Story 4 - 独立したリソースライフサイクル管理 (Priority: P2)

**Goal**: Ensure stacks can be updated/deleted independently without affecting each other

**Independent Test**: Update one stack, verify other stack resources are unchanged

### Implementation for User Story 4

- [x] T023 [US4] Verify no CloudFormation cross-stack references exist between stacks
- [x] T024 [US4] Add stack deletion order documentation in `cdk/README.md`
- [x] T025 [US4] Implement graceful error handling when Execution API is unavailable in `lambda/verification-stack/slack-event-handler/api_gateway_client.py`
- [x] T026 [US4] Add health check endpoint consideration for Execution API availability monitoring
- [x] T027 [US4] Create independent update test scenarios in `cdk/test/lifecycle.test.ts`

**Checkpoint**: Stacks can be managed independently

---

## Phase 6: User Story 2 - 異なるアカウントへのゾーン分離デプロイ (Priority: P3 - 将来対応)

**Goal**: Enable deployment to separate AWS accounts (future implementation)

**Independent Test**: Deploy to Account A and Account B, verify E2E flow

**Note**: This phase is for future implementation when a second AWS account becomes available. The architecture from P1 phases already supports this.

### Implementation for User Story 2 (Future)

- [ ] T028 [US2] Add multi-account CDK environment configuration in `cdk/bin/cdk.ts`
- [ ] T029 [US2] Create cross-account deployment guide in `docs/how-to/cross-account-deployment.md`
- [ ] T030 [US2] Add AWS Organizations integration considerations (optional)

**Checkpoint**: Cross-account deployment documented and ready

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cleanup, and migration support

- [x] T031 [P] Mark SlackBedrockStack as deprecated with migration notice in `cdk/lib/slack-bedrock-stack.ts`
- [x] T032 [P] Create migration guide from single-stack to two independent stacks in `docs/how-to/migration-guide.md`
- [x] T033 Update architecture documentation in `docs/reference/architecture/overview.md`
- [x] T034 [P] Update README.md with new deployment options
- [ ] T035 Run quickstart.md validation - deploy and test per instructions
- [x] T036 Update CHANGELOG.md with feature summary

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational - Core MVP
- **US3 (Phase 4)**: Depends on Foundational - Can parallel with US1
- **US4 (Phase 5)**: Depends on US1 completion
- **US2 (Phase 6)**: Future - Depends on US1, US3
- **Polish (Phase 7)**: Depends on US1, US3, US4 completion

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (BLOCKS all stories)
    ↓
    ├─→ Phase 3: US1 (P1) ──────────────────────┐
    │                                            │
    └─→ Phase 4: US3 (P1) [can parallel with US1]│
                                                 │
                          ↓                      │
                    Phase 5: US4 (P2) ←──────────┘
                          ↓
                    Phase 6: US2 (P3 - Future)
                          ↓
                    Phase 7: Polish
```

### Within Each User Story

- Tests SHOULD be written before implementation (TDD approach)
- Stack implementation before scripts
- Core functionality before documentation
- Story complete before moving to next priority

### Parallel Opportunities

- T002, T003 can run in parallel (Setup phase)
- T007, T008 can run in parallel (Foundational phase)
- T009, T010 can run in parallel (US1 tests)
- US1 and US3 can be developed in parallel after Foundational
- T031, T032, T034 can run in parallel (Polish phase)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Sequential dependencies:
Task T004: "Create ExecutionStack in cdk/lib/execution-stack.ts"
Task T005: "Create VerificationStack in cdk/lib/verification-stack.ts"

# Can parallel after T004, T005:
Task T007: [P] "Add cross-account resource policy support"
Task T008: [P] "Add Verification Lambda role ARN output"
```

## Parallel Example: US1 + US3

```bash
# After Foundational phase, these can run in parallel:

# Team A: User Story 1
Task T009: [P] [US1] "ExecutionStack unit test"
Task T010: [P] [US1] "VerificationStack unit test"
Task T011-T015: [US1] Implementation tasks

# Team B: User Story 3 (can start in parallel)
Task T016: [P] [US3] "Cross-account IAM test"
Task T017-T022: [US3] Implementation tasks
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Deploy both stacks, test E2E Slack flow
5. Deploy to production if ready

### Recommended Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 → Deploy → Validate two independent stacks work (MVP!)
3. Add US3 → Validate IAM authentication pattern
4. Add US4 → Validate independent lifecycle
5. Polish → Documentation and migration guide
6. US2 (Future) → When second account available

---

## Task Summary

| Phase                 | Story | Task Count | Parallel Tasks |
| --------------------- | ----- | ---------- | -------------- |
| Phase 1: Setup        | -     | 3          | 2              |
| Phase 2: Foundational | -     | 5          | 2              |
| Phase 3: US1          | P1    | 7          | 2              |
| Phase 4: US3          | P1    | 7          | 1              |
| Phase 5: US4          | P2    | 5          | 0              |
| Phase 6: US2          | P3    | 3          | 0              |
| Phase 7: Polish       | -     | 6          | 3              |
| **Total**             |       | **36**     | **10**         |

### MVP Scope (Recommended)

- **Minimum**: Phase 1 + Phase 2 + Phase 3 (US1) = **15 tasks**
- **Recommended**: Above + Phase 4 (US3) = **22 tasks**
- **Full**: All phases except US2 = **33 tasks**

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US2 (Phase 6) is marked for future implementation when second account available
- Avoid modifying existing Lambda code - focus on CDK infrastructure
