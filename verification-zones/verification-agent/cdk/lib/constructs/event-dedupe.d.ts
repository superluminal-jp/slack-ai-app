import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
/**
 * Event deduplication DynamoDB table construct.
 *
 * Purpose: Deduplicate Slack events by event_id to avoid processing the same event twice.
 * TTL for automatic cleanup of old entries.
 *
 * Responsibilities: Create pay-per-request DynamoDB table with TTL; encryption; destroy on stack removal.
 *
 * Inputs: None (optional NestedStackProps).
 *
 * Outputs: table.
 */
export declare class EventDedupe extends Construct {
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string, props?: cdk.NestedStackProps);
}
