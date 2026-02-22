import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { applyCostAllocationTags } from "@slack-ai-app/cdk-tooling";
import { FileCreatorAgentRuntime } from "./constructs/file-creator-agent-runtime";
import { FileCreatorAgentEcr } from "./constructs/file-creator-agent-ecr";
import { FileCreatorAgentStackProps } from "./types/stack-config";

/**
 * File Creator Agent Stack (Execution Zone)
 *
 * Provides the File Creator Agent as an AgentCore Runtime (A2A-only).
 */
export class FileCreatorAgentStack extends cdk.Stack {
  public readonly fileCreatorAgentRuntime: FileCreatorAgentRuntime;
  public readonly fileCreatorAgentEcr: FileCreatorAgentEcr;
  public readonly fileCreatorAgentArn: string;

  constructor(scope: Construct, id: string, props?: FileCreatorAgentStackProps) {
    super(scope, id, props);

    const deploymentEnvRaw =
      this.node.tryGetContext("deploymentEnv") ||
      process.env.DEPLOYMENT_ENV ||
      "dev";
    const deploymentEnv = deploymentEnvRaw.toLowerCase().trim();

    applyCostAllocationTags(this, { deploymentEnv });

    const awsRegion =
      props?.awsRegion ||
      this.node.tryGetContext("awsRegion") ||
      "ap-northeast-1";
    const verificationAccountId =
      props?.verificationAccountId ||
      this.node.tryGetContext("verificationAccountId") ||
      "";

    const fileCreatorAgentName =
      props?.fileCreatorAgentName ||
      this.node.tryGetContext("fileCreatorAgentName") ||
      `SlackAI_FileCreatorAgent_${this.stackName.includes("-Prod") ? "Prod" : "Dev"}`;

    const forceRebuild =
      this.node.tryGetContext("forceFileCreatorImageRebuild") as string | undefined;
    this.fileCreatorAgentEcr = new FileCreatorAgentEcr(this, "FileCreatorAgentEcr", {
      ...(forceRebuild && { extraHash: forceRebuild }),
    });

    const bedrockModelId =
      props?.bedrockModelId ||
      this.node.tryGetContext("bedrockModelId") ||
      "";

    this.fileCreatorAgentRuntime = new FileCreatorAgentRuntime(
      this,
      "FileCreatorAgentRuntime",
      {
        agentRuntimeName: fileCreatorAgentName,
        containerImageUri: this.fileCreatorAgentEcr.imageUri,
        bedrockModelId: bedrockModelId || undefined,
        awsRegion: awsRegion,
        verificationAccountId: verificationAccountId || undefined,
      }
    );

    this.fileCreatorAgentArn = this.fileCreatorAgentRuntime.runtimeArn;

    new cdk.CfnOutput(this, "FileCreatorAgentRuntimeArn", {
      value: this.fileCreatorAgentRuntime.runtimeArn,
      description: "File Creator Agent AgentCore Runtime ARN (for Verification Stack configuration)",
      exportName: `${this.stackName}-FileCreatorAgentArn`,
    });
  }
}
