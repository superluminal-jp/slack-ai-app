import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { applyCostAllocationTags } from "@slack-ai-app/cdk-tooling";
import { WebFetchAgentRuntime } from "./constructs/web-fetch-agent-runtime";
import { WebFetchAgentEcr } from "./constructs/web-fetch-agent-ecr";
import { WebFetchAgentStackProps } from "./types/stack-config";

/**
 * Web Fetch Agent Stack (Execution Zone)
 *
 * Provides the Web Fetch Agent as an AgentCore Runtime (A2A-only).
 * Handles URL content retrieval via fetch_url tool.
 */
export class WebFetchAgentStack extends cdk.Stack {
  public readonly webFetchAgentRuntime: WebFetchAgentRuntime;
  public readonly webFetchAgentEcr: WebFetchAgentEcr;
  public readonly webFetchAgentArn: string;

  constructor(scope: Construct, id: string, props?: WebFetchAgentStackProps) {
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

    const webFetchAgentName =
      props?.webFetchAgentName ||
      this.node.tryGetContext("webFetchAgentName") ||
      `SlackAI_WebFetchAgent_${this.stackName.includes("-Prod") ? "Prod" : "Dev"}`;

    const forceRebuild =
      this.node.tryGetContext("forceWebFetchImageRebuild") as string | undefined;
    this.webFetchAgentEcr = new WebFetchAgentEcr(this, "WebFetchAgentEcr", {
      ...(forceRebuild && { extraHash: forceRebuild }),
    });

    const bedrockModelId =
      props?.bedrockModelId ||
      this.node.tryGetContext("bedrockModelId") ||
      "";

    this.webFetchAgentRuntime = new WebFetchAgentRuntime(
      this,
      "WebFetchAgentRuntime",
      {
        agentRuntimeName: webFetchAgentName,
        containerImageUri: this.webFetchAgentEcr.imageUri,
        bedrockModelId: bedrockModelId || undefined,
        awsRegion: awsRegion,
        verificationAccountId: verificationAccountId || undefined,
      }
    );

    this.webFetchAgentArn = this.webFetchAgentRuntime.runtimeArn;

    new cdk.CfnOutput(this, "WebFetchAgentRuntimeArn", {
      value: this.webFetchAgentRuntime.runtimeArn,
      description: "Web Fetch Agent AgentCore Runtime ARN (for Verification Stack configuration)",
      exportName: `${this.stackName}-WebFetchAgentArn`,
    });
  }
}
