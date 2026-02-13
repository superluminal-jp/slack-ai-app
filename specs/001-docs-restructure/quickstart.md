# Quickstart: Executing the Documentation Restructure

**Feature**: 001-docs-restructure  
**Audience**: Implementer (developer or maintainer performing the restructure)  
**Date**: 2026-02-13

This guide gives minimal steps to execute the documentation restructure. Detailed task breakdown is in `tasks.md` (created by `/speckit.tasks`).

---

## Prerequisites

- Repository checked out on branch `001-docs-restructure` (or the branch that contains this spec).
- Access to update files under `docs/` and any files that link to them (e.g. README, CONTRIBUTING, specs).

---

## Steps (high level)

1. **Audit current state**
   - List all files under `docs/` and all in-repo links that point to `docs/` (from README, CONTRIBUTING, other docs, specs). Record current paths for later link updates.

2. **Define target structure**
   - Use [plan.md](./plan.md) and [data-model.md](./data-model.md). Decide final top-level sections (4–6) and which documents are canonical for each major topic (deploy, security, operations, architecture, design decisions). Resolve overlaps (e.g. quickstart vs tutorials/getting-started): merge or redirect.

3. **Update entry index**
   - Edit `docs/README.md` so it includes:
     - A quick-navigation table (deploy, security, Slack setup, troubleshooting) per [contracts/index-structure.md](./contracts/index-structure.md).
     - A section list (how-to, reference, explanation, presentation, etc.) with links. Ensure no more than six top-level sections.

4. **Move, merge, or redirect**
   - Move files into the target folders if paths change. Merge duplicate content into the canonical document; replace originals with a short redirect or "see [X](path)." Update `implementation/` (e.g. roadmap): merge into `reference/` or `explanation/` and remove empty `implementation/` if applicable.

5. **Add purpose and audience**
   - For each retained document, ensure the first paragraph or a metadata block states purpose and intended audience (FR-003, SC-003). Use [docs/DOCUMENTATION_STANDARDS.md](../../docs/DOCUMENTATION_STANDARDS.md) for style.

6. **Fix all links**
   - Update every in-repository link that pointed to `docs/` so it points to the new path. If a document was replaced by a redirect, the redirect target must be the canonical URL. Run a link checker (e.g. markdown-link-check) or manual pass until zero broken links (FR-006, SC-004).

7. **Verify**
   - Open `docs/README.md` and confirm: quick nav reaches deploy in one click; section count is 4–6; no broken links in repo.

---

## Key references

- **Spec**: [spec.md](./spec.md) — requirements and success criteria.
- **Plan**: [plan.md](./plan.md) — target folder structure and context.
- **Research**: [research.md](./research.md) — best practices and decisions.
- **Index contract**: [contracts/index-structure.md](./contracts/index-structure.md) — what the entry index must contain.
- **Standards**: [docs/DOCUMENTATION_STANDARDS.md](../../docs/DOCUMENTATION_STANDARDS.md) — writing and structure rules.

---

## Notes

- Do not change the rules or remove `DOCUMENTATION_STANDARDS.md`; only restructure layout and links (FR-007, SC-006).
- For a full task list with acceptance criteria, run `/speckit.tasks` to generate `tasks.md`.
