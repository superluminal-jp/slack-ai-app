# Data Model: CDK Logging, Comments, and Error Handling

**Feature**: 029-cdk-logging-error-handling  
**Scope**: Conceptual entities for observability and error reporting; no new persistent storage.

## 1. Log Entry

A single observability event produced during synthesis or deployment.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| level | string | Yes | One of: `info`, `warn`, `error`, `debug` |
| message | string | Yes | Human-readable description; no secrets |
| timestamp | string (ISO 8601) | Optional | Time of event (for structured output) |
| phase | string | Optional | Lifecycle phase, e.g. `config`, `synthesis`, `stack`, `construct` |
| context | object | Optional | Arbitrary key-value context (stack name, construct id, etc.); must not contain secrets |

**Validation**: `message` and any `context` values must not contain secrets, tokens, or PII. No state transitions; log entries are immutable once emitted.

**Relationship**: Produced by app entry (bin/cdk.ts) or construct code; consumed by operators and optionally by log aggregation. See `contracts/log-event.schema.json`.

---

## 2. Error Report

The user-facing outcome of a failure (validation or deployment).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| message | string | Yes | Clear, actionable description of the failure; no secrets |
| cause | string | Optional | Short technical cause (e.g., "Invalid deployment environment"); safe to display |
| resourceId | string | Optional | Construct path or logical id (e.g., `ExecutionStack/ExecutionAgentEcr`) for FR-007 |
| remediation | string | Optional | Suggested next step where feasible |
| source | string | Optional | Origin: `app`, `stack`, `construct`, `toolkit` |

**Validation**: No secrets or sensitive data in any field. When wrapping a nested error, do not copy raw error text that might contain secrets into `message` or `cause`.

**Relationship**: Emitted when validation fails (e.g., Annotations.addError) or when entry-point logic throws. See `contracts/error-report.schema.json`.

---

## 3. Documented Unit

A module, stack, or construct that has defined purpose and main inputs/outputs documented for maintainers. Not a runtime entity; a documentation contract.

| Attribute | Description |
|-----------|-------------|
| name | File or construct name (e.g., `ExecutionStack`, `verification-stack.ts`) |
| purpose | One or two sentences: what this unit does and why it exists |
| responsibilities | Bullet list of main responsibilities |
| inputs | Config, props, or context the unit depends on |
| outputs | Exposed resources, CfnOutputs, or side effects |
| non-obvious rules | Ordering, naming, or safety constraints documented at point of use |

**Validation**: None (documentation only). Consistency is enforced by FR-006 and checklist (SC-005).

**Relationship**: Every top-level stack and construct module in `cdk/lib/` and entry in `cdk/bin/` should be a documented unit.
