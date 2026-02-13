import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";
import { execSync } from "child_process";
import * as fs from "fs";

/**
 * Slack Event Handler Lambda construct.
 *
 * Purpose: Receive Slack events (Function URL), validate signature and token, then invoke
 * Verification Agent (A2A) or enqueue to SQS for async invocation.
 *
 * Responsibilities: Lambda with Function URL; Slack signing verification; DynamoDB/Secrets
 * integration; invoke AgentCore or push to agentInvocationQueue.
 *
 * Inputs: SlackEventHandlerProps (secrets, table names, verificationAgentArn, region, model, optional queue).
 *
 * Outputs: function, functionUrl.
 */
export interface SlackEventHandlerProps {
  slackSigningSecret: secretsmanager.ISecret; // Slack app signing secret from Secrets Manager
  slackBotTokenSecret: secretsmanager.ISecret; // Bot OAuth token from Secrets Manager
  tokenTableName: string; // DynamoDB table name for token storage
  dedupeTableName: string; // DynamoDB table name for event deduplication
  existenceCheckCacheTableName: string; // DynamoDB table name for Existence Check cache
  whitelistConfigTableName: string; // DynamoDB table name for whitelist configuration
  rateLimitTableName: string; // DynamoDB table name for rate limiting
  awsRegion: string; // AWS region (e.g., ap-northeast-1)
  bedrockModelId: string; // Bedrock model ID (e.g., amazon.nova-pro-v1:0)
  executionApiUrl: string; // API Gateway URL for Execution Layer (required)
}

export class SlackEventHandler extends Construct {
  public readonly function: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: SlackEventHandlerProps) {
    super(scope, id);

    // Get deployment environment from stack name or context
    const stack = cdk.Stack.of(this);
    const stackName = stack.stackName;
    const deploymentEnv = stackName.includes("-Prod") ? "prod" : "dev";

    const lambdaPath = path.join(__dirname, "../lambda/slack-event-handler");
    
    // Create Lambda function for Slack event handling
    this.function = new lambda.Function(this, "Handler", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "handler.lambda_handler",
      code: lambda.Code.fromAsset(lambdaPath, {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            "bash",
            "-c",
            "pip install --no-cache-dir -r requirements.txt -t /asset-output && cp -au . /asset-output",
          ],
          // Local bundling for faster builds and Colima compatibility
          local: {
            tryBundle(outputDir: string): boolean {
              try {
                // Check if pip is available locally
                execSync("pip --version", { stdio: "pipe" });
                // Install requirements locally
                execSync(
                  `pip install --no-cache-dir -r ${path.join(lambdaPath, "requirements.txt")} -t ${outputDir} --quiet`,
                  { stdio: "pipe" }
                );
                // Copy source files (using fs for cross-platform compatibility)
                const files = fs.readdirSync(lambdaPath);
                for (const file of files) {
                  const srcPath = path.join(lambdaPath, file);
                  const destPath = path.join(outputDir, file);
                  const stat = fs.statSync(srcPath);
                  if (stat.isFile()) {
                    fs.copyFileSync(srcPath, destPath);
                  } else if (stat.isDirectory() && file !== "__pycache__") {
                    fs.cpSync(srcPath, destPath, { recursive: true });
                  }
                }
                return true;
              } catch {
                // Fall back to Docker bundling
                return false;
              }
            },
          },
        },
      }),
      timeout: cdk.Duration.seconds(10),
      environment: {
        TOKEN_TABLE_NAME: props.tokenTableName,
        DEDUPE_TABLE_NAME: props.dedupeTableName,
        EXISTENCE_CHECK_CACHE_TABLE: props.existenceCheckCacheTableName,
        WHITELIST_TABLE_NAME: props.whitelistConfigTableName,
        RATE_LIMIT_TABLE_NAME: props.rateLimitTableName,
        AWS_REGION_NAME: props.awsRegion,
        BEDROCK_MODEL_ID: props.bedrockModelId,
        // Store secret names (not values) in environment variables
        // Lambda function will fetch the actual secret values from Secrets Manager at runtime
        SLACK_SIGNING_SECRET_NAME: props.slackSigningSecret.secretName,
        SLACK_BOT_TOKEN_SECRET_NAME: props.slackBotTokenSecret.secretName,
        // Optional: Whitelist secret name (can be set via environment variable or Secrets Manager)
        // Format: {stackName}/slack/whitelist-config
        WHITELIST_SECRET_NAME: `${cdk.Stack.of(this).stackName}/slack/whitelist-config`,
        // Optional: Whitelist environment variables (comma-separated values)
        // These are optional fallbacks if DynamoDB and Secrets Manager are not used
        // WHITELIST_TEAM_IDS, WHITELIST_USER_IDS, WHITELIST_CHANNEL_IDS can be set via CDK context or environment
        // API Gateway URL for Execution Layer (required)
        EXECUTION_API_URL: props.executionApiUrl,
        // Authentication method for Execution API (default: 'api_key')
        // Set to 'iam' to use IAM authentication
        EXECUTION_API_AUTH_METHOD: process.env.EXECUTION_API_AUTH_METHOD || "api_key",
        // API key secret name in Secrets Manager (required if EXECUTION_API_AUTH_METHOD is 'api_key')
        // Default: 'execution-api-key-{env}' (environment-specific)
        EXECUTION_API_KEY_SECRET_NAME: process.env.EXECUTION_API_KEY_SECRET_NAME || `execution-api-key-${deploymentEnv}`,
      },
    });

    // Grant Lambda function permission to read secrets
    props.slackSigningSecret.grantRead(this.function);
    props.slackBotTokenSecret.grantRead(this.function);
    
    // Grant Lambda function permission to read whitelist config from Secrets Manager (optional)
    // The secret name follows the pattern: {stackName}/slack/whitelist-config
    // This permission allows reading the whitelist config secret if it exists
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:${cdk.Stack.of(this).stackName}/slack/whitelist-config*`,
        ],
      })
    );

    // Grant AgentCore Runtime invocation permission (A2A path).
    // 026 US1 (T007): Least privilege — scoped to specific ARNs per audit-iam-bedrock.md.
    // Per AWS: both runtime and endpoint may be evaluated for InvokeAgentRuntime.
    // https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html
    const runtimeEndpointArn = `${props.verificationAgentArn}/runtime-endpoint/DEFAULT`;
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:execution-api-key-${deploymentEnv}*`,
        ],
      })
    );

    // Grant Bedrock permissions to Lambda function
    // Per AWS official documentation, use wildcard resource with optional conditions
    // Reference: https://docs.aws.amazon.com/bedrock/latest/userguide/security_iam_service-with-iam.html
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: ["*"], // AWS recommended approach
        // Optional: Add condition to restrict to specific model
        // conditions: {
        //   StringEquals: {
        //     "bedrock:ModelId": "amazon.nova-pro-v1:0"
        //   }
        // }
      })
    );

    // Grant CloudWatch permissions for Existence Check metrics (Phase 6 - Polish)
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "cloudwatch:namespace": "SlackEventHandler",
          },
        },
      })
    );

    // Create Function URL (no auth - signature verification in code)
    this.functionUrl = this.function.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
  }
}
