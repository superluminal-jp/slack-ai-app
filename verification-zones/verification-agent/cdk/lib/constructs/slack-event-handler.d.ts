import * as lambda from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { ChannelIdEntry } from "../types/cdk-config";
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
 * Outputs: function.
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
    /** SQS queue for async agent invocation. When set, handler sends requests here instead of invoking AgentCore directly. */
    agentInvocationQueue?: sqs.IQueue;
    /**
     * Revision token so Lambda config changes when secrets change (e.g. hash of signing secret).
     * Ensures warm instances are retired and new ones fetch updated secrets from Secrets Manager.
     */
    configRevision?: string;
    /**
     * Channel IDs where the bot auto-replies to all messages without requiring a mention.
     * Accepts plain IDs or objects with id and label. Only IDs are passed to the Lambda env var.
     */
    autoReplyChannelIds?: ChannelIdEntry[];
    /**
     * Channel IDs where @mention responses are allowed.
     * When set, app_mention events from other channels are silently ignored.
     * Accepts plain IDs or objects with id and label. Only IDs are passed to the Lambda env var.
     */
    mentionChannelIds?: ChannelIdEntry[];
}
export declare class SlackEventHandler extends Construct {
    readonly function: lambda.Function;
    constructor(scope: Construct, id: string, props: SlackEventHandlerProps);
}
