# Claude Code Configuration

Modular, production-ready configuration for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Anthropic's official CLI for Claude.

Rules, skills, agents, commands, and hooks that enforce spec-driven development, professional output standards, and automated quality gates.

> **Japanese version**: [README.ja.md](README.ja.md)

## Structure

```
.claude/
├── CLAUDE.md                  # Project constitution (<5KB)
├── settings.json              # Hooks, permissions, env
├── mcp.json                   # MCP server reference (see note below)
│
├── rules/                     # Always-applied standards (8 files)
│   ├── spec-driven-development.md
│   ├── output-standards.md
│   ├── file-editing.md
│   ├── model-selection.md
│   ├── context-management.md
│   ├── memory-vs-repo-rules.md
│   ├── documentation.md
│   └── git-branch-naming.md
│
├── skills/                    # On-demand capabilities (5 skills)
│   ├── speckit-workflow/
│   ├── document-assistant/
│   ├── presentation-assistant/
│   ├── file-editing-strategy/
│   └── documentation-management/
│
├── agents/                    # Delegated subagents (8 agents)
│   ├── quality-checker.md
│   ├── doc-updater.md
│   ├── architecture-reviewer.md
│   ├── spec-compliance-reviewer.md
│   ├── file-edit-reviewer.md
│   ├── context-optimizer.md
│   ├── model-selector.md
│   └── rules-organizer.md
│
├── commands/                  # User-invoked slash commands (5 commands)
│   ├── speckit.md
│   ├── update-readme.md
│   ├── update-changelog.md
│   ├── quality-check.md
│   └── validate-docs.md
│
└── hooks/                     # Lifecycle event scripts (13 hooks)
    ├── advanced-pre-tool-use.sh
    ├── pre-edit-validate.sh
    ├── speckit-pre-edit.sh
    ├── pre-bash-commit-check.sh
    ├── post-edit-format.sh
    ├── post-edit-doc-tracker.sh
    ├── pre-commit-docs.sh
    ├── pre-commit-validate.sh
    ├── quality-gate.sh
    ├── stop-final-check.sh
    ├── subagent-stop-guide.sh
    ├── teammate-idle.sh
    └── task-completed.sh
```

## How It Works

### CLAUDE.md (Constitution)

Loaded at every session start. Keeps under 5KB — contains core principles, quick reference, and pointers to rules/skills/agents. Acts as the single entry point for Claude Code's behavior.

### Rules (Always Applied)

Standards enforced in every session. Claude Code reads these via CLAUDE.md references:

| Rule | Purpose |
|------|---------|
| `spec-driven-development` | Specification before implementation |
| `output-standards` | McKinsey-style professional writing |
| `file-editing` | Targeted edits over full rewrites |
| `model-selection` | Opus / Sonnet / Haiku task routing |
| `context-management` | Token and session optimization |
| `memory-vs-repo-rules` | Memory vs repo-level config taxonomy |
| `documentation` | Docs synchronized with code |
| `git-branch-naming` | Branch naming conventions |

### Skills (On-Demand)

Activate automatically by task context or manually via `/name`:

| Skill | Trigger |
|-------|---------|
| `speckit-workflow` | Code modifications, `/speckit` |
| `document-assistant` | Business document creation |
| `presentation-assistant` | Slide design |
| `file-editing-strategy` | Editing large files (>100 lines) |
| `documentation-management` | README/CHANGELOG updates |

### Agents (Delegated Tasks)

Specialized subagents with isolated context windows:

| Agent | Purpose |
|-------|---------|
| `quality-checker` | Three-stage output validation |
| `doc-updater` | Atomic documentation updates |
| `architecture-reviewer` | System design review |
| `spec-compliance-reviewer` | Spec traceability verification |
| `file-edit-reviewer` | Edit efficiency assessment |
| `context-optimizer` | Context usage optimization |
| `model-selector` | Model assignment recommendations |
| `rules-organizer` | Rules placement guidance |

### Commands (User-Invoked)

Explicit slash commands for common workflows:

| Command | Action |
|---------|--------|
| `/speckit` | Run spec-driven development workflow |
| `/update-readme` | Sync README with current project state |
| `/update-changelog` | Add CHANGELOG entry |
| `/quality-check` | Run all quality validations |
| `/validate-docs` | Check documentation accuracy |

### Hooks (Lifecycle Events)

Configured in `settings.json`. Run automatically at lifecycle events:

| Event | Hooks | Purpose |
|-------|-------|---------|
| **PreToolUse** | `advanced-pre-tool-use.sh`, `pre-edit-validate.sh`, `speckit-pre-edit.sh`, `pre-bash-commit-check.sh` | Branch protection, safety checks, spec-kit nudges |
| **PostToolUse** | `post-edit-format.sh`, `post-edit-doc-tracker.sh` | Auto-format, track doc changes |
| **Stop** | `stop-final-check.sh` | Final validation checklist |
| **SubagentStop** | `subagent-stop-guide.sh` | Suggest next steps |
| **TeammateIdle** | `teammate-idle.sh` | Agent team idle control |
| **TaskCompleted** | `task-completed.sh` | Agent team task gate |

Additional utility hooks: `pre-commit-docs.sh`, `pre-commit-validate.sh`, `quality-gate.sh`.

## Quick Reference

```bash
/speckit            # Spec-driven development workflow
/update-readme      # Sync README
/update-changelog   # Add CHANGELOG entry
/quality-check      # Run quality validations
/validate-docs      # Check documentation accuracy
```

## MCP Servers

The `mcp.json` file is included as a **reference only**. Claude Code stores MCP configuration separately per scope, so `~/.claude/mcp.json` is not read automatically.

| Scope | Config file | Registered with |
|-------|-------------|-----------------|
| User (all projects) | `~/.claude.json` | `claude mcp add --scope user` |
| Project (per repo) | `<project>/.mcp.json` | `claude mcp add --scope project` |

To register MCP servers, use `claude mcp add` with the appropriate `--scope`. See [README-INSTALL.md](README-INSTALL.md) for details.

Included MCP servers:
- **aws-documentation-mcp-server** — AWS documentation search
- **aws-knowledge-mcp-server** — AWS knowledge base (HTTP)
- **aws-api-mcp-server** — AWS API operations
- **aws-iac-mcp-server** — AWS Infrastructure as Code
- **amazon-bedrock-agentcore-mcp-server** — Amazon Bedrock AgentCore
- **strands-agents-mcp-server** — Strands Agents

## Installation

See [README-INSTALL.md](README-INSTALL.md) for setup instructions on other environments.

## Customization

1. **CLAUDE.md** — Add project-specific principles (keep <5KB)
2. **Rules** — Adjust standards for your domain
3. **Skills** — Add project-specific patterns and workflows
4. **Agents** — Create specialized subagents
5. **Commands** — Add workflow shortcuts
6. **Hooks** — Customize lifecycle automation
7. **settings.json** — Adjust permissions, env vars, hook config

## Links

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [GitHub spec-kit](https://github.com/github/spec-kit)
