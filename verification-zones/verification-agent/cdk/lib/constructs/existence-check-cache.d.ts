import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
/**
 * Existence check cache DynamoDB table construct.
 *
 * Purpose: Cache Slack team/user/channel existence check results to reduce Slack API calls.
 * TTL (e.g. 5 minutes) for automatic expiration.
 *
 * Responsibilities: Create pay-per-request DynamoDB table with TTL; encryption; destroy on stack removal.
 *
 * Inputs: None (optional NestedStackProps).
 *
 * Outputs: table.
 */
export declare class ExistenceCheckCache extends Construct {
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string, props?: cdk.NestedStackProps);
}
