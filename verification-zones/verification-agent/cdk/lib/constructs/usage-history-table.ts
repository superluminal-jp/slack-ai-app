import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

/**
 * Usage history DynamoDB table construct.
 *
 * Purpose: Store metadata and indexes for every Verification Agent request.
 * Input/output text stored in S3 (confidentiality separation); this table holds
 * metadata, pipeline results, and the s3_content_prefix pointer only.
 *
 * Responsibilities: PK=channel_id/SK=request_id table with TTL, GSI for
 * correlation_id lookup, PAY_PER_REQUEST, AWS_MANAGED encryption.
 *
 * Outputs: table.
 */
export class UsageHistoryTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stackName = cdk.Stack.of(this).stackName;

    this.table = new dynamodb.Table(this, "Table", {
      tableName: `${stackName}-usage-history`,
      partitionKey: { name: "channel_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "request_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "correlation_id-index",
      partitionKey: {
        name: "correlation_id",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}
