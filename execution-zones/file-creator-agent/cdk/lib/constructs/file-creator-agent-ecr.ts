/**
 * File Creator Agent ECR Docker Image construct.
 *
 * @module execution-zones/execution-agent/cdk/lib/constructs/file-creator-agent-ecr
 */

import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import { resolveZoneSrcDir } from "@slack-ai-app/cdk-tooling";

export interface FileCreatorAgentEcrProps {
  /** Optional: Override the path to the Dockerfile directory */
  readonly dockerfilePath?: string;
  /** Optional: Force image rebuild by changing asset hash */
  readonly extraHash?: string;
}

export class FileCreatorAgentEcr extends Construct {
  /** The Docker image asset (includes ECR repo and image URI) */
  public readonly imageAsset: DockerImageAsset;
  /** The ECR image URI for use in AgentCore Runtime ContainerUri */
  public readonly imageUri: string;

  constructor(scope: Construct, id: string, props?: FileCreatorAgentEcrProps) {
    super(scope, id);

    const dockerDir = props?.dockerfilePath ?? resolveZoneSrcDir(__dirname);

    this.imageAsset = new DockerImageAsset(this, "Image", {
      directory: dockerDir,
      platform: Platform.LINUX_ARM64,
      exclude: ["__pycache__", "*.pyc", ".pytest_cache", "tests"],
      ...(props?.extraHash && { extraHash: props.extraHash }),
    });

    this.imageUri = this.imageAsset.imageUri;
  }
}
