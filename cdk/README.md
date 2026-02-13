# Slack AI App - CDK Infrastructure

This CDK project deploys the Slack AI application infrastructure to AWS using two independent stacks, with Amazon Bedrock AgentCore A2A protocol support. Agent containers use FastAPI + uvicorn for direct route handling.

## Deployment Architecture

The application uses two independent stacks that can be deployed separately, supporting both same-account and cross-account deployments:

- **ExecutionStack**: Execution Agent (AgentCore Runtime + ECR)
- **VerificationStack**: SlackEventHandler Lambda + Verification Agent (AgentCore Runtime) + S3 file exchange bucket + DynamoDB + Secrets

Communication between zones is exclusively via AgentCore A2A (no API Gateway or SQS).

### Stack Independence

Both stacks can be deployed independently using CDK CLI. This follows CDK best practices for modular infrastructure:

**Deploy ExecutionStack only:**

```bash
export DEPLOYMENT_ENV=dev
npx cdk deploy SlackAI-Execution-Dev
```

**Deploy VerificationStack only** (requires `executionAgentArn` from Execution Stack or config):

```bash
export DEPLOYMENT_ENV=dev
npx cdk deploy SlackAI-Verification-Dev
```

**Key benefits of independent deployment:**

- Deploy ExecutionStack without VerificationStack
- Deploy VerificationStack after ExecutionStack is deployed (with `executionAgentArn` from output or config)
- Update either stack independently without affecting the other
- Deploy to different AWS accounts (cross-account deployment)
- Better separation of concerns and lifecycle management

**Stack dependencies:**

- ExecutionStack: No dependencies (can be deployed standalone)
- VerificationStack: Requires `executionAgentArn` from Execution Stack output (or set in `cdk.config.{env}.json`)

### Step 1: Create Configuration File

Create environment-specific configuration files:

```bash
# From project root
# For development environment
cp cdk/cdk.config.json.example cdk/cdk.config.dev.json

# For production environment (if using production)
cp cdk/cdk.config.json.example cdk/cdk.config.prod.json
```

Edit `cdk/cdk.config.dev.json` (or `cdk/cdk.config.prod.json`) and set:

- `verificationAccountId`: Your AWS account ID
- `executionAccountId`: Your AWS account ID
- `slackBotToken`: Your Slack Bot OAuth Token
- `slackSigningSecret`: Your Slack Signing Secret

**Note**: You can also set Slack credentials via environment variables (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`), but configuration files are recommended for easier management.

### Step 1.5: Set Deployment Environment (Optional)

Set the deployment environment (`dev` or `prod`). If not set, defaults to `dev`:

```bash
export DEPLOYMENT_ENV=dev  # or 'prod' for production
```

**Note**: Stack names will automatically include environment suffix (`-Dev` or `-Prod`).

### Step 2: Configure CDK Settings

CDK configuration is managed through environment-specific JSON files. Create or update the configuration file for your environment:

**For development environment:**

```bash
cp cdk.config.json.example cdk.config.dev.json
# Edit cdk.config.dev.json with your settings
```

**For production environment:**

```bash
cp cdk.config.json.example cdk.config.prod.json
# Edit cdk.config.prod.json with your settings
```

**Configuration file structure (`cdk.config.dev.json` or `cdk.config.prod.json`):**

```json
{
  "awsRegion": "ap-northeast-1",
  "bedrockModelId": "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "deploymentEnv": "dev",
  "verificationStackName": "SlackAI-Verification",
  "executionStackName": "SlackAI-Execution",
  "verificationAccountId": "YOUR_AWS_ACCOUNT_ID",
  "executionAccountId": "YOUR_AWS_ACCOUNT_ID",
  "slackBotToken": "",
  "slackSigningSecret": "",
  "executionAgentName": "SlackAI-ExecutionAgent",
  "verificationAgentName": "SlackAI-VerificationAgent",
  "executionAgentArn": ""
}
```

**Configuration Priority (high to low):**

1. **Environment variables** (`DEPLOYMENT_ENV`, `AWS_REGION`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, etc.)
2. **Command-line arguments** (`--context key=value`)
3. **Environment-specific config file** (`cdk.config.{env}.json`)
4. **Local config file** (`cdk.config.local.json` - optional, gitignored)
5. **Base config file** (`cdk.config.json` - optional)
6. **Default values** (in code)

**Note**:

- Get your account ID with: `aws sts get-caller-identity --query Account --output text`
- **Deployment order** (A2A only):
  1. Deploy ExecutionStack → Get `ExecutionAgentRuntimeArn` from outputs
  2. Set `executionAgentArn` in config (or use cross-stack reference when both stacks in same app) and deploy VerificationStack
- **Slack credentials** (`slackBotToken`, `slackSigningSecret`) can be set via environment variables or config file. Environment variables take precedence.
- **Security**: If you include Slack credentials in config files, ensure they are not committed to Git. Use `cdk.config.local.json` (gitignored) for sensitive values, or use environment variables instead.
- You can create `cdk.config.local.json` for personal overrides (this file is gitignored)

### Step 3: Deploy Execution Stack

```bash
# Set deployment environment (if not already set)
export DEPLOYMENT_ENV=dev  # or 'prod'

# Deploy Execution Stack (note: stack name includes environment suffix)
npx cdk deploy SlackAI-Execution-Dev \
  --context deploymentEnv=dev \
  --profile YOUR_PROFILE \
  --require-approval never
```

**Note**: Configuration is automatically loaded from `cdk.config.{env}.json`. You can also set Slack credentials via environment variables if preferred.

**Note**: Stack names now include environment suffix. Use `SlackAI-Execution-Dev` for dev or `SlackAI-Execution-Prod` for prod.

Note the `ExecutionAgentRuntimeArn` from the outputs.

### Step 4: Deploy Verification Stack

```bash
# Set deployment environment (must match Step 3)
export DEPLOYMENT_ENV=dev  # or 'prod'

# Set executionAgentArn (from Step 3 output) in cdk.config.dev.json or via context
# Then deploy Verification Stack
npx cdk deploy SlackAI-Verification-Dev \
  --context deploymentEnv=dev \
  --context executionAgentArn=<ExecutionAgentRuntimeArn from step 3> \
  --profile YOUR_PROFILE \
  --require-approval never
```

**Note**: Alternatively, set `executionAgentArn` in `cdk.config.{env}.json` and run without `--context executionAgentArn`.

**Note**: Use `SlackAI-Verification-Dev` for dev or `SlackAI-Verification-Prod` for prod.

### Alternative: Use Deployment Script

For automated A2A-only deployment (Execution then Verification with executionAgentArn), use the provided script:

```bash
# From project root
# Set deployment environment (dev or prod)
export DEPLOYMENT_ENV=dev  # or 'prod' for production

# Optional: Set AWS profile if using named profiles
export AWS_PROFILE=your-profile-name

# Run deployment script
chmod +x scripts/deploy-split-stacks.sh
./scripts/deploy-split-stacks.sh
```

**Note**: The deployment script automatically loads configuration from `cdk.config.{env}.json`. Make sure you have created and configured the appropriate configuration file before running the script.

**Note**: The deployment script automatically loads configuration from `cdk.config.{env}.json`. Make sure you have created and configured the appropriate configuration file before running the script.

This script automatically:

1. Validates deployment environment (`dev` or `prod`)
2. Sets stack names with environment suffix (`-Dev` or `-Prod`)
3. Deploys Execution Stack
4. Gets ExecutionAgentRuntimeArn and updates `cdk.config.{env}.json`
5. Deploys Verification Stack with executionAgentArn (A2A-only)

**Note**:

- The script supports AWS profile via `AWS_PROFILE` environment variable. If not set, it uses default AWS credentials.
- If `DEPLOYMENT_ENV` is not set, the script defaults to `dev` with a warning.
- All resources are automatically tagged with `Environment`, `Project`, `ManagedBy`, and `StackName` tags.

### Cross-Account Deployment

For deploying to separate AWS accounts, set these in your configuration file (`cdk.config.{env}.json`):

```json
{
  "verificationAccountId": "111111111111",
  "executionAccountId": "222222222222"
}
```

Or via command-line context:

```bash
npx cdk deploy SlackAI-Execution-Dev \
  --context verificationAccountId=111111111111 \
  --context executionAccountId=222222222222
```

Then follow the same steps as above. The deployment script (`scripts/deploy-split-stacks.sh`) supports cross-account deployment.

## Stack Outputs

### ExecutionStack

| Output                   | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| ExecutionAgentRuntimeArn | AgentCore Runtime ARN (for Verification Stack config) |

### VerificationStack

| Output                      | Description                                |
| --------------------------- | ------------------------------------------ |
| SlackEventHandlerUrl        | Function URL for Slack Event Subscriptions |
| VerificationLambdaRoleArn   | Lambda role ARN                            |
| SlackEventHandlerArn        | Lambda function ARN                        |
| VerificationAgentRuntimeArn | AgentCore Runtime ARN                      |

## Useful Commands

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `npm run build`   | Compile TypeScript to JavaScript          |
| `npm run watch`   | Watch for changes and compile             |
| `npm run test`    | Run Jest unit tests                       |
| `npx cdk deploy`  | Deploy stack(s)                           |
| `npx cdk diff`    | Compare deployed stack with current state |
| `npx cdk synth`   | Emit synthesized CloudFormation template  |
| `npx cdk destroy` | Destroy stack(s)                          |

## Destroy Order (Split Stack)

When destroying split stacks, follow this order:

```bash
# Set deployment environment
export DEPLOYMENT_ENV=dev  # or 'prod' for production

# 1. Destroy Verification Stack first
npx cdk destroy SlackAI-Verification-Dev  # or SlackAI-Verification-Prod

# 2. Then destroy Execution Stack
npx cdk destroy SlackAI-Execution-Dev  # or SlackAI-Execution-Prod
```

**Note**: Stack names automatically include environment suffix (`-Dev` or `-Prod`). Make sure to specify the correct environment when destroying stacks.

## Environment Separation

This project supports environment separation for development (`dev`) and production (`prod`) deployments:

- **Stack Names**: Automatically suffixed with `-Dev` or `-Prod` (e.g., `SlackAI-Execution-Dev`, `SlackAI-Verification-Prod`)
- **Resource Isolation**: All resources (Lambda, DynamoDB, Secrets Manager, AgentCore runtimes, etc.) are automatically separated by environment
- **Resource Tagging**: All resources are tagged with:
  - `Environment`: `dev` or `prod`
  - `Project`: `SlackAI`
  - `ManagedBy`: `CDK`
  - `StackName`: The stack name

**Usage:**

```bash
# Deploy to development environment
export DEPLOYMENT_ENV=dev
./scripts/deploy-split-stacks.sh

# Deploy to production environment
export DEPLOYMENT_ENV=prod
./scripts/deploy-split-stacks.sh
```

**Note**: If `DEPLOYMENT_ENV` is not set, defaults to `dev` with a warning. Each environment should use separate Slack apps/workspaces or different secrets for security.

These resource names are automatically suffixed with the environment name to ensure complete isolation between dev and prod environments.

## Configuration Files

CDK configuration is managed through environment-specific JSON files with type validation using Zod.

### Configuration File Structure

```
cdk/
├── cdk.config.json              # Base configuration (optional, shared across environments)
├── cdk.config.dev.json         # Development environment configuration (recommended: commit to git)
├── cdk.config.prod.json         # Production environment configuration (recommended: commit to git)
├── cdk.config.local.json       # Local overrides (gitignored, for personal use)
└── cdk.config.json.example     # Configuration template
```

### Configuration Fields

| Field                   | Required | Type   | Description                                                                       |
| ----------------------- | -------- | ------ | --------------------------------------------------------------------------------- |
| `awsRegion`             | Yes      | string | AWS region for deployment (e.g., `ap-northeast-1`)                                |
| `bedrockModelId`        | Yes      | string | Bedrock model ID (e.g., `jp.anthropic.claude-sonnet-4-5-20250929-v1:0`)           |
| `deploymentEnv`         | Yes      | enum   | Deployment environment: `"dev"` or `"prod"`                                       |
| `verificationStackName` | Yes      | string | Base name for Verification Stack (without environment suffix)                     |
| `executionStackName`    | Yes      | string | Base name for Execution Stack (without environment suffix)                        |
| `verificationAccountId` | Yes      | string | 12-digit AWS account ID for Verification Stack                                    |
| `executionAccountId`    | Yes      | string | 12-digit AWS account ID for Execution Stack                                       |
| `slackBotToken`         | No       | string | Slack Bot OAuth Token (can be set via environment variable `SLACK_BOT_TOKEN`)     |
| `slackSigningSecret`    | No       | string | Slack Signing Secret (can be set via environment variable `SLACK_SIGNING_SECRET`) |
| `executionAgentName`    | No       | string | AgentCore Execution Agent name (e.g., `SlackAI-ExecutionAgent`)                   |
| `verificationAgentName` | No       | string | AgentCore Verification Agent name (e.g., `SlackAI-VerificationAgent`)             |
| `executionAgentArn`     | No       | string | Execution Agent Runtime ARN (populated after Execution Stack deployment)          |

### Configuration Validation

All configuration files are validated using Zod schemas:

- **Type checking**: Ensures correct data types
- **Format validation**: Validates AWS region format, account IDs (12 digits), ARN format, URL format
- **Required fields**: Ensures all required fields are present
- **Enum validation**: Ensures `deploymentEnv` uses valid values (`dev` or `prod`)

Validation errors provide clear, actionable error messages indicating which fields are invalid.

## Environment Variables

| Variable                | Required | Description                                                                                   |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------- |
| DEPLOYMENT_ENV          | No       | Deployment environment (`dev` or `prod`). Defaults to `dev`                                   |
| AWS_REGION              | No       | AWS region (overrides config file)                                                            |
| BEDROCK_MODEL_ID        | No       | Bedrock model ID (overrides config file)                                                      |
| VERIFICATION_ACCOUNT_ID | No       | Verification account ID (overrides config file)                                               |
| EXECUTION_ACCOUNT_ID    | No       | Execution account ID (overrides config file)                                                  |
| SLACK_BOT_TOKEN         | No\*     | Slack Bot OAuth Token (required if not set in config file. Takes precedence over config file) |
| SLACK_SIGNING_SECRET    | No\*     | Slack Signing Secret (required if not set in config file. Takes precedence over config file)  |
| EXECUTION_AGENT_ARN     | No       | Execution Agent Runtime ARN (overrides config file)                                           |
| ALARM_EMAIL             | No       | Email for alarm notifications                                                                 |

**Note**: `*` indicates that the variable is required if not provided via config file. Either environment variable or config file value must be set.

## Project Structure

The CDK project follows a fully separated stack structure where each stack is self-contained:

```
cdk/
├── bin/
│   └── cdk.ts                        # CDK application entry point
├── lib/
│   ├── execution/                     # Execution Stack
│   │   ├── execution-stack.ts         # Stack definition
│   │   ├── constructs/
│   │   │   ├── execution-agent-runtime.ts  # AgentCore Runtime (A2A)
│   │   │   └── execution-agent-ecr.ts      # ECR image build
│   │   ├── agent/
│   │   │   └── execution-agent/            # Execution Agent container
│   │   │       ├── Dockerfile              # ARM64 container
│   │   │       ├── requirements.txt
│   │   │       ├── main.py                 # FastAPI server (port 9000)
│   │   │       ├── agent_card.py           # Agent Card
│   │   │       ├── cloudwatch_metrics.py
│   │   │       ├── bedrock_client_converse.py
│   │   │       ├── attachment_processor.py
│   │   │       └── tests/                  # Python tests (79 tests)
│   ├── verification/                  # Verification Stack
│   │   ├── verification-stack.ts      # Stack definition
│   │   ├── constructs/
│   │   │   ├── verification-agent-runtime.ts  # AgentCore Runtime (A2A)
│   │   │   ├── verification-agent-ecr.ts      # ECR image build
│   │   │   ├── slack-event-handler.ts         # Invokes Verification Agent via A2A
│   │   │   └── (other constructs)
│   │   ├── agent/
│   │   │   └── verification-agent/            # Verification Agent container
│   │   │       ├── Dockerfile                 # ARM64 container
│   │   │       ├── requirements.txt
│   │   │       ├── main.py                    # FastAPI server (port 9000)
│   │   │       ├── a2a_client.py              # Execution Agent A2A client
│   │   │       ├── agent_card.py              # Agent Card
│   │   │       ├── cloudwatch_metrics.py
│   │   │       └── tests/                     # Python tests (63 tests)
│   │   └── lambda/
│   │       └── slack-event-handler/
│   └── types/                         # Shared type definitions
├── test/                              # CDK/Jest tests (25 tests)
│   └── agentcore-constructs.test.ts   # AgentCore construct tests
├── package.json
├── tsconfig.json
└── cdk.json
```

**Key Benefits of This Structure**:

- **Complete Stack Isolation**: Each stack contains CDK code and AgentCore agent code; Verification also has SlackEventHandler Lambda
- **A2A-Only Communication**: Inter-zone communication is exclusively via AgentCore A2A
- **Comprehensive Testing**: 167+ tests (Execution 79 + Verification 63 + CDK/Jest 25+)
- **Maintainability**: Changes to one stack don't affect the other
- **Best Practices**: Follows monorepo patterns for feature-based separation

## Testing

```bash
# Run all CDK/Jest tests
npm run test

# Run AgentCore construct tests (25 tests)
npx jest test/agentcore-constructs.test.ts --verbose

# Run specific stack tests
npx jest test/execution-stack.test.ts
npx jest test/verification-stack.test.ts

# Run Python agent tests
cd lib/execution/agent/execution-agent && python -m pytest tests/ -v     # 79 tests
cd lib/verification/agent/verification-agent && python -m pytest tests/ -v  # 93 tests
```

### Test Coverage

| Test Suite           | Framework | Tests   | Description                                                                              |
| -------------------- | --------- | ------- | ---------------------------------------------------------------------------------------- |
| AgentCore Constructs | Jest      | 25      | Runtime, IAM, cross-account policies, echo mode config                                   |
| Execution Agent      | pytest    | 110     | FastAPI server, Bedrock, Agent Card, metrics, file artifacts, attachment processing      |
| Verification Agent   | pytest    | 93      | Security pipeline, A2A client, Slack posting, Agent Card, file posting, S3 file transfer |
| **Total**            |           | **228** | **All passing**                                                                          |

## Logging and documentation conventions

These conventions define how we log lifecycle events and document code (FR-006) so that operators and maintainers can trace behavior and understand intent without reading implementation details.

### Logging

- **Where**: Use the structured logger in `lib/utils/cdk-logger.ts` for app-entry and lifecycle events (e.g. config load, stack creation). Do not add ad-hoc `console.log`/`console.warn` for operational messages.
- **Format**: Each log entry has a **level** (`info`, `warn`, `error`, `debug`), a **message**, and optionally a **phase** (e.g. `config`, `synthesis`, `stack`, `construct`) and **context** (key-value object). See `specs/029-cdk-logging-error-handling/contracts/log-event.schema.json`.
- **No secrets**: Never include secrets, tokens, or PII in log messages or context. Caller is responsible for omitting sensitive data.
- **Environment**: Logging works when stdout/stderr is redirected or in CI; do not assume an interactive TTY.

### Errors

- **Entry-point validation**: Use `CdkError` from `lib/utils/cdk-error.ts` when throwing from the app entry (e.g. invalid deployment environment, config load failure). Provide a clear **message**, optional **cause**, **remediation** (e.g. allowed values), and **source** (`app`, `stack`, `construct`, `toolkit`). See `specs/029-cdk-logging-error-handling/contracts/error-report.schema.json`.
- **No secrets**: Never include secrets or PII in error message, cause, or remediation. When wrapping a nested error, do not copy raw error text that might contain secrets.

### Comments and JSDoc

- **Module level**: Every top-level stack and construct module should have a short JSDoc block describing (1) **purpose** (what this unit does and why it exists) and (2) **main responsibilities**. Optionally list key inputs/outputs.
- **Function/API level**: Public APIs (constructs, props interfaces, notable functions) should have JSDoc with a summary and, where relevant, `@param` and `@returns`. Document non-obvious configuration choices, ordering, and constraints at the point of use.
- **Style**: Use a single, consistent style across the CDK codebase so that maintainers know where to find explanations (module vs. function level).
