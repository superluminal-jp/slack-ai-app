import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { applyCostAllocationTags } from "../utils/cost-allocation-tags";
import { ExecutionAgentRuntime } from "./constructs/execution-agent-runtime";
import { ExecutionAgentEcr } from "./constructs/execution-agent-ecr";
import { DocSearchAgentRuntime } from "./constructs/doc-search-agent-runtime";
import { DocSearchAgentEcr } from "./constructs/doc-search-agent-ecr";
import { ExecutionStackProps } from "../types/stack-config";

/**
 * Execution Stack (Account B / Execution Zone)
 *
 * Purpose: Provides Execution Agents as AgentCore Runtimes (A2A-only). AI processing
 * runs in this zone; the Verification Stack invokes via AgentCore (SigV4). No API Gateway or SQS.
 *
 * Agents:
 * - Execution Agent: General AI (file generation, time, guidelines, URL fetch)
 * - Doc Search Agent: Documentation search and URL content retrieval
 *
 * Responsibilities:
 * - Build and publish container images (ECR) for both agents
 * - Create AgentCore Runtimes (A2A protocol) for both agents
 * - Expose ARNs for cross-stack reference (Verification Stack)
 *
 * Inputs: ExecutionStackProps (env, awsRegion, bedrockModelId, verificationAccountId,
 * executionAgentName, docSearchAgentName).
 *
 * Outputs: executionAgentArn, docSearchAgentArn (CfnOutputs); ECR and Runtime constructs.
 */
export class ExecutionStack extends cdk.Stack {
  /** AgentCore Runtime for Execution Agent */
  public readonly executionAgentRuntime: ExecutionAgentRuntime;

  /** AgentCore ECR image for Execution Agent */
  public readonly executionAgentEcr: ExecutionAgentEcr;

  /** AgentCore Runtime ARN for cross-stack reference (Verification Stack) */
  public readonly executionAgentArn: string;

  /** AgentCore Runtime for Doc Search Agent */
  public readonly docSearchAgentRuntime: DocSearchAgentRuntime;

  /** AgentCore ECR image for Doc Search Agent */
  public readonly docSearchAgentEcr: DocSearchAgentEcr;

  /** Doc Search Agent Runtime ARN for cross-stack reference (Verification Stack) */
  public readonly docSearchAgentArn: string;

  constructor(scope: Construct, id: string, props?: ExecutionStackProps) {
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

    // Runtime name must be unique per account (Dev and Prod coexist); default includes env from stack name
    const envSuffix = this.stackName.includes("-Prod") ? "Prod" : "Dev";
    const executionAgentName =
      props?.executionAgentName ||
      this.node.tryGetContext("executionAgentName") ||
      `SlackAI_ExecutionAgent_${envSuffix}`;

    const docSearchAgentName =
      props?.docSearchAgentName ||
      this.node.tryGetContext("docSearchAgentName") ||
      `SlackAI_DocSearchAgent_${envSuffix}`;

    // ECR must be created before Runtime (Runtime requires containerImageUri from ECR)
    // Optional: forceExecutionImageRebuild (e.g. timestamp) forces new image build for tool/code updates
    const forceRebuild =
      this.node.tryGetContext("forceExecutionImageRebuild") as
        | string
        | undefined;
    this.executionAgentEcr = new ExecutionAgentEcr(this, "ExecutionAgentEcr", {
      ...(forceRebuild && { extraHash: forceRebuild }),
    });

    this.docSearchAgentEcr = new DocSearchAgentEcr(
      this,
      "DocSearchAgentEcr",
      {
        ...(forceRebuild && { extraHash: forceRebuild }),
      }
    );

    const bedrockModelId =
      props?.bedrockModelId ||
      this.node.tryGetContext("bedrockModelId") ||
      "";

    // Execution Agent Runtime (general AI processing)
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

    // Doc Search Agent Runtime (documentation search)
    this.docSearchAgentRuntime = new DocSearchAgentRuntime(
      this,
      "DocSearchAgentRuntime",
      {
        agentRuntimeName: docSearchAgentName,
        containerImageUri: this.docSearchAgentEcr.imageUri,
        bedrockModelId: bedrockModelId || undefined,
        awsRegion: awsRegion,
        verificationAccountId: verificationAccountId || undefined,
      }
    );

    this.docSearchAgentArn = this.docSearchAgentRuntime.runtimeArn;

    // CfnOutputs for cross-stack reference
    new cdk.CfnOutput(this, "ExecutionAgentRuntimeArn", {
      value: this.executionAgentRuntime.runtimeArn,
      description:
        "Execution Agent AgentCore Runtime ARN (for Verification Stack configuration)",
      exportName: `${this.stackName}-ExecutionAgentArn`,
    });

    new cdk.CfnOutput(this, "DocSearchAgentRuntimeArn", {
      value: this.docSearchAgentRuntime.runtimeArn,
      description:
        "Doc Search Agent AgentCore Runtime ARN (for Verification Stack configuration)",
      exportName: `${this.stackName}-DocSearchAgentArn`,
    });
  }
}
