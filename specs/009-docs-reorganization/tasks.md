# Tasks: Documentation Reorganization

**Input**: Design documents from `/specs/009-docs-reorganization/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅
**Tests**: Not explicitly requested - verification tasks included in final phase

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Documentation project**: Root-level `*.md` files and `docs/` directory
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directory structure and standard files for documentation reorganization

- [x] T001 Create Diátaxis directory structure in docs/ (tutorials/, how-to/, reference/, explanation/)
- [x] T002 [P] Create CONTRIBUTING.md in repository root with contribution guidelines
- [x] T003 [P] Create CHANGELOG.md in repository root with Keep a Changelog format
- [x] T004 [P] Create SECURITY.md in repository root with security policy

**Checkpoint**: Directory structure ready, standard files created

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Move existing content to new Diátaxis structure - MUST complete before simplification

**⚠️ CRITICAL**: All content must be in new locations before updating links

- [x] T005 Move docs/architecture/ to docs/reference/architecture/
- [x] T006 [P] Move docs/security/ to docs/reference/security/
- [x] T007 [P] Move docs/operations/ to docs/reference/operations/
- [x] T008 [P] Move docs/requirements/ to docs/reference/requirements/
- [x] T009 Move docs/adr/ to docs/explanation/adr/
- [x] T010 Extract design principles (ナッジ理論、ネットワーク効果等) from docs/README.md to docs/explanation/design-principles.md
- [x] T011 Create docs/how-to/troubleshooting.md placeholder for operations guidance
- [x] T012 Create docs/tutorials/getting-started.md placeholder for onboarding

**Checkpoint**: All content migrated to Diátaxis structure

---

## Phase 3: User Story 1 - 新規開発者のオンボーディング (Priority: P1) 🎯 MVP

**Goal**: 新規開発者が 5 分以内にプロジェクト概要を理解し、30 分以内にシステム全体像を把握できる

**Independent Test**: README.md から docs/quickstart.md → docs/reference/architecture/overview.md へのパスが明確で、各リンクが有効

### Implementation for User Story 1

- [x] T013 [US1] Simplify README.md to ≤200 lines - remove theoretical foundations, keep overview and navigation
- [x] T014 [US1] Simplify README.ja.md to ≤200 lines - mirror changes from README.md
- [x] T015 [US1] Update README.md links to point to new docs/reference/ structure
- [x] T016 [US1] Update README.ja.md links to point to new docs/reference/ structure
- [x] T017 [US1] Add developer navigation path in docs/README.md (README → quickstart → architecture → implementation)
- [x] T018 [US1] Ensure docs/quickstart.md has clear steps for development setup

**Checkpoint**: Developer onboarding path complete and testable

---

## Phase 4: User Story 2 - セキュリティ担当者の評価 (Priority: P1)

**Goal**: セキュリティ担当者が 3 クリック以内でセキュリティ要件に到達できる

**Independent Test**: docs/README.md からセキュリティドキュメントへのパスが明確（docs/README.md → docs/reference/security/requirements.md）

### Implementation for User Story 2

- [x] T019 [US2] Add security navigation path in docs/README.md (requirements → threat-model → implementation)
- [x] T020 [US2] Update links in docs/reference/security/requirements.md to new structure
- [x] T021 [US2] Update links in docs/reference/security/threat-model.md to new structure
- [x] T022 [US2] Update links in docs/reference/security/implementation.md to new structure
- [x] T023 [US2] Ensure cross-references between security documents are complete

**Checkpoint**: Security documentation path complete and testable

---

## Phase 5: User Story 3 - 運用担当者のトラブルシューティング (Priority: P2)

**Goal**: 運用担当者が 2 分以内にトラブルシューティングガイドに到達できる

**Independent Test**: docs/README.md → docs/how-to/troubleshooting.md へのパスが明確

### Implementation for User Story 3

- [x] T024 [US3] Add operations navigation path in docs/README.md (quickstart → slack-setup → monitoring → troubleshooting)
- [x] T025 [US3] Populate docs/how-to/troubleshooting.md with common issues and solutions
- [x] T026 [US3] Update links in docs/reference/operations/slack-setup.md to new structure
- [x] T027 [US3] Update links in docs/reference/operations/monitoring.md to new structure
- [x] T028 [US3] Update links in docs/reference/operations/testing.md to new structure

**Checkpoint**: Operations documentation path complete and testable

---

## Phase 6: User Story 4 - 意思決定者への説明 (Priority: P2)

**Goal**: 非技術者向けプレゼンテーション資料が 1 クリックでアクセス可能

**Independent Test**: docs/README.md から docs/presentation/ への直接リンクが存在

### Implementation for User Story 4

- [x] T029 [US4] Add decision-maker navigation path in docs/README.md (presentation/non-technical-overview → security-overview)
- [x] T030 [US4] Update links in docs/presentation/README.md to new structure
- [x] T031 [US4] Update links in docs/presentation/non-technical-overview.md to new structure
- [x] T032 [US4] Update links in docs/presentation/security-overview.md to new structure

**Checkpoint**: Presentation documentation path complete and testable

---

## Phase 7: User Story 5 - コントリビューターの参加 (Priority: P3)

**Goal**: コントリビューターが CONTRIBUTING.md を見つけ、PR プロセスを理解できる

**Independent Test**: ルートの CONTRIBUTING.md が存在し、docs/quickstart.md へのリンクが有効

### Implementation for User Story 5

- [x] T033 [US5] Populate CONTRIBUTING.md with complete contribution guidelines (Code of Conduct, PR process, style guide)
- [x] T034 [US5] Populate CHANGELOG.md with current version history (1.0.0 release notes)
- [x] T035 [US5] Populate SECURITY.md with security policy and vulnerability reporting process
- [x] T036 [US5] Add contributor navigation in README.md (link to CONTRIBUTING.md)

**Checkpoint**: Contributor documentation complete and testable

---

## Phase 8: Navigation Hub Simplification

**Purpose**: Simplify docs/README.md to pure navigation hub (≤100 lines)

- [x] T037 Rewrite docs/README.md as navigation hub with audience-specific paths
- [x] T038 Remove detailed content from docs/README.md (move to appropriate documents)
- [x] T039 Add document index organized by Diátaxis categories (tutorials, how-to, reference, explanation)
- [x] T040 Ensure docs/README.md is ≤100 lines

**Checkpoint**: Navigation hub simplified

---

## Phase 9: Polish & Verification

**Purpose**: Final validation and cross-cutting improvements

- [x] T041 [P] Update all internal links in docs/explanation/adr/*.md files
- [x] T042 [P] Update links in docs/appendix.md to new structure
- [x] T043 [P] Update links in docs/implementation/roadmap.md to new structure
- [x] T044 Run markdown-link-check on all Markdown files to verify no broken links
- [x] T045 Verify README.md line count (target: ≤200 lines) with `wc -l README.md`
- [x] T046 Verify docs/README.md line count (target: ≤100 lines) with `wc -l docs/README.md`
- [x] T047 Verify directory structure matches Diátaxis framework with `tree docs -d`
- [x] T048 Test navigation paths for each audience type (Developer, Security, Operations, DecisionMaker)
- [ ] T049 Commit and document changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-7)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel (both P1)
  - US3 and US4 can proceed in parallel (both P2)
  - US5 depends on standard files being created (Phase 1)
- **Navigation Hub (Phase 8)**: Depends on all user stories being complete
- **Polish (Phase 9)**: Depends on all content phases being complete

### User Story Dependencies

| User Story | Priority | Dependencies | Can Parallel With |
| ---------- | -------- | ------------ | ----------------- |
| US1 (Developer Onboarding) | P1 | Foundational | US2 |
| US2 (Security Evaluation) | P1 | Foundational | US1 |
| US3 (Ops Troubleshooting) | P2 | Foundational | US4 |
| US4 (Decision Maker) | P2 | Foundational | US3 |
| US5 (Contributor) | P3 | Phase 1 (standard files) | None |

### Parallel Opportunities

- T002, T003, T004 can run in parallel (different root files)
- T005, T006, T007, T008, T009 can partially parallelize (different target directories)
- US1 and US2 can run in parallel after Foundational
- US3 and US4 can run in parallel after Foundational
- T041, T042, T043 can run in parallel (different files)

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all standard file creation together:
Task: "Create CONTRIBUTING.md in repository root with contribution guidelines"
Task: "Create CHANGELOG.md in repository root with Keep a Changelog format"
Task: "Create SECURITY.md in repository root with security policy"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (create directories and standard files)
2. Complete Phase 2: Foundational (move all content to new structure)
3. Complete Phase 3: User Story 1 (developer onboarding path)
4. **STOP and VALIDATE**: Test developer can navigate from README.md to architecture docs
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Structure ready
2. Add User Story 1 (Developer) → Test independently → **MVP!**
3. Add User Story 2 (Security) → Test independently
4. Add User Stories 3-4 (Ops + Decision Maker) → Test independently
5. Add User Story 5 (Contributor) → Test independently
6. Navigation Hub + Polish → Final validation

### Parallel Team Strategy

With multiple contributors:

1. Complete Setup + Foundational together
2. Once Foundational is done:
   - Contributor A: User Story 1 + 2 (P1 priorities)
   - Contributor B: User Story 3 + 4 (P2 priorities)
   - Contributor C: User Story 5 (P3 priority)
3. All complete Navigation Hub and Polish together

---

## Success Criteria Verification

| Criterion | Task | Target |
| --------- | ---- | ------ |
| SC-006: README.md ≤ 200 lines | T045 | ≤200 |
| SC-007: docs/README.md ≤ 100 lines | T046 | ≤100 |
| SC-004: リンク切れ 0 件 | T044 | 0 |
| SC-005: 読者別ナビゲーションパス | T048 | 4 paths |
| FR-005: CONTRIBUTING.md | T002, T033 | Exists |
| FR-006: CHANGELOG.md | T003, T034 | Exists |
| FR-007: SECURITY.md | T004, T035 | Exists |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

