import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

/**
 * DynamoDB table for the agent registry.
 *
 * Each execution agent's deploy script writes its own entry via PutItem.
 * The verification agent reads all entries at startup via a single Query on PK=env.
 *
 * Partition key: env ("dev" or "prod")
 * Sort key: agent_id ("time", "docs", "fetch-url", "file-creator", "slack-search")
 */
export class AgentRegistryTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stackName = cdk.Stack.of(this).stackName;
    this.table = new dynamodb.Table(this, "AgentRegistryTable", {
      tableName: `${stackName}-agent-registry`,
      partitionKey: {
        name: "env",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "agent_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
