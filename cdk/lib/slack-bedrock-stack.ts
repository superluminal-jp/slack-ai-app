import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { SlackEventHandler } from "./constructs/slack-event-handler";
import { TokenStorage } from "./constructs/token-storage";

export class SlackBedrockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get Slack Bot Token from environment variable
    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (!slackBotToken) {
      throw new Error('SLACK_BOT_TOKEN environment variable is required');
    }

    // Create DynamoDB table for workspace tokens
    const tokenStorage = new TokenStorage(this, "TokenStorage");

    // Create Slack event handler Lambda with Function URL
    const slackEventHandler = new SlackEventHandler(this, "SlackEventHandler", {
      slackBotToken,
      tokenTableName: tokenStorage.table.tableName,
    });

    // Grant Lambda read/write permissions to DynamoDB table
    tokenStorage.table.grantReadWriteData(slackEventHandler.function);

    // Output the Function URL for Slack Event Subscriptions configuration
    new cdk.CfnOutput(this, "SlackEventHandlerUrl", {
      value: slackEventHandler.functionUrl.url,
      description: "Slack Event Handler Function URL",
    });
  }
}
