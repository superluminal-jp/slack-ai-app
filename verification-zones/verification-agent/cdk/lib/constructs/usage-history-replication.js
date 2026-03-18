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
const cdk_nag_1 = require("cdk-nag");
class UsageHistoryReplication extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { sourceBucket, archiveBucket, archiveAccountId } = props;
        const isCrossAccount = archiveAccountId !== undefined;
        // ── IAM Replication Role ──────────────────────────────────────────────
        const replicationRole = new iam.Role(this, "ReplicationRole", {
            assumedBy: new iam.ServicePrincipal("s3.amazonaws.com"),
            description: "S3 replication role for usage-history → archive",
        });
        // Source bucket: list and configuration read
        replicationRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:GetReplicationConfiguration", "s3:ListBucket"],
            resources: [sourceBucket.bucketArn],
        }));
        cdk_nag_1.NagSuppressions.addResourceSuppressions(replicationRole, [
            {
                id: "AwsSolutions-IAM5",
                reason: "S3 replication requires object-level permissions on all keys in the source and destination buckets. " +
                    "Policies are scoped to the specific bucket ARNs with object-level `/*` suffix (AWS S3 ARN model).",
            },
        ], true);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1yZXBsaWNhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVzYWdlLWhpc3RvcnktcmVwbGljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EseURBQTJDO0FBRTNDLDJDQUF1QztBQUN2QyxxQ0FBMEM7QUFpQzFDLE1BQWEsdUJBQXdCLFNBQVEsc0JBQVM7SUFDcEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFtQztRQUMzRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLGdCQUFnQixFQUFFLEdBQUcsS0FBSyxDQUFDO1FBQ2hFLE1BQU0sY0FBYyxHQUFHLGdCQUFnQixLQUFLLFNBQVMsQ0FBQztRQUV0RCx5RUFBeUU7UUFDekUsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUM1RCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUM7WUFDdkQsV0FBVyxFQUFFLGlEQUFpRDtTQUMvRCxDQUFDLENBQUM7UUFFSCw2Q0FBNkM7UUFDN0MsZUFBZSxDQUFDLFdBQVcsQ0FDekIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFLENBQUMsZ0NBQWdDLEVBQUUsZUFBZSxDQUFDO1lBQzVELFNBQVMsRUFBRSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUM7U0FDcEMsQ0FBQyxDQUNILENBQUM7UUFFRix5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyxlQUFlLEVBQ2Y7WUFDRTtnQkFDRSxFQUFFLEVBQUUsbUJBQW1CO2dCQUN2QixNQUFNLEVBQ0osc0dBQXNHO29C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RixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBakhELDBEQWlIQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCB7IE5hZ1N1cHByZXNzaW9ucyB9IGZyb20gXCJjZGstbmFnXCI7XG5cbi8qKlxuICogVXNhZ2UgaGlzdG9yeSBTMyByZXBsaWNhdGlvbiBjb25zdHJ1Y3QuXG4gKlxuICogUHVycG9zZTogQ29uZmlndXJlIFMzIFNhbWUtUmVnaW9uIFJlcGxpY2F0aW9uIChTUlIpIGZyb20gdGhlIHByaW1hcnlcbiAqIHVzYWdlLWhpc3RvcnkgYnVja2V0IHRvIGFuIGluZGVwZW5kZW50IGFyY2hpdmUgYnVja2V0LiBBbGwgb2JqZWN0cyBhY3Jvc3NcbiAqIGFsbCBwcmVmaXhlcyBhcmUgcmVwbGljYXRlZCAoZmlsdGVyIHByZWZpeCAnJykuXG4gKlxuICogQ3Jvc3MtYWNjb3VudCByZWFkeTogd2hlbiBgYXJjaGl2ZUFjY291bnRJZGAgaXMgcHJvdmlkZWQsIHRoZSByZXBsaWNhdGlvblxuICogZGVzdGluYXRpb24gaW5jbHVkZXMgYEFjY291bnRgIGFuZCBgQWNjZXNzQ29udHJvbFRyYW5zbGF0aW9uYCBmb3IgY3Jvc3MtYWNjb3VudFxuICogb3duZXJzaGlwIHRyYW5zZmVyLiBUaGUgYXJjaGl2ZSBidWNrZXQgcG9saWN5IGlzIGFsd2F5cyBhZGRlZCAoc2FtZS1hY2NvdW50OlxuICogcmVkdW5kYW50IGJ1dCBoYXJtbGVzczsgY3Jvc3MtYWNjb3VudDogcmVxdWlyZWQpLlxuICpcbiAqIERlbGV0ZSBtYXJrZXIgcmVwbGljYXRpb24gaXMgRElTQUJMRUQg4oCUIHRoZSBhcmNoaXZlIGlzIGFuIGluZGVwZW5kZW50IGNvcHlcbiAqIHRoYXQgbXVzdCBub3QgYmUgYWZmZWN0ZWQgYnkgc291cmNlIGRlbGV0aW9ucy5cbiAqXG4gKiBJQU06IGxlYXN0LXByaXZpbGVnZSDigJQgYWxsIHJlc291cmNlcyBhcmUgQVJOLXNwZWNpZmljLCBubyB3aWxkY2FyZHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVXNhZ2VIaXN0b3J5UmVwbGljYXRpb25Qcm9wcyB7XG4gIC8qKiBQcmltYXJ5IHVzYWdlLWhpc3RvcnkgYnVja2V0IChyZXBsaWNhdGlvbiBzb3VyY2UpLiBNdXN0IGhhdmUgdmVyc2lvbmluZyBlbmFibGVkLiAqL1xuICBzb3VyY2VCdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIC8qKiBBcmNoaXZlIGJ1Y2tldCAocmVwbGljYXRpb24gZGVzdGluYXRpb24pLiBNdXN0IGhhdmUgdmVyc2lvbmluZyBlbmFibGVkLiAqL1xuICBhcmNoaXZlQnVja2V0OiBzMy5JQnVja2V0O1xuICAvKipcbiAgICogRGVzdGluYXRpb24gQVdTIGFjY291bnQgSUQgZm9yIGNyb3NzLWFjY291bnQgcmVwbGljYXRpb24uXG4gICAqIFdoZW4gcHJvdmlkZWQ6IGFkZHMgYEFjY291bnRgICsgYEFjY2Vzc0NvbnRyb2xUcmFuc2xhdGlvbmAgdG8gdGhlIGRlc3RpbmF0aW9uXG4gICAqIGFuZCBncmFudHMgYHMzOk9iamVjdE93bmVyT3ZlcnJpZGVUb0J1Y2tldE93bmVyYC5cbiAgICogV2hlbiBhYnNlbnQ6IHNhbWUtYWNjb3VudCBtb2RlIChubyBhY2NvdW50LXNwZWNpZmljIGZpZWxkcykuXG4gICAqL1xuICBhcmNoaXZlQWNjb3VudElkPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVXNhZ2VIaXN0b3J5UmVwbGljYXRpb24gZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVXNhZ2VIaXN0b3J5UmVwbGljYXRpb25Qcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7IHNvdXJjZUJ1Y2tldCwgYXJjaGl2ZUJ1Y2tldCwgYXJjaGl2ZUFjY291bnRJZCB9ID0gcHJvcHM7XG4gICAgY29uc3QgaXNDcm9zc0FjY291bnQgPSBhcmNoaXZlQWNjb3VudElkICE9PSB1bmRlZmluZWQ7XG5cbiAgICAvLyDilIDilIAgSUFNIFJlcGxpY2F0aW9uIFJvbGUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgY29uc3QgcmVwbGljYXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiUmVwbGljYXRpb25Sb2xlXCIsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwiczMuYW1hem9uYXdzLmNvbVwiKSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlMzIHJlcGxpY2F0aW9uIHJvbGUgZm9yIHVzYWdlLWhpc3Rvcnkg4oaSIGFyY2hpdmVcIixcbiAgICB9KTtcblxuICAgIC8vIFNvdXJjZSBidWNrZXQ6IGxpc3QgYW5kIGNvbmZpZ3VyYXRpb24gcmVhZFxuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJzMzpHZXRSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb25cIiwgXCJzMzpMaXN0QnVja2V0XCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtzb3VyY2VCdWNrZXQuYnVja2V0QXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIHJlcGxpY2F0aW9uUm9sZSxcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU01XCIsXG4gICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgXCJTMyByZXBsaWNhdGlvbiByZXF1aXJlcyBvYmplY3QtbGV2ZWwgcGVybWlzc2lvbnMgb24gYWxsIGtleXMgaW4gdGhlIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gYnVja2V0cy4gXCIgK1xuICAgICAgICAgICAgXCJQb2xpY2llcyBhcmUgc2NvcGVkIHRvIHRoZSBzcGVjaWZpYyBidWNrZXQgQVJOcyB3aXRoIG9iamVjdC1sZXZlbCBgLypgIHN1ZmZpeCAoQVdTIFMzIEFSTiBtb2RlbCkuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuXG4gICAgLy8gU291cmNlIG9iamVjdHM6IHJlYWQgdmVyc2lvbmVkIG9iamVjdHMgZm9yIHJlcGxpY2F0aW9uXG4gICAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcInMzOkdldE9iamVjdFZlcnNpb25Gb3JSZXBsaWNhdGlvblwiLFxuICAgICAgICAgIFwiczM6R2V0T2JqZWN0VmVyc2lvbkFjbFwiLFxuICAgICAgICAgIFwiczM6R2V0T2JqZWN0VmVyc2lvblRhZ2dpbmdcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7c291cmNlQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRGVzdGluYXRpb24gb2JqZWN0czogd3JpdGUgcmVwbGljYXRlZCBvYmplY3RzXG4gICAgY29uc3QgZGVzdGluYXRpb25BY3Rpb25zID0gW1xuICAgICAgXCJzMzpSZXBsaWNhdGVPYmplY3RcIixcbiAgICAgIFwiczM6UmVwbGljYXRlRGVsZXRlXCIsXG4gICAgICBcInMzOlJlcGxpY2F0ZVRhZ3NcIixcbiAgICAgIC4uLihpc0Nyb3NzQWNjb3VudCA/IFtcInMzOk9iamVjdE93bmVyT3ZlcnJpZGVUb0J1Y2tldE93bmVyXCJdIDogW10pLFxuICAgIF07XG4gICAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IGRlc3RpbmF0aW9uQWN0aW9ucyxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7YXJjaGl2ZUJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIOKUgOKUgCBBcmNoaXZlIEJ1Y2tldCBQb2xpY3kg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgLy8gQWx3YXlzIGFkZGVkOiBzYW1lLWFjY291bnQgKHJlZHVuZGFudCBidXQgZnV0dXJlLXByb29mKTtcbiAgICAvLyBjcm9zcy1hY2NvdW50IChyZXF1aXJlZCDigJQgYnVja2V0IHBvbGljeSBpcyB0aGUgb25seSBjcm9zcy1hY2NvdW50IGdyYW50KS5cbiAgICBhcmNoaXZlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQXJuUHJpbmNpcGFsKHJlcGxpY2F0aW9uUm9sZS5yb2xlQXJuKV0sXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcInMzOkdldEJ1Y2tldFZlcnNpb25pbmdcIixcbiAgICAgICAgICBcInMzOlB1dEJ1Y2tldFZlcnNpb25pbmdcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYXJjaGl2ZUJ1Y2tldC5idWNrZXRBcm5dLFxuICAgICAgfSlcbiAgICApO1xuICAgIGFyY2hpdmVCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5Bcm5QcmluY2lwYWwocmVwbGljYXRpb25Sb2xlLnJvbGVBcm4pXSxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiczM6UmVwbGljYXRlT2JqZWN0XCIsXG4gICAgICAgICAgXCJzMzpSZXBsaWNhdGVEZWxldGVcIixcbiAgICAgICAgICBcInMzOlJlcGxpY2F0ZVRhZ3NcIixcbiAgICAgICAgICAuLi4oaXNDcm9zc0FjY291bnQgPyBbXCJzMzpPYmplY3RPd25lck92ZXJyaWRlVG9CdWNrZXRPd25lclwiXSA6IFtdKSxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7YXJjaGl2ZUJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIOKUgOKUgCBDZm5CdWNrZXQgTDEgT3ZlcnJpZGU6IFJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAvLyBDREsgTDIgQnVja2V0IGRvZXMgbm90IHN1cHBvcnQgcmVwbGljYXRpb25Db25maWd1cmF0aW9uIOKAlCBtdXN0IHVzZSBMMS5cbiAgICBjb25zdCBjZm5Tb3VyY2UgPSBzb3VyY2VCdWNrZXQubm9kZS5kZWZhdWx0Q2hpbGQgYXMgczMuQ2ZuQnVja2V0O1xuICAgIGNmblNvdXJjZS5yZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICByb2xlOiByZXBsaWNhdGlvblJvbGUucm9sZUFybixcbiAgICAgIHJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJyZXBsaWNhdGUtYWxsLW9iamVjdHNcIixcbiAgICAgICAgICBzdGF0dXM6IFwiRW5hYmxlZFwiLFxuICAgICAgICAgIGZpbHRlcjogeyBwcmVmaXg6IFwiXCIgfSwgLy8gVjIgZm9ybWF0OiBlbXB0eSBwcmVmaXggPSBhbGwgb2JqZWN0c1xuICAgICAgICAgIGRlc3RpbmF0aW9uOiB7XG4gICAgICAgICAgICBidWNrZXQ6IGFyY2hpdmVCdWNrZXQuYnVja2V0QXJuLFxuICAgICAgICAgICAgLi4uKGlzQ3Jvc3NBY2NvdW50ICYmIHtcbiAgICAgICAgICAgICAgYWNjb3VudDogYXJjaGl2ZUFjY291bnRJZCxcbiAgICAgICAgICAgICAgYWNjZXNzQ29udHJvbFRyYW5zbGF0aW9uOiB7IG93bmVyOiBcIkRlc3RpbmF0aW9uXCIgfSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgZGVsZXRlTWFya2VyUmVwbGljYXRpb246IHsgc3RhdHVzOiBcIkRpc2FibGVkXCIgfSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfTtcbiAgfVxufVxuIl19