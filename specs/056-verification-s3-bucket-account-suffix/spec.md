# Feature Specification: Verification S3 bucket names include account ID

## Overview

S3 bucket names are globally unique across all AWS accounts. Verification-agent CDK used `{stack}-{suffix}` for file-exchange, usage-history, and usage-history-archive buckets, which collided when the same stack name was deployed in another account or when orphaned buckets remained.

## Requirements

- Physical bucket names MUST follow `{stackNameLower}-{AWS::AccountId}-{suffix}` where `suffix` is `file-exchange`, `usage-history`, or `usage-history-archive`.
- Runtime behavior (IAM, replication, lifecycle) unchanged aside from bucket identity.

## Out of Scope

- Renaming existing deployed buckets in place (CloudFormation replaces with new names; operators handle old bucket cleanup or import as needed).
