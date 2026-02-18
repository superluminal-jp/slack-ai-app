/**
 * Docs Agent ECR Docker Image construct.
 */

import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import * as path from "path";

export interface DocsAgentEcrProps {
  /** Optional: Override path to Dockerfile directory */
  readonly dockerfilePath?: string;
  /** Optional: Force image rebuild by changing asset hash */
  readonly extraHash?: string;
}

export class DocsAgentEcr extends Construct {
  /** The Docker image asset (includes ECR repo and image URI) */
  public readonly imageAsset: DockerImageAsset;
  /** The ECR image URI for use in AgentCore Runtime ContainerUri */
  public readonly imageUri: string;

  constructor(scope: Construct, id: string, props?: DocsAgentEcrProps) {
    super(scope, id);

    const dockerDir =
      props?.dockerfilePath || path.join(__dirname, "../agent/docs-agent");

    this.imageAsset = new DockerImageAsset(this, "Image", {
      directory: dockerDir,
      platform: Platform.LINUX_ARM64,
      exclude: ["__pycache__", "*.pyc", ".pytest_cache", "tests"],
      ...(props?.extraHash && { extraHash: props.extraHash }),
    });

    this.imageUri = this.imageAsset.imageUri;
  }
}
