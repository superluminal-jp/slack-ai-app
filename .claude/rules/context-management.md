# Context Management

**Purpose**: Memory, caching, and token optimization for Claude Code sessions.

**Principle**: Context window is the primary constraint. Manage it aggressively.

**Related:** For what to store in Claude Code memory vs. repo-level rules and skills, see `memory-vs-repo-rules.md`. For draft memory entries, see `.claude/memory-entries.md`.

---

## Core Rules

### 1. Session Hygiene

- Use `/clear` between unrelated tasks to reset context.
- When correcting Claude more than twice on the same issue, start a fresh session with a more specific prompt.
- Long sessions with accumulated corrections underperform; clean session + better prompt wins.

### 2. Compaction

- When auto-compaction runs, critical context to preserve: list of modified files, test commands run, key decisions.
- Customize compaction in CLAUDE.md if needed: e.g. "When compacting, always preserve the full list of modified files and any test commands."

### 3. Token Efficiency

- Prefer referencing files with `@path` over pasting long excerpts.
- Move detailed content to `.claude/rules/` or skills; keep CLAUDE.md under 5KB.
- Use subagents for investigation so the main conversation stays focused on implementation.

### 4. Verification Over Context

- Prefer runnable verification (tests, lint, commands) over storing long explanations in context.
- Success criteria in the prompt reduce back-and-forth and context bloat.
