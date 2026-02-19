import * as lambda from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
/**
 * Slack Event Handler Lambda construct.
 *
 * Purpose: Receive Slack events (Function URL), validate signature and token, then invoke
 * Verification Agent (A2A) or enqueue to SQS for async invocation.
 *
 * Responsibilities: Lambda with Function URL; Slack signing verification; DynamoDB/Secrets
 * integration; invoke AgentCore or push to agentInvocationQueue.
 *
 * Inputs: SlackEventHandlerProps (secrets, table names, verificationAgentArn, region, model, optional queue).
 *
 * Outputs: function, functionUrl.
 */
export interface SlackEventHandlerProps {
    slackSigningSecret: secretsmanager.ISecret;
    slackBotTokenSecret: secretsmanager.ISecret;
    tokenTableName: string;
    dedupeTableName: string;
    existenceCheckCacheTableName: string;
    whitelistConfigTableName: string;
    rateLimitTableName: string;
    awsRegion: string;
    bedrockModelId: string;
    /** ARN of Verification Agent Runtime (A2A path). Required. */
    verificationAgentArn: string;
    /** SQS queue for async agent invocation (016). When set, handler sends requests here instead of invoking AgentCore directly. */
    agentInvocationQueue?: sqs.IQueue;
    /**
     * Revision token so Lambda config changes when secrets change (e.g. hash of signing secret).
     * Ensures warm instances are retired and new ones fetch updated secrets from Secrets Manager.
     */
    configRevision?: string;
}
export declare class SlackEventHandler extends Construct {
    readonly function: lambda.Function;
    readonly functionUrl: lambda.FunctionUrl;
    constructor(scope: Construct, id: string, props: SlackEventHandlerProps);
}
