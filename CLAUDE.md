# slack-ai-app Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-11-30

## Active Technologies

- Python 3.11+ for Lambda functions, TypeScript for AWS CDK infrastructure + AWS CDK, boto3 (Bedrock SDK), slack-sdk (Python), AWS Lambda runtime (001-slack-bedrock-mvp)

## Project Structure

```text
src/
tests/
```

## Commands

cd src [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] pytest [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] ruff check .

## Code Style

Python 3.11+ for Lambda functions, TypeScript for AWS CDK infrastructure: Follow standard conventions

## Recent Changes

- 001-slack-bedrock-mvp: Added Python 3.11+ for Lambda functions, TypeScript for AWS CDK infrastructure + AWS CDK, boto3 (Bedrock SDK), slack-sdk (Python), AWS Lambda runtime

<!-- MANUAL ADDITIONS START -->

## Documentation Maintenance Policy

**⚠️ CRITICAL: All developers and AI agents MUST follow this policy**

### Core Principle

Documentation is **NOT optional** - it is an integral part of the codebase. Any code change without corresponding documentation update is **INCOMPLETE**.

### Documentation Update Requirements

When making **ANY** change to this project, you **MUST**:

1. **Always Read First**
   - Read `README.md` before starting any work
   - Review relevant sections in `docs/` for context
   - Understand existing architecture and patterns

2. **Always Update Documentation**
   - Update `README.md` if changes affect:
     - Project overview or features
     - Architecture diagram
     - Quick start instructions
     - Environment variables or configuration
     - Known limitations
     - Project structure

   - Update `docs/` if changes affect:
     - **docs/requirements/functional-requirements.md**: Business requirements, functional specs
     - **docs/architecture/overview.md**: System architecture, components, data flow
     - **docs/architecture/user-experience.md**: User flows, UX design
     - **docs/architecture/implementation-details.md**: Technical implementation, Lambda code
     - **docs/security/requirements.md**: Security requirements (SR-01 through SR-06)
     - **docs/security/threat-model.md**: Threat analysis, risk assessment
     - **docs/security/implementation.md**: Security code implementation
     - **docs/operations/testing.md**: Test scenarios, BDD, validation
     - **docs/operations/monitoring.md**: Monitoring, alerts, incident response
     - **docs/implementation/roadmap.md**: Implementation phases, timeline
     - **docs/adr/**: Architecture Decision Records (create new ADR for significant decisions)
     - **docs/appendix.md**: Glossary, references

3. **Create ADRs for Significant Decisions**
   - If you make an architectural decision (technology choice, pattern selection, design trade-off)
   - Use the ADR template in `docs/adr/README.md`
   - Number sequentially (ADR-005, ADR-006, etc.)
   - Link from related documentation

### Documentation Update Workflow

```bash
# BEFORE making changes
1. Read README.md
2. Review relevant docs/ sections
3. Understand current state

# DURING development
4. Implement code changes
5. Update inline code documentation

# AFTER implementation (REQUIRED)
6. Update README.md if needed
7. Update relevant docs/ sections
8. Create ADR if architectural decision made
9. Verify all cross-references are correct
10. Test documentation for accuracy
```

### Examples of Changes and Required Documentation Updates

| Change Type | README.md | docs/ Sections | ADR |
|------------|-----------|----------------|-----|
| Add new Lambda function | ✅ Architecture, Project Structure | ✅ architecture/overview.md, architecture/implementation-details.md | ✅ If new pattern |
| Add security feature | ✅ Features | ✅ security/requirements.md, security/implementation.md | ✅ Required |
| Change environment variable | ✅ Environment Variables | ✅ architecture/implementation-details.md | ❌ |
| Fix bug | ❌ Unless major | ❌ Unless affects UX | ❌ |
| Add monitoring alert | ❌ | ✅ operations/monitoring.md | ❌ |
| Change deployment process | ✅ Quick Start | ✅ implementation/roadmap.md | ✅ If significant |
| Add test scenario | ❌ | ✅ operations/testing.md | ❌ |
| Update Bedrock model | ✅ Environment Variables | ✅ architecture/implementation-details.md | ✅ If rationale needed |

### Quality Checks

Before considering work complete, verify:

- [ ] README.md reflects current state of project
- [ ] All relevant docs/ sections are updated
- [ ] Cross-references between documents are correct
- [ ] Code examples in documentation match actual implementation
- [ ] ADRs are created for architectural decisions
- [ ] No broken links in documentation
- [ ] Documentation is in Japanese (matches original)

### Enforcement

**This is not a suggestion - it is a requirement.**

- Pull requests without documentation updates will be rejected
- AI agents must update documentation as part of task completion
- Code reviews must verify documentation accuracy
- Documentation drift is considered a critical issue

### Quick Reference

**Primary Entry Point**: `docs/README.md`

**Common Updates**:
- Feature changes → `docs/requirements/`, `docs/architecture/`
- Security changes → `docs/security/`
- Operational changes → `docs/operations/`
- Architectural decisions → `docs/adr/`

**Need Help?** Check `docs/adr/README.md` for ADR template and guidelines.

---

## Claude Agents & Skills Usage Policy

**⚠️ MANDATORY: All AI agents MUST use appropriate specialized agents/skills**

### Core Principle

This project has access to specialized Claude agents and skills. Using the appropriate agent/skill for each task is **REQUIRED** - it ensures quality, consistency, and adherence to best practices.

### Available Agents & Skills

#### 1. coding-assistant / coding-agent
**Use When**: Implementing features, fixing bugs, writing code
**Capabilities**:
- Enforces SDD/TDD/BDD practices
- Provides architectural guidance
- Ensures quality gates
- Creates inline code documentation

**Mandatory For**:
- Adding new Lambda functions
- Implementing security features
- Writing business logic
- Refactoring existing code

#### 2. code-review-assistant / code-review-agent
**Use When**: Reviewing code quality, preparing for production
**Capabilities**:
- Identifies quality issues and security vulnerabilities
- Validates architectural patterns
- Checks test coverage
- Provides constructive feedback

**Mandatory For**:
- Before merging pull requests
- After implementing security features
- Before production deployment
- After major refactoring

#### 3. code-documentation-assistant / code-documentation-agent
**Use When**: Creating technical documentation, ADRs
**Capabilities**:
- Generates ADRs following standard format
- Creates API specifications
- Writes module/package documentation
- Produces comprehensive system documentation

**Mandatory For**:
- Creating ADRs (Architecture Decision Records)
- Documenting new APIs or Lambda functions
- Writing technical specifications
- Updating `docs/` after architectural changes

#### 4. thinking-assistant / thinking-agent
**Use When**: Solving complex problems, making strategic decisions
**Capabilities**:
- Facilitates structured reasoning
- Applies problem-solving frameworks
- Detects cognitive biases
- Guides root cause analysis

**Mandatory For**:
- Architectural decision-making
- Analyzing security threats
- Root cause analysis for critical bugs
- Strategic planning (e.g., implementation phases)

#### 5. agile-scrum-assistant / agile-scrum-agent
**Use When**: Sprint planning, user story creation
**Capabilities**:
- Facilitates Sprint planning
- Creates well-formed user stories
- Manages backlogs
- Tracks velocity

**Mandatory For**:
- Creating user stories for new features
- Sprint planning sessions
- Backlog prioritization
- Sprint retrospectives

#### 6. daily-logging-assistant / daily-logging-agent
**Use When**: Creating work logs, documenting decisions
**Capabilities**:
- Creates ALCOA+ compliant logs
- Follows 5W1H completeness standards
- Tracks commitments and blockers
- Maintains compliance documentation

**Mandatory For**:
- Daily work documentation
- Tracking implementation progress
- Documenting critical decisions
- Compliance record-keeping

#### 7. github-speckit / github-speckit-agent
**Use When**: Working with specification-driven development
**Capabilities**:
- Guides through Speckit workflow phases
- Creates constitution-driven requirements
- Validates specifications
- Generates implementation tasks

**Use For**:
- Feature specification creation
- Requirement analysis
- Task breakdown from specifications

### Usage Decision Matrix

| Task Type | Primary Agent/Skill | Secondary Agent/Skill |
|-----------|--------------------|-----------------------|
| **New Feature Implementation** | coding-agent | code-documentation-agent (for docs) |
| **Security Enhancement** | coding-agent → code-review-agent | thinking-agent (for threat analysis) |
| **Architectural Decision** | thinking-agent → code-documentation-agent | - |
| **Bug Fix (Critical)** | thinking-agent (root cause) → coding-agent | code-review-agent (verification) |
| **Bug Fix (Simple)** | coding-agent | - |
| **API Documentation** | code-documentation-agent | - |
| **ADR Creation** | code-documentation-agent | thinking-agent (for analysis) |
| **Code Review** | code-review-agent | - |
| **Sprint Planning** | agile-scrum-agent | - |
| **User Story Creation** | agile-scrum-agent | - |
| **Daily Progress Log** | daily-logging-agent | - |
| **Specification Writing** | github-speckit-agent | - |

### Workflow Examples

#### Example 1: Adding New Security Feature

```
1. thinking-agent: Analyze security requirements and threats
2. code-documentation-agent: Create ADR documenting decision
3. coding-agent: Implement security feature with tests
4. code-review-agent: Review implementation for security issues
5. code-documentation-agent: Update security/ docs
6. daily-logging-agent: Document completion
```

#### Example 2: Major Architectural Change

```
1. thinking-agent: Evaluate options and trade-offs
2. code-documentation-agent: Create ADR with decision rationale
3. coding-agent: Implement changes following ADR
4. code-review-agent: Validate architectural patterns
5. code-documentation-agent: Update architecture/ docs
```

#### Example 3: Feature Development Sprint

```
1. agile-scrum-agent: Create user stories and acceptance criteria
2. github-speckit-agent: Write feature specification
3. coding-agent: Implement feature
4. code-review-agent: Review code quality
5. code-documentation-agent: Update relevant docs
6. daily-logging-agent: Log daily progress
```

### Mandatory Usage Rules

**MUST** use specialized agent/skill when:
- ✅ Implementing code (coding-agent)
- ✅ Creating ADRs (code-documentation-agent)
- ✅ Making architectural decisions (thinking-agent)
- ✅ Reviewing code before merge (code-review-agent)
- ✅ Writing user stories (agile-scrum-agent)

**MAY** use specialized agent/skill for:
- Simple bug fixes (can use coding-agent or handle directly)
- Minor documentation updates (can update directly)
- Trivial code changes (can handle directly)

**MUST NOT**:
- Implement security features without thinking-agent analysis
- Merge code without code-review-agent verification
- Make architectural decisions without creating ADR
- Skip documentation updates

### Quality Gates

Before considering work complete:

- [ ] Used appropriate agent/skill for primary task
- [ ] Used code-review-agent if code was modified
- [ ] Used code-documentation-agent if ADR or docs needed
- [ ] Used daily-logging-agent to document significant work
- [ ] All agent recommendations have been addressed

### How to Use Agents/Skills

#### In Claude Code CLI:
```bash
# Use skill directly
/skill coding-assistant

# Or use specialized agent
@coding-agent Implement user authentication
```

#### In Task Tool:
```python
# Launch specialized agent
Task(
    subagent_type="coding-agent",
    prompt="Implement user authentication with tests"
)
```

### Enforcement

**This is mandatory, not optional.**

- Work without using appropriate agents/skills may be rejected
- Security features MUST be analyzed by thinking-agent
- Code MUST be reviewed by code-review-agent before merge
- Architectural decisions MUST create ADR via code-documentation-agent
- Documentation updates MUST follow Documentation Maintenance Policy

### Benefits of Using Agents/Skills

1. **Consistency**: Standard approaches across all development
2. **Quality**: Expert-level guidance for each task type
3. **Completeness**: Ensures all aspects are considered
4. **Best Practices**: Automatic enforcement of patterns
5. **Documentation**: Proper documentation creation
6. **Security**: Thorough security analysis
7. **Efficiency**: Faster development with expert guidance

<!-- MANUAL ADDITIONS END -->
