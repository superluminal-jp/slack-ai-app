/**
 * Stack Configuration Types for Cross-Account Zones Architecture (A2A only)
 *
 * These interfaces define the configuration options for the split-stack
 * deployment pattern. Communication is exclusively via AgentCore A2A; no API Gateway or SQS.
 */

import * as cdk from "aws-cdk-lib";

/**
 * Configuration for the Execution Stack (Account B)
 * Contains only Execution Agent AgentCore Runtime (A2A).
 */
export interface ExecutionStackProps extends cdk.StackProps {
  /**
   * AWS Region for deployment
   * @default "ap-northeast-1"
   */
  readonly awsRegion?: string;

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
 * Configuration for the Verification Stack (Account A)
 * Contains SlackEventHandler, DynamoDB tables, Secrets, Verification Agent (A2A).
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
   * ARN of the Execution Agent Runtime (for A2A cross-account invocation)
   */
  readonly executionAgentArn?: string;

  /**
   * 017: When true, SlackEventHandler runs in echo mode (post received text to Slack, no SQS/AgentCore). Use for validation zone verification.
   * @default false (unset = normal behavior)
   */
  readonly validationZoneEchoMode?: boolean;
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
