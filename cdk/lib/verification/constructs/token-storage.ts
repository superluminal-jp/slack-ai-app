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
export class TokenStorage extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id);

    // Create DynamoDB table for workspace installation tokens
    const stackName = cdk.Stack.of(this).stackName;
    this.table = new dynamodb.Table(this, "WorkspaceTokensTable", {
      tableName: `${stackName}-workspace-tokens`,
      partitionKey: {
        name: "team_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy table on stack deletion
    });
  }
}
