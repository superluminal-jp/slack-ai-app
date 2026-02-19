import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
/**
 * Slack Poster construct (019): SQS queue + Lambda for posting messages to Slack.
 *
 * Purpose: Verification Agent sends post requests to this queue; Lambda consumes and calls Slack API.
 * Decouples agent from Slack API and allows retries.
 *
 * Responsibilities: Create SQS queue and Lambda; Lambda has Slack OAuth token and posts to channels.
 *
 * Inputs: SlackPosterProps (stackName for queue naming).
 *
 * Outputs: queue, function.
 */
export interface SlackPosterProps {
    /** Stack name for queue naming */
    stackName: string;
}
export declare class SlackPoster extends Construct {
    readonly queue: sqs.IQueue;
    readonly function: lambda.Function;
    constructor(scope: Construct, id: string, props: SlackPosterProps);
}
