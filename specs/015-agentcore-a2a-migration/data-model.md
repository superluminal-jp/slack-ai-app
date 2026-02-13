# Data Model: AgentCore A2A Migration

**Branch**: `015-agentcore-a2a-migration` | **Date**: 2026-02-08

This feature does not introduce new domain entities or storage schema. It removes legacy infrastructure and preserves existing data and configuration.

---

## Preserved Entities (No Schema Changes)

| Entity | Location | Purpose |
|--------|----------|---------|
| TokenStorage (DynamoDB) | Verification Stack | OAuth token storage for Slack |
| EventDedupe (DynamoDB) | Verification Stack | Event deduplication |
| ExistenceCheckCache (DynamoDB) | Verification Stack | Existence check cache |
| WhitelistConfig (DynamoDB) | Verification Stack | Authorization whitelist |
| RateLimit (DynamoDB) | Verification Stack | Rate limiting state |
| Slack Signing Secret | Secrets Manager | Request verification |
| Slack Bot Token | Secrets Manager | Slack API calls |
| Verification Agent Runtime | AgentCore | A2A server; security + Slack posting |
| Execution Agent Runtime | AgentCore | A2A server; Bedrock + file artifacts |

All validation rules, access patterns, and state transitions for these entities remain as defined in features 013 and 014. No migrations or data backfills are required.

---

## Removed Entities (Infrastructure Only)

The following are infrastructure components, not domain data. They are removed from the CDK stacks and from AWS:

| Removed Component | Previous Role | Replacement |
|-------------------|--------------|-------------|
| BedrockProcessor Lambda | Invoked by API Gateway; called Bedrock; sent result to SQS | Execution Agent (A2A) |
| ExecutionApi (API Gateway) | HTTP endpoint for Verification Lambda | A2A invocation from Verification Agent |
| ExecutionResponseQueue (SQS) | Carried execution result to Verification | A2A response path |
| SlackResponseHandler Lambda | Consumed SQS; posted to Slack | Verification Agent posts via A2A response |

No persistent data was stored in these components in a way that requires migration; responses are transient (request/response over A2A or SQS). Historical Slack messages remain in Slack and are unaffected.

---

## State Transitions

- **Before migration**: Slack event → SlackEventHandler Lambda → (USE_AGENTCORE? Verification Agent A2A : API Gateway) → (A2A: Execution Agent ; Legacy: BedrockProcessor → SQS → SlackResponseHandler) → Slack.
- **After migration**: Slack event → SlackEventHandler Lambda → Verification Agent (A2A) → Execution Agent (A2A) → Verification Agent posts to Slack. Single path; no feature flag.

No new state machines or entity lifecycles are introduced. File artifact flow (014) continues: Execution Agent produces file artifact → returned via A2A → Verification Agent posts file to Slack.
