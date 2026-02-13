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
export class ExistenceCheckCache extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id);

    // Create DynamoDB table for Existence Check cache
    // Cache stores verification results for team/user/channel combinations
    // TTL: 5 minutes (300 seconds) to reduce Slack API calls
    const stackName = cdk.Stack.of(this).stackName;
    this.table = new dynamodb.Table(this, "ExistenceCheckCacheTable", {
      tableName: `${stackName}-existence-check-cache`,
      partitionKey: {
        name: "cache_key",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy table on stack deletion
      timeToLiveAttribute: "ttl", // TTL attribute for automatic expiration
    });
  }
}

