# Data Model: Web Fetch Agent (035-fetch-url-agent)

**Phase**: Phase 1 Output | **Date**: 2026-02-21

---

## Entities

This feature introduces no new persistent storage. The fetch-url-agent is stateless — it fetches URL content on demand and returns text. Existing DynamoDB tables (dedupe, whitelist, rate_limit, existence_check_cache) are managed exclusively by the verification-agent.

---

## Request / Response Flow

### Inbound (A2A JSON-RPC 2.0 → Fetch URL Agent)

```
InvocationRequest {
  jsonrpc: "2.0"
  method:  "execute_task"
  id:      UUID (string)
  params: {
    messages: [
      {
        role:    "user"
        content: [{ type: "text", text: "<user prompt containing URL>" }]
      }
    ]
    context: {
      correlation_id: string  # tracing
      thread_ts:      string  # Slack thread (optional)
    }
  }
}
```

### Outbound (Fetch URL Agent → Verification Agent)

```
InvocationResponse {
  jsonrpc: "2.0"
  id:      UUID (string, matches request)
  result: {
    messages: [
      {
        role:    "agent"
        content: [{ type: "text", text: "<extracted URL content or error>" }]
      }
    ]
  }
}
```

### Error Response (A2A error)

```
InvocationResponse {
  jsonrpc: "2.0"
  id:      UUID
  error: {
    code:    -32603  # Internal error
    message: "<Japanese user-friendly error>"
  }
}
```

---

## Tool Input / Output

### fetch_url Tool

**Input** (Strands tool call):
```
FetchUrlInput {
  url: string  # Required. Must start with http:// or https://
}
```

**Output** (Strands tool response):
```
FetchUrlOutput {
  content: string  # Extracted text, max 14,000 chars
  # OR error message (Japanese) on failure
}
```

**Constraints**:
| Parameter | Value | Source |
|-----------|-------|--------|
| Max response chars | 14,000 | `_MAX_RETURN_CHARS` |
| Max download size | 512 KB (524,288 bytes) | `_MAX_DOWNLOAD_BYTES` |
| Timeout | 10 seconds | `_TIMEOUT_SECONDS` |
| Allowed schemes | `http`, `https` | SSRF guard |
| Blocked IP ranges | RFC1918 + loopback | `_PRIVATE_IP_RANGES` |

---

## Agent Card Entity

```
AgentCard {
  name:            "SlackAI-WebFetchAgent"
  description:     "指定URLのWebコンテンツをテキストとして取得する専用エージェント。..."
  url:             string  # AGENTCORE_RUNTIME_URL env var
  version:         "1.0.0"
  protocol:        "A2A"
  protocolVersion: "1.0"
  authentication: {
    type:    "SIGV4"
    service: "bedrock-agentcore"
  }
  capabilities: {
    streaming:        false
    asyncProcessing:  true
    attachments:      false  # text-only, no file output
  }
  skills: [
    {
      id:          "fetch_url"
      name:        "Fetch URL"
      description: "指定URLのWebコンテンツをテキストとして取得する。SSRFセキュリティ対策済み。"
      inputModes:  ["text"]
      outputModes: ["text"]
    }
  ]
  defaultInputModes:  ["text"]
  defaultOutputModes: ["text"]
}
```

---

## State Transitions (fetch_url tool)

```
URL Received
    │
    ▼
Validate scheme (http/https)
    │── FAIL → "URLスキームエラー" message
    ▼
DNS resolution + SSRF check
    │── FAIL → "プライベートIPアクセス拒否" message
    ▼
HTTP GET (timeout: 10s, max: 512KB)
    │── TIMEOUT → "タイムアウト" message
    │── HTTP Error → "HTTPエラー" message
    │── Network Error → "ネットワークエラー" message
    ▼
Content-Type detection
    │── HTML → BeautifulSoup text extraction
    │── Other → raw text
    ▼
Truncate to 14,000 chars (if needed)
    │── TRUNCATED → append "... [以下省略]"
    ▼
Return extracted text
```

---

## Environment Variables

| Variable | Agent | Required | Default | Description |
|----------|-------|----------|---------|-------------|
| `BEDROCK_MODEL_ID` | fetch-url-agent | No | `jp.anthropic.claude-sonnet-4-5-20250929-v1:0` | Bedrock model for orchestration |
| `AWS_REGION_NAME` | fetch-url-agent | No | `ap-northeast-1` | AWS region |
| `AGENTCORE_RUNTIME_URL` | fetch-url-agent | No | `http://localhost:9000` | Self-reported URL in agent card |
| `EXECUTION_AGENT_ARNS` | verification-agent | Yes | — | JSON dict including new `web-fetch` ARN |
