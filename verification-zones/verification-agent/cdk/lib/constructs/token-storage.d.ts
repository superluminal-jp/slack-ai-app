import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
/**
 * Workspace installation tokens DynamoDB table construct.
 *
 * Purpose: Store Slack workspace OAuth tokens (team_id as partition key) for multi-workspace support.
 *
 * Responsibilities: Create pay-per-request DynamoDB table with encryption; destroy on stack removal.
 *
 * Inputs: None (optional NestedStackProps).
 *
 * Outputs: table.
 */
export declare class TokenStorage extends Construct {
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string, props?: cdk.NestedStackProps);
}
