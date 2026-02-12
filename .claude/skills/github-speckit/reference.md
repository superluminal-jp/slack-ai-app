# GitHub Speckit - Command Reference

## Quick Command Reference

### `/speckit.constitution`
**Purpose**: Establish project principles and architectural decisions  
**When to Use**: Beginning of new project, before any feature development  
**Output**: `.specify/memory/constitution.md`

### `/speckit.specify`
**Purpose**: Define **what** to build (functional requirements)  
**When to Use**: Starting new feature, after constitution is established  
**Output**: `.specify/<feature>/spec.md`

### `/speckit.clarify`
**Purpose**: Structured clarification to fill specification gaps  
**When to Use**: After `/speckit.specify` if requirements unclear  
**Output**: Updates spec.md with Clarifications section

### `/speckit.plan`
**Purpose**: Define **how** to implement (technical architecture)  
**When to Use**: After spec is validated, when ready to specify tech stack  
**Output**: `.specify/<feature>/plan/implementation-plan.md`

### `/speckit.tasks`
**Purpose**: Break plan into sequential, executable tasks  
**When to Use**: After technical plan is complete, before implementation  
**Output**: `.specify/<feature>/plan/tasks.md`

### `/speckit.analyze`
**Purpose**: Validate consistency across all artifacts  
**When to Use**: Before `/speckit.implement`, after major spec/plan changes  
**Output**: Validation report

### `/speckit.implement`
**Purpose**: Execute task list to build feature  
**When to Use**: After all artifacts validated, when ready for actual coding  
**Output**: Implemented code following spec and plan

## Workflow Patterns

### New Feature from Scratch
1. `/speckit.constitution` → Define project architecture
2. `/speckit.specify` → Describe feature requirements
3. `/speckit.clarify` (optional) → Answer clarifying questions
4. `/speckit.plan` → Specify tech stack and architecture
5. `/speckit.tasks` → Generate task breakdown
6. `/speckit.analyze` (optional) → Validate consistency
7. `/speckit.implement` → Execute tasks

### Add Feature to Existing Project
1. Read `.specify/memory/constitution.md` → Understand existing constraints
2. `/speckit.specify` → New feature requirements
3. `/speckit.plan` → Align with existing architecture
4. `/speckit.tasks` → `/speckit.implement`

### Fix Underspecified Feature
1. `/speckit.clarify` → Ask structured questions
2. Update `.specify/<feature>/spec.md` → Record answers
3. `/speckit.analyze` → Validate consistency
4. Revise plan/tasks if conflicts found

## Critical Checks Before Implementation

1. ✅ Constitution exists: `.specify/memory/constitution.md`
2. ✅ Feature spec exists: `.specify/<feature>/spec.md`
3. ✅ Technical plan exists: `.specify/<feature>/plan/implementation-plan.md`
4. ✅ Tasks generated: `.specify/<feature>/plan/tasks.md`
5. ✅ No analysis conflicts (if /speckit.analyze was run)

## File Structure

```
.specify/
├── memory/
│   └── constitution.md          # Project principles
├── templates/                    # Spec/plan/task templates
├── scripts/                      # Helper automation
│   ├── bash/
│   └── ps/
└── <NNN-feature-name>/
    ├── spec.md
    └── plan/
        ├── implementation-plan.md
        ├── implementation-detail-*.md
        └── tasks.md
```

## CLI Installation

```bash
# Install globally with uv (recommended)
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# Or one-time usage
uvx --from git+https://github.com/github/spec-kit.git specify init my-project

# For Claude Code
uvx --from git+https://github.com/github/spec-kit.git specify init my-project --ai claude

# For GitHub Copilot
specify init my-project --ai copilot

# For Cursor
specify init my-project --ai cursor
```

## Troubleshooting

### Commands not found
```bash
# Verify command files exist
ls .claude/commands/speckit.*.md  # Claude Code
ls .github/prompts/speckit.*.prompt.md  # GitHub Copilot

# Reinstall if missing
specify init . --ai claude
```

### Spec validation fails
See troubleshooting guide for specific patterns and solutions.

### Constitution conflicts with spec
1. Review constitution constraints
2. Either update constitution (with justification)
3. Or revise spec to align
4. Never silently violate constitution

## Best Practices

1. **Constitution First, Always**: Never start feature development without a constitution
2. **Spec the "What", Plan the "How"**: Keep specifications technology-agnostic
3. **Use Clarify for Complex Features**: Don't guess at requirements
4. **Commit Before Implement**: Protect your artifacts
5. **Validate with Analyze**: Catch conflicts early

## References

- **Speckit Repository**: https://github.com/github/spec-kit
- **Speckit Documentation**: https://github.github.com/spec-kit/
- **Blog Post**: https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
- **Tutorial**: https://den.dev/blog/github-spec-kit/

