import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class EventDedupe extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id);

    // Create DynamoDB table for event deduplication
    const stackName = cdk.Stack.of(this).stackName;
    this.table = new dynamodb.Table(this, "EventDedupeTable", {
      tableName: `${stackName}-event-dedupe`,
      partitionKey: {
        name: "event_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy table on stack deletion
      timeToLiveAttribute: "ttl", // Enable TTL for automatic cleanup
    });
  }
}

