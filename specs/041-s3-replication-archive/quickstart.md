# Quickstart: Usage History S3 Archive Replication (041)

## Prerequisites

- Feature 040 deployed (usage-history DynamoDB PITR + S3 export)
- `DEPLOYMENT_ENV=dev` pointing at a live AWS account

---

## Scenario 1 — CDK unit tests pass

```bash
cd verification-zones/verification-agent/cdk
npm test
```

**Expected**: All test suites pass, including:
- `usage-history-bucket.test.ts` — versioning enabled
- `usage-history-archive-bucket.test.ts` — archive bucket security + lifecycle + versioning
- `usage-history-replication.test.ts` — IAM role, bucket policy, CfnBucket replication config

---

## Scenario 2 — Archive bucket exists after deploy

```bash
DEPLOYMENT_ENV=dev ./scripts/deploy.sh
aws s3 ls | grep usage-history-archive
```

**Expected**: Bucket `{stackName.toLowerCase()}-usage-history-archive` appears in the listing.

---

## Scenario 3 — Object replication works (end-to-end)

Trigger a bot conversation or manually upload a test file to the source bucket:

```bash
# Upload a test object to source bucket
aws s3 cp /tmp/test.txt s3://{stack}-usage-history/content/test-channel/2026/03/16/test-correlation-id/input.json

# Wait ~1 minute for replication
sleep 60

# Verify object appears in archive bucket
aws s3 ls s3://{stack}-usage-history-archive/content/test-channel/2026/03/16/test-correlation-id/
```

**Expected**: `input.json` is present in the archive bucket.

---

## Scenario 4 — Replication covers all three prefixes

After a full day of operation (or by manually uploading to each prefix):

```bash
# content/ prefix
aws s3 ls s3://{stack}-usage-history-archive/content/

# attachments/ prefix
aws s3 ls s3://{stack}-usage-history-archive/attachments/

# dynamodb-exports/ prefix (after DynamoDB export Lambda runs at JST 00:00)
aws s3 ls s3://{stack}-usage-history-archive/dynamodb-exports/
```

**Expected**: Objects present in all three prefixes in the archive bucket.

---

## Scenario 5 — Source deletion does not affect archive (independence)

```bash
# Delete from source
aws s3 rm s3://{stack}-usage-history/content/test-channel/2026/03/16/test-correlation-id/input.json

# Verify archive is unaffected
aws s3 ls s3://{stack}-usage-history-archive/content/test-channel/2026/03/16/test-correlation-id/
```

**Expected**: `input.json` still present in archive bucket (`deleteMarkerReplication: Disabled`).

---

## Scenario 6 — Versioning enabled on source bucket (CDK assertion)

```bash
cd verification-zones/verification-agent/cdk
npm test -- --testPathPattern="usage-history-bucket"
```

**Expected**: Test `should have versioning enabled` passes.

---

## Scenario 7 — Cross-account mode activates via config only

```bash
# Set archiveAccountId in config (to a different account ID)
# cdk.config.dev.json: "archiveAccountId": "123456789012"

cd verification-zones/verification-agent/cdk
npx cdk synth | grep -A5 "ReplicationConfiguration"
```

**Expected**: Synthesized CloudFormation includes `Account` and `AccessControlTranslation` fields in the replication destination rule. Without `archiveAccountId`, these fields are absent.

---

## Scenario 8 — Lifecycle rule on archive bucket (90-day expiration)

```bash
aws s3api get-bucket-lifecycle-configuration \
  --bucket {stack}-usage-history-archive \
  --query 'Rules[*].{Prefix:Filter.Prefix,Expiration:Expiration.Days,Status:Status}'
```

**Expected**: Rules for `content/` (90 days), `attachments/` (90 days), `dynamodb-exports/` (90 days), and a noncurrent version expiration rule (7 days).
