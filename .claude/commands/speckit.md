---
name: speckit
description: Run spec-driven development workflow for code modifications using GitHub spec-kit
---

# spec-kit Workflow

Run the spec-driven development workflow for the current task.

## Steps

1. **Check spec-kit artifacts**
   - Look for `.speckit/` directory
   - Read `constitution.md`, `spec.md`, `plan.md`, `tasks.md` if they exist
   - Identify what artifacts are missing or outdated

2. **Initialize if needed**
   - If no `.speckit/` directory: run `/speckit.constitution` to define project governance
   - If no spec for current change: run `/speckit.specify`

3. **Spec-driven workflow**
   - `/speckit.specify` — Define what the change accomplishes (acceptance criteria, constraints)
   - `/speckit.clarify` — Resolve ambiguities before planning
   - `/speckit.plan` — Define technical approach (stack, architecture, affected files)
   - `/speckit.tasks` — Decompose into atomic, testable tasks
   - `/speckit.implement` — Execute tasks referencing spec requirements

4. **Validate**
   - `/speckit.analyze` — Check consistency across all artifacts
   - `/speckit.checklist` — Final quality validation
   - Ensure documentation reflects implemented spec

**Output**: Spec-compliant implementation with full traceability from requirement to code.
