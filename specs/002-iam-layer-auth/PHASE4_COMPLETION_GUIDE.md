# Phase 4 Completion Guide

**Current Status**: 2/5 tests complete, 3 remaining (require Slack interaction)

## ✅ Completed Tests

### T013: Feature Flag Enabled ✅
- **Status**: COMPLETE
- **Verification**: `USE_API_GATEWAY=true`, `EXECUTION_API_URL` configured
- **Lambda**: `SlackBedrockStack-SlackEventHandler898FE80E-TJUkrbzJtXGK`

### T014: Unauthorized Access Test ✅
- **Status**: COMPLETE
- **Result**: 403 Forbidden (correct behavior)
- **Verification**: API Gateway correctly rejects unauthorized requests

## ⏳ Remaining Tests (Require Slack Interaction)

### T015: Test API Gateway Invocation

**Action**: Send a Slack message to the bot

1. **Send message**:
   - Open Slack workspace
   - Mention the bot or send a DM
   - Example: `@bot What is the weather?`

2. **Verify response**:
   - Bot should respond with AI-generated answer
   - Response should come via API Gateway (not direct Lambda)

3. **Check logs**:
   ```bash
   cd specs/002-iam-layer-auth/scripts
   export AWS_PROFILE=amplify-admin
   ./check-logs.sh --follow
   ```

4. **Look for**:
   - `execution_api_invocation_started` ✅
   - `execution_api_invocation_success` ✅
   - Status code: 202 ✅

**Expected Result**: ✅ Bot responds successfully via API Gateway

---

### T016: Verify CloudWatch Logs

**After T015 completes**, verify logs:

```bash
export AWS_PROFILE=amplify-admin
cd specs/002-iam-layer-auth/scripts

# Check for successful invocations
./check-logs.sh | grep "execution_api_invocation_success"

# Check for errors (should be none)
./check-logs.sh | grep "execution_api_invocation_error"
```

**Verification Checklist**:
- [ ] `execution_api_invocation_started` present
- [ ] `execution_api_invocation_success` present
- [ ] No `execution_api_invocation_error` events
- [ ] Status code is 202
- [ ] API Gateway URL is correct in logs

**Expected Result**: ✅ Logs show successful API Gateway authentication

---

### T017: Test Error Handling & Fallback

**Test fallback mechanism**:

1. **Run test script** (automated):
   ```bash
   cd specs/002-iam-layer-auth/scripts
   export AWS_PROFILE=amplify-admin
   ./run-phase4-tests.sh
   ```
   (Script will prompt you to send Slack message)

2. **Or test manually**:
   ```bash
   # Temporarily break API Gateway URL
   LAMBDA_NAME="SlackBedrockStack-SlackEventHandler898FE80E-TJUkrbzJtXGK"
   ENV_VARS=$(aws lambda get-function-configuration \
     --function-name "$LAMBDA_NAME" \
     --query "Environment.Variables" \
     --output json)
   
   # Set invalid URL
   INVALID_ENV=$(echo "$ENV_VARS" | jq '.EXECUTION_API_URL = "https://invalid-url.execute-api.region.amazonaws.com/prod" | .USE_API_GATEWAY = "true"')
   ENV_STRING=$(echo "$INVALID_ENV" | jq -r 'to_entries | map("\(.key)=\(.value)") | join(",")')
   
   aws lambda update-function-configuration \
     --function-name "$LAMBDA_NAME" \
     --environment "Variables={$ENV_STRING}"
   
   # Send Slack message - should fallback to Lambda
   # Check logs for "fallback_to_lambda_invocation"
   
   # Restore correct URL
   ./enable-api-gateway.sh true
   ```

**Verification**:
- [ ] Fallback to Lambda invocation works
- [ ] Error is logged appropriately
- [ ] Bot still responds correctly
- [ ] Correct URL restored

**Expected Result**: ✅ Fallback mechanism works correctly

---

## Quick Test Commands

```bash
# Set AWS profile
export AWS_PROFILE=amplify-admin

# Check current configuration
aws lambda get-function-configuration \
  --function-name SlackBedrockStack-SlackEventHandler898FE80E-TJUkrbzJtXGK \
  --query "Environment.Variables.{USE_API_GATEWAY:USE_API_GATEWAY,EXECUTION_API_URL:EXECUTION_API_URL}" \
  --output json

# Check logs
cd specs/002-iam-layer-auth/scripts
./check-logs.sh --follow

# Run complete test suite
./run-phase4-tests.sh
```

## Phase 4 Completion Checklist

- [x] T013: Feature flag enabled
- [x] T014: Unauthorized access test (403 Forbidden)
- [ ] T015: API Gateway invocation from Lambda (send Slack message)
- [ ] T016: CloudWatch logs verified
- [ ] T017: Error handling and fallback tested

## After Phase 4 Completion

Once all tests pass:

1. **Update tasks.md**: Mark T015-T017 as complete
2. **Proceed to Phase 5**: Gradual rollout
3. **Use rollout script**: `./set-rollout-percentage.sh 10`

---

## Current System State

- ✅ **API Gateway**: Deployed and accessible
- ✅ **Feature Flag**: Enabled (`USE_API_GATEWAY=true`)
- ✅ **Authentication**: Working (403 for unauthorized)
- ⏳ **Integration**: Ready for testing (send Slack message)

**Next Action**: Send a Slack message to complete T015-T017 testing.

