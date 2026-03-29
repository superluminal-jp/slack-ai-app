import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { scopedBucketName } from "./s3-bucket-name";

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
export class UsageHistoryBucket extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly bucketName: string;
  public readonly bucketArn: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stackName = cdk.Stack.of(this).stackName;

    this.bucket = new s3.Bucket(this, "Bucket", {
      bucketName: scopedBucketName(stackName.toLowerCase(), "usage-history"),
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: "expire-content",
          prefix: "content/",
          expiration: cdk.Duration.days(90),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          enabled: true,
        },
        {
          id: "expire-attachments",
          prefix: "attachments/",
          expiration: cdk.Duration.days(90),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          enabled: true,
        },
        {
          id: "expire-dynamodb-exports",
          prefix: "dynamodb-exports/",
          expiration: cdk.Duration.days(90),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          enabled: true,
        },
        {
          id: "expire-noncurrent-versions",
          noncurrentVersionExpiration: cdk.Duration.days(7),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          enabled: true,
        },
      ],
    });

    const bucketResource = this.bucket.node.defaultChild ?? this.bucket;
    NagSuppressions.addResourceSuppressions(
      bucketResource,
      [
        {
          id: "AwsSolutions-S1",
          reason:
            "Server access logging is not enabled on the usage-history bucket. " +
            "This is an internal audit bucket with no public access; data access is controlled via IAM. " +
            "Enabling server access logging would create a circular dependency (log bucket → log bucket).",
        },
      ],
    );

    this.bucketName = this.bucket.bucketName;
    this.bucketArn = this.bucket.bucketArn;
  }
}
