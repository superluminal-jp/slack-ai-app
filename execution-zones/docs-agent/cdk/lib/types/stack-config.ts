/**
 * Stack Configuration Types for Docs Agent Zone
 */

import * as cdk from "aws-cdk-lib";

export interface DocsAgentStackProps extends cdk.StackProps {
  readonly awsRegion?: string;
  readonly bedrockModelId?: string;
  readonly verificationAccountId?: string;
  readonly docsAgentName?: string;
}

export interface DocsAgentStackOutputs {
  readonly stackName: string;
  readonly docsAgentArn: string;
}
