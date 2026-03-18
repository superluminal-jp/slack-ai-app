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
            bucketName: `${stackName.toLowerCase()}-usage-history-archive`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1hcmNoaXZlLWJ1Y2tldC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVzYWdlLWhpc3RvcnktYXJjaGl2ZS1idWNrZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5QztBQUN6QywyQ0FBdUM7QUFDdkMscUNBQTBDO0FBRTFDOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBQ0gsTUFBYSx5QkFBMEIsU0FBUSxzQkFBUztJQUN0QyxNQUFNLENBQVk7SUFFbEMsWUFBWSxLQUFnQixFQUFFLEVBQVU7UUFDdEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFL0MsNEdBQTRHO1FBQzVHLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDMUMsVUFBVSxFQUFFLEdBQUcsU0FBUyxDQUFDLFdBQVcsRUFBRSx3QkFBd0I7WUFDOUQsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSxJQUFJO1lBQ2YsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxFQUFFLEVBQUUsd0JBQXdCO29CQUM1QixNQUFNLEVBQUUsVUFBVTtvQkFDbEIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDakMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRDtvQkFDRSxFQUFFLEVBQUUsNEJBQTRCO29CQUNoQyxNQUFNLEVBQUUsY0FBYztvQkFDdEIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDakMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRDtvQkFDRSxFQUFFLEVBQUUsaUNBQWlDO29CQUNyQyxNQUFNLEVBQUUsbUJBQW1CO29CQUMzQixVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNqQyxtQ0FBbUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3pELE9BQU8sRUFBRSxJQUFJO2lCQUNkO2dCQUNEO29CQUNFLEVBQUUsRUFBRSw0QkFBNEI7b0JBQ2hDLDJCQUEyQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDakQsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxPQUFPLEVBQUUsSUFBSTtpQkFDZDthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDcEUseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsY0FBYyxFQUNkO1lBQ0U7Z0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtnQkFDckIsTUFBTSxFQUNKLDRFQUE0RTtvQkFDNUUsOEZBQThGO29CQUM5Riw4RkFBOEY7YUFDakc7U0FDRixDQUNGLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUE5REQsOERBOERDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCB7IE5hZ1N1cHByZXNzaW9ucyB9IGZyb20gXCJjZGstbmFnXCI7XG5cbi8qKlxuICogVXNhZ2UgaGlzdG9yeSBTMyBhcmNoaXZlIGJ1Y2tldCBjb25zdHJ1Y3QuXG4gKlxuICogUHVycG9zZTogSW5kZXBlbmRlbnQgYXJjaGl2ZSBkZXN0aW5hdGlvbiBmb3IgUzMgU2FtZS1SZWdpb24gUmVwbGljYXRpb24gZnJvbVxuICogdGhlIHByaW1hcnkgdXNhZ2UtaGlzdG9yeSBidWNrZXQuIFJlY2VpdmVzIGF1dG9tYXRpYyBjb3BpZXMgb2YgYWxsIG9iamVjdHNcbiAqIGFjcm9zcyBjb250ZW50LywgYXR0YWNobWVudHMvLCBhbmQgZHluYW1vZGItZXhwb3J0cy8gcHJlZml4ZXMuXG4gKlxuICogUmVxdWlyZW1lbnRzOlxuICogLSB2ZXJzaW9uZWQ6IHRydWUg4oCUIHJlcXVpcmVkIGJ5IFMzIFJlcGxpY2F0aW9uIChBV1MgaGFyZCByZXF1aXJlbWVudCBvbiBkZXN0aW5hdGlvbilcbiAqIC0gU2FtZSBzZWN1cml0eSBwb3N0dXJlIGFzIHNvdXJjZSAoU1NFLVMzLCBlbmZvcmNlU1NMLCBCbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwpXG4gKiAtIFNhbWUgOTAtZGF5IGV4cGlyYXRpb24gcGVyIHByZWZpeCAoYWxpZ25lZCB3aXRoIHByaW1hcnkgYnVja2V0IHJldGVudGlvbilcbiAqIC0gTm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiA3IGRheXMg4oCUIHZlcnNpb25pbmcgaXMgZm9yIHJlcGxpY2F0aW9uIG9ubHksIG5vdCBoaXN0b3J5XG4gKlxuICogQ3Jvc3MtYWNjb3VudCByZWFkeTogdGhlIGFyY2hpdmUgYnVja2V0IHBvbGljeSBpcyBtYW5hZ2VkIGJ5IFVzYWdlSGlzdG9yeVJlcGxpY2F0aW9uLlxuICpcbiAqIE91dHB1dHM6IGJ1Y2tldC5cbiAqL1xuZXhwb3J0IGNsYXNzIFVzYWdlSGlzdG9yeUFyY2hpdmVCdWNrZXQgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0OiBzMy5CdWNrZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBzdGFja05hbWUgPSBjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lO1xuXG4gICAgLy8gYXV0b0RlbGV0ZU9iamVjdHMgYWRkcyBhIExhbWJkYS1iYWNrZWQgQ3VzdG9tIFJlc291cmNlOyBOYWdTdXBwcmVzc2lvbnMgYWRkZWQgYWZ0ZXIgYnVja2V0IGNyZWF0aW9uIGJlbG93XG4gICAgdGhpcy5idWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiQnVja2V0XCIsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGAke3N0YWNrTmFtZS50b0xvd2VyQ2FzZSgpfS11c2FnZS1oaXN0b3J5LWFyY2hpdmVgLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiZXhwaXJlLWFyY2hpdmUtY29udGVudFwiLFxuICAgICAgICAgIHByZWZpeDogXCJjb250ZW50L1wiLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImV4cGlyZS1hcmNoaXZlLWF0dGFjaG1lbnRzXCIsXG4gICAgICAgICAgcHJlZml4OiBcImF0dGFjaG1lbnRzL1wiLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImV4cGlyZS1hcmNoaXZlLWR5bmFtb2RiLWV4cG9ydHNcIixcbiAgICAgICAgICBwcmVmaXg6IFwiZHluYW1vZGItZXhwb3J0cy9cIixcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJleHBpcmUtbm9uY3VycmVudC12ZXJzaW9uc1wiLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYnVja2V0UmVzb3VyY2UgPSB0aGlzLmJ1Y2tldC5ub2RlLmRlZmF1bHRDaGlsZCA/PyB0aGlzLmJ1Y2tldDtcbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICBidWNrZXRSZXNvdXJjZSxcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1TMVwiLFxuICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgIFwiU2VydmVyIGFjY2VzcyBsb2dnaW5nIGlzIG5vdCBlbmFibGVkIG9uIHRoZSB1c2FnZS1oaXN0b3J5IGFyY2hpdmUgYnVja2V0LiBcIiArXG4gICAgICAgICAgICBcIlRoaXMgaXMgYSByZXBsaWNhdGlvbiBkZXN0aW5hdGlvbiB3aXRoIG5vIHB1YmxpYyBhY2Nlc3M7IGRhdGEgYWNjZXNzIGlzIGNvbnRyb2xsZWQgdmlhIElBTS4gXCIgK1xuICAgICAgICAgICAgXCJFbmFibGluZyBzZXJ2ZXIgYWNjZXNzIGxvZ2dpbmcgd291bGQgY3JlYXRlIGEgY2lyY3VsYXIgZGVwZW5kZW5jeSAobG9nIGJ1Y2tldCDihpIgbG9nIGJ1Y2tldCkuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICk7XG4gIH1cbn1cbiJdfQ==