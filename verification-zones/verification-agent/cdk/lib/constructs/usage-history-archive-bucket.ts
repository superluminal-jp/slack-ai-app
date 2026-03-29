import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { scopedBucketName } from "./s3-bucket-name";

/**
 * Usage history S3 archive bucket construct.
 *
 * Purpose: Independent archive destination for S3 Same-Region Replication from
 * the primary usage-history bucket. Receives automatic copies of all objects
 * across content/, attachments/, and dynamodb-exports/ prefixes.
 *
 * Requirements:
 * - versioned: true — required by S3 Replication (AWS hard requirement on destination)
 * - Same security posture as source (SSE-S3, enforceSSL, BlockPublicAccess.BLOCK_ALL)
 * - Same 90-day expiration per prefix (aligned with primary bucket retention)
 * - NoncurrentVersionExpiration: 7 days — versioning is for replication only, not history
 *
 * Cross-account ready: the archive bucket policy is managed by UsageHistoryReplication.
 *
 * Outputs: bucket.
 */
export class UsageHistoryArchiveBucket extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stackName = cdk.Stack.of(this).stackName;

    // autoDeleteObjects adds a Lambda-backed Custom Resource; NagSuppressions added after bucket creation below
    this.bucket = new s3.Bucket(this, "Bucket", {
      bucketName: scopedBucketName(stackName.toLowerCase(), "usage-history-archive"),
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: "expire-archive-content",
          prefix: "content/",
          expiration: cdk.Duration.days(90),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          enabled: true,
        },
        {
          id: "expire-archive-attachments",
          prefix: "attachments/",
          expiration: cdk.Duration.days(90),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          enabled: true,
        },
        {
          id: "expire-archive-dynamodb-exports",
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
            "Server access logging is not enabled on the usage-history archive bucket. " +
            "This is a replication destination with no public access; data access is controlled via IAM. " +
            "Enabling server access logging would create a circular dependency (log bucket → log bucket).",
        },
      ],
    );
  }
}
