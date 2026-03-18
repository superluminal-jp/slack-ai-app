import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
/**
 * Usage history S3 bucket construct.
 *
 * Purpose: Store input/output text (content/ prefix) and attachment files
 * (attachments/ prefix) for long-term audit. Separated from file-exchange bucket
 * to avoid conflict with 1-day lifecycle.
 *
 * Responsibilities: SSE-S3, enforceSSL, BlockPublicAccess.BLOCK_ALL, DESTROY,
 * autoDeleteObjects; two lifecycle rules with 90-day expiration on content/ and
 * attachments/ prefixes (aligned with DynamoDB TTL).
 *
 * Outputs: bucket, bucketName, bucketArn.
 */
export declare class UsageHistoryBucket extends Construct {
    readonly bucket: s3.Bucket;
    readonly bucketName: string;
    readonly bucketArn: string;
    constructor(scope: Construct, id: string);
}
