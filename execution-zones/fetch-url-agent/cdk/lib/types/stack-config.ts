/**
 * Stack Configuration Types for Web Fetch Agent Zone
 */

import * as cdk from "aws-cdk-lib";

/**
 * Configuration for the Web Fetch Agent Stack.
 */
export interface WebFetchAgentStackProps extends cdk.StackProps {
  /** AWS Region for deployment @default "ap-northeast-1" */
  readonly awsRegion?: string;
  /** Bedrock model ID @default "jp.anthropic.claude-sonnet-4-5-20250929-v1:0" */
  readonly bedrockModelId?: string;
  /** Account ID of the Verification Zone (for cross-account A2A resource policy) */
  readonly verificationAccountId?: string;
  /** Name for the Web Fetch Agent AgentCore Runtime @default "SlackAI_WebFetchAgent" */
  readonly webFetchAgentName?: string;
}

/** Output values from Web Fetch Agent Stack */
export interface WebFetchAgentStackOutputs {
  readonly stackName: string;
  readonly webFetchAgentArn: string;
}
