# Feature Specification: Code Cleanup — Logs, Comments, and Dead Code in verification-zones

**Feature Branch**: `042-code-cleanup`
**Created**: 2026-03-17
**Status**: Draft
**Input**: User description: "@verification-zones/ 内のコードについて、ベストプラクティスに従ってログやコメントを改善。speckitのspecs番号などがあれば削除も行う。使用していないコードやインポートはテストも合わせて削除。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Readable, Actionable Log Output (Priority: P1)

A developer investigating a production issue reads the verification-agent log stream. Every log line tells them which step ran, what the outcome was, and what context (e.g. correlation_id, user, channel) applied — without having to cross-reference spec documents or guess what a terse message means.

**Why this priority**: Operational visibility is foundational. Poor logs make incidents take longer to resolve and force developers to add temporary debug prints.

**Independent Test**: Run the verification-agent test suite; confirm that log messages emitted during key pipeline steps include `correlation_id`, a clear step label, and are at the correct level (DEBUG for internals, INFO for milestones, WARNING for recoverable issues, ERROR for failures).

**Acceptance Scenarios**:

1. **Given** a Slack event enters the pipeline, **When** each security check (existence, whitelist, rate limit) passes or fails, **Then** a single structured log line is emitted at the appropriate level with `correlation_id` and outcome reason.
2. **Given** a Lambda handler processes an event, **When** the handler starts and completes, **Then** INFO-level boundary logs are emitted with enough context to trace the full request.
3. **Given** an exception is caught, **When** the log is written, **Then** the log includes `error_type`, a human-readable message, and `correlation_id` — no raw tracebacks surfaced as INFO or DEBUG.

---

### User Story 2 — Comments Convey Intent, Not History (Priority: P2)

A developer reading any source file in `verification-zones/` finds comments that explain *why* a decision was made or *what* a non-obvious block does — not references to spec numbers (e.g. `(039)`, `(040)`, `(041)`) or implementation notes left over from incremental feature delivery.

**Why this priority**: Stale spec references create noise and erode trust in comments generally; developers start ignoring all comments when some are clearly out of date.

**Independent Test**: Grep all `.py` and `.ts` source files (excluding `cdk.out/`) for patterns like `(039)`, `(040)`, `(041)`, and confirm zero matches after the change.

**Acceptance Scenarios**:

1. **Given** any `.py` or `.ts` file in `verification-zones/` (excluding generated output), **When** grepped for spec-number patterns matching `\(\d{3}\)`, **Then** no matches are found.
2. **Given** a code block with a previously spec-numbered comment, **When** the spec number is removed, **Then** the intent of the comment is preserved or the comment is rewritten to explain the *why* if the original comment added no value beyond the number.

---

### User Story 3 — No Dead Code or Unused Imports (Priority: P3)

A developer adding a new feature to the verification-agent opens a module and finds only symbols that are actually referenced. Unused imports do not clutter the top of files, and unused functions/classes do not mislead about the active API surface.

**Why this priority**: Dead code increases cognitive load and occasionally hides bugs when stale logic is accidentally re-activated.

**Independent Test**: Run `ruff check --select F401` (unused imports) and confirm no violations in `verification-zones/` source files. Confirm all tests still pass after removal.

**Acceptance Scenarios**:

1. **Given** a Python source file imports a symbol, **When** that symbol is not referenced anywhere in the file, **Then** the import is removed.
2. **Given** a TypeScript source file imports a type or value, **When** that symbol is not used, **Then** the import is removed.
3. **Given** a test file covered a function or class that is now deleted, **When** the dead code is removed, **Then** the corresponding test is also removed (not left as an orphan).
4. **Given** `pipeline.py` imports `route_request`, `UNROUTED_AGENT_ID`, `LIST_AGENTS_AGENT_ID` from `router` with the comment "kept for backward-compat; not called in main flow", **When** these symbols are confirmed unused, **Then** both the imports and the comment are removed.

---

### Edge Cases

- A comment contains both a spec number and genuine explanatory text — only the spec number portion is removed; the explanatory text is preserved.
- A symbol appears unused in its own module but is re-exported to callers — confirm via cross-module grep before deleting.
- A Lambda handler file shares code with a test; ensure test-only imports in `conftest.py` are not incorrectly flagged as unused.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All log statements MUST use the project's structured logger (`get_logger` / `log` from `logger_util`, or the equivalent CDK/Lambda logger) rather than bare `print()` calls.
- **FR-002**: Log levels MUST be assigned correctly: DEBUG for detailed internals, INFO for request milestones and outcomes, WARNING for recoverable anomalies, ERROR for failures that affect the user.
- **FR-003**: Every log statement at INFO or above MUST include `correlation_id` where one is available in the calling context.
- **FR-004**: All spec-number references matching the pattern `\(\d{3}\)` MUST be removed from comments, docstrings, and inline strings across all `.py` and `.ts` source files in `verification-zones/` (excluding `cdk.out/` and compiled `.d.ts`/`.js` files).
- **FR-005**: All unused Python imports detectable by `ruff F401` MUST be removed from source files in `verification-zones/`.
- **FR-006**: All unused TypeScript imports MUST be removed from source files in `verification-zones/` (excluding `node_modules/` and `cdk.out/`).
- **FR-007**: Any test file that exclusively tests deleted code MUST also be deleted; no orphan tests referencing non-existent symbols are permitted.
- **FR-008**: No behavior change is permitted — all existing passing tests MUST continue to pass after cleanup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero files in `verification-zones/` (excluding `cdk.out/`, `node_modules/`, `.d.ts`, compiled `.js`) contain spec-number comment patterns `\(\d{3}\)` after the change.
- **SC-002**: `ruff check --select F401` reports zero unused-import violations across all Python source files in `verification-zones/`.
- **SC-003**: All Python test suites in `verification-zones/` pass with no regressions (`pytest` exit code 0).
- **SC-004**: All TypeScript CDK test suites in `verification-zones/` pass with no regressions (`npm test` exit code 0).
- **SC-005**: No `print()` statements remain in production Python source files (tests excluded); all output goes through the structured logger.
