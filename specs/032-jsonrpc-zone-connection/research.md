# Research: CSP に依らない A2A 接続（JSON-RPC 2.0）

**Feature**: 032-jsonrpc-zone-connection  
**Date**: 2026-02-14

## 0. CSP 非依存の A2A 契約

**Decision**: ゾーン間のアプリケーション層は **JSON-RPC 2.0 のみ**で定義し、トランスポートや CSP に依存しない契約とする。トランスポート（例: AWS InvokeAgentRuntime、直接 HTTPS、他 CSP の Runtime API）は「JSON-RPC 2.0 の Request を送り、JSON-RPC 2.0 の Response を受け取る」という同一契約の上に載る実装の一つとする。

**Rationale**:
- 仕様の目的が「CSP に依らない A2A 接続」であるため、プロトコルは標準（JSON-RPC 2.0）に統一し、特定 CSP の API 仕様に縛られないようにする。
- 現在は AWS 上で InvokeAgentRuntime を利用するが、将来の他 CSP やオンプレミスへの移行・並行運用時も、同じ Request/Response 契約で Verification–Execution 間を接続できる。
- トランスポート層（認証・再試行・非同期取得など）は環境ごとに差し替え可能とする。

**Alternatives considered**:
- 現行の prompt ベースの envelope を維持: 仕様で JSON-RPC 2.0 採用が決まっているため却下。
- CSP ごとに別契約を定義: 運用・検証が複雑になるため、まずは単一の JSON-RPC 2.0 契約に統一する。

---

## 1. JSON-RPC 2.0 Standard

**Decision**: Use the official [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification) for request/response and error format.

**Rationale**:
- Stateless, transport-agnostic, and widely supported.
- Request: `jsonrpc` (must be `"2.0"`), `method`, `params` (optional), `id` (optional for notifications).
- Response: `jsonrpc`, either `result` or `error`, and `id` matching the request.
- Error object: `code` (integer), `message` (string), `data` (optional). Predefined codes: -32700 Parse error, -32600 Invalid Request, -32601 Method not found, -32602 Invalid params, -32603 Internal error; -32000..-32099 reserved for server-defined errors.
- Enables consistent parsing, tooling, and correlation via `id`.

**Alternatives considered**:
- Custom envelope: Rejected; spec explicitly requires JSON-RPC 2.0 for interoperability.
- JSON-RPC 1.0: Rejected; 2.0 has clear error contract and version field.

---

## 2. Method Name and Parameter Shape

**Decision**: Define a single method **`execute_task`** with a single **by-name** `params` object containing the existing task payload (e.g. `channel`, `text`, `thread_ts`, `bot_token`, `correlation_id`, `attachments`, `team_id`, `user_id` as applicable). No batch or notifications for this feature.

**Rationale**:
- Matches current “execute task” semantics; one method is sufficient per spec (FR-007).
- By-name params (Object) are easier to evolve than by-position (Array) and are recommended in the JSON-RPC 2.0 spec for parameter structures.
- Method names must not start with `rpc.` (reserved).

**Alternatives considered**:
- Multiple methods (e.g. `execute_task`, `ping`): Deferred; can add later if needed.
- By-position params: Rejected; less readable and harder to extend.

---

## 3. Result and Error Mapping

**Decision**:
- **Success**: JSON-RPC 2.0 Response `result` is an object that carries the current success payload (e.g. `status`, `response_text`, and any other fields the Verification Zone expects). Existing fields are preserved inside `result` so that Verification’s downstream logic (Slack poster, etc.) can stay unchanged by only reading `response.result` instead of the raw body.
- **Application errors** (validation, timeout, internal): Use JSON-RPC 2.0 `error` with standard codes where applicable: -32602 Invalid params, -32603 Internal error. Use a server-error code in -32000..-32099 for timeout or domain-specific errors (e.g. -32001 timeout), with optional `data` for correlation_id or details.
- **Parse/Invalid Request**: Use -32700 and -32600 with `id: null` as per spec.

**Rationale**:
- Keeps FR-006 (no change to end-user behavior) by preserving success/error semantics inside result/error.
- Standard codes give operators and tooling a stable contract; server-error range allows extension without conflicting with the spec.

**Alternatives considered**:
- Mapping all failures to -32603: Rejected; -32602 for invalid params improves debuggability.
- Custom codes only in application range: Accepted in addition; use -32xxx for standard, application range for domain errors.

---

## 4. Async / Long-Running Behavior

**Decision**: Keep the current pattern: Execution may return either (1) a synchronous JSON-RPC 2.0 Response with the final `result`, or (2) a JSON-RPC 2.0 Response whose `result` indicates async acceptance (e.g. `status: "accepted"`, `task_id`). In the latter case, Verification continues to use the existing GetAsyncTaskResult polling; the payload returned by that API can remain implementation-defined (e.g. still JSON-RPC 2.0 style for consistency when the async result is delivered). Document this in the contract so both zones agree.

**Rationale**:
- Spec allows “result payload that describes async status” (Assumptions). Existing async flow is preserved; only the initial request/response envelope becomes JSON-RPC 2.0.
- No change to InvokeAgentRuntime or GetAsyncTaskResult semantics; only the application payload format is standardized.

**Alternatives considered**:
- Removing async: Rejected; current product relies on it for long Bedrock runs.
- JSON-RPC notifications for completion: Possible future extension; out of scope for this feature.

---

## 5. トランスポート実装（現行: AWS InvokeAgentRuntime）

**Decision**: **アプリケーション層**は JSON-RPC 2.0 の Request/Response のみに依存する。**トランスポート**はその上に載る実装であり、現行では AWS Bedrock AgentCore の InvokeAgentRuntime を利用する。ペイロードは UTF-8 エンコードした JSON-RPC 2.0 Request 単体（バッチは使わない）。レスポンス body は単一の JSON-RPC 2.0 Response とする。Session ID（runtimeSessionId）は呼び出しごとに一意（例: UUID）とする（AWS 推奨に沿う）。

**Rationale**:
- CSP 非依存の A2A とするため、契約は「JSON-RPC 2.0 で送受信する」ことのみで定義する。InvokeAgentRuntime はその一実装に過ぎない。
- [AWS ドキュメント](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html): バイナリ最大 100 MB、内容はエージェント定義。JSON-RPC をアプリケーション層として載せる形で問題ない。
- セッション管理・エラー・リトライ・ペイロードサイズはトランスポート層の関心事；現行の ThrottlingException リトライや SigV4 は AWS 実装の一部として維持する。

**Alternatives considered**:
- 直接 HTTPS で Execution を呼ぶ方式: 同一の JSON-RPC 2.0 契約を使えば、トランスポート差し替えとして将来対応可能。
- JSON-RPC をラッパーキーで包む: 却下；body は JSON-RPC Request そのものとし二重エンコードを避ける。

---

## 6. Idempotency and Request Id

**Decision**: Use a string **request id** (e.g. UUID) for every request’s `id` field. Verification generates it; Execution echoes it in the Response `id`. This satisfies FR-005 and SC-005. Notifications (request without `id`) are not used in this feature.

**Rationale**:
- JSON-RPC 2.0 requires Response `id` to match Request `id` when present. String UUIDs avoid fractional number issues mentioned in the spec and align with existing correlation_id usage.

**Alternatives considered**:
- Numeric id: Acceptable but string UUID is already used for correlation_id/session and is consistent.

---

## 7. Invalid JSON and Non–JSON-RPC Bodies

**Decision**: If the Execution Zone receives a body that is not valid JSON, respond with a JSON-RPC 2.0 Response with `error`: `{ "code": -32700, "message": "Parse error" }` and `id`: null. If the body is valid JSON but not a valid JSON-RPC 2.0 Request (e.g. missing `method` or wrong type), respond with `error`: `{ "code": -32600, "message": "Invalid Request" }` and `id`: null. Do not return non–JSON-RPC responses from the Execution endpoint for these cases so that the protocol remains uniform.

**Rationale**:
- JSON-RPC 2.0 spec defines Parse error and Invalid Request and requires `id`: null when the request id cannot be determined. Single, predictable error shape simplifies Verification and tooling.

**Alternatives considered**:
- Returning plain JSON error without JSON-RPC envelope: Rejected; FR-002 and SC-002 require all responses to be JSON-RPC 2.0 Response objects.
