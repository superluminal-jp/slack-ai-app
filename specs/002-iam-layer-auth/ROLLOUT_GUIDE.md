# Gradual Rollout Guide: API Gateway IAM Authentication

**Phase 5**: Gradual Production Rollout  
**Feature**: 002-iam-layer-auth

## Overview

This guide walks through the gradual rollout process from direct Lambda invocation to API Gateway with IAM authentication. The rollout uses a percentage-based feature flag to migrate traffic incrementally while monitoring for issues.

## Rollout Strategy

**Timeline**: 3-5 days (with monitoring periods)

1. **Day 1**: 10% rollout → Monitor 1 hour
2. **Day 2**: 50% rollout → Monitor 1 hour  
3. **Day 3-4**: 100% rollout → Monitor 24 hours
4. **Day 5**: Cleanup (Phase 6)

## Prerequisites

- ✅ Phase 4 testing completed successfully
- ✅ API Gateway authentication verified working
- ✅ CloudWatch logs showing successful invocations
- ✅ No authentication errors in logs

## Step-by-Step Rollout

### Step 1: Set 10% Rollout

**Goal**: Test API Gateway with small percentage of traffic

```bash
cd specs/002-iam-layer-auth/scripts
./set-rollout-percentage.sh 10
```

**What happens**:
- 10% of requests use API Gateway
- 90% of requests use direct Lambda invocation
- Random selection per request

**Monitoring** (1 hour):
```bash
# Monitor metrics
./monitor-metrics.sh 10

# Check logs
./check-logs.sh --follow
```

**Success Criteria**:
- ✅ Error rate <1%
- ✅ Latency increase <5% (p95)
- ✅ No authentication failures
- ✅ Both invocation methods working (check logs for mix)

**If issues occur**:
```bash
# Rollback to 0%
./set-rollout-percentage.sh 0

# Investigate issues
./check-logs.sh | grep ERROR
```

---

### Step 2: Increase to 50% Rollout

**Prerequisites**: 10% rollout stable for 1 hour

```bash
./set-rollout-percentage.sh 50
```

**Monitoring** (1 hour):
```bash
./monitor-metrics.sh 10
./check-logs.sh --follow
```

**Success Criteria**:
- ✅ Error rate <1%
- ✅ Latency increase <5% (p95)
- ✅ Authentication success rate ≥99.9%

**If issues occur**: Rollback to 10% and investigate

---

### Step 3: Increase to 100% Rollout

**Prerequisites**: 50% rollout stable for 1 hour

```bash
./set-rollout-percentage.sh 100
```

**Monitoring** (24 hours):
```bash
# Monitor every hour
for i in {1..24}; do
  echo "=== Hour $i ==="
  ./monitor-metrics.sh 5
  sleep 3600
done
```

**Success Criteria**:
- ✅ Error rate <0.1%
- ✅ Latency increase <5% (p95)
- ✅ Authentication success rate ≥99.9%
- ✅ No fallback to Lambda invocation (check logs)

**After 24 hours**: Proceed to Phase 6 (Cleanup)

---

## Monitoring Checklist

### Metrics to Monitor

- [ ] **Request Count**: Should match expected traffic volume
- [ ] **4XX Errors**: Should be 0 (authentication failures)
- [ ] **5XX Errors**: Should be <0.1%
- [ ] **Latency (p95)**: Should increase <5% from baseline
- [ ] **Integration Latency (p95)**: Should be <500ms

### Logs to Check

- [ ] `execution_api_invocation_started` - API Gateway invocations
- [ ] `execution_api_invocation_success` - Successful invocations
- [ ] `execution_api_invocation_error` - API Gateway errors
- [ ] `fallback_to_lambda_invocation` - Should be 0 at 100% rollout
- [ ] `api_gateway_percentage_check` - Percentage selection working

### CloudWatch Dashboard

Access dashboard (if monitoring enabled):
```bash
# Get dashboard URL from CloudFormation outputs
aws cloudformation describe-stacks \
  --stack-name SlackBedrockStack \
  --query "Stacks[0].Outputs[?OutputKey=='MonitoringDashboardUrl'].OutputValue" \
  --output text
```

---

## Rollback Procedure

If issues occur during rollout:

### Immediate Rollback

```bash
# Set to 0% (disable API Gateway)
./set-rollout-percentage.sh 0
```

### Verify Rollback

```bash
# Check logs - should only see Lambda invocations
./check-logs.sh | grep "bedrock_processor_invocation"

# Verify no API Gateway errors
./check-logs.sh | grep "execution_api_invocation_error"
```

### Investigation Steps

1. **Check error logs**:
   ```bash
   ./check-logs.sh | grep ERROR
   ```

2. **Check API Gateway metrics**:
   ```bash
   ./monitor-metrics.sh 10
   ```

3. **Verify API Gateway resource policy**:
   ```bash
   API_ID=$(aws apigateway get-rest-apis \
     --query "items[?name=='Execution Layer API'].id" \
     --output text)
   aws apigateway get-rest-api --rest-api-id $API_ID --query "policy"
   ```

4. **Check Lambda IAM permissions**:
   ```bash
   LAMBDA_NAME=$(aws lambda list-functions \
     --query "Functions[?contains(FunctionName, 'SlackEventHandler')].FunctionName" \
     --output text | head -1)
   aws iam get-role-policy \
     --role-name $(aws lambda get-function-configuration \
       --function-name $LAMBDA_NAME \
       --query "Role" --output text | awk -F'/' '{print $NF}') \
     --policy-name <policy-name>
   ```

---

## Success Criteria Validation

After 100% rollout (24 hours):

| Criterion | Target | Validation |
|-----------|--------|------------|
| SC-001: 100% authenticated | ✅ | All requests use API Gateway |
| SC-002: 0% unauthorized | ✅ | No 403 errors in logs |
| SC-003: ≤5% latency increase | ✅ | p95 latency < baseline + 5% |
| SC-004: ≥99.9% success rate | ✅ | Error rate <0.1% |
| SC-005: Feature compatibility | ✅ | All Slack features working |
| SC-006: Events logged | ✅ | CloudWatch logs show all events |
| SC-007: Minimum permissions | ⏳ | Phase 6 cleanup |

---

## Troubleshooting

### Issue: High Error Rate (>1%)

**Symptoms**: Many 4XX or 5XX errors

**Possible Causes**:
- IAM permissions misconfigured
- API Gateway resource policy incorrect
- SigV4 signing issues

**Solutions**:
1. Check IAM role permissions
2. Verify API Gateway resource policy
3. Check CloudWatch logs for specific error messages
4. Rollback to previous percentage

### Issue: High Latency (>5% increase)

**Symptoms**: Integration latency >500ms

**Possible Causes**:
- API Gateway cold start
- Network issues
- Lambda function timeout

**Solutions**:
1. Check Lambda function timeout (should be <29 seconds)
2. Monitor IntegrationLatency metric
3. Check for API Gateway throttling
4. Consider warming up API Gateway

### Issue: Percentage Not Working

**Symptoms**: All requests still use Lambda (or all use API Gateway)

**Possible Causes**:
- Environment variable not updated
- Lambda function not restarted
- Code issue with random selection

**Solutions**:
1. Verify environment variable: `aws lambda get-function-configuration --function-name <name> --query "Environment.Variables.USE_API_GATEWAY_PERCENTAGE"`
2. Check logs for `api_gateway_percentage_check` events
3. Verify code changes deployed

---

## Next Steps After Successful Rollout

1. **Phase 6**: Cleanup (remove fallback code, unused permissions)
2. **Phase 7**: Set up ongoing monitoring and alerts
3. **Documentation**: Update architecture docs
4. **ADR**: Create Architecture Decision Record if needed

---

## Quick Reference

```bash
# Set rollout percentage
./set-rollout-percentage.sh <0-100>

# Monitor metrics
./monitor-metrics.sh [minutes]

# Check logs
./check-logs.sh [--follow]

# Test authentication
./test-api-gateway-auth.sh

# Enable/disable feature flag
./enable-api-gateway.sh [true|false]
```

