# Research: Documentation Folder Structure Best Practices

**Feature**: 001-docs-restructure  
**Phase**: 0  
**Date**: 2026-02-13

## 1. Documentation taxonomy (Diátaxis / Divio)

**Decision**: Use a purpose-based taxonomy aligned with Diátaxis (four types: tutorials, how-to guides, reference, explanation). The current repo already uses similar buckets (how-to, reference, explanation, presentation). We keep purpose-based top-level sections and treat "presentation" as a fifth category for non-technical stakeholders.

**Rationale**:
- Readers look for content by intent (learn, do, look up, understand). Folder names that match intent reduce cognitive load and support the spec’s "at most three steps to deploy" and "obvious where to add content" goals.
- Diátaxis is widely used (e.g. Django, Cloudflare, Gatsby) and avoids mixing learning, doing, and reference in one blob.
- The spec calls for "how-to vs reference vs explanation vs presentation" — mapping folders to these purposes satisfies FR-002 and SC-002.

**Alternatives considered**:
- **Single flat list**: Rejected; does not scale and makes "where do I add X?" unclear.
- **Feature-based folders** (e.g. by Slack, Bedrock): Rejected; the same reader often needs cross-feature tasks (deploy, secure, operate); purpose-based is more stable.

---

## 2. Number of top-level sections

**Decision**: Four to six top-level sections or index groupings. Concretely: **Get started** (or Quick nav row), **How-to**, **Reference**, **Explanation**, **Presentation**, and optionally **Tutorials** if kept separate from quickstart.

**Rationale**:
- FR-005 and SC-002 cap "top-level folders or index groupings" at a small number (e.g. four to six) for scannability.
- Current repo has six: explanation, how-to, implementation, presentation, reference, tutorials. We can keep five (merge implementation into reference or explanation; keep or merge tutorials) to stay within limit and reduce choices.

**Alternatives considered**:
- **More than six**: Rejected; increases cognitive load.
- **Fewer than four**: Rejected; would merge distinct purposes (e.g. reference and explanation) and blur "where to put what."

---

## 3. Single entry point and quick navigation

**Decision**: One entry point at `docs/README.md` containing (1) a short quick-navigation table for the most common goals (deploy, security, Slack setup, troubleshooting), and (2) a clear list of sections with brief descriptions and links.

**Rationale**:
- FR-001 and SC-001 require a single entry point and deploy reachable in at most three steps (open index → one section/link → deployment content). A table that links directly to quickstart, security, Slack setup, and troubleshooting satisfies this without extra folder depth.
- One index avoids duplicate "start here" pages and keeps a single place to update when structure changes.

**Alternatives considered**:
- **Multiple entry points** (e.g. separate "for developers" / "for operators"): Rejected; increases maintenance and link surface; one index with a clear table is sufficient.
- **No quick table, only section list**: Rejected; would add steps for the most common tasks.

---

## 4. Canonical document per topic and deduplication

**Decision**: For each major topic (deploy, security, operations, architecture, design decisions), define one canonical document or one canonical folder with a clear entry doc. Overlapping content (e.g. "getting started" vs "quickstart") is resolved by making one primary and the other a redirect, a short pointer, or merged content.

**Rationale**:
- FR-004 (necessary and sufficient, no redundant copies) and FR-003 (each doc has a stated purpose and audience) require a single source of truth per topic.
- SC-005 states "exactly one canonical document or one canonical folder with a clear entry doc" per major topic.

**Alternatives considered**:
- **Keep overlapping docs with "see also"**: Acceptable only if the secondary doc is clearly a short pointer or summary; otherwise we merge or redirect to avoid drift.
- **Redirects**: Use in-repo redirects (e.g. minimal stub that links to canonical) when renaming or merging; preferred over deleting without trace so existing links can be updated or redirected.

---

## 5. Alignment with project Documentation Standards

**Decision**: Restructure does not change the rules in `docs/DOCUMENTATION_STANDARDS.md`. All retained or merged content must follow those standards (inverted pyramid, one idea per paragraph, quality checklist, etc.). New or moved docs get a stated purpose and audience in the first paragraph or a metadata block.

**Rationale**:
- FR-007 and SC-006 require alignment with Documentation Standards and that they remain the single source of rules. The restructure is about layout and redundancy, not rewriting the standards.

**Alternatives considered**:
- **Revising standards in this feature**: Out of scope; spec assumes standards are given.

---

## 6. Link integrity after restructure

**Decision**: Before considering the restructure complete, all in-repository links that point at `docs/` (from README, CONTRIBUTING, other docs, or specs) must be updated or replaced with redirect stubs so that no link is broken (SC-004, FR-006). Use a link checker (e.g. markdown-link-check, or manual audit) to verify.

**Rationale**:
- Broken links undermine trust and waste time. Updating links is part of the restructure, not a follow-up.

**Alternatives considered**:
- **Rely on "find and fix later"**: Rejected; spec requires zero broken links after restructure.

---

## Summary table

| Topic                    | Decision                                               | Drives |
|--------------------------|--------------------------------------------------------|--------|
| Taxonomy                 | Purpose-based (how-to, reference, explanation, presentation; optional tutorials) | FR-002, SC-002 |
| Top-level count          | 4–6 sections                                          | FR-005, SC-002 |
| Entry point              | Single index (`docs/README.md`) with quick nav table   | FR-001, SC-001 |
| Canonical per topic      | One doc or one folder+entry per major topic; merge/redirect duplicates | FR-004, SC-005 |
| Documentation Standards  | Unchanged; all content complies                      | FR-007, SC-006 |
| Links                    | All in-repo doc links valid after restructure         | FR-006, SC-004 |
