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
            bucketName: `${stackName.toLowerCase()}-usage-history`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1idWNrZXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1c2FnZS1oaXN0b3J5LWJ1Y2tldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLDJDQUF1QztBQUN2QyxxQ0FBMEM7QUFFMUM7Ozs7Ozs7Ozs7OztHQVlHO0FBQ0gsTUFBYSxrQkFBbUIsU0FBUSxzQkFBUztJQUMvQixNQUFNLENBQVk7SUFDbEIsVUFBVSxDQUFTO0lBQ25CLFNBQVMsQ0FBUztJQUVsQyxZQUFZLEtBQWdCLEVBQUUsRUFBVTtRQUN0QyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUUvQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQzFDLFVBQVUsRUFBRSxHQUFHLFNBQVMsQ0FBQyxXQUFXLEVBQUUsZ0JBQWdCO1lBQ3RELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyxpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUNqRCxVQUFVLEVBQUUsSUFBSTtZQUNoQixTQUFTLEVBQUUsSUFBSTtZQUNmLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDeEMsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGdCQUFnQjtvQkFDcEIsTUFBTSxFQUFFLFVBQVU7b0JBQ2xCLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ2pDLG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0Q7b0JBQ0UsRUFBRSxFQUFFLG9CQUFvQjtvQkFDeEIsTUFBTSxFQUFFLGNBQWM7b0JBQ3RCLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ2pDLG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0Q7b0JBQ0UsRUFBRSxFQUFFLHlCQUF5QjtvQkFDN0IsTUFBTSxFQUFFLG1CQUFtQjtvQkFDM0IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDakMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRDtvQkFDRSxFQUFFLEVBQUUsNEJBQTRCO29CQUNoQywyQkFBMkIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2pELG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQ3BFLHlCQUFlLENBQUMsdUJBQXVCLENBQ3JDLGNBQWMsRUFDZDtZQUNFO2dCQUNFLEVBQUUsRUFBRSxpQkFBaUI7Z0JBQ3JCLE1BQU0sRUFDSixvRUFBb0U7b0JBQ3BFLDZGQUE2RjtvQkFDN0YsOEZBQThGO2FBQ2pHO1NBQ0YsQ0FDRixDQUFDO1FBRUYsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQztRQUN6QyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO0lBQ3pDLENBQUM7Q0FDRjtBQWxFRCxnREFrRUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSBcImNkay1uYWdcIjtcblxuLyoqXG4gKiBVc2FnZSBoaXN0b3J5IFMzIGJ1Y2tldCBjb25zdHJ1Y3QuXG4gKlxuICogUHVycG9zZTogU3RvcmUgaW5wdXQvb3V0cHV0IHRleHQgKGNvbnRlbnQvIHByZWZpeCkgYW5kIGF0dGFjaG1lbnQgZmlsZXNcbiAqIChhdHRhY2htZW50cy8gcHJlZml4KSBmb3IgbG9uZy10ZXJtIGF1ZGl0LiBTZXBhcmF0ZWQgZnJvbSBmaWxlLWV4Y2hhbmdlIGJ1Y2tldFxuICogdG8gYXZvaWQgY29uZmxpY3Qgd2l0aCAxLWRheSBsaWZlY3ljbGUuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogU1NFLVMzLCBlbmZvcmNlU1NMLCBCbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsIERFU1RST1ksXG4gKiBhdXRvRGVsZXRlT2JqZWN0czsgdHdvIGxpZmVjeWNsZSBydWxlcyB3aXRoIDkwLWRheSBleHBpcmF0aW9uIG9uIGNvbnRlbnQvIGFuZFxuICogYXR0YWNobWVudHMvIHByZWZpeGVzIChhbGlnbmVkIHdpdGggRHluYW1vREIgVFRMKS5cbiAqXG4gKiBPdXRwdXRzOiBidWNrZXQsIGJ1Y2tldE5hbWUsIGJ1Y2tldEFybi5cbiAqL1xuZXhwb3J0IGNsYXNzIFVzYWdlSGlzdG9yeUJ1Y2tldCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBidWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldE5hbWU6IHN0cmluZztcbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldEFybjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gY2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZTtcblxuICAgIHRoaXMuYnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkJ1Y2tldFwiLCB7XG4gICAgICBidWNrZXROYW1lOiBgJHtzdGFja05hbWUudG9Mb3dlckNhc2UoKX0tdXNhZ2UtaGlzdG9yeWAsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJleHBpcmUtY29udGVudFwiLFxuICAgICAgICAgIHByZWZpeDogXCJjb250ZW50L1wiLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImV4cGlyZS1hdHRhY2htZW50c1wiLFxuICAgICAgICAgIHByZWZpeDogXCJhdHRhY2htZW50cy9cIixcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJleHBpcmUtZHluYW1vZGItZXhwb3J0c1wiLFxuICAgICAgICAgIHByZWZpeDogXCJkeW5hbW9kYi1leHBvcnRzL1wiLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImV4cGlyZS1ub25jdXJyZW50LXZlcnNpb25zXCIsXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBidWNrZXRSZXNvdXJjZSA9IHRoaXMuYnVja2V0Lm5vZGUuZGVmYXVsdENoaWxkID8/IHRoaXMuYnVja2V0O1xuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIGJ1Y2tldFJlc291cmNlLFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLVMxXCIsXG4gICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgXCJTZXJ2ZXIgYWNjZXNzIGxvZ2dpbmcgaXMgbm90IGVuYWJsZWQgb24gdGhlIHVzYWdlLWhpc3RvcnkgYnVja2V0LiBcIiArXG4gICAgICAgICAgICBcIlRoaXMgaXMgYW4gaW50ZXJuYWwgYXVkaXQgYnVja2V0IHdpdGggbm8gcHVibGljIGFjY2VzczsgZGF0YSBhY2Nlc3MgaXMgY29udHJvbGxlZCB2aWEgSUFNLiBcIiArXG4gICAgICAgICAgICBcIkVuYWJsaW5nIHNlcnZlciBhY2Nlc3MgbG9nZ2luZyB3b3VsZCBjcmVhdGUgYSBjaXJjdWxhciBkZXBlbmRlbmN5IChsb2cgYnVja2V0IOKGkiBsb2cgYnVja2V0KS5cIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgKTtcblxuICAgIHRoaXMuYnVja2V0TmFtZSA9IHRoaXMuYnVja2V0LmJ1Y2tldE5hbWU7XG4gICAgdGhpcy5idWNrZXRBcm4gPSB0aGlzLmJ1Y2tldC5idWNrZXRBcm47XG4gIH1cbn1cbiJdfQ==