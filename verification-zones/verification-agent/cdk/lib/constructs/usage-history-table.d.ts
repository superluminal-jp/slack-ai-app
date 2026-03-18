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
export declare class UsageHistoryTable extends Construct {
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string);
}
