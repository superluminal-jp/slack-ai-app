# Quick Start: Two-Key Defense (Signing Secret + Bot Token)

**Feature**: 006-existence-check
**Date**: 2025-01-27

## Overview

This feature implements Slack API Existence Check as a second layer of defense in the two-key security model. When Signing Secret is leaked, attackers can forge request signatures, but they cannot call Slack API without Bot Token. This feature verifies that team_id, user_id, and channel_id exist in Slack before processing requests.

## Prerequisites

- AWS CDK CLI installed and configured
- Python 3.11+ for Lambda functions
- TypeScript for CDK infrastructure
- Slack app with Bot Token (xoxb-...) available
- **Required Slack API Scopes**: `team:read`, `users:read`, `channels:read` (for Existence Check)
- Existing SlackEventHandler Lambda deployed

## Quick Setup

### 1. Deploy Infrastructure

```bash
cd cdk
npm install
cdk deploy
```

This will create:

- DynamoDB table: `slack-existence-check-cache` (with TTL support)
- IAM permissions for SlackEventHandler Lambda to read/write cache table

### 2. Update Lambda Code

The Existence Check module is integrated into `slack-event-handler` Lambda:

```python
# lambda/verification-stack/slack-event-handler/existence_check.py
from existence_check import check_entity_existence, ExistenceCheckError

# In handler.py, after signature verification:
if bot_token and team_id and user_id and channel_id:
    try:
        check_entity_existence(
            bot_token=bot_token,
            team_id=team_id,
            user_id=user_id,
            channel_id=channel_id
        )
    except ExistenceCheckError as e:
        log_error("existence_check_failed", {...})
        return {"statusCode": 403, ...}
```

### 3. Deploy Lambda

```bash
cd lambda/verification-stack/slack-event-handler
pip install -r requirements.txt -t .
zip -r function.zip .
aws lambda update-function-code \
  --function-name slack-event-handler \
  --zip-file fileb://function.zip
```

## Testing

### Unit Tests

```bash
cd lambda/verification-stack/slack-event-handler
pytest tests/test_existence_check.py -v
```

### Integration Test

1. Send a request with valid signature but invalid team_id
2. Verify system rejects with 403 Forbidden
3. Check CloudWatch logs for security event

### Manual Test

1. Send a message in Slack
2. Verify request is processed (check logs for "existence_check_success")
3. Send another message from same team/user/channel
4. Verify cache hit (check logs for "existence_check_cache_hit")

## Monitoring

### CloudWatch Metrics

- `ExistenceCheckFailed`: Count of failed existence checks
- `ExistenceCheckCacheHitRate`: Percentage of cache hits
- `SlackAPILatency`: Latency of Slack API calls (p95)

### CloudWatch Alarms

- `ExistenceCheckFailedAlarm`: Triggers when 5+ failures in 5 minutes
- `SlackAPILatencyAlarm`: Triggers when p95 latency > 500ms

## Troubleshooting

### Existence Check Always Fails

**Symptoms**: All requests rejected with 403 Forbidden

**Possible Causes**:

1. Bot Token not available (check token storage)
2. Missing Slack API scopes (check for "missing_scope" error in logs)
3. Slack API unavailable (check Slack status)
4. Rate limiting (check CloudWatch logs for 429 errors)

**Solutions**:

1. Verify Bot Token is stored in DynamoDB or environment variable
2. **Add required Slack API scopes**: `team:read`, `users:read`, `channels:read` in Slack app configuration
3. Check Slack API status page
4. Review retry logic and backoff delays

### CloudWatch Metrics Not Emitting

**Symptoms**: Logs show "cloudwatch_metric_emission_failed" with AccessDenied error

**Possible Causes**:

1. Lambda IAM role missing CloudWatch PutMetricData permission

**Solutions**:

1. Deploy updated CDK stack (includes CloudWatch permissions)
2. Verify IAM role has `cloudwatch:PutMetricData` permission for namespace `SlackEventHandler`

### Cache Not Working

**Symptoms**: Every request calls Slack API (no cache hits)

**Possible Causes**:

1. DynamoDB table not created
2. IAM permissions missing
3. Cache key format incorrect

**Solutions**:

1. Verify DynamoDB table exists: `aws dynamodb describe-table --table-name slack-existence-check-cache`
2. Check Lambda IAM role has DynamoDB read/write permissions
3. Verify cache key format: `{team_id}#{user_id}#{channel_id}`

### High Latency

**Symptoms**: Requests take > 500ms for existence check

**Possible Causes**:

1. Slack API slow response
2. Cache misses (too many Slack API calls)
3. DynamoDB read latency

**Solutions**:

1. Check Slack API latency in CloudWatch metrics
2. Review cache hit rate (target: ≥80%)
3. Verify DynamoDB table is in same region as Lambda

## Configuration

### Environment Variables

- `EXISTENCE_CHECK_CACHE_TABLE`: DynamoDB table name (default: `slack-existence-check-cache`)
- `SLACK_BOT_TOKEN`: Bot Token for Slack API calls (fallback if not in DynamoDB)

### Cache Configuration

- **TTL**: 300 seconds (5 minutes)
- **Cache Key Format**: `{team_id}#{user_id}#{channel_id}`
- **Billing Mode**: PAY_PER_REQUEST

### Retry Configuration

- **Max Retries**: 3 attempts
- **Backoff**: Exponential (1s, 2s, 4s)
- **Timeout**: 2 seconds per attempt

## Security Considerations

### Fail-Closed Model

When Slack API is unavailable or times out, all requests are rejected with 403 Forbidden. This prioritizes security over availability.

### Bot Token Security

Bot Token is stored in:

1. DynamoDB (token storage table) - primary source
2. AWS Secrets Manager - fallback
3. Environment variable - last resort

### Cache Security

Cache entries contain only team_id, user_id, channel_id (not PII). DynamoDB encryption at rest enabled by default.

## Next Steps

- Review [spec.md](spec.md) for detailed requirements
- Review [plan.md](plan.md) for implementation details
- Review [research.md](research.md) for technical decisions
