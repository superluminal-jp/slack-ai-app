# Contracts: 015 AgentCore A2A Migration

**Branch**: `015-agentcore-a2a-migration`

## Summary

This feature does **not** introduce new API contracts. It removes the legacy HTTP API (Execution API Gateway) and the SQS-based response path. The only remaining programmatic contract is the **AgentCore A2A protocol** between Verification Agent and Execution Agent, already defined and implemented in specs 013 and 014.

---

## Existing Contract (Unchanged)

| Contract | Type | Owner | Reference |
|----------|------|--------|-----------|
| AgentCore A2A (JSON-RPC 2.0, Agent Card, /ping) | Agent-to-Agent | Execution Agent / Verification Agent | `specs/013-agentcore-a2a-zones/research.md`, AWS Bedrock AgentCore A2A documentation |

- **Verification Agent** → **Execution Agent**: A2A invocation (SigV4); request/response and async task handling per AWS A2A spec.
- **SlackEventHandler Lambda** → **Verification Agent**: `bedrock-agentcore:InvokeAgentRuntime` (SigV4); no HTTP contract exposed to Slack.

No OpenAPI or GraphQL specs are added or changed. Validation of correct implementation and best practices is performed using AWS MCP per FR-013.
