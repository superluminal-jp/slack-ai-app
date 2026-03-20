# Research: Whitelist Channel Label (047)

**Phase 0 output for `/speckit.plan`**

---

## 1. Current Whitelist Data Structure

### Python (both agent src and Lambda handler)

The whitelist is loaded into a dict with three `Set[str]` keys:

```python
{
    "team_ids":    Set[str],   # authorized team IDs
    "user_ids":    Set[str],   # authorized user IDs
    "channel_ids": Set[str],   # authorized channel IDs
    # plus caching metadata:
    "cached_at": int,
    "ttl": int
}
```

**Decision**: Extend with `"channel_labels": Dict[str, str]` mapping channel ID → label. This is additive and non-breaking.

### TypeScript CDK config

`CdkConfig.autoReplyChannelIds` and `mentionChannelIds` are currently `string[]`.

**Decision**: Introduce union type `ChannelIdEntry = string | { id: string; label: string }` and update all consumers.

---

## 2. Affected Files

### Python — Agent src
| File | Change |
|---|---|
| `verification-zones/verification-agent/src/authorization.py` | `_get_whitelist_from_dynamodb`, `_get_whitelist_from_secrets_manager`, `_get_whitelist_from_env`, `load_whitelist_config`, `AuthorizationResult`, `authorize_request` |

### Python — Lambda handler copy
| File | Change |
|---|---|
| `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/whitelist_loader.py` | Same three loader functions + cache structure |
| `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/authorization.py` | `AuthorizationResult` dataclass + `authorize_request` log injection |

### TypeScript CDK
| File | Change |
|---|---|
| `cdk/lib/types/cdk-config.ts` | Add `ChannelIdEntry` union type; update interface + Zod schema |
| `cdk/bin/cdk.ts` | Update `parseChannelIdContext()` return type and parsing logic |
| `cdk/lib/constructs/slack-event-handler.ts` | Update props type; extract `.id` when serializing env var |
| `cdk/cdk.config.json.example` | Show object-format examples |

### Tests
| File | Change |
|---|---|
| `tests/test_authorization.py` (new) | Dedicated tests for label loading (DynamoDB, Secrets Manager, env var) |
| `tests/test_main.py` | Update mocks to include `channel_label` in `AuthorizationResult` |
| `tests/test_slack_url_resolver.py` | Update `load_whitelist_config` mock to include `channel_labels` |
| `cdk/test/verification-stack.test.ts` | No changes required |

---

## 3. DynamoDB Schema Decision

**Decision**: No schema migration required.

`label` is stored as an optional DynamoDB `S` attribute on existing items. Items without `label` continue to work. Items with `label` expose it in logs.

DynamoDB item shape after change:
```
entity_type (PK): "channel_id"
entity_id   (SK): "C0123456789"
label           : "#general"       ← optional, new
```

---

## 4. Secrets Manager Format Decision

**Decision**: Support both formats simultaneously (mixed arrays allowed).

```json
{
  "channel_ids": [
    "C0123456789",
    {"id": "C9876543210", "label": "#ops"}
  ]
}
```

Parsing logic: if element is `str` → use as-is with empty label; if `dict` with `"id"` key → extract `id` and `label`.

---

## 5. Environment Variable Format Decision

**Decision**: Support `ID:label` suffix extension.

```
WHITELIST_CHANNEL_IDS=C0123456789:#general,C9876543210:#ops,C1111111111
```

Parsing: split on `,`, then split each token on `:` (max split 1). First part is ID, optional second part is label.

---

## 6. CDK Config Format Decision

**Decision**: Accept both `string` and `{id, label}` object per element. Lambda env var always receives comma-separated IDs only (labels stripped in CDK, not passed to Python).

This means:
- Python handler.py (`AUTO_REPLY_CHANNEL_IDS`, `MENTION_CHANNEL_IDS` env vars) → **no change**
- CDK extracts `.id` from objects before calling `.join(",")` for Lambda env var

---

## 7. Log Injection Decision

**Decision**: Add `channel_label` field to authorization success and failure log events only when a label is present (omit key when label is absent or empty).

Rationale: Avoids adding `null` noise to logs for entries without labels. Tests can verify presence/absence.

---

## 8. AuthorizationResult Extension Decision

**Decision**: Add `channel_label: Optional[str] = None` to `AuthorizationResult` dataclass in both Python files.

Rationale: Callers (pipeline, handler) that log the result can access the label without reloading whitelist config.

---

## 9. Alternatives Considered

| Option | Rejected Because |
|---|---|
| Separate `label` table | Extra DynamoDB table; label is cosmetic only, not worth schema separation |
| Require label for all channel entries | Breaks backward compatibility; label is optional by design |
| Pass label as Lambda env var via CDK | Env var format complexity; labels are CDK-build-time concern, not runtime |
| Add label to team_id / user_id entries | Out of scope per FR-010; revisit as separate feature if needed |
