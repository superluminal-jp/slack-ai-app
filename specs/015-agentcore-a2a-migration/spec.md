# Feature Specification: AgentCore A2A Migration — Deprecate Legacy Infrastructure

**Feature Branch**: `015-agentcore-a2a-migration`
**Created**: 2026-02-08
**Status**: Draft
**Input**: User description: "AgentCore A2A アカウント通信を採用し、Lambda, API Gateway, SQSのシステムを廃止。AWS MCPを使用して正しい実装とベストプラクティスを適用"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Unified A2A Communication Path (Priority: P1)

As an operations team member, I want all Slack-to-AI communication to flow exclusively through the AgentCore A2A protocol, so that the system has a single, well-defined communication path that reduces operational complexity and eliminates redundant infrastructure.

**Why this priority**: The dual-path architecture (legacy + A2A) creates confusion about which path is active, doubles the infrastructure to monitor and maintain, and increases the attack surface. Consolidating to a single A2A path is the foundational change that enables all subsequent cleanup.

**Independent Test**: Can be fully tested by sending a Slack message and confirming the AI response arrives via the A2A path with no legacy components involved. The `USE_AGENTCORE` feature flag is no longer needed because A2A is the only path.

**Acceptance Scenarios**:

1. **Given** a Slack user sends a message to the AI bot, **When** the system processes the request, **Then** the message flows through Verification Agent → Execution Agent via AgentCore A2A protocol and the response appears in the Slack thread
2. **Given** the legacy `USE_AGENTCORE` feature flag environment variable is not set, **When** a Slack message is received, **Then** the system uses the A2A path by default (no branching logic)
3. **Given** a Slack user requests file generation, **When** the Execution Agent produces a file artifact, **Then** the file is posted to the Slack thread via the Verification Agent (existing 014 feature continues to work)

---

### User Story 2 - Legacy Infrastructure Removal (Priority: P2)

As an infrastructure engineer, I want the unused Lambda functions (BedrockProcessor, SlackResponseHandler), API Gateway (ExecutionApi), and SQS queue (ExecutionResponseQueue) removed from the CDK stacks, so that the team no longer pays for or maintains infrastructure that is not in use.

**Why this priority**: After P1 confirms the A2A path handles all traffic, the legacy components are dead code. Removing them reduces AWS costs, simplifies the CDK codebase, and eliminates potential confusion for future developers.

**Independent Test**: Can be tested by deploying the updated CDK stacks and confirming that no API Gateway, BedrockProcessor Lambda, SlackResponseHandler Lambda, or ExecutionResponseQueue SQS resources exist in the deployed CloudFormation stacks.

**Acceptance Scenarios**:

1. **Given** the CDK stacks are deployed, **When** an engineer inspects the CloudFormation resources, **Then** no API Gateway REST API, BedrockProcessor Lambda, SlackResponseHandler Lambda, or ExecutionResponseQueue SQS queue exists
2. **Given** the CDK codebase, **When** a developer searches for legacy construct references, **Then** no references to `ExecutionApi`, `BedrockProcessor`, `SlackResponseHandler`, or `ExecutionResponseQueue` constructs remain in the source code
3. **Given** the Verification Stack DynamoDB tables and Secrets Manager resources, **When** the legacy components are removed, **Then** the tables and secrets used by the A2A agents remain intact and functional

---

### User Story 3 - Clean Feature Flag Removal (Priority: P2)

As a developer, I want the `USE_AGENTCORE` feature flag and all conditional branching logic removed from the codebase, so that the code is simpler to understand, test, and maintain.

**Why this priority**: Feature flags left in code after migration is complete create confusion and increase cognitive load. Cleaning them up is essential for long-term maintainability but depends on P1 confirming A2A works as the sole path.

**Independent Test**: Can be tested by searching the entire codebase for `USE_AGENTCORE` and confirming zero matches. All code paths should be unconditionally A2A.

**Acceptance Scenarios**:

1. **Given** the codebase, **When** searching for `USE_AGENTCORE`, **Then** zero results are found in application code, CDK definitions, and configuration files
2. **Given** the SlackEventHandler Lambda, **When** it receives a Slack event, **Then** it directly invokes the Verification Agent via AgentCore without any conditional check

---

### User Story 4 - AWS Best Practices Validation via AWS MCP (Priority: P3)

As a cloud architect, I want the AgentCore A2A implementation to follow AWS best practices for security, observability, and reliability, validated using AWS MCP, so that the production system meets enterprise standards and implementation correctness is verified by AWS-backed guidance.

**Why this priority**: Once the migration is complete and legacy infrastructure is removed, validating the remaining A2A infrastructure against AWS best practices (using AWS MCP for correct implementation and best-practice application) ensures long-term operational excellence. This is an improvement pass, not a blocker for migration.

**Independent Test**: Can be tested by using AWS MCP to validate deployed stacks and run AWS Well-Architected–style checks against the A2A infrastructure, confirming compliance with security, reliability, and operational excellence pillars.

**Acceptance Scenarios**:

1. **Given** the AgentCore A2A agents, **When** cross-account communication occurs, **Then** all requests use SigV4 authentication with least-privilege IAM policies
2. **Given** the deployed CDK stacks, **When** reviewing CloudWatch configuration, **Then** all AgentCore runtimes emit structured logs, metrics, and X-Ray traces
3. **Given** the Execution Agent processing a request, **When** Bedrock returns an error, **Then** the error is handled gracefully with appropriate retry logic and the user receives a meaningful error message in Slack
4. **Given** the CDK stack definitions, **When** reviewed against AWS recommended practices (using AWS MCP for validation), **Then** all IAM policies follow least-privilege, all secrets use Secrets Manager, and all inter-service communication uses encryption in transit

---

### Edge Cases

- What happens if the Verification Agent cannot reach the Execution Agent during the A2A call? The system retries with exponential backoff and posts a user-friendly error to the Slack thread after exhausting retries.
- What happens if the CDK deployment partially fails during legacy resource removal? CloudFormation rollback restores the previous stack state; the deployment is atomic per stack.
- What happens if existing Slack threads reference responses that were posted by the legacy SlackResponseHandler? Historical messages remain in Slack; they are not affected by infrastructure changes. No data migration is needed.
- What happens if the AgentCore runtime becomes unavailable? The SlackEventHandler Lambda catches the invocation error and posts a "service temporarily unavailable" message to the user's Slack thread.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST route all Slack-to-AI requests through the AgentCore A2A protocol (Verification Agent → Execution Agent) without any alternative path
- **FR-002**: System MUST remove the `BedrockProcessor` Lambda function and its associated IAM role from the Execution Stack CDK definition
- **FR-003**: System MUST remove the `ExecutionApi` API Gateway REST API construct from the Execution Stack CDK definition
- **FR-004**: System MUST remove the `ExecutionResponseQueue` SQS queue from the Verification Stack CDK definition
- **FR-005**: System MUST remove the `SlackResponseHandler` Lambda function from the Verification Stack CDK definition
- **FR-006**: System MUST remove the `USE_AGENTCORE` feature flag and all conditional branching that references it from the SlackEventHandler Lambda and any other locations
- **FR-007**: System MUST preserve all existing DynamoDB tables, Secrets Manager secrets, and AgentCore runtime configurations during the migration
- **FR-008**: System MUST preserve the existing A2A file artifact feature (014) so that file generation and posting to Slack continue to work after migration
- **FR-009**: System MUST use SigV4 authentication for all cross-account AgentCore A2A invocations
- **FR-010**: System MUST emit structured logs and CloudWatch metrics from all AgentCore runtimes for operational visibility
- **FR-011**: System MUST handle AgentCore runtime errors gracefully and return user-friendly messages to the Slack thread
- **FR-012**: System MUST apply least-privilege IAM policies to all remaining resources, removing permissions that were only needed by legacy components
- **FR-013**: Implementation and operational practices MUST be validated against AWS best practices using AWS MCP (or equivalent AWS-backed guidance) so that correct implementation and best practices are applied consistently

### Key Entities

- **Verification Agent**: AgentCore runtime in the Verification Zone that handles security checks (existence, authorization, rate limiting) and Slack communication
- **Execution Agent**: AgentCore runtime in the Execution Zone that processes AI requests via Amazon Bedrock and returns results (text and file artifacts)
- **SlackEventHandler Lambda**: Entry point that receives Slack events and invokes the Verification Agent via AgentCore
- **Legacy Components** (to be removed): BedrockProcessor Lambda, ExecutionApi API Gateway, ExecutionResponseQueue SQS, SlackResponseHandler Lambda

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All Slack-to-AI requests complete successfully through the A2A path with no degradation in response quality or user experience
- **SC-002**: AWS infrastructure costs decrease after removing unused Lambda functions, API Gateway, and SQS queue (measurable via AWS Cost Explorer month-over-month comparison)
- **SC-003**: The CDK codebase has fewer lines of code and fewer constructs, reducing the surface area for bugs and maintenance burden
- **SC-004**: Zero references to legacy components (`ExecutionApi`, `BedrockProcessor`, `SlackResponseHandler`, `ExecutionResponseQueue`, `USE_AGENTCORE`) exist in the deployed codebase
- **SC-005**: All existing unit tests pass after migration, and any tests that referenced legacy components are either updated or removed
- **SC-006**: Cross-account communication uses authenticated, encrypted channels exclusively
- **SC-007**: Operational dashboards show complete request tracing from Slack event receipt through AI response delivery
- **SC-008**: Implementation and deployment are validated against AWS best practices using AWS MCP (or equivalent), with no critical findings remaining

## Assumptions

- The AgentCore A2A path (implemented in features 013 and 014) is production-ready and has been validated to handle all current traffic patterns
- The `USE_AGENTCORE` feature flag is currently enabled in all environments, meaning the A2A path is already the active path
- No external systems or third-party integrations depend on the legacy API Gateway endpoint
- CloudFormation handles resource deletion gracefully during stack updates (standard AWS behavior)
- The Slack Bot Token already has the necessary scopes for the A2A agents (including `files:write` from feature 014)
- Removing legacy resources from CDK will cause CloudFormation to delete those AWS resources on the next deployment
- AWS MCP will be used during implementation and validation to apply and verify correct implementation and AWS best practices (security, reliability, operational excellence)
