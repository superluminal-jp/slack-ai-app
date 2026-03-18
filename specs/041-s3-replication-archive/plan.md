# Implementation Plan: Usage History S3 Archive Replication (041)

**Branch**: `041-s3-replication-archive` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/041-s3-replication-archive/spec.md`

## Summary

Enable S3 Same-Region Replication (SRR) on the existing `{stack}-usage-history` bucket to automatically copy all objects (`content/`, `attachments/`, `dynamodb-exports/` prefixes) to a new independent archive bucket in the same account. The design is cross-account ready: adding `archiveAccountId` to `cdk.config.json` switches to cross-account mode with zero code changes.

Pure CDK/infrastructure change — no Python agent code changes. All tests are TypeScript Jest CDK unit tests.

## Technical Context

**Language/Version**: TypeScript 5.x (CDK)
**Primary Dependencies**: `aws-cdk-lib` 2.215.0 (stable) — `aws-s3`, `aws-iam`
**Storage**: S3 (two buckets: existing source, new archive destination)
**Testing**: Jest + `aws-cdk-lib/assertions` (`cd cdk && npm test`)
**Target Platform**: AWS (ap-northeast-1)
**Project Type**: CDK construct library (verification-zones/verification-agent/cdk)
**Constraints**: CDK L2 `Bucket` has no replication support → must use L1 `CfnBucket` override for `replicationConfiguration`. Versioning required on both source and destination by AWS.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [X] **SDD (I)**: spec in `specs/041-s3-replication-archive/` exists; acceptance criteria are Given/When/Then verifiable
- [X] **TDD (II)**: test tasks precede implementation tasks; Red→Green→Refactor; `cd cdk && npm test`
- [X] **Security-First (III)**: security pipeline unaffected (infrastructure-only); IAM least-privilege — all resources are ARN-specific, no wildcards
- [X] **Zone Isolation (V)**: pure CDK change within verification zone; no cross-zone imports
- [X] **Doc & Deploy Parity (VI)**: README/CHANGELOG/CLAUDE.md update tasks included; no new `CfnOutput` keys → `scripts/deploy.sh` unchanged

## Project Structure

### Documentation (this feature)

```text
specs/041-s3-replication-archive/
├── spec.md
├── plan.md              ← this file
├── research.md
├── quickstart.md
└── tasks.md             ← /speckit.tasks output
```

### Source Code (affected files)

```text
verification-zones/verification-agent/cdk/
├── lib/
│   ├── constructs/
│   │   ├── usage-history-bucket.ts          MODIFIED — versioned: true + noncurrent lifecycle
│   │   ├── usage-history-archive-bucket.ts  NEW — archive destination bucket
│   │   └── usage-history-replication.ts     NEW — IAM role + CfnBucket override + bucket policy
│   ├── types/
│   │   └── cdk-config.ts                    MODIFIED — add archiveAccountId?: string
│   └── verification-stack.ts                MODIFIED — instantiate new constructs
├── test/
│   ├── usage-history-bucket.test.ts         MODIFIED — add versioning test
│   ├── usage-history-archive-bucket.test.ts NEW — archive bucket tests
│   └── usage-history-replication.test.ts    NEW — replication construct tests
└── cdk.config.json.example                  MODIFIED — add archiveAccountId example
```

---

## Phase 1: Design

### 1.1 New Construct: `UsageHistoryArchiveBucket`

**File**: `cdk/lib/constructs/usage-history-archive-bucket.ts`

**Props**: none (no external inputs for current same-account phase)

**Bucket configuration**:
- `bucketName`: `${stackName.toLowerCase()}-usage-history-archive`
- `encryption`: `S3_MANAGED`
- `blockPublicAccess`: `BLOCK_ALL`
- `enforceSSL`: true
- `versioned`: **true** (required: S3 Replication destination must have versioning enabled)
- `removalPolicy`: `DESTROY`
- `autoDeleteObjects`: true
- `lifecycleRules`:
  - `expire-archive-content`: prefix `content/`, expiration 90 days
  - `expire-archive-attachments`: prefix `attachments/`, expiration 90 days
  - `expire-archive-dynamodb-exports`: prefix `dynamodb-exports/`, expiration 90 days
  - `expire-noncurrent-versions` (no prefix): `noncurrentVersionExpiration: Duration.days(7)` — cost control

**Outputs**: `bucket: s3.Bucket`

---

### 1.2 New Construct: `UsageHistoryReplication`

**File**: `cdk/lib/constructs/usage-history-replication.ts`

**Props**:
```typescript
interface UsageHistoryReplicationProps {
  sourceBucket: s3.IBucket;
  archiveBucket: s3.IBucket;
  archiveAccountId?: string; // if provided → cross-account mode
}
```

**IAM Replication Role** (`ServicePrincipal: s3.amazonaws.com`):

Inline policy — source bucket permissions:
```
s3:GetReplicationConfiguration, s3:ListBucket  →  sourceBucket.bucketArn
s3:GetObjectVersionForReplication, s3:GetObjectVersionAcl, s3:GetObjectVersionTagging
  →  sourceBucket.bucketArn + "/*"
```

Inline policy — destination permissions:
```
s3:ReplicateObject, s3:ReplicateDelete, s3:ReplicateTags
  →  archiveBucket.bucketArn + "/*"
s3:ObjectOwnerOverrideToBucketOwner  (only when archiveAccountId is provided)
  →  archiveBucket.bucketArn + "/*"
```

**Archive bucket policy** (always added — enables cross-account migration without code changes):
```
Principal: replicationRole.roleArn
Actions:
  s3:ReplicateObject, s3:ReplicateDelete, s3:ReplicateTags
  s3:ObjectOwnerOverrideToBucketOwner  (only when archiveAccountId is provided)
  s3:GetBucketVersioning, s3:PutBucketVersioning  (bucket-level)
Resources:
  archiveBucket.bucketArn          (bucket-level actions)
  archiveBucket.bucketArn + "/*"   (object-level actions)
```

**CfnBucket replication config** (L1 override on source bucket):
```typescript
const cfnSource = sourceBucket.node.defaultChild as s3.CfnBucket;
cfnSource.replicationConfiguration = {
  role: replicationRole.roleArn,
  rules: [{
    id: 'replicate-all-objects',
    status: 'Enabled',
    filter: { prefix: '' },          // V2 format, empty prefix = all objects
    destination: {
      bucket: archiveBucket.bucketArn,
      ...(archiveAccountId && {
        account: archiveAccountId,
        accessControlTranslation: { owner: 'Destination' },
      }),
    },
    deleteMarkerReplication: { status: 'Disabled' },  // do not replicate deletions
  }],
};
```

**`deleteMarkerReplication: Disabled`** rationale: Prevents accidental deletion in the archive if source objects are deleted; the archive retains data independently (spec FR-004: archive is independent protection).

---

### 1.3 Modified Construct: `UsageHistoryBucket`

**File**: `cdk/lib/constructs/usage-history-bucket.ts`

Changes:
1. `versioned: false` → `versioned: true` (required by S3 Replication source)
2. Add noncurrent version lifecycle rule (no prefix, covers all objects):
   ```typescript
   {
     id: 'expire-noncurrent-versions',
     noncurrentVersionExpiration: cdk.Duration.days(7),
     abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
     enabled: true,
   }
   ```

**No other changes.** Existing `content/`, `attachments/`, `dynamodb-exports/` rules unchanged.

---

### 1.4 Modified: `VerificationStack`

**File**: `cdk/lib/verification-stack.ts`

Additions (after `usageHistoryBucket`):
```typescript
const usageHistoryArchiveBucket = new UsageHistoryArchiveBucket(this, 'UsageHistoryArchiveBucket');

new UsageHistoryReplication(this, 'UsageHistoryReplication', {
  sourceBucket: usageHistoryBucket.bucket,
  archiveBucket: usageHistoryArchiveBucket.bucket,
  archiveAccountId: props.archiveAccountId,  // undefined for same-account
});
```

`VerificationStackProps` gains optional `archiveAccountId?: string`.

---

### 1.5 Config Extension: `CdkConfig`

**`cdk-config.ts`** — add to `CdkConfig` interface and Zod schema:
```typescript
archiveAccountId?: string;  // 12-digit AWS account ID for cross-account archive
```

Zod validation: `.regex(/^\d{12}$/, ...).optional()`

**`cdk.config.json.example`** — add comment entry:
```json
"archiveAccountId": "TARGET_ARCHIVE_AWS_ACCOUNT_ID (optional; omit for same-account)"
```

**`applyEnvOverrides`** — add:
```typescript
archiveAccountId: process.env.ARCHIVE_ACCOUNT_ID?.trim() || config.archiveAccountId,
```

**`verification-stack.ts` main wiring** — pass `config.archiveAccountId` through `VerificationStackProps`.

---

## IAM Design Summary

| Role | Trust | Source Permissions | Destination Permissions |
|------|-------|--------------------|------------------------|
| `{stack}-usage-history-replication` | `s3.amazonaws.com` | GetReplicationConfiguration, ListBucket, GetObjectVersion{ForReplication,Acl,Tagging} | ReplicateObject, ReplicateDelete, ReplicateTags [+ ObjectOwnerOverrideToBucketOwner if cross-account] |

All resources are ARN-specific — no wildcards (Constitution III).

---

## Cross-Account Migration Path (future, zero code changes)

1. Create archive bucket in target account (manual or separate CDK app)
2. Set `archiveAccountId: "123456789012"` in `cdk.config.{env}.json` (or `ARCHIVE_ACCOUNT_ID` env var)
3. Re-deploy verification zone: `DEPLOYMENT_ENV=dev ./scripts/deploy.sh`
4. The target account's bucket policy must be updated to trust the replication role ARN from the source account — this is the one manual step required in the target account

No source code changes required.
