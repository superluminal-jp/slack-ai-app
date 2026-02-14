# Memory vs. Repo Rules

**Purpose**: Clarify which expectations live in Claude Code memory versus repo-level rules and skills. Aligned with AWS AgentCore Memory strategy: built-in (memory) for who you are; self-managed (rules/skills) for how each project works.

---

## Claude Code memory (built-in / product memory)

**Stores:** Stable, cross-session preferences that define **who you are** as a developer.

**Use for:**
- **User-preference**: Coding style (Black, PEP8, ESLint/Prettier, strict TypeScript), error-handling and logging policy, observability expectations, security posture.
- **Semantic facts**: High-level stack preferences (e.g. Next.js + shadcn, AWS IaC defaults), that `.claude/` and `.cursor/` rules are authoritative.
- **Episodic changes**: Rare but lasting shifts (e.g. "I now use Vitest for all TypeScript projects", "Amplify Gen 2 only").

**Do not put in memory:**
- Project-specific layout, module boundaries, or dependency choices.
- Long checklists, full governance text, or detailed specs (keep in version-controlled files).
- One-off or time-limited experiments.

**Source of content:** Draft and maintain entries in `.claude/memory-entries.md`; add them to the product memory feature so they persist across sessions. Assistants loading `.claude/` also apply that file as reference.

---

## Repo-level rules and skills (self-managed)

**Stores:** How **this project** works and any project-specific exceptions to global preferences.

**Use for:**
- **Project layout**: Directory structure, `src/` vs `tests/` vs `docs/`, naming conventions.
- **Module boundaries**: Which packages or services exist, how they communicate.
- **Dependency and tool choices**: Versions, frameworks, and libraries used in this repo only.
- **Project-specific exceptions**: e.g. "This repo uses Mocha; do not migrate to Vitest."
- **Detailed standards**: Full style guides, API contracts, architecture decision records (ADRs).

**Where it lives:**
- `CLAUDE.md` (project or user scope), `.claude/rules/*.md`, `.cursor/rules/*.md`, `.claude/skills/`, project `docs/`.

**Rules defined:** In this setup, **Rules** are the always-applied convention files that CLAUDE.md references (`.claude/rules/*.md`). Claude Code has no built-in "Rules" feature; we achieve "always apply" by having CLAUDE.md list and reference these files so they are treated as persistent context every session.

**Principle:** Version-controlled text is the source of truth for project behavior. Memory should point at it, not duplicate it.

---

## Rules vs. Skills vs. Agents (Claude Code)

| Aspect | Rules (`.claude/rules/`) | Skills (`.claude/skills/`) | Agents (`.claude/agents/`) |
|--------|---------------------------|----------------------------|-----------------------------|
| **Role** | Always-applied standards and constraints | On-demand knowledge and workflows | Delegated tasks in isolated context |
| **Loaded** | Every session (via CLAUDE.md reference) | When task matches or `/name` invoked | When delegated (subagent spawned) |
| **Use for** | "In this repo, always do X" (e.g. spec-first, file-editing policy, output standards) | "For task Y, use this procedure or knowledge" (e.g. speckit-workflow, document-assistant) | "Delegate Z to a specialist; get a summary back" (e.g. quality-checker, doc-updater) |
| **Examples** | spec-driven-development, output-standards, file-editing | speckit-workflow, document-assistant, documentation-management | quality-checker, architecture-reviewer, doc-updater |

---

## Separation of concerns

| Aspect | Claude Code memory | Repo rules / skills |
|--------|--------------------|----------------------|
| Scope | Global / user-level | Per project or per repo |
| Content | Short, dense preferences and pointers | Detailed norms, structure, specs |
| Persistence | Product memory + `memory-entries.md` | Git (`.claude/`, `.cursor/`, `docs/`) |
| Updates | When you change global preferences or tooling | When the project changes |
| Authority | "Always do X in my code" | "In this repo, do Y" |

**Best practice:** Memory entries say *"Follow the standards in `~/.claude/rules/` and project `.claude/`"*; they do not repeat the full text of those rules. When both apply, repo-level rules override global memory only where they explicitly state a project-specific exception.

**Maintenance:** Cadence and criteria for reviewing and updating memories (e.g. monthly, after 2–3 projects, after incidents) are in `.claude/memory-entries.md` under "Maintenance and review (update ritual)".
