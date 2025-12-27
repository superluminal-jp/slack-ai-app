# Data Model: Authenticated Communication Between Layers

**Feature**: 002-iam-layer-auth  
**Date**: 2025-01-27  
**Purpose**: Define data entities for API Gateway communication between Verification Layer and Execution Layer

## Entities

### ExecutionRequest

**Purpose**: Request payload sent from Verification Layer to Execution Layer via API Gateway

**Fields**:
- `channel` (string, required): Slack channel ID where the message was received
- `text` (string, required): User message text to process with Bedrock AI
- `bot_token` (string, required): Slack bot OAuth token for posting response
- `team_id` (string, optional): Slack workspace team ID
- `user_id` (string, optional): Slack user ID who sent the message
- `response_url` (string, optional): Slack response_url webhook URL for async response posting
- `correlation_id` (string, optional): Request correlation ID for tracing

**Validation Rules**:
- `channel` must be non-empty string
- `text` must be non-empty string
- `bot_token` must be valid Slack bot token format (starts with `xoxb-`)
- `correlation_id` must be UUID format if provided

**Example**:
```json
{
  "channel": "C01234567",
  "text": "What is the weather today?",
  "bot_token": "xoxb-EXAMPLE-TOKEN-REPLACE-WITH-ACTUAL-TOKEN",
  "team_id": "T01234567",
  "user_id": "U01234567",
  "response_url": "https://hooks.slack.com/services/TEAM/WEBHOOK/EXAMPLE",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**State Transitions**: N/A (stateless request)

---

### ExecutionResponse

**Purpose**: Response from Execution Layer Lambda function (via API Gateway)

**Fields**:
- `statusCode` (integer, required): HTTP status code (200 for success, 4xx/5xx for errors)
- `body` (string, optional): Response body (JSON string for errors, empty for async processing)

**Validation Rules**:
- `statusCode` must be valid HTTP status code (200-599)
- `body` must be valid JSON string if provided

**Example (Success - Async Processing)**:
```json
{
  "statusCode": 202,
  "body": ""
}
```

**Example (Error)**:
```json
{
  "statusCode": 400,
  "body": "{\"error\": \"Missing required field: channel\"}"
}
```

**State Transitions**: N/A (stateless response)

---

### AuthenticatedRequest

**Purpose**: HTTP request to API Gateway with IAM authentication

**Fields**:
- `method` (string, required): HTTP method (POST)
- `url` (string, required): API Gateway endpoint URL
- `headers` (object, required): HTTP headers including AWS Signature Version 4 headers
  - `Authorization` (string, required): AWS SigV4 authorization header
  - `X-Amz-Date` (string, required): Request timestamp in ISO 8601 format
  - `Content-Type` (string, required): `application/json`
  - `Host` (string, required): API Gateway hostname
- `body` (string, required): JSON-encoded ExecutionRequest payload

**Validation Rules**:
- `method` must be "POST"
- `url` must be valid API Gateway endpoint URL
- `headers.Authorization` must be valid AWS SigV4 authorization header format
- `headers.X-Amz-Date` must be valid ISO 8601 timestamp
- `body` must be valid JSON string

**Example**:
```http
POST /prod/execute HTTP/1.1
Host: abc123xyz.execute-api.ap-northeast-1.amazonaws.com
Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20250127/ap-northeast-1/execute-api/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=...
X-Amz-Date: 20250127T120000Z
Content-Type: application/json

{"channel":"C01234567","text":"Hello","bot_token":"xoxb-..."}
```

**State Transitions**: N/A (stateless request)

---

### AuthenticationError

**Purpose**: Error response from API Gateway when IAM authentication fails

**Fields**:
- `statusCode` (integer, required): HTTP status code (403 Forbidden)
- `body` (string, required): Error message body
- `headers` (object, optional): Response headers
  - `x-amzn-ErrorType` (string, optional): AWS error type
  - `x-amzn-RequestId` (string, optional): Request ID for debugging

**Validation Rules**:
- `statusCode` must be 403 for authentication failures
- `body` must contain error message

**Example**:
```json
{
  "statusCode": 403,
  "body": "{\"message\": \"User: arn:aws:iam::123456789012:role/verification-lambda-role is not authorized to perform: execute-api:Invoke on resource: arn:aws:execute-api:ap-northeast-1:123456789012:abc123xyz/prod/execute\"}",
  "headers": {
    "x-amzn-ErrorType": "AccessDeniedException",
    "x-amzn-RequestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**State Transitions**: N/A (error response)

---

## Relationships

```
Verification Layer
    |
    | (creates)
    v
AuthenticatedRequest
    |
    | (contains)
    v
ExecutionRequest
    |
    | (sent via)
    v
API Gateway (IAM authenticated)
    |
    | (invokes)
    v
Execution Layer Lambda
    |
    | (returns)
    v
ExecutionResponse
```

## Data Flow

1. **Verification Layer** receives Slack event and validates it
2. **Verification Layer** creates `ExecutionRequest` payload
3. **Verification Layer** signs request with IAM credentials to create `AuthenticatedRequest`
4. **API Gateway** validates IAM authentication and forwards `ExecutionRequest` to Execution Layer
5. **Execution Layer** processes request and returns `ExecutionResponse` (async acknowledgment)
6. **Verification Layer** receives `ExecutionResponse` and logs result

## Constraints

- Request payload size: ≤256 KB (API Gateway limit)
- Response payload size: ≤10 MB (API Gateway limit)
- Request timeout: 29 seconds (API Gateway limit, but Execution Layer processes asynchronously)
- Authentication: AWS Signature Version 4 required
- Content-Type: `application/json` required

## Migration Notes

- Current payload structure (direct Lambda invocation) is preserved
- No changes required to Execution Layer Lambda handler interface
- API Gateway Lambda proxy integration maintains backward compatibility

