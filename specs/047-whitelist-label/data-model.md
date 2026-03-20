# Data Model: Whitelist Channel Label (047)

**Phase 1 output for `/speckit.plan`**

---

## Entities

### WhitelistEntry (DynamoDB)

Existing entity — one item per authorized entity. `channel_id` entries gain an optional `label` attribute.

| Attribute | Type | Required | Description |
|---|---|---|---|
| `entity_type` | String (PK) | Yes | `"team_id"` / `"user_id"` / `"channel_id"` |
| `entity_id` | String (SK) | Yes | Slack ID (e.g. `"C0123456789"`) |
| `label` | String | No | Human-readable name (e.g. `"#general"`). `channel_id` entries only. |

No table schema migration required. `label` is an optional attribute on existing items.

---

### Whitelist (in-memory, Python)

Runtime data structure loaded into memory and cached for 5 minutes.

**Before (current)**:
```python
{
    "team_ids":    Set[str],
    "user_ids":    Set[str],
    "channel_ids": Set[str],
    "cached_at":   int,
    "ttl":         int
}
```

**After (this feature)**:
```python
{
    "team_ids":       Set[str],
    "user_ids":       Set[str],
    "channel_ids":    Set[str],
    "channel_labels": Dict[str, str],  # channel_id → label (only populated entries)
    "cached_at":      int,
    "ttl":            int
}
```

`channel_labels` contains only entries where a label was explicitly provided. IDs without labels are absent from this dict.

---

### AuthorizationResult (Python dataclass)

**Before (current)**:
```python
@dataclass
class AuthorizationResult:
    authorized: bool
    team_id: Optional[str]
    user_id: Optional[str]
    channel_id: Optional[str]
    unauthorized_entities: List[str]
    error_message: Optional[str]
    timestamp: int
```

**After (this feature)**:
```python
@dataclass
class AuthorizationResult:
    authorized: bool
    team_id: Optional[str]
    user_id: Optional[str]
    channel_id: Optional[str]
    channel_label: Optional[str]       # ← new, None when no label registered
    unauthorized_entities: List[str]
    error_message: Optional[str]
    timestamp: int
```

---

### ChannelIdEntry (TypeScript CDK)

New union type for CDK configuration. Replaces `string` in channel ID arrays.

```typescript
export type ChannelIdEntry = string | { id: string; label: string };
```

**CdkConfig interface update**:
```typescript
// Before
autoReplyChannelIds?: string[];
mentionChannelIds?: string[];

// After
autoReplyChannelIds?: ChannelIdEntry[];
mentionChannelIds?: ChannelIdEntry[];
```

**Zod schema update**:
```typescript
const channelIdEntrySchema = z.union([
  z.string(),
  z.object({ id: z.string(), label: z.string() })
]);

// In CdkConfigSchema:
autoReplyChannelIds: z.array(channelIdEntrySchema).optional(),
mentionChannelIds: z.array(channelIdEntrySchema).optional(),
```

---

## Configuration Format Reference

### DynamoDB item (AWS Console / CLI)
```json
{
  "entity_type": {"S": "channel_id"},
  "entity_id":   {"S": "C0123456789"},
  "label":       {"S": "#general"}
}
```

### Secrets Manager JSON
```json
{
  "team_ids":    ["T0123456789"],
  "user_ids":    [],
  "channel_ids": [
    "C0000000000",
    {"id": "C0123456789", "label": "#general"},
    {"id": "C9876543210", "label": "#ops"}
  ]
}
```

### Environment variable
```
WHITELIST_CHANNEL_IDS=C0000000000,C0123456789:#general,C9876543210:#ops
```

### CDK config file (`cdk.config.dev.json`)
```json
{
  "autoReplyChannelIds": [
    "C0000000000",
    {"id": "C0123456789", "label": "#general"}
  ],
  "mentionChannelIds": [
    {"id": "C9876543210", "label": "#ops"}
  ]
}
```

---

## Validation Rules

- `label` is optional on all channel entries across all configuration sources
- `label` value is a raw string; no format enforced (allows `#general`, `general`, `General`, emoji, etc.)
- Empty string label (`""`) is treated as absent
- `label` does not affect authorization outcome — only ID is used for matching
- `channel_labels` dict in memory contains only non-empty labels
