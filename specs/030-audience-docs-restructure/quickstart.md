# Quickstart: Documentation Restructure

**Feature**: 030-audience-docs-restructure
**Date**: 2026-02-14

## Prerequisites

- Git checkout of branch `030-audience-docs-restructure`
- Familiarity with the current `docs/` structure (5 folders, 25+ files)
- Read `audience-document-map.md` for target structure

## Steps

### 1. Create target directories

```bash
mkdir -p docs/developer/adr docs/decision-maker docs/user
```

### 2. Migrate developer docs (Phase A)

Follow the migration table in [plan.md](./plan.md#phase-a-create-target-structure-and-migrate-developer-docs-p1). Key actions:

- **Move** `quickstart.md` → `developer/quickstart.md` (adapt header)
- **Merge** 4 architecture files → `developer/architecture.md`
- **Merge** 3 operations files → `developer/runbook.md`
- **Move** `testing.md` → `developer/testing.md`
- **Merge** requirements + roadmap → `developer/requirements.md`
- **Move** 5 ADR files → `developer/adr/`
- **Merge** 5 security files → `developer/security.md`
- **Merge** 3 troubleshooting files → `developer/troubleshooting.md`

### 3. Create decision-maker docs (Phase B)

- **Derive** `decision-maker/proposal.md` from non-technical-overview
- **Adapt** `decision-maker/security-overview.md` from presentation
- **Adapt** `decision-maker/design-principles.md` + bibliography
- **Author** `decision-maker/cost-and-resources.md` (new)
- **Author** `decision-maker/governance.md` (new)

### 4. Create user docs (Phase C)

- **Derive** `user/user-guide.md` from UX docs + presentation
- **Author** `user/usage-policy.md` (new)
- **Aggregate** `user/faq.md` from scattered FAQ content

### 5. Update index and links (Phase D)

- Rewrite `docs/README.md` with audience-based navigation
- Move `audience-document-map.md` to `docs/` root
- Update all links in `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, CDK READMEs, `specs/`

### 6. Clean up and validate (Phase E)

- Delete legacy folders: `how-to/`, `reference/`, `explanation/`, `presentation/`, `implementation/`
- Delete `appendix.md`
- Run link verification
- Validate document headers and quality

## Verification

```bash
# Check target structure exists
ls docs/developer/ docs/decision-maker/ docs/user/

# Check no legacy folders remain
ls docs/how-to docs/reference docs/explanation docs/presentation docs/implementation 2>&1 | grep "No such file"

# Check for broken links (grep docs/ references)
grep -r 'docs/' README.md CONTRIBUTING.md CLAUDE.md cdk/ specs/ | grep -v node_modules
```

## Reference

- [spec.md](./spec.md) — Feature specification
- [plan.md](./plan.md) — Implementation plan with migration tables
- [research.md](./research.md) — Consolidation decisions and rationale
- [data-model.md](./data-model.md) — Source → target mapping
- [contracts/index-structure.md](./contracts/index-structure.md) — Target structure contract
