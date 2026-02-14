# Installation Guide

How to deploy this repository's configuration to `~/.claude` on another machine or environment.

Agent teams (experimental) are enabled via `settings.json` (`env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`). They work immediately after sync.

> **Japanese version**: [README-INSTALL.ja.md](README-INSTALL.ja.md)

## Prerequisites

- Claude Code installed and available
- `git` installed

## 1. Clone the Repository

```bash
git clone git@github.com:superluminal-jp/my-claude-code.git
cd my-claude-code
```

## 2. Sync to ~/.claude

### New setup (no existing ~/.claude)

Copy the repository contents directly:

```bash
mkdir -p ~/.claude
rsync -av --exclude='.git' --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='Desktop.ini' --exclude='._*' ./ ~/.claude/
```

### Merge (overlay on existing ~/.claude)

Overwrites only files that exist in the repository. Files unique to your `~/.claude` (custom rules, skills, etc.) are preserved:

```bash
rsync -av --exclude='.git' --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='Desktop.ini' --exclude='._*' ./ ~/.claude/
```

- `~/.claude/settings.local.json` and other local-only files are not in the repository and remain untouched.
- Files with the same name are overwritten by the repository version. Back up first if needed.

### Full sync (match repository exactly)

Replaces `~/.claude` entirely. Files not in the repository are deleted:

```bash
rsync -av --exclude='.git' --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='Desktop.ini' --exclude='._*' --delete ./ ~/.claude/
```

- `--delete` removes files and directories from `~/.claude` that do not exist in the repository.
- **Back up first** (e.g., `cp -a ~/.claude ~/.claude.bak`). Local-only files like `settings.local.json` will be removed.

> **Important**: All hooks in `settings.json` reference `$HOME/.claude/hooks/`. Hooks will not work until the sync is complete.

## 3. MCP Servers

The repository includes `mcp.json` as a **reference only**. Claude Code stores MCP configuration separately per scope, so `~/.claude/mcp.json` is not recognized.

| Scope | Config file | Use case |
|-------|-------------|----------|
| User (`--scope user`) | `~/.claude.json` | Available in all projects on this machine |
| Project (`--scope project`) | `<project>/.mcp.json` | Available only in a specific project (committed to repo) |

### User scope (recommended for personal setup)

Register MCP servers with `claude mcp add --scope user` on each environment. Use `mcp.json` as a reference:

```bash
# AWS Documentation
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  --env AWS_DOCUMENTATION_PARTITION=aws \
  aws-documentation-mcp-server -- uvx awslabs.aws-documentation-mcp-server@latest

# AWS Knowledge (HTTP)
claude mcp add --transport http --scope user \
  aws-knowledge-mcp-server https://knowledge-mcp.global.api.aws

# AWS API
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  --env "AWS_REGION=${AWS_REGION:-ap-northeast-1}" \
  --env "AWS_API_MCP_WORKING_DIR=${HOME}/.aws/mcp/workdir" \
  --env AWS_API_MCP_ALLOW_UNRESTRICTED_LOCAL_FILE_ACCESS=workdir \
  --env "AWS_API_MCP_PROFILE_NAME=${AWS_PROFILE:-default}" \
  --env READ_OPERATIONS_ONLY=false \
  --env REQUIRE_MUTATION_CONSENT=true \
  --env AWS_API_MCP_TELEMETRY=true \
  --env EXPERIMENTAL_AGENT_SCRIPTS=false \
  aws-api-mcp-server -- uvx awslabs.aws-api-mcp-server@latest

# AWS IaC
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  --env "AWS_PROFILE=${AWS_PROFILE:-default}" \
  --env "AWS_REGION=${AWS_REGION:-ap-northeast-1}" \
  aws-iac-mcp-server -- uvx awslabs.aws-iac-mcp-server@latest

# Amazon Bedrock AgentCore
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  amazon-bedrock-agentcore-mcp-server -- uvx awslabs.amazon-bedrock-agentcore-mcp-server@latest

# Strands Agents
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  strands-agents-mcp-server -- uvx strands-agents-mcp-server
```

### Project scope (per-repository)

To make MCP servers available only within a specific project, use `--scope project` from the project root. This creates or updates `.mcp.json` in the project directory:

```bash
cd /path/to/your-project

# Example: add AWS Documentation to this project only
claude mcp add --transport stdio --scope project \
  --env FASTMCP_LOG_LEVEL=ERROR \
  --env AWS_DOCUMENTATION_PARTITION=aws \
  aws-documentation-mcp-server -- uvx awslabs.aws-documentation-mcp-server@latest
```

- The `.mcp.json` file is created in the project root and can be committed to version control.
- Team members who clone the repo get the same MCP configuration automatically.
- Project-scoped servers are only active when Claude Code is run from that project directory.

### Verify

Run `claude mcp list` or `/mcp` inside Claude Code to confirm registered servers.

## 4. Plugins

This repository does not include `plugins/`. Reinstall plugins through Claude Code's plugin feature on each environment as needed.

## 5. Local Settings

Environment-specific overrides (permission lists, tool settings, etc.) go in `~/.claude/settings.local.json`. This file is not included in the repository — create and edit it freely per environment.

## 6. Maintenance

When you update the configuration, push changes to this repository. On other environments, pull and re-sync:

```bash
cd my-claude-code
git pull
rsync -av --exclude='.git' --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='Desktop.ini' --exclude='._*' ./ ~/.claude/
```
