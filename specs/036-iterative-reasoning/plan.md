# Implementation Plan: Verification Agent Iterative Multi-Agent Reasoning

**Branch**: `036-iterative-reasoning` | **Date**: 2026-02-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/036-iterative-reasoning/spec.md`

---

## Summary

Transform the verification agent's routing and execution layer from a single-pass, single-agent dispatcher into a **Strands agentic loop orchestrator** that: (1) dispatches sub-tasks to multiple execution agents in parallel within a single turn, and (2) iterates across multiple turns until the task is complete or the configured turn limit is reached. The security pipeline (existence check → whitelist → rate limit) and context enrichment phases are preserved unchanged.

---

## Technical Context

**Language/Version**: Python 3.11 (`python:3.11-slim`, ARM64 container)
**Primary Dependencies**: `strands-agents[a2a,otel]~=1.25.0`, `fastapi~=0.115.0`, `uvicorn~=0.34.0`, `boto3~=1.42.0` (no new dependencies required)
**Storage**: No new storage — DynamoDB and S3 schemas unchanged
**Testing**: `python -m pytest tests/ -v` per agent zone; TDD (Red → Green → Refactor)
**Target Platform**: AWS Bedrock AgentCore Runtime (ARM64 container)
**Project Type**: Single-zone service (verification-agent)
**Performance Goals**: All requests complete within existing 120-second async response budget
**Constraints**: Max loop turns ≤ 10; security checks remain synchronous and blocking
**Scale/Scope**: Verification agent zone only; no execution zone changes

---

## Constitution Check

*GATE: Checked against `.specify/memory/constitution.md` v1.0.1*

| Principle | Status | Notes |
|---|---|---|
| I. Spec-First | ✅ Pass | `spec.md` complete with Given/When/Then criteria |
| II. TDD | ✅ Pass | tasks.md will enforce test-first ordering; `pytest tests/ -v` per zone |
| III. Security-First | ✅ Pass | Agentic loop inserted AFTER security pipeline (post line 462 of pipeline.py); defense order preserved |
| IV. Fail-Open / Fail-Closed | ✅ Pass | A2A tool errors return structured error strings (fail open); security exceptions unchanged (fail closed) |
| V. Zone-Isolated | ✅ Pass | Verification agent remains in verification zone; execution agents unchanged; A2A protocol preserved in tool wrappers |

**No violations. Complexity Tracking table not required.**

---

## Project Structure

### Documentation (this feature)

```text
specs/036-iterative-reasoning/
├── spec.md
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── internal-orchestrator.md  ← Phase 1 output
├── checklists/
│   └── requirements.md
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code (affected files only)

```text
verification-zones/verification-agent/
├── src/
│   ├── orchestrator.py              # NEW: OrchestrationAgent class
│   ├── agent_tools.py               # NEW: per-agent @tool functions
│   ├── hooks.py                     # NEW: MaxTurnsHook, ToolLoggingHook
│   ├── pipeline.py                  # MODIFY: replace route_request() + invoke_execution_agent() section
│   ├── router.py                    # OBSOLETE: logic absorbed into orchestrator
├── cdk/
│   └── lib/verification-agent-stack.ts   # ADD: MAX_AGENT_TURNS env var
└── tests/
    ├── test_orchestrator.py         # NEW
    ├── test_agent_tools.py          # NEW
    ├── test_hooks.py                # NEW
    ├── test_pipeline.py             # MODIFY: update routing/execution assertions
    └── (existing tests unchanged)
```

**Structure Decision**: Single-zone modification (Option 1). All changes are confined to `verification-zones/verification-agent/`. No new zones or CDK stacks required.

---

## Architecture: Before and After

### Before (current)

```
Incoming A2A request
  → Security pipeline (existence → whitelist → rate limit)
  → Context enrichment (thread context, URLs, S3)
  → router.py: Strands Agent with select_agent() tool (picks ONE agent)
  → a2a_client: invoke one execution agent
  → Parse response → Slack post
```

### After (this feature)

```
Incoming A2A request
  → Security pipeline (UNCHANGED)
  → Context enrichment (UNCHANGED)
  → orchestrator.py: Strands Agent with tools:
      ├── invoke_docs_agent(task)        ← async @tool per execution agent
      ├── invoke_time_agent(task)        ← async @tool
      ├── invoke_execution_agent(task)   ← async @tool
      └── invoke_fetch_url_agent(task)   ← async @tool
    Loop: LLM decides which tools to call (1 or many per turn)
          Async tools run concurrently
          MaxTurnsHook enforces turn limit (default: 5)
          ToolLoggingHook emits structured log per tool call
          Loop ends when LLM produces final text (or hook fires)
  → OrchestrationResult → Slack post (ADAPTED, existing SQS path)
```

---

## Component Design

### `orchestrator.py` — OrchestrationAgent

```python
class OrchestrationAgent:
    def __init__(self, agent_registry: AgentRegistry, bedrock_model: BedrockModel,
                 max_turns: int = 5):
        tools = build_agent_tools(agent_registry)   # from agent_tools.py
        self._agent = Agent(
            model=bedrock_model,
            tools=tools,
            system_prompt=ORCHESTRATOR_SYSTEM_PROMPT,
            hooks=[MaxTurnsHook(max_turns), ToolLoggingHook()],
        )

    def run(self, request: OrchestrationRequest) -> OrchestrationResult:
        prompt = _build_prompt(request)
        result = self._agent(prompt, correlation_id=request.correlation_id)
        return _parse_result(result)
```

**System prompt key instructions**:
- Decompose the request into sub-tasks, assigning each to the most capable specialist agent
- Call multiple agents simultaneously when the request spans domains
- When all results are collected, synthesize a single comprehensive answer
- If an agent returns an error, retry with different parameters or note the failure in the final answer

### `agent_tools.py` — Tool Builders

```python
def build_agent_tools(registry: AgentRegistry) -> list:
    """Dynamically generate one @tool per registered execution agent."""
```

### `hooks.py` — Loop Control and Observability

```python
class MaxTurnsHook(HookProvider):
    """Enforces maximum agentic loop turns per request (FR-006)."""

class ToolLoggingHook(HookProvider):
    """Emits structured log entry for every tool call (FR-011)."""
    # Logs: turn_number, tool_name, tool_input, status, duration_ms, correlation_id
```

### `pipeline.py` — Surgical Changes

Three targeted edits:
1. **Import**: Add `from orchestrator import OrchestrationAgent`
2. **Initialization**: Build `OrchestrationAgent` once at module load (reused across requests)
3. **Replace routing block**: Lines ~568–850 (route_request + invoke_execution_agent + result handling) → `run_orchestration_loop()` call

The security pipeline (lines 1–462) and context enrichment (lines 464–502) are **not touched**.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM issues redundant tool calls (same agent twice) | Low | Low | System prompt instructs deduplication; MaxTurnsHook limits waste |
| A2A polling takes 120s × N agents, exceeding total budget | Low | High | Async concurrency means N agents run in parallel, not serially; budget unchanged |
| Existing router.py tests break | High | Low | Update test_router.py to test orchestrator instead |

---

## Key Decisions Summary

| Decision | Choice | Reference |
|---|---|---|
| Turn limit mechanism | `MaxTurnsHook` via `AfterToolCallEvent.cancel_tool` | research.md §1 |
| Parallel dispatch | Separate async `@tool` per agent; Strands runs concurrently | research.md §2 |
| Security pipeline | Unchanged; loop inserted after line 462 | research.md §4 |
| Synthesis | LLM produces final text on end_turn; no post-processing layer | research.md §6 |
