/**
 * Slack Search Agent ECR Docker Image construct.
 *
 * @module verification-zones/slack-search-agent/cdk/lib/constructs/slack-search-agent-ecr
 */

import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import { resolveZoneSrcDir } from "@slack-ai-app/cdk-tooling";

export interface SlackSearchAgentEcrProps {
  readonly dockerfilePath?: string;
  readonly extraHash?: string;
}

export class SlackSearchAgentEcr extends Construct {
  public readonly imageAsset: DockerImageAsset;
  public readonly imageUri: string;

  constructor(scope: Construct, id: string, props?: SlackSearchAgentEcrProps) {
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
