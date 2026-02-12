# Master Agent

The Master Agent orchestrates multiple Claude Skills to provide comprehensive software development support. It intelligently routes requests to appropriate skills and coordinates multi-skill workflows for complex tasks.

## Quick Start

The Master Agent automatically activates when you make a request that requires software development support. It analyzes your request and routes it to the appropriate skill(s).

### Simple Requests

For single-skill tasks, the Master Agent routes directly:

- **"Implement user authentication"** → Coding Assistant
- **"Review this pull request"** → Code Review Assistant
- **"Create an ADR for database choice"** → Code Documentation Assistant
- **"Plan the next Sprint"** → Agile Scrum Assistant
- **"Create today's work log"** → Daily Logging Assistant
- **"Create a presentation about Q4 results"** → Presentation Assistant
- **"Help me solve this organizational problem"** → Thinking Assistant
- **"Initialize a Speckit project"** → GitHub Speckit

### Complex Requests

For multi-skill workflows, the Master Agent coordinates:

- **"Add authentication feature"** → Thinking → ADR → Coding → Review → Documentation → Logging
- **"Fix the payment bug"** → Root Cause Analysis → Coding → Review → Documentation
- **"Plan Sprint and implement checkout"** → Agile Planning → Coding → Review → Logging

## Available Skills

The Master Agent coordinates these skills:

1. **Coding Assistant** - Code implementation, SDD/TDD/BDD
2. **Code Review Assistant** - Code quality and security review
3. **Code Documentation Assistant** - Technical documentation (ADRs, API specs)
4. **Agile Scrum Assistant** - Sprint planning, user stories, Scrum events
5. **Daily Logging Assistant** - Structured daily logs (ALCOA+)
6. **Presentation Assistant** - Business presentations (McKinsey-style)
7. **Thinking Assistant** - Problem-solving and critical thinking
8. **GitHub Speckit** - Specification-driven development workflow

## Usage Examples

See [examples.md](examples.md) for detailed workflow examples.

## Workflow Patterns

### Feature Development
```
Thinking → ADR → Coding → Review → Documentation → Logging
```

### Bug Fix
```
Root Cause → Coding → Review → Documentation
```

### Architecture Decision
```
Thinking → ADR → Coding → Review
```

### Sprint Work
```
Agile Planning → Coding → Review → Logging
```

### Speckit Workflow
```
Constitution → Spec → Plan → Tasks → Coding → Review
```

## Best Practices

1. **Be specific** about your needs to help the Master Agent route correctly
2. **Trust the workflow** - the Master Agent coordinates skills optimally
3. **Provide context** when starting complex multi-step tasks
4. **Review outputs** at each stage to ensure quality

## Documentation

- [AGENT.md](AGENT.md) - Complete agent specification
- [examples.md](examples.md) - Detailed usage examples
- [README.md](README.md) - This file

## Version

**Version**: 1.0  
**Last Updated**: 2025-01-04

