import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

export interface SlackEventHandlerProps {
  slackBotToken: string; // Bot OAuth token from environment
  slackSigningSecret: string; // Slack app signing secret for request verification
  tokenTableName: string; // DynamoDB table name for token storage
  dedupeTableName: string; // DynamoDB table name for event deduplication
  awsRegion: string; // AWS region (e.g., ap-northeast-1)
  bedrockModelId: string; // Bedrock model ID (e.g., amazon.nova-pro-v1:0)
  bedrockProcessorArn: string; // Lambda② ARN for async Bedrock processing
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
              "pip install -r requirements.txt -t /asset-output && cp -au . /asset-output",
            ],
          },
        }
      ),
      timeout: cdk.Duration.seconds(10),
      environment: {
        SLACK_BOT_TOKEN: props.slackBotToken,
        SLACK_SIGNING_SECRET: props.slackSigningSecret,
        TOKEN_TABLE_NAME: props.tokenTableName,
        DEDUPE_TABLE_NAME: props.dedupeTableName,
        AWS_REGION_NAME: props.awsRegion,
        BEDROCK_MODEL_ID: props.bedrockModelId,
        BEDROCK_PROCESSOR_ARN: props.bedrockProcessorArn,
      },
    });

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

    // Create Function URL (no auth - signature verification in code)
    this.functionUrl = this.function.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
  }
}
