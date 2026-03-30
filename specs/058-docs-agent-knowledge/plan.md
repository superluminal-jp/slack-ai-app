# Implementation Plan: Rich project documentation for inquiry assistance

**Branch**: `058-docs-agent-knowledge` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/058-docs-agent-knowledge/spec.md`

**Note**: This template is filled by `/speckit.plan`. See `.specify/templates/plan-template.md` for the workflow.

## Summary

Expand and refine the repository `docs/` corpus so end users, operators, and decision-makers can resolve common questions from official documentation. Content follows `docs/DOCUMENTATION_STANDARDS.md` and the existing audience split; emphasis on clear headings, synonyms, cross-links, and procedural structure so documentation-based assistance can surface relevant passages. Supporting artifacts: inquiry-pattern coverage checklist (`contracts/`), optional local verification via `DOCS_PATH` for the Docs Agent zone, and parity updates (`CHANGELOG`, README) per constitution.

## Technical Context

**Language/Version**: Markdown (GitHub-flavored); repository standards in `docs/DOCUMENTATION_STANDARDS.md`  
**Primary Dependencies**: None new for authoring; existing Docs Agent reads `.md`/`.txt`/`.rst` under `/app/docs` or `DOCS_PATH`  
**Storage**: Files under repository `docs/` (no new DynamoDB/S3)  
**Testing**: Reviewer checklist (SC-001, SC-004); optional scripts (e.g., link check, presence checks) under `tests/` or `tests/scripts/`; Docs Agent manual smoke with `DOCS_PATH` pointing at repo `docs/`  
**Target Platform**: Git repository and static Markdown consumption in containerized Docs Agent  
**Project Type**: Documentation corpus + verification artifacts  
**Performance Goals**: Coverage audit completable in under 60 minutes (SC-003)  
**Constraints**: No spec/branch/task IDs in production code comments (Principle VII); documentation parity for README/CHANGELOG when navigation or user-facing doc behavior changes (Principle VI)  
**Scale/Scope**: ≥20 inquiry patterns in sample audit; ≥15 user-facing FAQ/guide-style entries (SC-002); 90%+ coverage on sample (SC-001)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --------- | ------ | ----- |
| **I. SDD** | Pass | Spec `058-docs-agent-knowledge/spec.md` defines acceptance criteria and success metrics. |
| **II. TDD** | Pass (with scope note) | No production Python/TS change required for prose-only edits. Verification = failing-then-passing checks: inquiry checklist rows start as Gap/Partial, then move to Covered; add or extend automated doc checks if missing. Zone pytest suites unchanged unless tooling is added. |
| **III. Security-First** | Pass | Documentation-only; must not document secrets or PII examples (`DOCUMENTATION_STANDARDS.md`). |
| **IV. Fail-open / fail-closed** | N/A | No runtime pipeline change. |
| **V. Zone isolation** | Pass | No cross-zone code coupling introduced by Markdown. |
| **VI. Documentation & deploy-script parity** | Required | `[Unreleased]` CHANGELOG entry; update `README.md` / `README.ja.md` if doc map or entry paths change; `CLAUDE.md` if stack/commands change. Unified `scripts/deploy.sh` unchanged unless Docs Agent packaging is fixed to consume root `docs/` (then same PR). |
| **VII. Clean identifiers** | Pass | No spec numbers in application code; checklist IDs (`IP-xxx`) are reviewer artifacts only. |

**Post-design re-check**: Research and contracts align with Principles I, VI, and VII; no new violations.

## Project Structure

### Documentation (this feature)

```text
specs/058-docs-agent-knowledge/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1 (logical entities)
├── quickstart.md        # Phase 1
├── contracts/
│   └── inquiry-coverage-checklist.md
└── tasks.md             # Phase 2 (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
docs/
├── README.md                 # Entry and navigation (update if new top-level areas)
├── DOCUMENTATION_STANDARDS.md
├── audience-document-map.md
├── developer/
├── decision-maker/
└── user/

execution-zones/docs-agent/
├── README.md
└── src/                      # Runtime; search_docs, optional DOCS_PATH for local test
```

**Structure Decision**: All substantive content edits target repository root `docs/`. Implementation tasks confirm how bundled Markdown reaches the Docs Agent image and align packaging if root `docs/` is not reflected in deployed artifacts (see `research.md`).

## Complexity Tracking

> Only if Constitution violations must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------- |
| Principle II (non-pytest tests) | Markdown deliverable; acceptance is coverage checklist + optional scripts | Pytest unit tests on prose are not meaningful; checklist + automation is the verifiable contract |

## Phase 2 planning

Stop here. Next step: `/speckit.tasks` to produce `tasks.md` with documentation edits, parity updates, verification tasks, and optional packaging verification for Docs Agent.

## Generated artifacts

| Artifact | Path |
| -------- | ---- |
| Research | `specs/058-docs-agent-knowledge/research.md` |
| Data model | `specs/058-docs-agent-knowledge/data-model.md` |
| Quickstart | `specs/058-docs-agent-knowledge/quickstart.md` |
| Contract | `specs/058-docs-agent-knowledge/contracts/inquiry-coverage-checklist.md` |
