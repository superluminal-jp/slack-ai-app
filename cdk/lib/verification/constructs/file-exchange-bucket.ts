import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

/**
 * S3 bucket for temporary file exchange between verification and execution zones.
 *
 * Purpose: Hold files uploaded by the verification agent (from Slack) for the execution agent
 * to download via pre-signed URLs; lifecycle rules and auto-delete limit exposure.
 *
 * Responsibilities: Create bucket with SSE-S3, block public access, enforce SSL; lifecycle
 * on attachments/ and generated_files/; auto-delete objects on stack removal.
 *
 * Inputs: None (construct id only).
 *
 * Outputs: bucket, bucketName, bucketArn.
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
        {
          id: "delete-generated-files",
          prefix: "generated_files/",
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
