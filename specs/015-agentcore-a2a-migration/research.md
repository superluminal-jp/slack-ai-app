# Research: AgentCore A2A Migration — Legacy Infrastructure Removal

**Branch**: `015-agentcore-a2a-migration` | **Date**: 2026-02-08

---

## R-001: CloudFormation Behavior When Removing Resources from CDK

**Decision**: Removing a construct from a CDK stack causes the synthesized CloudFormation template to omit that resource. On the next stack update, CloudFormation will delete the omitted resources. No explicit "removal order" is required — CloudFormation handles dependency order for deletions (e.g., API Gateway stages/methods before the API, Lambda event source mappings before the queue).

**Rationale**: AWS CloudFormation update behavior: when the template no longer includes a resource, CloudFormation deletes it. Deletion follows reverse dependency order. CDK synthesizes the template from the construct tree; removing a construct (e.g., `BedrockProcessor`, `ExecutionApi`, `SlackResponseHandler`, `ExecutionResponseQueue`) removes the corresponding CFN resources. No Retain policy is needed for legacy components we intend to remove.

**Alternatives considered**:
- Retain resources and remove manually: Rejected; spec requires removal from CDK and from the account.
- Two-phase deploy (disable then remove): Not required; A2A is already the active path per spec assumptions.

---

## R-002: Cross-Stack Dependency After Legacy Removal

**Decision**: After migration, the only cross-stack output the Verification Stack needs from the Execution Stack is `ExecutionAgentRuntimeArn` (for A2A invocation). The Verification Stack no longer needs `ExecutionApiUrl`, `ExecutionApiArn`, `ExecutionResponseQueueUrl`, or `BedrockProcessorArn`. The Execution Stack no longer needs `verificationLambdaRoleArn` for API Gateway resource policy or `executionResponseQueueUrl` for Lambda environment. Execution Stack still needs `verificationAccountId` (and optionally Verification Agent ARN for resource policy) for AgentCore cross-account A2A.

**Rationale**: Spec FR-001 and FR-007: all traffic goes through A2A; DynamoDB and Secrets are in Verification Stack and unchanged. Execution Stack only exposes the Execution Agent Runtime ARN. Verification Stack passes `executionAgentArn` to its stack props and to the Verification Agent runtime for A2A calls.

**Alternatives considered**:
- Keeping optional legacy outputs for a transition period: Rejected; spec requires zero references to legacy components.

---

## R-003: AWS MCP for Best-Practice Validation

**Decision**: Use AWS MCP (Model Context Protocol) tools — e.g., AWS Documentation MCP, AWS Knowledge MCP, AWS IaC MCP — during implementation and in a final validation pass to:
- Validate CloudFormation/CDK templates (syntax, schema, security/compliance rules where applicable).
- Look up AWS best practices for IAM least-privilege, encryption, and observability for Lambda and AgentCore.
- Confirm regional availability and API usage for Bedrock AgentCore and related services.

**Rationale**: Spec FR-013 and SC-008 require implementation and deployment to be validated against AWS best practices using AWS MCP (or equivalent). MCP provides direct access to AWS documentation and, where integrated, to validation tools (e.g., cfn-lint, cfn-guard) for consistent application of best practices.

**Alternatives considered**:
- Manual checklist only: Does not satisfy the spec’s requirement to use AWS MCP for validation.
- Third-party scanners only: Spec explicitly calls for AWS MCP; third-party tools can complement, not replace.

---

## R-004: Feature Flag and Conditional Branch Removal Scope

**Decision**: Remove all references to `USE_AGENTCORE` and `useAgentCore` from: (1) CDK app and config (`cdk/bin/cdk.ts`, `cdk/lib/types/stack-config.ts`, `cdk/lib/types/cdk-config.ts`), (2) Execution and Verification stacks (no conditional AgentCore creation; AgentCore is always created), (3) SlackEventHandler Lambda (handler and construct — no branch; always invoke Verification Agent via AgentCore), (4) deployment scripts and docs (README, docs, scripts). Replace with unconditional A2A path only.

**Rationale**: Spec FR-006 and User Story 3: feature flag and all conditional branching must be removed so the codebase has a single path. Independent test: grep for `USE_AGENTCORE` returns zero matches in application code, CDK, and config.

**Alternatives considered**:
- Keeping the flag defaulted to true: Rejected; spec requires removal, not hiding.
- Keeping flag in docs for "historical" context: Rejected; spec says zero references in codebase; docs should describe current (A2A-only) architecture.

---

## R-005: Alarm and Monitoring Updates After Legacy Removal

**Decision**: Remove CloudWatch alarms and metrics that reference removed resources: BedrockProcessor Lambda errors, Execution API Gateway (if any), SlackResponseHandler Slack API failures. Retain or add alarms for: SlackEventHandler (whitelist, rate limit, existence check), Verification Agent Runtime, Execution Agent Runtime (if exposed via AgentCore/Bedrock). ApiGatewayMonitoring construct is removed with ExecutionApi; any dashboard or alarm that referenced the legacy API should be removed or repointed to A2A/AgentCore metrics.

**Rationale**: Spec FR-010: AgentCore runtimes must emit structured logs and metrics. Alarms tied to deleted resources would reference missing metrics and are unnecessary. Spec SC-007: operational dashboards should show request tracing from Slack through A2A to response — this is satisfied by AgentCore observability, not legacy API metrics.

**Alternatives considered**:
- Keeping legacy alarms "in case": Rejected; resources no longer exist; alarms would be invalid or never fire.
