# Tasks: Web Fetch Agent (fetch_url 独立エージェント化)

**Input**: Design documents from `/specs/035-fetch-url-agent/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**TDD**: Constitution (II) requires Red → Green → Refactor. Test tasks precede every implementation task.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, US3)
- Paths are relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create fetch-url-agent zone skeleton and shared boilerplate.

- [X] T001 Create directory structure `execution-zones/fetch-url-agent/{src/tools/,tests/,cdk/,scripts/}`
- [X] T002 [P] Copy `execution-zones/execution-agent/src/logger_util.py` → `execution-zones/fetch-url-agent/src/logger_util.py` (no changes)
- [X] T003 [P] Copy `execution-zones/execution-agent/src/response_formatter.py` → `execution-zones/fetch-url-agent/src/response_formatter.py` (no changes)
- [X] T004 [P] Copy `execution-zones/execution-agent/src/bedrock_client_converse.py` → `execution-zones/fetch-url-agent/src/bedrock_client_converse.py` (no changes)
- [X] T005 Create `execution-zones/fetch-url-agent/src/requirements.txt` with minimal deps: `strands-agents[a2a,otel]~=1.25.0`, `aws-opentelemetry-distro~=0.10.0`, `uvicorn~=0.34.0`, `fastapi~=0.115.0`, `boto3~=1.42.0`, `requests~=2.31.0`, `beautifulsoup4~=4.12.0`
- [X] T006 Copy `execution-zones/execution-agent/Dockerfile` → `execution-zones/fetch-url-agent/Dockerfile` (update WORKDIR and app name references if needed)
- [X] T007 Create `execution-zones/fetch-url-agent/tests/conftest.py` with standard pytest fixtures (copy pattern from execution-agent conftest.py)

---

## Phase 2: Foundational (TDD: RED — Write Failing Tests)

**Purpose**: Write all failing tests for the new fetch-url-agent BEFORE implementation. This is the TDD Red phase — all tests MUST fail at this point.

**⚠️ CRITICAL**: Constitution II requires tests to fail before implementation begins. Run `python -m pytest tests/ -v` from `execution-zones/fetch-url-agent/` after each test file — expect failures.

- [X] T008 [P] Copy `execution-zones/execution-agent/tests/test_fetch_url.py` → `execution-zones/fetch-url-agent/tests/test_fetch_url.py`; run `python -m pytest tests/test_fetch_url.py -v` from fetch-url-agent — confirm 16 tests FAIL (ImportError)
- [X] T009 [P] Create `execution-zones/fetch-url-agent/tests/test_agent_factory.py`: assert `get_tools()` returns list of exactly 1 tool (`fetch_url`); assert `create_agent()` returns Strands Agent; run — confirm FAIL
- [X] T010 [P] Create `execution-zones/fetch-url-agent/tests/test_agent_card.py`: assert `get_agent_card()["name"] == "SlackAI-WebFetchAgent"`; assert exactly 1 skill with id `fetch_url`; assert `capabilities.attachments == False`; run — confirm FAIL
- [X] T011 [P] Create `execution-zones/fetch-url-agent/tests/test_main.py`: assert `GET /ping` returns `{"status": "Healthy", "agent": "SlackAI-WebFetchAgent"}`; assert `GET /.well-known/agent-card.json` returns card with name `SlackAI-WebFetchAgent`; assert `POST /` with valid JSON-RPC 2.0 body returns 200; run — confirm FAIL

**Checkpoint**: All 4 test files exist, all tests fail with ImportError or ModuleNotFoundError. Foundation confirmed RED.

---

## Phase 3: User Story 1 — Web URL 取得専用エージェント (Priority: P1) 🎯 MVP

**Goal**: New `fetch-url-agent` handles URL fetch requests end-to-end via A2A protocol.

**Independent Test**: `curl http://localhost:9000/.well-known/agent-card.json` returns `SlackAI-WebFetchAgent` card with 1 skill; `python -m pytest tests/ -v` from `execution-zones/fetch-url-agent/` passes all tests.

### Implementation for User Story 1 (GREEN phase)

- [X] T012 [US1] Move `execution-zones/execution-agent/src/tools/fetch_url.py` → `execution-zones/fetch-url-agent/src/tools/fetch_url.py` (file move, no content changes); create empty `execution-zones/fetch-url-agent/src/tools/__init__.py`; run `python -m pytest tests/test_fetch_url.py -v` — confirm passes
- [X] T013 [US1] Create `execution-zones/fetch-url-agent/src/agent_factory.py`: import only `fetch_url`; `get_tools()` returns `[fetch_url]`; `create_agent()` reads `BEDROCK_MODEL_ID` / `AWS_REGION_NAME` env vars (same pattern as execution-agent); run `python -m pytest tests/test_agent_factory.py -v` — confirm passes
- [X] T014 [US1] Create `execution-zones/fetch-url-agent/src/agent_card.py`: `get_agent_card()` returns card with `name="SlackAI-WebFetchAgent"`, `capabilities.attachments=False`, 1 skill (`fetch_url`); `get_health_status()` uses `"SlackAI-WebFetchAgent"`; run `python -m pytest tests/test_agent_card.py -v` — confirm passes
- [X] T015 [US1] Create `execution-zones/fetch-url-agent/src/system_prompt.py`: web-fetch focused prompt stating agent's role is URL content retrieval; instruct to call `fetch_url` when user provides a URL; no file-generation references
- [X] T016 [US1] Create `execution-zones/fetch-url-agent/src/main.py`: copy structure from `execution-zones/execution-agent/src/main.py` — keep `POST /`, `GET /ping`, `GET /.well-known/agent-card.json` endpoints; remove all attachment/file-upload handling (text-only responses); update agent name references to `SlackAI-WebFetchAgent`; run `python -m pytest tests/test_main.py -v` — confirm passes
- [X] T017 [US1] Run full test suite from `execution-zones/fetch-url-agent/`: `python -m pytest tests/ -v` — confirm ALL tests GREEN (T008–T011 all pass)

**Checkpoint**: User Story 1 independently testable. `python -m pytest tests/ -v` GREEN from `execution-zones/fetch-url-agent/`.

---

## Phase 4: User Story 2 — ファイル生成リクエストが引き続き動作する (Priority: P2)

**Goal**: Remove `fetch_url` from `execution-agent` without breaking any existing functionality. File generation works as before.

**Independent Test**: `python -m pytest tests/ -v` from `execution-zones/execution-agent/` passes all remaining tests after `fetch_url` removal.

### TDD: Update Failing Tests for execution-agent (RED)

- [X] T018 [US2] Update `execution-zones/execution-agent/tests/test_agent_factory.py`: change assertion from 8 tools to 7 tools; assert `fetch_url` NOT in `get_tools()`; run `python -m pytest tests/test_agent_factory.py -v` — confirm FAIL (still has 8 tools)
- [X] T019 [US2] Update `execution-zones/execution-agent/tests/test_agent_card.py`: assert skills list has no entry with `id == "fetch_url"`; assert skill count is 7; run `python -m pytest tests/test_agent_card.py -v` — confirm FAIL

### Implementation for User Story 2 (GREEN)

- [X] T020 [US2] Update `execution-zones/execution-agent/src/agent_factory.py`: remove `from tools.fetch_url import fetch_url` import; remove `fetch_url` from `get_tools()` return list; update docstring; run `python -m pytest tests/test_agent_factory.py -v` — confirm GREEN
- [X] T021 [US2] Update `execution-zones/execution-agent/src/agent_card.py`: remove `fetch_url` skill entry from `skills` list; update `description` to remove "Webコンテンツ取得" reference; agent name stays `SlackAI-FileCreatorAgent`; run `python -m pytest tests/test_agent_card.py -v` — confirm GREEN
- [X] T022 [US2] Update `execution-zones/execution-agent/src/system_prompt.py`: remove rule "(4) When the user provides a URL or asks about web content, call fetch_url..."; update tool list references to remove `fetch_url`; update "(5) ツール一覧" rule to list 7 tools
- [X] T023 [US2] Update `execution-zones/execution-agent/src/requirements.txt`: remove `requests~=2.31.0` and `beautifulsoup4~=4.12.0` lines (confirmed these are only used by fetch_url.py)
- [X] T024 [US2] Delete `execution-zones/execution-agent/src/tools/fetch_url.py` (already moved to fetch-url-agent in T012)
- [X] T025 [US2] Delete `execution-zones/execution-agent/tests/test_fetch_url.py` (moved to fetch-url-agent in T008)
- [X] T026 [US2] Run full execution-agent test suite: `python -m pytest tests/ -v` from `execution-zones/execution-agent/` — confirm ALL tests GREEN

**Checkpoint**: User Story 2 complete. execution-agent runs cleanly with 7 tools; no `fetch_url` references remain.

---

## Phase 5: User Story 3 — エージェント一覧への登録・発見 (Priority: P3)

**Goal**: `fetch-url-agent` is deployed as an AgentCore Runtime, registered in `EXECUTION_AGENT_ARNS`, and appears in the verification-agent's agent list.

**Independent Test**: After deployment, `GET /list_agents` on verification-agent returns an entry for `SlackAI-WebFetchAgent`. Router successfully routes a URL fetch request to the new agent.

### CDK Infrastructure

- [X] T027 [P] [US3] Create `execution-zones/fetch-url-agent/cdk/lib/constructs/web-fetch-agent-ecr.ts`: copy `ExecutionAgentEcr` from execution-agent CDK, rename to `WebFetchAgentEcr`, update Docker context path to `fetch-url-agent/src/`
- [X] T028 [P] [US3] Create `execution-zones/fetch-url-agent/cdk/lib/constructs/web-fetch-agent-runtime.ts`: copy `ExecutionAgentRuntime` from execution-agent CDK, rename to `WebFetchAgentRuntime`, update agent name to `SlackAI_WebFetchAgent_{Dev|Prod}`
- [X] T029 [US3] Create `execution-zones/fetch-url-agent/cdk/lib/web-fetch-agent-stack.ts`: stack name `SlackAI-WebFetch-{Dev|Prod}`; use `WebFetchAgentEcr` + `WebFetchAgentRuntime`; output `WebFetchAgentRuntimeArn` (export name: `${stackName}-WebFetchAgentArn`)
- [X] T030 [US3] Create `execution-zones/fetch-url-agent/cdk/bin/app.ts`, `cdk/types/stack-config.ts`, `cdk/package.json`, `cdk/cdk.json` (copy and adapt from execution-agent CDK, update all name references)
- [X] T031 [US3] Create `execution-zones/fetch-url-agent/scripts/deploy.sh`: copy from `execution-zones/execution-agent/scripts/deploy.sh`; update stack name to `SlackAI-WebFetch-{Dev|Prod}`; update CDK context key `forceWebFetchImageRebuild`
- [X] T032 [US3] Run `cd execution-zones/fetch-url-agent/cdk && npm install && npm test` — confirm CDK Jest tests pass

### Integration: Verification-Agent Registration

- [X] T033 [US3] Update verification-agent CDK configuration to add `web-fetch` agent ARN to `EXECUTION_AGENT_ARNS` (find the CDK context/env var definition in `verification-zones/verification-agent/cdk/` and add the new entry placeholder)
- [X] T034 [US3] Run `python -m pytest tests/ -v` from `verification-zones/verification-agent/` — confirm all existing tests still pass (registry loading handles new agent entry)

**Checkpoint**: User Story 3 infrastructure ready. CDK deploys new agent zone; verification-agent CDK knows about the new ARN.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finalize, validate, and document.

- [X] T035 [P] Run `ruff check .` from `execution-zones/fetch-url-agent/src/` — fix any lint errors
- [X] T036 [P] Run `ruff check .` from `execution-zones/execution-agent/src/` — confirm no regressions after fetch_url removal
- [X] T037 Run full validation per `specs/035-fetch-url-agent/quickstart.md` acceptance checklist (SC-001 through SC-005)
- [X] T038 [P] Update `CHANGELOG.md` [Unreleased] section: Added fetch-url-agent; Changed execution-agent (fetch_url removed)
- [X] T039 [P] Update `CLAUDE.md` Active Technologies section to reflect fetch-url-agent addition

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion (T001–T007) — write failing tests BEFORE implementation
- **US1 (Phase 3)**: Depends on Phase 2 (T008–T011 must be RED first)
- **US2 (Phase 4)**: Depends on Phase 3 completion (fetch_url.py must be in fetch-url-agent before deleting from execution-agent)
- **US3 (Phase 5)**: Depends on Phase 3 completion (fetch-url-agent src must exist before building CDK)
- **Polish (Phase 6)**: Depends on Phases 3–5 completion

### User Story Dependencies

- **US1 (P1)** → no dependency on other stories
- **US2 (P2)** → depends on US1 (T012 must complete before T024/T025 — fetch_url.py must be moved first)
- **US3 (P3)** → depends on US1 (src/ must exist before CDK); independent of US2

### Within Each Story

- Tests (T008–T011) MUST be written and FAIL before implementation (T012–T017)
- T012 (move fetch_url.py) MUST complete before T013 (agent_factory imports it)
- T013 MUST complete before T014, T015, T016 (main.py depends on agent_factory and agent_card)
- T018–T019 (update test assertions) MUST be RED before T020–T025 (implementation)
- T027–T028 [P] can run simultaneously (different CDK construct files)
- T029 depends on T027 and T028 (stack imports both constructs)

### Parallel Opportunities

Within Phase 1: T002, T003, T004 can run in parallel (different files).
Within Phase 2: T008, T009, T010, T011 can run in parallel (different test files).
Within Phase 5: T027, T028 can run in parallel (different CDK files); T035, T036, T038, T039 in Phase 6.

---

## Parallel Example: User Story 1 (Phase 3)

```bash
# Step 1: T012 must run first (move fetch_url.py)
# Step 2: T013, T014, T015 can then run in parallel (different src files)
Task: "Create agent_factory.py with fetch_url tool" → execution-zones/fetch-url-agent/src/agent_factory.py
Task: "Create agent_card.py for SlackAI-WebFetchAgent" → execution-zones/fetch-url-agent/src/agent_card.py
Task: "Create system_prompt.py web-fetch focused" → execution-zones/fetch-url-agent/src/system_prompt.py
# Step 3: T016 (main.py) runs after T013 and T014 complete
# Step 4: T017 (full test run) runs last
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T007)
2. Complete Phase 2: RED tests (T008–T011)
3. Complete Phase 3: US1 Implementation (T012–T017)
4. **STOP and VALIDATE**: `python -m pytest tests/ -v` from `execution-zones/fetch-url-agent/` — all GREEN

### Incremental Delivery

1. Setup + Foundational → RED tests written
2. US1 → fetch-url-agent fully functional (MVP)
3. US2 → execution-agent cleaned up (regression confirmed)
4. US3 → CDK deployed, agent registered in verification-agent
5. Polish → lint, changelog, docs

---

## Notes

- [P] tasks = different files, no blocking dependencies between them
- TDD is mandatory per Constitution II: every implementation task must have a preceding test task that fails
- T012 is a file MOVE (not copy) — fetch_url.py must exist in exactly one location
- execution-agent's `requests` and `beautifulsoup4` deps are ONLY used by fetch_url.py (confirmed via grep in research phase)
- No verification-agent Python code changes needed — `EXECUTION_AGENT_ARNS` env var handles routing automatically via agent card discovery

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 39 |
| Phase 1 (Setup) | 7 tasks |
| Phase 2 (TDD Red) | 4 tasks |
| Phase 3 (US1 - P1 MVP) | 6 tasks |
| Phase 4 (US2 - P2) | 9 tasks |
| Phase 5 (US3 - P3) | 8 tasks |
| Phase 6 (Polish) | 5 tasks |
| Parallelizable tasks | 17 ([P] marked) |
| MVP scope | Phases 1–3 (US1: 17 tasks) |
