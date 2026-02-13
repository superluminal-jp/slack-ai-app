# Tasks: CDK Logging, Comments, and Error Handling (Best Practices)

**Input**: Design documents from `/specs/029-cdk-logging-error-handling/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested in the feature specification; Independent Test for each story is manual (run synth/deploy, trigger failures, verify logs and in-code docs).

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- CDK app lives under `cdk/` at repository root: `cdk/bin/`, `cdk/lib/`, `cdk/test/`
- Paths in task descriptions use `cdk/` prefix

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Introduce logging and error conventions and helpers that all user stories depend on.

- [x] T001 [P] Create logging helper that emits log entries per `specs/029-cdk-logging-error-handling/contracts/log-event.schema.json` (level, message, optional phase/context); no secrets; stdout/stderr in `cdk/lib/utils/cdk-logger.ts` or `cdk/bin/cdk-logger.ts`
- [x] T002 [P] Create error helper/class that formats user-facing errors per `specs/029-cdk-logging-error-handling/contracts/error-report.schema.json` (message, cause, resourceId, remediation, source) and ensures no secrets in output; use when throwing from app in `cdk/lib/utils/cdk-error.ts` or adjacent to logger
- [x] T003 Document logging and JSDoc/comment style convention (what to document at module vs function level) in `cdk/README.md` or `specs/029-cdk-logging-error-handling/` so FR-006 is defined for the codebase

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire logging and error handling into the app entry so all user stories can rely on consistent output.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [x] T004 Integrate logging helper into `cdk/bin/cdk.ts` at app entry: emit structured log entry for app start (e.g. phase `config`, message indicating environment/config source)
- [x] T005 Replace raw `throw new Error(...)` for invalid deployment environment in `cdk/bin/cdk.ts` with error helper so the thrown value has cause, remediation hint (e.g. allowed values), and source `app`; ensure message is actionable (FR-004)
- [x] T006 Align config load path in `cdk/bin/cdk.ts` (loadConfiguration, file vs context fallback) with structured logging and error wrapper: log config load result without secrets; on load failure wrap error with context (e.g. step "config load") and user-facing message per research (FR-007)

**Checkpoint**: Foundation ready — structured logs and error shape are used at entry; user story implementation can begin.

---

## Phase 3: User Story 1 - Clear Observability During Deploy and Operations (Priority: P1) 🎯 MVP

**Goal**: Operators see what the stack is doing at key steps through consistent, structured logging and in-code documentation; reviewers see purpose and constraints of constructs and configuration.

**Independent Test**: Run `cdk synth` and confirm key phases (config, stack creation) are visible in log output; open `cdk/bin/cdk.ts` and stack files and confirm purpose and constraints are clear from comments/JSDoc.

### Implementation for User Story 1

- [x] T007 [US1] Add structured log entries at config load success in `cdk/bin/cdk.ts` (phase: `config`, message e.g. config loaded or default used)
- [x] T008 [US1] Add structured log entries when each stack is instantiated in `cdk/bin/cdk.ts` (phase: `stack`, context: stack name) so lifecycle is traceable
- [x] T009 [P] [US1] Ensure `cdk/lib/execution/execution-stack.ts` and `cdk/lib/verification/verification-stack.ts` have module-level JSDoc with purpose and main responsibilities (Documented unit); add or extend per data-model.md
- [x] T010 [US1] Add or align comments and JSDoc in `cdk/bin/cdk.ts` so config priority (env var, context, file, defaults) and stack creation flow are clear (FR-002, FR-006)

**Checkpoint**: User Story 1 is done when synth produces structured lifecycle logs and stack/entry docs are clear.

---

## Phase 4: User Story 2 - Actionable Error Handling on Failure (Priority: P2)

**Goal**: On validation or deployment failure, users see a clear, actionable message with cause and remediation where feasible; no secrets in error output; nested/third-party errors are wrapped with context.

**Independent Test**: Trigger invalid `DEPLOYMENT_ENV`, trigger a validation failure (e.g. Aspect), and confirm error output is clear and points to remediation; confirm no secrets appear.

### Implementation for User Story 2

- [x] T011 [US2] Standardize all entry-point validation errors in `cdk/bin/cdk.ts` (invalid env, missing required config) to use error helper with cause, remediation, and source `app` per `contracts/error-report.schema.json`
- [x] T012 [P] [US2] Implement a CDK Aspect in `cdk/lib/aspects/` (e.g. one validation rule such as log retention or a safe naming check) that uses `Annotations.of(node).addError(message)` with clear message and applies to app or stacks; document purpose in JSDoc
- [x] T013 [US2] Wrap config/file load errors in `cdk/bin/cdk.ts` with context (e.g. step "config load" or file path) and user-facing message; preserve cause for debugging without exposing secrets (FR-007)
- [x] T014 [US2] Audit all error construction and log calls in `cdk/bin/cdk.ts` (and any new helpers) to ensure no secrets, tokens, or PII in messages (FR-005, SC-004)

**Checkpoint**: User Story 2 is done when validation and config errors are actionable and safe.

---

## Phase 5: User Story 3 - Maintainable and Onboardable Code (Priority: P3)

**Goal**: New contributors can understand module boundaries, dependencies, and non-obvious decisions from in-code comments and JSDoc; consistent style across the CDK codebase.

**Independent Test**: Someone unfamiliar with the stack can read in-code docs and explain high-level flow and key stacks/constructs.

### Implementation for User Story 3

- [x] T015 [P] [US3] Add or complete module-level JSDoc (purpose, responsibilities, inputs/outputs) for all construct classes in `cdk/lib/execution/constructs/*.ts` and `cdk/lib/verification/constructs/*.ts` per Documented unit in data-model.md
- [x] T016 [P] [US3] Document non-obvious configuration choices, ordering, and constraints in `cdk/lib/execution/execution-stack.ts` and `cdk/lib/verification/verification-stack.ts` (FR-003) at point of use
- [x] T017 [US3] Add or extend JSDoc for public props and key types in `cdk/lib/types/cdk-config.ts` and `cdk/lib/types/stack-config.ts`; ensure comment/JSDoc style is consistent with Phase 1 convention across `cdk/lib/` (FR-006, SC-005)

**Checkpoint**: User Story 3 is done when every top-level stack and construct is a documented unit with consistent style.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and edge-case compliance.

- [x] T018 Run quickstart validation: execute build, synth (and optionally deploy) per `specs/029-cdk-logging-error-handling/quickstart.md` and confirm logs and errors match contracts
- [x] T019 Verify logging and error behavior when stdout is redirected (e.g. `npx cdk synth > out 2>&1`) and that error messages do not duplicate or obscure root cause (spec edge cases)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 — blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2 — can start when T004–T006 are done.
- **Phase 4 (US2)**: Depends on Phase 2 — can run in parallel with Phase 3 if desired.
- **Phase 5 (US3)**: Depends on Phase 2 — can run in parallel with Phase 3/4; benefits from US1 doc style being in place.
- **Phase 6 (Polish)**: Depends on completion of all user story phases you intend to ship.

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on US2/US3. Delivers observability and entry/stack docs.
- **User Story 2 (P2)**: No dependency on US1/US3. Delivers error shape and validation.
- **User Story 3 (P3)**: No hard dependency; consistent style (T003) helps. Delivers full documented-unit coverage.

### Within Each User Story

- US1: T007–T008 (bin) then T009–T010 (stacks + bin docs); T009 can run in parallel (two stack files).
- US2: T011, T013, T014 touch `cdk/bin/cdk.ts` (order: T011, T013, T014); T012 is separate (Aspect) and can run in parallel.
- US3: T015 (constructs), T016 (stacks), T017 (types); T015 and T016 can run in parallel across files.

### Parallel Opportunities

- Phase 1: T001 and T002 are independent (logger vs error helper); T003 can follow or run after T001/T002.
- Phase 2: T004–T006 are sequential in `cdk/bin/cdk.ts`.
- Phase 3: T009 [P] — two stack files in parallel.
- Phase 4: T012 [P] — Aspect in separate file from bin changes.
- Phase 5: T015 [P] (many construct files), T016 [P] (two stack files); T017 after or in parallel with T015/T016.
- Phase 6: T018 and T019 can be run sequentially or T019 in parallel (different focus).

---

## Parallel Example: User Story 1

```text
# After Phase 2 is complete, in parallel:
T009 [US1]: Update execution-stack.ts module JSDoc
T009 [US1]: Update verification-stack.ts module JSDoc
```

---

## Parallel Example: User Story 3

```text
# Multiple construct files can be documented in parallel:
T015 [US3]: Add JSDoc to cdk/lib/execution/constructs/execution-agent-ecr.ts
T015 [US3]: Add JSDoc to cdk/lib/execution/constructs/execution-agent-runtime.ts
T015 [US3]: Add JSDoc to cdk/lib/verification/constructs/slack-event-handler.ts
... (other constructs)
T016 [US3]: Document non-obvious choices in execution-stack.ts
T016 [US3]: Document non-obvious choices in verification-stack.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003).
2. Complete Phase 2: Foundational (T004–T006).
3. Complete Phase 3: User Story 1 (T007–T010).
4. **STOP and VALIDATE**: Run `cdk synth`, inspect logs and in-code docs.
5. Optionally run Phase 6 T018 for quickstart check.

### Incremental Delivery

1. Setup + Foundational → consistent logging and error shape at entry.
2. Add US1 → observable lifecycle and stack/entry docs (MVP).
3. Add US2 → actionable errors and optional Aspect validation.
4. Add US3 → full documented-unit coverage and consistent style.
5. Polish → quickstart and redirect/edge-case verification.

### Parallel Team Strategy

- After Phase 2: Developer A — US1 (bin + stacks). Developer B — US2 (bin errors + Aspect). Developer C — US3 (constructs + stacks docs).
- Merge and run Phase 6 together.

---

## Notes

- [P] tasks use different files or independent changes to avoid conflicts.
- [Story] label links each task to a user story for traceability.
- No automated test tasks were added; the spec defines manual Independent Test criteria.
- Commit after each task or logical group; stop at any checkpoint to validate that story.
- All paths are relative to repository root (e.g. `cdk/bin/cdk.ts`).
