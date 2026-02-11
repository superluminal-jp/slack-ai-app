import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

/**
 * S3 bucket for temporary file exchange between verification and execution zones.
 *
 * Files are uploaded by the verification agent after downloading from Slack,
 * then downloaded by the execution agent via pre-signed GET URLs.
 * Objects are cleaned up immediately after processing; 1-day lifecycle rule
 * acts as a safety net for orphaned objects.
 *
 * Best practices (per AWS S3 security guidance):
 * - SSE-S3 encryption at rest
 * - Block all public access (BlockPublicAcls, BlockPublicPolicy, IgnorePublicAcls, RestrictPublicBuckets)
 * - Enforce SSL (deny non-HTTPS requests)
 * - Lifecycle rule on attachments/ prefix for automatic cleanup of orphans
 * - Auto-delete objects on stack removal (dev)
 */
export class FileExchangeBucket extends Construct {
  /** The S3 bucket resource. */
  public readonly bucket: s3.Bucket;

  /** Bucket name (convenience export for env/config). */
  public readonly bucketName: string;

  /** Bucket ARN (convenience export for IAM/cross-stack). */
  public readonly bucketArn: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stackName = cdk.Stack.of(this).stackName;

    this.bucket = new s3.Bucket(this, "Bucket", {
      bucketName: `${stackName.toLowerCase()}-file-exchange`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: "delete-temp-attachments",
          prefix: "attachments/",
          expiration: cdk.Duration.days(1),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          enabled: true,
        },
      ],
    });

    this.bucketName = this.bucket.bucketName;
    this.bucketArn = this.bucket.bucketArn;
  }
}
