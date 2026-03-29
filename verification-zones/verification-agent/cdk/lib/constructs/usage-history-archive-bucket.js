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
exports.UsageHistoryArchiveBucket = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const constructs_1 = require("constructs");
const cdk_nag_1 = require("cdk-nag");
const s3_bucket_name_1 = require("./s3-bucket-name");
/**
 * Usage history S3 archive bucket construct.
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
class UsageHistoryArchiveBucket extends constructs_1.Construct {
    bucket;
    constructor(scope, id) {
        super(scope, id);
        const stackName = cdk.Stack.of(this).stackName;
        // autoDeleteObjects adds a Lambda-backed Custom Resource; NagSuppressions added after bucket creation below
        this.bucket = new s3.Bucket(this, "Bucket", {
            bucketName: (0, s3_bucket_name_1.scopedBucketName)(stackName.toLowerCase(), "usage-history-archive"),
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    id: "expire-archive-content",
                    prefix: "content/",
                    expiration: cdk.Duration.days(90),
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                    enabled: true,
                },
                {
                    id: "expire-archive-attachments",
                    prefix: "attachments/",
                    expiration: cdk.Duration.days(90),
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                    enabled: true,
                },
                {
                    id: "expire-archive-dynamodb-exports",
                    prefix: "dynamodb-exports/",
                    expiration: cdk.Duration.days(90),
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                    enabled: true,
                },
                {
                    id: "expire-noncurrent-versions",
                    noncurrentVersionExpiration: cdk.Duration.days(7),
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                    enabled: true,
                },
            ],
        });
        const bucketResource = this.bucket.node.defaultChild ?? this.bucket;
        cdk_nag_1.NagSuppressions.addResourceSuppressions(bucketResource, [
            {
                id: "AwsSolutions-S1",
                reason: "Server access logging is not enabled on the usage-history archive bucket. " +
                    "This is a replication destination with no public access; data access is controlled via IAM. " +
                    "Enabling server access logging would create a circular dependency (log bucket → log bucket).",
            },
        ]);
    }
}
exports.UsageHistoryArchiveBucket = UsageHistoryArchiveBucket;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1hcmNoaXZlLWJ1Y2tldC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVzYWdlLWhpc3RvcnktYXJjaGl2ZS1idWNrZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5QztBQUN6QywyQ0FBdUM7QUFDdkMscUNBQTBDO0FBQzFDLHFEQUFvRDtBQUVwRDs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRztBQUNILE1BQWEseUJBQTBCLFNBQVEsc0JBQVM7SUFDdEMsTUFBTSxDQUFZO0lBRWxDLFlBQVksS0FBZ0IsRUFBRSxFQUFVO1FBQ3RDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFDO1FBRS9DLDRHQUE0RztRQUM1RyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQzFDLFVBQVUsRUFBRSxJQUFBLGlDQUFnQixFQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsRUFBRSx1QkFBdUIsQ0FBQztZQUM5RSxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsVUFBVSxFQUFFLElBQUk7WUFDaEIsU0FBUyxFQUFFLElBQUk7WUFDZixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsY0FBYyxFQUFFO2dCQUNkO29CQUNFLEVBQUUsRUFBRSx3QkFBd0I7b0JBQzVCLE1BQU0sRUFBRSxVQUFVO29CQUNsQixVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNqQyxtQ0FBbUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3pELE9BQU8sRUFBRSxJQUFJO2lCQUNkO2dCQUNEO29CQUNFLEVBQUUsRUFBRSw0QkFBNEI7b0JBQ2hDLE1BQU0sRUFBRSxjQUFjO29CQUN0QixVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNqQyxtQ0FBbUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3pELE9BQU8sRUFBRSxJQUFJO2lCQUNkO2dCQUNEO29CQUNFLEVBQUUsRUFBRSxpQ0FBaUM7b0JBQ3JDLE1BQU0sRUFBRSxtQkFBbUI7b0JBQzNCLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ2pDLG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0Q7b0JBQ0UsRUFBRSxFQUFFLDRCQUE0QjtvQkFDaEMsMkJBQTJCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNqRCxtQ0FBbUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3pELE9BQU8sRUFBRSxJQUFJO2lCQUNkO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUNwRSx5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyxjQUFjLEVBQ2Q7WUFDRTtnQkFDRSxFQUFFLEVBQUUsaUJBQWlCO2dCQUNyQixNQUFNLEVBQ0osNEVBQTRFO29CQUM1RSw4RkFBOEY7b0JBQzlGLDhGQUE4RjthQUNqRztTQUNGLENBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTlERCw4REE4REMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSBcImNkay1uYWdcIjtcbmltcG9ydCB7IHNjb3BlZEJ1Y2tldE5hbWUgfSBmcm9tIFwiLi9zMy1idWNrZXQtbmFtZVwiO1xuXG4vKipcbiAqIFVzYWdlIGhpc3RvcnkgUzMgYXJjaGl2ZSBidWNrZXQgY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IEluZGVwZW5kZW50IGFyY2hpdmUgZGVzdGluYXRpb24gZm9yIFMzIFNhbWUtUmVnaW9uIFJlcGxpY2F0aW9uIGZyb21cbiAqIHRoZSBwcmltYXJ5IHVzYWdlLWhpc3RvcnkgYnVja2V0LiBSZWNlaXZlcyBhdXRvbWF0aWMgY29waWVzIG9mIGFsbCBvYmplY3RzXG4gKiBhY3Jvc3MgY29udGVudC8sIGF0dGFjaG1lbnRzLywgYW5kIGR5bmFtb2RiLWV4cG9ydHMvIHByZWZpeGVzLlxuICpcbiAqIFJlcXVpcmVtZW50czpcbiAqIC0gdmVyc2lvbmVkOiB0cnVlIOKAlCByZXF1aXJlZCBieSBTMyBSZXBsaWNhdGlvbiAoQVdTIGhhcmQgcmVxdWlyZW1lbnQgb24gZGVzdGluYXRpb24pXG4gKiAtIFNhbWUgc2VjdXJpdHkgcG9zdHVyZSBhcyBzb3VyY2UgKFNTRS1TMywgZW5mb3JjZVNTTCwgQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMKVxuICogLSBTYW1lIDkwLWRheSBleHBpcmF0aW9uIHBlciBwcmVmaXggKGFsaWduZWQgd2l0aCBwcmltYXJ5IGJ1Y2tldCByZXRlbnRpb24pXG4gKiAtIE5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogNyBkYXlzIOKAlCB2ZXJzaW9uaW5nIGlzIGZvciByZXBsaWNhdGlvbiBvbmx5LCBub3QgaGlzdG9yeVxuICpcbiAqIENyb3NzLWFjY291bnQgcmVhZHk6IHRoZSBhcmNoaXZlIGJ1Y2tldCBwb2xpY3kgaXMgbWFuYWdlZCBieSBVc2FnZUhpc3RvcnlSZXBsaWNhdGlvbi5cbiAqXG4gKiBPdXRwdXRzOiBidWNrZXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBVc2FnZUhpc3RvcnlBcmNoaXZlQnVja2V0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldDogczMuQnVja2V0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gY2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZTtcblxuICAgIC8vIGF1dG9EZWxldGVPYmplY3RzIGFkZHMgYSBMYW1iZGEtYmFja2VkIEN1c3RvbSBSZXNvdXJjZTsgTmFnU3VwcHJlc3Npb25zIGFkZGVkIGFmdGVyIGJ1Y2tldCBjcmVhdGlvbiBiZWxvd1xuICAgIHRoaXMuYnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkJ1Y2tldFwiLCB7XG4gICAgICBidWNrZXROYW1lOiBzY29wZWRCdWNrZXROYW1lKHN0YWNrTmFtZS50b0xvd2VyQ2FzZSgpLCBcInVzYWdlLWhpc3RvcnktYXJjaGl2ZVwiKSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImV4cGlyZS1hcmNoaXZlLWNvbnRlbnRcIixcbiAgICAgICAgICBwcmVmaXg6IFwiY29udGVudC9cIixcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJleHBpcmUtYXJjaGl2ZS1hdHRhY2htZW50c1wiLFxuICAgICAgICAgIHByZWZpeDogXCJhdHRhY2htZW50cy9cIixcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJleHBpcmUtYXJjaGl2ZS1keW5hbW9kYi1leHBvcnRzXCIsXG4gICAgICAgICAgcHJlZml4OiBcImR5bmFtb2RiLWV4cG9ydHMvXCIsXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiZXhwaXJlLW5vbmN1cnJlbnQtdmVyc2lvbnNcIixcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGJ1Y2tldFJlc291cmNlID0gdGhpcy5idWNrZXQubm9kZS5kZWZhdWx0Q2hpbGQgPz8gdGhpcy5idWNrZXQ7XG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgYnVja2V0UmVzb3VyY2UsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtUzFcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIlNlcnZlciBhY2Nlc3MgbG9nZ2luZyBpcyBub3QgZW5hYmxlZCBvbiB0aGUgdXNhZ2UtaGlzdG9yeSBhcmNoaXZlIGJ1Y2tldC4gXCIgK1xuICAgICAgICAgICAgXCJUaGlzIGlzIGEgcmVwbGljYXRpb24gZGVzdGluYXRpb24gd2l0aCBubyBwdWJsaWMgYWNjZXNzOyBkYXRhIGFjY2VzcyBpcyBjb250cm9sbGVkIHZpYSBJQU0uIFwiICtcbiAgICAgICAgICAgIFwiRW5hYmxpbmcgc2VydmVyIGFjY2VzcyBsb2dnaW5nIHdvdWxkIGNyZWF0ZSBhIGNpcmN1bGFyIGRlcGVuZGVuY3kgKGxvZyBidWNrZXQg4oaSIGxvZyBidWNrZXQpLlwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICApO1xuICB9XG59XG4iXX0=