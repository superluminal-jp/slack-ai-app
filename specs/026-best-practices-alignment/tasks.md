# Tasks: ベストプラクティス適用（Bedrock / Strands / AgentCore / AWS）

**Input**: Design documents from `/specs/026-best-practices-alignment/`
**Prerequisites**: plan.md, spec.md, research.md, checklists/requirements.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Agents**: `cdk/lib/execution/agent/execution-agent/`, `cdk/lib/verification/agent/verification-agent/`
- **Lambda**: `cdk/lib/verification/lambda/agent-invoker/`, `cdk/lib/verification/lambda/slack-event-handler/`
- **CDK**: `cdk/lib/`, `cdk/bin/`, `cdk/test/`
- **Docs**: `docs/`, `specs/026-best-practices-alignment/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify feature context and baseline for best-practices alignment

- [x] T001 Verify feature branch `026-best-practices-alignment` and spec structure in specs/026-best-practices-alignment/
- [x] T002 [P] Document current IAM roles and Bedrock/AgentCore permissions in cdk/lib/ (audit baseline for US1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Audit current state before applying changes — MUST complete before user story work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Audit agent-invoker error handling in cdk/lib/verification/lambda/agent-invoker/handler.py (ThrottlingException retry, ValidationException, AccessDeniedException, ResourceNotFoundException)
- [x] T004 [P] Audit a2a_client InvokeAgentRuntime error handling in cdk/lib/verification/agent/verification-agent/a2a_client.py
- [x] T005 Audit Bedrock/AgentCore call sites for HTTPS (AWS SDK default) and PII usage across cdk/lib/

**Checkpoint**: Audit complete — user story implementation can now begin

---

## Phase 3: User Story 1 - Bedrock セキュリティ (Priority: P1) 🎯 MVP

**Goal**: Apply Bedrock security best practices: HTTPS, least privilege, PII non-inclusion, CMK consideration.

**Independent Test**: IAM policies reviewed; only required InvokeModel/InvokeAgentRuntime permissions granted; HTTPS confirmed for all calls.

### Implementation for User Story 1

- [x] T006 [US1] Confirm HTTPS for all Bedrock/AgentCore calls (AWS SDK default; document in specs/026-best-practices-alignment/research.md)
- [x] T007 [US1] Review and minimize IAM policies for Bedrock/AgentCore in cdk/lib/verification/constructs/agent-invoker.ts, slack-event-handler.ts, verification-agent-runtime.ts
- [x] T008 [US1] Verify no PII in agent resource names (actions, knowledge bases) — document findings in specs/026-best-practices-alignment/checklists/requirements.md
- [x] T009 [US1] Document CMK consideration for agent resources in docs/ (if regulatory requirements exist)

**Checkpoint**: User Story 1 complete — Bedrock security best practices verified/applied

---

## Phase 4: User Story 2 - AgentCore Runtime (Priority: P1)

**Goal**: Apply AgentCore Runtime best practices: session management, retry, error handling, lifecycle settings.

**Independent Test**: agent-invoker and a2a_client have ThrottlingException retry with exponential backoff; error handling for ValidationException, ResourceNotFoundException, AccessDeniedException is appropriate.

### Implementation for User Story 2

- [x] T010 [US2] Verify agent-invoker ThrottlingException retry in cdk/lib/verification/lambda/agent-invoker/handler.py — confirm exponential backoff and add ValidationException/ResourceNotFoundException/AccessDeniedException handling if missing
- [x] T011 [US2] Verify a2a_client InvokeAgentRuntime retry in cdk/lib/verification/agent/verification-agent/a2a_client.py — ensure ThrottlingException retry with exponential backoff
- [x] T012 [US2] Add AgentCore lifecycle configuration (idleRuntimeSessionTimeout, maxLifetime) to CDK in cdk/lib/verification/constructs/verification-agent-runtime.ts and execution constructs if applicable (optional per research.md)
- [x] T013 [US2] Document session ID usage (runtimeSessionId) and payload size (100 MB) constraints in docs/how-to/troubleshooting.md or specs/026-best-practices-alignment/

**Checkpoint**: User Story 2 complete — AgentCore Runtime best practices applied

---

## Phase 5: User Story 3 - Strands Agent (Priority: P2)

**Goal**: Apply Strands Agents SDK best practices: model-first design, tool definition clarity, observability, multimodal support.

**Independent Test**: Tool docstrings and parameter descriptions are clear; type hints present; OpenTelemetry or AgentCore traces enabled if applicable.

### Implementation for User Story 3

- [x] T014 [P] [US3] Add or enhance tool docstrings and parameter descriptions in cdk/lib/execution/agent/execution-agent/tools/ (coordinate with 025-slack-file-generation; apply to existing tools if any)
- [x] T015 [US3] Verify strands ContentBlock format for multimodal input in cdk/lib/execution/agent/execution-agent/ (024 file attachment flow)
- [x] T016 [US3] Investigate and enable OpenTelemetry for strands Agent in cdk/lib/execution/agent/execution-agent/ (optional; document in specs/026-best-practices-alignment/research.md)

**Checkpoint**: User Story 3 complete — Strands best practices applied

---

## Phase 6: User Story 4 - エンタープライズ (Priority: P2)

**Goal**: Apply enterprise agent best practices: scope definition, instrumentation, tooling strategy, evaluation.

**Independent Test**: Agent scope and non-scope documented; instrumentation verified; evaluation strategy documented.

### Implementation for User Story 4

- [x] T017 [P] [US4] Document Verification Agent and Execution Agent scope and non-scope in cdk/lib/verification/agent/verification-agent/README.md or cdk/lib/execution/agent/execution-agent/README.md (create if missing)
- [x] T018 [US4] Verify instrumentation (traces, metrics, logs) is enabled from day one — document in specs/026-best-practices-alignment/checklists/requirements.md
- [x] T019 [US4] Document evaluation strategy (gold dataset or automated evaluation pipeline) in specs/026-best-practices-alignment/plan.md or docs/

**Checkpoint**: User Story 4 complete — Enterprise best practices documented

---

## Phase 7: User Story 5 - AWS CDK / IaC (Priority: P3)

**Goal**: Apply CDK best practices: L2 constructs, grant methods, encryption, removal policy, resource naming.

**Independent Test**: CDK stacks use grant*() for permissions; S3/DynamoDB encrypted; no hardcoded physical names; removal policy explicit for stateful resources.

### Implementation for User Story 5

- [x] T020 [P] [US5] Review grant*() usage in cdk/lib/ — replace manual IAM policies with grant methods where possible
- [x] T021 [P] [US5] Verify encryption on S3 buckets and DynamoDB tables in cdk/lib/
- [x] T022 [US5] Verify removal policy for stateful resources (RETAIN for prod) in cdk/lib/
- [x] T023 [US5] Verify no hardcoded physical resource names — use CDK-generated names in cdk/lib/
- [ ] T024 [US5] Optional: Add cdk-nag with AwsSolutionsChecks to cdk/bin/cdk.ts (requires user consent per plan)

**Checkpoint**: User Story 5 complete — CDK best practices applied

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [x] T025 Run full regression: pytest in cdk/lib/execution/agent/execution-agent/, cdk/lib/verification/agent/verification-agent/, cdk/lib/verification/lambda/agent-invoker/, cdk/lib/verification/lambda/slack-event-handler/
- [x] T026 Run CDK tests: npm test in cdk/
- [x] T027 [P] Update specs/026-best-practices-alignment/checklists/requirements.md with verification results (check off items as PASS)
- [x] T028 [P] Update CLAUDE.md or docs/ with any new technology or patterns from best-practices alignment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3–7)**: All depend on Foundational phase completion
  - US1 and US2 (P1) can proceed in parallel after Phase 2
  - US3 and US4 (P2) can proceed after US1/US2 or in parallel
  - US5 (P3) can proceed after US3/US4 or in parallel
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories — can start after Phase 2
- **US2 (P1)**: No dependencies on other stories — can start after Phase 2
- **US3 (P2)**: May coordinate with 025; no hard dependency on US1/US2
- **US4 (P2)**: Depends on US3 for tool strategy; can partially proceed in parallel
- **US5 (P3)**: No dependencies on US1–US4 — can start after Phase 2

### Parallel Opportunities

- T002, T003, T004, T005 can run in parallel within Phase 2
- T006, T007, T008 can run in parallel within US1
- T014, T017 can run in parallel (different files)
- T020, T021 can run in parallel within US5
- T027, T028 can run in parallel in Polish phase

---

## Parallel Example: User Story 1

```bash
# Audit tasks for US1 (can run in parallel):
Task: "Document current IAM roles and Bedrock/AgentCore permissions"
Task: "Confirm HTTPS for all Bedrock/AgentCore calls"

# Implementation tasks for US1:
Task: "Review and minimize IAM policies in agent-invoker.ts, slack-event-handler.ts"
Task: "Verify no PII in agent resource names"
```

---

## Parallel Example: User Story 5

```bash
# US5 tasks that can run in parallel:
Task: "Review grant*() usage in cdk/lib/"
Task: "Verify encryption on S3 and DynamoDB"
Task: "Verify no hardcoded physical resource names"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (audit)
3. Complete Phase 3: User Story 1 (Bedrock security)
4. Complete Phase 4: User Story 2 (AgentCore Runtime)
5. **STOP and VALIDATE**: Run checklists/requirements.md for B1–B4, A1–A5
6. Run regression (T025, T026)

### Incremental Delivery

1. Setup + Foundational → Audit complete
2. US1 + US2 → P1 best practices applied (MVP!)
3. US3 + US4 → P2 best practices applied
4. US5 → P3 best practices applied
5. Polish → Final validation and docs

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Bedrock security)
   - Developer B: US2 (AgentCore)
   - Developer C: US3 (Strands)
3. US4 and US5 can follow or run in parallel

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- agent-invoker and a2a_client already have ThrottlingException retry — verify and enhance error handling
- Checklist (checklists/requirements.md) exists; use for verification and update with results
- No new test tasks — spec focuses on applying best practices; regression tests (existing) must pass
