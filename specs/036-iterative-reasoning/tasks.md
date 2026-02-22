# Tasks: Verification Agent Iterative Multi-Agent Reasoning

**Input**: Design documents from `specs/036-iterative-reasoning/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

**Tests**: TDD is **NON-NEGOTIABLE** per Constitution §II. Every production code task is preceded by a failing test task.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US3)

## Path Prefix

All paths relative to repo root: `verification-zones/verification-agent/`

---

## Phase 1: Setup

**Purpose**: Infrastructure changes required before any implementation can begin.

- [X] T001 Add `MAX_AGENT_TURNS` environment variable (default `"5"`) to `cdk/lib/verification-agent-stack.ts` container environment

**Checkpoint**: CDK stack synthesizes without errors.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared runtime primitives required by ALL user stories. No user story can proceed until this phase is complete.

**⚠️ CRITICAL**: Complete this entire phase before beginning Phase 3.

### Data structures

- [X] T004 Write failing tests for `OrchestrationRequest`, `OrchestrationResult`, `ToolCallRecord` dataclasses in `tests/test_orchestrator.py` — assert field presence, type constraints, and `max_turns` validation (1–10 range defaults to 5) — **confirm tests FAIL**
- [X] T005 [P] Write failing tests for `build_agent_tools()` — assert it returns one tool per agent card entry, tool name follows `invoke_{agent_id}` convention, tool is async callable — in `tests/test_agent_tools.py` — **confirm tests FAIL**
- [X] T006 [P] Write failing tests for `MaxTurnsHook` and `ToolLoggingHook` — assert `MaxTurnsHook` increments turn count per `AfterToolCallEvent`, fires `cancel_tool` at limit, resets on `BeforeInvocationEvent`; assert `ToolLoggingHook` emits structured JSON log per tool call — in `tests/test_hooks.py` — **confirm tests FAIL**
- [X] T007 Implement `OrchestrationRequest`, `OrchestrationResult`, `ToolCallRecord` as dataclasses in `src/orchestrator.py` — make T004 green
- [X] T008 [P] Implement `MaxTurnsHook` and `ToolLoggingHook` in `src/hooks.py` — make T006 green
- [X] T009 [P] Implement `make_agent_tool(agent_id, card)` and `build_agent_tools(registry)` in `src/agent_tools.py` — make T005 green; each tool wraps `invoke_execution_agent()` via `asyncio.to_thread`, returns `"ERROR: {error_code} — {message}"` on failure

**Checkpoint**: `python -m pytest tests/test_orchestrator.py tests/test_agent_tools.py tests/test_hooks.py -v` — all green. Foundation ready for user story phases.

---

## Phase 3: User Story 1 — Cross-Domain Multi-Agent Dispatch (Priority: P1) 🎯 MVP

**Goal**: A single user request can invoke multiple specialist agents in one turn; results are synthesized into one Slack reply. Partial failures return successful results plus a failure note.

**Independent Test**: Submit a request spanning two domains (e.g., time + docs). Verify final Slack reply contains content from both agents in one message.

### Tests — write first, confirm FAIL before implementing

- [X] T010 [US1] Write failing test: `OrchestrationAgent.run()` dispatches to two mock agents in one Strands turn and `OrchestrationResult.synthesized_text` contains both results — in `tests/test_orchestrator.py`
- [X] T011 [P] [US1] Write failing test: when one of two dispatched agents returns `"ERROR: ..."`, `OrchestrationResult` includes the successful result and `completion_status == "complete"` (not fully failed) — in `tests/test_orchestrator.py`
- [X] T012 [P] [US1] Write failing test: `pipeline.py` calls `run_orchestration_loop()` instead of `route_request()` + `invoke_execution_agent()` for a normal request — in `tests/test_pipeline.py`

### Implementation

- [X] T013 [US1] Implement `OrchestrationAgent.__init__()` in `src/orchestrator.py` — instantiate `Agent(model, tools=build_agent_tools(registry), system_prompt=ORCHESTRATOR_SYSTEM_PROMPT, hooks=[MaxTurnsHook(max_turns), ToolLoggingHook()])`
- [X] T014 [US1] Implement `ORCHESTRATOR_SYSTEM_PROMPT` constant in `src/orchestrator.py` — instructs LLM to decompose request, dispatch to multiple agents simultaneously when multi-domain, synthesize all results, attribute sources
- [X] T015 [US1] Implement `OrchestrationAgent.run(request)` in `src/orchestrator.py` — build prompt from `OrchestrationRequest`, call `self._agent(prompt, correlation_id=...)`, return `OrchestrationResult` — makes T010 green
- [X] T016 [US1] Implement `_parse_result(strands_result)` in `src/orchestrator.py` — extract `synthesized_text`, populate `agents_called` from tool call history, set `completion_status`, surface any `file_artifact` — makes T011 green
- [X] T017 [US1] Implement `run_orchestration_loop(request, registry, model)` in `src/pipeline.py` — thin wrapper calling `OrchestrationAgent.run()`; replace the `route_request()` + `invoke_execution_agent()` block (lines ~568–850) with this call — makes T012 green

**Checkpoint**: `python -m pytest tests/test_orchestrator.py tests/test_pipeline.py -v` — US1 tests green. Multi-agent dispatch and synthesis verified.

---

## Phase 4: User Story 2 — Iterative Loop Until Complete (Priority: P2)

**Goal**: When the first reasoning turn produces an incomplete result, the agent continues iterating across multiple turns until satisfied or the turn limit is reached. Partial results are returned with an explanation when the limit fires.

**Independent Test**: Submit a multi-step task requiring two sequential tool calls. Verify the agent completes in ≤5 turns without requiring a second Slack message from the user.

### Tests — write first, confirm FAIL before implementing

- [X] T018 [US2] Write failing test: mock Strands `Agent` to require two turns (first turn produces a tool call, second produces end_turn) — assert `OrchestrationResult.turns_used == 2` — in `tests/test_orchestrator.py`
- [X] T019 [P] [US2] Write failing test: mock `MaxTurnsHook` firing at turn limit — assert `OrchestrationResult.completion_status == "partial"` and `synthesized_text` is non-empty — in `tests/test_orchestrator.py`
- [X] T020 [P] [US2] Write failing test: `pipeline.py` appends a partial-result note to the Slack message body when `completion_status == "partial"` — in `tests/test_pipeline.py`

### Implementation

- [X] T021 [US2] Implement `MaxTurnsHook._check()` with `event.cancel_tool = "Maximum reasoning turns reached. Synthesize the best answer from results collected so far."` in `src/hooks.py` — makes T018/T019 green (replaces stub from T008)
- [X] T022 [US2] Implement `_parse_result()` partial detection in `src/orchestrator.py` — set `completion_status = "partial"` when `MaxTurnsHook` fired (detected via hook state or cancel marker in result) — makes T019 green
- [X] T023 [US2] Modify response-handling block in `src/pipeline.py` — when `completion_status == "partial"`, append `"（注: 制限により一部のタスクを完了できませんでした）"` to `response_text` before SQS enqueue — makes T020 green

**Checkpoint**: `python -m pytest tests/test_orchestrator.py tests/test_pipeline.py -v` — US1 + US2 tests green.

---

## Phase 5: User Story 3 — Self-Corrects on Execution Failure (Priority: P3)

**Goal**: When a dispatched agent returns an error, the orchestration agent uses the iterative loop to retry in a subsequent turn (different parameters or alternative agent). All-error outcomes return a user-friendly failure message.

**Independent Test**: Mock one agent to error on first call, succeed on second. Verify user receives a successful reply without manual retry.

### Tests — write first, confirm FAIL before implementing

- [X] T024 [US3] Write failing test: tool returning `"ERROR: …"` on turn 1 followed by success on turn 2 produces `completion_status == "complete"` — in `tests/test_orchestrator.py`
- [X] T025 [P] [US3] Write failing test: all tool results are `"ERROR: …"` after max_turns → `completion_status == "error"` and `synthesized_text` contains user-facing failure explanation — in `tests/test_orchestrator.py`

### Implementation

- [X] T026 [US3] Update `ORCHESTRATOR_SYSTEM_PROMPT` in `src/orchestrator.py` — add explicit retry instruction: "If a tool returns 'ERROR:', reason about the failure and retry with different parameters or an alternative agent in the next turn" — makes T024 green (prompt-driven behavior)
- [X] T027 [US3] Implement `_parse_result()` all-error detection in `src/orchestrator.py` — set `completion_status = "error"` and generate `synthesized_text` explaining which agents were tried and failed — makes T025 green

**Checkpoint**: `python -m pytest tests/test_orchestrator.py -v` — US1 + US2 + US3 tests green.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, documentation, and final validation.

- [X] T034 Deprecate routing logic in `src/router.py` — add module-level deprecation notice, remove `_route_with_router_model()` body (replace with `raise DeprecationWarning`), keep file for backward-compat imports only
- [X] T035 [P] Update `verification-zones/verification-agent/README.md` — replace single-agent routing section with orchestrator architecture diagram and tool list
- [X] T036 [P] Update `CHANGELOG.md` `[Unreleased]` section — add Added: multi-agent dispatch, iterative agentic loop; Changed: pipeline routing replaced by orchestrator
- [X] T037 Run full test suite and fix remaining failures: `cd verification-zones/verification-agent && python -m pytest tests/ -v`
- [ ] T038 Run lint and fix all issues: `cd verification-zones/verification-agent/src && ruff check . --fix`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
  ↓
Phase 2 (Foundational) ← BLOCKS all user story phases
  ↓
Phase 3 (US1 — P1)  ← MVP deliverable
  ↓
Phase 4 (US2 — P2)  ← Depends on orchestrator from US1
  ↓
Phase 5 (US3 — P3)  ← Depends on loop from US2
  ↓
Phase 6 (Polish)
```

### Within Each Phase — TDD Order (MANDATORY)

```
Write failing test → Confirm RED → Implement → Confirm GREEN → Refactor → Stay GREEN
```

### Parallel Opportunities (same phase, different files)

| Phase | Parallel Group |
|---|---|
| Phase 2 | T004 ‖ T005 ‖ T006 (different test files) |
| Phase 2 | T007 ‖ T008 ‖ T009 (different impl files) |
| Phase 3 | T010 ‖ T011 ‖ T012 (different test scenarios/files) |
| Phase 3 | T013 → T014 → T015 → T016 → T017 (sequential — same file) |
| Phase 6 | T035 ‖ T036 (different files) |

---

## Parallel Execution Example: Phase 2

```bash
# Step 1: Write all failing tests in parallel (different files)
Task A: "Write failing tests for hooks in tests/test_hooks.py"           # T006
Task B: "Write failing tests for agent tools in tests/test_agent_tools.py"  # T005
Task C: "Write failing tests for dataclasses in tests/test_orchestrator.py" # T004

# Confirm all RED, then:

# Step 2: Implement in parallel (different files)
Task A: "Implement hooks.py"          # T008
Task B: "Implement agent_tools.py"    # T009
Task C: "Implement orchestrator.py dataclasses"  # T007
```

---

## Implementation Strategy

### MVP (User Story 1 only — Phases 1–3)

1. Phase 1: Setup (T001)
2. Phase 2: Foundational (T004–T009)
3. Phase 3: US1 multi-agent dispatch (T010–T017)
4. **STOP AND VALIDATE**: `python -m pytest tests/ -v` — multi-agent dispatch working end-to-end
5. Deploy verification-agent zone and test with real Slack request spanning two domains

### Incremental Delivery

- **After Phase 3**: Multi-agent dispatch works ← ship
- **After Phase 4**: Iterative loop works ← ship
- **After Phase 5**: Self-correction works ← ship
- **After Phase 6**: Clean, documented, production-ready

---

## Task Summary

| Phase | Tasks | User Story | Parallelizable |
|---|---|---|---|
| 1 — Setup | T001 | — | — |
| 2 — Foundational | T004–T009 | — | T004/T005/T006, T007/T008/T009 |
| 3 — US1 (P1) 🎯 | T010–T017 | US1 | T010/T011/T012 |
| 4 — US2 (P2) | T018–T023 | US2 | T019/T020 |
| 5 — US3 (P3) | T024–T027 | US3 | T025 |
| 6 — Polish | T034–T038 | — | T035/T036 |
| **Total** | **32** | | |

---

## Notes

- `[P]` tasks = different files or clearly independent scenarios — can be assigned to different implementers
- Each user story phase must be **completely green** before moving to the next
- TDD cycle is mandatory per Constitution §II: RED → GREEN → REFACTOR
- Run `ruff check .` after each file edit; fix before committing
- Commit after each checkpoint (one commit per checkpoint minimum)
- `router.py` is not deleted — only deprecated — to preserve backward compatibility during transition
