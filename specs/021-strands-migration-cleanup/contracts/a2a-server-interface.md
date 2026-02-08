# Contract: A2A Server Interface (strands-agents)

**Date**: 2026-02-08
**Applies to**: Verification Agent, Execution Agent

## Endpoints

### POST `/` (A2A Protocol Root)

**Handled by**: strands-agents `A2AServer` (自動登録)

Request:
```json
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "id": "req-001",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {"type": "text", "text": "Hello"}
      ]
    }
  }
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "id": "task-uuid",
    "status": {
      "state": "completed"
    },
    "artifacts": [
      {
        "parts": [
          {"type": "text", "text": "Response text"}
        ]
      }
    ]
  }
}
```

### GET `/.well-known/agent-card.json`

**Handled by**: strands-agents `A2AServer` (自動生成)

Response:
```json
{
  "name": "Verification Agent",
  "description": "...",
  "url": "http://127.0.0.1:9000/",
  "version": "1.0.0",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false
  },
  "skills": [...]
}
```

### GET `/ping`

**Handled by**: FastAPI wrapper (手動登録)

Response:
```json
{
  "status": "healthy"
}
```

## Port

- **9000**: A2A protocol (strands-agents デフォルト、AgentCore 契約準拠)

## IAM Permissions

### CloudWatch Metrics

```json
{
  "Effect": "Allow",
  "Action": ["cloudwatch:PutMetricData"],
  "Resource": ["*"],
  "Condition": {
    "StringLike": {
      "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"]
    }
  }
}
```
