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
            description: "S3 replication role for usage-history -> archive",
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
exports.UsageHistoryReplication = UsageHistoryReplication;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1yZXBsaWNhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVzYWdlLWhpc3RvcnktcmVwbGljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EseURBQTJDO0FBRTNDLDJDQUF1QztBQUN2QyxxQ0FBMEM7QUFpQzFDLE1BQWEsdUJBQXdCLFNBQVEsc0JBQVM7SUFDcEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFtQztRQUMzRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLGdCQUFnQixFQUFFLEdBQUcsS0FBSyxDQUFDO1FBQ2hFLE1BQU0sY0FBYyxHQUFHLGdCQUFnQixLQUFLLFNBQVMsQ0FBQztRQUV0RCx5RUFBeUU7UUFDekUsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUM1RCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUM7WUFDdkQsV0FBVyxFQUFFLGtEQUFrRDtTQUNoRSxDQUFDLENBQUM7UUFFSCw2Q0FBNkM7UUFDN0MsZUFBZSxDQUFDLFdBQVcsQ0FDekIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFLENBQUMsZ0NBQWdDLEVBQUUsZUFBZSxDQUFDO1lBQzVELFNBQVMsRUFBRSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUM7U0FDcEMsQ0FBQyxDQUNILENBQUM7UUFFRix5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyxlQUFlLEVBQ2Y7WUFDRTtnQkFDRSxFQUFFLEVBQUUsbUJBQW1CO2dCQUN2QixNQUFNLEVBQ0osc0dBQXNHO29C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QUFNLEVBQUUsVUFBVSxFQUFFO2lCQUNoRDthQUNGO1NBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQWxIRCwwREFrSEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuXG4vKipcbiAqIFVzYWdlIGhpc3RvcnkgUzMgcmVwbGljYXRpb24gY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IENvbmZpZ3VyZSBTMyBTYW1lLVJlZ2lvbiBSZXBsaWNhdGlvbiAoU1JSKSBmcm9tIHRoZSBwcmltYXJ5XG4gKiB1c2FnZS1oaXN0b3J5IGJ1Y2tldCB0byBhbiBpbmRlcGVuZGVudCBhcmNoaXZlIGJ1Y2tldC4gQWxsIG9iamVjdHMgYWNyb3NzXG4gKiBhbGwgcHJlZml4ZXMgYXJlIHJlcGxpY2F0ZWQgKGZpbHRlciBwcmVmaXggJycpLlxuICpcbiAqIENyb3NzLWFjY291bnQgcmVhZHk6IHdoZW4gYGFyY2hpdmVBY2NvdW50SWRgIGlzIHByb3ZpZGVkLCB0aGUgcmVwbGljYXRpb25cbiAqIGRlc3RpbmF0aW9uIGluY2x1ZGVzIGBBY2NvdW50YCBhbmQgYEFjY2Vzc0NvbnRyb2xUcmFuc2xhdGlvbmAgZm9yIGNyb3NzLWFjY291bnRcbiAqIG93bmVyc2hpcCB0cmFuc2Zlci4gVGhlIGFyY2hpdmUgYnVja2V0IHBvbGljeSBpcyBhbHdheXMgYWRkZWQgKHNhbWUtYWNjb3VudDpcbiAqIHJlZHVuZGFudCBidXQgaGFybWxlc3M7IGNyb3NzLWFjY291bnQ6IHJlcXVpcmVkKS5cbiAqXG4gKiBEZWxldGUgbWFya2VyIHJlcGxpY2F0aW9uIGlzIERJU0FCTEVEIOKAlCB0aGUgYXJjaGl2ZSBpcyBhbiBpbmRlcGVuZGVudCBjb3B5XG4gKiB0aGF0IG11c3Qgbm90IGJlIGFmZmVjdGVkIGJ5IHNvdXJjZSBkZWxldGlvbnMuXG4gKlxuICogSUFNOiBsZWFzdC1wcml2aWxlZ2Ug4oCUIGFsbCByZXNvdXJjZXMgYXJlIEFSTi1zcGVjaWZpYywgbm8gd2lsZGNhcmRzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFVzYWdlSGlzdG9yeVJlcGxpY2F0aW9uUHJvcHMge1xuICAvKiogUHJpbWFyeSB1c2FnZS1oaXN0b3J5IGJ1Y2tldCAocmVwbGljYXRpb24gc291cmNlKS4gTXVzdCBoYXZlIHZlcnNpb25pbmcgZW5hYmxlZC4gKi9cbiAgc291cmNlQnVja2V0OiBzMy5JQnVja2V0O1xuICAvKiogQXJjaGl2ZSBidWNrZXQgKHJlcGxpY2F0aW9uIGRlc3RpbmF0aW9uKS4gTXVzdCBoYXZlIHZlcnNpb25pbmcgZW5hYmxlZC4gKi9cbiAgYXJjaGl2ZUJ1Y2tldDogczMuSUJ1Y2tldDtcbiAgLyoqXG4gICAqIERlc3RpbmF0aW9uIEFXUyBhY2NvdW50IElEIGZvciBjcm9zcy1hY2NvdW50IHJlcGxpY2F0aW9uLlxuICAgKiBXaGVuIHByb3ZpZGVkOiBhZGRzIGBBY2NvdW50YCArIGBBY2Nlc3NDb250cm9sVHJhbnNsYXRpb25gIHRvIHRoZSBkZXN0aW5hdGlvblxuICAgKiBhbmQgZ3JhbnRzIGBzMzpPYmplY3RPd25lck92ZXJyaWRlVG9CdWNrZXRPd25lcmAuXG4gICAqIFdoZW4gYWJzZW50OiBzYW1lLWFjY291bnQgbW9kZSAobm8gYWNjb3VudC1zcGVjaWZpYyBmaWVsZHMpLlxuICAgKi9cbiAgYXJjaGl2ZUFjY291bnRJZD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFVzYWdlSGlzdG9yeVJlcGxpY2F0aW9uIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFVzYWdlSGlzdG9yeVJlcGxpY2F0aW9uUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgeyBzb3VyY2VCdWNrZXQsIGFyY2hpdmVCdWNrZXQsIGFyY2hpdmVBY2NvdW50SWQgfSA9IHByb3BzO1xuICAgIGNvbnN0IGlzQ3Jvc3NBY2NvdW50ID0gYXJjaGl2ZUFjY291bnRJZCAhPT0gdW5kZWZpbmVkO1xuXG4gICAgLy8g4pSA4pSAIElBTSBSZXBsaWNhdGlvbiBSb2xlIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIGNvbnN0IHJlcGxpY2F0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIlJlcGxpY2F0aW9uUm9sZVwiLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcInMzLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBkZXNjcmlwdGlvbjogXCJTMyByZXBsaWNhdGlvbiByb2xlIGZvciB1c2FnZS1oaXN0b3J5IC0+IGFyY2hpdmVcIixcbiAgICB9KTtcblxuICAgIC8vIFNvdXJjZSBidWNrZXQ6IGxpc3QgYW5kIGNvbmZpZ3VyYXRpb24gcmVhZFxuICAgIHJlcGxpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJzMzpHZXRSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb25cIiwgXCJzMzpMaXN0QnVja2V0XCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtzb3VyY2VCdWNrZXQuYnVja2V0QXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIHJlcGxpY2F0aW9uUm9sZSxcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU01XCIsXG4gICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgXCJTMyByZXBsaWNhdGlvbiByZXF1aXJlcyBvYmplY3QtbGV2ZWwgcGVybWlzc2lvbnMgb24gYWxsIGtleXMgaW4gdGhlIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gYnVja2V0cy4gXCIgK1xuICAgICAgICAgICAgXCJQb2xpY2llcyBhcmUgc2NvcGVkIHRvIHRoZSBzcGVjaWZpYyBidWNrZXQgQVJOcyB3aXRoIG9iamVjdC1sZXZlbCBgLypgIHN1ZmZpeCAoQVdTIFMzIEFSTiBtb2RlbCkuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuXG4gICAgLy8gU291cmNlIG9iamVjdHM6IHJlYWQgdmVyc2lvbmVkIG9iamVjdHMgZm9yIHJlcGxpY2F0aW9uXG4gICAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcInMzOkdldE9iamVjdFZlcnNpb25Gb3JSZXBsaWNhdGlvblwiLFxuICAgICAgICAgIFwiczM6R2V0T2JqZWN0VmVyc2lvbkFjbFwiLFxuICAgICAgICAgIFwiczM6R2V0T2JqZWN0VmVyc2lvblRhZ2dpbmdcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7c291cmNlQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRGVzdGluYXRpb24gb2JqZWN0czogd3JpdGUgcmVwbGljYXRlZCBvYmplY3RzXG4gICAgY29uc3QgZGVzdGluYXRpb25BY3Rpb25zID0gW1xuICAgICAgXCJzMzpSZXBsaWNhdGVPYmplY3RcIixcbiAgICAgIFwiczM6UmVwbGljYXRlRGVsZXRlXCIsXG4gICAgICBcInMzOlJlcGxpY2F0ZVRhZ3NcIixcbiAgICAgIC4uLihpc0Nyb3NzQWNjb3VudCA/IFtcInMzOk9iamVjdE93bmVyT3ZlcnJpZGVUb0J1Y2tldE93bmVyXCJdIDogW10pLFxuICAgIF07XG4gICAgcmVwbGljYXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IGRlc3RpbmF0aW9uQWN0aW9ucyxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7YXJjaGl2ZUJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIOKUgOKUgCBBcmNoaXZlIEJ1Y2tldCBQb2xpY3kg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgLy8gQWx3YXlzIGFkZGVkOiBzYW1lLWFjY291bnQgKHJlZHVuZGFudCBidXQgZnV0dXJlLXByb29mKTtcbiAgICAvLyBjcm9zcy1hY2NvdW50IChyZXF1aXJlZCDigJQgYnVja2V0IHBvbGljeSBpcyB0aGUgb25seSBjcm9zcy1hY2NvdW50IGdyYW50KS5cbiAgICBhcmNoaXZlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQXJuUHJpbmNpcGFsKHJlcGxpY2F0aW9uUm9sZS5yb2xlQXJuKV0sXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcInMzOkdldEJ1Y2tldFZlcnNpb25pbmdcIixcbiAgICAgICAgICBcInMzOlB1dEJ1Y2tldFZlcnNpb25pbmdcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYXJjaGl2ZUJ1Y2tldC5idWNrZXRBcm5dLFxuICAgICAgfSlcbiAgICApO1xuICAgIGFyY2hpdmVCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5Bcm5QcmluY2lwYWwocmVwbGljYXRpb25Sb2xlLnJvbGVBcm4pXSxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiczM6UmVwbGljYXRlT2JqZWN0XCIsXG4gICAgICAgICAgXCJzMzpSZXBsaWNhdGVEZWxldGVcIixcbiAgICAgICAgICBcInMzOlJlcGxpY2F0ZVRhZ3NcIixcbiAgICAgICAgICAuLi4oaXNDcm9zc0FjY291bnQgPyBbXCJzMzpPYmplY3RPd25lck92ZXJyaWRlVG9CdWNrZXRPd25lclwiXSA6IFtdKSxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYCR7YXJjaGl2ZUJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIOKUgOKUgCBDZm5CdWNrZXQgTDEgT3ZlcnJpZGU6IFJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAvLyBDREsgTDIgQnVja2V0IGRvZXMgbm90IHN1cHBvcnQgcmVwbGljYXRpb25Db25maWd1cmF0aW9uIOKAlCBtdXN0IHVzZSBMMS5cbiAgICBjb25zdCBjZm5Tb3VyY2UgPSBzb3VyY2VCdWNrZXQubm9kZS5kZWZhdWx0Q2hpbGQgYXMgczMuQ2ZuQnVja2V0O1xuICAgIGNmblNvdXJjZS5yZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICByb2xlOiByZXBsaWNhdGlvblJvbGUucm9sZUFybixcbiAgICAgIHJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJyZXBsaWNhdGUtYWxsLW9iamVjdHNcIixcbiAgICAgICAgICBzdGF0dXM6IFwiRW5hYmxlZFwiLFxuICAgICAgICAgIHByaW9yaXR5OiAwLCAvLyBSZXF1aXJlZCB3aGVuIHVzaW5nIFYyIGZpbHRlciBmb3JtYXRcbiAgICAgICAgICBmaWx0ZXI6IHsgcHJlZml4OiBcIlwiIH0sIC8vIFYyIGZvcm1hdDogZW1wdHkgcHJlZml4ID0gYWxsIG9iamVjdHNcbiAgICAgICAgICBkZXN0aW5hdGlvbjoge1xuICAgICAgICAgICAgYnVja2V0OiBhcmNoaXZlQnVja2V0LmJ1Y2tldEFybixcbiAgICAgICAgICAgIC4uLihpc0Nyb3NzQWNjb3VudCAmJiB7XG4gICAgICAgICAgICAgIGFjY291bnQ6IGFyY2hpdmVBY2NvdW50SWQsXG4gICAgICAgICAgICAgIGFjY2Vzc0NvbnRyb2xUcmFuc2xhdGlvbjogeyBvd25lcjogXCJEZXN0aW5hdGlvblwiIH0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRlbGV0ZU1hcmtlclJlcGxpY2F0aW9uOiB7IHN0YXR1czogXCJEaXNhYmxlZFwiIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH07XG4gIH1cbn1cbiJdfQ==