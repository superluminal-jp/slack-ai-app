# Testing Scripts for API Gateway IAM Authentication

Helper scripts for testing and managing the API Gateway feature flag.

## Prerequisites

- AWS CLI configured with appropriate credentials
- `jq` installed (`brew install jq` on macOS)
- Stack name: `SlackBedrockStack` (or set `STACK_NAME` environment variable)
- AWS Region: `ap-northeast-1` (or set `AWS_REGION` environment variable)
- **AWS Profile**: `amplify-admin` (default, or set `AWS_PROFILE` environment variable)

**Note**: All scripts use `amplify-admin` AWS profile by default. You can override:
```bash
export AWS_PROFILE=your-profile-name
./enable-api-gateway.sh true
```

## Scripts

### `enable-api-gateway.sh`

Enable or disable the API Gateway feature flag.

**Usage**:
```bash
# Enable API Gateway
./enable-api-gateway.sh true

# Disable API Gateway (use direct Lambda invocation)
./enable-api-gateway.sh false

# Default is true
./enable-api-gateway.sh
```

**What it does**:
- Finds the SlackEventHandler Lambda function
- Retrieves API Gateway URL from CloudFormation outputs
- Updates Lambda environment variables (`USE_API_GATEWAY`, `EXECUTION_API_URL`)
- Shows current configuration

**Example output**:
```
🔧 Enabling API Gateway feature flag: true
📦 Found Lambda function: SlackBedrockStack-SlackEventHandler-Handler-ABC123
📥 Retrieving API Gateway URL...
🌐 API Gateway URL: https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod
🚀 Updating Lambda function configuration...
✅ Lambda function updated successfully!

📊 Current configuration:
{
  "USE_API_GATEWAY": "true",
  "EXECUTION_API_URL": "https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod"
}
```

---

### `set-rollout-percentage.sh`

Set percentage-based rollout for gradual migration (Phase 5).

**Usage**:
```bash
# Set 10% rollout
./set-rollout-percentage.sh 10

# Set 50% rollout
./set-rollout-percentage.sh 50

# Set 100% rollout (full migration)
./set-rollout-percentage.sh 100

# Disable (0%)
./set-rollout-percentage.sh 0
```

**What it does**:
- Sets `USE_API_GATEWAY_PERCENTAGE` environment variable (0-100)
- Updates Lambda function configuration
- Shows current rollout percentage
- Provides monitoring tips

**Example output**:
```
🔧 Setting API Gateway rollout percentage: 10%
📦 Found Lambda function: SlackBedrockStack-SlackEventHandler-Handler-ABC123
📥 Retrieving API Gateway URL...
🌐 API Gateway URL: https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod
🚀 Updating Lambda function configuration...
✅ Lambda function updated successfully!

📊 Current configuration:
{
  "USE_API_GATEWAY": "false",
  "USE_API_GATEWAY_PERCENTAGE": "10",
  "EXECUTION_API_URL": "https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod"
}

📈 API Gateway is enabled for 10% of requests (gradual rollout)

🧪 Next steps:
1. Monitor CloudWatch logs for API Gateway invocations
2. Check error rates and latency
3. Gradually increase percentage: 10% → 50% → 100%
4. Use: ./check-logs.sh --follow
```

---

### `test-api-gateway-auth.sh`

Test that API Gateway correctly rejects unauthorized requests (should return 403).

**Usage**:
```bash
./test-api-gateway-auth.sh
```

**What it does**:
- Retrieves API Gateway URL from CloudFormation
- Sends a POST request without IAM authentication
- Verifies response is 403 Forbidden
- Confirms authentication is working correctly

**Expected output**:
```
🧪 Testing API Gateway authentication (should fail without IAM auth)
🌐 Testing endpoint: https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod/execute

📤 Sending request without IAM authentication...
📥 Response HTTP Code: 403
📥 Response Body: {"message":"User: anonymous is not authorized..."}

✅ SUCCESS: API Gateway correctly rejected unauthorized request (403 Forbidden)
✅ Authentication is working correctly!
```

---

### `check-logs.sh`

Check CloudWatch logs for API Gateway invocations.

**Usage**:
```bash
# Show recent logs
./check-logs.sh

# Follow logs in real-time
./check-logs.sh --follow
```

**What it does**:
- Finds the SlackEventHandler Lambda function
- Filters CloudWatch logs for `execution_api` events
- Shows recent invocations or follows logs in real-time

**Example output**:
```
📊 Checking logs for: /aws/lambda/SlackBedrockStack-SlackEventHandler-Handler-ABC123

📥 Recent API Gateway invocations:
----------------------------------------------------------------------------
|                              FilterLogEvents                              |
+----------------------------+----------------------------------------------+
|  2025-01-27T12:00:00.000Z  | {"level":"INFO","event":"execution_api_invocation_started",...} |
|  2025-01-27T12:00:01.000Z  | {"level":"INFO","event":"execution_api_invocation_success",...} |
+----------------------------+----------------------------------------------+
```

---

### `monitor-metrics.sh`

Monitor API Gateway CloudWatch metrics for gradual rollout (Phase 5).

**Usage**:
```bash
# Monitor for 5 minutes (default)
./monitor-metrics.sh

# Monitor for 10 minutes
./monitor-metrics.sh 10
```

**What it does**:
- Retrieves API Gateway metrics from CloudWatch
- Shows: Request count, 4XX/5XX errors, Latency (p95), Integration latency
- Helps verify performance during gradual rollout

**Example output**:
```
📊 Monitoring API Gateway metrics for 5 minutes...
🌐 API Gateway ID: abc123xyz

⏰ Time range: 2025-01-27T11:55:00 to 2025-01-27T12:00:00

📈 Request Count:
+----------------------------+------+
|         Timestamp          | Sum  |
+----------------------------+------+
|  2025-01-27T12:00:00.000Z  |  10  |
+----------------------------+------+

📈 4XX Errors:
(No data)

📈 Latency (p95):
+----------------------------+------+
|         Timestamp          | p95  |
+----------------------------+------+
|  2025-01-27T12:00:00.000Z  | 150  |
+----------------------------+------+
```

---

## Quick Test Workflow

### Phase 4: Initial Testing

1. **Test unauthorized access** (should fail):
   ```bash
   ./test-api-gateway-auth.sh
   ```

2. **Enable API Gateway**:
   ```bash
   ./enable-api-gateway.sh true
   ```

3. **Send a Slack message** to test the bot

4. **Check logs**:
   ```bash
   ./check-logs.sh --follow
   ```

5. **Verify success**: Look for `execution_api_invocation_success` in logs

### Phase 5: Gradual Rollout

1. **Set 10% rollout**:
   ```bash
   ./set-rollout-percentage.sh 10
   ```

2. **Monitor metrics**:
   ```bash
   ./monitor-metrics.sh 10
   ```

3. **Check logs**:
   ```bash
   ./check-logs.sh --follow
   ```

4. **Increase to 50%** (after 1 hour):
   ```bash
   ./set-rollout-percentage.sh 50
   ./monitor-metrics.sh 10
   ```

5. **Increase to 100%** (after 1 hour):
   ```bash
   ./set-rollout-percentage.sh 100
   ./monitor-metrics.sh 60  # Monitor for 1 hour
   ```

---

## Troubleshooting

### Script fails to find Lambda function

**Check**:
- AWS credentials are configured: `aws sts get-caller-identity`
- Region is correct: `echo $AWS_REGION`
- Stack name is correct: `echo $STACK_NAME`

### Script fails to find API Gateway URL

**Check**:
- Stack is deployed: `aws cloudformation describe-stacks --stack-name $STACK_NAME`
- Output exists: `aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs"`

### Lambda update fails

**Check**:
- Lambda function exists: `aws lambda list-functions --query "Functions[?contains(FunctionName, 'SlackEventHandler')]"`
- You have permissions: `aws lambda get-function-configuration --function-name <name>`

### Percentage rollout not working

**Check**:
- `USE_API_GATEWAY_PERCENTAGE` is set: `aws lambda get-function-configuration --function-name <name> --query "Environment.Variables.USE_API_GATEWAY_PERCENTAGE"`
- Check logs for `api_gateway_percentage_check` events
- Verify random selection is working (should see mix of API Gateway and Lambda invocations)

---

## Environment Variables

You can override defaults:

```bash
export STACK_NAME=MyCustomStack
export AWS_REGION=us-east-1
./enable-api-gateway.sh true
```
