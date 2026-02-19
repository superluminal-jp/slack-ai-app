/**
 * Stack Configuration Types for Time Agent Zone
 */

import * as cdk from "aws-cdk-lib";

export interface TimeAgentStackProps extends cdk.StackProps {
  readonly awsRegion?: string;
  readonly bedrockModelId?: string;
  readonly verificationAccountId?: string;
  readonly timeAgentName?: string;
}

export interface TimeAgentStackOutputs {
  readonly stackName: string;
  readonly timeAgentArn: string;
}
