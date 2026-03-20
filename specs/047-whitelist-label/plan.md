# Implementation Plan: Whitelist Channel Label

**Branch**: `047-whitelist-label` | **Date**: 2026-03-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/047-whitelist-label/spec.md`

## Summary

Add an optional `label` attribute to `channel_id` whitelist entries so administrators can identify channels by name rather than ID alone. Changes extend the in-memory whitelist data structure with a `channel_labels` dict, update all three configuration sources (DynamoDB, Secrets Manager, environment variable) and the CDK config (TypeScript) to accept object-format entries. Authorization logic is unchanged. Labels surface in authorization log events only.

## Technical Context

**Language/Version**: Python 3.11 (agents), TypeScript 5.x (CDK)
**Primary Dependencies**: `boto3 ~=1.42.0`, `aws-cdk-lib` 2.215.0, `zod` (CDK config validation)
**Storage**: DynamoDB whitelist table (no schema migration — `label` is an optional attribute)
**Testing**: `pytest` (Python agents), `jest` (CDK TypeScript)
**Target Platform**: AWS Lambda (Lambda handler copy), AWS Bedrock AgentCore (agent src)
**Project Type**: Internal security pipeline extension — verification zone only
**Performance Goals**: No regression in whitelist cache load time (labels add O(n) dict lookup per item)
**Constraints**: Fail-closed on any error; `label` must never affect authorization outcome
**Scale/Scope**: Two Python source trees (agent src + Lambda copy), four TypeScript CDK files

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Spec-Driven Development | ✅ | spec.md → plan.md → tasks.md → implement |
| II. TDD | ✅ | Test tasks precede implementation tasks in tasks.md |
| III. Security-First | ✅ | Authorization logic (`entity_id` match) unchanged; `label` is read-only metadata |
| IV. Fail-Open / Fail-Closed | ✅ | Label lookup failure (missing key) handled gracefully with `None`; authorization path unchanged |
| V. Zone-Isolated Architecture | ✅ | Changes are verification-zone only; no execution-zone imports added |
| VI. Documentation & Deploy-Script Parity | ✅ | CHANGELOG, README, CLAUDE.md included in final tasks |
| VII. Clean Code Identifiers | ✅ | No spec numbers, branch names, or task IDs in code or docstrings |

## Project Structure

### Documentation (this feature)

```text
specs/047-whitelist-label/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── checklists/
│   └── requirements.md
└── tasks.md             ← Phase 2 output (via /speckit.tasks)
```

### Source Code — Files to Modify

```text
verification-zones/verification-agent/
├── src/
│   └── authorization.py                          ← extend whitelist data structure + logging
├── tests/
│   ├── test_authorization.py                     ← NEW: dedicated label unit tests
│   ├── test_main.py                              ← update AuthorizationResult mocks
│   └── test_slack_url_resolver.py               ← update load_whitelist_config mock
└── cdk/
    ├── bin/
    │   └── cdk.ts                                ← update parseChannelIdContext()
    ├── lib/
    │   ├── types/
    │   │   └── cdk-config.ts                     ← add ChannelIdEntry union type
    │   ├── constructs/
    │   │   └── slack-event-handler.ts            ← extract .id in env var serialization
    │   └── lambda/
    │       └── slack-event-handler/
    │           ├── whitelist_loader.py            ← extend loaders + cache structure
    │           └── authorization.py              ← extend AuthorizationResult + log injection
    ├── test/
    │   └── verification-stack.test.ts            ← no changes required
    └── cdk.config.json.example                   ← add object-format examples
```

## Implementation Approach

### Python changes (authorization.py + whitelist_loader.py)

**1. Data structure extension** — `_get_whitelist_from_dynamodb()`

When iterating DynamoDB items for `entity_type == "channel_id"`, also read the optional `label` attribute and populate a `channel_labels: Dict[str, str]` dict. Return it alongside the existing sets.

**2. Secrets Manager parser** — `_get_whitelist_from_secrets_manager()`

Parse each element of `channel_ids` as either:
- `str` → use as ID, no label
- `dict` with `"id"` key → extract `id` and optional `"label"`

**3. Env var parser** — `_get_whitelist_from_env()`

Split each comma-separated token on `:` (max 1 split). First part is ID, optional second part is label.

**4. Cache structure** — `load_whitelist_config()`

Add `"channel_labels": Dict[str, str]` to the returned dict and the in-memory cache.

**5. AuthorizationResult dataclass**

Add `channel_label: Optional[str] = None` to both copies (agent src and Lambda).

**6. authorize_request() / logging**

After resolving `channel_id` authorization, look up `whitelist["channel_labels"].get(channel_id)`. Inject `"channel_label"` into success and failure log events when non-None/non-empty.

### TypeScript changes (CDK)

**1. cdk-config.ts** — Define `ChannelIdEntry` union type; update `CdkConfig` interface and Zod schema.

**2. cdk.ts** — Update `parseChannelIdContext()` to return `ChannelIdEntry[]`; handle JSON-parsed objects.

**3. slack-event-handler.ts** — Update `SlackEventHandlerProps`; extract `.id` from objects before `join(",")` for Lambda env var (handler.py unchanged).

**4. cdk.config.json.example** — Show both string and object format in example.

### Tests

- `test_authorization.py` (new): Unit tests for each loader function with labeled entries and backward-compat.
- `test_main.py`: Update `AuthorizationResult` mock to include `channel_label` field.
- `test_slack_url_resolver.py`: Update `load_whitelist_config` mock to include `channel_labels` key.
- CDK Jest tests: No changes required.

## Complexity Tracking

No constitution violations. No complexity justification required.
