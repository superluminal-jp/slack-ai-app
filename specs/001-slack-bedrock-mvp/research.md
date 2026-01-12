# Research: Slack Bedrock MVP

**Feature**: 001-slack-bedrock-mvp
**Date**: 2025-11-30
**Purpose**: Resolve technical clarifications and establish best practices for MVP implementation

## Overview

This document resolves NEEDS CLARIFICATION items from the Technical Context and establishes implementation patterns for the Slack-Bedrock integration MVP.

## Research Tasks

### 1. Storage Strategy for Workspace Tokens

**Question**: DynamoDB for workspace tokens, but constitution requires DynamoDB with KMS encryption for context history (deferred for MVP?)

**Decision**: Use DynamoDB without KMS encryption for workspace tokens only

**Rationale**:
- **Constitution requirement**: KMS encryption mandated for context history containing PII/sensitive data
- **MVP scope**: Context history explicitly deferred (single-turn interactions only)
- **Workspace tokens**: OAuth tokens are secrets but:
  - Stored temporarily (not long-term retention like chat history)
  - DynamoDB encryption at rest is enabled by default (AWS managed keys)
  - KMS customer-managed keys add operational complexity (key rotation, IAM policies)
  - MVP operates in single test workspace (limited blast radius)
- **Post-MVP path**: When implementing context history, create separate DynamoDB table with KMS CMK

**Implementation**:
```
DynamoDB Table: slack-workspace-tokens
- Partition Key: team_id (Slack workspace ID)
- Attributes: bot_token, installation_timestamp
- Encryption: AWS managed keys (default)
- TTL: Not required for MVP (manual cleanup acceptable)
```

**Alternatives Considered**:
- **AWS Secrets Manager**: Better for secret rotation, but over-engineered for MVP (adds latency, cost)
- **SSM Parameter Store**: Similar benefits to Secrets Manager, rejected for same reason
- **KMS CMK from start**: Violates MVP principle of deferring best practices; adds key management burden

---

### 2. Testing Strategy for MVP

**Question**: pytest for Python, but BDD test scenarios required by constitution for security features

**Decision**: Manual testing for MVP, pytest unit tests for critical security functions only

**Rationale**:
- **Constitution requirement**: "BDD test scenarios (Gherkin) for security-critical features"
- **MVP constraint**: Spec explicitly defers "Comprehensive unit tests and integration tests"
- **Security-critical scope**: HMAC SHA256 signature verification is the only security feature retained in MVP
- **Pragmatic approach**: Write pytest unit tests for signature verification logic; defer BDD for post-MVP

**Implementation**:
```
Tests required for MVP:
1. lambda/verification-stack/slack-event-handler/tests/test_slack_verifier.py
   - Valid signature verification
   - Invalid signature rejection
   - Timestamp validation (±5 minutes window)
   - Replay attack prevention

2. Manual end-to-end testing:
   - Install bot in test workspace
   - Send direct message → verify AI response
   - Mention bot in channel → verify AI response
   - Trigger error conditions → verify user-friendly messages
```

**BDD scenarios deferred to post-MVP**:
```gherkin
# Example deferred until post-MVP (when Guardrails implemented)
Feature: Prompt Injection Protection
  Scenario: Detect and block prompt injection attempt
    Given a user sends message "Ignore previous instructions and..."
    When the system analyzes the prompt
    Then the Guardrails service blocks the request
    And the user receives "Your message contains unsafe content"
```

**Alternatives Considered**:
- **Full BDD test suite**: Rejected per spec's explicit deferral of comprehensive testing
- **No tests at all**: Too risky; signature verification is security gate
- **Integration tests only**: Unit tests faster and cheaper (no AWS infrastructure required)

---

### 3. Bedrock Model Selection

**Question**: Which Bedrock model to use for AI responses?

**Decision**: Amazon Bedrock Claude 3 Haiku (anthropic.claude-3-haiku-20240307-v1:0)

**Rationale**:
- **Performance**: Fast inference (typically 1-3 seconds for short responses)
- **Cost**: Most economical Claude model (~$0.25 per million input tokens)
- **Capability**: Sufficient for conversational responses in MVP
- **Availability**: Generally available in most AWS regions with Bedrock
- **MVP constraint**: 10-second response time requirement → fast model essential

**Implementation**:
```python
# lambda/execution-stack/bedrock-processor/bedrock_client.py
MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"
MAX_TOKENS = 1024  # Sufficient for typical Slack responses
TEMPERATURE = 1.0  # Default conversational temperature
```

**Alternatives Considered**:
- **Claude 3 Sonnet**: Better quality but 2-3x slower and more expensive; overkill for MVP
- **Claude 3 Opus**: Highest quality but slowest and most expensive; would violate 10-second constraint
- **Titan Text**: Cheaper but lower quality; poor user experience
- **Model selection per user**: Deferred per spec "Custom model selection per user" out of scope

---

### 4. Async Processing Pattern Details

**Question**: How to implement async pattern within Slack's 3-second timeout?

**Decision**: Lambda direct invocation with Event type (fire-and-forget)

**Rationale**:
- **Slack constraint**: Must respond to event within 3 seconds
- **Bedrock latency**: Varies based on model, input length, and load conditions (unpredictable; note: design-time estimate was 5-30 seconds per constitution)
- **Pattern**: Slack Event Handler acknowledges immediately, invokes Bedrock Processor asynchronously, Bedrock Processor posts to response_url

**Implementation Flow**:
```
1. Slack Event → API Gateway → Slack Event Handler (slack-event-handler)
2. Slack Event Handler validates signature (< 100ms)
3. Slack Event Handler returns 200 OK to Slack (< 1 second total)
4. Slack Event Handler invokes Bedrock Processor (bedrock-processor) with Event type
5. Bedrock Processor executes asynchronously:
   - Calls Bedrock API (processing time varies, unpredictable; note: design-time estimate was 5-30 seconds)
   - Posts response to Slack response_url
   - No response to Slack Event Handler
```

**CDK Configuration**:
```typescript
// Slack Event Handler invokes Bedrock Processor asynchronously
const bedrockProcessor = new lambda.Function(/* ... */);
bedrockProcessor.grantInvoke(slackEventHandler);

// In Slack Event Handler handler.py
lambda_client.invoke(
    FunctionName=BEDROCK_PROCESSOR_ARN,
    InvocationType='Event',  # Async fire-and-forget
    Payload=json.dumps(event_payload)
)
```

**Alternatives Considered**:
- **SQS Queue**: More robust (retries, DLQ) but adds latency and complexity; over-engineered for MVP
- **Step Functions**: Excellent for orchestration but requires workflow definition; violates MVP simplicity
- **SNS Topic**: Adds unnecessary pub/sub layer for 1:1 Lambda communication
- **Synchronous Lambda invoke**: Would timeout; violates Slack 3-second constraint

---

### 5. Slack API Event Subscription Method

**Question**: How to receive Slack events - Event Subscriptions API, Socket Mode, or other?

**Decision**: Slack Event Subscriptions API with Lambda Function URL

**Rationale**:
- **Event Subscriptions API**: Standard HTTP webhook pattern
- **Lambda Function URL**: Simplest AWS endpoint (no API Gateway needed for MVP)
- **Compatibility**: Works with free Slack workspaces
- **Simplicity**: No WebSocket management (as required by Socket Mode)

**Implementation**:
```typescript
// CDK: Enable Function URL for Slack Event Handler
const slackEventHandler = new lambda.Function(/* ... */);
const functionUrl = slackEventHandler.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE, // Slack signature verification in code
});

// Configure in Slack App Manifest:
event_subscriptions:
  request_url: <Lambda Function URL>
  bot_events:
    - message.im        # Direct messages
    - app_mention       # Channel mentions
```

**Slack Events to Subscribe**:
- `message.im`: Direct messages to bot
- `app_mention`: Bot mentioned in channel with @bot_name

**Alternatives Considered**:
- **Socket Mode**: Requires WebSocket connection management; more complex than HTTP webhook
- **API Gateway + Lambda**: More features (rate limiting, usage plans) but over-engineered for MVP
- **Slack RTM API**: Deprecated; not recommended
- **Slash Commands**: Different use case; spec focuses on conversational messages

---

### 6. Error Handling User Messages

**Question**: What user-friendly messages to return for different error conditions?

**Decision**: Define standard error messages for common failure modes

**Rationale**:
- Spec requirement: "System MUST return user-friendly error messages when Bedrock fails" (FR-011)
- User Story 3 (P2): "Graceful error handling"
- Avoid technical jargon; provide actionable guidance

**Error Message Catalog**:

| Error Condition | User Message | Technical Detail (CloudWatch only) |
|-----------------|--------------|-----------------------------------|
| Bedrock API timeout | "Sorry, the AI service is taking longer than usual. Please try again in a moment." | BedrockTimeoutException |
| Bedrock throttling | "The AI service is currently busy. Please try again in a minute." | ThrottlingException |
| Bedrock model access denied | "I'm having trouble connecting to the AI service. Please contact your administrator." | AccessDeniedException |
| Invalid Bedrock response | "I received an unexpected response from the AI service. Please try again." | ValidationException |
| Empty user message | "Please send me a message and I'll respond! For example, 'Hello' or 'What can you do?'" | EmptyMessageException |
| Slack API error posting response | "I processed your request but couldn't send the response. Please check your Slack connection." | SlackApiError |
| Generic unexpected error | "Something went wrong. I've logged the issue and will try to fix it. Please try again later." | UnhandledException |

**Implementation**:
```python
# lambda/execution-stack/bedrock-processor/handler.py
ERROR_MESSAGES = {
    "bedrock_timeout": "Sorry, the AI service is taking longer than usual...",
    "bedrock_throttling": "The AI service is currently busy...",
    # ...
}

try:
    response = bedrock_client.invoke_model(...)
except ClientError as e:
    error_code = e.response['Error']['Code']
    user_message = ERROR_MESSAGES.get(error_code, ERROR_MESSAGES['generic'])
    post_to_slack(user_message)
    logger.error(f"Bedrock error: {error_code}", exc_info=True)
```

**Alternatives Considered**:
- **Technical error messages**: Rejected; confuses non-technical users
- **Silent failures**: Rejected; violates "100% feedback" success criterion (SC-004)
- **Retry logic**: Deferred per spec "Production-grade retry logic" out of scope

---

### 7. Slack App Installation Flow

**Question**: How to handle OAuth installation and token storage?

**Decision**: Slack OAuth v2 flow with Lambda Function URL and DynamoDB token storage

**Rationale**:
- **Standard pattern**: Slack recommends OAuth v2 for distributable apps
- **Token security**: Store `bot_token` (xoxb-*) only; user tokens not needed for bot-only app
- **Simplicity**: Single Lambda for OAuth callback; no session management

**Implementation Flow**:
```
1. User clicks "Add to Slack" button with OAuth URL:
   https://slack.com/oauth/v2/authorize?client_id=...&scope=chat:write,im:history,app_mentions:read

2. User authorizes → Slack redirects to Lambda Function URL:
   <Lambda OAuth Handler URL>?code=<auth_code>

3. Lambda OAuth Handler:
   - Exchanges code for bot_token via slack.oauth.v2.access
   - Stores team_id + bot_token in DynamoDB
   - Returns success page or redirects to Slack

4. Bot is now installed and ready to receive events
```

**CDK Infrastructure**:
```typescript
// Separate Lambda for OAuth (or reuse slack-event-handler with path routing)
const oauthHandler = new lambda.Function(/* ... */);
const oauthUrl = oauthHandler.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,
});

// DynamoDB table
const tokenTable = new dynamodb.Table(this, 'WorkspaceTokens', {
  partitionKey: { name: 'team_id', type: dynamodb.AttributeType.STRING },
  encryption: dynamodb.TableEncryption.AWS_MANAGED, // Default encryption
});
```

**Slack App Manifest OAuth Settings**:
```yaml
oauth_config:
  redirect_urls:
    - <Lambda OAuth Handler URL>
  scopes:
    bot:
      - chat:write          # Send messages
      - im:history          # Read DMs (for message.im event)
      - app_mentions:read   # Read mentions
```

**Alternatives Considered**:
- **Manual token configuration**: No OAuth flow; admin manually adds token to env vars. Simpler but poor UX for multi-workspace (not needed for single-workspace MVP).
- **Slack App Directory distribution**: Requires OAuth; deferred for MVP (manual installation in test workspace acceptable).

---

## Technology Stack Summary

Based on research above:

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| Infrastructure | AWS CDK | 2.x | User-specified requirement |
| IaC Language | TypeScript | 5.x | User-specified requirement |
| Runtime | Python | 3.11 | User-specified requirement; Lambda-compatible |
| Slack SDK | slack-sdk (Python) | 3.x | Official Slack SDK for Python |
| AWS SDK | boto3 | 1.x | Standard AWS SDK for Python (Bedrock support) |
| Bedrock Model | Claude 3 Haiku | anthropic.claude-3-haiku-20240307-v1:0 | Fast, economical, meets 10-second constraint |
| Storage | DynamoDB | N/A | Serverless, fast, AWS-managed encryption |
| Event Delivery | Lambda Function URL | N/A | Simplest endpoint for Slack webhooks |
| Async Processing | Lambda Event Invocation | N/A | Fire-and-forget pattern for background processing |
| Signature Verification | HMAC SHA256 | Built-in (hashlib) | Slack standard; security requirement |

## Open Questions for Implementation Phase

The following questions remain but do not block Phase 1 design:

1. **Bedrock region availability**: Confirm Bedrock + Claude 3 Haiku available in target AWS region (e.g., us-east-1, us-west-2)
2. **Slack workspace for testing**: Identify test workspace and create Slack App
3. **AWS account Bedrock access**: Confirm Bedrock enabled and model access requested via AWS Console
4. **CDK deployment configuration**: Determine AWS account/region for deployment

These will be resolved during implementation (`/speckit.implement` phase).

## References

- [Slack Events API Documentation](https://api.slack.com/events-api)
- [Slack OAuth v2 Guide](https://api.slack.com/authentication/oauth-v2)
- [AWS Bedrock Claude Models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html)
- [Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [DynamoDB Encryption at Rest](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html)
