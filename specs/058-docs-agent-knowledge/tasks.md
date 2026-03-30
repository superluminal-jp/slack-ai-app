---
description: "Task list for rich project documentation (docs-agent inquiry assistance)"
---

# Tasks: Rich project documentation for inquiry assistance

**Input**: Design documents from `/Users/taikiogihara/work/slack-ai-app/specs/058-docs-agent-knowledge/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Constitution-aligned verification: add a failing-then-passing shell check for SC-002 heading coverage (`tests/scripts/`); reviewer completion of `docs/developer/inquiry-coverage-checklist.md` for SC-001/SC-004.

**Organization**: Phases follow user stories US1 (P1) → US2 (P2) → US3 (P3), after setup and foundational packaging verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: `[US1]`, `[US2]`, `[US3]` only on user-story phase tasks
- Exact file paths in every task description

---

## Phase 1: Setup

**Purpose**: Baseline artifacts and automated guardrail for SC-002 before substantive edits.

- [x] T001 Create `docs/developer/inquiry-coverage-checklist.md` from `specs/058-docs-agent-knowledge/contracts/inquiry-coverage-checklist.md` with at least 20 inquiry-pattern rows (IP-001–IP-020) spanning user, developer, and decision-maker audiences; initial **Coverage** column mostly `Gap` or `Partial` to record baseline (SC-001 audit scaffold)
- [x] T002 [P] Add `tests/scripts/check_user_doc_heading_count.sh` that exits non-zero if the combined count of Markdown `###`-level headings in `docs/user/faq.md` plus `docs/user/user-guide.md` is fewer than 15 (SC-002); make the script executable and document usage in a one-line comment at top of the script

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm how root `docs/` reaches the Docs Agent runtime; fix packaging or document accurate operator steps before user-story content work.

**⚠️ CRITICAL**: Complete T003 before treating Docs Agent smoke tests as authoritative for deployed images.

- [x] T003 Verify Docs Agent Docker build context: read `execution-zones/docs-agent/src/.dockerignore`, `execution-zones/docs-agent/src/Dockerfile`, and `scripts/deploy.sh` (docs copy into `execution-zones/docs-agent/cdk/lib/docs-agent/docs`); update `docs/developer/execution-agent-docs-access.md` with a short “Current state” subsection reflecting actual behavior; if `.md` files are excluded from the image, fix `execution-zones/docs-agent/src/.dockerignore` (or Dockerfile `COPY`) so `docs/**/*.md` under the build context is included, without broadening ignores unnecessarily

**Checkpoint**: Packaging path is understood and corrected or explicitly documented — proceed to User Story 1.

---

## Phase 3: User Story 1 — End user finds answers without escalation (Priority: P1) 🎯 MVP

**Goal**: User-facing docs cover FR-001 themes (response, delays/timeouts, channel permissions, attachments, privacy) with actionable steps and retrieval-friendly headings/synonyms.

**Independent Test**: Reviewer can answer representative end-user questions using only `docs/user/*.md`; `bash tests/scripts/check_user_doc_heading_count.sh` exits 0.

### Tests for User Story 1 (verification)

> Run `tests/scripts/check_user_doc_heading_count.sh` **before** marking T007 complete; expect RED until content meets the threshold.

- [x] T004 [US1] Run `bash tests/scripts/check_user_doc_heading_count.sh` and record RED/GREEN in PR notes; if already GREEN, still add at least two new distinct `###` entries or expanded paragraphs in `docs/user/faq.md` or `docs/user/user-guide.md` so FR-001 synonym/retrieval coverage increases (per spec intent)

### Implementation for User Story 1

- [x] T005 [P] [US1] Expand `docs/user/faq.md` with additional concrete “how / why / what if” entries or subsections for channel constraints, timeouts, privacy expectations, and escalation—use symptom / next action structure where helpful (FR-001, FR-007)
- [x] T006 [P] [US1] Expand `docs/user/user-guide.md` with clearer prompts, limitations, and cross-links to `docs/user/faq.md` and `docs/user/usage-policy.md` (FR-001, FR-006)
- [x] T007 [US1] Update `docs/user/usage-policy.md` for consistent terminology and cross-links to FAQ/guide where policies are referenced (FR-001, edge case: no contradictory duplicate answers vs `docs/user/faq.md`)

### Validation for User Story 1

- [x] T008 [US1] Run `bash tests/scripts/check_user_doc_heading_count.sh` until exit code 0; update `docs/developer/inquiry-coverage-checklist.md` user-facing rows from `Gap` toward `Covered` for questions answered by `docs/user/faq.md` and `docs/user/user-guide.md`

**Checkpoint**: SC-002 script passes; User Story 1 acceptance scenarios in `specs/058-docs-agent-knowledge/spec.md` are addressable from user docs.

---

## Phase 4: User Story 2 — Operator or developer resolves “how does this work?” quickly (Priority: P2)

**Goal**: Developer docs expose architecture, zones, deployment order, security pipeline, and troubleshooting with short entry points and synonyms (FR-002, FR-006, FR-007).

**Independent Test**: Operator/developer questions map to specific sections in `docs/developer/*.md` and `docs/README.md` without reading the entire tree.

- [x] T009 [P] [US2] Add retrieval-friendly headings and natural-language synonyms (verification zone, execution zone, A2A, AgentCore, ホワイトリスト, レート制限, etc.) to `docs/developer/architecture.md` without duplicating entire runbooks (FR-002, FR-006)
- [x] T010 [P] [US2] Strengthen `docs/developer/quickstart.md` with explicit sequencing for unified deploy expectations and pointers to runbook sections (acceptance: deployment sequencing discoverable)
- [x] T011 [US2] Update `docs/developer/runbook.md` with numbered procedures or pointers where rollback/redeploy expectations are operator questions (FR-007)
- [x] T012 [P] [US2] Refine `docs/developer/troubleshooting.md` so top issues use symptom / likely cause / next action blocks (FR-007)
- [x] T013 [US2] Update `docs/README.md` quick navigation and `docs/audience-document-map.md` last-updated metadata if new anchors or files were introduced (FR-004)

**Checkpoint**: User Story 2 acceptance scenarios satisfied at documentation level.

---

## Phase 5: User Story 3 — Decision-maker policy and risk framing (Priority: P3)

**Goal**: Decision-maker docs answer who may use the system, risks/mitigations, and cost drivers with links to user policy (FR-003).

**Independent Test**: Governance/security/cost questions have summary answers in `docs/decision-maker/*.md` with cross-links.

- [x] T014 [P] [US3] Align `docs/decision-maker/governance.md` with organizational boundaries and cross-links to `docs/user/usage-policy.md` (FR-003)
- [x] T015 [P] [US3] Tighten `docs/decision-maker/security-overview.md` for stakeholder-level risk/mitigation questions and links to `docs/developer/security.md` for depth (FR-003)
- [x] T016 [US3] Refine `docs/decision-maker/cost-and-resources.md` for qualitative cost drivers and cautions without implementation-only detail (FR-003)

**Checkpoint**: User Story 3 acceptance scenarios satisfied.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: SC-001 coverage, constitution parity, optional mirror sync, stakeholder sign-off (SC-004).

- [x] T017 Update `docs/developer/inquiry-coverage-checklist.md` so at least 90% of rows are `Covered` with primary doc paths (SC-001); ensure no two rows give conflicting answers for the same question (spec edge case)
- [x] T018 [P] Add `[Unreleased]` entry to `CHANGELOG.md` describing documentation corpus improvements; update `README.md` and `README.ja.md` if documentation navigation or “how to find docs” changed
- [x] T019 Update `CLAUDE.md` **Recent Changes** (and **Active Technologies** only if stack/commands changed) to reflect this documentation work
- [x] T020 Run procedures in `specs/058-docs-agent-knowledge/quickstart.md` (link sanity, optional `DOCS_PATH` smoke with `execution-zones/docs-agent/README.md`); capture four-reviewer outcome for SC-004 in checklist notes or PR description
- [x] T021 [P] If `execution-zones/docs-agent/src/docs/` must stay a mirror of root `docs/` for local Docker builds, synchronize content from `docs/` to `execution-zones/docs-agent/src/docs/` in the same PR; if not required after T003, add a one-line note to `execution-zones/docs-agent/README.md` explaining which `docs/` path local runs should mount or copy

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **blocks** trusting deployed Docs Agent behavior for doc validation
- **Phase 3 (US1)**: Depends on Phase 1 for T001/T002; run T003 before or in parallel with US1 content work, but must finish T003 before release if packaging was broken
- **Phase 4 (US2)**: Depends on Phase 1 checklist existing; can start after Phase 2 completes (recommended) or overlap with late US1 if files differ
- **Phase 5 (US3)**: Can start after Phase 1; independent files from US2 except shared `docs/README.md` (T013 before final polish if conflicts)
- **Phase 6 (Polish)**: Depends on US1–US3 content tasks intended for this release

### User Story Dependencies

- **US1 (P1)**: Foundation checklist + heading script in place; packaging understood (T003)
- **US2 (P2)**: Independent content paths under `docs/developer/` and `docs/README.md`
- **US3 (P3)**: Independent content paths under `docs/decision-maker/`

### Parallel Opportunities

- **Phase 1**: T001 and T002 in parallel
- **US1**: T005 and T006 in parallel; T007 after substantive edits to policy
- **US2**: T009, T010, T012 in parallel; T011 depends on clarity from T010 but can follow quickly
- **US3**: T014 and T015 in parallel
- **Polish**: T018 and T021 in parallel

### Parallel Example: User Story 2

```bash
# After Phase 2 checkpoint, launch parallel edits:
# - docs/developer/architecture.md (T009)
# - docs/developer/quickstart.md (T010)
# - docs/developer/troubleshooting.md (T012)
# Then sequential: docs/developer/runbook.md (T011), docs/README.md + audience map (T013)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (T001–T002) and Phase 2 (T003)
2. Complete Phase 3 (T004–T008) — end-user documentation + SC-002 script green
3. **STOP and VALIDATE**: Independent test for US1; checklist rows for user audience trending to Covered

### Incremental Delivery

1. Add Phase 4 (US2) → validate operator/developer mapping to sections
2. Add Phase 5 (US3) → validate decision-maker summaries
3. Phase 6 → SC-001 ≥90%, SC-004 sign-off, CHANGELOG/README parity

---

## Notes

- Do not embed spec numbers, branch names, or task IDs in production Python/TypeScript comments (Constitution Principle VII); checklist **IP-** IDs are reviewer artifacts in Markdown only.
- Prefer editing repository root `docs/`; use T021 only if mirror is required for local or image consistency.
