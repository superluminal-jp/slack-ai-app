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
        this.bucketName = this.bucket.bucketName;
        this.bucketArn = this.bucket.bucketArn;
    }
}
exports.FileExchangeBucket = FileExchangeBucket;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1leGNoYW5nZS1idWNrZXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmaWxlLWV4Y2hhbmdlLWJ1Y2tldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLDJDQUF1QztBQUV2Qzs7Ozs7Ozs7Ozs7O0dBWUc7QUFDSCxNQUFhLGtCQUFtQixTQUFRLHNCQUFTO0lBQy9DLDhCQUE4QjtJQUNkLE1BQU0sQ0FBWTtJQUVsQyx1REFBdUQ7SUFDdkMsVUFBVSxDQUFTO0lBRW5DLDJEQUEyRDtJQUMzQyxTQUFTLENBQVM7SUFFbEMsWUFBWSxLQUFnQixFQUFFLEVBQVU7UUFDdEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFL0MsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUMxQyxVQUFVLEVBQUUsR0FBRyxTQUFTLENBQUMsV0FBVyxFQUFFLGdCQUFnQjtZQUN0RCxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsVUFBVSxFQUFFLElBQUk7WUFDaEIsU0FBUyxFQUFFLEtBQUs7WUFDaEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxFQUFFLEVBQUUseUJBQXlCO29CQUM3QixNQUFNLEVBQUUsY0FBYztvQkFDdEIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRDtvQkFDRSxFQUFFLEVBQUUsd0JBQXdCO29CQUM1QixNQUFNLEVBQUUsa0JBQWtCO29CQUMxQixVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNoQyxtQ0FBbUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3pELE9BQU8sRUFBRSxJQUFJO2lCQUNkO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7SUFDekMsQ0FBQztDQUNGO0FBNUNELGdEQTRDQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5cbi8qKlxuICogUzMgYnVja2V0IGZvciB0ZW1wb3JhcnkgZmlsZSBleGNoYW5nZSBiZXR3ZWVuIHZlcmlmaWNhdGlvbiBhbmQgZXhlY3V0aW9uIHpvbmVzLlxuICpcbiAqIFB1cnBvc2U6IEhvbGQgZmlsZXMgdXBsb2FkZWQgYnkgdGhlIHZlcmlmaWNhdGlvbiBhZ2VudCAoZnJvbSBTbGFjaykgZm9yIHRoZSBleGVjdXRpb24gYWdlbnRcbiAqIHRvIGRvd25sb2FkIHZpYSBwcmUtc2lnbmVkIFVSTHM7IGxpZmVjeWNsZSBydWxlcyBhbmQgYXV0by1kZWxldGUgbGltaXQgZXhwb3N1cmUuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogQ3JlYXRlIGJ1Y2tldCB3aXRoIFNTRS1TMywgYmxvY2sgcHVibGljIGFjY2VzcywgZW5mb3JjZSBTU0w7IGxpZmVjeWNsZVxuICogb24gYXR0YWNobWVudHMvIGFuZCBnZW5lcmF0ZWRfZmlsZXMvOyBhdXRvLWRlbGV0ZSBvYmplY3RzIG9uIHN0YWNrIHJlbW92YWwuXG4gKlxuICogSW5wdXRzOiBOb25lIChjb25zdHJ1Y3QgaWQgb25seSkuXG4gKlxuICogT3V0cHV0czogYnVja2V0LCBidWNrZXROYW1lLCBidWNrZXRBcm4uXG4gKi9cbmV4cG9ydCBjbGFzcyBGaWxlRXhjaGFuZ2VCdWNrZXQgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKiogVGhlIFMzIGJ1Y2tldCByZXNvdXJjZS4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldDogczMuQnVja2V0O1xuXG4gIC8qKiBCdWNrZXQgbmFtZSAoY29udmVuaWVuY2UgZXhwb3J0IGZvciBlbnYvY29uZmlnKS4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldE5hbWU6IHN0cmluZztcblxuICAvKiogQnVja2V0IEFSTiAoY29udmVuaWVuY2UgZXhwb3J0IGZvciBJQU0vY3Jvc3Mtc3RhY2spLiAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0QXJuOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBzdGFja05hbWUgPSBjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lO1xuXG4gICAgdGhpcy5idWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiQnVja2V0XCIsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGAke3N0YWNrTmFtZS50b0xvd2VyQ2FzZSgpfS1maWxlLWV4Y2hhbmdlYCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJkZWxldGUtdGVtcC1hdHRhY2htZW50c1wiLFxuICAgICAgICAgIHByZWZpeDogXCJhdHRhY2htZW50cy9cIixcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcImRlbGV0ZS1nZW5lcmF0ZWQtZmlsZXNcIixcbiAgICAgICAgICBwcmVmaXg6IFwiZ2VuZXJhdGVkX2ZpbGVzL1wiLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIHRoaXMuYnVja2V0TmFtZSA9IHRoaXMuYnVja2V0LmJ1Y2tldE5hbWU7XG4gICAgdGhpcy5idWNrZXRBcm4gPSB0aGlzLmJ1Y2tldC5idWNrZXRBcm47XG4gIH1cbn1cbiJdfQ==