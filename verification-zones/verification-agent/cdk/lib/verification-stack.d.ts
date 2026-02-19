import * as cdk from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { SlackEventHandler } from "./constructs/slack-event-handler";
import { VerificationAgentRuntime } from "./constructs/verification-agent-runtime";
import { VerificationAgentEcr } from "./constructs/verification-agent-ecr";
import { VerificationStackProps } from "./types/stack-config";
/**
 * Verification Stack (Account A / Verification Zone)
 *
 * Purpose: Handles Slack events, validates and authorizes requests, and invokes the Verification Agent
 * (AgentCore A2A). Communicates with Execution Stack only via AgentCore A2A (SigV4); no API Gateway or SQS.
 *
 * Responsibilities:
 * - Slack event ingestion (SlackEventHandler Lambda with Function URL)
 * - DynamoDB (token storage, event dedupe, existence check cache, whitelist, rate limit)
 * - Secrets Manager (Slack credentials)
 * - Verification Agent AgentCore Runtime (A2A) and ECR image
 * - Agent invocation (AgentInvoker, SlackPoster), S3 file exchange bucket, CloudWatch alarms
 *
 * Inputs: VerificationStackProps (env, executionAccountId, verificationAgentName, executionAgentArns, etc.);
 * context: deploymentEnv, awsRegion, slackBotToken, slackSigningSecret, bedrockModelId, executionAgentArns.
 *
 * Outputs: slackEventHandler, functionUrl, lambdaRoleArn, verificationAgentRuntimeArn, agentInvocationQueue; CfnOutputs for URLs and ARNs.
 */
export declare class VerificationStack extends cdk.Stack {
    /** The Slack Event Handler Lambda */
    readonly slackEventHandler: SlackEventHandler;
    /** The Lambda role ARN */
    readonly lambdaRoleArn: string;
    /** The Function URL (for Slack Event Subscriptions) */
    readonly functionUrl: string;
    /** AgentCore Runtime for Verification Agent (A2A) */
    readonly verificationAgentRuntime: VerificationAgentRuntime;
    /** AgentCore ECR image for Verification Agent */
    readonly verificationAgentEcr: VerificationAgentEcr;
    /** AgentCore Runtime ARN for cross-stack reference */
    readonly verificationAgentRuntimeArn: string;
    /** SQS queue for async agent invocation requests (016) */
    readonly agentInvocationQueue: sqs.IQueue;
    constructor(scope: Construct, id: string, props: VerificationStackProps);
}
