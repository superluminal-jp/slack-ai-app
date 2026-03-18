import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
/**
 * Usage history S3 archive bucket construct (041).
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
export declare class UsageHistoryArchiveBucket extends Construct {
    readonly bucket: s3.Bucket;
    constructor(scope: Construct, id: string);
}
