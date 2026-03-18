# Data Model: DynamoDB Usage History Daily S3 Export via PITR

**Feature**: 040-dynamodb-pitr-export
**Date**: 2026-03-16

No new data entities are introduced. This feature modifies the configuration of existing infrastructure (DynamoDB table, S3 bucket) and adds a new scheduled operation.

---

## Modified Entity: UsageHistoryTable

**No schema change.** The table's data model (PK=channel_id, SK=request_id, GSI=correlation_id-index, TTL=ttl) is unchanged.

**Configuration change**: `pointInTimeRecovery` enabled (`true`). This activates continuous backups — no schema or data impact.

---

## Modified Entity: UsageHistoryBucket

**No schema change.** A third lifecycle rule is added for the new `dynamodb-exports/` prefix.

| Prefix | Expiration | Purpose |
|--------|-----------|---------|
| `content/` | 90 days | Input/output text (existing) |
| `attachments/` | 90 days | Slack file attachments (existing) |
| `dynamodb-exports/` | 90 days | DynamoDB table exports (**new**) |

**S3 key structure for exports**:
```
dynamodb-exports/{YYYY/MM/DD}/{AWS-generated-export-id}/
  ├── manifest-checksums.json
  ├── manifest-files.json
  ├── manifest-summary.json
  └── data/
      └── {partition-id}.json.gz
```

---

## New Operational Entity: DailyExportJob

Not stored in DynamoDB or S3 directly; managed by EventBridge and Lambda.

| Attribute | Value |
|-----------|-------|
| Schedule | Daily at JST 00:00 (UTC 15:00) |
| Trigger | EventBridge Rule → Lambda |
| Operation | `dynamodb:ExportTableToPointInTime` |
| Target table | `{stackName}-usage-history` |
| Target bucket | `{stackName.toLowerCase()}-usage-history` |
| Target prefix | `dynamodb-exports/{YYYY/MM/DD}/` |
| Export format | DYNAMODB_JSON |
| Export type | FULL_EXPORT (full table snapshot at current time) |
