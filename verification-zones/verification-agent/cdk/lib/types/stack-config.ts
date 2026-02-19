/**
 * Stack Configuration Types for Verification Zone (A2A only)
 *
 * These interfaces define the configuration options for the Verification Zone
 * standalone CDK app. Communication is exclusively via AgentCore A2A; no API Gateway or SQS.
 *
 * Key types: VerificationStackProps (stack inputs);
 * VerificationStackOutputs (stack outputs for cross-stack or CLI).
 */

import * as cdk from "aws-cdk-lib";

/**
 * Configuration for the Verification Stack (Account A).
 * Contains SlackEventHandler, DynamoDB tables, Secrets, Verification Agent (A2A). Requires executionAgentArns from execution stacks or config.
 */
export interface VerificationStackProps extends cdk.StackProps {
  /**
   * AWS Region for deployment
   * @default "ap-northeast-1"
   */
  readonly awsRegion?: string;

  /**
   * Bedrock model ID (passed to SlackEventHandler for context)
   * @default "amazon.nova-pro-v1:0"
   */
  readonly bedrockModelId?: string;

  /**
   * Account ID of the Execution Stack (for cross-account access)
   */
  readonly executionAccountId?: string;

  /**
   * Name for the Verification Agent AgentCore Runtime
   * @default "SlackAI_VerificationAgent"
   */
  readonly verificationAgentName?: string;

  /**
   * Map of execution agent IDs to runtime ARNs (for A2A invocation and routing)
   * e.g. { "file-creator": "...", "docs": "...", "time": "..." }
   */
  readonly executionAgentArns?: Record<string, string>;
}

/**
 * Output values from Verification Stack
 */
export interface VerificationStackOutputs {
  readonly functionUrl: string;
  readonly lambdaRoleArn: string;
  readonly stackName: string;
}
