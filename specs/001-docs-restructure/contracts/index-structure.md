# Contract: Documentation Entry Index Structure

**Feature**: 001-docs-restructure  
**Phase**: 1  
**Date**: 2026-02-13

This contract defines what the documentation entry point (`docs/README.md`) must provide. It is the "navigation contract" between the restructure and the reader/maintainer.

---

## 1. Single entry point

- **Location**: `docs/README.md` (or the single file designated as the docs root index).
- **Requirement**: All major documentation sections and the most common reader goals must be reachable from this file (FR-001).

---

## 2. Quick-navigation table

The index MUST include a **quick-navigation table** with at least the following goals and one link each:

| Goal / Purpose        | Link target (example)                    |
|-----------------------|------------------------------------------|
| Deploy / setup        | `quickstart.md` or equivalent            |
| Security              | e.g. `reference/security/authentication-authorization.md` or security index |
| Slack App setup       | e.g. `reference/operations/slack-setup.md` |
| Troubleshooting       | e.g. `how-to/troubleshooting.md`         |

Additional rows (e.g. "Monitoring", "Architecture overview") are allowed. The table MUST be visible near the top of the index so that a reader can reach "how to deploy" in at most three steps: open index → click one link in the table → land on deployment content (SC-001).

---

## 3. Section list

The index MUST list all **top-level sections** (folders or logical groupings) with:

- Section name or label (e.g. How-to, Reference, Explanation, Presentation).
- Optional one-line description.
- Link to the section (folder index or primary doc).

**Constraint**: The number of top-level sections MUST be between 4 and 6 (FR-005, SC-002). Current proposal: how-to, reference, explanation, presentation, and optionally tutorials (or tutorials merged into how-to/quickstart).

---

## 4. No broken in-repo links

Any link from the entry index to another document MUST use a path that exists after restructure. In addition, every link from anywhere in the repository (README, CONTRIBUTING, docs, specs) that points to `docs/` MUST resolve (FR-006, SC-004). This contract does not define the format of links (relative vs absolute) but requires that they be valid.

---

## 5. Consistency with Documentation Standards

The entry index document itself MUST follow the project's Documentation Standards (e.g. inverted pyramid, clear headings, no secrets). The index does not need a "purpose and audience" block in the same way as other docs, but it MUST be clear and scannable (FR-007).

---

## Verification

- **Quick nav**: From `docs/README.md`, open the quick-navigation table and click "Deploy" (or equivalent); the target must be the deployment/quickstart content within one click.
- **Sections**: Count the top-level sections or groupings in the index; count MUST be ≥ 4 and ≤ 6.
- **Links**: Run a link checker (or manual audit) on the repository with focus on links pointing to `docs/`; zero broken links.
