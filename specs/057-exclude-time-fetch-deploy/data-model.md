# Data Model: Exclude Time and Web Fetch from Default Deployment

**Feature**: 057-exclude-time-fetch-deploy  
**Date**: 2026-03-30

This feature does **not** introduce new tables or attributes. It changes **which rows** may exist in the existing agent registry and **which keys** appear in verification CDK config.

## Entity: Agent registry item (DynamoDB — existing table)

| Field        | Description |
| ------------ | ----------- |
| `env` (PK)   | Deployment environment (e.g. `dev`, `prod`). Unchanged. |
| `agent_id` (SK) | Stable agent identifier. **Standard deployment must not retain** items where `agent_id` is `time` or `fetch-url` after the deploy sequence completes. |
| `arn`, `description`, `skills`, `updated_at` | Existing attributes; unchanged semantics. |

**Validation rules (feature-specific)**:

- After a standard unified deploy, **no** item shall exist with `(env, agent_id)` equal to `(current env, time)` or `(current env, fetch-url)`.
- Opt-in deploys of Time or Web Fetch (per-zone scripts) may recreate these rows; that path is outside the standard procedure.

## Entity: Verification CDK config fragment — `executionAgentArns`

| Key            | Presence after standard deploy |
| -------------- | ------------------------------- |
| `file-creator` | Required (non-empty ARN).       |
| `docs`         | Expected when docs agent deployed. |
| `time`         | **Must be absent** (omit key; do not set empty string in JSON if the project convention is omit). |
| `fetch-url`    | **Must be absent.**             |

**Relationships**: `executionAgentArns` informs CDK synthesis of IAM invoke scope for the verification agent. Omitting keys aligns with not deploying those runtimes in the standard path.

## State transitions

1. **Before feature**: Registry may contain `time` and `fetch-url`; config may include ARNs.
2. **After standard deploy**: Registry items removed for those IDs; config updated without those keys; verification redeployed with narrower invoke policy.
3. **Optional per-zone deploy**: Operator may run Time or Web Fetch scripts manually and re-register rows—non-default path.
