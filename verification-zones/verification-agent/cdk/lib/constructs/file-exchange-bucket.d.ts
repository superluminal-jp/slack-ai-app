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
export declare class FileExchangeBucket extends Construct {
    /** The S3 bucket resource. */
    readonly bucket: s3.Bucket;
    /** Bucket name (convenience export for env/config). */
    readonly bucketName: string;
    /** Bucket ARN (convenience export for IAM/cross-stack). */
    readonly bucketArn: string;
    constructor(scope: Construct, id: string);
}
