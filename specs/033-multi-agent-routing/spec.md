# Feature Spec: Multi-Agent Routing (Docs Agent Split)

## Summary

Split `search_docs` from the existing Execution Agent into a dedicated Docs Agent runtime.
Verification Agent performs dynamic routing based on Agent Cards and request intent.

## Goals

- Keep existing user-visible behavior unchanged for non-doc requests.
- Route docs/spec/architecture/deployment questions to Docs Agent.
- Maintain A2A JSON-RPC contract compatibility.

## Non-Goals

- No change to Slack event ingestion architecture.
- No change to existing security pipeline semantics.

## Acceptance Criteria

1. Verification Agent supports multiple execution runtime ARNs via `EXECUTION_AGENT_ARNS`.
2. Execution Agent no longer exposes `search_docs` in tools/system prompt.
3. Docs Agent runtime exists and supports `get_agent_card` + `execute_task`.
4. Router fail-open behavior returns `default` on any routing failure.
5. Deploy script deploys Execution + Docs Execution + Verification in order.
