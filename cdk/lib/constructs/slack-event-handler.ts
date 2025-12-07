import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

export interface SlackEventHandlerProps {
  slackSigningSecret: secretsmanager.ISecret; // Slack app signing secret from Secrets Manager
  slackBotTokenSecret: secretsmanager.ISecret; // Bot OAuth token from Secrets Manager
  tokenTableName: string; // DynamoDB table name for token storage
  dedupeTableName: string; // DynamoDB table name for event deduplication
  existenceCheckCacheTableName: string; // DynamoDB table name for Existence Check cache
  awsRegion: string; // AWS region (e.g., ap-northeast-1)
  bedrockModelId: string; // Bedrock model ID (e.g., amazon.nova-pro-v1:0)
  executionApiUrl: string; // API Gateway URL for Execution Layer (required)
}

export class SlackEventHandler extends Construct {
  public readonly function: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: SlackEventHandlerProps) {
    super(scope, id);

    // Create Lambda function for Slack event handling
    this.function = new lambda.Function(this, "Handler", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "handler.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../../lambda/slack-event-handler"),
        {
          bundling: {
            image: lambda.Runtime.PYTHON_3_11.bundlingImage,
            command: [
              "bash",
              "-c",
              "pip install --no-cache-dir -r requirements.txt -t /asset-output && cp -au . /asset-output",
            ],
          },
        }
      ),
      timeout: cdk.Duration.seconds(10),
      environment: {
        TOKEN_TABLE_NAME: props.tokenTableName,
        DEDUPE_TABLE_NAME: props.dedupeTableName,
        EXISTENCE_CHECK_CACHE_TABLE: props.existenceCheckCacheTableName,
        AWS_REGION_NAME: props.awsRegion,
        BEDROCK_MODEL_ID: props.bedrockModelId,
        // Store secret names (not values) in environment variables
        // Lambda function will fetch the actual secret values from Secrets Manager at runtime
        SLACK_SIGNING_SECRET_NAME: props.slackSigningSecret.secretName,
        SLACK_BOT_TOKEN_SECRET_NAME: props.slackBotTokenSecret.secretName,
        // API Gateway URL for Execution Layer (required)
        EXECUTION_API_URL: props.executionApiUrl,
      },
    });

    // Grant Lambda function permission to read secrets
    props.slackSigningSecret.grantRead(this.function);
    props.slackBotTokenSecret.grantRead(this.function);

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
