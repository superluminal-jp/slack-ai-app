# Phase 4: Ready for Testing

**Status**: All code implemented, ready for manual testing

## Implementation Complete ✅

All Phase 4 code is implemented and ready:

- ✅ **T013**: Feature flag code ready (`USE_API_GATEWAY` environment variable)
- ✅ **T014**: Unauthorized access test script ready (`test-api-gateway-auth.sh`)
- ✅ **T015**: API Gateway client integration complete (handler.py updated)
- ✅ **T016**: Logging implemented (structured logs with `execution_api` events)
- ✅ **T017**: Error handling and fallback implemented

## Quick Test Execution

### Option 1: Automated Test Script (Recommended)

Run the comprehensive test script:

```bash
cd specs/002-iam-layer-auth/scripts
./run-phase4-tests.sh
```

This script will:
1. Test unauthorized access (T014)
2. Enable feature flag (T013)
3. Prompt you to send Slack message (T015)
4. Check logs (T016)
5. Test fallback mechanism (T017)

### Option 2: Manual Step-by-Step

Follow `PHASE4_TESTING_CHECKLIST.md` for detailed manual steps.

## What's Been Implemented

### Code Changes

1. **Handler Logic** (`lambda/slack-event-handler/handler.py`):
   - Feature flag support (`USE_API_GATEWAY`)
   - Percentage-based rollout support (`USE_API_GATEWAY_PERCENTAGE`)
   - API Gateway client integration
   - Fallback to Lambda invocation on error
   - Structured logging for all invocation types

2. **API Gateway Client** (`lambda/slack-event-handler/api_gateway_client.py`):
   - SigV4 signing implementation
   - Error handling
   - Timeout handling

3. **Infrastructure** (`cdk/lib/constructs/execution-api.ts`):
   - API Gateway REST API with IAM auth
   - Resource policy restricting access
   - Lambda proxy integration

### Test Scripts

- `test-api-gateway-auth.sh` - Test unauthorized access
- `enable-api-gateway.sh` - Enable/disable feature flag
- `check-logs.sh` - Check CloudWatch logs
- `run-phase4-tests.sh` - Complete Phase 4 test suite

## Testing Requirements

To complete Phase 4 testing, you need:

1. **AWS Credentials**: Configured via `aws configure`
2. **Slack Access**: Ability to send messages to the bot
3. **5-10 minutes**: For complete testing

## Expected Test Results

### T014: Unauthorized Access Test
- **Expected**: 403 Forbidden
- **Verification**: Script output shows success

### T015: API Gateway Invocation
- **Expected**: Bot responds correctly
- **Logs**: Show `execution_api_invocation_success`
- **Status**: 202 Accepted

### T016: CloudWatch Logs
- **Expected**: No authentication errors
- **Logs**: Show successful invocations

### T017: Error Handling
- **Expected**: Fallback to Lambda works
- **Logs**: Show `fallback_to_lambda_invocation`

## Next Steps After Testing

Once Phase 4 tests pass:

1. **Mark tasks complete** in `tasks.md`
2. **Proceed to Phase 5**: Gradual rollout
3. **Use rollout scripts**: `set-rollout-percentage.sh`
4. **Monitor metrics**: `monitor-metrics.sh`

## Troubleshooting

If tests fail:

1. **Check AWS credentials**: `aws sts get-caller-identity`
2. **Verify stack deployed**: `aws cloudformation describe-stacks --stack-name SlackBedrockStack`
3. **Check Lambda logs**: `./check-logs.sh`
4. **Verify API Gateway URL**: Check CloudFormation outputs

## Code Verification

All code has been:
- ✅ Implemented
- ✅ Unit tested (4/4 tests passing)
- ✅ Linted (no errors)
- ✅ Ready for integration testing

**Phase 4 is ready for execution!**

