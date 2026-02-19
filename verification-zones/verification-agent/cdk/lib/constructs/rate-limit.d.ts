import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
/**
 * Rate limiting DynamoDB table construct.
 *
 * Purpose: Store rate-limit state (partition key rate_limit_key) with TTL for automatic cleanup.
 *
 * Responsibilities: Create pay-per-request DynamoDB table with TTL; encryption; destroy on stack removal.
 *
 * Inputs: None (optional NestedStackProps).
 *
 * Outputs: table.
 */
export declare class RateLimit extends Construct {
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string, props?: cdk.NestedStackProps);
}
