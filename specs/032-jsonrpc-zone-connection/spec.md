# Feature Specification: CSP に依らない A2A 接続（JSON-RPC 2.0）

**Feature Branch**: `032-jsonrpc-zone-connection`  
**Created**: 2026-02-14  
**Status**: Draft  
**Input**: User description: "Verification Zone から Execution Zone への接続方法を JSON-RPC 2.0 に変更"

## Overview

本機能は、**CSP（クラウドサービスプロバイダ）に依存しない A2A（Agent-to-Agent）接続**を実現するための仕様変更である。システムは **Verification Zone**（検証・認可・レート制限）と **Execution Zone**（AI 実行・結果返却）の 2 ゾーンで構成される。現状はゾーン間のリクエスト/レスポンスがカスタム envelope かつ特定 CSP の API（例: InvokeAgentRuntime）に紐づいた形式になっている。本変更では **アプリケーション層のプロトコルを JSON-RPC 2.0 に統一**し、以下を満たす:

- **CSP 非依存**: メッセージ形式は JSON-RPC 2.0 標準に準拠し、どの CSP の上でも同じ A2A 契約を利用可能にする（現在は AWS 上で稼働し、将来は他 CSP やオンプレミスでも同一契約で接続可能とする）。
- **標準準拠**: リクエスト/レスポンスは単一の明確な標準に従い、エラーは JSON-RPC 2.0 の error オブジェクトで一貫して報告する。
- **運用・ツール**: オペレータやツールが標準プロトコルに基づいてデバッグ・連携できるようにする。

スコープは **ゾーン間のプロトコルとメッセージ形式** に限定する。バイト列をどのトランスポート（HTTPS、特定 CSP の Runtime API など）で送るかは本仕様の範囲外とするが、**アプリケーション層はトランスポートに依存しない設計**とする。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Standard Request from Verification to Execution (Priority: P1)

As an operator, when the Verification Zone sends a task to the Execution Zone, the request is a valid JSON-RPC 2.0 Request (with `jsonrpc`, `method`, `params`, `id`). The Execution Zone responds with a valid JSON-RPC 2.0 Response (with `jsonrpc`, `result` or `error`, `id`).

**Why this priority**: This is the core behavior; all other flows depend on it.

**Independent Test**: Send a single task from Verification to Execution and verify that the payload from Verification is a JSON-RPC 2.0 Request and the payload returned to Verification is a JSON-RPC 2.0 Response (success or error).

**Acceptance Scenarios**:

1. **Given** a valid user request in Verification Zone, **When** Verification sends the task to Execution Zone, **Then** the outgoing message is a JSON-RPC 2.0 Request (contains `jsonrpc`, `method`, `params`, `id`).
2. **Given** Execution Zone processes the task successfully, **When** it returns the result to Verification Zone, **Then** the response is a JSON-RPC 2.0 Response with `result` and matching `id`.
3. **Given** Execution Zone encounters a processing error, **When** it returns to Verification Zone, **Then** the response is a JSON-RPC 2.0 Response with `error` (code, message, optional data) and matching `id`.

---

### User Story 2 - Consistent Error Contract (Priority: P2)

As an operator, when Execution Zone fails (validation, timeout, or internal error), the error is returned as a JSON-RPC 2.0 error object so that Verification Zone and any tooling can interpret it in a standard way.

**Why this priority**: Ensures predictable error handling and observability without custom parsing.

**Independent Test**: Trigger a known failure (e.g. invalid params, timeout) and confirm the response is a JSON-RPC 2.0 Response with `error` and no `result`.

**Acceptance Scenarios**:

1. **Given** Execution Zone receives an invalid or malformed request, **When** it responds, **Then** the response is a JSON-RPC 2.0 Response with `error` and an appropriate error code and message.
2. **Given** Execution Zone times out or hits an internal error, **When** it responds, **Then** the response is a JSON-RPC 2.0 Response with `error` and a stable structure (code, message, optional data).

---

### User Story 3 - End-to-End User Flow Unchanged (Priority: P1)

As an end user, I send a message to the Slack AI app and receive an AI reply in the thread. My experience is unchanged after the protocol change; only the internal protocol between zones is different.

**Why this priority**: The change must not regress user-visible behavior.

**Independent Test**: Send a message in Slack, receive a reply; repeat with an error case (e.g. rate limit) and confirm the user sees an appropriate message.

**Acceptance Scenarios**:

1. **Given** a user sends a message in Slack, **When** Verification and Execution communicate via JSON-RPC 2.0, **Then** the user receives the same quality and content of reply as before.
2. **Given** an error occurs in Execution Zone, **When** Verification receives the JSON-RPC 2.0 error response, **Then** the user sees a clear, safe error message (no protocol details or stack traces).

---

### Edge Cases

- What happens when the request is valid JSON but not a valid JSON-RPC 2.0 Request (e.g. missing `method` or `id`)? The receiver MUST respond with a JSON-RPC 2.0 error (e.g. Invalid Request).
- What happens when the request is not valid JSON? The receiver MUST respond with a JSON-RPC 2.0 error where applicable, or a well-defined non-JSON-RPC failure if the transport does not support it.
- How does the system handle a response that is lost or never arrives? Existing timeout and retry behavior for the zone-to-zone channel remains; JSON-RPC 2.0 does not change transport semantics.
- How are long-running or asynchronous results represented? Either the JSON-RPC 2.0 Response is sent when the result is ready (possibly after polling or callback), or the result payload indicates async status in a defined way; the chosen pattern MUST be documented and consistent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Requests from Verification Zone to Execution Zone MUST be encoded as JSON-RPC 2.0 Request objects (including `jsonrpc`, `method`, `params`, and `id`).
- **FR-002**: Responses from Execution Zone to Verification Zone MUST be encoded as JSON-RPC 2.0 Response objects (including `jsonrpc`, and either `result` or `error`, and `id`).
- **FR-003**: Execution Zone MUST respond with a JSON-RPC 2.0 error object when the request is invalid (e.g. invalid JSON, missing required fields, or unsupported method).
- **FR-004**: Execution Zone MUST respond with a JSON-RPC 2.0 error object when processing fails (e.g. timeout, internal error), with a structured error code and message.
- **FR-005**: The `id` in the Response MUST match the `id` in the Request so that Verification Zone can correlate responses to requests.
- **FR-006**: End-user-visible behavior (success replies and error messages in Slack) MUST remain unchanged from the pre–JSON-RPC 2.0 behavior.
- **FR-007**: At least one JSON-RPC 2.0 method MUST be defined and implemented for the task currently supported (e.g. “execute task” with task payload as params); method name and params structure MUST be documented.

### Key Entities

- **Request (Verification → Execution)**: The JSON-RPC 2.0 Request; carries method name, task parameters (channel, text, correlation id, etc.), and request id.
- **Response (Execution → Verification)**: The JSON-RPC 2.0 Response; carries either the task result (e.g. response text, status) or an error object (code, message, optional data), and the same request id.
- **Error object**: JSON-RPC 2.0 error structure (code, message, optional data) used for invalid request, method not found, timeout, or internal errors.

## Assumptions

- **CSP 非依存の A2A**: アプリケーション層の契約（JSON-RPC 2.0 の Request/Response）はトランスポートや CSP に依存しない。現在の実装では AWS InvokeAgentRuntime 等をトランスポートとして利用するが、同一の JSON-RPC 2.0 契約は他 CSP や直接 HTTPS でも利用可能である。
- The existing security boundary between Verification and Execution (e.g. authentication and authorization) remains; only the message format changes to JSON-RPC 2.0.
- A single JSON-RPC 2.0 method is sufficient for the current “execute task” use case; batch requests (JSON-RPC 2.0 batch) are not required for this feature unless explicitly added later.
- Asynchronous or long-running execution (if any) will be represented either by a delayed JSON-RPC Response or by a result payload that describes async status; the exact pattern is a design choice within the implementation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of requests from Verification Zone to Execution Zone are valid JSON-RPC 2.0 Request objects (verifiable by schema or conformance checks).
- **SC-002**: 100% of responses from Execution Zone to Verification Zone are valid JSON-RPC 2.0 Response objects (verifiable by schema or conformance checks).
- **SC-003**: End users can complete a normal question-and-answer flow in Slack with no regression in success rate or response time compared to the pre–JSON-RPC 2.0 baseline.
- **SC-004**: All documented error cases (invalid request, timeout, internal error) return a JSON-RPC 2.0 error object with a non-null `error.code` and `error.message`.
- **SC-005**: Operators can identify request–response pairs using the `id` field in logs or tooling in 100% of sampled requests.
