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
            path.join(__dirname, "../../../src");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLWFnZW50LWVjci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZlcmlmaWNhdGlvbi1hZ2VudC1lY3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7R0FZRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsK0RBQXdFO0FBQ3hFLDJDQUF1QztBQUN2QywyQ0FBNkI7QUFPN0IsTUFBYSxvQkFBcUIsU0FBUSxzQkFBUztJQUNqRCwrREFBK0Q7SUFDL0MsVUFBVSxDQUFtQjtJQUM3QyxrRUFBa0U7SUFDbEQsUUFBUSxDQUFTO0lBRWpDLFlBQ0UsS0FBZ0IsRUFDaEIsRUFBVSxFQUNWLEtBQWlDO1FBRWpDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxTQUFTLEdBQ2IsS0FBSyxFQUFFLGNBQWM7WUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFFdkMscUNBQXFDO1FBQ3JDLHdEQUF3RDtRQUN4RCwyRkFBMkY7UUFDM0YsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLGlDQUFnQixDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDcEQsU0FBUyxFQUFFLFNBQVM7WUFDcEIsUUFBUSxFQUFFLHlCQUFRLENBQUMsV0FBVztZQUM5QixPQUFPLEVBQUUsQ0FBQyxhQUFhLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUM7WUFDM0QsU0FBUyxFQUFFO2dCQUNULFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixJQUFJLEVBQUU7YUFDbEQ7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDO0lBQzNDLENBQUM7Q0FDRjtBQS9CRCxvREErQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFZlcmlmaWNhdGlvbiBBZ2VudCBFQ1IgRG9ja2VyIEltYWdlIGNvbnN0cnVjdC5cbiAqXG4gKiBQdXJwb3NlOiBCdWlsZCBhbmQgcHVzaCB0aGUgVmVyaWZpY2F0aW9uIEFnZW50IGNvbnRhaW5lciBpbWFnZSB0byBFQ1IgZm9yIEFnZW50Q29yZSBSdW50aW1lLiBBUk02NCBvbmx5LlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IEJ1aWxkIGZyb20gYWdlbnQgRG9ja2VyZmlsZSwgcHVzaCB0byBFQ1IsIGV4cG9zZSBpbWFnZVVyaTsgb3B0aW9uYWwgQ0FDSEVCVVNUIGJ1aWxkIGFyZy5cbiAqXG4gKiBJbnB1dHM6IFZlcmlmaWNhdGlvbkFnZW50RWNyUHJvcHMgKG9wdGlvbmFsIGRvY2tlcmZpbGVQYXRoKS5cbiAqXG4gKiBPdXRwdXRzOiBpbWFnZUFzc2V0LCBpbWFnZVVyaSAoZm9yIFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSBjb250YWluZXJJbWFnZVVyaSkuXG4gKlxuICogQG1vZHVsZSBjZGsvbGliL3ZlcmlmaWNhdGlvbi9jb25zdHJ1Y3RzL3ZlcmlmaWNhdGlvbi1hZ2VudC1lY3JcbiAqL1xuXG5pbXBvcnQgeyBEb2NrZXJJbWFnZUFzc2V0LCBQbGF0Zm9ybSB9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWNyLWFzc2V0c1wiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcblxuZXhwb3J0IGludGVyZmFjZSBWZXJpZmljYXRpb25BZ2VudEVjclByb3BzIHtcbiAgLyoqIE9wdGlvbmFsOiBPdmVycmlkZSB0aGUgcGF0aCB0byB0aGUgRG9ja2VyZmlsZSBkaXJlY3RvcnkgKi9cbiAgcmVhZG9ubHkgZG9ja2VyZmlsZVBhdGg/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBWZXJpZmljYXRpb25BZ2VudEVjciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKiBUaGUgRG9ja2VyIGltYWdlIGFzc2V0IChpbmNsdWRlcyBFQ1IgcmVwbyBhbmQgaW1hZ2UgVVJJKSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgaW1hZ2VBc3NldDogRG9ja2VySW1hZ2VBc3NldDtcbiAgLyoqIFRoZSBFQ1IgaW1hZ2UgVVJJIGZvciB1c2UgaW4gQWdlbnRDb3JlIFJ1bnRpbWUgQ29udGFpbmVyVXJpICovXG4gIHB1YmxpYyByZWFkb25seSBpbWFnZVVyaTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHNjb3BlOiBDb25zdHJ1Y3QsXG4gICAgaWQ6IHN0cmluZyxcbiAgICBwcm9wcz86IFZlcmlmaWNhdGlvbkFnZW50RWNyUHJvcHNcbiAgKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IGRvY2tlckRpciA9XG4gICAgICBwcm9wcz8uZG9ja2VyZmlsZVBhdGggfHxcbiAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vLi4vc3JjXCIpO1xuXG4gICAgLy8gQnVpbGQgYW5kIHB1c2ggRG9ja2VyIGltYWdlIHRvIEVDUlxuICAgIC8vIFBsYXRmb3JtOiBsaW51eC9hcm02NCAocmVxdWlyZWQgYnkgQWdlbnRDb3JlIFJ1bnRpbWUpXG4gICAgLy8gQ0FDSEVCVVNUOiBzZXQgQ0RLX0RPQ0tFUl9DQUNIRUJVU1Q9MSAob3IgYW55IHZhbHVlKSB0byBmb3JjZSBuby1jYWNoZSByZWJ1aWxkIG9uIGRlcGxveVxuICAgIHRoaXMuaW1hZ2VBc3NldCA9IG5ldyBEb2NrZXJJbWFnZUFzc2V0KHRoaXMsIFwiSW1hZ2VcIiwge1xuICAgICAgZGlyZWN0b3J5OiBkb2NrZXJEaXIsXG4gICAgICBwbGF0Zm9ybTogUGxhdGZvcm0uTElOVVhfQVJNNjQsXG4gICAgICBleGNsdWRlOiBbXCJfX3B5Y2FjaGVfX1wiLCBcIioucHljXCIsIFwiLnB5dGVzdF9jYWNoZVwiLCBcInRlc3RzXCJdLFxuICAgICAgYnVpbGRBcmdzOiB7XG4gICAgICAgIENBQ0hFQlVTVDogcHJvY2Vzcy5lbnYuQ0RLX0RPQ0tFUl9DQUNIRUJVU1QgPz8gXCJcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmltYWdlVXJpID0gdGhpcy5pbWFnZUFzc2V0LmltYWdlVXJpO1xuICB9XG59XG4iXX0=