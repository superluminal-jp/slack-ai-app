# Implementation Plan: Audience-Based Documentation Restructure

**Branch**: `030-audience-docs-restructure` | **Date**: 2026-02-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-audience-docs-restructure/spec.md`

## Summary

Restructure `docs/` from a Diátaxis-based folder layout (how-to, reference, explanation, presentation, implementation — 25+ files across 5 nested folders) into an audience-based layout (`developer/`, `decision-maker/`, `user/`) with 16 consolidated documents. Apply documentation best practices (Plain Writing Act, ISO 24495-1, inverted pyramid, single source of truth). Migrate all existing content with zero loss, create new audience-specific documents, update all in-repository links, and remove legacy folders.

## Technical Context

**Language/Version**: Markdown (GitHub-flavored)
**Primary Dependencies**: None (documentation only)
**Storage**: N/A
**Testing**: Manual audit + `grep` link scan
**Target Platform**: GitHub repository (rendered Markdown)
**Project Type**: Documentation restructure
**Performance Goals**: N/A
**Constraints**: Zero broken links; zero content loss; comply with DOCUMENTATION_STANDARDS.md
**Scale/Scope**: 29 source files → 16 target documents + 2 governance files at root

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is not yet configured for this project (template only). No gates to evaluate. Proceeding with project-level standards from `CLAUDE.md` and `DOCUMENTATION_STANDARDS.md`.

**Post-Phase 1 re-check**: Same — no constitution violations. Documentation standards are applied throughout.

## Project Structure

### Documentation (this feature)

```text
specs/030-audience-docs-restructure/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output — consolidation decisions
├── data-model.md        # Phase 1 output — content migration mapping
├── quickstart.md        # Phase 1 output — migration quickstart
├── contracts/
│   └── index-structure.md  # Target folder/file structure contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Target Structure (docs/ after restructure)

```text
docs/
├── README.md                    # Entry index — audience-based navigation
├── DOCUMENTATION_STANDARDS.md   # Governance — writing standards
├── audience-document-map.md     # Governance — audience-to-doc mapping
├── developer/
│   ├── quickstart.md            # Deploy + environment setup
│   ├── architecture.md          # System design, components, data flow, glossary
│   ├── runbook.md               # Slack setup, monitoring, IAM, operations
│   ├── testing.md               # Test scenarios, compliance, traceability
│   ├── requirements.md          # Functional requirements + completed roadmap
│   ├── adr/
│   │   ├── README.md            # ADR index + creation guidelines
│   │   ├── 001-bedrock-foundation-model.md
│   │   ├── 002-regex-pii-detection.md
│   │   ├── 003-response-url-async.md
│   │   └── 004-slack-api-existence-check.md
│   ├── security.md              # Auth, threats, requirements, implementation, CMK
│   └── troubleshooting.md       # Errors, no-reply diagnosis, flow verification
├── decision-maker/
│   ├── proposal.md              # Business value, features, adoption plan
│   ├── security-overview.md     # Non-technical security explanation
│   ├── design-principles.md     # Behavioral theory, academic references
│   ├── cost-and-resources.md    # AWS cost, operational effort
│   └── governance.md            # Access policy, review cadence, compliance
└── user/
    ├── user-guide.md            # How to use the bot, features, expected behavior
    ├── usage-policy.md          # Permitted use, restrictions, PII handling
    └── faq.md                   # Common questions and answers
```

**Structure Decision**: Audience-based folders per `audience-document-map.md`. ADRs use a subfolder (`developer/adr/`) to follow the Michael Nygard ADR convention. All other topics are single files per the spec. Governance documents remain at `docs/` root.

## Migration Strategy

### Phase A: Create target structure and migrate developer docs (P1)

1. Create `docs/developer/`, `docs/decision-maker/`, `docs/user/` directories
2. Create `docs/developer/adr/` subdirectory
3. Migrate developer documents (8 files + 4 ADRs = 12 files):

| Target | Sources | Action |
|--------|---------|--------|
| `developer/quickstart.md` | `quickstart.md` | Move + adapt header, update internal links |
| `developer/architecture.md` | `reference/architecture/overview.md`, `cross-account.md`, `implementation-details.md`, `user-experience.md` (UX portion), `appendix.md` (glossary) | Merge 4 files + glossary; remove legacy architecture diagram; add sections: Overview, Components, Data Flow, Cross-Account, Implementation Details, User Experience, Glossary |
| `developer/runbook.md` | `reference/operations/slack-setup.md`, `monitoring.md`, `deployment-iam-policy.md` | Merge 3 files; sections: Slack Setup, Monitoring & Alarms, IAM Policy, Incident Response |
| `developer/testing.md` | `reference/operations/testing.md` | Move + adapt header |
| `developer/requirements.md` | `reference/requirements/functional-requirements.md`, `implementation/roadmap.md` | Merge; add roadmap as "Completed Phases" appendix |
| `developer/adr/` | `explanation/adr/README.md`, `001-*.md`, `002-*.md`, `003-*.md`, `004-*.md` | Move 5 files into subfolder; update README index to include ADR-003 |
| `developer/security.md` | `reference/security/authentication-authorization.md`, `threat-model.md`, `requirements.md`, `implementation.md`, `bedrock-cmk-consideration.md` | Merge 5 files; sections: Overview (Two-Key Defense), Authentication & Authorization, Threat Model, Security Requirements, Implementation, CMK Consideration |
| `developer/troubleshooting.md` | `how-to/troubleshooting.md`, `troubleshooting-no-reply.md`, `verify-processing-flow.md` | Merge 3 files; sections: Common Errors, No-Reply Diagnosis, Processing Flow Verification |

### Phase B: Create decision-maker docs (P2)

| Target | Sources | Action |
|--------|---------|--------|
| `decision-maker/proposal.md` | `presentation/non-technical-overview.md` (value/adoption portions) | New — derive business value, features, adoption plan |
| `decision-maker/security-overview.md` | `presentation/security-overview.md` | Move + adapt from slide format to document format |
| `decision-maker/design-principles.md` | `explanation/design-principles.md`, `appendix.md` (bibliography) | Move + adapt; add academic bibliography from appendix |
| `decision-maker/cost-and-resources.md` | CDK config, operational notes | New — author from system knowledge |
| `decision-maker/governance.md` | Security policies, whitelist model | New — author from system knowledge |

### Phase C: Create user docs (P3)

| Target | Sources | Action |
|--------|---------|--------|
| `user/user-guide.md` | `reference/architecture/user-experience.md` (user-facing portions), `presentation/non-technical-overview.md` (usage slides) | New — derive from existing, rewrite for end users |
| `user/usage-policy.md` | Security requirements, PII handling | New — author from system knowledge |
| `user/faq.md` | `quickstart.md` (FAQ section), presentation files (FAQ slides), troubleshooting (user-relevant items) | New — aggregate and rewrite |

### Phase D: Update entry index and links (P4)

1. Rewrite `docs/README.md` with audience-based navigation
2. Move `audience-document-map.md` from repo root to `docs/` root
3. Grep all `docs/` path references across the repository
4. Update links in: `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `cdk/README.md`, CDK module READMEs, `specs/`
5. Verify zero broken links

### Phase E: Remove legacy folders and validate

1. Delete legacy folders: `docs/how-to/`, `docs/reference/`, `docs/explanation/`, `docs/presentation/`, `docs/implementation/`
2. Delete `docs/appendix.md` (content distributed)
3. Run link verification scan
4. Validate all 16+ documents have purpose, audience, last-updated in first 5 lines
5. Run quality checklist from DOCUMENTATION_STANDARDS.md

## Document Standards Applied

All documents must follow:

1. **Header block** (first 5 lines):
   ```markdown
   # [Title]

   **目的**: [Purpose in one sentence]
   **対象読者**: [Audience]
   **最終更新日**: 2026-02-14
   ```

2. **Inverted pyramid**: Key message/conclusion first, supporting details follow
3. **Plain active language**: Short sentences, present tense, consistent terminology
4. **One paragraph = one idea**: Max 5 sentences per paragraph
5. **Quality checklist** from DOCUMENTATION_STANDARDS.md before merging

## Complexity Tracking

No constitution violations to justify. This is a documentation-only change with no code impact.
