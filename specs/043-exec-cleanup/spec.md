# Feature Specification: Execution-Zones Code Cleanup

**Feature Branch**: `043-exec-cleanup`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "@execution-zones/ 内のコードについて、ベストプラクティスに従ってログやコメントを改善。speckitのspecs番号などがあれば削除も行う。使用していないコードやインポートはテストも合わせて削除。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove Unused Imports (Priority: P1)

A developer reading or modifying execution-zones code encounters no unused imports, keeping each file's dependency surface minimal and ruff F401-clean.

**Why this priority**: Unused imports are objectively incorrect — ruff flags them as errors. Eliminating them is the most verifiable improvement with zero risk of behavioral change.

**Independent Test**: Run `python -m ruff check execution-zones/ --select F401` and confirm zero violations across all four agents (file-creator-agent, fetch-url-agent, docs-agent, time-agent).

**Acceptance Scenarios**:

1. **Given** a Python source file in execution-zones/ imports a module it never uses, **When** the unused import is removed and tests are run, **Then** all tests pass and `ruff check --select F401` reports zero violations.
2. **Given** a test file imports `pytest` but uses only `unittest.mock`, **When** the `import pytest` line is deleted, **Then** the test suite still passes.
3. **Given** a source file imports `json` but serialization moved to a different module, **When** the `import json` line is deleted, **Then** tests pass and no NameError occurs at runtime.

---

### User Story 2 - Remove Spec-Number Annotations (Priority: P2)

A developer reading code sees no parenthetical spec-number markers like `(027)`, `(035)`, `(014)`, `(021)` in comments, docstrings, or module-level strings. These identifiers are internal development artifacts that add noise without providing context to future readers.

**Why this priority**: Spec-numbers in code create the same maintenance burden as ticket numbers in comments — they go stale and mislead readers into thinking they must reference an external document to understand the code.

**Independent Test**: Search `grep -rn "([0-9][0-9][0-9])" execution-zones/ --include="*.py"` (excluding known HTTP codes and numeric literals) returns zero results.

**Acceptance Scenarios**:

1. **Given** a comment reads `# fetch_url moved to fetch-url-agent (035)`, **When** the annotation is removed to `# fetch_url moved to fetch-url-agent`, **Then** the meaning is preserved and the spec-number is gone.
2. **Given** a docstring contains `strands-agents migration (021)`, **When** the annotation is removed, **Then** the docstring still describes the test's purpose.
3. **Given** a source file has `# Prompt augmentation for file generation (027): ensures model invokes tools`, **When** the spec-number fragment `(027)` is removed, **Then** the comment retains its explanatory intent.
4. **Given** code references HTTP status code `(429)` in a comment about rate limiting, **When** cleanup runs, **Then** `(429)` is preserved because it is a standard HTTP code, not a spec number.

---

### User Story 3 - Review and Improve Comments and Docstrings (Priority: P3)

A developer reading execution-zones code encounters comments and docstrings that accurately describe current behavior. Stale references to renamed functions, split-out modules, or deleted features are corrected or removed.

**Why this priority**: Comment quality matters for maintainability, but the impact is lower than correctness (unused imports) and cleanliness (spec-numbers). This story applies a lighter touch — fix only stale or misleading content, not all prose.

**Independent Test**: A reviewer reading the modified files can understand each module's purpose without consulting external specs or historical context.

**Acceptance Scenarios**:

1. **Given** a module docstring lists spec numbers as its primary content (e.g., `- strands-agents migration (021)`), **When** the bullet is removed or replaced with a plain description, **Then** the docstring still conveys the module's purpose.
2. **Given** all tests pass before this story's changes, **When** only comments and docstrings are modified, **Then** all tests continue to pass.
3. **Given** a docstring references a function or behavior that no longer exists, **When** the docstring is updated to reflect current behavior, **Then** the description matches the implementation.

---

### Edge Cases

- Comments containing HTTP status codes (`429`, `200`, `403`, `404`) must not be treated as spec-number annotations.
- Numeric literals used as size limits (e.g., `5 * 1024 * 1024`) or timeout values in comments must not be modified.
- Imports used only inside nested functions or closures must be verified manually before removal — ruff may flag them as unused even when they are needed at runtime.
- Test files that import symbols only for `isinstance` checks or type-annotation purposes where the type is never exercised count as genuinely unused and should be removed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All Python files in execution-zones/ MUST pass `ruff check --select F401` with zero violations after cleanup.
- **FR-002**: All parenthetical spec-number annotations matching the pattern `([0-9]{3})` MUST be removed from comments, docstrings, and module-level strings — except where the number is an HTTP status code or a recognized numeric constant.
- **FR-003**: All tests in execution-zones/ MUST continue to pass after each change; no test failures may be introduced by the cleanup.
- **FR-004**: Unused imports removed from source files MUST also be removed from corresponding test files if those test files imported the now-absent symbol.
- **FR-005**: Comments and docstrings that become empty or meaningless after annotation removal MUST be updated to retain their explanatory intent, or removed entirely if they add no value.
- **FR-006**: The cleanup MUST NOT change any runtime behavior — no logic, algorithm, or data-structure changes are permitted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `python -m ruff check execution-zones/ --select F401` returns zero violations across all four agents.
- **SC-002**: `grep -rn "([0-9][0-9][0-9])" execution-zones/ --include="*.py"` (excluding HTTP codes and numeric constants) returns zero results.
- **SC-003**: All existing test suites in execution-zones/ pass without modification to test logic — only import cleanup and comment updates are permitted in test files.
- **SC-004**: No new ruff violations are introduced by the cleanup (run `ruff check execution-zones/` to confirm overall cleanliness).

## Assumptions

- `cdk.out/` and `node_modules/` directories are excluded from all checks (generated/vendored code).
- `scripts/` subdirectory (local CLI test scripts using `print()`) is out of scope — `print()` is intentional in those scripts.
- CDK TypeScript files (`*.ts`) are out of scope for Python ruff checks; TypeScript cleanup is not required for this spec.
- The four agents in scope are: `file-creator-agent`, `fetch-url-agent`, `docs-agent`, `time-agent`.
