# Implementation Plan: Documentation Restructure

**Branch**: `001-docs-restructure` | **Date**: 2026-02-13 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/001-docs-restructure/spec.md`  
**User input**: ベストプラクティスに従ったフォルダ構成を計画

## Summary

Reorganize the `docs/` folder and file layout so that (1) there is a single entry index with quick navigation and at most four to six top-level sections, (2) structure is purpose-based (how-to, reference, explanation, presentation) aligned with documentation best practices, (3) each topic has one canonical location and duplicate content is merged or redirected, and (4) all in-repo links to docs continue to work. No application code or new runtimes are introduced; only documentation structure and links are in scope.

## Technical Context

**Language/Version**: Documentation only — Markdown; no application language in scope.  
**Primary Dependencies**: None (file moves, link updates, optional link-checker tooling).  
**Storage**: Filesystem — existing `docs/` directory (~32 markdown files, current top-level: explanation, how-to, implementation, presentation, reference, tutorials).  
**Testing**: Manual or tool-based link checks; navigation verification (e.g. deploy reachable in ≤3 steps from index).  
**Target Platform**: Repository consumers (readers, maintainers, CI that may validate links).  
**Project Type**: Documentation restructure — no new source code structure.  
**Performance Goals**: Find deployment guide in at most three navigation steps from docs entry; index scannable (≤6 top-level sections).  
**Constraints**: Zero broken in-repository links after restructure; DOCUMENTATION_STANDARDS.md remains authoritative for style and quality.  
**Scale/Scope**: Current doc set (~32 files under `docs/`); in-scope links from README, CONTRIBUTING, `docs/`, and `specs/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Project constitution**: The repository's `.specify/memory/constitution.md` is a template (placeholders only). No project-specific gates are defined.
- **Applied check**: Spec FR-007 requires alignment with Documentation Standards. Restructure must not remove or contradict `docs/DOCUMENTATION_STANDARDS.md`. **PASS** — plan keeps standards as single source of rules.
- **No unjustified violations** — this feature does not introduce new codebases, APIs, or infrastructure; documentation-only changes.

## Project Structure

### Documentation (this feature)

```text
specs/001-docs-restructure/
├── plan.md              # This file
├── research.md          # Phase 0: doc-structure best practices
├── data-model.md        # Phase 1: documentation structure model
├── quickstart.md        # Phase 1: steps to execute restructure
├── contracts/           # Phase 1: index/navigation contract
│   └── index-structure.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2: created by /speckit.tasks
```

### Documentation target (repository `docs/`)

*Proposed structure after restructure (best-practice, purpose-based). Exact names and merges to be confirmed in tasks.*

```text
docs/
├── README.md                    # Single entry index (quick nav + section list)
├── DOCUMENTATION_STANDARDS.md   # Unchanged; single source of rules
├── quickstart.md                # Deploy/setup — canonical "how to deploy"
├── appendix.md                  # Glossary, references (unchanged or merged)
│
├── how-to/                      # Task-oriented guides
│   ├── troubleshooting.md
│   ├── troubleshooting-no-reply.md
│   └── verify-processing-flow.md
│
├── reference/                   # Authoritative specs and configuration
│   ├── architecture/            # overview, implementation-details, user-experience, cross-account
│   ├── operations/              # slack-setup, monitoring, deployment-iam-policy, testing
│   ├── requirements/            # functional-requirements
│   └── security/                # authentication-authorization, threat-model, implementation, requirements, bedrock-cmk-consideration
│
├── explanation/                 # Concepts and design rationale
│   ├── design-principles.md
│   └── adr/                     # 001–004 ADRs, README
│
├── presentation/                # Non-technical overviews
│   ├── non-technical-overview.md
│   └── security-overview.md
│
└── [tutorials | merged]         # tutorials/getting-started: merge into quickstart or keep as tutorials/ per research
```

**Structure decision**: Purpose-based layout (how-to, reference, explanation, presentation) with at most six top-level sections. `implementation/` (roadmap) is merged into `reference/` or `explanation/` to stay within six sections. Entry point is `docs/README.md` with a quick-navigation table and a clear section list. See [data-model.md](./data-model.md) and [contracts/index-structure.md](./contracts/index-structure.md).

## Constitution Check (post–Phase 1)

- **Documentation Standards**: Design artifacts (research, data-model, contracts, quickstart) do not alter or replace `docs/DOCUMENTATION_STANDARDS.md`. Restructure remains layout- and link-only. **PASS**.
- **No new runtimes or code structure**: Confirmed; only `docs/` structure and in-repo links are in scope. **PASS**.

## Complexity Tracking

No constitution violations. This section is left empty.
