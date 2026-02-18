/**
 * Stack Configuration Types for Cross-Account Zones Architecture (A2A only)
 *
 * These interfaces define the configuration options for the split-stack
 * deployment pattern. Communication is exclusively via AgentCore A2A; no API Gateway or SQS.
 *
 * Key types: ExecutionStackProps, VerificationStackProps (stack inputs);
 * ExecutionStackOutputs, VerificationStackOutputs (stack outputs for cross-stack or CLI).
 */

import * as cdk from "aws-cdk-lib";

/**
 * Configuration for the Execution Stack (Account B).
 * Contains only Execution Agent AgentCore Runtime (A2A). No Slack or DynamoDB.
 */
export interface ExecutionStackProps extends cdk.StackProps {
  /**
   * AWS Region for deployment
   * @default "ap-northeast-1"
   */
  readonly awsRegion?: string;

  /**
   * Bedrock model ID (passed to Execution Agent container)
   * @default "amazon.nova-pro-v1:0"
   */
  readonly bedrockModelId?: string;

  /**
   * Account ID of the Verification Stack (for cross-account A2A resource policy)
   */
  readonly verificationAccountId?: string;

  /**
   * Name for the Execution Agent AgentCore Runtime
   * @default "SlackAI_ExecutionAgent"
   */
  readonly executionAgentName?: string;
}

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
 * Configuration for the Docs Execution Stack (Account B).
 * Contains Docs Agent AgentCore Runtime (A2A) dedicated to docs search.
 */
export interface DocsExecutionStackProps extends cdk.StackProps {
  /**
   * AWS Region for deployment
   * @default "ap-northeast-1"
   */
  readonly awsRegion?: string;

  /**
   * Bedrock model ID (passed to Docs Agent container)
   * @default "amazon.nova-pro-v1:0"
   */
  readonly bedrockModelId?: string;

  /**
   * Account ID of the Verification Stack (for cross-account A2A resource policy)
   */
  readonly verificationAccountId?: string;

  /**
   * Name for the Docs Agent AgentCore Runtime
   * @default "SlackAI_DocsAgent"
   */
  readonly docsAgentName?: string;
}

/**
 * Configuration for the Time Execution Stack (Account B).
 * Contains Time Agent AgentCore Runtime (A2A) dedicated to current time retrieval.
 */
export interface TimeExecutionStackProps extends cdk.StackProps {
  /**
   * AWS Region for deployment
   * @default "ap-northeast-1"
   */
  readonly awsRegion?: string;

  /**
   * Bedrock model ID (passed to Time Agent container)
   * @default "amazon.nova-pro-v1:0"
   */
  readonly bedrockModelId?: string;

  /**
   * Account ID of the Verification Stack (for cross-account A2A resource policy)
   */
  readonly verificationAccountId?: string;

  /**
   * Name for the Time Agent AgentCore Runtime
   * @default "SlackAI_TimeAgent"
   */
  readonly timeAgentName?: string;
}

/**
 * Output values from Execution Stack
 */
export interface ExecutionStackOutputs {
  readonly stackName: string;
  readonly executionAgentArn: string;
}

/**
 * Output values from Verification Stack
 */
export interface VerificationStackOutputs {
  readonly functionUrl: string;
  readonly lambdaRoleArn: string;
  readonly stackName: string;
}
