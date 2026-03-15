import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { applyCostAllocationTags } from "@slack-ai-app/cdk-tooling";
import { SlackSearchAgentRuntime } from "./constructs/slack-search-agent-runtime";
import { SlackSearchAgentEcr } from "./constructs/slack-search-agent-ecr";
import { SlackSearchAgentStackProps } from "./types/stack-config";

/**
 * Slack Search Agent Stack (Verification Zone)
 */
export class SlackSearchAgentStack extends cdk.Stack {
  public readonly slackSearchAgentRuntime: SlackSearchAgentRuntime;
  public readonly slackSearchAgentEcr: SlackSearchAgentEcr;
  public readonly slackSearchAgentArn: string;

  constructor(scope: Construct, id: string, props?: SlackSearchAgentStackProps) {
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

    const slackSearchAgentName =
      props?.slackSearchAgentName ||
      this.node.tryGetContext("slackSearchAgentName") ||
      `SlackAI_SlackSearch_${this.stackName.includes("-Prod") ? "Prod" : "Dev"}`;

    const forceRebuild =
      this.node.tryGetContext("forceSlackSearchImageRebuild") as string | undefined;
    this.slackSearchAgentEcr = new SlackSearchAgentEcr(this, "SlackSearchAgentEcr", {
      ...(forceRebuild && { extraHash: forceRebuild }),
    });

    const bedrockModelId =
      props?.bedrockModelId || this.node.tryGetContext("bedrockModelId") || "";

    this.slackSearchAgentRuntime = new SlackSearchAgentRuntime(this, "SlackSearchAgentRuntime", {
      agentRuntimeName: slackSearchAgentName,
      containerImageUri: this.slackSearchAgentEcr.imageUri,
      bedrockModelId: bedrockModelId || undefined,
      awsRegion: awsRegion,
      verificationAccountId: verificationAccountId || undefined,
    });

    this.slackSearchAgentArn = this.slackSearchAgentRuntime.runtimeArn;

    new cdk.CfnOutput(this, "SlackSearchAgentRuntimeArn", {
      value: this.slackSearchAgentRuntime.runtimeArn,
      description: "Slack Search Agent AgentCore Runtime ARN (for Verification Agent configuration)",
      exportName: `${this.stackName}-SlackSearchAgentArn`,
    });
  }
}
