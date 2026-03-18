# Data Model: Verification Zone Usage History (039)

**Date**: 2026-03-16

## Entities

### UsageRecord (DynamoDB)

Central entity for one request/response cycle. **テキスト本文は DynamoDB に格納しない** — 機密性保持のため入出力テキストは S3 (ContentFile) に分離する。DynamoDB はメタデータとインデックスのみ保持する。

| Attribute | Type | Notes |
|---|---|---|
| `channel_id` | String | PK — Slack channel ID |
| `request_id` | String | SK — `{timestamp_ms}#{correlation_id}` |
| `ttl` | Number | Unix epoch; 90 days from `created_at` |
| `correlation_id` | String | GSI PK; cross-reference to CloudWatch Logs |
| `team_id` | String | Slack workspace ID |
| `user_id` | String | Slack user ID |
| `created_at` | String | ISO 8601 UTC |
| `s3_content_prefix` | String | S3 prefix for input/output text files e.g. `content/C123/2026/03/16/corr-xyz/` |
| `pipeline_result` | Map | See PipelineResult below |
| `orchestration` | Map | See OrchestrationResult below; absent if pipeline rejected |
| `duration_ms` | Number | Total request duration in milliseconds |
| `attachment_keys` | List\<String\> | S3 keys of saved attachments (empty if none) |
| `skipped_attachments` | List\<Map\> | `{key, reason}` entries for skipped files |

**Indexes**:
- Primary: PK=`channel_id`, SK=`request_id`
- GSI `correlation_id-index`: PK=`correlation_id`, Projection=ALL

**Access patterns**:
- Get latest N records for channel: Query PK=`channel_id`, ScanIndexForward=False, Limit=N
- Get date range for channel: Query PK=`channel_id`, SK `begins_with("{timestamp_range}")`
- Get by correlation_id: Query GSI, PK=`correlation_id`

---

### PipelineResult (embedded Map in UsageRecord)

| Field | Type | Notes |
|---|---|---|
| `existence_check` | Boolean | true = passed |
| `authorization` | Boolean | true = passed |
| `rate_limited` | Boolean | true = request was rate-limited (rejected) |
| `rejection_stage` | String | Stage name if rejected, absent if all passed |
| `rejection_reason` | String | Human-readable reason if rejected, absent if all passed |

---

### OrchestrationResult (embedded Map in UsageRecord)

Present only when pipeline passed and orchestration ran.

| Field | Type | Notes |
|---|---|---|
| `agents_called` | List\<String\> | Agent IDs invoked (e.g. `["file-creator", "fetch-url"]`) |
| `turns_used` | Number | Strands agentic loop iteration count |
| `success` | Boolean | true = orchestration completed without error |

---

### ContentFile (S3 object)

入出力テキスト本文。機密性保持のため DynamoDB に格納せず S3 に分離。

**S3 key pattern**:
- `content/{channel_id}/{YYYY/MM/DD}/{correlation_id}/input.json`
- `content/{channel_id}/{YYYY/MM/DD}/{correlation_id}/output.json`

**S3 bucket**: `{stackName}-usage-history`

**Lifecycle**: Expiration after 90 days on `content/` prefix.

| Attribute | Notes |
|---|---|
| `content` format | `{"text": "...full text..."}` (JSON) |
| Absent when | Pipeline rejected before enrichment (input) or orchestration failed (output) — file is not created |
| Expiration | 90 days (bucket lifecycle rule, aligned with DynamoDB TTL) |

---

### AttachmentFile (S3 object)

Slack 添付ファイルの永続化。S3 objects referenced from `UsageRecord.attachment_keys`.

**S3 key pattern**: `attachments/{channel_id}/{YYYY/MM/DD}/{correlation_id}/{original_filename}`

**S3 bucket**: `{stackName}-usage-history`

**Lifecycle**: Expiration after 90 days on `attachments/` prefix.

| Attribute | Source |
|---|---|
| Key | Constructed from channel_id + date + correlation_id + filename |
| Content | Copied from temp exchange bucket |
| Content-Type | Preserved from source object |
| Expiration | 90 days (bucket lifecycle rule) |

---

## Relationships

```
UsageRecord (DynamoDB) — metadata + indexes only
  ├── s3_content_prefix → ContentFile (S3) [0..2]
  │     content/{channel_id}/{date}/{correlation_id}/input.json
  │     content/{channel_id}/{date}/{correlation_id}/output.json
  └── attachment_keys: List → AttachmentFile (S3) [0..N]
        attachments/{channel_id}/{date}/{correlation_id}/{filename}
```

## Storage Summary

| Entity | Store | Contains | Retention |
|---|---|---|---|
| UsageRecord | DynamoDB `{stack}-usage-history` | Metadata, indexes, pipeline/orchestration results | 90 days (TTL) |
| ContentFile | S3 `{stack}-usage-history` `content/` prefix | Input text, output text (機密分離) | 90 days (lifecycle) |
| AttachmentFile | S3 `{stack}-usage-history` `attachments/` prefix | Slack file attachments | 90 days (lifecycle) |
