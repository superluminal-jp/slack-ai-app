# Slack AI App - CDK Infrastructure

This CDK project deploys the Slack AI application infrastructure to AWS.

## Deployment Modes

The application supports two deployment modes:

### 1. Single Stack Mode (Legacy)

All resources in one stack. Simple but not cross-account ready.

```bash
# Set required environment variables
export SLACK_BOT_TOKEN="xoxb-your-bot-token"
export SLACK_SIGNING_SECRET="your-signing-secret"

# Deploy
npx cdk deploy SlackBedrockStack
```

### 2. Split Stack Mode (Recommended)

Two independent stacks that can be deployed to separate accounts:
- **ExecutionStack**: BedrockProcessor + API Gateway
- **VerificationStack**: SlackEventHandler + DynamoDB + Secrets

#### Step 1: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# From project root
cat > .env << EOF
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
EOF
```

#### Step 2: Update cdk.json

Add account IDs to `cdk.json`:

```json
{
  "context": {
    "deploymentMode": "split",
    "verificationStackName": "SlackAI-Verification",
    "executionStackName": "SlackAI-Execution",
    "verificationAccountId": "YOUR_AWS_ACCOUNT_ID",
    "executionAccountId": "YOUR_AWS_ACCOUNT_ID"
  }
}
```

**Note**: Get your account ID with: `aws sts get-caller-identity --query Account --output text`

#### Step 3: Deploy Execution Stack

```bash
# Load environment variables from .env
set -a && source ../.env && set +a

# Deploy Execution Stack
npx cdk deploy SlackAI-Execution \
  --context deploymentMode=split \
  --profile YOUR_PROFILE \
  --require-approval never
```

Note the `ExecutionApiUrl` from the outputs.

#### Step 4: Deploy Verification Stack

```bash
# Load environment variables from .env
set -a && source ../.env && set +a

# Deploy Verification Stack with ExecutionApiUrl
npx cdk deploy SlackAI-Verification \
  --context deploymentMode=split \
  --context executionApiUrl=<ExecutionApiUrl from step 3> \
  --profile YOUR_PROFILE \
  --require-approval never
```

Note the `VerificationLambdaRoleArn` from the outputs.

#### Step 5: Update Execution Stack with Resource Policy

```bash
# Update Execution Stack to add API Gateway resource policy
npx cdk deploy SlackAI-Execution \
  --context deploymentMode=split \
  --context verificationLambdaRoleArn=<VerificationLambdaRoleArn from step 4> \
  --context verificationAccountId=YOUR_AWS_ACCOUNT_ID \
  --profile YOUR_PROFILE \
  --require-approval never
```

#### Alternative: Use Deployment Script

For automated 3-phase deployment, use the provided script:

```bash
# From project root
cd scripts
chmod +x deploy-split-stacks.sh
./deploy-split-stacks.sh
```

This script automatically:
1. Deploys Execution Stack
2. Deploys Verification Stack with ExecutionApiUrl
3. Updates Execution Stack with VerificationLambdaRoleArn

### Cross-Account Deployment (Future)

For deploying to separate AWS accounts, set these in `cdk.json`:

```json
{
  "context": {
    "deploymentMode": "cross-account",
    "verificationAccountId": "111111111111",
    "executionAccountId": "222222222222"
  }
}
```

Then follow the same steps as split-stack mode.

## Stack Outputs

### ExecutionStack
| Output | Description |
|--------|-------------|
| ExecutionApiUrl | API Gateway URL for VerificationStack configuration |
| ExecutionApiArn | API Gateway ARN for IAM policy |
| BedrockProcessorArn | Lambda function ARN |

### VerificationStack
| Output | Description |
|--------|-------------|
| SlackEventHandlerUrl | Function URL for Slack Event Subscriptions |
| VerificationLambdaRoleArn | Role ARN for ExecutionStack resource policy |
| SlackEventHandlerArn | Lambda function ARN |

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch for changes and compile |
| `npm run test` | Run Jest unit tests |
| `npx cdk deploy` | Deploy stack(s) |
| `npx cdk diff` | Compare deployed stack with current state |
| `npx cdk synth` | Emit synthesized CloudFormation template |
| `npx cdk destroy` | Destroy stack(s) |

## Destroy Order (Split Stack)

When destroying split stacks, follow this order:

```bash
# 1. Destroy Verification Stack first
npx cdk destroy SlackAI-Verification

# 2. Then destroy Execution Stack
npx cdk destroy SlackAI-Execution
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| SLACK_BOT_TOKEN | Yes | Slack Bot OAuth Token |
| SLACK_SIGNING_SECRET | Yes | Slack Signing Secret |
| ENABLE_API_GATEWAY_MONITORING | No | Enable CloudWatch dashboard |
| ALARM_EMAIL | No | Email for alarm notifications |

## Testing

```bash
# Run unit tests
npm run test

# Run specific test file
npm run test -- execution-stack.test.ts
npm run test -- verification-stack.test.ts
```
