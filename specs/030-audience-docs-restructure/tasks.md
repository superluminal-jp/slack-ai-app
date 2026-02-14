# Tasks: Audience-Based Documentation Restructure

**Input**: Design documents from `/specs/030-audience-docs-restructure/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not applicable — documentation-only feature. Validation is manual audit + link scan.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Target Structure)

**Purpose**: Create audience-based folder structure and establish conventions

- [x] T001 Create target directories: `docs/developer/`, `docs/developer/adr/`, `docs/decision-maker/`, `docs/user/`
- [x] T002 Move `audience-document-map.md` from repo root to `docs/audience-document-map.md`

---

## Phase 2: Foundational (Document Header Standard)

**Purpose**: Establish the document header template that ALL documents must follow

**CRITICAL**: Every document created or migrated in subsequent phases MUST include this header in its first 5 lines:

```markdown
# [Title]

**目的**: [Purpose]
**対象読者**: [Audience]
**最終更新日**: 2026-02-14
```

No separate tasks needed — this is a constraint applied to all subsequent tasks.

**Checkpoint**: Directories exist, `audience-document-map.md` is at `docs/` root. Ready for content migration.

---

## Phase 3: User Story 1 — Developer Finds All Technical Docs (Priority: P1) MVP

**Goal**: All 8 developer documents + ADR subfolder exist with consolidated content in `docs/developer/`.

**Independent Test**: From `docs/README.md`, navigate to any developer document in 2 clicks. Each document is self-contained with header block.

### Implementation for User Story 1

- [x] T003 [US1] Migrate `docs/quickstart.md` → `docs/developer/quickstart.md`: add header block (目的/対象読者/最終更新日), update all internal links to new paths, retain all content
- [x] T004 [P] [US1] Consolidate architecture docs into `docs/developer/architecture.md`: merge `docs/reference/architecture/overview.md` (remove legacy API Gateway diagram, keep AgentCore A2A only), `cross-account.md`, `implementation-details.md` (trim verbose code to key snippets), `user-experience.md` (developer-relevant UX/error sections only). Add glossary from `docs/appendix.md`. Sections: Overview, Components & Data Flow, Cross-Account, Implementation Details, User Experience, Glossary. Add header block.
- [x] T005 [P] [US1] Consolidate operations docs into `docs/developer/runbook.md`: merge `docs/reference/operations/slack-setup.md`, `monitoring.md`, `deployment-iam-policy.md`. Sections: Slack App Setup, Monitoring & Alarms, IAM Policy, Incident Response. Add header block.
- [x] T006 [P] [US1] Migrate `docs/reference/operations/testing.md` → `docs/developer/testing.md`: add header block, update internal links
- [x] T007 [P] [US1] Consolidate requirements into `docs/developer/requirements.md`: merge `docs/reference/requirements/functional-requirements.md` + `docs/implementation/roadmap.md` (as "Completed Phases" appendix section). Add header block.
- [x] T008 [P] [US1] Move ADR files to `docs/developer/adr/`: move `docs/explanation/adr/README.md` (update index to include ADR-003), `001-bedrock-foundation-model.md`, `002-regex-pii-detection.md`, `003-response-url-async.md`, `004-slack-api-existence-check.md`. Add header block to README.md. Update all internal cross-references.
- [x] T009 [P] [US1] Consolidate security docs into `docs/developer/security.md`: merge `docs/reference/security/authentication-authorization.md`, `threat-model.md`, `requirements.md`, `implementation.md`, `bedrock-cmk-consideration.md`. Sections: Overview (Two-Key Defense), Authentication & Authorization, Threat Model, Security Requirements, Implementation Details, CMK Consideration. Add header block.
- [x] T010 [P] [US1] Consolidate troubleshooting docs into `docs/developer/troubleshooting.md`: merge `docs/how-to/troubleshooting.md`, `troubleshooting-no-reply.md`, `verify-processing-flow.md`. Sections: Common Errors, No-Reply Diagnosis Checklist, Processing Flow Verification. Add header block.

**Checkpoint**: 8 developer documents + ADR subfolder (5 files) exist. Each has header block, consolidated content, no information loss. Developer docs are independently navigable.

---

## Phase 4: User Story 2 — Decision-Maker Finds Business Docs (Priority: P2)

**Goal**: All 5 decision-maker documents exist with audience-appropriate content in `docs/decision-maker/`.

**Independent Test**: From `docs/README.md`, navigate to any decision-maker document in 2 clicks. Each uses plain language without implementation details.

### Implementation for User Story 2

- [x] T011 [P] [US2] Create `docs/decision-maker/proposal.md`: derive from `docs/presentation/non-technical-overview.md` (business value slides, feature overview, adoption plan). Rewrite from slide format to document format. Focus on: background/problem, solution overview, expected impact, feature summary, phased adoption recommendation. Add header block. Plain language, no implementation details.
- [x] T012 [P] [US2] Adapt `docs/presentation/security-overview.md` → `docs/decision-maker/security-overview.md`: convert from slide format to document format. Retain: executive summary, 5-layer defense analogy, monitoring overview, roles, FAQ, glossary. Remove slide numbering and formatting. Add header block.
- [x] T013 [P] [US2] Adapt `docs/explanation/design-principles.md` → `docs/decision-maker/design-principles.md`: adapt for decision-maker audience (emphasize "why these principles matter for the organization" over theory details). Append academic bibliography from `docs/appendix.md`. Add header block.
- [x] T014 [P] [US2] Author `docs/decision-maker/cost-and-resources.md` (new): derive from CDK stack resources (Lambda, DynamoDB, S3, Bedrock, AgentCore) and operational model. Include: AWS service usage overview, cost drivers, estimated cost range, operational effort, resource recommendations. Add header block.
- [x] T015 [P] [US2] Author `docs/decision-maker/governance.md` (new): derive from whitelist authorization model, security requirements, and PII handling policies. Include: access control model (who can use the bot), usage scope, review/approval process, compliance considerations, update cadence. Add header block.

**Checkpoint**: 5 decision-maker documents exist. Each has header block, plain language, no implementation details, actionable insights.

---

## Phase 5: User Story 3 — End User Finds Usage Guide and FAQ (Priority: P3)

**Goal**: All 3 user documents exist with end-user-appropriate content in `docs/user/`.

**Independent Test**: From `docs/README.md`, navigate to any user document in 2 clicks. Content explains bot usage without any technical details.

### Implementation for User Story 3

- [x] T016 [P] [US3] Author `docs/user/user-guide.md` (new): derive user-facing content from `docs/reference/architecture/user-experience.md` (end-user flows, timing expectations) and `docs/presentation/non-technical-overview.md` (feature walkthroughs, usage examples). Include: how to mention the bot, what to expect (response time, reactions), supported features (text, image, document, thread), tips for good questions. Add header block.
- [x] T017 [P] [US3] Author `docs/user/usage-policy.md` (new): derive from security requirements and PII handling. Include: permitted use cases, prohibited use cases (confidential data, PII), file attachment rules (supported types, size limits), rate limits, reporting misuse. Add header block.
- [x] T018 [P] [US3] Author `docs/user/faq.md` (new): aggregate FAQ content from `docs/quickstart.md` (user-relevant FAQ items), `docs/presentation/non-technical-overview.md` (FAQ slides), `docs/presentation/security-overview.md` (FAQ slides), `docs/how-to/troubleshooting.md` (user-relevant symptoms). Include: "Bot doesn't respond", "Response is slow", "Can I share files?", "Is my data safe?", "Who can use this?". Add header block.

**Checkpoint**: 3 user documents exist. Each has header block, non-technical language, practical guidance.

---

## Phase 6: User Story 4 — Maintainer Knows Where to Update (Priority: P4)

**Goal**: Entry index and all cross-references are updated so any maintainer can locate the correct document.

**Independent Test**: For any documentation task, the target folder/file is identifiable from `docs/README.md` or folder names alone.

### Implementation for User Story 4

- [x] T019 [US4] Rewrite `docs/README.md` as audience-based entry index: three sections (開発者向け / 意思決定者向け / ユーザー向け), each linking to all documents in that audience folder. Add governance section linking to `DOCUMENTATION_STANDARDS.md` and `audience-document-map.md`. Add header block. Include quick-navigation table for common goals (deploy, security, usage, troubleshooting).
- [x] T020 [US4] Update all docs/ links in `README.md` (repo root): grep for `docs/` references and update to new audience-based paths
- [x] T021 [P] [US4] Update all docs/ links in `CONTRIBUTING.md`: grep for `docs/` references and update to new paths
- [x] T022 [P] [US4] Update all docs/ links in `CLAUDE.md` (repo root): grep for `docs/` references and update to new paths
- [x] T023 [P] [US4] Update all docs/ links in `cdk/README.md`: grep for `docs/` references and update to new paths
- [x] T024 [P] [US4] Update all docs/ links in CDK module READMEs: `cdk/lib/execution/agent/execution-agent/README.md` and `cdk/lib/verification/agent/verification-agent/README.md`
- [x] T025 [US4] Update all docs/ links in `specs/` directories: grep across all spec files for `docs/` references and update to new paths

**Checkpoint**: `docs/README.md` provides audience-based navigation. All cross-references resolve.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Remove legacy structure, validate completeness, ensure quality

- [x] T026 Delete legacy source files and folders: remove `docs/how-to/`, `docs/reference/`, `docs/explanation/`, `docs/presentation/`, `docs/implementation/`, `docs/appendix.md`, `docs/quickstart.md` (root-level, now at `developer/quickstart.md`)
- [x] T027 Run link verification: grep all files in repository for `docs/` paths and verify each resolves to an existing file. Fix any broken links found.
- [x] T028 Validate document headers: check all 16+ documents have purpose, audience, and last-updated date within first 5 lines
- [x] T029 Quality review: spot-check 3-4 merged documents against `DOCUMENTATION_STANDARDS.md` checklist (clarity, completeness, accuracy, examples, single source of truth, last-updated)
- [x] T030 Validate structure contract: verify `docs/` matches `specs/030-audience-docs-restructure/contracts/index-structure.md` — exactly 3 audience folders + 3 root files, correct file counts per folder, no legacy folders

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — establishes header convention
- **US1 Developer (Phase 3)**: Depends on Phase 1 — can start after directories exist
- **US2 Decision-Maker (Phase 4)**: Depends on Phase 1 — can run in parallel with US1
- **US3 User (Phase 5)**: Depends on Phase 1 — can run in parallel with US1 and US2
- **US4 Index & Links (Phase 6)**: Depends on US1, US2, US3 — needs all documents in place before updating links
- **Polish (Phase 7)**: Depends on US4 — needs all links updated before removing legacy files

### User Story Dependencies

- **US1 (P1)**: Independent — can start after Phase 1
- **US2 (P2)**: Independent — can start after Phase 1, can run in parallel with US1
- **US3 (P3)**: Independent — can start after Phase 1, can run in parallel with US1/US2
- **US4 (P4)**: Depends on US1 + US2 + US3 (needs all target documents to exist before linking)

### Within Each User Story

- All tasks marked [P] within a story can run in parallel
- Non-[P] tasks have implicit ordering (listed in execution order)

### Parallel Opportunities

- **T004–T010** (US1): All 7 consolidation tasks can run in parallel (different target files)
- **T011–T015** (US2): All 5 decision-maker tasks can run in parallel
- **T016–T018** (US3): All 3 user tasks can run in parallel
- **US1, US2, US3**: All three user stories can run in parallel after Phase 1
- **T021–T024** (US4): Link updates across independent files can run in parallel

---

## Parallel Example: User Story 1

```text
# Launch all developer document migrations in parallel:
Task: "Migrate quickstart.md → developer/quickstart.md" (T003)
Task: "Consolidate architecture → developer/architecture.md" (T004)
Task: "Consolidate operations → developer/runbook.md" (T005)
Task: "Migrate testing.md → developer/testing.md" (T006)
Task: "Consolidate requirements → developer/requirements.md" (T007)
Task: "Move ADR files → developer/adr/" (T008)
Task: "Consolidate security → developer/security.md" (T009)
Task: "Consolidate troubleshooting → developer/troubleshooting.md" (T010)
```

## Parallel Example: All User Stories

```text
# After Phase 1 (Setup), launch all three stories in parallel:
Story 1: T003–T010 (developer docs)
Story 2: T011–T015 (decision-maker docs)
Story 3: T016–T018 (user docs)
# Then Phase 6 (US4) after all three complete
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 3: US1 Developer docs (T003–T010)
3. **STOP and VALIDATE**: All developer docs accessible, self-contained, headers present
4. This alone delivers ~80% of the value (developers are primary audience)

### Incremental Delivery

1. Setup → Developer docs (US1) → **Validate** (MVP!)
2. Add Decision-Maker docs (US2) → **Validate**
3. Add User docs (US3) → **Validate**
4. Update index and links (US4) → **Validate**
5. Clean up legacy + final validation (Polish)

### Parallel Team Strategy

With multiple agents:

1. Complete Setup together (Phase 1)
2. Once directories exist:
   - Agent A: US1 developer docs (T003–T010)
   - Agent B: US2 decision-maker docs (T011–T015)
   - Agent C: US3 user docs (T016–T018)
3. After all three complete: US4 links (T019–T025)
4. Final cleanup and validation (T026–T030)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each phase or logical group of tasks
- Stop at any checkpoint to validate progress
- Total: 30 tasks across 7 phases
- Estimated content: ~6,040 lines across 16+ documents (from ~7,359 source lines)
