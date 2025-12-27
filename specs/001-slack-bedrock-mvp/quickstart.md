# Quickstart: Slack Bedrock MVP

**Feature**: 001-slack-bedrock-mvp
**Date**: 2025-11-30
**Purpose**: Step-by-step guide to deploy and test the MVP

## Prerequisites

Before you begin, ensure you have:

- [ ] AWS account with Bedrock access enabled
- [ ] Amazon Bedrock model access requested for Claude 3 Haiku (via AWS Console)
- [ ] AWS CLI installed and configured (`aws configure`)
- [ ] Node.js 18+ and npm installed (for AWS CDK)
- [ ] Python 3.11+ installed
- [ ] AWS CDK CLI installed (`npm install -g aws-cdk`)
- [ ] Slack workspace with admin permissions
- [ ] Git repository cloned locally

## Step 1: Configure Slack App

### 1.1 Create Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"** → **"From scratch"**
3. Enter:
   - **App Name**: `Bedrock AI Assistant` (or your preferred name)
   - **Workspace**: Select your test workspace
4. Click **"Create App"**

### 1.2 Configure OAuth & Permissions

1. In the Slack App settings, navigate to **"OAuth & Permissions"**
2. Scroll to **"Scopes"** → **"Bot Token Scopes"**
3. Add the following scopes:
   - `chat:write` - Send messages
   - `im:history` - Read direct messages
   - `app_mentions:read` - Read mentions in channels
4. Save changes

### 1.3 Get Signing Secret

1. Navigate to **"Basic Information"** in the Slack App settings
2. Scroll to **"App Credentials"**
3. Copy the **"Signing Secret"** (e.g., `a1b2c3d4e5f6...`)
4. Save this value - you'll need it for environment configuration

### 1.4 Install App to Workspace

1. Navigate to **"OAuth & Permissions"**
2. Click **"Install to Workspace"**
3. Review permissions and click **"Allow"**
4. Copy the **"Bot User OAuth Token"** (starts with `xoxb-`)
5. Save this token securely

---

## Step 2: Configure AWS Environment

### 2.1 Verify Bedrock Access

```bash
# Check if Bedrock is available in your region
aws bedrock list-foundation-models --region us-east-1

# Request Claude 3 Haiku model access if not already granted
# Go to AWS Console → Bedrock → Model access → Request access
# Select: Anthropic → Claude 3 Haiku
```

### 2.2 Set Environment Variables (Initial Deployment Only)

For the initial deployment, you need to set environment variables so that CDK can create the secrets in AWS Secrets Manager. After the first deployment, these environment variables are no longer needed.

**Option 1: Using environment variables (recommended for first deployment)**

```bash
# Set environment variables for CDK deployment
export SLACK_SIGNING_SECRET=a1b2c3d4e5f6...  # From Step 1.3
export SLACK_BOT_TOKEN=xoxb-...              # From Step 1.4
```

**Option 2: Using .env file**

Create `.env` file in repository root:

```bash
# Copy template (if exists)
cp .env.example .env

# Edit .env with your values
SLACK_SIGNING_SECRET=a1b2c3d4e5f6...  # From Step 1.3
SLACK_BOT_TOKEN=xoxb-...              # From Step 1.4
```

Then load the environment variables:

```bash
# Load .env file (if using bash/zsh)
export $(cat .env | xargs)
```

**Security Note**: 
- Never commit `.env` file to Git. It's already in `.gitignore`.
- After the first deployment, secrets are stored in AWS Secrets Manager and environment variables are no longer needed.
- The secrets are automatically created in AWS Secrets Manager during CDK deployment.

---

## Step 3: Deploy Infrastructure with CDK

### 3.1 Install CDK Dependencies

```bash
cd cdk
npm install
```

### 3.2 Bootstrap CDK (First Time Only)

If you haven't used CDK in this AWS account/region before:

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
# Example: cdk bootstrap aws://123456789012/us-east-1
```

### 3.3 Install Lambda Dependencies

```bash
# Install dependencies for Slack Event Handler (slack-event-handler)
cd ../lambda/verification-stack/slack-event-handler
pip install --upgrade pip
pip install -r requirements.txt -t .

# Install dependencies for Bedrock Processor (bedrock-processor)
cd ../bedrock-processor
pip install --upgrade pip
pip install -r requirements.txt -t .
```

### 3.4 Deploy Stack

```bash
cd ../../cdk
cdk deploy --require-approval never
```

**What happens during deployment**:
- CDK creates AWS Secrets Manager secrets for `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN`
- Secrets are stored securely in AWS Secrets Manager (encrypted at rest)
- Lambda functions are granted permission to read the secrets
- Secrets are automatically injected as environment variables in Lambda functions

**Expected Output**:
```
Outputs:
SlackBedrockStack.SlackEventHandlerUrl = https://abc123.lambda-url.us-east-1.on.aws/
SlackBedrockStack.TokenTableName = slack-workspace-tokens
```

**Save the Function URL** - you'll need it in Step 4.

**Note**: After the first deployment, you don't need to set `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` environment variables anymore. The secrets are stored in AWS Secrets Manager and will be automatically used in subsequent deployments.

**Updating Secrets**: If you need to update the secret values after initial deployment, use AWS CLI or AWS Console:

```bash
# Update signing secret
aws secretsmanager update-secret \
  --secret-id SlackBedrockStack/slack/signing-secret \
  --secret-string "new-signing-secret-value" \
  --region us-east-1

# Update bot token
aws secretsmanager update-secret \
  --secret-id SlackBedrockStack/slack/bot-token \
  --secret-string "new-bot-token-value" \
  --region us-east-1
```

---

## Step 4: Configure Slack Event Subscriptions

### 4.1 Enable Event Subscriptions

1. Go back to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Select your app
3. Navigate to **"Event Subscriptions"**
4. Toggle **"Enable Events"** to ON

### 4.2 Set Request URL

1. In **"Request URL"** field, paste the Lambda Function URL from Step 3.4:
   ```
   https://abc123.lambda-url.us-east-1.on.aws/
   ```
2. Slack will send a verification challenge
3. Wait for **"Verified ✓"** status (should appear within 3 seconds)

**Troubleshooting**: If verification fails:
- Check CloudWatch Logs: AWS Console → Lambda → slack-event-handler → Monitor → Logs
- Verify the secret value in AWS Secrets Manager: AWS Console → Secrets Manager → `SlackBedrockStack/slack/signing-secret`
- Ensure Lambda function has permission to read the secret (should be automatically granted by CDK)

### 4.3 Subscribe to Bot Events

Scroll to **"Subscribe to bot events"** and add:
- `message.im` - Direct messages
- `app_mention` - Mentions in channels

Click **"Save Changes"**

### 4.4 Reinstall App

After changing event subscriptions, Slack requires reinstallation:

1. Navigate to **"Install App"**
2. Click **"Reinstall to Workspace"**
3. Click **"Allow"**

---

## Step 5: Test the Bot

### 5.1 Test Direct Message

1. Open Slack workspace
2. In sidebar, find **"Apps"** section
3. Click your bot name (e.g., "Bedrock AI Assistant")
4. Send a message:
   ```
   Hello! Can you help me?
   ```
5. **Expected**: Bot responds with AI-generated message within 10 seconds

**Example Response**:
```
Hello! I'm here to help. What would you like to know?
```

### 5.2 Test Channel Mention

1. Go to any public channel (or create test channel)
2. Invite the bot: `/invite @Bedrock AI Assistant`
3. Send a message mentioning the bot:
   ```
   @Bedrock AI Assistant What is the capital of France?
   ```
4. **Expected**: Bot responds in the same channel

### 5.3 Test Error Handling

Send an empty message or trigger an error to verify graceful handling:

1. Type a very long message (>4000 characters)
2. **Expected**: Bot responds with error message:
   ```
   Sorry, your message is too long. Please keep it under 4000 characters.
   ```

---

## Step 6: Monitor and Debug

### 6.1 View Lambda Logs

```bash
# Slack Event Handler logs
aws logs tail /aws/lambda/verification-stack/slack-event-handler --follow --region us-east-1

# Bedrock Processor logs
aws logs tail /aws/lambda/execution-stack/bedrock-processor --follow --region us-east-1
```

### 6.2 Check DynamoDB

```bash
# Verify workspace token stored
aws dynamodb scan --table-name slack-workspace-tokens --region us-east-1
```

Expected output:
```json
{
  "Items": [
    {
      "team_id": {"S": "T01234567"},
      "bot_token": {"S": "xoxb-..."},
      "installation_timestamp": {"N": "1234567890"}
    }
  ]
}
```

### 6.3 Test Bedrock Access

```bash
# Manually test Bedrock API
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-3-haiku-20240307-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}' \
  --region us-east-1 \
  response.json

cat response.json
```

---

## Troubleshooting

### Issue: Slack verification fails

**Symptoms**: "Your URL didn't respond with the value of the challenge parameter"

**Solutions**:
1. Check Lambda Function URL is correct in Slack Event Subscriptions
2. Verify HMAC signature verification code in `lambda/verification-stack/slack-event-handler/slack_verifier.py`
3. Check CloudWatch Logs for errors
4. Ensure Lambda has internet access (check VPC settings if applicable)

### Issue: Bot doesn't respond to messages

**Symptoms**: Message sent but no response

**Solutions**:
1. Check CloudWatch Logs for both Lambdas
2. Verify bot is installed in workspace: Slack → Apps → Manage Apps
3. Check Event Subscriptions are saved and enabled
4. Verify bot has `chat:write` permission
5. Check DynamoDB table has workspace token:
   ```bash
   aws dynamodb get-item \
     --table-name slack-workspace-tokens \
     --key '{"team_id":{"S":"T01234567"}}' \
     --region us-east-1
   ```

### Issue: Bedrock API errors

**Symptoms**: CloudWatch shows `AccessDeniedException` or `ThrottlingException`

**Solutions**:
1. Verify Bedrock model access granted in AWS Console
2. Check IAM role for Bedrock Processor has `bedrock:InvokeModel` permission
3. Confirm region has Bedrock available:
   ```bash
   aws bedrock list-foundation-models --region us-east-1
   ```
4. For throttling: Retry after 1 minute (Bedrock free tier limits)

### Issue: Response takes >10 seconds

**Symptoms**: User sees timeout or delayed response

**Solutions**:
1. Check Bedrock Processor CloudWatch metrics for duration
2. Verify async invocation is working (Slack Event Handler should return immediately)
3. Check Bedrock model latency in CloudWatch
4. Consider switching to faster model (already using Haiku - fastest option)

---

## Clean Up (Optional)

To remove all AWS resources:

```bash
cd cdk
cdk destroy
```

To uninstall Slack app:

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Select your app
3. Settings → Basic Information → Delete App

---

## Next Steps (Post-MVP)

After MVP validation, consider implementing:

1. **Security Enhancements** (Constitution Principle I):
   - Add Bedrock Guardrails for prompt injection detection
   - Implement PII detection and masking
   - Add authorization checks (whitelist users/channels)

2. **Context History** (Constitution Principle III):
   - Create DynamoDB table with KMS encryption
   - Store 5-turn conversation history per user-channel
   - Add context reset command

3. **Observability** (Constitution Principle IV):
   - Structured JSON logging with correlation IDs
   - CloudWatch alarms for error rates and latency
   - X-Ray tracing for distributed debugging

4. **Testing** (Constitution Principle VIII):
   - BDD scenarios with pytest-bdd
   - Integration tests with LocalStack
   - Load testing with Locust

5. **Cost Optimization** (Constitution Principle VI):
   - Per-user token quotas
   - Rate limiting (e.g., 10 requests/minute/user)
   - Cost monitoring dashboard

---

## Support

For issues or questions:
- Check CloudWatch Logs first
- Review [Slack API Documentation](https://api.slack.com/docs)
- Review [Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- Create GitHub issue with logs and error messages

---

**Estimated Setup Time**: 30-45 minutes (first time)
**Estimated Cost**: ~$0.10/day (AWS free tier + minimal Bedrock usage)
