# Research: Rich project documentation for inquiry assistance

## 1. Canonical documentation location

**Decision**: Treat the repository root `docs/` tree as the single source of truth for project documentation content.

**Rationale**: `docs/README.md` and `docs/audience-document-map.md` define the audience split (`developer/`, `decision-maker/`, `user/`). `docs/DOCUMENTATION_STANDARDS.md` governs structure and style. Feature work should expand and cross-link within this tree.

**Alternatives considered**:

- **Edit only `execution-zones/docs-agent/src/docs/`** — Rejected as primary: duplicates root `docs/`, risks drift, and conflicts with constitution guidance to keep top-level and zone docs synchronized with behavior.
- **External wiki** — Rejected: spec requires in-repo corpus for the same delivery and review process as code.

## 2. How documentation reaches the Docs Agent runtime

**Decision**: Document authors maintain root `docs/`. Before merge, confirm how the Docs Agent image receives Markdown (unified deploy copies root `docs/` into a CDK staging path when the parent directory exists; the Docker build context is the zone `src/` directory). Implementation tasks must verify the deployed image includes the intended `.md` files (e.g., `DOCS_PATH` override in tests, or build inspection) and fix packaging if root `docs/` changes are not reflected.

**Rationale**: `search_docs` reads `/app/docs` (or `DOCS_PATH`) for `.md`/`.txt`/`.rst`. Any gap between root `docs/` and the image breaks user-facing answers.

**Alternatives considered**:

- **Assume COPY always matches root `docs/`** — Deferred to implementation verification; staging paths and `.dockerignore` must be validated in tasks.

## 3. Retrieval-friendly writing (no new product features)

**Decision**: Improve discoverability using documentation-only techniques aligned with `DOCUMENTATION_STANDARDS.md`: clear H1–H3 hierarchy, inverted pyramid, consistent terminology, synonyms in natural prose, tables for limits and comparisons, numbered steps for procedures, symptom/cause/action for troubleshooting, and cross-links instead of duplicating paragraphs.

**Rationale**: The existing Docs Agent tool matches queries with substring search over file paths and contents; richer headings and vocabulary increase hit rate without changing runtime code in this feature.

**Alternatives considered**:

- **Add semantic/vector search** — Out of scope for this spec (documentation corpus enrichment, not new retrieval infrastructure).

## 4. Verification and “TDD” for documentation

**Decision**: Pair content changes with automated or scripted checks where feasible (e.g., link validation, required file presence, optional shell tests for forbidden contradictions). Manual reviewer checklist covers SC-001/SC-004. Any new script lives under `tests/` or `tests/scripts/` per repository conventions.

**Rationale**: Constitution requires tests before implementation; for Markdown-heavy work, executable checks plus an explicit inquiry-pattern checklist satisfy traceability without forcing artificial unit tests on prose.

**Alternatives considered**:

- **Reviewer-only QA** — Insufficient for repeatability; at least one automated guardrail should exist if the repo already uses doc checks.

## 5. Constitution Principle VI (documentation parity)

**Decision**: Same delivery as documentation changes includes `CHANGELOG.md` `[Unreleased]`, and updates to `README.md` / `README.ja.md` or zone READMEs when navigation or “how to find docs” behavior changes.

**Rationale**: Matches non-negotiable documentation parity for user-visible or structural documentation changes.
