import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { applyCostAllocationTags } from "@slack-ai-app/cdk-tooling";
import { ExecutionAgentRuntime } from "./constructs/execution-agent-runtime";
import { ExecutionAgentEcr } from "./constructs/execution-agent-ecr";
import { ExecutionAgentStackProps } from "./types/stack-config";

/**
 * Execution Agent Stack (Execution Zone)
 *
 * Provides the Execution Agent as an AgentCore Runtime (A2A-only).
 */
export class ExecutionAgentStack extends cdk.Stack {
  public readonly executionAgentRuntime: ExecutionAgentRuntime;
  public readonly executionAgentEcr: ExecutionAgentEcr;
  public readonly executionAgentArn: string;

  constructor(scope: Construct, id: string, props?: ExecutionAgentStackProps) {
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

    const executionAgentName =
      props?.executionAgentName ||
      this.node.tryGetContext("executionAgentName") ||
      `SlackAI_ExecutionAgent_${this.stackName.includes("-Prod") ? "Prod" : "Dev"}`;

    const forceRebuild =
      this.node.tryGetContext("forceExecutionImageRebuild") as string | undefined;
    this.executionAgentEcr = new ExecutionAgentEcr(this, "ExecutionAgentEcr", {
      ...(forceRebuild && { extraHash: forceRebuild }),
    });

    const bedrockModelId =
      props?.bedrockModelId ||
      this.node.tryGetContext("bedrockModelId") ||
      "";

    this.executionAgentRuntime = new ExecutionAgentRuntime(
      this,
      "ExecutionAgentRuntime",
      {
        agentRuntimeName: executionAgentName,
        containerImageUri: this.executionAgentEcr.imageUri,
        bedrockModelId: bedrockModelId || undefined,
        awsRegion: awsRegion,
        verificationAccountId: verificationAccountId || undefined,
      }
    );

    this.executionAgentArn = this.executionAgentRuntime.runtimeArn;

    new cdk.CfnOutput(this, "ExecutionAgentRuntimeArn", {
      value: this.executionAgentRuntime.runtimeArn,
      description: "Execution Agent AgentCore Runtime ARN (for Verification Stack configuration)",
      exportName: `${this.stackName}-ExecutionAgentArn`,
    });
  }
}
