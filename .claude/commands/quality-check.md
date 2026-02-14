---
name: quality-check
description: Run all quality validations (invokes quality-checker subagent)
---

# Quality Check

Run comprehensive quality validations against professional standards.

## Steps

1. Invoke or emulate the **quality-checker** subagent (`.claude/agents/quality-checker.md`).
2. Apply standards from `.claude/rules/output-standards.md`: structure, language, clarity.
3. Return quality assessment with scores and required fixes.

Use `/quality-check` to run validations before finalizing docs or deliverables.
