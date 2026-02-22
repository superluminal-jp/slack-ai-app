# Feature Specification: Verification Agent Iterative Multi-Agent Reasoning

**Feature Branch**: `036-iterative-reasoning`
**Created**: 2026-02-21
**Status**: Draft
**Input**: User description: "verification agentはタスクが完了するまで繰り返し推論を行えるように改善。AWS, Strands AgentsのMCPを活用。ベストプラクティスに従った実装を検討。現状一回の処理で一つのエージェントしか呼び出せないので、複数のエージェントにリクエストを送って総合した結果が出せるようにしたい。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cross-Domain Request Answered by Multiple Agents (Priority: P1)

A Slack user submits a request that spans multiple specialist domains — for example, "今の時刻と、この週のAWS障害情報と、該当するドキュメントリンクをまとめて". Currently the verification agent routes to exactly one execution agent and ignores the other domains entirely. With this feature, the agent dispatches sub-tasks to multiple specialist agents simultaneously, collects all responses, and delivers a single synthesized reply covering every part of the request.

**Why this priority**: This removes the hardest current limitation — one agent per request. It unlocks compound answers that are impossible today and provides immediate, visible value to users.

**Independent Test**: Submit a request requiring at least two different specialist agents (e.g., time + docs). Verify the final Slack reply includes content from both, combined into a coherent answer.

**Acceptance Scenarios**:

1. **Given** a user's request spans two or more specialist domains, **When** the request is processed, **Then** the agent dispatches sub-tasks to all relevant agents and returns a single reply synthesizing all results.
2. **Given** one of the dispatched agents fails or times out, **When** its result is collected, **Then** the system includes the successful results in the reply and notes the partial failure to the user — it does not discard everything.
3. **Given** all dispatched agents fail, **When** all results are collected, **Then** the agent returns a clear error message rather than an empty or misleading reply.
4. **Given** two agents return overlapping or contradictory information, **When** the agent synthesizes results, **Then** it resolves or explicitly surfaces the conflict rather than silently picking one answer.

---

### User Story 2 — Complex Task Completes Without User Retry (Priority: P2)

A Slack user submits a complex, multi-step request (e.g., "AWSのLambdaコールドスタートのベストプラクティスを調査して要点をまとめて"). Currently the agent answers in a single pass and may return a shallow or incomplete result. With this feature, the agent iterates internally across multiple reasoning cycles — dispatching to agents, evaluating outputs, and refining — until the response genuinely satisfies the original request, all within a single Slack interaction.

**Why this priority**: This is the core value of the feature. Users experience task completion without follow-up. All other stories build on this loop.

**Independent Test**: Submit a multi-step research question in Slack. Observe that the final reply is complete and substantiated without the user needing to send any follow-up message.

**Acceptance Scenarios**:

1. **Given** a user sends a complex multi-step question in Slack, **When** the request is processed, **Then** the agent iterates internally and returns a single, complete answer without requiring the user to ask a follow-up.
2. **Given** the agent's first reasoning pass produces an incomplete result, **When** the agent evaluates the output against the original request, **Then** it continues iterating until the result meets the task's intent.
3. **Given** the agent reaches the configured maximum turn count without a complete result, **When** the limit is hit, **Then** it returns the best partial result with a clear explanation to the user.

---

### User Story 3 — Agent Self-Corrects on Execution Failure (Priority: P3)

A Slack user submits a task where one or more dispatched execution agents return errors or unusable results. Instead of surfacing raw errors to the user, the verification agent detects the issue and retries with a refined approach or routes to an alternative agent, taking advantage of the iterative reasoning loop.

**Why this priority**: Improves end-to-end reliability. Depends on both multi-agent dispatch (P1) and iterative reasoning (P2).

**Independent Test**: Simulate one execution agent returning an error while another succeeds. Verify the verification agent retries the failed sub-task and the user receives a complete reply.

**Acceptance Scenarios**:

1. **Given** a dispatched agent returns an error, **When** the verification agent evaluates the collected results, **Then** it retries that sub-task — with adjusted parameters or a different target agent — in a subsequent reasoning cycle.
2. **Given** all retry attempts for a sub-task fail, **When** the maximum turn count is reached, **Then** the agent returns a user-friendly message describing which parts succeeded and which failed.

---

### Edge Cases

- What if the agent dispatches to multiple agents and all return conflicting answers? → The synthesizing step explicitly presents the conflict or selects the most authoritative source; it never silently drops responses.
- What if dispatching to many agents causes the total response to exceed Slack's message size limits? → The synthesized reply is summarized to fit; full details are included as a structured attachment or truncated with a note.
- What happens when the agentic loop detects a cycle (identical tool calls with identical parameters repeated across turns)? → The system detects the repeated pattern and terminates with a partial result rather than consuming remaining turns.
- What if the model never judges the task complete and keeps calling tools? → The maximum turn count acts as a hard stop; the agent returns its best-effort synthesized result.
- What if the total reasoning duration exceeds the Slack interaction timeout? → The system enforces a wall-clock timeout aligned with the existing async response mechanism; the user receives whatever was produced within the time budget.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The verification agent MUST be capable of dispatching a single user request to multiple execution agents within one reasoning cycle.
- **FR-002**: The system MUST collect all agent responses and synthesize them into a single, coherent reply before returning to the user.
- **FR-003**: The system MUST handle partial dispatch failures gracefully — if some agents succeed and others fail, the successful results MUST be included in the reply with a note about the failed parts.
- **FR-004**: The system MUST perform multiple reasoning cycles per request, continuing until a completion condition is met or the maximum turn count is reached.
- **FR-005**: The system MUST evaluate task completion after each reasoning cycle by assessing whether the synthesized output satisfies the intent of the original user request.
- **FR-006**: The system MUST enforce a configurable maximum loop turn count (default: 5) to prevent unbounded loops.
- **FR-007**: The system MUST carry forward accumulated context from each cycle — including all agent results and prior synthesized outputs — into subsequent cycles.
- **FR-008**: The system MUST maintain per-request isolation: no reasoning state or intermediate context may leak between concurrent user requests.
- **FR-009**: The system MUST emit structured logs for each reasoning cycle, recording at minimum: cycle number, agents dispatched, results received, and the completion evaluation outcome.
- **FR-010**: When the maximum turn count is reached without full task completion, the system MUST return a user-facing message with the best partial synthesized result and an explanation.

### Key Entities

- **Agentic Loop**: The single underlying mechanism that realizes both iterative reasoning and multi-agent dispatch. Each loop turn represents one round of model inference followed by zero or more tool calls. The loop continues until the model produces a final answer (no further tool calls), or the turn limit is reached.
- **Loop Turn (Vertical dimension)**: One iteration of the agentic loop. Iterative reasoning is the accumulation of multiple turns — the model reasons, evaluates partial results, and decides to continue.
- **Tool Call Set (Horizontal dimension)**: The set of tool calls the model issues within a single turn. Multi-agent dispatch occurs when this set contains two or more execution-agent calls, which can be executed concurrently.
- **Synthesized Result**: The unified output produced when the model combines all tool results within a turn (and across turns) into a final response. This is what the user receives.
- **Turn Limit**: The configurable maximum number of loop turns permitted per request before forced termination.
- **Accumulated Context**: The growing record of all prior turns — model inferences, tool calls, and results — carried forward into each subsequent turn.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Requests spanning two or more specialist domains return answers covering all domains in a single Slack reply — verified across a representative set of cross-domain test cases.
- **SC-002**: When one dispatched agent fails, the user still receives results from the remaining agents — partial-failure graceful handling holds in 100% of tested cases.
- **SC-003**: Complex multi-step tasks that previously required user follow-up complete successfully in a single Slack invocation at least 80% of the time.
- **SC-004**: All requests — including multi-agent dispatch and iterative reasoning — complete within the existing async response time budget; no new Slack timeout failures are introduced.
- **SC-005**: The agentic loop never exceeds the configured maximum turn count — zero instances of unbounded iteration occur in any environment.
- **SC-006**: Every reasoning cycle emits a structured log entry — 100% of cycles are observable with cycle number, agents dispatched, results received, and completion evaluation result.
- **SC-007**: First-attempt task completion rate (no user retry needed) improves measurably over the single-pass, single-agent baseline.

---

## Assumptions

- **Iterative reasoning (vertical) and multi-agent dispatch (horizontal) are two dimensions of the same agentic loop — not two separate features requiring separate implementations.** Iterative reasoning is the loop repeating across multiple turns; multi-agent dispatch is the model issuing multiple agent-call tools within a single turn. Both emerge naturally from a standard agentic loop and require no distinct mechanisms.
- "Task completion" is judged by the reasoning model itself: when the model produces a final answer without issuing further tool calls, the loop ends. No explicit external completion signal is required.
- The existing async response mechanism (SQS enqueue → Slack post) is sufficient to deliver results; no new streaming or push infrastructure is required.
- The maximum turn count default of 5 is sufficient for the majority of real-world tasks; this value is tunable via environment variable without code changes.
- Concurrent requests are handled independently; each request maintains its own isolated agentic loop context with no shared mutable state.
- The verification agent continues to delegate heavy execution work (file creation, web fetches, time queries) to specialist execution agents — the agentic loop augments orchestration, not execution.
