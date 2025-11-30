import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { SlackEventHandler } from "./constructs/slack-event-handler";
import { TokenStorage } from "./constructs/token-storage";
import { EventDedupe } from "./constructs/event-dedupe";
import { BedrockProcessor } from "./constructs/bedrock-processor";

export class SlackBedrockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get Slack Bot Token from environment variable (required for initial secret creation)
    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (!slackBotToken) {
      throw new Error("SLACK_BOT_TOKEN environment variable is required for initial deployment");
    }

    // Get Slack Signing Secret from environment variable (required for initial secret creation)
    const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
    if (!slackSigningSecret) {
      throw new Error("SLACK_SIGNING_SECRET environment variable is required for initial deployment");
    }

    // Create Secrets Manager secrets for Slack credentials
    // These secrets are created in the stack and will be automatically deleted when the stack is destroyed
    const slackSigningSecretResource = new secretsmanager.Secret(this, "SlackSigningSecret", {
      secretName: `${this.stackName}/slack/signing-secret`,
      description: "Slack app signing secret for request verification",
      secretStringValue: cdk.SecretValue.unsafePlainText(slackSigningSecret),
    });

    const slackBotTokenSecret = new secretsmanager.Secret(this, "SlackBotToken", {
      secretName: `${this.stackName}/slack/bot-token`,
      description: "Slack bot OAuth token",
      secretStringValue: cdk.SecretValue.unsafePlainText(slackBotToken),
    });

    // Get AWS Region from CDK context (cdk.json)
    const awsRegion = this.node.tryGetContext("awsRegion") || "ap-northeast-1";

    // Get Bedrock Model ID from CDK context (cdk.json)
    const bedrockModelId =
      this.node.tryGetContext("bedrockModelId") || "amazon.nova-pro-v1:0";

    // Create DynamoDB table for workspace tokens
    const tokenStorage = new TokenStorage(this, "TokenStorage");

    // Create DynamoDB table for event deduplication
    const eventDedupe = new EventDedupe(this, "EventDedupe");

    // Create Bedrock processor Lambda (Lambda②)
    const bedrockProcessor = new BedrockProcessor(this, "BedrockProcessor", {
      awsRegion,
      bedrockModelId,
    });

    // Create Slack event handler Lambda with Function URL
    const slackEventHandler = new SlackEventHandler(this, "SlackEventHandler", {
      slackSigningSecret: slackSigningSecretResource,
      slackBotTokenSecret: slackBotTokenSecret,
      tokenTableName: tokenStorage.table.tableName,
      dedupeTableName: eventDedupe.table.tableName,
      awsRegion,
      bedrockModelId,
      bedrockProcessorArn: bedrockProcessor.function.functionArn,
    });

    // Grant Lambda① read/write permissions to DynamoDB tables
    tokenStorage.table.grantReadWriteData(slackEventHandler.function);
    eventDedupe.table.grantReadWriteData(slackEventHandler.function);

    // Grant Lambda① permission to invoke Lambda② asynchronously
    bedrockProcessor.function.grantInvoke(slackEventHandler.function);

    // Output the Function URL for Slack Event Subscriptions configuration
    new cdk.CfnOutput(this, "SlackEventHandlerUrl", {
      value: slackEventHandler.functionUrl.url,
      description: "Slack Event Handler Function URL",
    });
  }
}
