# Research: Verification Zone Usage History (039)

**Date**: 2026-03-16
**Branch**: `039-usage-history`

## 1. Storage Architecture

**Decision**: DynamoDB for metadata/indexes only; S3 for all content (input text, output text, attachments).

**Rationale**:
- **機密分離**: Input/output text contains user message content — storing it in DynamoDB (where access is controlled only by IAM role) creates broader exposure than S3 with prefix-level access control and bucket policies. S3 also supports future fine-grained access (presigned URLs, bucket policies per prefix).
- DynamoDB retains its role as the queryable index (channel/date/correlation_id lookups) without holding sensitive content.
- S3 is already used for temporary file exchange; the same bucket with dedicated `content/` and `attachments/` prefixes separates purposes cleanly.
- Rejected: DynamoDB for text — sensitive content in DynamoDB is harder to audit, harder to restrict access to specific fields, and subject to the 400 KB item limit.
- Rejected: RDS/Aurora — operational overhead not justified for append-only audit log.

## 2. DynamoDB Table Design

**Decision**:
- PK: `channel_id` (STRING) — enables "get history for channel" without scan
- SK: `request_id` (STRING, format `{timestamp_ms}#{correlation_id}`) — enables time-ordered range queries within a channel
- GSI `correlation_id-index`: PK=`correlation_id` — enables exact lookup by correlation_id for debugging
- TTL attribute: `ttl` (Unix epoch, 90 days from write)
- Billing: PAY_PER_REQUEST (consistent with all existing tables)
- Encryption: AWS_MANAGED (consistent with all existing tables)

**Rationale**:
- PK=channel_id matches the primary access pattern (show history for a specific channel).
- Composite SK with timestamp prefix enables `begins_with` range queries for date filtering.
- Separate GSI for correlation_id lookup adds minimal cost (projection ALL needed for full record retrieval).
- Rejected PK=team_id: too coarse — all channels in a workspace share one partition, creating hotspot risk.
- Rejected PK=correlation_id: cannot do channel/date range queries without full scan.

## 3. S3 Bucket for Content and Attachments

**Decision**: New dedicated S3 bucket `{stackName}-usage-history` with two top-level prefixes: `content/` (input/output text) and `attachments/` (Slack files).

**Rationale**:
- Single bucket simplifies IAM and CDK management vs. two separate buckets.
- Prefix-level lifecycle rules (`content/` and `attachments/` both 90 days) keep retention aligned with DynamoDB TTL.
- Separate from `{stackName}-file-exchange` (1-day lifecycle) to avoid conflicts.
- Same security posture as file-exchange: SSE-S3, enforceSSL, BlockPublicAccess, DESTROY+autoDeleteObjects.
- IAM: verification-agent gets `PutObject` on `content/*` and `attachments/*` prefixes (write-only from agent's perspective).

**S3 key structure**:
```
content/{channel_id}/{YYYY/MM/DD}/{correlation_id}/input.json
content/{channel_id}/{YYYY/MM/DD}/{correlation_id}/output.json
attachments/{channel_id}/{YYYY/MM/DD}/{correlation_id}/{original_filename}
```

## 4. Integration Point in Pipeline

**Decision**: Call `save_usage_record()` as the final step in `pipeline.py`'s `run()` method, after response dispatch.

**Rationale**:
- Must be after response dispatch so `output_text` and `has_files` are known.
- Wrapped in `try/except Exception` → log WARNING + continue (Constitution IV: fail-open for infrastructure).
- Pipeline result flags (existence_check, authorization, rate_limit) are already available at each decision point; pass them as a `PipelineResult` value object.
- Rejected: async/background write — Bedrock AgentCore Runtime is sync Python; introducing async adds complexity without benefit (write takes <10ms for typical records).

## 5. Attachment Copy Strategy

**Decision**: Use `s3.copy_object()` from temp bucket to usage-history bucket. Do not re-download from Slack.

**Rationale**:
- Files are already in S3 temp bucket (`attachments/{correlation_id}/` prefix) after `s3_file_manager.py` upload.
- Server-side S3 copy is faster and cheaper than re-download.
- Preserves original filename and content type.
- If copy fails → log WARNING, record `attachment_keys` as empty list, continue (fail-open).

## 6. IAM Least Privilege

**Decision**:
- DynamoDB: `PutItem` only (no reads needed from verification-agent for writing history). GSI writes are implicit.
- S3: `PutObject` on `content/*` and `attachments/*` prefixes only. No `GetObject` needed for write path.
- Future read access (for retrieval tools) would require separate `GetObject` grant on both prefixes.

**Rationale**: Constitution III (least-privilege). History writing is append-only from the agent's perspective. Separating content/ and attachments/ grants allows future fine-grained access control per data type.

## 7. Error Handling Model

**Decision**: Unified `try/except Exception` around the entire `save_usage_record()` call.

**Rationale**:
- Any failure (DynamoDB unavailable, S3 throttle, serialization error) must not surface to the user.
- All exceptions logged with `correlation_id`, `error`, `error_type` per Constitution IV.
- No retry — keeping it simple; CloudWatch Logs provide the audit trail even if DynamoDB write fails.
