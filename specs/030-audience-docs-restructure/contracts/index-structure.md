# Contract: docs/ Target Structure

**Feature**: 030-audience-docs-restructure
**Date**: 2026-02-14

## Folder Structure Contract

After restructure, `docs/` MUST contain exactly the following structure:

```text
docs/
├── README.md                          # REQUIRED — entry index
├── DOCUMENTATION_STANDARDS.md         # REQUIRED — writing standards (unchanged)
├── audience-document-map.md           # REQUIRED — audience mapping (moved from repo root)
├── developer/                         # REQUIRED — 8 items
│   ├── quickstart.md                  # REQUIRED
│   ├── architecture.md                # REQUIRED
│   ├── runbook.md                     # REQUIRED
│   ├── testing.md                     # REQUIRED
│   ├── requirements.md                # REQUIRED
│   ├── adr/                           # REQUIRED — subfolder
│   │   ├── README.md                  # REQUIRED
│   │   ├── 001-bedrock-foundation-model.md  # REQUIRED
│   │   ├── 002-regex-pii-detection.md       # REQUIRED
│   │   ├── 003-response-url-async.md        # REQUIRED
│   │   └── 004-slack-api-existence-check.md # REQUIRED
│   ├── security.md                    # REQUIRED
│   └── troubleshooting.md            # REQUIRED
├── decision-maker/                    # REQUIRED — 5 items
│   ├── proposal.md                    # REQUIRED
│   ├── security-overview.md           # REQUIRED
│   ├── design-principles.md           # REQUIRED
│   ├── cost-and-resources.md          # REQUIRED
│   └── governance.md                  # REQUIRED
└── user/                              # REQUIRED — 3 items
    ├── user-guide.md                  # REQUIRED
    ├── usage-policy.md                # REQUIRED
    └── faq.md                         # REQUIRED
```

## Document Header Contract

Every document MUST begin with:

```markdown
# [Document Title]

**目的**: [One-sentence purpose]
**対象読者**: [Target audience]
**最終更新日**: YYYY-MM-DD
```

## Entry Index Contract (docs/README.md)

The README MUST contain:

1. Project title and one-sentence description
2. Audience-based navigation table with three sections:
   - 開発者向け (Developer) — links to all 8 developer documents
   - 意思決定者向け (Decision-Maker) — links to all 5 decision-maker documents
   - ユーザー向け (User) — links to all 3 user documents
3. Governance section linking to DOCUMENTATION_STANDARDS.md and audience-document-map.md

## Validation Rules

- `docs/` top level: exactly 3 folders + 3 files = 6 items
- `developer/`: exactly 7 files + 1 subfolder = 8 items
- `developer/adr/`: exactly 5 files
- `decision-maker/`: exactly 5 files
- `user/`: exactly 3 files
- No legacy folders remain: `how-to/`, `reference/`, `explanation/`, `presentation/`, `implementation/`
- No orphan files: `appendix.md`, `quickstart.md` (at docs root)
- Zero broken internal links
