# Master Agent Usage Examples

This document provides practical examples of how the Master Agent coordinates multiple skills to accomplish complex software development tasks.

## Example 1: Complete Feature Development

### Scenario
User wants to add user authentication to their application.

### Master Agent Workflow

```
User Request: "I need to add user authentication to the app"

Master Agent Analysis:
- This is a new feature requiring multiple skills
- Need to: analyze requirements, make architecture decision, implement, review, document

Workflow Execution:

1. Thinking Assistant
   → Analyzes authentication requirements
   → Identifies alternatives (JWT, OAuth, session-based)
   → Recommends approach based on project constraints

2. Code Documentation Assistant
   → Creates ADR-001: Authentication Strategy
   → Documents decision: JWT-based authentication
   → Records alternatives considered and rationale

3. Coding Assistant
   → Reads ADR-001 for context
   → Implements authentication following SDD/TDD principles
   → Creates tests with ≥80% coverage
   → Follows architecture patterns from constitution

4. Code Review Assistant
   → Reviews authentication implementation
   → Validates security best practices
   → Checks test coverage
   → Verifies ADR compliance

5. Code Documentation Assistant
   → Creates API documentation for auth endpoints
   → Updates module documentation

6. Daily Logging Assistant
   → Documents authentication feature completion
   → Records decisions and blockers encountered
```

### Output
- ADR-001: Authentication Strategy
- Authentication implementation with tests
- Code review feedback (addressed)
- API documentation
- Daily log entry

---

## Example 2: Bug Fix with Root Cause Analysis

### Scenario
User reports: "Payment processing is failing intermittently"

### Master Agent Workflow

```
User Request: "Fix the payment bug"

Master Agent Analysis:
- Bug fix requires root cause analysis first
- Then implementation, review, and documentation

Workflow Execution:

1. Thinking Assistant
   → Applies 5 Whys technique
   → Identifies root cause: race condition in payment state management
   → Recommends solution approach

2. Coding Assistant
   → Implements fix: adds proper locking mechanism
   → Writes tests for race condition scenario
   → Follows TDD: test first, then implementation

3. Code Review Assistant
   → Reviews fix for correctness
   → Validates thread safety
   → Checks edge cases

4. Code Documentation Assistant
   → Updates payment module documentation
   → Documents the race condition and fix

5. Daily Logging Assistant
   → Logs bug fix completion
   → Records root cause and solution
```

### Output
- Root cause analysis document
- Bug fix with tests
- Code review approval
- Updated documentation
- Daily log entry

---

## Example 3: Sprint Planning with Feature Implementation

### Scenario
Team needs to plan Sprint and implement selected features.

### Master Agent Workflow

```
User Request: "Plan Sprint 5 and implement the checkout feature"

Master Agent Analysis:
- Sprint planning first
- Then feature implementation following Sprint boundaries
- Requires Agile and Coding skills coordination

Workflow Execution:

1. Agile Scrum Assistant
   → Facilitates Sprint planning
   → Creates user stories for checkout feature
   → Estimates story points
   → Creates Sprint backlog

2. Coding Assistant
   → Implements checkout feature following user stories
   → Ensures Definition of Done is met
   → Follows SDD/TDD principles

3. Code Review Assistant
   → Reviews checkout implementation
   → Validates against acceptance criteria

4. Daily Logging Assistant
   → Tracks daily progress during Sprint
   → Documents blockers and decisions
   → Records Sprint commitments
```

### Output
- Sprint plan with user stories
- Checkout feature implementation
- Code review feedback
- Daily logs for Sprint duration

---

## Example 4: Architecture Decision with Implementation

### Scenario
Team needs to decide on database strategy and implement it.

### Master Agent Workflow

```
User Request: "We need to decide on our database strategy"

Master Agent Analysis:
- Strategic decision requiring analysis
- Then documentation and implementation
- Multi-skill coordination needed

Workflow Execution:

1. Thinking Assistant
   → Analyzes database requirements
   → Identifies alternatives (PostgreSQL, MongoDB, DynamoDB)
   → Evaluates trade-offs
   → Recommends PostgreSQL for ACID compliance needs

2. Code Documentation Assistant
   → Creates ADR-002: Database Selection
   → Documents decision and rationale
   → Records alternatives considered

3. Coding Assistant
   → Implements database integration
   → Sets up connection pooling
   → Creates migration scripts
   → Follows ADR-002 specifications

4. Code Review Assistant
   → Reviews database implementation
   → Validates security (SQL injection prevention)
   → Checks connection management
   → Verifies ADR compliance

5. Code Documentation Assistant
   → Creates database schema documentation
   → Documents connection configuration
```

### Output
- ADR-002: Database Selection
- Database implementation
- Code review approval
- Database documentation

---

## Example 5: Code Review with Documentation Update

### Scenario
User requests code review, and review reveals need for documentation updates.

### Master Agent Workflow

```
User Request: "Review this pull request"

Master Agent Analysis:
- Primary task is code review
- May trigger documentation updates if architecture changed

Workflow Execution:

1. Code Review Assistant
   → Conducts thorough code review
   → Identifies: Architecture pattern changed (from Layered to Clean Architecture)
   → Flags missing documentation

2. Code Documentation Assistant
   → Creates ADR-003: Architecture Pattern Migration
   → Updates module documentation
   → Documents new architecture structure

3. Coding Assistant (if fixes needed)
   → Addresses review feedback
   → Updates code based on review comments

4. Code Review Assistant
   → Re-reviews fixes
   → Approves changes

5. Daily Logging Assistant
   → Documents review findings
   → Records architecture decision
```

### Output
- Code review feedback
- ADR-003: Architecture Pattern Migration
- Updated documentation
- Code fixes (if needed)
- Daily log entry

---

## Example 6: Speckit Feature Development

### Scenario
User wants to implement a feature using Speckit workflow.

### Master Agent Workflow

```
User Request: "Add payment processing using Speckit"

Master Agent Analysis:
- Speckit project requires following Speckit workflow
- Must follow: constitution → spec → plan → tasks → implement

Workflow Execution:

1. GitHub Speckit
   → Checks if constitution exists
   → If new project: Creates constitution
   → Validates project structure

2. GitHub Speckit
   → Creates specification: .specify/payment/spec.md
   → Defines functional requirements
   → Creates acceptance criteria

3. GitHub Speckit
   → Creates technical plan: .specify/payment/plan/implementation-plan.md
   → Specifies architecture and tech stack
   → Validates against constitution

4. GitHub Speckit
   → Creates tasks: .specify/payment/plan/tasks.md
   → Breaks down into sequential tasks
   → Identifies dependencies

5. Coding Assistant
   → Implements tasks following plan
   → References spec for requirements
   → Validates against constitution

6. Code Review Assistant
   → Reviews implementation against spec
   → Validates spec-plan consistency
   → Checks constitution compliance

7. Code Documentation Assistant
   → Updates documentation if needed
   → Creates ADR if architectural decision made
```

### Output
- Constitution (if new project)
- Payment feature specification
- Technical implementation plan
- Task breakdown
- Payment implementation
- Code review approval

---

## Example 7: Complex Problem-Solving with Implementation

### Scenario
User faces a complex organizational problem affecting development velocity.

### Master Agent Workflow

```
User Request: "Our deployment process is too slow and error-prone"

Master Agent Analysis:
- Non-technical problem requiring structured analysis
- May lead to technical implementation
- Requires Thinking and potentially Coding skills

Workflow Execution:

1. Thinking Assistant
   → Applies root cause analysis (5 Whys)
   → Identifies: Manual deployment steps, no CI/CD, lack of testing
   → Recommends: Implement CI/CD pipeline

2. Code Documentation Assistant
   → Creates ADR-004: CI/CD Strategy
   → Documents decision to use GitHub Actions
   → Records alternatives considered

3. Coding Assistant
   → Implements CI/CD pipeline
   → Creates GitHub Actions workflows
   → Sets up automated testing
   → Configures deployment automation

4. Code Review Assistant
   → Reviews CI/CD configuration
   → Validates security (secrets management)
   → Checks pipeline efficiency

5. Daily Logging Assistant
   → Documents problem analysis
   → Records CI/CD implementation
   → Tracks deployment improvements
```

### Output
- Root cause analysis
- ADR-004: CI/CD Strategy
- CI/CD pipeline implementation
- Code review approval
- Daily log entries

---

## Example 8: Presentation for Stakeholders

### Scenario
User needs to present Sprint results to executives.

### Master Agent Workflow

```
User Request: "Create a presentation about our Q4 Sprint results"

Master Agent Analysis:
- Business presentation task
- May need data from Agile Scrum Assistant
- Presentation Assistant handles creation

Workflow Execution:

1. Agile Scrum Assistant
   → Provides Sprint metrics (velocity, completed stories)
   → Shares Sprint review data
   → Identifies key achievements

2. Presentation Assistant
   → Creates executive presentation
   → Applies McKinsey frameworks (invisibly)
   → Structures data-driven insights
   → Focuses on decision-enabling content

3. Daily Logging Assistant (optional)
   → Documents presentation creation
   → Records stakeholder communication
```

### Output
- Sprint metrics and data
- Executive presentation slides
- Daily log entry (optional)

---

## Best Practices Demonstrated

These examples demonstrate:

1. **Context Preservation**: Information flows between skills
2. **Quality Gates**: Review and documentation at appropriate stages
3. **Workflow Optimization**: Right skills in right order
4. **Boundary Respect**: Each skill used for its intended purpose
5. **User Communication**: Clear workflow explanation

## Common Patterns

### Pattern: Feature Development
Thinking → Documentation (ADR) → Coding → Review → Documentation (API) → Logging

### Pattern: Bug Fix
Thinking (root cause) → Coding → Review → Documentation → Logging

### Pattern: Architecture Decision
Thinking → Documentation (ADR) → Coding → Review → Documentation

### Pattern: Sprint Work
Agile → Coding → Review → Logging

### Pattern: Speckit Workflow
Speckit (constitution) → Speckit (spec) → Speckit (plan) → Speckit (tasks) → Coding → Review

---

**Version**: 1.0  
**Last Updated**: 2025-01-04

