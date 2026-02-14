# Data Model: JSON-RPC 2.0 Zone Connection（CSP 非依存 A2A）

**Feature**: 032-jsonrpc-zone-connection  
**Date**: 2026-02-14

本データモデルは **CSP に依存しない** A2A のアプリケーション層を定義する。トランスポート（AWS InvokeAgentRuntime、直接 HTTPS 等）はこの契約の上に載る実装である。

## Entities

### 1. JSON-RPC 2.0 Request (Verification → Execution)

Represents a single RPC call from the Verification Zone to the Execution Zone.

| Field    | Type    | Required | Description |
|----------|---------|----------|-------------|
| jsonrpc  | string  | Yes      | MUST be exactly `"2.0"`. |
| method   | string  | Yes      | Method to invoke. For this feature, only `execute_task` is defined. Must not start with `rpc.`. |
| params   | object  | No       | By-name parameters. For `execute_task`, see ExecuteTaskParams. |
| id       | string \| number \| null | No | Request id for correlation. Omitted for notifications. For this feature, always present (e.g. UUID string). |

**Validation**:
- If `method` is missing or not a string, treat as Invalid Request (-32600).
- If `id` is present and is a number, prefer integer (no fractional part) per JSON-RPC 2.0 note.

---

### 2. ExecuteTaskParams (params for method `execute_task`)

Task payload passed as the `params` object of the JSON-RPC Request.

| Field          | Type   | Required | Description |
|----------------|--------|----------|-------------|
| channel        | string | Yes      | Slack channel id. |
| text           | string | Yes      | User message text. |
| bot_token      | string | Yes      | Slack bot token for posting reply. |
| correlation_id  | string | No       | Trace id (e.g. UUID). |
| thread_ts      | string | No       | Slack thread timestamp. |
| attachments    | array  | No       | Attachment descriptors (url, type, etc.). |
| team_id        | string | No       | Slack team id. |
| user_id        | string | No       | Slack user id. |

**Validation** (Execution Zone):
- Missing or invalid required fields → JSON-RPC error -32602 Invalid params, with optional `data` describing the failure.

---

### 3. JSON-RPC 2.0 Response (Execution → Verification)

Represents the response from the Execution Zone to a single Request.

| Field   | Type   | Required | Description |
|---------|--------|----------|-------------|
| jsonrpc | string | Yes      | MUST be exactly `"2.0"`. |
| result  | any    | On success | Method return value. For `execute_task`, see ExecuteTaskResult. MUST NOT exist if `error` is present. |
| error   | object | On error   | JSON-RPC Error object. MUST NOT exist if `result` is present. |
| id      | string \| number \| null | Yes | Same as Request `id`, or null for Parse error / Invalid Request. |

Exactly one of `result` or `error` must be present.

---

### 4. ExecuteTaskResult (value of `result` for `execute_task`)

Success payload returned inside the JSON-RPC `result` member. Structure is backward-compatible with current Verification expectations so that only the envelope (JSON-RPC) changes.

| Field          | Type   | Description |
|----------------|--------|-------------|
| status         | string | e.g. `"success"`. |
| response_text  | string | AI reply text to post to Slack. |
| (others)       | any    | Any additional fields needed by Verification (e.g. for attachments, file upload). |

For async acceptance, `result` may include e.g. `status: "accepted"` and `task_id`; Verification then uses existing GetAsyncTaskResult polling.

---

### 5. JSON-RPC 2.0 Error Object

Used in the Response `error` member.

| Field   | Type   | Required | Description |
|---------|--------|----------|-------------|
| code    | number | Yes      | Integer. -32700 Parse error; -32600 Invalid Request; -32601 Method not found; -32602 Invalid params; -32603 Internal error; -32000..-32099 server-defined. |
| message | string | Yes      | Short description. |
| data    | any    | No       | Additional info (e.g. correlation_id, field name). |

**Predefined codes** (JSON-RPC 2.0):
- -32700: Parse error (invalid JSON).
- -32600: Invalid Request (valid JSON but not a valid Request object).
- -32601: Method not found.
- -32602: Invalid params.
- -32603: Internal error.
- -32000..-32099: Server error (e.g. -32001 timeout).

---

## State Transitions

- **Request flow**: Verification builds Request → sends as InvokeAgentRuntime payload → Execution parses Request → dispatches by `method` → produces Response (result or error) → returns as response body.
- **Async flow**: Execution may return Response with `result.status === "accepted"` and `task_id`; Verification polls GetAsyncTaskResult until final result; the format of the async result payload may remain as today or be documented as JSON-RPC-style in a follow-up.

---

## Relationships

- One Request (with unique `id`) has exactly one Response (with same `id`), except for notifications (not used here).
- ExecuteTaskParams is the single `params` shape for the single method `execute_task`.
- ExecuteTaskResult and Error object are disjoint: Response contains either `result` or `error`, not both.
