import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";

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

export class UsageHistoryReplication extends Construct {
  constructor(scope: Construct, id: string, props: UsageHistoryReplicationProps) {
    super(scope, id);

    const { sourceBucket, archiveBucket, archiveAccountId } = props;
    const isCrossAccount = archiveAccountId !== undefined;

    // ── IAM Replication Role ──────────────────────────────────────────────
    const replicationRole = new iam.Role(this, "ReplicationRole", {
      assumedBy: new iam.ServicePrincipal("s3.amazonaws.com"),
      description: "S3 replication role for usage-history -> archive",
    });

    // Source bucket: list and configuration read
    replicationRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetReplicationConfiguration", "s3:ListBucket"],
        resources: [sourceBucket.bucketArn],
      })
    );

    NagSuppressions.addResourceSuppressions(
      replicationRole,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "S3 replication requires object-level permissions on all keys in the source and destination buckets. " +
            "Policies are scoped to the specific bucket ARNs with object-level `/*` suffix (AWS S3 ARN model).",
        },
      ],
      true,
    );

    // Source objects: read versioned objects for replication
    replicationRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging",
        ],
        resources: [`${sourceBucket.bucketArn}/*`],
      })
    );

    // Destination objects: write replicated objects
    const destinationActions = [
      "s3:ReplicateObject",
      "s3:ReplicateDelete",
      "s3:ReplicateTags",
      ...(isCrossAccount ? ["s3:ObjectOwnerOverrideToBucketOwner"] : []),
    ];
    replicationRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: destinationActions,
        resources: [`${archiveBucket.bucketArn}/*`],
      })
    );

    // ── Archive Bucket Policy ────────────────────────────────────────────
    // Always added: same-account (redundant but future-proof);
    // cross-account (required — bucket policy is the only cross-account grant).
    archiveBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ArnPrincipal(replicationRole.roleArn)],
        actions: [
          "s3:GetBucketVersioning",
          "s3:PutBucketVersioning",
        ],
        resources: [archiveBucket.bucketArn],
      })
    );
    archiveBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ArnPrincipal(replicationRole.roleArn)],
        actions: [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags",
          ...(isCrossAccount ? ["s3:ObjectOwnerOverrideToBucketOwner"] : []),
        ],
        resources: [`${archiveBucket.bucketArn}/*`],
      })
    );

    // ── CfnBucket L1 Override: ReplicationConfiguration ─────────────────
    // CDK L2 Bucket does not support replicationConfiguration — must use L1.
    const cfnSource = sourceBucket.node.defaultChild as s3.CfnBucket;
    cfnSource.replicationConfiguration = {
      role: replicationRole.roleArn,
      rules: [
        {
          id: "replicate-all-objects",
          status: "Enabled",
          priority: 0, // Required when using V2 filter format
          filter: { prefix: "" }, // V2 format: empty prefix = all objects
          destination: {
            bucket: archiveBucket.bucketArn,
            ...(isCrossAccount && {
              account: archiveAccountId,
              accessControlTranslation: { owner: "Destination" },
            }),
          },
          deleteMarkerReplication: { status: "Disabled" },
        },
      ],
    };
  }
}
