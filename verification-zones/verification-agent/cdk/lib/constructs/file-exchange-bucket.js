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
const s3_bucket_name_1 = require("./s3-bucket-name");
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
            bucketName: (0, s3_bucket_name_1.scopedBucketName)(stackName.toLowerCase(), "file-exchange"),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1leGNoYW5nZS1idWNrZXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmaWxlLWV4Y2hhbmdlLWJ1Y2tldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLDJDQUF1QztBQUN2QyxxQ0FBMEM7QUFDMUMscURBQW9EO0FBRXBEOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILE1BQWEsa0JBQW1CLFNBQVEsc0JBQVM7SUFDL0MsOEJBQThCO0lBQ2QsTUFBTSxDQUFZO0lBRWxDLHVEQUF1RDtJQUN2QyxVQUFVLENBQVM7SUFFbkMsMkRBQTJEO0lBQzNDLFNBQVMsQ0FBUztJQUVsQyxZQUFZLEtBQWdCLEVBQUUsRUFBVTtRQUN0QyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUUvQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQzFDLFVBQVUsRUFBRSxJQUFBLGlDQUFnQixFQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxlQUFlLENBQUM7WUFDdEUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSxLQUFLO1lBQ2hCLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDeEMsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLHlCQUF5QjtvQkFDN0IsTUFBTSxFQUFFLGNBQWM7b0JBQ3RCLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hDLG1DQUFtQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0Q7b0JBQ0UsRUFBRSxFQUFFLHdCQUF3QjtvQkFDNUIsTUFBTSxFQUFFLGtCQUFrQjtvQkFDMUIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxPQUFPLEVBQUUsSUFBSTtpQkFDZDthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDcEUseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsY0FBYyxFQUNkO1lBQ0U7Z0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtnQkFDckIsTUFBTSxFQUNKLG9FQUFvRTtvQkFDcEUsMkZBQTJGO29CQUMzRiw4SEFBOEg7YUFDakk7U0FDRixDQUNGLENBQUM7UUFFRixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7SUFDekMsQ0FBQztDQUNGO0FBMURELGdEQTBEQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuaW1wb3J0IHsgc2NvcGVkQnVja2V0TmFtZSB9IGZyb20gXCIuL3MzLWJ1Y2tldC1uYW1lXCI7XG5cbi8qKlxuICogUzMgYnVja2V0IGZvciB0ZW1wb3JhcnkgZmlsZSBleGNoYW5nZSBiZXR3ZWVuIHZlcmlmaWNhdGlvbiBhbmQgZXhlY3V0aW9uIHpvbmVzLlxuICpcbiAqIFB1cnBvc2U6IEhvbGQgZmlsZXMgdXBsb2FkZWQgYnkgdGhlIHZlcmlmaWNhdGlvbiBhZ2VudCAoZnJvbSBTbGFjaykgZm9yIHRoZSBleGVjdXRpb24gYWdlbnRcbiAqIHRvIGRvd25sb2FkIHZpYSBwcmUtc2lnbmVkIFVSTHM7IGxpZmVjeWNsZSBydWxlcyBhbmQgYXV0by1kZWxldGUgbGltaXQgZXhwb3N1cmUuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogQ3JlYXRlIGJ1Y2tldCB3aXRoIFNTRS1TMywgYmxvY2sgcHVibGljIGFjY2VzcywgZW5mb3JjZSBTU0w7IGxpZmVjeWNsZVxuICogb24gYXR0YWNobWVudHMvIGFuZCBnZW5lcmF0ZWRfZmlsZXMvOyBhdXRvLWRlbGV0ZSBvYmplY3RzIG9uIHN0YWNrIHJlbW92YWwuXG4gKlxuICogSW5wdXRzOiBOb25lIChjb25zdHJ1Y3QgaWQgb25seSkuXG4gKlxuICogT3V0cHV0czogYnVja2V0LCBidWNrZXROYW1lLCBidWNrZXRBcm4uXG4gKi9cbmV4cG9ydCBjbGFzcyBGaWxlRXhjaGFuZ2VCdWNrZXQgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKiogVGhlIFMzIGJ1Y2tldCByZXNvdXJjZS4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldDogczMuQnVja2V0O1xuXG4gIC8qKiBCdWNrZXQgbmFtZSAoY29udmVuaWVuY2UgZXhwb3J0IGZvciBlbnYvY29uZmlnKS4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldE5hbWU6IHN0cmluZztcblxuICAvKiogQnVja2V0IEFSTiAoY29udmVuaWVuY2UgZXhwb3J0IGZvciBJQU0vY3Jvc3Mtc3RhY2spLiAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0QXJuOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBzdGFja05hbWUgPSBjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lO1xuXG4gICAgdGhpcy5idWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiQnVja2V0XCIsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IHNjb3BlZEJ1Y2tldE5hbWUoc3RhY2tOYW1lLnRvTG93ZXJDYXNlKCksIFwiZmlsZS1leGNoYW5nZVwiKSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJkZWxldGUtdGVtcC1hdHRhY2htZW50c1wiLFxuICAgICAgICAgIHByZWZpeDogXCJhdHRhY2htZW50cy9cIixcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImRlbGV0ZS1nZW5lcmF0ZWQtZmlsZXNcIixcbiAgICAgICAgICBwcmVmaXg6IFwiZ2VuZXJhdGVkX2ZpbGVzL1wiLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGJ1Y2tldFJlc291cmNlID0gdGhpcy5idWNrZXQubm9kZS5kZWZhdWx0Q2hpbGQgPz8gdGhpcy5idWNrZXQ7XG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgYnVja2V0UmVzb3VyY2UsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtUzFcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIlNlcnZlciBhY2Nlc3MgbG9nZ2luZyBpcyBub3QgZW5hYmxlZCBvbiB0aGUgZmlsZS1leGNoYW5nZSBidWNrZXQuIFwiICtcbiAgICAgICAgICAgIFwiVGhpcyBpcyBhIHRlbXBvcmFyeSBpbnRlcm5hbCBidWNrZXQgd2l0aCBzdHJpY3QgSUFNIGFjY2VzcyBjb250cm9scyBhbmQgc2hvcnQgcmV0ZW50aW9uLiBcIiArXG4gICAgICAgICAgICBcIkVuYWJsaW5nIHNlcnZlciBhY2Nlc3MgbG9nZ2luZyB3b3VsZCByZXF1aXJlIGFuIGFkZGl0aW9uYWwgbG9nIGJ1Y2tldCBhbmQgaW5jcmVhc2Ugb3BlcmF0aW9uYWwgY29zdCBmb3IgbG93LXZhbHVlIHRlbGVtZXRyeS5cIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgKTtcblxuICAgIHRoaXMuYnVja2V0TmFtZSA9IHRoaXMuYnVja2V0LmJ1Y2tldE5hbWU7XG4gICAgdGhpcy5idWNrZXRBcm4gPSB0aGlzLmJ1Y2tldC5idWNrZXRBcm47XG4gIH1cbn1cbiJdfQ==