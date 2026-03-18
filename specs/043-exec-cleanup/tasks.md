# Tasks: Execution-Zones Code Cleanup

**Input**: Design documents from `/specs/043-exec-cleanup/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓

**Organization**: Tasks are grouped by user story. All three stories can execute after the baseline phase. US1 (import removal) and US2 (spec-number removal) are independent; US3 (docstring review) should follow US1 and US2 since spec-number removal may affect docstring content.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Baseline Verification

**Purpose**: Confirm all tests pass before any changes; establish the green baseline that must be preserved throughout.

- [X] T001 Run `cd execution-zones/docs-agent && python -m pytest tests/ -v` and confirm all tests pass
- [X] T002 [P] Run `cd execution-zones/fetch-url-agent && python -m pytest tests/ -v` and confirm all tests pass
- [X] T003 [P] Run `cd execution-zones/file-creator-agent && python -m pytest tests/ -v` and confirm all tests pass
- [X] T004 [P] Run `cd execution-zones/time-agent && python -m pytest tests/ -v` and confirm all tests pass

**Checkpoint**: All four agents green. If any fail, fix before proceeding.

---

## Phase 2: User Story 1 — Remove Unused Imports (Priority: P1) 🎯 MVP

**Goal**: Achieve zero ruff F401 violations across all four execution-zone agents.

**Independent Test**: `python -m ruff check execution-zones/ --select F401` returns zero violations and all `python -m pytest tests/ -v` runs pass in every agent.

### docs-agent

- [X] T005 [P] [US1] Remove `import time` from execution-zones/docs-agent/src/main.py

### fetch-url-agent

- [X] T006 [P] [US1] Remove `import json` from execution-zones/fetch-url-agent/src/agent_card.py
- [X] T007 [P] [US1] Remove `import json` from execution-zones/fetch-url-agent/src/bedrock_client_converse.py
- [X] T008 [P] [US1] Remove `import pytest` from execution-zones/fetch-url-agent/tests/test_agent_card.py
- [X] T009 [P] [US1] Remove `import pytest` from execution-zones/fetch-url-agent/tests/test_fetch_url.py
- [X] T010 [P] [US1] Remove `import pytest` from execution-zones/fetch-url-agent/tests/test_main.py

### file-creator-agent — source files

- [X] T011 [P] [US1] Remove `import json` from execution-zones/file-creator-agent/src/agent_card.py
- [X] T012 [P] [US1] Remove `import json` from execution-zones/file-creator-agent/src/attachment_processor.py
- [X] T013 [P] [US1] Remove `import json` from execution-zones/file-creator-agent/src/bedrock_client_converse.py
- [X] T014 [P] [US1] Remove `import json` from execution-zones/file-creator-agent/src/cloudwatch_metrics.py
- [X] T015 [P] [US1] Remove `import json` from execution-zones/file-creator-agent/src/document_extractor.py
- [X] T016 [P] [US1] Remove `import json` from execution-zones/file-creator-agent/src/file_downloader.py
- [X] T017 [P] [US1] Remove `typing.Optional` from the `from typing import` line in execution-zones/file-creator-agent/src/thread_history.py
- [X] T018 [P] [US1] Remove `typing.List` from the `from typing import` line in execution-zones/file-creator-agent/src/tools/generate_chart_image.py

### file-creator-agent — test files

- [X] T019 [P] [US1] Remove `import pytest` from execution-zones/file-creator-agent/tests/test_agent_card.py
- [X] T020 [P] [US1] Remove `import pytest` from execution-zones/file-creator-agent/tests/test_attachment_processor.py
- [X] T021 [P] [US1] Remove `import pytest` from execution-zones/file-creator-agent/tests/test_bedrock_client.py
- [X] T022 [P] [US1] In execution-zones/file-creator-agent/tests/test_cloudwatch_metrics.py: remove `import pytest` (line 14); inside `test_metric_name_constants_defined`, remove the four unused constants (`METRIC_BEDROCK_TIMEOUT`, `METRIC_BEDROCK_THROTTLING`, `METRIC_ASYNC_TASK_COMPLETED`, `METRIC_ASYNC_TASK_FAILED`) from the local `from cloudwatch_metrics import (...)` block — keep `METRIC_BEDROCK_API_ERROR` and `METRIC_ASYNC_TASK_CREATED` which are asserted
- [X] T023 [P] [US1] Remove `import pytest` from execution-zones/file-creator-agent/tests/test_file_config.py
- [X] T024 [P] [US1] Remove `import pytest` from execution-zones/file-creator-agent/tests/test_file_downloader.py
- [X] T025 [P] [US1] In execution-zones/file-creator-agent/tests/test_main.py: remove `import time` (line 15), `import threading` (line 16), `MagicMock` from the `from unittest.mock import` line (line 17), and `import pytest` (line 19)
- [X] T026 [P] [US1] Remove `import pytest` from execution-zones/file-creator-agent/tests/test_response_formatter.py

### US1 Verification

- [X] T027 [US1] Run `python -m ruff check execution-zones/ --select F401` and confirm zero violations
- [X] T028 [US1] Run `python -m pytest tests/ -v` in each of docs-agent, fetch-url-agent, file-creator-agent, time-agent and confirm all tests still pass

**Checkpoint**: Zero F401 violations, all tests green — US1 complete.

---

## Phase 3: User Story 2 — Remove Spec-Number Annotations (Priority: P2)

**Goal**: Eliminate all `(014)`, `(021)`, `(027)`, `(035)` parenthetical annotations from execution-zones Python files, while preserving `(429)` HTTP status code references.

**Independent Test**: `grep -rn "([0-9][0-9][0-9])" execution-zones/ --include="*.py" | grep -v "cdk.out" | grep -v "node_modules" | grep -v "scripts/" | grep -v "429"` returns zero results.

### file-creator-agent — test files

- [X] T029 [P] [US2] In execution-zones/file-creator-agent/tests/test_agent_factory.py: remove `(035)` from the module docstring bullet; remove `(035)` from the inline comment on line 40
- [X] T030 [P] [US2] Remove `(014)` from the module docstring in execution-zones/file-creator-agent/tests/test_response_formatter.py
- [X] T031 [P] [US2] Remove `(035)` from the function docstring at line 82 in execution-zones/file-creator-agent/tests/test_agent_card.py
- [X] T032 [P] [US2] In execution-zones/file-creator-agent/tests/test_main.py: remove `(021)` from the module docstring bullet; remove `(027)` from the docstring of `_make_agent_result` (line 76) and from the docstring of the test at line 84

### file-creator-agent — source files

- [X] T033 [P] [US2] Remove `(027)` from the module docstring in execution-zones/file-creator-agent/src/tools/__init__.py
- [X] T034 [P] [US2] Remove `(027)` from the inline comment at line 61 in execution-zones/file-creator-agent/src/main.py
- [X] T035 [P] [US2] Remove `(014)` and `(027)` from the module docstring in execution-zones/file-creator-agent/src/file_config.py

### US2 Verification

- [X] T036 [US2] Run `grep -rn "([0-9][0-9][0-9])" execution-zones/ --include="*.py" | grep -v "cdk.out" | grep -v "node_modules" | grep -v "scripts/" | grep -v "429"` and confirm zero results
- [X] T037 [US2] Run `python -m pytest tests/ -v` in file-creator-agent and confirm all tests still pass

**Checkpoint**: Zero spec-number annotations, tests green — US2 complete.

---

## Phase 4: User Story 3 — Review Comments and Docstrings (Priority: P3)

**Goal**: Ensure all comments and docstrings in modified files remain meaningful after spec-number removal. Fix or remove any that became empty, misleading, or vacuous.

**Independent Test**: All tests continue to pass; a reviewer reading each modified file understands its purpose without external context.

- [X] T038 [US3] Review execution-zones/file-creator-agent/src/file_config.py module docstring after `(014)` and `(027)` removal — confirm it still clearly states the module's purpose; rewrite if the remaining text is incomplete
- [X] T039 [US3] Review execution-zones/file-creator-agent/src/tools/__init__.py module docstring after `(027)` removal — confirm it describes the tools package clearly
- [X] T040 [US3] Review execution-zones/file-creator-agent/src/main.py line 61 comment after `(027)` removal — confirm the remaining text is self-explanatory
- [X] T041 [US3] Review execution-zones/file-creator-agent/tests/test_agent_factory.py module docstring after `(035)` removal — confirm the remaining bullets accurately describe test coverage
- [X] T042 [US3] Review execution-zones/file-creator-agent/tests/test_main.py module docstring after `(021)` removal and function docstrings after `(027)` removal — confirm each still describes the test's intent

### US3 Verification

- [X] T043 [US3] Run `python -m pytest tests/ -v` in all four agent directories and confirm all tests pass
- [X] T044 [US3] Run `python -m ruff check execution-zones/` (all rules, no `--select` filter) and confirm zero violations

**Checkpoint**: All docstrings meaningful, all tests green, ruff clean — US3 complete.

---

## Phase 5: Polish & Documentation Sync (Principle VI)

**Purpose**: Update mandatory documentation to reflect the completed cleanup.

- [X] T045 Add `[Unreleased]` entry to CHANGELOG.md under `### Changed`: "Removed unused imports (ruff F401) and spec-number annotations from execution-zones Python source and test files (file-creator-agent, fetch-url-agent, docs-agent)"
- [X] T046 [P] Update CLAUDE.md "Recent Changes" section: add entry for `043-exec-cleanup` describing what was cleaned in execution-zones
- [X] T047 [P] README.md and zone READMEs — N/A (no architecture, behavior, or user-facing changes; skip)
- [X] T048 [P] scripts/deploy.sh and zone-level deploy scripts — N/A (no CDK or infrastructure changes; skip)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Baseline)**: No dependencies — run immediately
- **Phase 2 (US1)**: Depends on Phase 1 green; all T005–T026 tasks are independent of each other [P]
- **Phase 3 (US2)**: Depends on Phase 2 complete (same files edited in US1 and US2 for test_main.py); all T029–T035 tasks are independent of each other [P]
- **Phase 4 (US3)**: Depends on Phase 3 complete (docstring review after spec-number removal)
- **Phase 5 (Polish)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: No story dependencies — start after baseline
- **US2 (P2)**: No story dependencies — but must follow US1 for test_main.py (same file edited in T025 and T032)
- **US3 (P3)**: Follow US2 — docstring review confirms correctness after annotation removal

### Within Each User Story

- All import removal tasks [P] within US1 affect different files — run together
- All annotation removal tasks [P] within US2 affect different files — run together
- Verification tasks (T027, T028, T036, T037, T043, T044) run after their story's implementation tasks

### Parallel Opportunities

```bash
# Phase 1 — run all four baseline tests in parallel:
cd execution-zones/docs-agent && python -m pytest tests/ -v &
cd execution-zones/fetch-url-agent && python -m pytest tests/ -v &
cd execution-zones/file-creator-agent && python -m pytest tests/ -v &
cd execution-zones/time-agent && python -m pytest tests/ -v &

# Phase 2 — all 22 import removals (T005–T026) can run in parallel:
# T005, T006, T007, ..., T026 — all different files

# Phase 3 — all 7 annotation removals (T029–T035) can run in parallel:
# T029, T030, T031, T032, T033, T034, T035 — all different files
```

---

## Implementation Strategy

### MVP (US1 Only)

1. Complete Phase 1 (baseline verification)
2. Complete Phase 2 (US1 — 22 import removals + 2 verification runs)
3. Validate: `ruff check --select F401` → zero; all tests green

### Full Delivery

1. Phase 1: Baseline → Phase 2: US1 → Phase 3: US2 → Phase 4: US3 → Phase 5: Docs
2. Each phase is independently verifiable before proceeding

---

## Notes

- Preserve `(429)` in `execution-zones/file-creator-agent/src/file_downloader.py` — HTTP status code, not a spec number
- Preserve numeric literals `100` and `101` in `tests/test_file_config.py` — byte-size parameters, not annotations
- `time-agent` has no F401 violations and no spec-number annotations — no changes needed in that agent
- T022 (cloudwatch_metrics) is more complex than a simple one-line removal — read the file carefully before editing
- T025 (test_main.py) removes 4 imports in one file — use targeted edits to avoid touching surrounding code
