/**
 * Time Agent ECR Docker Image construct.
 *
 * @module execution-zones/time-agent/cdk/lib/constructs/time-agent-ecr
 */

import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import { resolveZoneSrcDir } from "@slack-ai-app/cdk-tooling";

export interface TimeAgentEcrProps {
  readonly dockerfilePath?: string;
  readonly extraHash?: string;
}

export class TimeAgentEcr extends Construct {
  public readonly imageAsset: DockerImageAsset;
  public readonly imageUri: string;

  constructor(scope: Construct, id: string, props?: TimeAgentEcrProps) {
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
