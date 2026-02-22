# Research: Verification Agent Iterative Multi-Agent Reasoning

**Branch**: `036-iterative-reasoning` | **Date**: 2026-02-21

---

## Decision 1: Strands Agent Loop Control (max_agent_turns)

**Decision**: Implement turn limit via the Strands Hooks system using `AfterToolCallEvent`.

**Rationale**: Strands `Agent` has no built-in `max_agent_turns` constructor parameter. The `AfterToolCallEvent` hook can set `event.cancel_tool` to inject a termination message, causing the loop to produce a final answer on the next model call. This is the documented pattern.

**Implementation**:
```python
class MaxTurnsHook(HookProvider):
    def __init__(self, max_turns: int):
        self.max_turns = max_turns
        self._turn_count = 0

    def register_hooks(self, registry: HookRegistry) -> None:
        registry.add_callback(BeforeInvocationEvent, self._reset)
        registry.add_callback(AfterToolCallEvent, self._check)

    def _reset(self, event: BeforeInvocationEvent) -> None:
        self._turn_count = 0

    def _check(self, event: AfterToolCallEvent) -> None:
        self._turn_count += 1
        if self._turn_count >= self.max_turns:
            event.cancel_tool = "Maximum reasoning turns reached. Synthesize a final answer from results collected so far."
```

**Alternatives considered**:
- Wrapping `agent()` call in an external while loop: rejected because Strands manages conversation state internally; external loops break context continuity.
- Setting `max_tokens` low: rejected — this causes unrecoverable errors, not clean termination.

---

## Decision 2: Parallel Multi-Agent Dispatch

**Decision**: Define each execution agent as a separate `@tool async def` function. The LLM natively issues multiple tool calls in one turn; Strands runs all async tools concurrently.

**Rationale**: No special parallel dispatch logic is needed. The Strands SDK explicitly states: "Strands will invoke all async tools concurrently." By defining `invoke_time_agent`, `invoke_docs_agent`, `invoke_execution_agent` as separate async tools, the LLM can dispatch to all relevant agents in a single turn without extra orchestration code.

**Implementation sketch**:
```python
@tool
async def invoke_docs_agent(task: str) -> str:
    """Retrieve documentation or answer questions about technical topics."""
    return await _a2a_call(DOCS_AGENT_ARN, task)

@tool
async def invoke_time_agent(task: str) -> str:
    """Get current time or perform time-related calculations."""
    return await _a2a_call(TIME_AGENT_ARN, task)
```

The existing `a2a_client.invoke_execution_agent()` is synchronous (blocks with polling). Wrapping in `async def` with `asyncio.to_thread()` enables true concurrency.

**Alternatives considered**:
- Single `invoke_agent(agent_id, task)` tool: rejected — a single generic tool prevents the LLM from understanding each agent's capabilities via its tool docstring. Per-agent tools provide natural capability descriptions.
- Strands Graph/Swarm patterns: rejected — these are supervisor-level orchestration patterns requiring additional agent processes. Our use case (one request → multi-agent dispatch → synthesis) is better served by a single Agent with multiple tools.

---

## Decision 3: MCP Integration Strategy — OUT OF SCOPE

**Status**: Removed from scope. MCP connections to AWS/Strands documentation servers are not included in this feature. The orchestrator tool set is limited to A2A-connected execution agents only.

**Rationale for removal**: The feature delivers full value (iterative reasoning + multi-agent dispatch) through the A2A execution agent tools alone. MCP documentation integration can be added as a future enhancement.

---

## Decision 4: Security Pipeline Boundary

**Decision**: The agentic loop is inserted AFTER the existing security pipeline. Security checks remain completely unchanged.

**Rationale**: pipeline.py security checks (existence check → whitelist → rate limit) end at approximately line 462. Context enrichment (thread context, URL resolution, attachment upload) runs lines 464–502. Routing and execution begin at `route_request()` (~line 588). The new agentic loop **replaces only** `route_request()` + `invoke_execution_agent()` + the result-handling code that follows. The security and enrichment phases are not touched.

This satisfies Constitution III (Security-First) and IV (Fail-Open for Infrastructure, Fail-Closed for Security): the defense pipeline order is preserved.

```
[UNCHANGED] Existence check → Whitelist → Rate limit
[UNCHANGED] Thread context → URL resolution → S3 upload
[REPLACED]  route_request() + invoke_execution_agent()
            → OrchestrationAgent(tools=[...]).run(enriched_request)
[ADAPTED]   Response handling: synthesized text → Slack post (SQS)
```

**Alternatives considered**:
- Running the agentic loop before security: rejected — Constitution III violation. Security cannot be deferred.
- Keeping the existing router and adding a post-processing synthesis step: rejected — this does not enable true multi-agent dispatch in a single pass; the router still picks only one agent per call.

---

## Decision 5: Per-Agent Tool vs Generic Invoke Tool

**Decision**: One `@tool` function per registered execution agent, generated dynamically from the agent registry.

**Rationale**: The LLM uses tool docstrings to decide when and how to call a tool. A generic `invoke_agent(agent_id, task)` tool offers no per-agent guidance. Dynamically generating per-agent tools from agent cards (which already contain name, description, and skills) gives the LLM rich, accurate capability information with no extra maintenance.

**Implementation**:
```python
def make_agent_tool(agent_id: str, card: AgentCard):
    description = f"{card.description}\nSkills: {', '.join(s.name for s in card.skills)}"

    @tool(name=f"invoke_{agent_id.replace('-', '_')}", description=description)
    async def _invoke(task: str) -> str:
        return await asyncio.to_thread(invoke_execution_agent, agent_id, task)

    return _invoke
```

**Alternatives considered**:
- Hardcoded tool definitions: rejected — breaks when new execution agents are added; requires code changes per agent.
- Using the existing router Agent to pre-select agents, then invoking the loop: rejected — adds a redundant routing step; the orchestration agent's agentic loop subsumes routing.

---

## Decision 6: Response Synthesis

**Decision**: Synthesis is performed by the LLM itself as part of the agentic loop's final turn. No explicit post-processing synthesis layer is needed.

**Rationale**: When the LLM has collected all tool results, it produces a final text response (the "end turn" stop reason). This response IS the synthesis — the model integrates all agent outputs into one coherent answer. The existing response-handling code (Slack post via SQS) receives this synthesized text unchanged.

**System prompt guidance** (in orchestrator system prompt):
> "When you have collected results from all relevant agents, produce a single, comprehensive answer that integrates all findings. Clearly attribute which information came from which specialist."

**File artifact handling**: If any execution agent returns a `file_artifact`, the tool wrapper extracts it and returns both the text and a reference marker. The orchestrator system prompt instructs the agent to pass file references through to the final response for the existing pipeline to handle.

---

## Resolved: All NEEDS CLARIFICATION Items

| Item | Resolution |
|---|---|
| How to limit loop turns | Hooks: `MaxTurnsHook` via `AfterToolCallEvent.cancel_tool` |
| How parallel dispatch works | LLM issues multiple tool calls per turn; async tools run concurrently |
| MCP integration | OUT OF SCOPE — A2A execution agents only for this feature |
| Where to insert agentic loop | After security pipeline and context enrichment, replacing router + executor |
| How synthesis happens | LLM produces final text on "end turn"; no separate synthesis layer needed |
