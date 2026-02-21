# Data Model: Verification Agent Iterative Multi-Agent Reasoning

**Branch**: `036-iterative-reasoning` | **Date**: 2026-02-21

---

## Overview

This feature introduces runtime-only data structures within the verification agent. No new persistent storage is required — DynamoDB and S3 schemas are unchanged.

---

## Runtime Entities

### OrchestrationRequest

Represents the enriched, security-cleared request passed into the agentic loop.

| Field | Type | Source | Description |
|---|---|---|---|
| `user_text` | `str` | pipeline.py enrichment | Original Slack message text, with URLs resolved |
| `thread_context` | `str \| None` | pipeline.py enrichment | Formatted thread history (prior messages) |
| `file_references` | `list[S3FileRef]` | pipeline.py enrichment | S3 presigned URLs for uploaded attachments |
| `available_agents` | `dict[str, AgentCard]` | agent registry | Map of agent_id → agent card for tool generation |
| `correlation_id` | `str` | pipeline.py | Request tracing identifier |
| `max_turns` | `int` | env var `MAX_AGENT_TURNS` (default: 5) | Maximum agentic loop turns for this request |

### S3FileRef

| Field | Type | Description |
|---|---|---|
| `s3_key` | `str` | Temporary S3 object key |
| `presigned_url` | `str` | Pre-signed URL for execution agent access |
| `filename` | `str` | Original filename |
| `content_type` | `str` | MIME type |

### ToolCallRecord

Logged per tool invocation for observability (FR-011). Written to structured JSON logs; not persisted.

| Field | Type | Description |
|---|---|---|
| `turn_number` | `int` | Which agentic loop turn (1-based) |
| `tool_name` | `str` | Name of the tool called (e.g., `invoke_docs_agent`) |
| `tool_input` | `dict` | Arguments passed to the tool |
| `status` | `"success" \| "error"` | Tool execution outcome |
| `duration_ms` | `int` | Wall-clock time for tool call |
| `timestamp` | `str` | ISO 8601 |

### OrchestrationResult

Returned by the agentic loop to the pipeline for Slack delivery.

| Field | Type | Description |
|---|---|---|
| `synthesized_text` | `str` | Final answer produced by the orchestration agent |
| `turns_used` | `int` | Actual number of loop turns consumed |
| `agents_called` | `list[str]` | Distinct agent_ids invoked during the loop |
| `file_artifact` | `FileArtifact \| None` | If any execution agent produced a file |
| `completion_status` | `"complete" \| "partial" \| "error"` | Whether max_turns was reached |

### FileArtifact (unchanged from existing)

| Field | Type | Description |
|---|---|---|
| `filename` | `str` | Output filename |
| `content_type` | `str` | MIME type |
| `data` | `bytes \| str` | File content (base64 or raw) |
| `size_bytes` | `int` | File size for routing decision (inline vs S3) |

---

## State Transitions

### Agentic Loop Lifecycle

```
OrchestrationRequest
        │
        ▼
  [Turn 1..N]
  ┌─────────────────────────────────────────┐
  │  model inference                        │
  │      │                                  │
  │      ├─ tool calls (parallel)           │
  │      │    invoke_docs_agent(task)       │
  │      │    invoke_time_agent(task)       │
  │      │    search_aws_docs(query)        │
  │      │         │                        │
  │      │    [ToolCallRecord logged]       │
  │      │         │                        │
  │      └─ tool results → conversation     │
  └─────────────────────────────────────────┘
        │
        ▼ (stop reason: end_turn OR max_turns reached)
  OrchestrationResult
```

### completion_status Transitions

| Condition | completion_status |
|---|---|
| Model reaches end_turn within max_turns | `"complete"` |
| MaxTurnsHook fires, model produces final answer | `"partial"` |
| All agent tools return errors | `"error"` |

---

## Validation Rules

- `max_turns` MUST be between 1 and 10 (inclusive); values outside this range default to 5
- `user_text` MUST NOT be empty (enforced upstream in existing pipeline)
- `OrchestrationResult.synthesized_text` MUST NOT be empty; if the loop produces no text, pipeline substitutes the generic error message
- `ToolCallRecord.turn_number` MUST NOT exceed `max_turns`
