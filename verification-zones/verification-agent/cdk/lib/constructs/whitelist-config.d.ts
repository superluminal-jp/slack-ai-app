import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
/**
 * Whitelist configuration DynamoDB table construct.
 *
 * Purpose: Store allowed team_id, user_id, and channel_id for access control.
 * Partition key entity_type, sort key entity_id.
 *
 * Responsibilities: Create pay-per-request DynamoDB table with encryption; destroy on stack removal.
 *
 * Inputs: None (optional NestedStackProps).
 *
 * Outputs: table.
 */
export declare class WhitelistConfig extends Construct {
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string, props?: cdk.NestedStackProps);
}
