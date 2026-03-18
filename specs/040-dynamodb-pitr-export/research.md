# Research: DynamoDB Usage History Daily S3 Export via PITR

**Feature**: 040-dynamodb-pitr-export
**Date**: 2026-03-16

---

## Decision 1: Scheduling Mechanism — EventBridge Scheduler (Stable L2 in aws-cdk-lib)

**Decision**: Use `aws-cdk-lib/aws-scheduler` + `aws-cdk-lib/aws-scheduler-targets` (EventBridge Scheduler) to trigger a daily Lambda.

**Rationale**: EventBridge Scheduler L2 constructs are available directly in `aws-cdk-lib` 2.215.0 (no alpha package required). EventBridge Scheduler is the newer, recommended AWS service for time-based invocations: it provides built-in retry policies, dead-letter queue support, flexible time windows, and better timezone handling vs EventBridge Rules.

**Alternatives considered**:
- EventBridge Rules (`aws-events` + `aws-events-targets`): also stable and sufficient, but EventBridge Scheduler is the preferred modern approach for scheduled invocations
- EventBridge Scheduler L1 CfnSchedule: more verbose; no advantage over L2

**Implementation**:
```typescript
import { Schedule, ScheduleExpression } from "aws-cdk-lib/aws-scheduler";
import { LambdaInvoke } from "aws-cdk-lib/aws-scheduler-targets";

new Schedule(this, "DailyExportSchedule", {
  schedule: ScheduleExpression.cron({ hour: "15", minute: "0" }),  // UTC 15:00 = JST 00:00
  target: new LambdaInvoke(exportLambda),
  description: "Daily DynamoDB usage-history export to S3 (JST 00:00)",
});
```

---

## Decision 2: Export Trigger — Python Lambda calling ExportTableToPointInTime API

**Decision**: A small Python 3.11 Lambda function calls `dynamodb:ExportTableToPointInTime` to initiate the DynamoDB native export. The export runs asynchronously within the DynamoDB service.

**Rationale**: DynamoDB's native Export to S3 feature handles large exports efficiently (parallel multi-GB exports with no timeout concerns). The Lambda only needs to initiate the export (milliseconds), so the 60-second default Lambda timeout is sufficient. No custom data-reading logic is needed.

**Alternatives considered**:
- Step Functions + DynamoDB Scan: complex, expensive for large tables, re-implements what DynamoDB export does natively
- Direct EventBridge → DynamoDB (no Lambda): EventBridge does not have a built-in target for DynamoDB ExportTableToPointInTime

**Lambda code pattern**:
```python
import boto3, os, datetime

def lambda_handler(event, context):
    ddb = boto3.client("dynamodb", region_name=os.environ["AWS_REGION_NAME"])
    s3_bucket = os.environ["EXPORT_BUCKET_NAME"]
    table_arn = os.environ["TABLE_ARN"]
    date_path = datetime.datetime.now(datetime.timezone.utc).strftime("%Y/%m/%d")

    ddb.export_table_to_point_in_time(
        TableArn=table_arn,
        S3Bucket=s3_bucket,
        S3Prefix=f"dynamodb-exports/{date_path}",
        ExportFormat="DYNAMODB_JSON",
    )
```

---

## Decision 3: S3 Permissions for DynamoDB Export — Lambda Role (No Service Principal)

**Decision**: Grant S3 write permissions directly to the Lambda execution role. No DynamoDB service principal bucket policy is needed.

**Rationale**: When `ExportTableToPointInTime` is called, DynamoDB uses the **calling IAM role's permissions** to write to S3 — not a separate service role. There is no `dynamodb.amazonaws.com` service principal for this operation. The Lambda role must hold both the DynamoDB export permission and S3 write permissions.

**Lambda IAM permissions required**:
```
dynamodb:ExportTableToPointInTime  → table ARN
s3:PutObject                       → bucket/dynamodb-exports/*
s3:AbortMultipartUpload            → bucket/dynamodb-exports/*
s3:PutObjectAcl                    → bucket/dynamodb-exports/*
```

**CDK implementation**:
```typescript
// Grant dynamodb export
exportLambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ["dynamodb:ExportTableToPointInTime"],
  resources: [props.table.tableArn],
}));

// Grant S3 write
props.bucket.grantPut(exportLambda, "dynamodb-exports/*");
exportLambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ["s3:AbortMultipartUpload"],
  resources: [`${props.bucket.bucketArn}/dynamodb-exports/*`],
}));
```

**No bucket policy change needed** for same-account exports (the default case).

---

## Decision 4: Export Format — DYNAMODB_JSON

**Decision**: Use `DYNAMODB_JSON` format (not `ION`).

**Rationale**: DynamoDB JSON is human-readable, more widely understood, and compatible with standard JSON tooling (Athena, jq, etc.). ION is a binary superset that adds compression but requires specialized tooling.

---

## Decision 5: S3 Prefix Pattern — `dynamodb-exports/{YYYY/MM/DD}/`

**Decision**: Use `dynamodb-exports/{YYYY/MM/DD}/` as the S3 prefix, calculated at Lambda invocation time.

**Rationale**: Aligns with the existing `content/{channel_id}/{YYYY/MM/DD}/` and `attachments/{channel_id}/{YYYY/MM/DD}/` patterns in the usage-history bucket. Multiple exports on the same day are stored in the same date prefix (DynamoDB appends a unique export ID suffix automatically).

---

## Decision 6: PITR Enablement — CDK `pointInTimeRecovery: true`

**Decision**: Add `pointInTimeRecovery: true` to the existing `UsageHistoryTable` CDK construct.

**Rationale**: DynamoDB ExportTableToPointInTime requires PITR to be enabled. PITR also provides independent recovery capability (restore to any second in the past 35 days).

**Note**: Enabling PITR on an existing table does not cause any data loss or downtime; it activates continuous backups immediately.

---

## Decision 7: Lifecycle Rule for `dynamodb-exports/` — 90 days

**Decision**: Add a third lifecycle rule to `UsageHistoryBucket` for the `dynamodb-exports/` prefix with 90-day expiration, matching the `content/` and `attachments/` rules.

**Rationale**: Consistent retention across all data types in the usage-history bucket. Prevents unbounded storage cost accumulation from daily exports.

---

## Decision 8: CloudWatch Alarm for Export Failures

**Decision**: Add a CloudWatch Alarm on the export trigger Lambda's error count (metric: `Errors`, namespace: `AWS/Lambda`).

**Rationale**: Spec FR-005 requires CloudWatch recording of job success/failure. SC-004 requires notification when failures occur. Lambda CloudWatch metrics are automatically published by AWS; no custom instrumentation needed.
