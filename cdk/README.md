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

#### Step 1: Update cdk.json

```json
{
  "context": {
    "deploymentMode": "split",
    "verificationStackName": "SlackAI-Verification",
    "executionStackName": "SlackAI-Execution"
  }
}
```

#### Step 2: Deploy Execution Stack

```bash
export SLACK_BOT_TOKEN="xoxb-your-bot-token"
export SLACK_SIGNING_SECRET="your-signing-secret"

npx cdk deploy SlackAI-Execution
```

Note the `ExecutionApiUrl` from the outputs.

#### Step 3: Configure and Deploy Verification Stack

Update `cdk.json`:
```json
{
  "context": {
    "executionApiUrl": "https://xxx.execute-api.ap-northeast-1.amazonaws.com/prod/"
  }
}
```

Deploy:
```bash
npx cdk deploy SlackAI-Verification
```

Note the `VerificationLambdaRoleArn` from the outputs.

#### Step 4: Update Execution Stack with Resource Policy

Update `cdk.json`:
```json
{
  "context": {
    "verificationLambdaRoleArn": "arn:aws:iam::123456789012:role/..."
  }
}
```

Re-deploy:
```bash
npx cdk deploy SlackAI-Execution
```

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
