---
name: speckit-workflow
description: Enforces spec-driven development using GitHub spec-kit so specifications exist before implementation. Use when modifying code — adding features, fixing bugs, refactoring, or making architectural changes.
allowed-tools: Read, Grep, Glob, Bash
user-invocable: true
---

# spec-kit Workflow

**Auto-activates for**: Code modifications, feature additions, bug fixes, refactoring, architectural changes.

---

## Quick Decision

```
Code modification requested?
│
├─ .speckit/ directory exists?
│  ├─ YES → Read existing artifacts, update spec for this change
│  └─ NO  → Initialize spec-kit: /speckit.constitution → /speckit.specify
│
├─ Change scope?
│  ├─ New feature    → Full workflow (Specify → Plan → Tasks → Implement)
│  ├─ Enhancement    → Update spec → Plan → Tasks → Implement
│  ├─ Bug fix        → Minimal spec (expected vs actual) → Plan → Implement
│  └─ Refactor       → Specify goal → Analyze → Plan → Implement
│
└─ Spec artifacts current?
   ├─ YES → Proceed to planning/implementation
   └─ NO  → Update spec first with /speckit.specify
```

---

## Step-by-Step Workflow

### 1. Check Existing Artifacts

```bash
# Look for spec-kit directory
ls .speckit/ 2>/dev/null

# Read constitution if it exists
cat .speckit/constitution.md 2>/dev/null

# Read current spec
cat .speckit/spec.md 2>/dev/null
```

If `.speckit/` does not exist, initialize with `/speckit.constitution`.

### 2. Create or Update Specification

Use `/speckit.specify` to define:

- **What** the change accomplishes (user-facing behavior)
- **Acceptance criteria** (testable conditions)
- **Constraints** (performance, compatibility, security)
- **Out of scope** (what this change does NOT include)

### 3. Clarify Ambiguities

If the spec has gaps, run `/speckit.clarify` before planning. Address every ambiguity before writing code.

### 4. Plan Implementation

Use `/speckit.plan` to define:

- Tech stack and dependencies
- Architectural approach
- Files affected
- Risk assessment

### 5. Decompose into Tasks

Use `/speckit.tasks` to create atomic, ordered tasks. Each task should be independently testable.

### 6. Implement

Use `/speckit.implement` to execute tasks. Reference task IDs in commit messages for traceability.

### 7. Validate

Run `/speckit.analyze` to check consistency between spec, plan, and implementation. Run `/speckit.checklist` for final quality validation.

---

## Command Quick Reference

| Action | Command |
|--------|---------|
| Initialize project governance | `/speckit.constitution` |
| Define requirements | `/speckit.specify` |
| Create technical plan | `/speckit.plan` |
| Generate task list | `/speckit.tasks` |
| Execute implementation | `/speckit.implement` |
| Resolve ambiguities | `/speckit.clarify` |
| Check consistency | `/speckit.analyze` |
| Final validation | `/speckit.checklist` |

---

## Brownfield Shortcut

For small changes in existing codebases:

1. Read existing `.speckit/` artifacts
2. Append change to spec (do not overwrite)
3. Plan within existing constraints
4. Implement and validate

---

**Applied Rule**: `rules/spec-driven-development.md` (constraints and quality gates)
