/**
 * Stack Configuration Types for Slack Search Agent Zone
 */

import * as cdk from "aws-cdk-lib";

export interface SlackSearchAgentStackProps extends cdk.StackProps {
  readonly awsRegion?: string;
  readonly bedrockModelId?: string;
  readonly verificationAccountId?: string;
  readonly slackSearchAgentName?: string;
}

export interface SlackSearchAgentStackOutputs {
  readonly stackName: string;
  readonly slackSearchAgentArn: string;
}
