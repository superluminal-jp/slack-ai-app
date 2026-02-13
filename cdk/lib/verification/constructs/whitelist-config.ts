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
export class WhitelistConfig extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id);

    // Create DynamoDB table for whitelist configuration
    // Stores team_id, user_id, and channel_id entries separately
    // Partition key: entity_type (team_id, user_id, channel_id)
    // Sort key: entity_id (actual ID value)
    const stackName = cdk.Stack.of(this).stackName;
    this.table = new dynamodb.Table(this, "WhitelistConfigTable", {
      tableName: `${stackName}-whitelist-config`,
      partitionKey: {
        name: "entity_type",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "entity_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy table on stack deletion
    });
  }
}

