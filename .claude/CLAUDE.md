# Project Guidelines

**Purpose**: Core principles and references for AI coding assistants.
**Philosophy**: Keep this file concise (<5KB). Details live in `rules/`, `skills/`, `docs/`.

---

## Core Principles

1. **Spec first** — Define what to build before deciding how (GitHub spec-kit)
2. **TDD always** — For any code change, write/adjust tests first, watch them fail, then implement to pass
3. **Code is source of truth** — Documentation reflects implementation, not aspirations
4. **Quality first** — Professional standards, international best practices
5. **Efficiency** — Targeted edits for large files, minimal changes, clear diffs
6. **Maintainability** — Consistent patterns, clear structure, automated quality checks

---

## Quick Reference

```bash
npm run dev        # Start development server
npm test           # Run all tests
npm run lint       # Check code quality
/speckit           # Spec-driven development workflow
/update-readme     # Sync README
/update-changelog  # Add CHANGELOG entry
/quality-check     # Run quality validations
```

**Structure**: `src/`, `tests/`, `docs/` (architecture, api, guides). Root: README.md, CHANGELOG.md, CLAUDE.md.

---

## Rules (Always Applied)

Located in `rules/` — constraints loaded every session:

- `spec-driven-development.md` — Spec-first workflow + mandatory TDD cycle for code changes
- `output-standards.md` — McKinsey-style writing standards
- `file-editing.md` — Targeted edits vs full rewrites
- `model-selection.md` — Opus/Sonnet/Haiku selection
- `context-management.md` — Token optimization
- `memory-vs-repo-rules.md` — Memory vs repo rules taxonomy
- `documentation.md` — Docs synchronized with code

## Skills (On-Demand)

Located in `skills/` — activate by task match or `/name`:

- **document-assistant** — McKinsey-style business documents
- **presentation-assistant** — McKinsey-style slide design
- **speckit-workflow** — Spec-driven development procedure
- **file-editing-strategy** — Large file editing guidance
- **documentation-management** — README, CHANGELOG, API docs

## Subagents (Delegated Tasks)

Located in `agents/` — each applies its corresponding rule:

| Agent | Rule | Purpose |
|-------|------|---------|
| `doc-updater` | `documentation` | Update docs atomically |
| `quality-checker` | `output-standards` | Validate against standards |
| `architecture-reviewer` | — | Review system design |
| `spec-compliance-reviewer` | `spec-driven-development` | Verify spec compliance |
| `file-edit-reviewer` | `file-editing` | Review edit efficiency |
| `context-optimizer` | `context-management` | Optimize context usage |
| `model-selector` | `model-selection` | Recommend model assignments |
| `rules-organizer` | `memory-vs-repo-rules` | Organize rules placement |

## Hooks (Automated)

Configured in `settings.json`:

- **PreToolUse** — Branch protection, safety checks, spec-kit nudges
- **PostToolUse** — Auto-format after Edit/Write
- **TeammateIdle** — Agent team: allow or block teammate going idle (exit 2 = keep working)
- **SubagentStop** — Suggest next steps
- **Stop** — Final validation checklist
- **TaskCompleted** — Agent team: allow or block task completion (exit 2 = block with feedback)

## Agent Teams

Agent teams are enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`). Use for parallel review, competing-hypothesis debugging, and role-based work. Teammates load CLAUDE.md and project context; give task-specific context in spawn prompts. Size tasks so each teammate owns distinct files to avoid conflicts. Clean up via the lead: ask the lead to shut down teammates, then "Clean up the team." Details: https://code.claude.com/docs/en/agent-teams

---

## Workflow

Specify → Plan → Tasks → Execute. Update docs atomically. Quality-checker for three-stage review. Pre-commit validates.

## Contributing

Before commit: tests pass, docs updated, CHANGELOG entry, quality checks.

## Context Compaction

When compacting, always preserve: list of modified files, test/lint commands run, key decisions made.

---

**Last Updated**: 2026-02-10
