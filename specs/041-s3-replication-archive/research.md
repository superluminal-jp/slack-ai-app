# Research: Usage History S3 Archive Replication (041)

**Branch**: `041-s3-replication-archive` | **Date**: 2026-03-16

---

## Decision 1: CDK L1 vs L2 for Replication Configuration

**Decision**: CDK L1 (`CfnBucket.replicationConfiguration`) — L2 has no replication support.

**Rationale**: `aws-cdk-lib/aws-s3` L2 `Bucket` construct does not expose a `replicationConfiguration` prop. Must cast `bucket.node.defaultChild as s3.CfnBucket` and set the property directly. This pattern is already used in the codebase for other L1 overrides (e.g., DynamoDB PITR in 040).

**Alternatives considered**:
- CDK L2 only: impossible — replication not supported.
- Separate `CfnBucket` resource for source: would lose all L2 helpers (grantPut, addToResourcePolicy, etc.) — rejected.

---

## Decision 2: Replication Rule Format (V1 prefix vs V2 filter)

**Decision**: V2 rules format with `filter: { prefix: '' }` (empty prefix = all objects).

**Rationale**: V2 rules use the `filter` field instead of the deprecated top-level `prefix`. An empty `prefix` string means "replicate all objects". V2 is required when `priority` or `deleteMarkerReplication` is set; using V2 consistently avoids migration friction.

**Alternatives considered**:
- V1 format (`prefix: ''` at rule level): deprecated by AWS, mixing V1 and V2 in multi-rule configs causes errors.
- Per-prefix rules (three rules for `content/`, `attachments/`, `dynamodb-exports/`): more verbose; single catch-all rule is simpler and captures future prefixes automatically.

---

## Decision 3: IAM Role Structure

**Decision**: Single IAM replication role (ServicePrincipal: `s3.amazonaws.com`) with least-privilege permissions on both source and destination.

**Source bucket permissions**:
- `s3:GetReplicationConfiguration`, `s3:ListBucket` on source bucket ARN
- `s3:GetObjectVersionForReplication`, `s3:GetObjectVersionAcl`, `s3:GetObjectVersionTagging` on `source/*`

**Destination bucket permissions** (on replication role):
- `s3:ReplicateObject`, `s3:ReplicateDelete`, `s3:ReplicateTags` on `archive/*`

**Destination bucket policy** (added to archive bucket):
- Always added — grants the replication role ARN the same write permissions.
- Same-account: redundant (IAM role alone is sufficient) but harmless.
- Cross-account: required (bucket policy is the only mechanism that trusts an external IAM principal).
- **Key insight**: always adding the bucket policy means cross-account migration = zero code changes.

**`s3:ObjectOwnerOverrideToBucketOwner`**: included in both role policy AND bucket policy when cross-account mode is detected (`archiveAccountId` provided in config).

**Rationale**: Bucket policy always present eliminates the code-change gate for cross-account. IAM least-privilege — no wildcard resources.

---

## Decision 4: Cross-Account vs Same-Account Detection

**Decision**: Runtime detection via optional `archiveAccountId` config field.

**Behavior**:
- `archiveAccountId` absent (default): same-account mode. Replication destination has no `account` or `accessControlTranslation` fields.
- `archiveAccountId` present: cross-account mode. Replication destination includes `account: archiveAccountId` and `accessControlTranslation: { owner: 'Destination' }`.

**Rationale**: CDK `Stack.of(this).account` resolves to a token (`${AWS::AccountId}`) at synth time when not explicitly set — comparing it with a string is unreliable. Using an explicit opt-in prop avoids token-comparison issues and makes the intent explicit in the config file.

**Alternatives considered**:
- Always include `account` field (even for same-account): AWS documentation states `account` is for cross-account only; including it for same-account causes CloudFormation warnings.
- Comparing stack account token: unreliable at synth time — rejected.

---

## Decision 5: Versioning Strategy

**Decision**: Enable `versioned: true` on both source (`UsageHistoryBucket`) and destination (`UsageHistoryArchiveBucket`). Add `noncurrentVersionExpiration: Duration.days(7)` lifecycle rule globally on each bucket.

**Rationale**: S3 Replication requires versioning on BOTH buckets (AWS hard requirement). A 7-day noncurrent version expiration prevents version accumulation — since replication is the only reason versioning is enabled, we don't need long history. A global (no-prefix) noncurrent version rule covers all prefixes without duplication.

**Cost impact**: Noncurrent versions incur S3 storage charges proportional to object churn. 7-day retention limits exposure while providing a recovery window for accidental deletions during that window.

**Alternatives considered**:
- `noncurrentVersionsToRetain: 3`: predictable object count, but doesn't prevent very old small-object accumulation. `Duration.days(7)` is simpler to reason about.
- No noncurrent version expiration: versions accumulate indefinitely — rejected (violates cost control principle).

---

## Decision 6: New Constructs vs Modified Existing

**Decision**: Two new constructs + modification of existing.

| Construct | File | Role |
|-----------|------|------|
| `UsageHistoryArchiveBucket` (new) | `usage-history-archive-bucket.ts` | Archive destination bucket |
| `UsageHistoryReplication` (new) | `usage-history-replication.ts` | IAM role + CfnBucket override + bucket policy |
| `UsageHistoryBucket` (modified) | `usage-history-bucket.ts` | Add `versioned: true` + noncurrent version lifecycle |

**Rationale**: Single-responsibility principle. `UsageHistoryReplication` encapsulates all replication concerns (IAM + CfnBucket override + bucket policy) without mixing them into the bucket definitions. This also makes the replication construct independently testable.

**Alternatives considered**:
- Add replication config inside `UsageHistoryBucket`: mixes bucket configuration with IAM + cross-construct references — rejected.
- Single combined construct: harder to test; the archive bucket needs to exist independently for lifecycle/security tests — rejected.

---

## Decision 7: `cdk.config.json` Extension

**Decision**: Add optional `archiveAccountId?: string` to `CdkConfig` and `cdk.config.json.example`.

**Environment variable override**: `ARCHIVE_ACCOUNT_ID` → `applyEnvOverrides`.

**Validation**: 12-digit AWS account ID regex (same as `verificationAccountId`), optional field.

**Rationale**: Maintains the existing config-injection pattern already used for `slackSearchAgentArn`, `autoReplyChannelIds`, etc. Zero new mechanisms required.
