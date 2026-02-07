/**
 * Stack Configuration Types for Cross-Account Zones Architecture
 *
 * These interfaces define the configuration options for the split-stack
 * deployment pattern, enabling deployment to separate AWS accounts.
 */

import * as cdk from "aws-cdk-lib";

/**
 * Configuration for the Execution Stack (Account B)
 * Contains BedrockProcessor Lambda and API Gateway
 */
export interface ExecutionStackProps extends cdk.StackProps {
  /**
   * AWS Region for deployment
   * @default "ap-northeast-1"
   */
  readonly awsRegion?: string;

  /**
   * Bedrock model ID to use for AI processing
   * @default "amazon.nova-pro-v1:0"
   */
  readonly bedrockModelId?: string;

  /**
   * Account ID of the Verification Stack (for cross-account access)
   * If not provided, same-account deployment is assumed
   */
  readonly verificationAccountId?: string;

  /**
   * Lambda role ARN from Verification Stack (for API Gateway resource policy)
   * Can be set after initial deployment via updateResourcePolicy()
   */
  readonly verificationLambdaRoleArn?: string;

  /**
   * Enable API Gateway monitoring dashboard
   * @default false
   */
  readonly enableMonitoring?: boolean;

  /**
   * Email address for alarm notifications (optional)
   */
  readonly alarmEmail?: string;

  /**
   * SQS queue URL from Verification Stack (for sending responses)
   * Can be set after Verification Stack deployment
   */
  readonly executionResponseQueueUrl?: string;

  /**
   * Enable API key authentication in addition to IAM authentication
   * @default true
   */
  readonly enableApiKeyAuth?: boolean;

  /**
   * Name for the Execution Agent AgentCore Runtime
   * @default "SlackAI-ExecutionAgent"
   */
  readonly executionAgentName?: string;

  /**
   * ARN of the Verification Agent Runtime (for cross-account resource policy)
   * Used to allow the Verification Agent to invoke this Execution Agent
   */
  readonly verificationAgentArn?: string;

  /**
   * Enable AgentCore A2A communication instead of API Gateway + SQS
   * @default false
   */
  readonly useAgentCore?: boolean;
}

/**
 * Configuration for the Verification Stack (Account A)
 * Contains SlackEventHandler, DynamoDB tables, and Secrets
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
   * Execution API URL from Execution Stack
   * Required for SlackEventHandler to call BedrockProcessor
   */
  readonly executionApiUrl: string;

  /**
   * Execution API ARN for IAM policy (execute-api:Invoke)
   * Required for cross-account API access
   */
  readonly executionApiArn: string;

  /**
   * Account ID of the Execution Stack (for cross-account access)
   * If not provided, same-account deployment is assumed
   */
  readonly executionAccountId?: string;

  /**
   * Lambda role ARN from Execution Stack (for SQS queue resource policy)
   * Can be set after initial deployment via addExecutionZonePermission()
   */
  readonly executionLambdaRoleArn?: string;

  /**
   * Name for the Verification Agent AgentCore Runtime
   * @default "SlackAI-VerificationAgent"
   */
  readonly verificationAgentName?: string;

  /**
   * ARN of the Execution Agent Runtime (for A2A cross-account invocation)
   * Required when useAgentCore is true
   */
  readonly executionAgentArn?: string;

  /**
   * Enable AgentCore A2A communication instead of API Gateway + SQS
   * @default false
   */
  readonly useAgentCore?: boolean;
}

/**
 * Output values from Execution Stack
 * Used to configure Verification Stack
 */
export interface ExecutionStackOutputs {
  /**
   * API Gateway URL for the Execution API
   */
  readonly apiUrl: string;

  /**
   * API Gateway ARN for IAM policy configuration
   */
  readonly apiArn: string;

  /**
   * Stack name for reference
   */
  readonly stackName: string;
}

/**
 * Output values from Verification Stack
 * Used to update Execution Stack resource policy
 */
export interface VerificationStackOutputs {
  /**
   * Function URL for Slack Event Subscriptions
   */
  readonly functionUrl: string;

  /**
   * Lambda role ARN for API Gateway resource policy
   */
  readonly lambdaRoleArn: string;

  /**
   * Stack name for reference
   */
  readonly stackName: string;
}

/**
 * Cross-account trust configuration
 */
export interface CrossAccountTrustConfig {
  /**
   * Account ID of the caller (Verification Stack)
   */
  readonly sourceAccountId: string;

  /**
   * Lambda role ARN of the caller
   */
  readonly sourceRoleArn: string;

  /**
   * API Gateway ARN of the target (Execution Stack)
   */
  readonly targetApiArn: string;
}
