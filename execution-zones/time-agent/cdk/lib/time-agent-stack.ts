import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { applyCostAllocationTags } from "@slack-ai-app/cdk-tooling";
import { TimeAgentRuntime } from "./constructs/time-agent-runtime";
import { TimeAgentEcr } from "./constructs/time-agent-ecr";
import { TimeAgentStackProps } from "./types/stack-config";

/**
 * Time Agent Stack (Time Execution Zone)
 */
export class TimeAgentStack extends cdk.Stack {
  public readonly timeAgentRuntime: TimeAgentRuntime;
  public readonly timeAgentEcr: TimeAgentEcr;
  public readonly timeAgentArn: string;

  constructor(scope: Construct, id: string, props?: TimeAgentStackProps) {
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

    const timeAgentName =
      props?.timeAgentName ||
      this.node.tryGetContext("timeAgentName") ||
      `SlackAI_TimeAgent_${this.stackName.includes("-Prod") ? "Prod" : "Dev"}`;

    const forceRebuild =
      this.node.tryGetContext("forceTimeImageRebuild") as string | undefined;
    this.timeAgentEcr = new TimeAgentEcr(this, "TimeAgentEcr", {
      ...(forceRebuild && { extraHash: forceRebuild }),
    });

    const bedrockModelId =
      props?.bedrockModelId || this.node.tryGetContext("bedrockModelId") || "";

    this.timeAgentRuntime = new TimeAgentRuntime(this, "TimeAgentRuntime", {
      agentRuntimeName: timeAgentName,
      containerImageUri: this.timeAgentEcr.imageUri,
      bedrockModelId: bedrockModelId || undefined,
      awsRegion: awsRegion,
      verificationAccountId: verificationAccountId || undefined,
    });

    this.timeAgentArn = this.timeAgentRuntime.runtimeArn;

    new cdk.CfnOutput(this, "TimeAgentRuntimeArn", {
      value: this.timeAgentRuntime.runtimeArn,
      description: "Time Agent AgentCore Runtime ARN (for Verification Stack configuration)",
      exportName: `${this.stackName}-TimeAgentArn`,
    });
  }
}
