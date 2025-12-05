# Phase 7: Monitoring and Alerts Setup - Guide

**Phase**: 7  
**Status**: ✅ Code Ready, Optional Deployment  
**Date**: 2025-12-05

## Overview

Phase 7 sets up comprehensive monitoring and alerting for API Gateway authentication. The monitoring construct is already implemented and ready for deployment.

## What's Included

### CloudWatch Alarms

1. **Authentication Failures Alarm**
   - Metric: API Gateway 4XXError count
   - Threshold: >10 failures in 5 minutes
   - Action: SNS topic notification (optional email)

2. **High Latency Alarm**
   - Metric: API Gateway IntegrationLatency (p95)
   - Threshold: >500ms for 2 consecutive periods
   - Action: SNS topic notification (optional email)

### CloudWatch Dashboard

**Dashboard Name**: `{StackName}-execution-api-gateway`

**Widgets**:
- Request Count (Sum)
- Error Rates (4XX, 5XX errors)
- Latency (p50, p95, p99)
- Integration Latency (p95)

## Deployment Options

### Option 1: Deploy with Monitoring (Recommended)

**With Email Notifications**:
```bash
cd specs/002-iam-layer-auth/scripts
export AWS_PROFILE=amplify-admin
./enable-monitoring.sh your-email@example.com
```

**Without Email Notifications**:
```bash
cd specs/002-iam-layer-auth/scripts
export AWS_PROFILE=amplify-admin
./enable-monitoring.sh
```

### Option 2: Manual CDK Deployment

```bash
cd cdk
export AWS_PROFILE=amplify-admin
export ENABLE_API_GATEWAY_MONITORING=true
export ALARM_EMAIL=your-email@example.com  # Optional
export SLACK_BOT_TOKEN=your-token
export SLACK_SIGNING_SECRET=your-secret
cdk deploy
```

## After Deployment

### 1. Access CloudWatch Dashboard

Get dashboard URL:
```bash
export AWS_PROFILE=amplify-admin
aws cloudformation describe-stacks \
  --stack-name SlackBedrockStack \
  --query "Stacks[0].Outputs[?OutputKey=='MonitoringDashboardUrl'].OutputValue" \
  --output text \
  --region ap-northeast-1
```

Or use the script:
```bash
cd specs/002-iam-layer-auth/scripts
./enable-monitoring.sh
# Dashboard URL will be displayed
```

### 2. Verify Alarms

```bash
export AWS_PROFILE=amplify-admin
aws cloudwatch describe-alarms \
  --alarm-name-prefix SlackBedrockStack-api-gateway \
  --region ap-northeast-1 \
  --query "MetricAlarms[*].[AlarmName,StateValue,Threshold]" \
  --output table
```

### 3. Confirm SNS Subscription (if email provided)

If you provided an email address:
1. Check your email inbox
2. Look for SNS subscription confirmation email
3. Click the confirmation link
4. Alarms will start sending notifications

### 4. Monitor Metrics

```bash
cd specs/002-iam-layer-auth/scripts
export AWS_PROFILE=amplify-admin
./monitor-metrics.sh 10  # Monitor for 10 minutes
```

## CloudTrail Logging

### API Gateway Management Actions

CloudTrail logs API Gateway management actions (create, update, delete):
```bash
cd specs/002-iam-layer-auth/scripts
export AWS_PROFILE=amplify-admin
./check-cloudtrail.sh 1  # Check last 1 hour
```

### API Call Logs

Individual API Gateway calls are logged in CloudWatch Logs:
```bash
cd specs/002-iam-layer-auth/scripts
export AWS_PROFILE=amplify-admin
./check-logs.sh --follow
```

## Monitoring Best Practices

### Daily Monitoring

1. **Check Dashboard** (daily):
   - Review request count trends
   - Check error rates (should be <0.1%)
   - Monitor latency (p95 should be <500ms)

2. **Review Alarms** (daily):
   - Check alarm state (should be OK)
   - Review any alarm history

3. **Check Logs** (as needed):
   - Look for `execution_api_invocation_error` events
   - Verify authentication success rate

### Weekly Review

1. **Metrics Analysis**:
   - Compare week-over-week trends
   - Identify any anomalies
   - Review latency patterns

2. **Alarm Review**:
   - Check for false positives
   - Adjust thresholds if needed
   - Review alarm history

### Monthly Review

1. **Performance Analysis**:
   - Review latency trends
   - Check error rate trends
   - Identify optimization opportunities

2. **Cost Review**:
   - Review API Gateway costs
   - Check CloudWatch costs
   - Optimize if needed

## Troubleshooting

### Alarms Not Firing

1. **Check Alarm State**:
   ```bash
   aws cloudwatch describe-alarms \
     --alarm-name SlackBedrockStack-api-gateway-auth-failures \
     --query "MetricAlarms[0].StateValue"
   ```

2. **Check Metric Data**:
   ```bash
   ./monitor-metrics.sh 10
   ```

3. **Verify SNS Subscription** (if email provided):
   - Check email inbox for confirmation
   - Verify subscription is confirmed

### Dashboard Not Showing Data

1. **Check Time Range**: Ensure you're looking at the correct time period
2. **Verify API Gateway Activity**: Send a Slack message to generate metrics
3. **Check Metric Names**: Verify API Gateway name matches "Execution Layer API"

### Email Notifications Not Working

1. **Check SNS Subscription**:
   ```bash
   aws sns list-subscriptions \
     --query "Subscriptions[?TopicArn=='arn:aws:sns:ap-northeast-1:*:*api-gateway-alarms*']"
   ```

2. **Verify Email Confirmation**: Check email inbox for confirmation link
3. **Check Alarm Actions**: Verify alarm has SNS action attached

## Cost Considerations

### CloudWatch Costs

- **Dashboard**: Free (up to 3 dashboards)
- **Alarms**: $0.10 per alarm per month
- **Metrics**: Free (first 10 custom metrics)
- **API Gateway Metrics**: Free (standard AWS metrics)

**Estimated Monthly Cost**: ~$0.20 (2 alarms)

### Optimization Tips

1. **Reduce Alarm Evaluation Periods**: If alarms fire too frequently
2. **Adjust Thresholds**: Based on actual usage patterns
3. **Use SNS Filtering**: Filter notifications to reduce noise

## Phase 7 Completion Checklist

- [ ] Monitoring construct deployed (`ENABLE_API_GATEWAY_MONITORING=true`)
- [ ] CloudWatch dashboard accessible
- [ ] Alarms created and in OK state
- [ ] SNS subscription confirmed (if email provided)
- [ ] Dashboard shows metrics correctly
- [ ] Alarms tested (optional: trigger test alarm)

---

**Phase 7 Status**: ✅ Code Ready - Optional Deployment

**Note**: Monitoring is optional but recommended for production environments.

