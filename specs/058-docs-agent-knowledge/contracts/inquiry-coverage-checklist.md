# Contract: Inquiry coverage checklist (reviewer artifact)

**Purpose**: Satisfy spec SC-001 and SC-003 by recording which inquiry patterns are covered by the documentation set and where.

**Format**: Maintain as a Markdown table (this file may be copied to `docs/` or `tests/` as a template during implementation). Minimum **20 rows** for the full audit; at least **90%** must be marked **Covered** for the feature to meet SC-001.

## Column definitions

| Column | Required | Description |
| ------ | -------- | ----------- |
| **ID** | Yes | Stable identifier (e.g., `IP-001`). |
| **Audience** | Yes | `user` \| `developer` \| `decision-maker`. |
| **Question** | Yes | Plain-language question a reader might ask. |
| **Primary doc path** | Yes | Relative path from repo root, optionally with heading anchor (e.g., `docs/user/faq.md#...`). |
| **Coverage** | Yes | `Covered` \| `Partial` \| `Gap`. |
| **Notes** | No | Cross-reference, escalation path, or follow-up. |

## Example rows (replace with project-specific set)

| ID | Audience | Question | Primary doc path | Coverage | Notes |
| -- | -------- | -------- | ---------------- | -------- | ----- |
| IP-001 | user | Why did the bot not reply in my channel? | docs/user/faq.md | Covered | |
| IP-002 | user | What file types and sizes can I attach? | docs/user/faq.md | Covered | |
| IP-003 | developer | What is the order of layers in the security pipeline? | docs/developer/security.md | Partial | |
| … | … | … | … | … | … |

## Rules

- **Covered**: The question is answered in the cited section without needing undocumented context.
- **Partial**: Some guidance exists; reader must jump to a second doc—both links must be documented.
- **Gap**: Not acceptable for release if the pattern is in the agreed sample set; add or update docs.

## Out of scope

- This contract does not define HTTP APIs, JSON schemas, or runtime configuration—only human review and optional automation that validates presence of rows or links.
