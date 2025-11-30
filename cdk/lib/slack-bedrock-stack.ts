import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { SlackEventHandler } from "./constructs/slack-event-handler";
import { TokenStorage } from "./constructs/token-storage";
import { EventDedupe } from "./constructs/event-dedupe";

export class SlackBedrockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get Slack Bot Token from environment variable
    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (!slackBotToken) {
      throw new Error("SLACK_BOT_TOKEN environment variable is required");
    }

    // Get Slack Signing Secret from environment variable
    const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
    if (!slackSigningSecret) {
      throw new Error("SLACK_SIGNING_SECRET environment variable is required");
    }

    // Get AWS Region from CDK context (cdk.json)
    const awsRegion = this.node.tryGetContext("awsRegion") || "ap-northeast-1";

    // Get Bedrock Model ID from CDK context (cdk.json)
    const bedrockModelId =
      this.node.tryGetContext("bedrockModelId") || "amazon.nova-pro-v1:0";

    // Create DynamoDB table for workspace tokens
    const tokenStorage = new TokenStorage(this, "TokenStorage");

    // Create DynamoDB table for event deduplication
    const eventDedupe = new EventDedupe(this, "EventDedupe");

    // Create Slack event handler Lambda with Function URL
    const slackEventHandler = new SlackEventHandler(this, "SlackEventHandler", {
      slackBotToken,
      slackSigningSecret,
      tokenTableName: tokenStorage.table.tableName,
      dedupeTableName: eventDedupe.table.tableName,
      awsRegion,
      bedrockModelId,
    });

    // Grant Lambda read/write permissions to DynamoDB tables
    tokenStorage.table.grantReadWriteData(slackEventHandler.function);
    eventDedupe.table.grantReadWriteData(slackEventHandler.function);

    // Output the Function URL for Slack Event Subscriptions configuration
    new cdk.CfnOutput(this, "SlackEventHandlerUrl", {
      value: slackEventHandler.functionUrl.url,
      description: "Slack Event Handler Function URL",
    });
  }
}
