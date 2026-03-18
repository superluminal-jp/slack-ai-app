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
exports.FileExchangeBucket = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const constructs_1 = require("constructs");
const cdk_nag_1 = require("cdk-nag");
/**
 * S3 bucket for temporary file exchange between verification and execution zones.
 *
 * Purpose: Hold files uploaded by the verification agent (from Slack) for the execution agent
 * to download via pre-signed URLs; lifecycle rules and auto-delete limit exposure.
 *
 * Responsibilities: Create bucket with SSE-S3, block public access, enforce SSL; lifecycle
 * on attachments/ and generated_files/; auto-delete objects on stack removal.
 *
 * Inputs: None (construct id only).
 *
 * Outputs: bucket, bucketName, bucketArn.
 */
class FileExchangeBucket extends constructs_1.Construct {
    /** The S3 bucket resource. */
    bucket;
    /** Bucket name (convenience export for env/config). */
    bucketName;
    /** Bucket ARN (convenience export for IAM/cross-stack). */
    bucketArn;
    constructor(scope, id) {
        super(scope, id);
        const stackName = cdk.Stack.of(this).stackName;
        this.bucket = new s3.Bucket(this, "Bucket", {
            bucketName: `${stackName.toLowerCase()}-file-exchange`,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            versioned: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    id: "delete-temp-attachments",
                    prefix: "attachments/",
                    expiration: cdk.Duration.days(1),
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                    enabled: true,
                },
                {
                    id: "delete-generated-files",
                    prefix: "generated_files/",
                    expiration: cdk.Duration.days(1),
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                    enabled: true,
                },
            ],
        });
        const bucketResource = this.bucket.node.defaultChild ?? this.bucket;
        cdk_nag_1.NagSuppressions.addResourceSuppressions(bucketResource, [
            {
                id: "AwsSolutions-S1",
                reason: "Server access logging is not enabled on the file-exchange bucket. " +
                    "This is a temporary internal bucket with strict IAM access controls and short retention. " +
                    "Enabling server access logging would require an additional log bucket and increase operational cost for low-value telemetry.",
            },
        ]);
        this.bucketName = this.bucket.bucketName;
        this.bucketArn = this.bucket.bucketArn;
    }
}
exports.FileExchangeBucket = FileExchangeBucket;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1leGNoYW5nZS1idWNrZXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmaWxlLWV4Y2hhbmdlLWJ1Y2tldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLDJDQUF1QztBQUN2QyxxQ0FBMEM7QUFFMUM7Ozs7Ozs7Ozs7OztHQVlHO0FBQ0gsTUFBYSxrQkFBbUIsU0FBUSxzQkFBUztJQUMvQyw4QkFBOEI7SUFDZCxNQUFNLENBQVk7SUFFbEMsdURBQXVEO0lBQ3ZDLFVBQVUsQ0FBUztJQUVuQywyREFBMkQ7SUFDM0MsU0FBUyxDQUFTO0lBRWxDLFlBQVksS0FBZ0IsRUFBRSxFQUFVO1FBQ3RDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFDO1FBRS9DLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDMUMsVUFBVSxFQUFFLEdBQUcsU0FBUyxDQUFDLFdBQVcsRUFBRSxnQkFBZ0I7WUFDdEQsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSxLQUFLO1lBQ2hCLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDeEMsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLHlCQUF5QjtvQkFDN0IsTUFBTSxFQUFFLGNBQWM7b0JBQ3RCLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hDLG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0Q7b0JBQ0UsRUFBRSxFQUFFLHdCQUF3QjtvQkFDNUIsTUFBTSxFQUFFLGtCQUFrQjtvQkFDMUIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxPQUFPLEVBQUUsSUFBSTtpQkFDZDthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDcEUseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsY0FBYyxFQUNkO1lBQ0U7Z0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtnQkFDckIsTUFBTSxFQUNKLG9FQUFvRTtvQkFDcEUsMkZBQTJGO29CQUMzRiw4SEFBOEg7YUFDakk7U0FDRixDQUNGLENBQUM7UUFFRixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7SUFDekMsQ0FBQztDQUNGO0FBMURELGdEQTBEQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuXG4vKipcbiAqIFMzIGJ1Y2tldCBmb3IgdGVtcG9yYXJ5IGZpbGUgZXhjaGFuZ2UgYmV0d2VlbiB2ZXJpZmljYXRpb24gYW5kIGV4ZWN1dGlvbiB6b25lcy5cbiAqXG4gKiBQdXJwb3NlOiBIb2xkIGZpbGVzIHVwbG9hZGVkIGJ5IHRoZSB2ZXJpZmljYXRpb24gYWdlbnQgKGZyb20gU2xhY2spIGZvciB0aGUgZXhlY3V0aW9uIGFnZW50XG4gKiB0byBkb3dubG9hZCB2aWEgcHJlLXNpZ25lZCBVUkxzOyBsaWZlY3ljbGUgcnVsZXMgYW5kIGF1dG8tZGVsZXRlIGxpbWl0IGV4cG9zdXJlLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IENyZWF0ZSBidWNrZXQgd2l0aCBTU0UtUzMsIGJsb2NrIHB1YmxpYyBhY2Nlc3MsIGVuZm9yY2UgU1NMOyBsaWZlY3ljbGVcbiAqIG9uIGF0dGFjaG1lbnRzLyBhbmQgZ2VuZXJhdGVkX2ZpbGVzLzsgYXV0by1kZWxldGUgb2JqZWN0cyBvbiBzdGFjayByZW1vdmFsLlxuICpcbiAqIElucHV0czogTm9uZSAoY29uc3RydWN0IGlkIG9ubHkpLlxuICpcbiAqIE91dHB1dHM6IGJ1Y2tldCwgYnVja2V0TmFtZSwgYnVja2V0QXJuLlxuICovXG5leHBvcnQgY2xhc3MgRmlsZUV4Y2hhbmdlQnVja2V0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqIFRoZSBTMyBidWNrZXQgcmVzb3VyY2UuICovXG4gIHB1YmxpYyByZWFkb25seSBidWNrZXQ6IHMzLkJ1Y2tldDtcblxuICAvKiogQnVja2V0IG5hbWUgKGNvbnZlbmllbmNlIGV4cG9ydCBmb3IgZW52L2NvbmZpZykuICovXG4gIHB1YmxpYyByZWFkb25seSBidWNrZXROYW1lOiBzdHJpbmc7XG5cbiAgLyoqIEJ1Y2tldCBBUk4gKGNvbnZlbmllbmNlIGV4cG9ydCBmb3IgSUFNL2Nyb3NzLXN0YWNrKS4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldEFybjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gY2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZTtcblxuICAgIHRoaXMuYnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkJ1Y2tldFwiLCB7XG4gICAgICBidWNrZXROYW1lOiBgJHtzdGFja05hbWUudG9Mb3dlckNhc2UoKX0tZmlsZS1leGNoYW5nZWAsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiZGVsZXRlLXRlbXAtYXR0YWNobWVudHNcIixcbiAgICAgICAgICBwcmVmaXg6IFwiYXR0YWNobWVudHMvXCIsXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJkZWxldGUtZ2VuZXJhdGVkLWZpbGVzXCIsXG4gICAgICAgICAgcHJlZml4OiBcImdlbmVyYXRlZF9maWxlcy9cIixcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBidWNrZXRSZXNvdXJjZSA9IHRoaXMuYnVja2V0Lm5vZGUuZGVmYXVsdENoaWxkID8/IHRoaXMuYnVja2V0O1xuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIGJ1Y2tldFJlc291cmNlLFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLVMxXCIsXG4gICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgXCJTZXJ2ZXIgYWNjZXNzIGxvZ2dpbmcgaXMgbm90IGVuYWJsZWQgb24gdGhlIGZpbGUtZXhjaGFuZ2UgYnVja2V0LiBcIiArXG4gICAgICAgICAgICBcIlRoaXMgaXMgYSB0ZW1wb3JhcnkgaW50ZXJuYWwgYnVja2V0IHdpdGggc3RyaWN0IElBTSBhY2Nlc3MgY29udHJvbHMgYW5kIHNob3J0IHJldGVudGlvbi4gXCIgK1xuICAgICAgICAgICAgXCJFbmFibGluZyBzZXJ2ZXIgYWNjZXNzIGxvZ2dpbmcgd291bGQgcmVxdWlyZSBhbiBhZGRpdGlvbmFsIGxvZyBidWNrZXQgYW5kIGluY3JlYXNlIG9wZXJhdGlvbmFsIGNvc3QgZm9yIGxvdy12YWx1ZSB0ZWxlbWV0cnkuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICk7XG5cbiAgICB0aGlzLmJ1Y2tldE5hbWUgPSB0aGlzLmJ1Y2tldC5idWNrZXROYW1lO1xuICAgIHRoaXMuYnVja2V0QXJuID0gdGhpcy5idWNrZXQuYnVja2V0QXJuO1xuICB9XG59XG4iXX0=