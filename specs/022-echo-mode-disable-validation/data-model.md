# Data Model: Echo Mode Disable — Full Pipeline Validation with TDD

**Branch**: `022-echo-mode-disable-validation` | **Date**: 2026-02-09

## Entities

### Verification Pipeline Payload

The A2A payload received by the Verification Agent at `POST /`.

```text
TaskPayload
├── channel: string          # Slack channel ID (e.g., "C01234567")
├── text: string             # User message text (bot mention stripped)
├── bot_token: string        # Slack bot OAuth token
├── thread_ts: string?       # Thread timestamp for reply threading
├── correlation_id: string   # Request correlation ID for tracing
├── team_id: string          # Slack team/workspace ID
├── user_id: string          # Slack user ID
├── attachments: list        # File attachment metadata (optional)
└── event_id: string         # Dedupe event ID
```

### Execution Payload

Forwarded from Verification Agent to Execution Agent when echo mode is disabled.

```text
ExecutionPayload
├── channel: string
├── text: string
├── bot_token: string
├── thread_ts: string?
├── attachments: list
├── correlation_id: string
├── team_id: string
└── user_id: string
```

### Execution Result

Response from Execution Agent.

```text
ExecutionResult
├── status: "success" | "error"
├── response_text: string?          # AI-generated response text
├── error_code: string?             # Error classification code
├── error_message: string?          # Raw error message (internal)
└── file_artifact: FileArtifact?    # Generated file attachment
    ├── artifactId: string
    ├── name: string
    └── parts: list
        └── Part
            ├── kind: "file"
            ├── contentBase64: string   # Base64-encoded file content
            ├── fileName: string        # Output filename
            └── mimeType: string        # MIME type
```

### Error Message Map

Maps error codes to user-friendly messages.

```text
ErrorMessageMap (static)
├── bedrock_timeout → ":hourglass: AI サービスが応答に時間がかかっています..."
├── bedrock_throttling → ":warning: AI サービスが混雑しています..."
├── bedrock_access_denied → ":lock: AI サービスへの接続に問題があります..."
├── invalid_response → ":x: AI サービスから予期しない応答を受信しました..."
├── attachment_download_failed → ":paperclip: 添付ファイルのダウンロードに失敗しました..."
├── async_timeout → ":hourglass: AI サービスの処理がタイムアウトしました..."
├── async_task_failed → ":x: バックグラウンド処理が失敗しました..."
├── throttling → ":warning: AI サービスが混雑しています..."
├── access_denied → ":lock: AI サービスへのアクセスが拒否されました..."
└── generic → ":warning: エラーが発生しました..."
```

### Pipeline Response

JSON string returned by `pipeline.run()`.

```text
PipelineResponse
├── status: "completed" | "error"
├── correlation_id: string
├── error_code: string?         # Only on error
└── error_message: string?      # Only on error
```

## State Transitions

```text
Pipeline Flow (echo mode disabled):

    [Receive Payload]
           │
    [Parse Task Payload]
           │
    [Existence Check] ──fail──> [Return error: existence_check_failed]
           │ pass
    [Authorization] ──fail──> [Return error: authorization_failed]
           │ pass
    [Rate Limit] ──fail──> [Return error: rate_limit_exceeded]
           │ pass
    [Echo Mode Check]
           │ disabled (this feature)
    [Delegate to Execution Agent]
           │
    ┌──────┴──────┐
    │             │
  success       error/exception
    │             │
  [Parse         [Map to friendly
   response]      error message]
    │             │
  [Send to       [Send error to
   Slack]         Slack]
    │             │
    └──────┬──────┘
           │
    [Return completed/error]
```

## Validation Rules

- `channel` must be non-empty string starting with "C"
- `bot_token` must be non-empty string starting with "xoxb-"
- `text` may be empty (if attachments present)
- `team_id` format: starts with "T"
- `user_id` format: starts with "U"
- `thread_ts` optional; when present, format "NNNNNNNNN.NNNNNN"
- `correlation_id` auto-generated UUID if not provided
