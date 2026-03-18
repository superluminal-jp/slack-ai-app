# Quickstart: DynamoDB Usage History Daily S3 Export via PITR

**Feature**: 040-dynamodb-pitr-export
**Date**: 2026-03-16

---

## Prerequisites

- Dev stack deployed (`SlackAI-Verification-Dev`)
- AWS CLI configured with appropriate credentials
- `jq` installed

---

## Scenario 1: Verify PITR is Enabled on Usage History Table

```bash
TABLE_NAME="SlackAI-Verification-Dev-usage-history"

aws dynamodb describe-continuous-backups \
  --table-name "$TABLE_NAME" \
  --query "ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus" \
  --output text
# Expected: ENABLED
```

---

## Scenario 2: Manually Trigger Daily Export

```bash
STACK_NAME="SlackAI-Verification-Dev"
EXPORT_LAMBDA="$(aws lambda list-functions \
  --query "Functions[?contains(FunctionName,'DynamoDbExport')].FunctionName" \
  --output text)"

# Invoke the export Lambda directly
aws lambda invoke \
  --function-name "$EXPORT_LAMBDA" \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  /tmp/export-response.json

cat /tmp/export-response.json
# Expected: {"status": "export_initiated", "export_arn": "arn:aws:dynamodb:..."}
```

---

## Scenario 3: Verify Export Appears in S3

After the export completes (typically 5–30 minutes for small tables):

```bash
BUCKET_NAME="slackai-verification-dev-usage-history"
DATE_PATH=$(date -u +"%Y/%m/%d")

aws s3 ls "s3://${BUCKET_NAME}/dynamodb-exports/${DATE_PATH}/" --recursive | head -20
# Expected: manifest files and data/ directory with .json.gz files
```

Verify the manifest summary:

```bash
MANIFEST_KEY=$(aws s3 ls "s3://${BUCKET_NAME}/dynamodb-exports/${DATE_PATH}/" \
  --recursive --query "Contents[?contains(Key,'manifest-summary.json')].Key" \
  --output text | head -1)

aws s3 cp "s3://${BUCKET_NAME}/${MANIFEST_KEY}" - | python3 -m json.tool
# Expected: JSON with exportStatus="COMPLETED", itemCount>0
```

---

## Scenario 4: Verify S3 Lifecycle Rule for `dynamodb-exports/` Prefix

```bash
BUCKET_NAME="slackai-verification-dev-usage-history"

aws s3api get-bucket-lifecycle-configuration \
  --bucket "$BUCKET_NAME" \
  --query "Rules[?Prefix=='dynamodb-exports/']"
# Expected: rule with ExpirationInDays=90
```

---

## Scenario 5: Verify EventBridge Rule Schedule

```bash
aws scheduler list-schedules \
  --query "Schedules[?contains(Name,'DailyExport')].{Name:Name,Expression:ScheduleExpression,State:State}" \
  --output table
# Expected: schedule with ScheduleExpression="cron(0 15 * * ? *)", State=ENABLED
# cron(0 15 * * ? *) = UTC 15:00 = JST 00:00
```

---

## Expected Failure Modes

| Scenario | Expected Behavior |
|----------|-------------------|
| PITR not enabled | Export Lambda fails; CloudWatch alarm fires; no S3 objects created |
| S3 bucket policy missing | DynamoDB service cannot write; export remains in IN_PROGRESS then fails |
| Table empty | Export succeeds with itemCount=0; empty `data/` directory |
| Lambda invoked twice same day | Two export IDs created under same date prefix; both preserved |
