# Data Model: Documentation Structure

**Feature**: 001-docs-restructure  
**Phase**: 1  
**Date**: 2026-02-13

This document describes the logical structure of the documentation set after restructure. There is no database or API; "entities" are organizational concepts used to place and link documents.

---

## Entities

### Entry index

| Attribute    | Description |
|-------------|-------------|
| **Location** | Single file at docs root (e.g. `docs/README.md`). |
| **Purpose**  | The one starting point for all documentation. |
| **Contains** | Quick-navigation table (deploy, security, Slack setup, troubleshooting, etc.) and a list of sections with short descriptions and links. |
| **Rules**    | Must list or link all major sections. Must expose no more than six top-level sections or groupings (FR-005, SC-002). |

There is exactly one entry index per documentation set.

---

### Section (folder / grouping)

| Attribute    | Description |
|-------------|-------------|
| **Name**    | Stable, purpose-based name (e.g. how-to, reference, explanation, presentation, tutorials). |
| **Purpose** | Groups documents by user intent (learn, do, look up, understand, non-technical overview). |
| **Contains** | Zero or more documents; may contain subfolders (e.g. reference/architecture, reference/security). |
| **In index** | Every top-level section appears in the entry index with a label and optional short description. |

Sections are the top-level folders or the top-level groupings shown in the index. Count of sections is between 4 and 6.

---

### Document

| Attribute     | Description |
|--------------|-------------|
| **Path**     | Canonical path under `docs/` (e.g. `docs/quickstart.md`, `docs/reference/security/authentication-authorization.md`). |
| **Purpose**  | One primary purpose (e.g. "how to deploy", "Slack App setup", "threat model"). Stated in the first paragraph or a metadata block (FR-003, SC-003). |
| **Audience** | Intended readers (e.g. deployers, developers, non-technical stakeholders). Stated in the same place as purpose. |
| **Section**  | The section (folder or grouping) this document belongs to. |
| **Canonical** | For each major topic there is at most one canonical document; others redirect or point to it (FR-004, SC-005). |

Each document has exactly one primary purpose and one canonical location. Duplicate or overlapping content is merged or redirected.

---

### Link

| Attribute   | Description |
|------------|-------------|
| **Source**  | Repository file that contains the link (README, CONTRIBUTING, any doc under docs/, or specs/). |
| **Target**  | Path or URL the link points to (same repo: path relative to repo root or to current file). |
| **Valid**   | After restructure, every in-repo link to docs must resolve (FR-006, SC-004). |

Link integrity is maintained by updating or redirecting when documents are moved or merged.

---

## Relationships

- **Entry index** → lists **Sections** (by name/link and optional description).
- **Entry index** → links directly to key **Documents** in the quick-navigation table (e.g. quickstart, security, Slack setup, troubleshooting).
- **Section** → contains **Documents** (and optionally subfolders that group documents).
- **Document** → belongs to one **Section**; may be **canonical** for a topic.
- **Link** → has **Source** (file) and **Target** (path or URL); all such links must remain valid after restructure.

---

## State (for restructure execution)

Documents and sections do not have a formal state machine. For planning we only distinguish:

- **Current**: Existing path and content before restructure.
- **Canonical**: Chosen as the single source of truth for a topic after restructure.
- **Merged**: Content merged into another document; original may become a redirect stub or be removed with links updated.
- **Redirect**: Stub document or in-doc pointer that sends the reader to the canonical document.

No new entities or attributes are required for implementation; this model is for consistency when creating the index contract and task list.
