/**
 * CDK Construct for Verification Agent ECR Docker Image.
 *
 * Uses DockerImageAsset to build and push the Verification Agent
 * container image to ECR with ARM64 platform support.
 *
 * @module cdk/lib/verification/constructs/verification-agent-ecr
 */

import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import * as path from "path";

export interface VerificationAgentEcrProps {
  /** Optional: Override the path to the Dockerfile directory */
  readonly dockerfilePath?: string;
}

export class VerificationAgentEcr extends Construct {
  /** The Docker image asset (includes ECR repo and image URI) */
  public readonly imageAsset: DockerImageAsset;
  /** The ECR image URI for use in AgentCore Runtime ContainerUri */
  public readonly imageUri: string;

  constructor(
    scope: Construct,
    id: string,
    props?: VerificationAgentEcrProps
  ) {
    super(scope, id);

    const dockerDir =
      props?.dockerfilePath ||
      path.join(__dirname, "../agent/verification-agent");

    // Build and push Docker image to ECR
    // Platform: linux/arm64 (required by AgentCore Runtime)
    this.imageAsset = new DockerImageAsset(this, "Image", {
      directory: dockerDir,
      platform: Platform.LINUX_ARM64,
      // Exclude unnecessary files from Docker build context
      exclude: ["__pycache__", "*.pyc", ".pytest_cache", "tests"],
    });

    this.imageUri = this.imageAsset.imageUri;
  }
}
