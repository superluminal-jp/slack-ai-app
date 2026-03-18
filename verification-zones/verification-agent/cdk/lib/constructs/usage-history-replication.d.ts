import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
/**
 * Usage history S3 replication construct.
 *
 * Purpose: Configure S3 Same-Region Replication (SRR) from the primary
 * usage-history bucket to an independent archive bucket. All objects across
 * all prefixes are replicated (filter prefix '').
 *
 * Cross-account ready: when `archiveAccountId` is provided, the replication
 * destination includes `Account` and `AccessControlTranslation` for cross-account
 * ownership transfer. The archive bucket policy is always added (same-account:
 * redundant but harmless; cross-account: required).
 *
 * Delete marker replication is DISABLED — the archive is an independent copy
 * that must not be affected by source deletions.
 *
 * IAM: least-privilege — all resources are ARN-specific, no wildcards.
 */
export interface UsageHistoryReplicationProps {
    /** Primary usage-history bucket (replication source). Must have versioning enabled. */
    sourceBucket: s3.IBucket;
    /** Archive bucket (replication destination). Must have versioning enabled. */
    archiveBucket: s3.IBucket;
    /**
     * Destination AWS account ID for cross-account replication.
     * When provided: adds `Account` + `AccessControlTranslation` to the destination
     * and grants `s3:ObjectOwnerOverrideToBucketOwner`.
     * When absent: same-account mode (no account-specific fields).
     */
    archiveAccountId?: string;
}
export declare class UsageHistoryReplication extends Construct {
    constructor(scope: Construct, id: string, props: UsageHistoryReplicationProps);
}
