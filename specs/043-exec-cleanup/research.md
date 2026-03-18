# Research: Execution-Zones Code Cleanup

**Branch**: `043-exec-cleanup` | **Date**: 2026-03-18

## Survey Results

This feature requires no external research — all findings come from static analysis of the existing codebase.

---

### Decision 1: ruff F401 violations — full inventory

**Decision**: Remove all 29 F401 violations identified by `ruff check execution-zones/ --select F401`.

**Rationale**: Every violation is a genuine unused import, confirmed by cross-referencing the file content. No nested-function false-positives were found (unlike `asyncio` in verification-zones/agent_tools.py). The cloudwatch_metrics test imports are inside a function body but flagged because only 2 of 6 imported symbols are used in assertions.

**Inventory by agent**:

| Agent | File | Unused Import |
|-------|------|---------------|
| docs-agent | src/main.py | `time` |
| fetch-url-agent | src/agent_card.py | `json` |
| fetch-url-agent | src/bedrock_client_converse.py | `json` |
| fetch-url-agent | tests/test_agent_card.py | `pytest` |
| fetch-url-agent | tests/test_fetch_url.py | `pytest` |
| fetch-url-agent | tests/test_main.py | `pytest` |
| file-creator-agent | src/agent_card.py | `json` |
| file-creator-agent | src/attachment_processor.py | `json` |
| file-creator-agent | src/bedrock_client_converse.py | `json` |
| file-creator-agent | src/cloudwatch_metrics.py | `json` |
| file-creator-agent | src/document_extractor.py | `json` |
| file-creator-agent | src/file_downloader.py | `json` |
| file-creator-agent | src/thread_history.py | `typing.Optional` |
| file-creator-agent | src/tools/generate_chart_image.py | `typing.List` |
| file-creator-agent | tests/test_agent_card.py | `pytest` |
| file-creator-agent | tests/test_attachment_processor.py | `pytest` |
| file-creator-agent | tests/test_bedrock_client.py | `pytest` |
| file-creator-agent | tests/test_cloudwatch_metrics.py | `pytest` |
| file-creator-agent | tests/test_cloudwatch_metrics.py | `METRIC_BEDROCK_TIMEOUT` (inside fn) |
| file-creator-agent | tests/test_cloudwatch_metrics.py | `METRIC_BEDROCK_THROTTLING` (inside fn) |
| file-creator-agent | tests/test_cloudwatch_metrics.py | `METRIC_ASYNC_TASK_COMPLETED` (inside fn) |
| file-creator-agent | tests/test_cloudwatch_metrics.py | `METRIC_ASYNC_TASK_FAILED` (inside fn) |
| file-creator-agent | tests/test_file_config.py | `pytest` |
| file-creator-agent | tests/test_file_downloader.py | `pytest` |
| file-creator-agent | tests/test_main.py | `time`, `threading`, `MagicMock`, `pytest` |
| file-creator-agent | tests/test_response_formatter.py | `pytest` |
| time-agent | — | none |

**Note on cloudwatch_metrics test**: `test_metric_name_constants_defined` imports 6 constants from `cloudwatch_metrics` inside the function body but only asserts on 2 (`METRIC_BEDROCK_API_ERROR`, `METRIC_ASYNC_TASK_CREATED`). The other 4 are genuinely unused.

---

### Decision 2: Spec-number annotation removal — full inventory

**Decision**: Remove 10 parenthetical spec-number annotations from Python files. Preserve HTTP status codes.

**Rationale**: Spec numbers `(014)`, `(021)`, `(027)`, `(035)` embedded in comments and docstrings reference historical planning documents. They provide no value to future readers and create misleading links to specs that may not exist in the repository.

**Inventory**:

| File | Line | Annotation | Action |
|------|------|------------|--------|
| file-creator-agent/tests/test_agent_factory.py | module docstring | `(035)` | Remove |
| file-creator-agent/tests/test_agent_factory.py | line 40 comment | `(035)` | Remove |
| file-creator-agent/tests/test_response_formatter.py | module docstring | `(014)` | Remove |
| file-creator-agent/tests/test_agent_card.py | line 82 docstring | `(035)` | Remove |
| file-creator-agent/tests/test_main.py | module docstring | `(021)` | Remove |
| file-creator-agent/tests/test_main.py | line 76 docstring | `(027)` | Remove |
| file-creator-agent/tests/test_main.py | line 84 docstring | `(027)` | Remove |
| file-creator-agent/src/tools/__init__.py | module docstring | `(027)` | Remove |
| file-creator-agent/src/main.py | line 61 comment | `(027)` | Remove |
| file-creator-agent/src/file_config.py | module docstring | `(014)`, `(027)` | Remove both |

**Preserved**: `(429)` in `file_downloader.py` lines 89 and 331 — HTTP status code, not a spec number.

**Also in test_file_config.py lines 84, 88**: These are numeric values `100` and `101` used as size limit parameters — not spec-number annotations, preserved.

---

### Decision 3: TDD cycle interpretation for pure cleanup

**Decision**: Confirm baseline test pass → make changes → confirm no regression. No "red" phase exists because cleanup tasks add no new behavior.

**Rationale**: The constitution requires Red→Green→Refactor for code that adds new behavior. For removal-only tasks (unused imports, comment cleanup), the existing passing tests act as the regression guard. Running tests before and after each file change fulfills the spirit of the TDD gate. This is the same approach used successfully in 042-code-cleanup.

**Alternatives considered**: Requiring a "failing test first" for import removal is meaningless — Python does not fail because of an unused import. Adding new failing tests just to satisfy the gate mechanically would introduce test bloat without improving safety.

---

### Decision 4: docs-agent/src/main.py `time` import

**Decision**: Remove the `import time` from docs-agent/src/main.py.

**Rationale**: `time` is not referenced anywhere in the file. The import was likely left over from an earlier version that included timeout logic now moved elsewhere.

**Risk**: Low — confirmed by full text search of `time.` in the file.

---

### Decision 5: Scope boundary — no TypeScript changes

**Decision**: TypeScript files (CDK constructs, tests) are out of scope.

**Rationale**: The user request specifically targets `execution-zones/` Python code. Running `ruff check` on TypeScript files is not applicable. A separate TypeScript-specific linting pass (ESLint/tsc) is not part of this cleanup.
