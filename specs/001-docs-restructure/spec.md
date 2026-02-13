# Feature Specification: Audience-Based Documentation Restructure

**Feature Branch**: `001-docs-restructure`
**Created**: 2026-02-13
**Updated**: 2026-02-14
**Status**: Draft
**Input**: User description: "audience-document-map.md の内容に基づいて docs/ 内の文書を再構成。ドキュメンテーションなどの各種ベストプラクティスや国際標準を適用する。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Finds Deployment and Reference Docs (Priority: P1)

A developer or operator joins the project and needs to deploy, configure, test, troubleshoot, and understand the system architecture. They open `docs/` and find a `developer/` folder containing all technical documents consolidated into clear, single-purpose files: quickstart, architecture, runbook, testing, requirements, ADR, security, and troubleshooting.

**Why this priority**: Developers are the primary audience. Deployment and technical operations drive adoption; scattered docs across nested folders slow onboarding and increase support burden.

**Independent Test**: From `docs/README.md`, a developer can identify the `developer/` section, navigate to any of the eight developer documents, and find complete, self-contained content for that topic within two navigation steps.

**Acceptance Scenarios**:

1. **Given** the docs entry point (docs/README.md), **When** a developer looks for deployment instructions, **Then** a single link leads to `developer/quickstart.md` containing the full deployment and environment setup guide.
2. **Given** the docs entry point, **When** a developer looks for architecture, security, ADR, operations, testing, requirements, or troubleshooting, **Then** each topic has exactly one file in `developer/` with a clear title and stated purpose.
3. **Given** any developer document, **When** the reader opens it, **Then** the document states its purpose, audience, and last-updated date in the first few lines.

---

### User Story 2 - Decision-Maker Finds Business and Governance Docs (Priority: P2)

A product owner, executive, or security reviewer needs to understand business value, risk posture, cost implications, and governance policies. They find a `decision-maker/` folder with documents tailored to non-technical evaluation: proposal, security overview, design principles, cost/resources, and governance.

**Why this priority**: Decision-makers need concise, non-technical summaries to approve or fund the project. Mixing these with developer docs forces them to wade through implementation details.

**Independent Test**: From `docs/README.md`, a decision-maker can identify the `decision-maker/` section and navigate to any of the five documents within two steps. Each document is self-contained, non-technical, and written for executive consumption.

**Acceptance Scenarios**:

1. **Given** the docs entry point, **When** a decision-maker looks for the project proposal or security overview, **Then** a link leads to the appropriate file in `decision-maker/`.
2. **Given** any decision-maker document, **When** the reader opens it, **Then** the content uses plain language, avoids implementation details as primary focus, and provides actionable insights (recommendations, risk assessments, cost estimates).

---

### User Story 3 - End User Finds Usage Guide and FAQ (Priority: P3)

A Slack user (non-developer, non-manager) needs to know how to use the AI bot, what they can and cannot do, and answers to common questions. They find a `user/` folder with a usage guide, usage policy, and FAQ.

**Why this priority**: End users are the largest audience by count. Clear usage docs reduce support requests and misuse. This content does not currently exist and must be created.

**Independent Test**: From `docs/README.md`, an end user can identify the `user/` section and find the usage guide, usage policy, and FAQ within two steps.

**Acceptance Scenarios**:

1. **Given** the docs entry point, **When** an end user looks for "how to use" or "FAQ", **Then** a link leads to the appropriate file in `user/`.
2. **Given** the user guide, **When** the reader opens it, **Then** it explains how to mention the bot, what to expect, and what the bot can do — without any deployment or architecture content.

---

### User Story 4 - Maintainer Knows Where to Add or Update Content (Priority: P4)

A maintainer needs to update or add documentation after a code change. The audience-based folder structure (`developer/`, `decision-maker/`, `user/`) makes it obvious where each topic belongs. The documentation standards and audience-document map provide governance.

**Why this priority**: Prevents documentation drift. Clear ownership by audience ensures updates go to the right place.

**Independent Test**: For any documentation task (e.g., "document a new security feature"), the maintainer can identify the target folder and file from the folder name and docs/README.md index without guessing.

**Acceptance Scenarios**:

1. **Given** a new feature that affects deployment, **When** a maintainer looks for where to document it, **Then** the structure points to `developer/quickstart.md` or `developer/runbook.md`.
2. **Given** a security policy change, **When** a maintainer needs to update docs, **Then** they update `developer/security.md` for technical details and `decision-maker/security-overview.md` for the executive summary, with clear cross-references between them.

---

### Edge Cases

- **Content that currently spans multiple files**: Architecture is split across `reference/architecture/overview.md`, `cross-account.md`, `implementation-details.md`, and `user-experience.md`. These must be consolidated into `developer/architecture.md` with clear sections rather than separate files.
- **Security content duplication**: Security docs exist in both `reference/security/` (technical) and `presentation/security-overview.md` (non-technical). After restructure, technical security goes to `developer/security.md` and non-technical goes to `decision-maker/security-overview.md`.
- **New content creation**: `user/` documents (user-guide, usage-policy, FAQ) and `decision-maker/` documents (proposal, cost-and-resources, governance) do not exist yet and must be created.
- **Cross-references**: All links from README.md, CONTRIBUTING.md, CLAUDE.md, specs/, and CDK READMEs pointing into `docs/` must be updated.
- **Documentation Standards**: `DOCUMENTATION_STANDARDS.md` and `audience-document-map.md` remain at `docs/` root as governance documents, not inside any audience folder.
- **Appendix and roadmap**: `appendix.md` content (glossary, references) is distributed to relevant audience documents or retained at `docs/` root if cross-audience. `implementation/roadmap.md` moves to `developer/` or is archived.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The documentation MUST be reorganized into three audience-based folders (`developer/`, `decision-maker/`, `user/`) under `docs/`, matching the structure defined in `audience-document-map.md`.
- **FR-002**: The `developer/` folder MUST contain exactly eight documents: `quickstart.md`, `architecture.md`, `runbook.md`, `testing.md`, `requirements.md`, `adr.md`, `security.md`, `troubleshooting.md` — each consolidating content from the current scattered files.
- **FR-003**: The `decision-maker/` folder MUST contain five documents: `proposal.md`, `security-overview.md`, `design-principles.md`, `cost-and-resources.md`, `governance.md`.
- **FR-004**: The `user/` folder MUST contain three documents: `user-guide.md`, `usage-policy.md`, `faq.md`.
- **FR-005**: Each document MUST state its purpose, intended audience, and last-updated date within the first five lines.
- **FR-006**: `docs/README.md` MUST serve as the single entry point with a quick-navigation table organized by audience and linking to all documents.
- **FR-007**: Governance documents (`DOCUMENTATION_STANDARDS.md`, `audience-document-map.md`) MUST remain at `docs/` root, outside audience folders.
- **FR-008**: All existing content from the current docs structure MUST be migrated to the appropriate audience document; no information loss is permitted. Duplicate content MUST be merged into one canonical location with cross-references from the other.
- **FR-009**: All in-repository links to documentation (from README.md, CONTRIBUTING.md, CLAUDE.md, specs/, CDK READMEs) MUST be updated to the new paths. Zero broken links after restructure.
- **FR-010**: All retained and newly created documents MUST comply with `DOCUMENTATION_STANDARDS.md`: inverted pyramid structure, one idea per paragraph, plain active language, quality checklist, and last-updated date.
- **FR-011**: Documentation best practices and international standards MUST be applied: Plain Writing Act principles, ISO 24495-1 (plain language), inverted pyramid (Economist/APA style), single authoritative source per topic, consistent terminology.
- **FR-012**: Old folders (`how-to/`, `reference/`, `explanation/`, `presentation/`, `implementation/`) MUST be removed after all content is migrated to avoid confusion.

### Key Entities

- **Audience Folder**: A top-level folder under `docs/` grouping all documents for one reader type (developer, decision-maker, user).
- **Document**: A single Markdown file with one primary purpose, a defined audience, and a canonical location within an audience folder.
- **Entry Index**: `docs/README.md` — the single starting point providing audience-based navigation to all documents.
- **Governance Document**: A standards or policy file (`DOCUMENTATION_STANDARDS.md`, `audience-document-map.md`) that lives at `docs/` root and applies across all audience folders.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new reader can identify their audience category (developer, decision-maker, user) and reach any target document from `docs/README.md` in at most two navigation steps.
- **SC-002**: The `docs/` folder has exactly three audience subfolders plus governance documents at root — no more than five items at the top level (three folders + `README.md` + `DOCUMENTATION_STANDARDS.md` + `audience-document-map.md`).
- **SC-003**: Every document states purpose, audience, and last-updated date within the first five lines (verifiable by automated scan or manual audit).
- **SC-004**: Zero broken in-repository links after restructure (verifiable by link checker or `grep` scan).
- **SC-005**: For each topic (deploy, security, operations, architecture, design decisions, usage), there is exactly one canonical document; no duplicate content exists without explicit cross-references.
- **SC-006**: All 16 target documents (8 developer + 5 decision-maker + 3 user) exist and contain substantive content (not placeholder or empty).
- **SC-007**: Documentation Standards compliance is maintained — all documents pass the quality checklist in `DOCUMENTATION_STANDARDS.md`.

## Assumptions

- The `audience-document-map.md` is the authoritative guide for the target folder structure and document assignments.
- Developer documents consolidate existing content from the current Diátaxis-based structure (how-to, reference, explanation, presentation). Content is merged, not merely moved file-by-file.
- Decision-maker documents (`proposal.md`, `cost-and-resources.md`, `governance.md`) and all user documents are new and must be authored from scratch, drawing on existing system knowledge.
- `decision-maker/security-overview.md` and `decision-maker/design-principles.md` can be derived from existing `presentation/security-overview.md` and `explanation/design-principles.md` respectively, with adaptation for the decision-maker audience.
- Language: Documents retain their current language (primarily Japanese). Best practices and standards apply to structure and style regardless of language.
- Specs (`specs/`) remain outside `docs/` and are not restructured, but their links into `docs/` are updated.
- ADR files are consolidated into `developer/adr.md` as a single document (or as a `developer/adr/` subfolder with an index if the number of ADRs warrants it).
