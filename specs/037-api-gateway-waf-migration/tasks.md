# Tasks: API Gateway + WAF Ingress Migration

**Input**: Design documents from `/specs/037-api-gateway-waf-migration/`
**Prerequisites**: `spec.md`, `plan.md`

## Phase 1: Setup

- [ ] T001 Create feature branch and baseline docs sync for ingress migration
- [ ] T002 Identify affected CDK stacks/files in `verification-zones/verification-agent/cdk/`
- [ ] T003 Prepare runbook rollback template for Request URL switch

---

## Phase 2: Foundational (Blocking)

- [ ] T004 [P] Define CDK construct for API Gateway ingress endpoint
- [ ] T005 [P] Define CDK resources for WAFv2 Web ACL and association
- [ ] T006 [P] Add APIGW access logging and stage-level throttling configuration
- [ ] T007 Add feature flag/config strategy for dual-ingress period (Function URL + APIGW)
- [ ] T008 Establish CloudWatch alarms for WAF blocks, APIGW 5xx, Lambda errors

**Checkpoint**: APIGW + WAF infrastructure is synthesizable and observable.

---

## Phase 3: User Story 1 - 入口強化（P1）

**Goal**: WAF による事前遮断 + APIGW 経由受信を実現

**Independent Test**: WAF 該当リクエストが Lambda 到達前にブロックされる

### Tests (write first)

- [ ] T009 [US1] Add infrastructure/unit tests for APIGW + WAF association
- [ ] T010 [US1] Add integration test scenario for WAF block path (no Lambda invoke)

### Implementation

- [ ] T011 [US1] Implement API Gateway endpoint integration to SlackEventHandler Lambda
- [ ] T012 [US1] Implement WAF managed rules + initial rate-based rule set
- [ ] T013 [US1] Configure deployment outputs for APIGW URL and WAF identifiers

**Checkpoint**: US1 complete and testable independently.

---

## Phase 4: User Story 2 - アプリ層防御維持（P1）

**Goal**: APIGW 移行後も 2 鍵防御と認可を維持

**Independent Test**: 401/403 の既存拒否動作が回帰なし

### Tests

- [ ] T014 [US2] Add/extend tests for signature verification behavior through APIGW path
- [ ] T015 [US2] Add/extend tests for Existence Check + whitelist deny through APIGW path

### Implementation

- [ ] T016 [US2] Confirm/request mapping preserves headers/body required for HMAC verification
- [ ] T017 [US2] Ensure no bypass path exists that skips validation/authorization middleware
- [ ] T018 [US2] Update security docs with layered-defense responsibility split

**Checkpoint**: US2 complete and testable independently.

---

## Phase 5: User Story 3 - 段階移行運用（P2）

**Goal**: カナリア切替・監視・ロールバック手順を実運用可能にする

**Independent Test**: 切替失敗時に 15 分以内で旧経路へ戻せる

### Tests / Validation

- [ ] T019 [US3] Define operational validation checklist for canary and rollback drills
- [ ] T020 [US3] Execute dry-run procedure in lower environment and record evidence

### Implementation

- [ ] T021 [US3] Update runbook with exact cutover, health gates, and rollback criteria
- [ ] T022 [US3] Add dashboard links/queries for WAF/APIGW/Lambda correlated monitoring
- [ ] T023 [US3] Document Slack app Request URL switching SOP and communication template

**Checkpoint**: US3 complete and operationally testable.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T024 [P] Finalize `docs/developer/security.md` with WAF false-positive tuning guidance
- [ ] T025 [P] Finalize `docs/developer/architecture.md` with ingress final-state diagram
- [ ] T026 Run regression tests (`npm test`, relevant `pytest`) and record results
- [ ] T027 Validate `cdk synth`/`cdk diff` output and attach migration note
- [ ] T028 Confirm AWS MCP best-practice checklist items are either verified or explicitly deferred with rationale

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 is strict dependency
- US1 and US2 start after Phase 2; US2 can run in parallel after APIGW integration baseline exists
- US3 depends on US1/US2 completion
- Polish phase after all target user stories complete

## Parallel Opportunities

- T004 / T005 / T006 can run in parallel
- T009 / T010 can run in parallel
- T014 / T015 can run in parallel
- T024 / T025 can run in parallel

## Implementation Strategy

### MVP First

1. Complete Phase 1–2
2. Deliver US1 (ingress hardening)
3. Validate with WAF block-path tests

### Incremental

1. Add US2 (app-layer defense regression)
2. Add US3 (operations cutover + rollback)
3. Finish polish and release readiness evidence
