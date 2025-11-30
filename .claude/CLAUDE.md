# AGENTS - Claude Skills & Agent Framework

This repository contains a comprehensive collection of Claude Skills and a Master Agent that orchestrates them for efficient software development workflows.

## Overview

This project provides:

1. **8 Specialized Claude Skills** for different aspects of software development
2. **1 Master Agent** that intelligently coordinates all skills
3. **8 Specialized Agents** - one for each skill with focused expertise
4. **Best Practices** and workflows for skill integration

## Structure

```
AGENTS/
├── skills/                    # Individual Claude Skills
│   ├── coding-assistant/      # Code implementation, SDD/TDD/BDD
│   ├── code-review-assistant/ # Code quality and security review
│   ├── code-documentation-assistant/ # Technical documentation
│   ├── agile-scrum-assistant/ # Agile/Scrum process facilitation
│   ├── daily-logging-assistant/ # Structured daily logs (ALCOA+)
│   ├── presentation-assistant/ # Business presentations (McKinsey-style)
│   ├── thinking-assistant/    # Problem-solving and critical thinking
│   └── github-speckit/         # Specification-driven development
│
└── agents/                    # Claude Agents
    ├── master-agent/          # Orchestrates all skills
    │   ├── AGENT.md           # Agent specification
    │   ├── examples.md        # Usage examples
    │   ├── README.md          # Quick start guide
    │   └── skill-routing-guide.md # Skill selection logic
    ├── coding-agent/          # Code implementation specialist
    ├── code-review-agent/     # Code review specialist
    ├── code-documentation-agent/ # Documentation specialist
    ├── agile-scrum-agent/     # Agile/Scrum specialist
    ├── daily-logging-agent/   # Daily logging specialist
    ├── presentation-agent/    # Business presentation specialist
    ├── thinking-agent/        # Problem-solving specialist
    └── github-speckit-agent/  # Speckit workflow specialist
```

## Quick Start

### Using the Master Agent

The Master Agent automatically coordinates skills based on your request:

```bash
# Simple request - routes to single skill
"Implement user authentication"
→ Coding Assistant

# Complex request - coordinates multiple skills
"Add authentication feature"
→ Thinking → ADR → Coding → Review → Documentation → Logging
```

### Using Individual Agents

You can use specialized agents directly for focused tasks:

```bash
# Use Coding Agent (specialized for code implementation)
@coding-agent Implement a login feature

# Use Code Review Agent (specialized for code review)
@code-review-agent Review this pull request

# Use Agile Scrum Agent (specialized for Sprint planning)
@agile-scrum-agent Plan the next Sprint

# Use Thinking Agent (specialized for problem-solving)
@thinking-agent Help me solve this deployment issue
```

### Using Individual Skills

You can also use skills directly by referencing them:

```bash
# Use Coding Assistant skill
@coding-assistant Implement a login feature

# Use Code Review Assistant skill
@code-review-assistant Review this pull request
```

## Available Skills

### 1. Coding Assistant

- **Purpose**: Code implementation with SDD/TDD/BDD enforcement
- **Use When**: Implementing features, fixing bugs, writing code
- **Key Features**: Specification-first, test-driven development, architecture guidance

### 2. Code Review Assistant

- **Purpose**: Code quality, security, and best practices review
- **Use When**: Reviewing code, auditing quality, preparing for production
- **Key Features**: SOLID validation, security analysis, test coverage

### 3. Code Documentation Assistant

- **Purpose**: Technical documentation (ADRs, API specs, module docs)
- **Use When**: Creating ADRs, writing API docs, documenting modules
- **Key Features**: Architecture Decision Records, API specifications

### 4. Agile Scrum Assistant

- **Purpose**: Agile/Scrum process facilitation
- **Use When**: Sprint planning, user stories, Scrum events
- **Key Features**: Sprint planning, backlog management, velocity tracking

### 5. Daily Logging Assistant

- **Purpose**: Structured daily logs following ALCOA+ principles
- **Use When**: Creating daily logs, documenting decisions, tracking blockers
- **Key Features**: ALCOA+ compliance, 5W1H completeness

### 6. Presentation Assistant

- **Purpose**: McKinsey-style business presentations
- **Use When**: Business presentations, executive summaries, strategic recommendations
- **Key Features**: Pyramid Principle, MECE framework, SCQA structure

### 7. Thinking Assistant

- **Purpose**: Structured problem-solving and critical thinking
- **Use When**: Complex problems, strategic decisions, root cause analysis
- **Key Features**: Socratic questioning, cognitive bias detection

### 8. GitHub Speckit

- **Purpose**: Specification-driven development workflow
- **Use When**: Speckit projects, spec-first development
- **Key Features**: Constitution, specification, planning, implementation

## Agents

### Master Agent

The Master Agent intelligently routes requests and coordinates multi-skill workflows.

**Features**:

- **Intelligent Routing**: Automatically selects the right skill(s) for each task
- **Workflow Coordination**: Manages complex multi-step processes
- **Context Preservation**: Maintains information across skill transitions
- **Quality Gates**: Enforces best practices at each stage

### Specialized Agents

Each skill has a dedicated agent with focused expertise:

1. **Coding Agent** - Code implementation with SDD/TDD/BDD enforcement
2. **Code Review Agent** - Comprehensive code quality and security review
3. **Code Documentation Agent** - Technical documentation (ADRs, API specs)
4. **Agile Scrum Agent** - Sprint planning, user stories, Scrum events
5. **Daily Logging Agent** - Structured daily logs (ALCOA+ compliant)
6. **Presentation Agent** - Business presentations (McKinsey-style)
7. **Thinking Agent** - Problem-solving and critical thinking facilitation
8. **GitHub Speckit Agent** - Specification-driven development workflow

Each specialized agent:

- **Focuses on one skill** with deep expertise
- **Coordinates with other agents** when needed
- **Follows best practices** for that domain
- **Maintains quality standards** specific to the skill

### Common Workflows

#### Feature Development

```
Thinking → ADR → Coding → Review → Documentation → Logging
```

#### Bug Fix

```
Root Cause → Coding → Review → Documentation
```

#### Architecture Decision

```
Thinking → ADR → Coding → Review
```

#### Sprint Work

```
Agile Planning → Coding → Review → Logging
```

#### Speckit Workflow

```
Constitution → Spec → Plan → Tasks → Coding → Review
```

## Installation

### For Claude Desktop

1. **Copy skills to Claude skills directory**:

   ```bash
   # Personal skills (all projects)
   cp -r skills/* ~/.claude/skills/

   # Or project-specific skills
   cp -r skills/* .claude/skills/
   ```

2. **Copy agents to Claude agents directory**:

   ```bash
   # Personal agents (all projects)
   cp -r agents/* ~/.claude/agents/

   # Or project-specific agents
   cp -r agents/* .claude/agents/
   ```

### For Claude Code / Cursor

1. **Place skills in project**:

   ```bash
   mkdir -p .claude/skills
   cp -r skills/* .claude/skills/
   ```

2. **Place agents in project**:
   ```bash
   mkdir -p .claude/agents
   cp -r agents/* .claude/agents/
   ```

## Usage Examples

See [agents/master-agent/examples.md](agents/master-agent/examples.md) for detailed examples.

### Example 1: Feature Development

```
User: "Add user authentication"

Master Agent:
1. Thinking Assistant → Analyzes requirements
2. Code Documentation Assistant → Creates ADR
3. Coding Assistant → Implements feature
4. Code Review Assistant → Reviews code
5. Code Documentation Assistant → Creates API docs
6. Daily Logging Assistant → Documents work
```

### Example 2: Bug Fix

```
User: "Fix payment processing bug"

Master Agent:
1. Thinking Assistant → Root cause analysis
2. Coding Assistant → Fixes bug
3. Code Review Assistant → Reviews fix
4. Code Documentation Assistant → Updates docs
```

## Best Practices

1. **Use Master Agent** for complex workflows
2. **Use individual skills** for focused tasks
3. **Provide context** for better routing
4. **Trust the workflow** - skills are coordinated optimally
5. **Review outputs** at each stage

## Documentation

### Master Agent

- **README**: [agents/master-agent/README.md](agents/master-agent/README.md)
- **Examples**: [agents/master-agent/examples.md](agents/master-agent/examples.md)
- **Skill Routing**: [agents/master-agent/skill-routing-guide.md](agents/master-agent/skill-routing-guide.md)

### Specialized Agents

- **Coding Agent**: [agents/coding-agent/AGENT.md](agents/coding-agent/AGENT.md)
- **Code Review Agent**: [agents/code-review-agent/AGENT.md](agents/code-review-agent/AGENT.md)
- **Code Documentation Agent**: [agents/code-documentation-agent/AGENT.md](agents/code-documentation-agent/AGENT.md)
- **Agile Scrum Agent**: [agents/agile-scrum-agent/AGENT.md](agents/agile-scrum-agent/AGENT.md)
- **Daily Logging Agent**: [agents/daily-logging-agent/AGENT.md](agents/daily-logging-agent/AGENT.md)
- **Presentation Agent**: [agents/presentation-agent/AGENT.md](agents/presentation-agent/AGENT.md)
- **Thinking Agent**: [agents/thinking-agent/AGENT.md](agents/thinking-agent/AGENT.md)
- **GitHub Speckit Agent**: [agents/github-speckit-agent/AGENT.md](agents/github-speckit-agent/AGENT.md)

### Skills

- **Individual Skills**: See `skills/*/SKILL.md` for each skill

## Contributing

When adding new skills or agents:

1. Follow the structure in existing skills/agents
2. Include comprehensive documentation
3. Provide usage examples
4. Update this README

## Version

**Version**: 1.0  
**Last Updated**: 2025-01-04

## License

[Specify your license here]

## References

- [Claude Skills Documentation](https://docs.claude.com/ja/docs/build-with-claude/skills-guide)
- [Claude Agents Documentation](https://docs.claude.com/ja/docs/agents-and-tools/agent-skills/overview)
- [GitHub Speckit](https://github.com/github/spec-kit)
