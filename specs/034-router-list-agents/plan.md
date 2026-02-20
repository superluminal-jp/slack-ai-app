# Implementation Plan: Agent List via Slack Reply

**Branch**: `034-router-list-agents` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)

## Summary

When a Slack user asks what the bot can do, the router LLM selects the special
`list_agents` route. The verification agent then compiles name, description, and skills
from the in-memory agent card cache and posts a plain-text Slack reply in the originating
thread. No new network calls, no new storage, and all existing security checks remain in
the pipeline.

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: strands-agents ~=1.25.0 (router LLM), slack-sdk (Slack post),
  boto3 (Bedrock AgentCore)
**Storage**: N/A — reads from existing in-memory `_AGENT_CARDS` dict; no new persistence
**Testing**: pytest (existing test suite per agent zone)
**Target Platform**: Linux container (ARM64, `python:3.11-slim`) on AWS AgentCore
**Project Type**: Single-zone modification (verification-agent only)
**Performance Goals**: No additional latency vs current routing; list compilation is
  O(n) in-memory with n ≤ 10 agents
**Constraints**: Slack text message ≤ 4000 chars; agent card cache already populated
  at startup
**Scale/Scope**: Verification agent only — no changes to execution zones

## Constitution Check

| Principle | Gate | Status |
|-----------|------|--------|
| I. Spec-First | spec.md exists with acceptance criteria before coding | ✅ PASS |
| II. TDD | Test tasks precede implementation tasks in tasks.md | ✅ PASS (enforced in tasks) |
| III. Security-First | `list_agents` handler placed after all security checks (FR-005) | ✅ PASS |
| IV. Fail-Open (infra) | Empty registry → graceful reply, no exception propagated | ✅ PASS |
| V. Zone Isolation | All changes confined to `verification-zones/verification-agent/` | ✅ PASS |

No violations. No complexity justification required.

## Project Structure

### Documentation (this feature)

```text
specs/034-router-list-agents/
├── plan.md              # This file
├── research.md          # Phase 0 findings
├── data-model.md        # Agent card schema
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (verification-agent zone)

```text
verification-zones/verification-agent/
├── src/
│   ├── router.py          # Add LIST_AGENTS_AGENT_ID + extend _build_router_system_prompt()
│   └── pipeline.py        # Add _build_agent_list_message() + list_agents branch handler
└── tests/
    ├── test_router.py     # New: routing tests (positive + negative examples)
    └── test_pipeline.py   # New: list handler + formatter tests
```

**Structure Decision**: Single-zone modification. Only the verification-agent source and
tests change. No CDK, no execution-zone files.
