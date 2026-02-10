import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

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

