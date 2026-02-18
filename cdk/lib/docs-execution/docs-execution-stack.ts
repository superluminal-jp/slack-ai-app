import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { applyCostAllocationTags } from "../utils/cost-allocation-tags";
import { DocsAgentRuntime } from "./constructs/docs-agent-runtime";
import { DocsAgentEcr } from "./constructs/docs-agent-ecr";
import { DocsExecutionStackProps } from "../types/stack-config";

/**
 * Docs Execution Stack (Account B / Docs Execution Zone)
 */
export class DocsExecutionStack extends cdk.Stack {
  /** AgentCore Runtime for Docs Agent */
  public readonly docsAgentRuntime: DocsAgentRuntime;

  /** AgentCore ECR image for Docs Agent */
  public readonly docsAgentEcr: DocsAgentEcr;

  /** AgentCore Runtime ARN for cross-stack reference */
  public readonly docsAgentArn: string;

  constructor(scope: Construct, id: string, props?: DocsExecutionStackProps) {
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
      props?.bedrockModelId ||
      this.node.tryGetContext("bedrockModelId") ||
      "";

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
      description:
        "Docs Agent AgentCore Runtime ARN (for Verification Stack configuration)",
      exportName: `${this.stackName}-DocsAgentArn`,
    });
  }
}
