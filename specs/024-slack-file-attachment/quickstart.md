# Quickstart: 024-slack-file-attachment

## Prerequisites

- AWS CLI configured for verification and execution accounts
- CDK bootstrapped in both accounts
- Slack app configured with `files:read` scope
- Python 3.11, Node.js 18+

## Local Development

### 1. Deploy Infrastructure

```bash
# Deploy execution stack first (no changes for this feature)
cd cdk
npx cdk deploy SlackAI-Execution-Dev

# Deploy verification stack (includes new S3 bucket)
npx cdk deploy SlackAI-Verification-Dev
```

### 2. Verify S3 Bucket

```bash
# Check bucket was created
aws s3 ls | grep file-exchange

# Verify lifecycle rule
aws s3api get-bucket-lifecycle-configuration \
  --bucket <bucket-name>
```

### 3. Run Tests

```bash
# Verification agent tests
cd cdk/lib/verification/agent/verification-agent
pip install -r requirements.txt
pytest tests/ -v

# Execution agent tests
cd cdk/lib/execution/agent/execution-agent
pip install -r requirements.txt
pytest tests/ -v

# CDK tests
cd cdk
npm test
```

### 4. E2E Test

```bash
# Post a message with file attachment in Slack
# Expected: AI response referencing file content in the same thread
```

## Architecture Flow

```
Slack (file + message)
    ↓
Lambda: extract attachment metadata
    ↓
Verification Agent:
  1. Download files from Slack (bot token)
  2. Upload to S3 (attachments/{correlation_id}/{file_id}/{name})
  3. Generate pre-signed GET URLs (15-min expiry)
  4. Send to Execution Agent (pre-signed URLs in payload)
    ↓
Execution Agent:
  1. Download files from S3 (pre-signed URL, no auth needed)
  2. Build Bedrock content blocks (native document + image)
  3. Invoke Bedrock Converse API
  4. Return response
    ↓
Verification Agent:
  1. Post response to Slack (via SQS → Slack Poster)
  2. Delete S3 objects (cleanup)
```

## Key Configuration

| Variable | Where | Value |
|----------|-------|-------|
| `FILE_EXCHANGE_BUCKET` | Verification Agent env | S3 bucket name |
| `FILE_EXCHANGE_PREFIX` | Verification Agent env | `attachments/` |
| `PRESIGNED_URL_EXPIRY` | Verification Agent env | `900` (seconds) |
