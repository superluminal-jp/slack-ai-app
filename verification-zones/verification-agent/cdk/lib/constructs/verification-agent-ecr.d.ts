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
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
export interface VerificationAgentEcrProps {
    /** Optional: Override the path to the Dockerfile directory */
    readonly dockerfilePath?: string;
}
export declare class VerificationAgentEcr extends Construct {
    /** The Docker image asset (includes ECR repo and image URI) */
    readonly imageAsset: DockerImageAsset;
    /** The ECR image URI for use in AgentCore Runtime ContainerUri */
    readonly imageUri: string;
    constructor(scope: Construct, id: string, props?: VerificationAgentEcrProps);
}
