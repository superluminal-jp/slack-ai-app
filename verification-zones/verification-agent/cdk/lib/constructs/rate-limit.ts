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
export class RateLimit extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id);

    // Create DynamoDB table for rate limiting
    // TTL is used to automatically clean up expired rate limit entries
    const stackName = cdk.Stack.of(this).stackName;
    this.table = new dynamodb.Table(this, "RateLimitTable", {
      tableName: `${stackName}-rate-limit`,
      partitionKey: {
        name: "rate_limit_key",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy table on stack deletion
      timeToLiveAttribute: "ttl", // Enable TTL for automatic cleanup
    });
  }
}

