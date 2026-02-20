# Tasks: Agent List via Slack Reply

**Input**: Design documents from `specs/034-router-list-agents/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2)
- TDD cycle enforced: test tasks MUST be written and FAIL before implementation

---

## Phase 1: Setup

**Purpose**: Confirm existing test infrastructure — no new project structure needed.

- [x] T001 Confirm pytest runs successfully in `verification-zones/verification-agent/` with `python -m pytest tests/ -v`

---

## Phase 2: Foundational

No new shared infrastructure required. `router.py` and `pipeline.py` are pre-existing.
Implementation begins directly in Phase 3.

---

## Phase 3: User Story 1 — Discover Available Agents (Priority: P1) 🎯 MVP

**Goal**: Router LLM selects `list_agents` route when user asks about available agents;
verification agent replies with a formatted list of agent names, descriptions, and skills.

**Independent Test**: Run test suite after T005; confirm ≥10 routing tests and formatter
tests all pass without any execution-agent invocation.

### Tests for User Story 1 (TDD — write FIRST, confirm FAILING before T003/T004)

- [x] T002 [P] [US1] Write failing tests for `LIST_AGENTS_AGENT_ID` constant and `list_agents`
  route selection in `verification-zones/verification-agent/tests/test_router.py`
  — must include ≥5 positive prompts (e.g., "何ができる？", "agent list") and ≥5 negative
  prompts (e.g., "Excelを作って", "こんにちは") per SC-003
- [x] T003 [P] [US1] Write failing tests for `_build_agent_list_message()` with populated
  registry (multiple agents, partial `None` cards) and for `list_agents` branch handler
  in `pipeline.run()` in `verification-zones/verification-agent/tests/test_pipeline.py`

### Implementation for User Story 1

- [x] T004 [P] [US1] Add `LIST_AGENTS_AGENT_ID = "list_agents"` constant and extend
  `_build_router_system_prompt()` to include `list_agents` as a routing option in
  `verification-zones/verification-agent/src/router.py`
- [x] T005 [US1] Add `_build_agent_list_message()` function and `list_agents` branch
  handler in `pipeline.run()`; import `LIST_AGENTS_AGENT_ID` from `router` in
  `verification-zones/verification-agent/src/pipeline.py`
  (depends on T004 for the import)

### Validation for User Story 1

- [x] T006 [US1] Run `python -m pytest tests/ -v` in `verification-zones/verification-agent/`
  and confirm all US1 tests (T002, T003) pass

**Checkpoint**: User Story 1 complete — router selects `list_agents` and pipeline posts
a formatted agent list to Slack.

---

## Phase 4: User Story 2 — Handle No Registered Agents (Priority: P2)

**Goal**: When the registry is empty, `_build_agent_list_message()` returns a
non-empty user-friendly message rather than a blank string.

**Independent Test**: Run test suite after T008; confirm the empty-registry test passes
and no regression in US1 tests.

### Tests for User Story 2 (TDD — write FIRST, confirm FAILING before T008)

- [x] T007 [US2] Add failing test for empty registry path of `_build_agent_list_message()`
  in `verification-zones/verification-agent/tests/test_pipeline.py`
  — assert non-empty reply when `get_all_cards()` returns `{}` per SC-004

### Implementation for User Story 2

- [x] T008 [US2] Implement empty registry branch in `_build_agent_list_message()` in
  `verification-zones/verification-agent/src/pipeline.py`

### Validation for User Story 2

- [x] T009 [US2] Run `python -m pytest tests/ -v` in `verification-zones/verification-agent/`
  and confirm all tests pass (US1 + US2)

**Checkpoint**: All user stories independently functional and tested.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T010 [P] Add `[Unreleased]` entry to `CHANGELOG.md` describing the `list_agents`
  route and Slack reply feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Skipped — no new shared infrastructure
- **US1 (Phase 3)**: After Phase 1
  - T002 and T003 are parallel (different files)
  - T004 can run in parallel with T002/T003 (different files) — but ONLY after T002/T003 are confirmed failing
  - T005 depends on T004 (import of `LIST_AGENTS_AGENT_ID`)
  - T006 depends on T004 + T005
- **US2 (Phase 4)**: After Phase 3 checkpoint
  - T007 written and confirmed failing before T008
- **Polish (Phase 5)**: After all user stories complete

### Within Each User Story

1. Write tests → confirm they FAIL (red)
2. Implement to pass tests (green)
3. Run full suite to verify no regression (refactor/validate)

### Parallel Opportunities

```bash
# US1 test writing (parallel — different files):
Task: "Write failing router tests" → test_router.py
Task: "Write failing pipeline tests" → test_pipeline.py

# US1 implementation (T004 parallel with test writing if tests already failing):
Task: "Add constant + extend prompt" → router.py
# Then sequentially:
Task: "Add formatter + handler" → pipeline.py
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Confirm test infra
2. Write T002 + T003 → confirm failing
3. Implement T004 + T005 → confirm passing
4. **STOP and VALIDATE** T006: run full suite

### Incremental Delivery

1. US1 complete → bot can reply with agent list
2. US2 complete → bot handles empty registry gracefully
3. Polish → docs updated

---

## Notes

- `[P]` tasks operate on different files — no write conflicts
- TDD cycle is mandatory per Constitution Principle II
- All changes confined to `verification-zones/verification-agent/` — no CDK or execution-zone changes
- `CHANGELOG.md` update (T010) can be done any time after Phase 3 checkpoint
- Total: **10 tasks** (1 setup + 0 foundational + 5 US1 + 3 US2 + 1 polish)
