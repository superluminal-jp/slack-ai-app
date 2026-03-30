# Data model: Documentation corpus (logical)

This feature does not introduce new databases or APIs. These entities describe how content is organized for authoring, review, and traceability to the functional requirements.

## Entities

### Documentation topic

| Field | Description |
| ----- | ----------- |
| **Title** | Short name for the subject (e.g., “Reply latency”, “Deployment order”). |
| **Primary location** | Path under `docs/` (e.g., `user/faq.md#...`, `developer/troubleshooting.md`). |
| **Audience** | One or more of: user, developer, decision-maker. |
| **Related paths** | Optional cross-links to avoid duplicate primary answers. |

**Validation (authoring)**:

- Every high-frequency inquiry theme from FR-001 maps to at least one topic with a primary location.
- Conflicting statements require a single primary source or an explicit “see X for canonical” note (per spec edge cases).

### Audience segment

| Value | Folder | Voice |
| ----- | ------ | ----- |
| **user** | `docs/user/` | End users of the Slack bot; minimal jargon. |
| **developer** | `docs/developer/` | Operators and implementers; architecture and procedures allowed. |
| **decision-maker** | `docs/decision-maker/` | Governance, risk, cost summary; pointers to deeper docs. |

### Inquiry pattern

| Field | Description |
| ----- | ----------- |
| **Question (plain language)** | What a reader might ask (used for coverage review). |
| **Expected primary topic** | Which documentation topic should answer it. |
| **Acceptance** | Answerable from docs alone or via one documented cross-reference (SC-001). |

**Relationships**:

- Many inquiry patterns map to one documentation topic.
- One topic may span multiple files (overview + deep dive) if cross-linked.

## State transitions

Not applicable (static Markdown). “State” is Git revision history and published doc set version tied to releases.
