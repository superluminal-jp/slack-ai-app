"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageHistoryReplication = void 0;
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const constructs_1 = require("constructs");
class UsageHistoryReplication extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { sourceBucket, archiveBucket, archiveAccountId } = props;
        const isCrossAccount = archiveAccountId !== undefined;
        // ── IAM Replication Role ──────────────────────────────────────────────
        const replicationRole = new iam.Role(this, "ReplicationRole", {
            assumedBy: new iam.ServicePrincipal("s3.amazonaws.com"),
            description: "S3 replication role for usage-history → archive (041)",
        });
        // Source bucket: list and configuration read
        replicationRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:GetReplicationConfiguration", "s3:ListBucket"],
            resources: [sourceBucket.bucketArn],
        }));
        // Source objects: read versioned objects for replication
        replicationRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "s3:GetObjectVersionForReplication",
                "s3:GetObjectVersionAcl",
                "s3:GetObjectVersionTagging",
            ],
            resources: [`${sourceBucket.bucketArn}/*`],
        }));
        // Destination objects: write replicated objects
        const destinationActions = [
            "s3:ReplicateObject",
            "s3:ReplicateDelete",
            "s3:ReplicateTags",
            ...(isCrossAccount ? ["s3:ObjectOwnerOverrideToBucketOwner"] : []),
        ];
        replicationRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: destinationActions,
            resources: [`${archiveBucket.bucketArn}/*`],
        }));
        // ── Archive Bucket Policy ────────────────────────────────────────────
        // Always added: same-account (redundant but future-proof);
        // cross-account (required — bucket policy is the only cross-account grant).
        archiveBucket.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ArnPrincipal(replicationRole.roleArn)],
            actions: [
                "s3:GetBucketVersioning",
                "s3:PutBucketVersioning",
            ],
            resources: [archiveBucket.bucketArn],
        }));
        archiveBucket.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ArnPrincipal(replicationRole.roleArn)],
            actions: [
                "s3:ReplicateObject",
                "s3:ReplicateDelete",
                "s3:ReplicateTags",
                ...(isCrossAccount ? ["s3:ObjectOwnerOverrideToBucketOwner"] : []),
            ],
            resources: [`${archiveBucket.bucketArn}/*`],
        }));
        // ── CfnBucket L1 Override: ReplicationConfiguration ─────────────────
        // CDK L2 Bucket does not support replicationConfiguration — must use L1.
        const cfnSource = sourceBucket.node.defaultChild;
        cfnSource.replicationConfiguration = {
            role: replicationRole.roleArn,
            rules: [
                {
                    id: "replicate-all-objects",
                    status: "Enabled",
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
exports.UsageHistoryReplication = UsageHistoryReplication;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1yZXBsaWNhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVzYWdlLWhpc3RvcnktcmVwbGljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EseURBQTJDO0FBRTNDLDJDQUF1QztBQWlDdkMsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUNwRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQW1DO1FBQzNFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFDaEUsTUFBTSxjQUFjLEdBQUcsZ0JBQWdCLEtBQUssU0FBUyxDQUFDO1FBRXRELHlFQUF5RTtRQUN6RSxNQUFNLGVBQWUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQzVELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQztZQUN2RCxXQUFXLEVBQUUsdURBQXVEO1NBQ3JFLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxlQUFlLENBQUMsV0FBVyxDQUN6QixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUUsQ0FBQyxnQ0FBZ0MsRUFBRSxlQUFlLENBQUM7WUFDNUQsU0FBUyxFQUFFLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQztTQUNwQyxDQUFDLENBQ0gsQ0FBQztRQUVGLHlEQUF5RDtRQUN6RCxlQUFlLENBQUMsV0FBVyxDQUN6QixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUU7Z0JBQ1AsbUNBQW1DO2dCQUNuQyx3QkFBd0I7Z0JBQ3hCLDRCQUE0QjthQUM3QjtZQUNELFNBQVMsRUFBRSxDQUFDLEdBQUcsWUFBWSxDQUFDLFNBQVMsSUFBSSxDQUFDO1NBQzNDLENBQUMsQ0FDSCxDQUFDO1FBRUYsZ0RBQWdEO1FBQ2hELE1BQU0sa0JBQWtCLEdBQUc7WUFDekIsb0JBQW9CO1lBQ3BCLG9CQUFvQjtZQUNwQixrQkFBa0I7WUFDbEIsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7U0FDbkUsQ0FBQztRQUNGLGVBQWUsQ0FBQyxXQUFXLENBQ3pCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRSxrQkFBa0I7WUFDM0IsU0FBUyxFQUFFLENBQUMsR0FBRyxhQUFhLENBQUMsU0FBUyxJQUFJLENBQUM7U0FDNUMsQ0FBQyxDQUNILENBQUM7UUFFRix3RUFBd0U7UUFDeEUsMkRBQTJEO1FBQzNELDRFQUE0RTtRQUM1RSxhQUFhLENBQUMsbUJBQW1CLENBQy9CLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLFVBQVUsRUFBRSxDQUFDLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDM0QsT0FBTyxFQUFFO2dCQUNQLHdCQUF3QjtnQkFDeEIsd0JBQXdCO2FBQ3pCO1lBQ0QsU0FBUyxFQUFFLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQztTQUNyQyxDQUFDLENBQ0gsQ0FBQztRQUNGLGFBQWEsQ0FBQyxtQkFBbUIsQ0FDL0IsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsVUFBVSxFQUFFLENBQUMsSUFBSSxHQUFHLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMzRCxPQUFPLEVBQUU7Z0JBQ1Asb0JBQW9CO2dCQUNwQixvQkFBb0I7Z0JBQ3BCLGtCQUFrQjtnQkFDbEIsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7YUFDbkU7WUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLGFBQWEsQ0FBQyxTQUFTLElBQUksQ0FBQztTQUM1QyxDQUFDLENBQ0gsQ0FBQztRQUVGLHVFQUF1RTtRQUN2RSx5RUFBeUU7UUFDekUsTUFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxZQUE0QixDQUFDO1FBQ2pFLFNBQVMsQ0FBQyx3QkFBd0IsR0FBRztZQUNuQyxJQUFJLEVBQUUsZUFBZSxDQUFDLE9BQU87WUFDN0IsS0FBSyxFQUFFO2dCQUNMO29CQUNFLEVBQUUsRUFBRSx1QkFBdUI7b0JBQzNCLE1BQU0sRUFBRSxTQUFTO29CQUNqQixNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLEVBQUUsd0NBQXdDO29CQUNoRSxXQUFXLEVBQUU7d0JBQ1gsTUFBTSxFQUFFLGFBQWEsQ0FBQyxTQUFTO3dCQUMvQixHQUFHLENBQUMsY0FBYyxJQUFJOzRCQUNwQixPQUFPLEVBQUUsZ0JBQWdCOzRCQUN6Qix3QkFBd0IsRUFBRSxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUU7eUJBQ25ELENBQUM7cUJBQ0g7b0JBQ0QsdUJBQXVCLEVBQUUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFO2lCQUNoRDthQUNGO1NBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQXBHRCwwREFvR0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5cbi8qKlxuICogVXNhZ2UgaGlzdG9yeSBTMyByZXBsaWNhdGlvbiBjb25zdHJ1Y3QgKDA0MSkuXG4gKlxuICogUHVycG9zZTogQ29uZmlndXJlIFMzIFNhbWUtUmVnaW9uIFJlcGxpY2F0aW9uIChTUlIpIGZyb20gdGhlIHByaW1hcnlcbiAqIHVzYWdlLWhpc3RvcnkgYnVja2V0IHRvIGFuIGluZGVwZW5kZW50IGFyY2hpdmUgYnVja2V0LiBBbGwgb2JqZWN0cyBhY3Jvc3NcbiAqIGFsbCBwcmVmaXhlcyBhcmUgcmVwbGljYXRlZCAoZmlsdGVyIHByZWZpeCAnJykuXG4gKlxuICogQ3Jvc3MtYWNjb3VudCByZWFkeTogd2hlbiBgYXJjaGl2ZUFjY291bnRJZGAgaXMgcHJvdmlkZWQsIHRoZSByZXBsaWNhdGlvblxuICogZGVzdGluYXRpb24gaW5jbHVkZXMgYEFjY291bnRgIGFuZCBgQWNjZXNzQ29udHJvbFRyYW5zbGF0aW9uYCBmb3IgY3Jvc3MtYWNjb3VudFxuICogb3duZXJzaGlwIHRyYW5zZmVyLiBUaGUgYXJjaGl2ZSBidWNrZXQgcG9saWN5IGlzIGFsd2F5cyBhZGRlZCAoc2FtZS1hY2NvdW50OlxuICogcmVkdW5kYW50IGJ1dCBoYXJtbGVzczsgY3Jvc3MtYWNjb3VudDogcmVxdWlyZWQpLlxuICpcbiAqIERlbGV0ZSBtYXJrZXIgcmVwbGljYXRpb24gaXMgRElTQUJMRUQg4oCUIHRoZSBhcmNoaXZlIGlzIGFuIGluZGVwZW5kZW50IGNvcHlcbiAqIHRoYXQgbXVzdCBub3QgYmUgYWZmZWN0ZWQgYnkgc291cmNlIGRlbGV0aW9ucy5cbiAqXG4gKiBJQU06IGxlYXN0LXByaXZpbGVnZSDigJQgYWxsIHJlc291cmNlcyBhcmUgQVJOLXNwZWNpZmljLCBubyB3aWxkY2FyZHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVXNhZ2VIaXN0b3J5UmVwbGljYXRpb25Qcm9wcyB7XG4gIC8qKiBQcmltYXJ5IHVzYWdlLWhpc3RvcnkgYnVja2V0IChyZXBsaWNhdGlvbiBzb3VyY2UpLiBNdXN0IGhhdmUgdmVyc2lvbmluZyBlbmFibGVkLiAqL1xuICBzb3VyY2VCdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIC8qKiBBcmNoaXZlIGJ1Y2tldCAocmVwbGljYXRpb24gZGVzdGluYXRpb24pLiBNdXN0IGhhdmUgdmVyc2lvbmluZyBlbmFibGVkLiAqL1xuICBhcmNoaXZlQnVja2V0OiBzMy5JQnVja2V0O1xuICAvKipcbiAgICogRGVzdGluYXRpb24gQVdTIGFjY291bnQgSUQgZm9yIGNyb3NzLWFjY291bnQgcmVwbGljYXRpb24uXG4gICAqIFdoZW4gcHJvdmlkZWQ6IGFkZHMgYEFjY291bnRgICsgYEFjY2Vzc0NvbnRyb2xUcmFuc2xhdGlvbmAgdG8gdGhlIGRlc3RpbmF0aW9uXG4gICAqIGFuZCBncmFudHMgYHMzOk9iamVjdE93bmVyT3ZlcnJpZGVUb0J1Y2tldE93bmVyYC5cbiAgICogV2hlbiBhYnNlbnQ6IHNhbWUtYWNjb3VudCBtb2RlIChubyBhY2NvdW50LXNwZWNpZmljIGZpZWxkcykuXG4gICAqL1xuICBhcmNoaXZlQWNjb3VudElkPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVXNhZ2VIaXN0b3J5UmVwbGljYXRpb24gZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVXNhZ2VIaXN0b3J5UmVwbGljYXRpb25Qcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7IHNvdXJjZUJ1Y2tldCwgYXJjaGl2ZUJ1Y2tldCwgYXJjaGl2ZUFjY291bnRJZCB9ID0gcHJvcHM7XG4gICAgY29uc3QgaXNDcm9zc0FjY291bnQgPSBhcmNoaXZlQWNjb3VudElkICE9PSB1bmRlZmluZWQ7XG5cbiAgICAvLyDilIDilIAgSUFNIFJlcGxpY2F0aW9uIFJvbGUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgY29uc3QgcmVwbGljYXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiUmVwbGljYXRpb25Sb2xlXCIsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwiczMuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlMzIHJlcGxpY2F0aW9uIHJvbGUgZm9yIHVzYWdlLWhpc3Rvcnkg4oaSIGFyY2hpdmUgKDA0MSlcIixcbiAgICB9KTtcblxuICAgIC8vIFNvdXJjZSBidWNrZXQ6IGxpc3QgYW5kIGNvbmZpZ3VyYXRpb24gcmVhZFxuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJzMzpHZXRSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb25cIiwgXCJzMzpMaXN0QnVja2V0XCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtzb3VyY2VCdWNrZXQuYnVja2V0QXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFNvdXJjZSBvYmplY3RzOiByZWFkIHZlcnNpb25lZCBvYmplY3RzIGZvciByZXBsaWNhdGlvblxuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJzMzpHZXRPYmplY3RWZXJzaW9uRm9yUmVwbGljYXRpb25cIixcbiAgICAgICAgICBcInMzOkdldE9iamVjdFZlcnNpb25BY2xcIixcbiAgICAgICAgICBcInMzOkdldE9iamVjdFZlcnNpb25UYWdnaW5nXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2Ake3NvdXJjZUJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIERlc3RpbmF0aW9uIG9iamVjdHM6IHdyaXRlIHJlcGxpY2F0ZWQgb2JqZWN0c1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uQWN0aW9ucyA9IFtcbiAgICAgIFwiczM6UmVwbGljYXRlT2JqZWN0XCIsXG4gICAgICBcInMzOlJlcGxpY2F0ZURlbGV0ZVwiLFxuICAgICAgXCJzMzpSZXBsaWNhdGVUYWdzXCIsXG4gICAgICAuLi4oaXNDcm9zc0FjY291bnQgPyBbXCJzMzpPYmplY3RPd25lck92ZXJyaWRlVG9CdWNrZXRPd25lclwiXSA6IFtdKSxcbiAgICBdO1xuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBkZXN0aW5hdGlvbkFjdGlvbnMsXG4gICAgICAgIHJlc291cmNlczogW2Ake2FyY2hpdmVCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyDilIDilIAgQXJjaGl2ZSBCdWNrZXQgUG9saWN5IOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIC8vIEFsd2F5cyBhZGRlZDogc2FtZS1hY2NvdW50IChyZWR1bmRhbnQgYnV0IGZ1dHVyZS1wcm9vZik7XG4gICAgLy8gY3Jvc3MtYWNjb3VudCAocmVxdWlyZWQg4oCUIGJ1Y2tldCBwb2xpY3kgaXMgdGhlIG9ubHkgY3Jvc3MtYWNjb3VudCBncmFudCkuXG4gICAgYXJjaGl2ZUJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFyblByaW5jaXBhbChyZXBsaWNhdGlvblJvbGUucm9sZUFybildLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJzMzpHZXRCdWNrZXRWZXJzaW9uaW5nXCIsXG4gICAgICAgICAgXCJzMzpQdXRCdWNrZXRWZXJzaW9uaW5nXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2FyY2hpdmVCdWNrZXQuYnVja2V0QXJuXSxcbiAgICAgIH0pXG4gICAgKTtcbiAgICBhcmNoaXZlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQXJuUHJpbmNpcGFsKHJlcGxpY2F0aW9uUm9sZS5yb2xlQXJuKV0sXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcInMzOlJlcGxpY2F0ZU9iamVjdFwiLFxuICAgICAgICAgIFwiczM6UmVwbGljYXRlRGVsZXRlXCIsXG4gICAgICAgICAgXCJzMzpSZXBsaWNhdGVUYWdzXCIsXG4gICAgICAgICAgLi4uKGlzQ3Jvc3NBY2NvdW50ID8gW1wiczM6T2JqZWN0T3duZXJPdmVycmlkZVRvQnVja2V0T3duZXJcIl0gOiBbXSksXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW2Ake2FyY2hpdmVCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyDilIDilIAgQ2ZuQnVja2V0IEwxIE92ZXJyaWRlOiBSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgLy8gQ0RLIEwyIEJ1Y2tldCBkb2VzIG5vdCBzdXBwb3J0IHJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiDigJQgbXVzdCB1c2UgTDEuXG4gICAgY29uc3QgY2ZuU291cmNlID0gc291cmNlQnVja2V0Lm5vZGUuZGVmYXVsdENoaWxkIGFzIHMzLkNmbkJ1Y2tldDtcbiAgICBjZm5Tb3VyY2UucmVwbGljYXRpb25Db25maWd1cmF0aW9uID0ge1xuICAgICAgcm9sZTogcmVwbGljYXRpb25Sb2xlLnJvbGVBcm4sXG4gICAgICBydWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwicmVwbGljYXRlLWFsbC1vYmplY3RzXCIsXG4gICAgICAgICAgc3RhdHVzOiBcIkVuYWJsZWRcIixcbiAgICAgICAgICBmaWx0ZXI6IHsgcHJlZml4OiBcIlwiIH0sIC8vIFYyIGZvcm1hdDogZW1wdHkgcHJlZml4ID0gYWxsIG9iamVjdHNcbiAgICAgICAgICBkZXN0aW5hdGlvbjoge1xuICAgICAgICAgICAgYnVja2V0OiBhcmNoaXZlQnVja2V0LmJ1Y2tldEFybixcbiAgICAgICAgICAgIC4uLihpc0Nyb3NzQWNjb3VudCAmJiB7XG4gICAgICAgICAgICAgIGFjY291bnQ6IGFyY2hpdmVBY2NvdW50SWQsXG4gICAgICAgICAgICAgIGFjY2Vzc0NvbnRyb2xUcmFuc2xhdGlvbjogeyBvd25lcjogXCJEZXN0aW5hdGlvblwiIH0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRlbGV0ZU1hcmtlclJlcGxpY2F0aW9uOiB7IHN0YXR1czogXCJEaXNhYmxlZFwiIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH07XG4gIH1cbn1cbiJdfQ==