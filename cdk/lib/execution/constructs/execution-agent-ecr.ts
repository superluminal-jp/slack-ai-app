/**
 * Execution Agent ECR Docker Image construct.
 *
 * Purpose: Build and push the Execution Agent container image to ECR for use by
 * AgentCore Runtime. ARM64 only (required by AgentCore).
 *
 * Responsibilities: Build from agent Dockerfile, push to ECR, expose imageUri for runtime.
 *
 * Inputs: ExecutionAgentEcrProps (optional dockerfilePath).
 *
 * Outputs: imageAsset, imageUri (for ExecutionAgentRuntime containerImageUri).
 *
 * @module cdk/lib/execution/constructs/execution-agent-ecr
 */

import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import * as path from "path";

export interface ExecutionAgentEcrProps {
  /** Optional: Override the path to the Dockerfile directory */
  readonly dockerfilePath?: string;
  /** Optional: Force image rebuild by changing asset hash (e.g. timestamp or "1") */
  readonly extraHash?: string;
}

export class ExecutionAgentEcr extends Construct {
  /** The Docker image asset (includes ECR repo and image URI) */
  public readonly imageAsset: DockerImageAsset;
  /** The ECR image URI for use in AgentCore Runtime ContainerUri */
  public readonly imageUri: string;

  constructor(scope: Construct, id: string, props?: ExecutionAgentEcrProps) {
    super(scope, id);

    const dockerDir =
      props?.dockerfilePath ||
      path.join(__dirname, "../agent/execution-agent");

    // Build and push Docker image to ECR
    // Platform: linux/arm64 (required by AgentCore Runtime)
    this.imageAsset = new DockerImageAsset(this, "Image", {
      directory: dockerDir,
      platform: Platform.LINUX_ARM64,
      // Exclude unnecessary files from Docker build context
      exclude: ["__pycache__", "*.pyc", ".pytest_cache", "tests"],
      ...(props?.extraHash && { extraHash: props.extraHash }),
    });

    this.imageUri = this.imageAsset.imageUri;
  }
}
