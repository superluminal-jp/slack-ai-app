/**
 * Builds an S3 bucket name `{stackLower}-{accountId}-{suffix}`.
 * S3 bucket names are globally unique across all AWS accounts; including the
 * account ID avoids collisions when the same stack name is deployed elsewhere.
 */
export declare function scopedBucketName(stackNameLower: string, suffix: string): string;
