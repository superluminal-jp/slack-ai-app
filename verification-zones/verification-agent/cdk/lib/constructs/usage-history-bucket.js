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
exports.UsageHistoryBucket = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const constructs_1 = require("constructs");
const cdk_nag_1 = require("cdk-nag");
const s3_bucket_name_1 = require("./s3-bucket-name");
/**
 * Usage history S3 bucket construct.
 *
 * Purpose: Store input/output text (content/ prefix) and attachment files
 * (attachments/ prefix) for long-term audit. Separated from file-exchange bucket
 * to avoid conflict with 1-day lifecycle.
 *
 * Responsibilities: SSE-S3, enforceSSL, BlockPublicAccess.BLOCK_ALL, DESTROY,
 * autoDeleteObjects; two lifecycle rules with 90-day expiration on content/ and
 * attachments/ prefixes (aligned with DynamoDB TTL).
 *
 * Outputs: bucket, bucketName, bucketArn.
 */
class UsageHistoryBucket extends constructs_1.Construct {
    bucket;
    bucketName;
    bucketArn;
    constructor(scope, id) {
        super(scope, id);
        const stackName = cdk.Stack.of(this).stackName;
        this.bucket = new s3.Bucket(this, "Bucket", {
            bucketName: (0, s3_bucket_name_1.scopedBucketName)(stackName.toLowerCase(), "usage-history"),
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    id: "expire-content",
                    prefix: "content/",
                    expiration: cdk.Duration.days(90),
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                    enabled: true,
                },
                {
                    id: "expire-attachments",
                    prefix: "attachments/",
                    expiration: cdk.Duration.days(90),
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                    enabled: true,
                },
                {
                    id: "expire-dynamodb-exports",
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
                reason: "Server access logging is not enabled on the usage-history bucket. " +
                    "This is an internal audit bucket with no public access; data access is controlled via IAM. " +
                    "Enabling server access logging would create a circular dependency (log bucket → log bucket).",
            },
        ]);
        this.bucketName = this.bucket.bucketName;
        this.bucketArn = this.bucket.bucketArn;
    }
}
exports.UsageHistoryBucket = UsageHistoryBucket;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1idWNrZXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1c2FnZS1oaXN0b3J5LWJ1Y2tldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLDJDQUF1QztBQUN2QyxxQ0FBMEM7QUFDMUMscURBQW9EO0FBRXBEOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILE1BQWEsa0JBQW1CLFNBQVEsc0JBQVM7SUFDL0IsTUFBTSxDQUFZO0lBQ2xCLFVBQVUsQ0FBUztJQUNuQixTQUFTLENBQVM7SUFFbEMsWUFBWSxLQUFnQixFQUFFLEVBQVU7UUFDdEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFL0MsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUMxQyxVQUFVLEVBQUUsSUFBQSxpQ0FBZ0IsRUFBQyxTQUFTLENBQUMsV0FBVyxFQUFFLEVBQUUsZUFBZSxDQUFDO1lBQ3RFLFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyxpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUNqRCxVQUFVLEVBQUUsSUFBSTtZQUNoQixTQUFTLEVBQUUsSUFBSTtZQUNmLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDeEMsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGdCQUFnQjtvQkFDcEIsTUFBTSxFQUFFLFVBQVU7b0JBQ2xCLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ2pDLG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0Q7b0JBQ0UsRUFBRSxFQUFFLG9CQUFvQjtvQkFDeEIsTUFBTSxFQUFFLGNBQWM7b0JBQ3RCLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ2pDLG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0Q7b0JBQ0UsRUFBRSxFQUFFLHlCQUF5QjtvQkFDN0IsTUFBTSxFQUFFLG1CQUFtQjtvQkFDM0IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDakMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRDtvQkFDRSxFQUFFLEVBQUUsNEJBQTRCO29CQUNoQywyQkFBMkIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2pELG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQ3BFLHlCQUFlLENBQUMsdUJBQXVCLENBQ3JDLGNBQWMsRUFDZDtZQUNFO2dCQUNFLEVBQUUsRUFBRSxpQkFBaUI7Z0JBQ3JCLE1BQU0sRUFDSixvRUFBb0U7b0JBQ3BFLDZGQUE2RjtvQkFDN0YsOEZBQThGO2FBQ2pHO1NBQ0YsQ0FDRixDQUFDO1FBRUYsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQztRQUN6QyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO0lBQ3pDLENBQUM7Q0FDRjtBQWxFRCxnREFrRUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSBcImNkay1uYWdcIjtcbmltcG9ydCB7IHNjb3BlZEJ1Y2tldE5hbWUgfSBmcm9tIFwiLi9zMy1idWNrZXQtbmFtZVwiO1xuXG4vKipcbiAqIFVzYWdlIGhpc3RvcnkgUzMgYnVja2V0IGNvbnN0cnVjdC5cbiAqXG4gKiBQdXJwb3NlOiBTdG9yZSBpbnB1dC9vdXRwdXQgdGV4dCAoY29udGVudC8gcHJlZml4KSBhbmQgYXR0YWNobWVudCBmaWxlc1xuICogKGF0dGFjaG1lbnRzLyBwcmVmaXgpIGZvciBsb25nLXRlcm0gYXVkaXQuIFNlcGFyYXRlZCBmcm9tIGZpbGUtZXhjaGFuZ2UgYnVja2V0XG4gKiB0byBhdm9pZCBjb25mbGljdCB3aXRoIDEtZGF5IGxpZmVjeWNsZS5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOiBTU0UtUzMsIGVuZm9yY2VTU0wsIEJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCwgREVTVFJPWSxcbiAqIGF1dG9EZWxldGVPYmplY3RzOyB0d28gbGlmZWN5Y2xlIHJ1bGVzIHdpdGggOTAtZGF5IGV4cGlyYXRpb24gb24gY29udGVudC8gYW5kXG4gKiBhdHRhY2htZW50cy8gcHJlZml4ZXMgKGFsaWduZWQgd2l0aCBEeW5hbW9EQiBUVEwpLlxuICpcbiAqIE91dHB1dHM6IGJ1Y2tldCwgYnVja2V0TmFtZSwgYnVja2V0QXJuLlxuICovXG5leHBvcnQgY2xhc3MgVXNhZ2VIaXN0b3J5QnVja2V0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldDogczMuQnVja2V0O1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0TmFtZTogc3RyaW5nO1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0QXJuOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBzdGFja05hbWUgPSBjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lO1xuXG4gICAgdGhpcy5idWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiQnVja2V0XCIsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IHNjb3BlZEJ1Y2tldE5hbWUoc3RhY2tOYW1lLnRvTG93ZXJDYXNlKCksIFwidXNhZ2UtaGlzdG9yeVwiKSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImV4cGlyZS1jb250ZW50XCIsXG4gICAgICAgICAgcHJlZml4OiBcImNvbnRlbnQvXCIsXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiZXhwaXJlLWF0dGFjaG1lbnRzXCIsXG4gICAgICAgICAgcHJlZml4OiBcImF0dGFjaG1lbnRzL1wiLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImV4cGlyZS1keW5hbW9kYi1leHBvcnRzXCIsXG4gICAgICAgICAgcHJlZml4OiBcImR5bmFtb2RiLWV4cG9ydHMvXCIsXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiZXhwaXJlLW5vbmN1cnJlbnQtdmVyc2lvbnNcIixcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGJ1Y2tldFJlc291cmNlID0gdGhpcy5idWNrZXQubm9kZS5kZWZhdWx0Q2hpbGQgPz8gdGhpcy5idWNrZXQ7XG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgYnVja2V0UmVzb3VyY2UsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtUzFcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIlNlcnZlciBhY2Nlc3MgbG9nZ2luZyBpcyBub3QgZW5hYmxlZCBvbiB0aGUgdXNhZ2UtaGlzdG9yeSBidWNrZXQuIFwiICtcbiAgICAgICAgICAgIFwiVGhpcyBpcyBhbiBpbnRlcm5hbCBhdWRpdCBidWNrZXQgd2l0aCBubyBwdWJsaWMgYWNjZXNzOyBkYXRhIGFjY2VzcyBpcyBjb250cm9sbGVkIHZpYSBJQU0uIFwiICtcbiAgICAgICAgICAgIFwiRW5hYmxpbmcgc2VydmVyIGFjY2VzcyBsb2dnaW5nIHdvdWxkIGNyZWF0ZSBhIGNpcmN1bGFyIGRlcGVuZGVuY3kgKGxvZyBidWNrZXQg4oaSIGxvZyBidWNrZXQpLlwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICApO1xuXG4gICAgdGhpcy5idWNrZXROYW1lID0gdGhpcy5idWNrZXQuYnVja2V0TmFtZTtcbiAgICB0aGlzLmJ1Y2tldEFybiA9IHRoaXMuYnVja2V0LmJ1Y2tldEFybjtcbiAgfVxufVxuIl19