# Research: Audience-Based Documentation Restructure

**Feature**: 030-audience-docs-restructure
**Date**: 2026-02-14

## R-001: Content Consolidation Strategy

**Decision**: Merge existing files by topic into single audience-targeted documents, not merely move files.

**Rationale**: Current docs have significant overlap (e.g., security across 5 files totaling ~1,444 lines). A merge-and-deduplicate approach reduces total volume by ~30-40% while ensuring each topic has one canonical source.

**Alternatives considered**:
- File-by-file move (preserves git history but retains duplication) — rejected
- Symlinks to old paths (avoids broken links but hides structure issues) — rejected

## R-002: ADR Handling — Subfolder vs Single File

**Decision**: Use `developer/adr/` subfolder with `README.md` index and individual ADR files.

**Rationale**: Four ADRs exist (~330 lines total). Individual files allow independent updates and follow the widely-adopted ADR convention (Michael Nygard, "Documenting Architecture Decisions"). A single merged file would break this convention and complicate future ADR additions.

**Alternatives considered**:
- Single `developer/adr.md` with all decisions inline — rejected (breaks ADR convention, harder to add new ones)

## R-003: Roadmap Content Disposition

**Decision**: Archive `implementation/roadmap.md` content into `developer/requirements.md` as a "Completed Phases" appendix section.

**Rationale**: The roadmap describes five completed phases (all marked done). It has historical value but no active planning content. Including it as an appendix in requirements preserves context without creating a 9th developer document outside the spec.

**Alternatives considered**:
- New `developer/roadmap.md` (adds 9th file, breaks spec's "exactly eight") — rejected
- Delete entirely (loses historical context) — rejected

## R-004: Appendix Content Distribution

**Decision**: Distribute appendix.md content as follows:
- **Glossary** (~20 entries): Add as a section at the end of `developer/architecture.md`
- **Academic bibliography** (~80 lines): Move into `decision-maker/design-principles.md` as a References section
- **Technical references** (Slack/AWS/OWASP/NIST links): Inline into relevant developer documents

**Rationale**: A standalone glossary file would be an orphan outside the audience folders. Embedding terms near their usage context improves discoverability. The academic bibliography is only relevant to `design-principles.md`.

**Alternatives considered**:
- Keep `docs/glossary.md` at root — rejected (adds complexity to top-level, low discoverability)
- Embed in every document — rejected (duplication)

## R-005: Legacy Architecture Content

**Decision**: Remove deprecated API Gateway + SQS architecture diagram from `developer/architecture.md`. Retain only the current AgentCore A2A architecture.

**Rationale**: The legacy path is no longer in production (commit `c83cf43` removed it). Including it risks confusing readers about the current system. A brief note ("Migrated from API Gateway to AgentCore A2A in [date]") suffices for historical context.

**Alternatives considered**:
- Keep with "DEPRECATED" label — rejected (adds 130 lines of noise)
- Move to ADR — rejected (architecture changes are already documented in commit history)

## R-006: New Content Creation — Decision-Maker Documents

**Decision**: Author the following from scratch using existing system knowledge:
- `decision-maker/proposal.md` — derive from `presentation/non-technical-overview.md` (business value, adoption plan, features)
- `decision-maker/cost-and-resources.md` — derive from CDK config, AWS service usage, and operational notes
- `decision-maker/governance.md` — derive from whitelist/authorization model and security policies

**Rationale**: These audiences are underserved. The non-technical-overview slides contain ~60% of proposal content. Cost and governance require original authoring but can reference existing implementation details.

## R-007: New Content Creation — User Documents

**Decision**: Author the following from scratch:
- `user/user-guide.md` — derive from `architecture/user-experience.md` (end-user flows) and `presentation/non-technical-overview.md` (feature walkthroughs)
- `user/usage-policy.md` — derive from whitelist model, security requirements, and PII handling
- `user/faq.md` — aggregate FAQ content from `quickstart.md`, both presentation files, and troubleshooting docs (user-relevant items only)

**Rationale**: No user-facing documentation currently exists. Source material is scattered across developer and presentation docs but must be rewritten for a non-technical audience.

## R-008: Documentation Best Practices Applied

**Decision**: Apply the following standards to all documents:

| Standard | Application |
|----------|-------------|
| Plain Writing Act (2010) | Clear, active, jargon-free language |
| ISO 24495-1:2023 | Plain language principles for structure and vocabulary |
| Inverted pyramid (Economist/APA) | Key message first, details follow |
| Single source of truth | One canonical location per topic, cross-references elsewhere |
| DOCUMENTATION_STANDARDS.md | Project-specific quality checklist (clarity, completeness, accuracy, examples, context, last-updated) |

**Rationale**: Aligns with project CLAUDE.md and DOCUMENTATION_STANDARDS.md requirements. International standards ensure professional quality regardless of language.

## R-009: Link Update Scope

**Decision**: Update all in-repository links to docs/ paths. Affected files:

| File | Expected Link Updates |
|------|----------------------|
| `README.md` (root) | 4-6 links to docs/ |
| `CONTRIBUTING.md` | 1-2 links |
| `CLAUDE.md` (root) | 0-1 links |
| `cdk/README.md` | 1-2 links |
| `cdk/lib/execution/agent/execution-agent/README.md` | 1-3 links |
| `cdk/lib/verification/agent/verification-agent/README.md` | 1-3 links |
| `specs/*/spec.md`, `specs/*/plan.md` | Variable |

**Rationale**: FR-009 requires zero broken links. A grep scan for `docs/` paths across the repository will identify all links needing updates.

## R-010: presentation/README.md Disposition

**Decision**: Archive. The content (index of presentation files, customization hints) is superseded by the restructured `decision-maker/` documents and the `docs/README.md` entry index.

**Rationale**: Low independent value (~117 lines). The customization advice is generic and not worth preserving in a separate file.

## Content Volume Estimates

| Target Document | Source Lines | Estimated Final Lines | Action Summary |
|----------------|-------------|----------------------|----------------|
| `developer/quickstart.md` | 649 | ~550 | Adapt, update links |
| `developer/architecture.md` | 2,089 | ~800 | Merge 4 files, trim legacy, add glossary |
| `developer/runbook.md` | 772 | ~650 | Merge 3 ops files |
| `developer/testing.md` | 287 | ~250 | Adapt |
| `developer/requirements.md` | 367 | ~300 | Merge requirements + roadmap appendix |
| `developer/adr/README.md` + 4 ADRs | 405 | ~380 | Restructure as subfolder |
| `developer/security.md` | 1,444 | ~900 | Merge 5 security files |
| `developer/troubleshooting.md` | 861 | ~700 | Merge 3 troubleshooting files |
| `decision-maker/proposal.md` | ~270 (from non-tech-overview) | ~200 | New, derived from existing |
| `decision-maker/security-overview.md` | 563 | ~500 | Adapt |
| `decision-maker/design-principles.md` | 366 | ~300 | Adapt, add bibliography |
| `decision-maker/cost-and-resources.md` | 0 | ~100 | New |
| `decision-maker/governance.md` | 0 | ~80 | New |
| `user/user-guide.md` | ~200 (from UX + non-tech) | ~150 | New, derived |
| `user/usage-policy.md` | 0 | ~80 | New |
| `user/faq.md` | ~100 (scattered) | ~100 | New, aggregated |
| **Total** | **~8,373** | **~6,040** | **~28% reduction** |
