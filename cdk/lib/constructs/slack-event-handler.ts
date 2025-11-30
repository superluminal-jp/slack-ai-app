import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';

export interface SlackEventHandlerProps {
  slackBotToken: string;  // Bot OAuth token from environment
  tokenTableName: string;  // DynamoDB table name for token storage
}

export class SlackEventHandler extends Construct {
  public readonly function: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: SlackEventHandlerProps) {
    super(scope, id);

    // Create Lambda function for Slack event handling
    this.function = new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda/slack-event-handler'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      timeout: cdk.Duration.seconds(10),
      environment: {
        SLACK_BOT_TOKEN: props.slackBotToken,
        TOKEN_TABLE_NAME: props.tokenTableName,
      },
    });

    // Create Function URL (no auth - signature verification in code)
    this.functionUrl = this.function.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
  }
}
