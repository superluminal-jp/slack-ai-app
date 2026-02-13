import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ExecutionAgentRuntime } from "./constructs/execution-agent-runtime";
import { ExecutionAgentEcr } from "./constructs/execution-agent-ecr";
import { ExecutionStackProps } from "../types/stack-config";

/**
 * Execution Stack (Account B / Execution Zone)
 *
 * Purpose: Provides the Execution Agent as an AgentCore Runtime (A2A-only). AI processing
 * runs in this zone; the Verification Stack invokes it via AgentCore (SigV4). No API Gateway or SQS.
 *
 * Responsibilities:
 * - Build and publish Execution Agent container image (ECR)
 * - Create AgentCore Runtime for the Execution Agent (A2A protocol)
 * - Expose Execution Agent ARN for cross-stack reference (Verification Stack)
 *
 * Inputs: ExecutionStackProps (env, awsRegion, bedrockModelId, verificationAccountId, executionAgentName);
 * context: deploymentEnv, awsRegion, bedrockModelId, verificationAccountId, executionAgentName.
 *
 * Outputs: executionAgentArn (CfnOutput ExecutionAgentRuntimeArn); executionAgentEcr; executionAgentRuntime.
 */
export class ExecutionStack extends cdk.Stack {
  /** AgentCore Runtime for Execution Agent */
  public readonly executionAgentRuntime: ExecutionAgentRuntime;

  /** AgentCore ECR image for Execution Agent */
  public readonly executionAgentEcr: ExecutionAgentEcr;

  /** AgentCore Runtime ARN for cross-stack reference (Verification Stack) */
  public readonly executionAgentArn: string;

  constructor(scope: Construct, id: string, props?: ExecutionStackProps) {
    super(scope, id, props);

    const deploymentEnvRaw =
      this.node.tryGetContext("deploymentEnv") ||
      process.env.DEPLOYMENT_ENV ||
      "dev";
    const deploymentEnv = deploymentEnvRaw.toLowerCase().trim();

    cdk.Tags.of(this).add("Environment", deploymentEnv);
    cdk.Tags.of(this).add("Project", "SlackAI");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
    cdk.Tags.of(this).add("StackName", this.stackName);

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
      "SlackAI_ExecutionAgent";

    // ECR must be created before Runtime (Runtime requires containerImageUri from ECR)
    this.executionAgentEcr = new ExecutionAgentEcr(this, "ExecutionAgentEcr");

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
        // Required for cross-account: resource policy allows Verification Stack account to invoke
        verificationAccountId: verificationAccountId || undefined,
      }
    );

    this.executionAgentArn = this.executionAgentRuntime.runtimeArn;

    new cdk.CfnOutput(this, "ExecutionAgentRuntimeArn", {
      value: this.executionAgentRuntime.runtimeArn,
      description:
        "Execution Agent AgentCore Runtime ARN (for Verification Stack configuration)",
      exportName: `${this.stackName}-ExecutionAgentArn`,
    });
  }
}
