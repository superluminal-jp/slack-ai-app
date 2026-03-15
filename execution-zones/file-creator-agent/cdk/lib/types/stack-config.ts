/**
 * Stack Configuration Types for File Creator Agent Zone
 */

import * as cdk from "aws-cdk-lib";

/**
 * Configuration for the File Creator Agent Stack.
 */
export interface FileCreatorAgentStackProps extends cdk.StackProps {
  /** AWS Region for deployment @default "ap-northeast-1" */
  readonly awsRegion?: string;
  /** Bedrock model ID @default "jp.anthropic.claude-sonnet-4-5-20250929-v1:0" */
  readonly bedrockModelId?: string;
  /** Account ID of the Verification Zone (for cross-account A2A resource policy) */
  readonly verificationAccountId?: string;
  /** Name for the File Creator Agent AgentCore Runtime @default "SlackAI_FileCreatorAgent" */
  readonly fileCreatorAgentName?: string;
}

/** Output values from File Creator Agent Stack */
export interface FileCreatorAgentStackOutputs {
  readonly stackName: string;
  readonly fileCreatorAgentArn: string;
}
