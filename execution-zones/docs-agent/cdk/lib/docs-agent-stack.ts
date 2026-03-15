import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { applyCostAllocationTags } from "@slack-ai-app/cdk-tooling";
import { DocsAgentRuntime } from "./constructs/docs-agent-runtime";
import { DocsAgentEcr } from "./constructs/docs-agent-ecr";
import { DocsAgentStackProps } from "./types/stack-config";

/**
 * Docs Agent Stack (Docs Execution Zone)
 */
export class DocsAgentStack extends cdk.Stack {
  public readonly docsAgentRuntime: DocsAgentRuntime;
  public readonly docsAgentEcr: DocsAgentEcr;
  public readonly docsAgentArn: string;

  constructor(scope: Construct, id: string, props?: DocsAgentStackProps) {
    super(scope, id, props);

    const deploymentEnvRaw =
      this.node.tryGetContext("deploymentEnv") ||
      process.env.DEPLOYMENT_ENV ||
      "dev";
    const deploymentEnv = deploymentEnvRaw.toLowerCase().trim();

    applyCostAllocationTags(this, { deploymentEnv });

    const awsRegion =
      props?.awsRegion || this.node.tryGetContext("awsRegion") || "ap-northeast-1";
    const verificationAccountId =
      props?.verificationAccountId || this.node.tryGetContext("verificationAccountId") || "";

    const docsAgentName =
      props?.docsAgentName ||
      this.node.tryGetContext("docsAgentName") ||
      `SlackAI_DocsAgent_${this.stackName.includes("-Prod") ? "Prod" : "Dev"}`;

    const forceRebuild =
      this.node.tryGetContext("forceDocsImageRebuild") as string | undefined;
    this.docsAgentEcr = new DocsAgentEcr(this, "DocsAgentEcr", {
      ...(forceRebuild && { extraHash: forceRebuild }),
    });

    const bedrockModelId =
      props?.bedrockModelId || this.node.tryGetContext("bedrockModelId") || "";

    this.docsAgentRuntime = new DocsAgentRuntime(this, "DocsAgentRuntime", {
      agentRuntimeName: docsAgentName,
      containerImageUri: this.docsAgentEcr.imageUri,
      bedrockModelId: bedrockModelId || undefined,
      awsRegion: awsRegion,
      verificationAccountId: verificationAccountId || undefined,
    });

    this.docsAgentArn = this.docsAgentRuntime.runtimeArn;

    new cdk.CfnOutput(this, "DocsAgentRuntimeArn", {
      value: this.docsAgentRuntime.runtimeArn,
      description: "Docs Agent AgentCore Runtime ARN (for Verification Stack configuration)",
      exportName: `${this.stackName}-DocsAgentArn`,
    });
  }
}
