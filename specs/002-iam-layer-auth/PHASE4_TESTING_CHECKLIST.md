# Phase 4 Testing Checklist

**Feature**: 002-iam-layer-auth  
**Phase**: 4 - Testing API Gateway Authentication

## Prerequisites

- ✅ AWS CLI configured with credentials
- ✅ CDK stack deployed successfully
- ✅ Slack bot working (direct Lambda invocation)

## Testing Steps

### T013: Enable Feature Flag for Testing

**Action**: Enable API Gateway feature flag

```bash
cd specs/002-iam-layer-auth/scripts
./enable-api-gateway.sh true
```

**Verification**:
- [ ] Lambda function updated successfully
- [ ] `USE_API_GATEWAY=true` in environment variables
- [ ] `EXECUTION_API_URL` is set correctly

**Expected Output**:
```
✅ Lambda function updated successfully!
📊 Current configuration:
{
  "USE_API_GATEWAY": "true",
  "EXECUTION_API_URL": "https://...execute-api...amazonaws.com/prod"
}
```

---

### T014: Test API Gateway Without IAM Auth (Should Fail)

**Action**: Test that unauthorized requests are rejected

```bash
cd specs/002-iam-layer-auth/scripts
./test-api-gateway-auth.sh
```

**Verification**:
- [ ] Script runs successfully
- [ ] Response HTTP code is 403
- [ ] Error message indicates authentication required

**Expected Output**:
```
📥 Response HTTP Code: 403
📥 Response Body: {"message":"User: anonymous is not authorized..."}
✅ SUCCESS: API Gateway correctly rejected unauthorized request (403 Forbidden)
✅ Authentication is working correctly!
```

**If test passes**: ✅ T014 Complete

---

### T015: Test API Gateway With IAM Auth (From Lambda)

**Action**: Send Slack message and verify API Gateway invocation

1. **Send a Slack message** to the bot (mention or DM)
2. **Verify bot responds** correctly
3. **Check logs** for API Gateway invocation

```bash
cd specs/002-iam-layer-auth/scripts
./check-logs.sh --follow
```

**Look for**:
- [ ] `execution_api_invocation_started` event
- [ ] `execution_api_invocation_success` event
- [ ] No `execution_api_invocation_error` events

**Expected Log Entry**:
```json
{
  "level": "INFO",
  "event": "execution_api_invocation_started",
  "api_url": "https://...execute-api...amazonaws.com/prod",
  "channel": "C123456",
  "text_length": 10
}
```

```json
{
  "level": "INFO",
  "event": "execution_api_invocation_success",
  "api_url": "https://...execute-api...amazonaws.com/prod",
  "status_code": 202
}
```

**If logs show success**: ✅ T015 Complete

---

### T016: Verify CloudWatch Logs

**Action**: Check logs for authentication events

```bash
# Check recent logs
cd specs/002-iam-layer-auth/scripts
./check-logs.sh

# Or follow logs in real-time
./check-logs.sh --follow
```

**Verification**:
- [ ] Logs show `execution_api_invocation_started`
- [ ] Logs show `execution_api_invocation_success`
- [ ] No `execution_api_invocation_error` events
- [ ] No authentication failures

**Check for**:
- [ ] API Gateway URL is correct in logs
- [ ] Status code is 202 (Accepted)
- [ ] Correlation IDs are present
- [ ] No 403 errors in logs

**If logs verified**: ✅ T016 Complete

---

### T017: Test Error Handling

**Action**: Test fallback mechanism when API Gateway fails

**Step 1**: Temporarily break API Gateway URL

```bash
# Get Lambda function name
LAMBDA_NAME=$(aws lambda list-functions \
  --query "Functions[?contains(FunctionName, 'SlackEventHandler')].FunctionName" \
  --output text | head -1)

# Get current environment variables
ENV_VARS=$(aws lambda get-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --query "Environment.Variables" \
  --output json)

# Set invalid URL
ENV_STRING=$(echo "$ENV_VARS" | jq -r --arg invalid_url "https://invalid-url.execute-api.region.amazonaws.com/prod" \
  '.EXECUTION_API_URL = $invalid_url | to_entries | map("\(.key)=\(.value)") | join(",")')

aws lambda update-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --environment "Variables={$ENV_STRING}"
```

**Step 2**: Send Slack message

- Send a message to the bot
- Bot should still respond (fallback to Lambda)

**Step 3**: Check logs for fallback

```bash
./check-logs.sh | grep -E "fallback|execution_api_invocation_error"
```

**Look for**:
- [ ] `execution_api_invocation_error` event
- [ ] `fallback_to_lambda_invocation` event
- [ ] `bedrock_processor_invocation_success` event (fallback worked)

**Step 4**: Restore correct API Gateway URL

```bash
cd specs/002-iam-layer-auth/scripts
./enable-api-gateway.sh true
```

**Verification**:
- [ ] Fallback to Lambda invocation works
- [ ] Error is logged appropriately
- [ ] Bot still responds correctly
- [ ] Correct URL restored

**If fallback works**: ✅ T017 Complete

---

## Phase 4 Completion Checklist

- [x] T013: Feature flag enabled
- [ ] T014: Unauthorized access test (403 Forbidden)
- [ ] T015: API Gateway invocation from Lambda (success)
- [ ] T016: CloudWatch logs verified
- [ ] T017: Error handling and fallback tested

## Success Criteria

- ✅ API Gateway rejects unauthorized requests (403)
- ✅ Lambda successfully invokes API Gateway with IAM auth
- ✅ CloudWatch logs show successful authentication
- ✅ Fallback mechanism works when API Gateway fails
- ✅ Bot responds correctly via API Gateway

## Next Steps

After Phase 4 completion:
1. Proceed to Phase 5: Gradual Production Rollout
2. Use `set-rollout-percentage.sh` for gradual migration
3. Monitor metrics with `monitor-metrics.sh`

