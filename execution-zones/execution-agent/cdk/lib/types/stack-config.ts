/**
 * Stack Configuration Types for Execution Agent Zone
 */

import * as cdk from "aws-cdk-lib";

/**
 * Configuration for the Execution Agent Stack.
 */
export interface ExecutionAgentStackProps extends cdk.StackProps {
  /** AWS Region for deployment @default "ap-northeast-1" */
  readonly awsRegion?: string;
  /** Bedrock model ID @default "amazon.nova-pro-v1:0" */
  readonly bedrockModelId?: string;
  /** Account ID of the Verification Zone (for cross-account A2A resource policy) */
  readonly verificationAccountId?: string;
  /** Name for the Execution Agent AgentCore Runtime @default "SlackAI_ExecutionAgent" */
  readonly executionAgentName?: string;
}

/** Output values from Execution Agent Stack */
export interface ExecutionAgentStackOutputs {
  readonly stackName: string;
  readonly executionAgentArn: string;
}
