# Testing Guide: API Gateway IAM Authentication

**Phase 4 Testing Steps** - After successful CDK deployment

## Prerequisites

- ✅ CDK deployment successful
- ✅ Slack mentions working (direct Lambda invocation)
- ✅ API Gateway URL available from CDK outputs

## Step 1: Get API Gateway URL

```bash
# Get the API Gateway URL from CDK outputs
cd cdk
cdk output ExecutionApiUrl

# Or check CloudFormation outputs
aws cloudformation describe-stacks \
  --stack-name SlackBedrockStack \
  --query "Stacks[0].Outputs[?OutputKey=='ExecutionApiUrl'].OutputValue" \
  --output text
```

## Step 2: Verify Environment Variables

Check that the Lambda function has the required environment variables:

```bash
# Get Lambda function name
LAMBDA_NAME=$(aws lambda list-functions \
  --query "Functions[?contains(FunctionName, 'SlackEventHandler')].FunctionName" \
  --output text | head -1)

# Check environment variables
aws lambda get-function-configuration \
  --function-name $LAMBDA_NAME \
  --query "Environment.Variables" \
  --output json | jq '{USE_API_GATEWAY, EXECUTION_API_URL}'
```

Expected:
- `USE_API_GATEWAY`: `"false"` (default)
- `EXECUTION_API_URL`: Should contain the API Gateway URL

## Step 3: Test API Gateway Without Authentication (Should Fail)

Test that unauthorized requests are rejected:

```bash
# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name SlackBedrockStack \
  --query "Stacks[0].Outputs[?OutputKey=='ExecutionApiUrl'].OutputValue" \
  --output text)

# Test without authentication (should return 403)
curl -X POST "$API_URL/execute" \
  -H "Content-Type: application/json" \
  -d '{"channel":"C123","text":"test","bot_token":"xoxb-test"}'
```

Expected: `403 Forbidden` with message about authentication

## Step 4: Enable Feature Flag

Enable API Gateway for testing:

```bash
# Get Lambda function name
LAMBDA_NAME=$(aws lambda list-functions \
  --query "Functions[?contains(FunctionName, 'SlackEventHandler')].FunctionName" \
  --output text | head -1)

# Get current environment variables
ENV_VARS=$(aws lambda get-function-configuration \
  --function-name $LAMBDA_NAME \
  --query "Environment.Variables" \
  --output json)

# Update with USE_API_GATEWAY=true
aws lambda update-function-configuration \
  --function-name $LAMBDA_NAME \
  --environment "Variables={$(echo $ENV_VARS | jq -r 'to_entries | map("\(.key)=\(.value)") | join(",")'),USE_API_GATEWAY=true}"
```

## Step 5: Test with Slack Message

1. Send a message to the bot in Slack (mention or DM)
2. Verify the bot responds correctly
3. Check CloudWatch logs for API Gateway invocation

```bash
# Check Verification Layer logs
LOG_GROUP="/aws/lambda/$LAMBDA_NAME"
aws logs tail $LOG_GROUP --follow --filter-pattern "execution_api"
```

Look for:
- `execution_api_invocation_started`
- `execution_api_invocation_success`

## Step 6: Verify CloudWatch Logs

```bash
# Check for successful API Gateway invocations
aws logs filter-log-events \
  --log-group-name "/aws/lambda/$LAMBDA_NAME" \
  --filter-pattern "execution_api_invocation_success" \
  --max-items 10

# Check API Gateway logs (if enabled)
API_ID=$(aws apigateway get-rest-apis \
  --query "items[?name=='Execution Layer API'].id" \
  --output text)

aws logs tail "/aws/apigateway/$API_ID" --follow
```

## Step 7: Test Error Handling (Optional)

Test fallback mechanism by temporarily breaking the API Gateway URL:

```bash
# Temporarily set invalid URL
aws lambda update-function-configuration \
  --function-name $LAMBDA_NAME \
  --environment "Variables={$(echo $ENV_VARS | jq -r 'to_entries | map("\(.key)=\(.value)") | join(",")'),USE_API_GATEWAY=true,EXECUTION_API_URL=https://invalid-url.execute-api.region.amazonaws.com/prod}"

# Send Slack message - should fallback to direct Lambda invocation
# Check logs for "fallback_to_lambda_invocation"

# Restore correct URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name SlackBedrockStack \
  --query "Stacks[0].Outputs[?OutputKey=='ExecutionApiUrl'].OutputValue" \
  --output text)

aws lambda update-function-configuration \
  --function-name $LAMBDA_NAME \
  --environment "Variables={$(echo $ENV_VARS | jq -r 'to_entries | map("\(.key)=\(.value)") | join(",")'),USE_API_GATEWAY=true,EXECUTION_API_URL=$API_URL}"
```

## Success Criteria

- ✅ Unauthorized requests return 403 Forbidden
- ✅ Slack messages work correctly with API Gateway enabled
- ✅ CloudWatch logs show `execution_api_invocation_success`
- ✅ Error handling works (fallback to Lambda if API Gateway fails)
- ✅ No authentication errors in logs

## Troubleshooting

### Issue: 403 Forbidden even with feature flag enabled

**Check**:
- Verify `EXECUTION_API_URL` is set correctly
- Verify API Gateway resource policy allows the Lambda role
- Check CloudWatch logs for authentication errors

### Issue: Timeout errors

**Check**:
- Verify API Gateway timeout is sufficient (29 seconds default)
- Check Lambda function timeout (should be <29 seconds)
- Verify network connectivity

### Issue: Fallback not working

**Check**:
- Verify `BEDROCK_PROCESSOR_ARN` is still set
- Check Lambda invoke permissions are still granted
- Verify error handling code in handler.py

