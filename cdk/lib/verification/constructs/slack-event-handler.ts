import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";
import { execSync } from "child_process";
import * as fs from "fs";

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
  /** ARN of Verification Agent Runtime (A2A path). Required. */
  verificationAgentArn: string;
  /** SQS queue for async agent invocation (016). When set, handler sends requests here instead of invoking AgentCore directly. */
  agentInvocationQueue?: sqs.IQueue;
}

export class SlackEventHandler extends Construct {
  public readonly function: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: SlackEventHandlerProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
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
            "pip install --no-cache-dir -r requirements.txt -t /asset-output && cp -r . /asset-output",
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
      // A2A / Execution 応答待ち（Bedrock 推論含む）。60s でタイムアウトするため 120s に延長
      timeout: cdk.Duration.seconds(120),
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
        // A2A: Verification Agent Runtime ARN (required)
        VERIFICATION_AGENT_ARN: props.verificationAgentArn,
        // 016: when set, handler sends to SQS instead of invoking AgentCore directly
        ...(props.agentInvocationQueue && {
          AGENT_INVOCATION_QUEUE_URL: props.agentInvocationQueue.queueUrl,
        }),
      },
    });

    // 016: Grant SQS SendMessage when async invocation queue is provided
    if (props.agentInvocationQueue) {
      props.agentInvocationQueue.grantSendMessages(this.function);
    }

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
        actions: ["bedrock-agentcore:InvokeAgentRuntime"],
        resources: [props.verificationAgentArn, runtimeEndpointArn],
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
