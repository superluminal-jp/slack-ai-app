# Skill Routing Guide

This guide helps the Master Agent determine which skill(s) to use for different types of requests.

## Quick Decision Matrix

| Request Type | Primary Skill | Secondary Skills | Workflow |
|-------------|--------------|------------------|----------|
| Implement feature | coding-assistant | thinking-assistant, code-documentation-assistant, code-review-assistant | Thinking → ADR → Coding → Review → Docs |
| Fix bug | coding-assistant | thinking-assistant (if complex), code-review-assistant | Root Cause → Coding → Review |
| Review code | code-review-assistant | coding-assistant (if fixes needed) | Review → Fix → Re-review |
| Create ADR | code-documentation-assistant | thinking-assistant (if analysis needed) | Analysis → ADR |
| Write API docs | code-documentation-assistant | - | Documentation |
| Sprint planning | agile-scrum-assistant | - | Planning |
| User stories | agile-scrum-assistant | - | Story creation |
| Daily log | daily-logging-assistant | - | Logging |
| Business presentation | presentation-assistant | agile-scrum-assistant (for data) | Data → Presentation |
| Problem-solving | thinking-assistant | - | Analysis |
| Speckit workflow | github-speckit | coding-assistant, code-review-assistant | Spec → Plan → Code → Review |

## Detailed Routing Logic

### 1. Coding Tasks

**Keywords**: implement, code, write, build, create feature, add functionality, fix bug, refactor

**Primary Skill**: `coding-assistant`

**When to add secondary skills**:
- Complex requirements → Add `thinking-assistant` first
- Architecture decision needed → Add `code-documentation-assistant` for ADR
- Always → Add `code-review-assistant` after implementation

**Workflow**:
```
Complex? → thinking-assistant (analyze)
Architecture decision? → code-documentation-assistant (ADR)
coding-assistant (implement)
code-review-assistant (review)
code-documentation-assistant (API docs if needed)
```

### 2. Code Review Tasks

**Keywords**: review, audit, check code, quality check, security review

**Primary Skill**: `code-review-assistant`

**When to add secondary skills**:
- Issues found → Add `coding-assistant` to fix
- Architecture changed → Add `code-documentation-assistant` to update docs

**Workflow**:
```
code-review-assistant (review)
Issues? → coding-assistant (fix)
Architecture changed? → code-documentation-assistant (update docs)
```

### 3. Documentation Tasks

**Keywords**: document, ADR, API documentation, write docs, create spec

**Primary Skill**: `code-documentation-assistant`

**When to add secondary skills**:
- ADR needed → May need `thinking-assistant` for analysis first
- API docs → May need `coding-assistant` to understand implementation

**Workflow**:
```
ADR? → thinking-assistant (analyze) → code-documentation-assistant (ADR)
API docs? → coding-assistant (understand code) → code-documentation-assistant (docs)
```

### 4. Agile/Scrum Tasks

**Keywords**: sprint, user story, backlog, planning, retrospective, velocity

**Primary Skill**: `agile-scrum-assistant`

**When to add secondary skills**:
- Complex stories → Add `thinking-assistant` for analysis
- Implementation needed → Add `coding-assistant` after planning

**Workflow**:
```
agile-scrum-assistant (planning/stories)
Complex? → thinking-assistant (analyze)
Implementation? → coding-assistant (implement)
```

### 5. Daily Logging Tasks

**Keywords**: log, daily log, document decision, track blocker, ALCOA

**Primary Skill**: `daily-logging-assistant`

**Workflow**:
```
daily-logging-assistant (create log)
```

### 6. Presentation Tasks

**Keywords**: presentation, slides, executive summary, business presentation

**Primary Skill**: `presentation-assistant`

**When to add secondary skills**:
- Needs data → Add `agile-scrum-assistant` for metrics

**Workflow**:
```
Need data? → agile-scrum-assistant (metrics)
presentation-assistant (create slides)
```

### 7. Problem-Solving Tasks

**Keywords**: solve problem, analyze, root cause, strategic decision, organizational issue

**Primary Skill**: `thinking-assistant`

**When to add secondary skills**:
- Leads to implementation → Add `coding-assistant`
- Leads to architecture decision → Add `code-documentation-assistant`

**Workflow**:
```
thinking-assistant (analyze)
Implementation needed? → coding-assistant
Architecture decision? → code-documentation-assistant (ADR)
```

### 8. Speckit Workflow Tasks

**Keywords**: speckit, spec-first, constitution, specification, /speckit.*

**Primary Skill**: `github-speckit`

**Workflow**:
```
github-speckit (constitution → spec → plan → tasks)
coding-assistant (implement)
code-review-assistant (review)
```

## Multi-Skill Workflow Patterns

### Pattern 1: New Feature (Full Cycle)

**Trigger**: "Add [feature] to [system]"

**Workflow**:
1. `thinking-assistant` - Analyze requirements
2. `code-documentation-assistant` - Create ADR (if architecture decision)
3. `coding-assistant` - Implement feature
4. `code-review-assistant` - Review code
5. `code-documentation-assistant` - Create API docs
6. `daily-logging-assistant` - Document work

### Pattern 2: Bug Fix

**Trigger**: "Fix [bug description]" or "Bug in [component]"

**Workflow**:
1. `thinking-assistant` - Root cause analysis (if complex)
2. `coding-assistant` - Fix bug
3. `code-review-assistant` - Review fix
4. `code-documentation-assistant` - Update docs (if needed)

### Pattern 3: Architecture Decision

**Trigger**: "Decide on [technology/approach]" or "Choose [option]"

**Workflow**:
1. `thinking-assistant` - Analyze alternatives
2. `code-documentation-assistant` - Create ADR
3. `coding-assistant` - Implement (if immediate)
4. `code-review-assistant` - Validate architecture

### Pattern 4: Sprint Planning + Implementation

**Trigger**: "Plan Sprint and implement [features]"

**Workflow**:
1. `agile-scrum-assistant` - Sprint planning
2. `agile-scrum-assistant` - Create user stories
3. `coding-assistant` - Implement stories
4. `code-review-assistant` - Review code
5. `daily-logging-assistant` - Track progress

### Pattern 5: Speckit Feature

**Trigger**: "Add [feature] using Speckit" or "/speckit.*"

**Workflow**:
1. `github-speckit` - Constitution (if new)
2. `github-speckit` - Specification
3. `github-speckit` - Technical plan
4. `github-speckit` - Tasks
5. `coding-assistant` - Implement
6. `code-review-assistant` - Review against spec

## Ambiguity Resolution

When a request could match multiple skills:

1. **Ask clarifying questions**:
   - "Do you want me to implement this or just review it?"
   - "Is this for code documentation or business presentation?"
   - "Are you planning a Sprint or implementing a feature?"

2. **Suggest workflow**:
   - "This seems like a multi-step task. I'll coordinate: [workflow]"
   - "I can help with [option A] or [option B]. Which do you prefer?"

3. **Default to most common pattern**:
   - Feature request → Full cycle workflow
   - Code change → Coding → Review
   - Documentation → Code Documentation Assistant

## Context Preservation Rules

When coordinating multiple skills:

1. **Pass relevant context**:
   - ADR decisions → Coding Assistant
   - Spec requirements → Coding Assistant
   - Review findings → Coding Assistant (for fixes)

2. **Maintain decision history**:
   - Architecture decisions in ADRs
   - Implementation choices in code comments
   - Review feedback in logs

3. **Reference previous outputs**:
   - "Following ADR-001, I'll implement..."
   - "Based on the spec, I'll create..."
   - "Addressing review feedback, I'll fix..."

## Quality Gates

Enforce at each stage:

- **Before coding**: Specifications exist (SDD)
- **After coding**: Code reviewed
- **After review**: Documentation updated (if needed)
- **After documentation**: Accuracy verified

## Error Handling

### Unclear Request

1. Ask: "Could you clarify what you need?"
2. Suggest: "I can help with [options]"
3. Propose: "Based on [context], I suggest [workflow]"

### Skill Conflict

1. Identify: "I see a conflict between [A] and [B]"
2. Explain: "Trade-offs: [explanation]"
3. Recommend: "I recommend [option] because [reason]"
4. Confirm: "Should I proceed with [option]?"

### Missing Context

1. Request: "I need [context] to proceed"
2. Reference: "Based on [previous output]"
3. Re-establish: "Let me confirm: [context]"

---

**Version**: 1.0  
**Last Updated**: 2025-01-04

