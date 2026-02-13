---
name: github-speckit
description: Specification-driven development workflow using GitHub Speckit. Guide AI agents through structured phases: constitution → specify → plan → tasks → implement. Use when working with Speckit projects (containing .specify/ folder), when users request spec-first development with /speckit.* commands, or when implementing features using constitution-driven requirements. Supports Claude Code, GitHub Copilot, Cursor, and Gemini CLI workflows.
---

# GitHub Speckit Development Workflow

For usage examples, see [examples.md](examples.md).  
For command reference, see [reference.md](reference.md).

## Purpose

Enforce specification-driven development using GitHub Spec-Kit methodology. Guide AI agents through structured phases: constitution → specify → plan → tasks → implement. Ensure code-spec consistency and maintain traceable implementation decisions.

**Note**: This skill follows the official [GitHub Spec-Kit](https://github.com/github/spec-kit) workflow and best practices. Always refer to the official documentation for the latest updates.

## Speckit Project Detection

Check for Speckit project structure:

```bash
# Verify Speckit project
ls .specify/memory/constitution.md
ls .specify/templates/
ls .claude/commands/speckit.*.md  # Claude Code
ls .github/prompts/speckit.*.prompt.md  # GitHub Copilot
```

If Speckit structure missing, inform user to run:

```bash
uvx --from git+https://github.com/github/spec-kit.git specify init <PROJECT_NAME> --ai claude
```

## Core Workflow Commands

Speckit uses slash commands for structured development. Always follow this sequence:

### Phase 1: Constitution (Project Principles)

**Command**: `/speckit.constitution`

Establish non-negotiable project principles before any feature development.

**Example**:

```
/speckit.constitution

This project is a React + TypeScript SPA using Vite.
- Use React Router for navigation
- Tailwind CSS for styling (utility-first)
- Axios for API calls
- State: useState/useReducer + Context API for cart
- All code in TypeScript
- No external UI libraries (build custom components)
```

**Output**: `.specify/memory/constitution.md`

**Claude's Role**:

- Validate constitution completeness
- Identify missing architectural decisions
- Suggest additions (testing strategy, deployment, etc.)

### Phase 2: Specification (Functional Requirements)

**Command**: `/speckit.specify`

Define **what** to build (not **how**). Focus on user requirements, not technical implementation.

**Example**:

```
/speckit.specify

Build a bookstore frontend with three pages:
1. Product Listing: Grid of books (cover, title, author, price)
2. Product Detail: Full book info with "Add to Cart"
3. Shopping Cart: List of cart items with quantities

Books fetched from mock API. Click book → detail page. Cart persists in browser.
```

**Output**: Feature branch with `.specify/<feature>/spec.md`

**Claude's Role**:

- Generate spec from prompt using template
- Ask clarifying questions for ambiguity
- Validate against constitution
- Populate Review & Acceptance Checklist

### Phase 3: Clarification (Optional)

**Command**: `/speckit.clarify` (structured mode)

Sequential, coverage-based questioning to fill gaps in specification.

**When to Use**:

- Spec has vague requirements
- Multiple valid interpretations exist
- Before /speckit.plan to reduce rework

**Claude's Role**:

- Generate structured clarification questions
- Record answers in spec's Clarifications section
- Update spec based on responses

**Skip if**: Exploratory prototype or spike work

### Phase 4: Technical Plan

**Command**: `/speckit.plan`

Translate spec into **how** to build it. Specify tech stack, architecture, and implementation details.

**Example**:

```
/speckit.plan

Use Hugo static site generator:
- No npm dependencies (custom HTML/CSS/JS only)
- Camera data in cameras.json
- Bash script for image collection
- Images stored in data/images/CAMERA_ID/YYYY_MM_DD_HH_MM/
```

**Output**: `.specify/<feature>/plan/implementation-plan.md` and detail files

**Claude's Role**:

- Generate detailed technical architecture
- Validate against constitution
- Create implementation detail documents
- Identify architectural decisions
- Flag over-engineering

### Phase 5: Task Breakdown

**Command**: `/speckit.tasks`

Break plan into sequential, actionable tasks.

**Output**: `.specify/<feature>/plan/tasks.md`

**Task Structure**:

- Organized by user story
- Dependency-ordered (models → services → endpoints)
- Parallel execution markers `[P]` for concurrent tasks
- Each task testable before completion

**Claude's Role**:

- Generate task sequence from plan
- Respect dependencies
- Mark parallelizable tasks
- Ensure testability checkpoints

### Phase 6: Analysis (Quality Gate)

**Command**: `/speckit.analyze`

Validate consistency across spec, plan, and tasks.

**Checks**:

- No conflicting requirements
- No duplicated specifications
- Technical plan aligns with constitution
- Tasks cover all spec requirements

**Claude's Role**:

- Scan all artifacts for conflicts
- Report inconsistencies
- Suggest resolutions
- Block implementation if critical issues found

**Optional**: Skip if confident in alignment

### Phase 7: Implementation

**Command**: `/speckit.implement`

Execute task list to build feature.

**Process**:

1. Commit all artifacts before implementation
2. Execute tasks in order
3. Validate against spec after each task
4. Update Review & Acceptance Checklist

**Claude's Role**:

- Implement tasks sequentially
- Reference spec/plan for decisions
- Write tests per task
- Update checklist on completion

## Before Any Code Implementation

Always verify:

**CRITICAL CHECKS**:

1. ✅ Constitution exists: `.specify/memory/constitution.md`
2. ✅ Feature spec exists: `.specify/<feature>/spec.md`
3. ✅ Technical plan exists: `.specify/<feature>/plan/implementation-plan.md`
4. ✅ Tasks generated: `.specify/<feature>/plan/tasks.md`
5. ✅ No analysis conflicts (if /speckit.analyze was run)

**If missing**: STOP and run appropriate /speckit.* command

## Speckit File Structure

The official spec-kit project structure follows this pattern:

```
.specify/
├── memory/
│   └── constitution.md          # Project principles and constraints
├── templates/                    # Spec/plan/task templates
│   ├── constitution-template.md
│   ├── feature-spec-template.md
│   ├── implementation-plan-template.md
│   └── tasks-template.md
├── scripts/                      # Helper automation scripts
│   ├── bash/
│   │   ├── create-new-feature.sh
│   │   └── check-prerequisites.sh
│   └── ps/                       # PowerShell scripts
└── <NNN-feature-name>/          # Feature directories
    ├── spec.md
    └── plan/
        ├── implementation-plan.md
        ├── implementation-detail-*.md
        └── tasks.md
```

**Key Points**:
- All spec-kit artifacts are stored in `.specify/` directory
- Constitution is shared across all features in `memory/`
- Each feature has its own directory with spec and plan
- Templates are reusable across features
- Scripts provide automation for common tasks

### Constitution Template

```markdown
# Project Constitution

## Core Principles
[Non-negotiable architectural decisions]

## Technology Stack
- Frontend: [framework]
- Backend: [runtime/framework]
- Database: [type]
- Deployment: [platform]

## Development Standards
- Language: [TypeScript/JavaScript/Python/etc.]
- Testing: [framework + coverage requirements]
- Code Style: [linter + formatter]

## Constraints
- No [banned libraries/patterns]
- Must [required patterns/practices]
- Prefer [architectural preferences]

## Security & Compliance
[Authentication, authorization, data protection rules]
```

### Feature Specification Template

```markdown
# Feature: [Name]

## Overview
[One paragraph: what problem this solves]

## User Stories
As a [role], I want [capability] so that [benefit]

## Requirements
### Functional
- [Specific user-facing behaviors]

### Non-Functional
- Performance: [metrics]
- Security: [requirements]
- Accessibility: [standards]

## Out of Scope
[Explicit exclusions]

## Acceptance Criteria
- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]

## Review & Acceptance Checklist
- [ ] Requirements are clear and unambiguous
- [ ] All edge cases covered
- [ ] Non-functional requirements specified
- [ ] Out of scope explicitly stated
```

### Technical Plan Template

```markdown
# Implementation Plan: [Feature]

## Architecture Overview
[High-level technical approach]

## Components
### Component A
- Responsibility: [what it does]
- Dependencies: [what it needs]
- Interface: [how others interact]

## Data Model
[Schema, relationships, constraints]

## API Design
[Endpoints, parameters, responses]

## Implementation Details
[Technology-specific decisions]

## Testing Strategy
[Unit, integration, e2e approaches]

## Deployment Considerations
[Build, deploy, rollback strategies]
```

### Tasks Template

```markdown
# Tasks: [Feature]

## User Story 1: [Name]
### Task 1.1: [Description]
- Type: [Backend/Frontend/Infrastructure]
- Dependencies: None
- Acceptance: [How to verify]

### Task 1.2: [Description] [P]
- Type: Frontend
- Dependencies: 1.1
- Acceptance: [Criteria]
- Parallel: Can run with 1.3

## User Story 2: [Name]
[Tasks...]
```

## Command Usage Patterns

### Pattern 1: New Feature from Scratch

```
1. /speckit.constitution
   [Define project architecture]

2. /speckit.specify
   [Describe feature requirements]

3. /speckit.clarify (optional)
   [Answer clarifying questions]

4. /speckit.plan
   [Specify tech stack and architecture]

5. /speckit.tasks
   [Generate task breakdown]

6. /speckit.analyze (optional)
   [Validate consistency]

7. /speckit.implement
   [Execute tasks]
```

### Pattern 2: Add Feature to Existing Project

```
1. Read .specify/memory/constitution.md
   [Understand existing constraints]

2. /speckit.specify
   [New feature requirements]

3. /speckit.plan
   [Align with existing architecture]

4. /speckit.tasks → /speckit.implement
```

### Pattern 3: Fix Underspecified Feature

```
1. /speckit.clarify
   [Ask structured questions]

2. Update .specify/<feature>/spec.md
   [Record answers]

3. /speckit.analyze
   [Validate consistency]

4. Revise plan/tasks if conflicts found
```

## Conflict Resolution

### Spec-Constitution Conflict

**Example**: Spec requires Node.js, constitution mandates .NET

**Claude Action**:

1. STOP implementation
2. Highlight conflict explicitly
3. Provide options:
   - Update constitution (requires justification)
   - Revise spec to use .NET
   - Split feature (Node for specific component only)
4. Wait for user decision

### Plan-Spec Conflict

**Example**: Plan includes feature not in spec

**Claude Action**:

1. Flag during /speckit.analyze
2. Options:
   - Remove from plan (over-engineering)
   - Add to spec (missing requirement)
   - Mark as technical necessity (justify)

### Task-Plan Conflict

**Example**: Task ordering violates dependencies

**Claude Action**:

1. Reorder tasks to respect dependencies
2. Validate with user before /speckit.implement
3. Update tasks.md

## Output Format Standards

### When Updating Constitution

```markdown
## CONSTITUTION UPDATE: .specify/memory/constitution.md

[Updated constitution content]

---
**Changes Summary**:
- Added: [new principle]
- Modified: [changed constraint]
- Reason: [justification]
```

### When Creating Specification

```markdown
## SPEC CREATED: .specify/<feature>/spec.md

[Full spec content following template]

---
**Review Checklist Status**:
✅ Requirements clear
✅ Edge cases covered
⚠️  Need clarification on: [topic]
```

### When Generating Plan

```markdown
## TECHNICAL PLAN: .specify/<feature>/plan/implementation-plan.md

[Plan content]

---
**Constitutional Alignment**:
✅ Uses required tech stack
✅ Follows testing standards
✅ Respects security constraints
```

### When Creating Tasks

```markdown
## TASKS GENERATED: .specify/<feature>/plan/tasks.md

[Task breakdown]

---
**Execution Strategy**:
- Total tasks: N
- Parallelizable: M (marked [P])
- Critical path: [task sequence]
- Estimated complexity: [High/Medium/Low]
```

## Guardrails

**NEVER**:

- Implement without constitution
- Skip specification phase
- Generate plan before spec is validated
- Execute tasks without dependency check
- Assume requirements from context alone

**ALWAYS**:

- Validate against constitution at every phase
- Ask clarifying questions for ambiguity
- Document tradeoffs in plan
- Sequence tasks by dependencies
- Update Review & Acceptance Checklist

## Feature Branch Management

Speckit uses Git feature branches:

```bash
# Check current feature
git branch --show-current  # Should be feature/NNN-feature-name

# Feature artifacts location
.specify/NNN-feature-name/
  ├── spec.md
  └── plan/
      ├── implementation-plan.md
      ├── implementation-detail-*.md
      └── tasks.md
```

**Claude Action**:

- Verify feature branch before /speckit.specify
- Commit artifacts after each phase
- Reference feature number in all outputs

## Quality Checklist

Before marking work complete:

-  Constitution defines all architectural decisions
-  Spec has measurable acceptance criteria
-  Plan validates against constitution
-  Tasks respect dependencies
-  Review & Acceptance Checklist 100% complete
-  No conflicts found by /speckit.analyze
-  All artifacts committed to feature branch

## Integration with Spec-Kit CLI

### Installation

Spec-kit can be installed and used in multiple ways:

```bash
# Install globally with uv (recommended)
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# Or one-time usage without installation
uvx --from git+https://github.com/github/spec-kit.git specify init my-project --ai claude
```

### Initialize Project

```bash
# Claude Code (recommended for this skill)
uvx --from git+https://github.com/github/spec-kit.git specify init <PROJECT_NAME> --ai claude

# GitHub Copilot
uvx --from git+https://github.com/github/spec-kit.git specify init <PROJECT_NAME> --ai copilot

# Cursor
uvx --from git+https://github.com/github/spec-kit.git specify init <PROJECT_NAME> --ai cursor

# Force PowerShell scripts (Windows)
specify init <PROJECT_NAME> --ai claude --script ps

# Skip Git initialization
specify init <PROJECT_NAME> --ai claude --no-git
```

### Verify Installation

```bash
# Check prerequisites (Node.js 20+, Git, etc.)
specify check

# Verify command files exist
ls .claude/commands/speckit.*.md  # Claude Code
ls .github/prompts/speckit.*.prompt.md  # GitHub Copilot
```

### Manual Feature Creation (Alternative)

If `/speckit.specify` command doesn't work, you can use helper scripts:

```bash
# Bash (Linux/macOS)
.specify/scripts/bash/create-new-feature.sh

# PowerShell (Windows)
.specify/scripts/ps/create-new-feature.ps1
```

**Note**: The official spec-kit repository recommends using the slash commands (`/speckit.*`) as the primary interface. Scripts are provided as fallback options.

## Advanced Usage

### Multi-Developer Scenarios

When multiple developers work on same project:

1. **Constitution is shared**: All developers follow same constraints
2. **Specs are independent**: Each feature has own spec
3. **Plans may differ**: Same spec, different tech approaches (if constitution allows)
4. **Tasks are developer-specific**: Breakdown varies by skill

**Claude's Role**: Ensure all implementations respect shared constitution

### Cross-Feature Dependencies

When Feature B depends on Feature A:

```markdown
## Feature B Spec

### Dependencies
- Feature A: User authentication (must be complete)
- Feature A API: /api/users endpoint

### Assumptions
- Feature A provides JWT tokens
- Token format: Bearer <token>
```

**Claude Action**: Verify Feature A artifacts exist before planning Feature B

## Troubleshooting

### Commands Not Found

If `/speckit.*` commands are not available:

```bash
# Verify command files exist
ls .claude/commands/speckit.*.md  # Claude Code
ls .github/prompts/speckit.*.prompt.md  # GitHub Copilot

# Reinstall if missing
uvx --from git+https://github.com/github/spec-kit.git specify init . --ai claude
```

### Spec-Kit Project Not Initialized

If `.specify/` directory is missing:

```bash
# Initialize spec-kit project
uvx --from git+https://github.com/github/spec-kit.git specify init <PROJECT_NAME> --ai claude

# Verify structure created
ls .specify/memory/constitution.md
ls .specify/templates/
ls .claude/commands/speckit.*.md
```

### Git Credential Manager on Linux

If you're having issues with Git authentication on Linux:

```bash
#!/usr/bin/env bash
set -e
echo "Downloading Git Credential Manager v2.6.1..."
wget https://github.com/git-ecosystem/git-credential-manager/releases/download/v2.6.1/gcm-linux_amd64.2.6.1.deb
echo "Installing Git Credential Manager..."
sudo dpkg -i gcm-linux_amd64.2.6.1.deb
echo "Configuring Git to use GCM..."
git config --global credential.helper manager
echo "Cleaning up..."
rm gcm-linux_amd64.2.6.1.deb
```

### Prerequisites Check

Before using spec-kit, verify prerequisites:

```bash
# Check prerequisites
specify check

# Required:
# - Node.js 20+ (for CLI)
# - Git (for version control)
# - uv or npm (for package management)
```

### Common Issues

1. **Commands not working**: Ensure you're in a spec-kit initialized project
2. **Templates missing**: Re-run `specify init` to restore templates
3. **Feature branch issues**: Ensure you're on a feature branch (e.g., `feature/001-name`)
4. **Constitution conflicts**: Review constitution before creating specs/plans

## References

- **Spec-Kit Repository**: https://github.com/github/spec-kit
- **Spec-Kit Documentation**: https://github.github.com/spec-kit/
- **Spec-Kit README**: https://github.com/github/spec-kit/blob/main/README.md
- **CLI Installation**: https://github.com/github/spec-kit#installation
- **Claude Code Sub-Agents**: https://code.claude.com/docs/en/sub-agents

For the latest updates and best practices, always refer to the official [spec-kit repository](https://github.com/github/spec-kit).

---

**Version**: 2.1.0  
**Last Updated**: 2025-01-04

