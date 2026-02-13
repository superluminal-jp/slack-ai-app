# Feature Specification: Audience-Based Documentation Restructure

**Feature Branch**: `030-audience-docs-restructure`
**Created**: 2026-02-14
**Status**: Draft
**Input**: User description: "audience-document-map.md の内容に基づいて docs/ の中の文書を再構成。ドキュメンテーションなどの各種ベストプラクティスや国際標準を適用する。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Finds All Technical Docs in One Place (Priority: P1)

A developer or operator joins the project and needs to deploy, configure, test, troubleshoot, or understand the system. They open `docs/` and find a `developer/` folder containing eight consolidated documents — one per major topic — each self-contained and written for a technical audience.

**Why this priority**: Developers are the primary documentation consumers. Current docs are scattered across five nested folders (how-to, reference, explanation, presentation, implementation) with 25+ files. Consolidation into eight clear files reduces search time and eliminates duplication.

**Independent Test**: From `docs/README.md`, a developer can navigate to any of the eight developer documents in at most two clicks and find complete content for that topic.

**Acceptance Scenarios**:

1. **Given** the docs entry point (`docs/README.md`), **When** a developer looks for deployment instructions, **Then** a single link leads to `developer/quickstart.md` containing the full environment setup and deployment guide.
2. **Given** the docs entry point, **When** a developer searches for architecture, security, ADR, operations, testing, requirements, or troubleshooting, **Then** each topic maps to exactly one file in `developer/` with a clear title.
3. **Given** any developer document, **When** the reader opens it, **Then** the first five lines state purpose, audience, and last-updated date.

---

### User Story 2 - Decision-Maker Finds Business and Risk Documents (Priority: P2)

A product owner, executive, or security reviewer needs non-technical information to evaluate, approve, or fund the project. They find a `decision-maker/` folder with five documents: project proposal, security overview, design principles, cost and resource estimates, and governance policy.

**Why this priority**: Decision-makers currently must wade through developer-oriented docs to extract business-relevant information. Dedicated documents save their time and improve decision quality.

**Independent Test**: From `docs/README.md`, a decision-maker can navigate to any of the five decision-maker documents in two clicks. Each document is self-contained and avoids implementation details.

**Acceptance Scenarios**:

1. **Given** the docs entry point, **When** a decision-maker looks for the project proposal or security posture, **Then** a link leads to the appropriate file in `decision-maker/`.
2. **Given** any decision-maker document, **When** the reader opens it, **Then** it uses plain language, leads with conclusions and recommendations, and provides actionable insights without requiring technical knowledge.

---

### User Story 3 - End User Finds Usage Guide and FAQ (Priority: P3)

A Slack workspace member (non-developer, non-manager) needs to understand how to interact with the AI bot, what is permitted, and how to resolve common issues. They find a `user/` folder with three documents: usage guide, usage policy, and FAQ.

**Why this priority**: End users are the largest audience by count. No user-facing documentation currently exists, which likely increases support inquiries and misuse.

**Independent Test**: From `docs/README.md`, an end user can find the `user/` section and reach the usage guide, usage policy, or FAQ in two clicks.

**Acceptance Scenarios**:

1. **Given** the docs entry point, **When** an end user looks for "how to use" or "FAQ", **Then** a link leads to the correct file in `user/`.
2. **Given** the user guide, **When** the reader opens it, **Then** it explains how to mention the bot, what responses to expect, and what the bot can do — without any deployment or architecture content.

---

### User Story 4 - Maintainer Knows Where to Add or Update Content (Priority: P4)

A maintainer needs to add or update documentation after a code change. The audience-based folder structure and `audience-document-map.md` make it clear which folder and file to edit for any topic.

**Why this priority**: Clear ownership prevents documentation drift and duplicate content. Currently, related information appears in multiple places (e.g., security in both `reference/security/` and `presentation/`).

**Independent Test**: For any documentation task, the maintainer can identify the target folder and file from the folder names, `docs/README.md`, or `audience-document-map.md` without ambiguity.

**Acceptance Scenarios**:

1. **Given** a feature change that affects deployment, **When** a maintainer looks for where to document it, **Then** the structure and index point unambiguously to `developer/quickstart.md` or `developer/runbook.md`.
2. **Given** a security policy update, **When** a maintainer needs to update docs, **Then** they update `developer/security.md` for technical details and `decision-maker/security-overview.md` for the executive summary, with cross-references between them.

---

### Edge Cases

- **Multi-file consolidation**: Architecture content currently spans four files (`overview.md`, `cross-account.md`, `implementation-details.md`, `user-experience.md`). These must be merged into `developer/architecture.md` with clear internal sections; no content loss is permitted.
- **Cross-audience topics**: Security exists in both technical form (`reference/security/`) and non-technical form (`presentation/security-overview.md`). After restructure, technical security goes to `developer/security.md` and non-technical to `decision-maker/security-overview.md`, each tailored to its audience.
- **New content creation**: All `user/` documents and some `decision-maker/` documents (`proposal.md`, `cost-and-resources.md`, `governance.md`) do not yet exist and must be authored.
- **Link integrity**: All references to `docs/` paths from `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `specs/`, and CDK module READMEs must be updated to new paths.
- **Governance documents at root**: `DOCUMENTATION_STANDARDS.md` and `audience-document-map.md` remain at `docs/` root, not inside any audience folder.
- **Appendix and roadmap**: Glossary and reference content from `appendix.md` is distributed to relevant audience documents or retained at root if cross-audience. `implementation/roadmap.md` is archived or merged into a developer document.
- **ADR handling**: Four individual ADR files must be consolidated into `developer/adr.md` (single document with sections per decision) or a `developer/adr/` subfolder with an index.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Documentation MUST be reorganized into three audience-based folders (`developer/`, `decision-maker/`, `user/`) under `docs/`, matching `audience-document-map.md`.
- **FR-002**: `developer/` MUST contain eight documents: `quickstart.md`, `architecture.md`, `runbook.md`, `testing.md`, `requirements.md`, `adr.md`, `security.md`, `troubleshooting.md`.
- **FR-003**: `decision-maker/` MUST contain five documents: `proposal.md`, `security-overview.md`, `design-principles.md`, `cost-and-resources.md`, `governance.md`.
- **FR-004**: `user/` MUST contain three documents: `user-guide.md`, `usage-policy.md`, `faq.md`.
- **FR-005**: Each document MUST state purpose, intended audience, and last-updated date within its first five lines.
- **FR-006**: `docs/README.md` MUST serve as the single entry point with navigation organized by audience, linking to all 16 documents.
- **FR-007**: Governance documents (`DOCUMENTATION_STANDARDS.md`, `audience-document-map.md`) MUST remain at `docs/` root.
- **FR-008**: All existing content MUST be migrated to the appropriate audience document with zero information loss. Duplicate content MUST be merged into one canonical location with cross-references.
- **FR-009**: All in-repository links pointing to `docs/` (from `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `specs/`, CDK READMEs) MUST resolve correctly after restructure.
- **FR-010**: All documents MUST comply with `DOCUMENTATION_STANDARDS.md`: inverted pyramid, one idea per paragraph, plain active language, quality checklist, last-updated date.
- **FR-011**: International documentation best practices MUST be applied: Plain Writing Act principles, ISO 24495-1 (plain language), single authoritative source per topic, consistent terminology.
- **FR-012**: Legacy folders (`how-to/`, `reference/`, `explanation/`, `presentation/`, `implementation/`) MUST be removed after migration.

### Key Entities

- **Audience Folder**: A top-level folder under `docs/` grouping documents for one reader type (developer, decision-maker, user).
- **Document**: A single Markdown file with one purpose, a defined audience, and a canonical location.
- **Entry Index**: `docs/README.md` — the single navigation starting point organized by audience.
- **Governance Document**: Standards or mapping files at `docs/` root that apply across all audience folders.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader can identify their audience category and reach any target document from `docs/README.md` in at most two navigation steps.
- **SC-002**: `docs/` top level contains at most six items: three audience folders, `README.md`, `DOCUMENTATION_STANDARDS.md`, and `audience-document-map.md`.
- **SC-003**: 100% of documents state purpose, audience, and last-updated date within the first five lines.
- **SC-004**: Zero broken in-repository links after restructure.
- **SC-005**: Each topic has exactly one canonical document; no duplicate content exists without explicit cross-references.
- **SC-006**: All 16 target documents exist and contain substantive content (no placeholders or empty files).
- **SC-007**: All documents pass the quality checklist defined in `DOCUMENTATION_STANDARDS.md`.

## Assumptions

- `audience-document-map.md` is the authoritative guide for target structure and document assignments.
- Developer documents consolidate existing content from the current Diátaxis-based structure. Content is merged and adapted, not merely moved file-by-file.
- Decision-maker documents (`proposal.md`, `cost-and-resources.md`, `governance.md`) and all user documents are new and must be authored from scratch using existing system knowledge.
- `decision-maker/security-overview.md` and `decision-maker/design-principles.md` derive from existing `presentation/security-overview.md` and `explanation/design-principles.md`, adapted for the decision-maker audience.
- Documents retain their current language (primarily Japanese). Best practices apply to structure and style regardless of language.
- `specs/` remains outside `docs/` but links into `docs/` are updated.
- ADR files are consolidated into a single `developer/adr.md` or a `developer/adr/` subfolder with an index, depending on volume.
