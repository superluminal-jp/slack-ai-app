# Quickstart: Post–015 Migration (A2A-Only Deployment)

**Branch**: `015-agentcore-a2a-migration`

After this feature is implemented, deployment uses only the AgentCore A2A path. Legacy API Gateway, SQS, and Lambda (BedrockProcessor, SlackResponseHandler) are removed.

---

## Prerequisites

- AWS CLI configured with credentials for Execution and Verification accounts (if cross-account).
- Node 18+ and `npm ci` in `cdk/`.
- `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` (or config file) for Verification Stack.
- No dependency on `ExecutionApiUrl`, `ExecutionResponseQueueUrl`, or `USE_AGENTCORE`.

---

## Deployment Order

### 1. Deploy Execution Stack (Account B / Execution Zone)

Deploy the Execution Stack first. It will only create:

- Execution Agent ECR image and AgentCore Runtime
- Stack output: **ExecutionAgentRuntimeArn** (and optional ExecutionAgentRuntimeArn export)

```bash
cd cdk
npm ci
npx cdk deploy ExecutionStack --require-approval never
```

Capture the output `ExecutionAgentRuntimeArn` (or use the export name `ExecutionStack-ExecutionAgentArn`).

### 2. Deploy Verification Stack (Account A / Verification Zone)

Deploy the Verification Stack with the Execution Agent ARN. No `executionApiUrl` or `executionResponseQueueUrl` context.

```bash
npx cdk deploy VerificationStack \
  --context executionAgentArn=<ExecutionAgentRuntimeArn from step 1> \
  --context executionAccountId=<Execution account ID if cross-account> \
  --require-approval never
```

Required context (from config or `--context`):

- `slackBotToken`, `slackSigningSecret` (or from env)
- `executionAgentArn`: ARN of the Execution Agent Runtime (from Execution Stack output)

Optional for cross-account:

- `executionAccountId`: Execution Stack’s AWS account ID

### 3. Configure Slack

Point Slack Event Subscriptions Request URL to the **SlackEventHandler Function URL** (output `SlackEventHandlerUrl` from Verification Stack). No changes to Slack app scopes if already using A2A (e.g. `files:write` from 014).

---

## Validation

1. **Slack**: Send an app_mention to the bot; confirm the AI reply and (if applicable) file artifact in the thread.
2. **No legacy resources**: In CloudFormation (Execution and Verification stacks), confirm there are no API Gateway, BedrockProcessor Lambda, SlackResponseHandler Lambda, or ExecutionResponseQueue resources.
3. **AWS MCP** (per FR-013): Run validation against deployed stacks and CDK templates for security and best-practice compliance (e.g., IAM least-privilege, encryption, observability).

---

## Rollback

If issues appear after deployment, fix forward (code/config fix and redeploy). There is no legacy path to roll back to; ensure A2A is validated in a lower environment before production.
