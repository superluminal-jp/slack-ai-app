/**
 * Docs Agent ECR Docker Image construct.
 *
 * @module execution-zones/docs-agent/cdk/lib/constructs/docs-agent-ecr
 */

import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import * as path from "path";

export interface DocsAgentEcrProps {
  readonly dockerfilePath?: string;
  readonly extraHash?: string;
}

export class DocsAgentEcr extends Construct {
  public readonly imageAsset: DockerImageAsset;
  public readonly imageUri: string;

  constructor(scope: Construct, id: string, props?: DocsAgentEcrProps) {
    super(scope, id);

    const dockerDir =
      props?.dockerfilePath ||
      path.join(__dirname, "../../../src");

    this.imageAsset = new DockerImageAsset(this, "Image", {
      directory: dockerDir,
      platform: Platform.LINUX_ARM64,
      exclude: ["__pycache__", "*.pyc", ".pytest_cache", "tests"],
      ...(props?.extraHash && { extraHash: props.extraHash }),
    });

    this.imageUri = this.imageAsset.imageUri;
  }
}
