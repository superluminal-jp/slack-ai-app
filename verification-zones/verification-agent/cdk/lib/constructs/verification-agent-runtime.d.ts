/**
 * Verification Agent AgentCore Runtime construct.
 *
 * Purpose: Create an Amazon Bedrock AgentCore Runtime (A2A protocol) for the Verification Agent.
 * Invokes Execution Agent via A2A; receives Slack events from SlackEventHandler (or AgentInvoker).
 *
 * Responsibilities: Create Runtime CFN resource, IAM role, grant DynamoDB/Secrets/S3/SQS; optional
 * error debug log group and file-exchange bucket. A2A container port 9000, ARM64.
 *
 * Inputs: VerificationAgentRuntimeProps (agentRuntimeName, containerImageUri, DynamoDB tables,
 * secrets, executionAgentArns, optional slackPostRequestQueue, errorDebugLogGroup, fileExchangeBucket).
 *
 * Outputs: runtime, executionRole, runtimeArn (verificationAgentRuntimeArn).
 *
 * @module cdk/lib/verification/constructs/verification-agent-runtime
 */
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
/** Lifecycle configuration for AgentCore Runtime (optional). See research.md §2. */
export interface AgentCoreLifecycleConfig {
    /** Idle session timeout in seconds (60–28800). Default: 900. */
    readonly idleRuntimeSessionTimeoutSeconds?: number;
    /** Max instance lifetime in seconds (60–28800). Default: 28800. */
    readonly maxLifetimeSeconds?: number;
}
export interface VerificationAgentRuntimeProps {
    /** Name for the AgentCore Runtime */
    readonly agentRuntimeName: string;
    /** ECR container image URI (including tag) */
    readonly containerImageUri: string;
    /** Lifecycle configuration (optional). Omit to use platform defaults. */
    readonly lifecycleConfiguration?: AgentCoreLifecycleConfig;
    /** DynamoDB tables for security validation */
    readonly tokenTable: dynamodb.ITable;
    readonly dedupeTable: dynamodb.ITable;
    readonly existenceCheckCacheTable: dynamodb.ITable;
    readonly whitelistConfigTable: dynamodb.ITable;
    readonly rateLimitTable: dynamodb.ITable;
    /** Secrets Manager secrets */
    readonly slackSigningSecret: secretsmanager.ISecret;
    readonly slackBotTokenSecret: secretsmanager.ISecret;
    /** Map of execution agent IDs to runtime ARNs (for A2A invocation) */
    readonly executionAgentArns?: Record<string, string>;
    /** 019: SQS queue for Slack post requests; Agent sends here instead of calling Slack API */
    readonly slackPostRequestQueue?: sqs.IQueue;
    /** CloudWatch Log group for execution error debug (troubleshooting) */
    readonly errorDebugLogGroup?: logs.ILogGroup;
    /** S3 bucket for temporary file exchange between zones (024) */
    readonly fileExchangeBucket?: s3.IBucket;
}
export declare class VerificationAgentRuntime extends Construct {
    /** The AgentCore Runtime CFN resource */
    readonly runtime: cdk.CfnResource;
    /** AgentCore auto-creates DEFAULT endpoint; we do not create it in CFn */
    readonly endpoint: cdk.CfnResource | undefined;
    /** The IAM execution role for the AgentCore Runtime */
    readonly executionRole: iam.Role;
    /** The ARN of the AgentCore Runtime */
    readonly runtimeArn: string;
    constructor(scope: Construct, id: string, props: VerificationAgentRuntimeProps);
}
