"use strict";
/**
 * Verification Agent ECR Docker Image construct.
 *
 * Purpose: Build and push the Verification Agent container image to ECR for AgentCore Runtime. ARM64 only.
 *
 * Responsibilities: Build from agent Dockerfile, push to ECR, expose imageUri; optional CACHEBUST build arg.
 *
 * Inputs: VerificationAgentEcrProps (optional dockerfilePath).
 *
 * Outputs: imageAsset, imageUri (for VerificationAgentRuntime containerImageUri).
 *
 * @module cdk/lib/verification/constructs/verification-agent-ecr
 */
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
exports.VerificationAgentEcr = void 0;
const aws_ecr_assets_1 = require("aws-cdk-lib/aws-ecr-assets");
const constructs_1 = require("constructs");
const path = __importStar(require("path"));
class VerificationAgentEcr extends constructs_1.Construct {
    /** The Docker image asset (includes ECR repo and image URI) */
    imageAsset;
    /** The ECR image URI for use in AgentCore Runtime ContainerUri */
    imageUri;
    constructor(scope, id, props) {
        super(scope, id);
        const dockerDir = props?.dockerfilePath ||
            path.join(__dirname, "../../../agent/verification-agent");
        // Build and push Docker image to ECR
        // Platform: linux/arm64 (required by AgentCore Runtime)
        // CACHEBUST: set CDK_DOCKER_CACHEBUST=1 (or any value) to force no-cache rebuild on deploy
        this.imageAsset = new aws_ecr_assets_1.DockerImageAsset(this, "Image", {
            directory: dockerDir,
            platform: aws_ecr_assets_1.Platform.LINUX_ARM64,
            exclude: ["__pycache__", "*.pyc", ".pytest_cache", "tests"],
            buildArgs: {
                CACHEBUST: process.env.CDK_DOCKER_CACHEBUST ?? "",
            },
        });
        this.imageUri = this.imageAsset.imageUri;
    }
}
exports.VerificationAgentEcr = VerificationAgentEcr;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLWFnZW50LWVjci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZlcmlmaWNhdGlvbi1hZ2VudC1lY3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7R0FZRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsK0RBQXdFO0FBQ3hFLDJDQUF1QztBQUN2QywyQ0FBNkI7QUFPN0IsTUFBYSxvQkFBcUIsU0FBUSxzQkFBUztJQUNqRCwrREFBK0Q7SUFDL0MsVUFBVSxDQUFtQjtJQUM3QyxrRUFBa0U7SUFDbEQsUUFBUSxDQUFTO0lBRWpDLFlBQ0UsS0FBZ0IsRUFDaEIsRUFBVSxFQUNWLEtBQWlDO1FBRWpDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxTQUFTLEdBQ2IsS0FBSyxFQUFFLGNBQWM7WUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsbUNBQW1DLENBQUMsQ0FBQztRQUU1RCxxQ0FBcUM7UUFDckMsd0RBQXdEO1FBQ3hELDJGQUEyRjtRQUMzRixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksaUNBQWdCLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUNwRCxTQUFTLEVBQUUsU0FBUztZQUNwQixRQUFRLEVBQUUseUJBQVEsQ0FBQyxXQUFXO1lBQzlCLE9BQU8sRUFBRSxDQUFDLGFBQWEsRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sQ0FBQztZQUMzRCxTQUFTLEVBQUU7Z0JBQ1QsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLElBQUksRUFBRTthQUNsRDtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7SUFDM0MsQ0FBQztDQUNGO0FBL0JELG9EQStCQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVmVyaWZpY2F0aW9uIEFnZW50IEVDUiBEb2NrZXIgSW1hZ2UgY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IEJ1aWxkIGFuZCBwdXNoIHRoZSBWZXJpZmljYXRpb24gQWdlbnQgY29udGFpbmVyIGltYWdlIHRvIEVDUiBmb3IgQWdlbnRDb3JlIFJ1bnRpbWUuIEFSTTY0IG9ubHkuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogQnVpbGQgZnJvbSBhZ2VudCBEb2NrZXJmaWxlLCBwdXNoIHRvIEVDUiwgZXhwb3NlIGltYWdlVXJpOyBvcHRpb25hbCBDQUNIRUJVU1QgYnVpbGQgYXJnLlxuICpcbiAqIElucHV0czogVmVyaWZpY2F0aW9uQWdlbnRFY3JQcm9wcyAob3B0aW9uYWwgZG9ja2VyZmlsZVBhdGgpLlxuICpcbiAqIE91dHB1dHM6IGltYWdlQXNzZXQsIGltYWdlVXJpIChmb3IgVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lIGNvbnRhaW5lckltYWdlVXJpKS5cbiAqXG4gKiBAbW9kdWxlIGNkay9saWIvdmVyaWZpY2F0aW9uL2NvbnN0cnVjdHMvdmVyaWZpY2F0aW9uLWFnZW50LWVjclxuICovXG5cbmltcG9ydCB7IERvY2tlckltYWdlQXNzZXQsIFBsYXRmb3JtIH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1lY3ItYXNzZXRzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZlcmlmaWNhdGlvbkFnZW50RWNyUHJvcHMge1xuICAvKiogT3B0aW9uYWw6IE92ZXJyaWRlIHRoZSBwYXRoIHRvIHRoZSBEb2NrZXJmaWxlIGRpcmVjdG9yeSAqL1xuICByZWFkb25seSBkb2NrZXJmaWxlUGF0aD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFZlcmlmaWNhdGlvbkFnZW50RWNyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqIFRoZSBEb2NrZXIgaW1hZ2UgYXNzZXQgKGluY2x1ZGVzIEVDUiByZXBvIGFuZCBpbWFnZSBVUkkpICovXG4gIHB1YmxpYyByZWFkb25seSBpbWFnZUFzc2V0OiBEb2NrZXJJbWFnZUFzc2V0O1xuICAvKiogVGhlIEVDUiBpbWFnZSBVUkkgZm9yIHVzZSBpbiBBZ2VudENvcmUgUnVudGltZSBDb250YWluZXJVcmkgKi9cbiAgcHVibGljIHJlYWRvbmx5IGltYWdlVXJpOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgc2NvcGU6IENvbnN0cnVjdCxcbiAgICBpZDogc3RyaW5nLFxuICAgIHByb3BzPzogVmVyaWZpY2F0aW9uQWdlbnRFY3JQcm9wc1xuICApIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgZG9ja2VyRGlyID1cbiAgICAgIHByb3BzPy5kb2NrZXJmaWxlUGF0aCB8fFxuICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uLi8uLi9hZ2VudC92ZXJpZmljYXRpb24tYWdlbnRcIik7XG5cbiAgICAvLyBCdWlsZCBhbmQgcHVzaCBEb2NrZXIgaW1hZ2UgdG8gRUNSXG4gICAgLy8gUGxhdGZvcm06IGxpbnV4L2FybTY0IChyZXF1aXJlZCBieSBBZ2VudENvcmUgUnVudGltZSlcbiAgICAvLyBDQUNIRUJVU1Q6IHNldCBDREtfRE9DS0VSX0NBQ0hFQlVTVD0xIChvciBhbnkgdmFsdWUpIHRvIGZvcmNlIG5vLWNhY2hlIHJlYnVpbGQgb24gZGVwbG95XG4gICAgdGhpcy5pbWFnZUFzc2V0ID0gbmV3IERvY2tlckltYWdlQXNzZXQodGhpcywgXCJJbWFnZVwiLCB7XG4gICAgICBkaXJlY3Rvcnk6IGRvY2tlckRpcixcbiAgICAgIHBsYXRmb3JtOiBQbGF0Zm9ybS5MSU5VWF9BUk02NCxcbiAgICAgIGV4Y2x1ZGU6IFtcIl9fcHljYWNoZV9fXCIsIFwiKi5weWNcIiwgXCIucHl0ZXN0X2NhY2hlXCIsIFwidGVzdHNcIl0sXG4gICAgICBidWlsZEFyZ3M6IHtcbiAgICAgICAgQ0FDSEVCVVNUOiBwcm9jZXNzLmVudi5DREtfRE9DS0VSX0NBQ0hFQlVTVCA/PyBcIlwiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuaW1hZ2VVcmkgPSB0aGlzLmltYWdlQXNzZXQuaW1hZ2VVcmk7XG4gIH1cbn1cbiJdfQ==