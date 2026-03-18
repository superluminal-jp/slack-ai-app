/**
 * Slack Search Agent AgentCore Runtime construct.
 *
 * @module verification-zones/slack-search-agent/cdk/lib/constructs/slack-search-agent-runtime
 */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { getCostAllocationTagValues } from "@slack-ai-app/cdk-tooling";
import { NagSuppressions } from "cdk-nag";

export interface AgentCoreLifecycleConfig {
  readonly idleRuntimeSessionTimeoutSeconds?: number;
  readonly maxLifetimeSeconds?: number;
}

export interface SlackSearchAgentRuntimeProps {
  readonly agentRuntimeName: string;
  readonly containerImageUri: string;
  readonly lifecycleConfiguration?: AgentCoreLifecycleConfig;
  readonly bedrockModelId?: string;
  readonly awsRegion?: string;
  readonly verificationAccountId?: string;
}

export class SlackSearchAgentRuntime extends Construct {
  public readonly runtime: cdk.CfnResource;
  public readonly executionRole: iam.Role;
  public readonly runtimeArn: string;

  constructor(scope: Construct, id: string, props: SlackSearchAgentRuntimeProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    this.executionRole = new iam.Role(this, "ExecutionRole", {
      roleName: `${stack.stackName}-ExecutionRole`,
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com", {
        conditions: {
          StringEquals: { "aws:SourceAccount": stack.account },
          ArnLike: {
            "aws:SourceArn": `arn:aws:bedrock-agentcore:${stack.region}:${stack.account}:*`,
          },
        },
      }),
      description: "Execution role for Slack Search Agent AgentCore Runtime",
    });

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ECRImageAccess",
        effect: iam.Effect.ALLOW,
        actions: ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:GetAuthorizationToken"],
        resources: ["*"],
      })
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CloudWatchLogs",
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents",
          "logs:DescribeLogGroups", "logs:DescribeLogStreams",
        ],
        resources: [`arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/bedrock-agentcore/*`],
      })
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "XRayTracing",
        effect: iam.Effect.ALLOW,
        actions: [
          "xray:PutTraceSegments", "xray:PutTelemetryRecords",
          "xray:GetSamplingRules", "xray:GetSamplingTargets", "xray:GetSamplingStatisticSummaries",
        ],
        resources: ["*"],
      })
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CloudWatchMetrics",
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
        conditions: {
          StringLike: { "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"] },
        },
      })
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "BedrockInvokeModel",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          `arn:aws:bedrock:${stack.region}::foundation-model/*`,
          `arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/*`,
        ],
      })
    );

    NagSuppressions.addResourceSuppressions(
      this.executionRole,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "ECR GetAuthorizationToken requires resource:* (AWS service constraint, cannot be scoped to a repo ARN). " +
            "X-Ray trace and sampling APIs do not support resource-level restrictions. " +
            "CloudWatch PutMetricData requires resource:* (namespace scoped via condition key). " +
            "CloudWatch Logs scoped to /aws/bedrock-agentcore/ prefix. " +
            "Bedrock uses foundation-model/* and inference-profile/* ARN patterns (AWS ARN schema, version wildcard).",
        },
      ],
      true,
    );

    this.runtime = new cdk.CfnResource(this, "Runtime", {
      type: "AWS::BedrockAgentCore::Runtime",
      properties: {
        AgentRuntimeName: props.agentRuntimeName,
        RoleArn: this.executionRole.roleArn,
        ProtocolConfiguration: "A2A",
        AgentRuntimeArtifact: {
          ContainerConfiguration: { ContainerUri: props.containerImageUri },
        },
        NetworkConfiguration: { NetworkMode: "PUBLIC" },
      },
    });

    const deploymentEnv =
      (this.node.tryGetContext("deploymentEnv") as string | undefined) ??
      process.env.DEPLOYMENT_ENV ??
      "dev";
    this.runtime.addPropertyOverride(
      "Tags",
      getCostAllocationTagValues({
        deploymentEnv: String(deploymentEnv).toLowerCase().trim(),
        stackName: stack.stackName,
      })
    );

    if (props.lifecycleConfiguration) {
      const lc = props.lifecycleConfiguration;
      const idle = lc.idleRuntimeSessionTimeoutSeconds ?? 900;
      const maxLt = lc.maxLifetimeSeconds ?? 28800;
      this.runtime.addPropertyOverride("LifecycleConfiguration", {
        IdleRuntimeSessionTimeout: Math.max(60, Math.min(28800, idle)),
        MaxLifetime: Math.max(60, Math.min(28800, maxLt)),
      });
    }

    const environmentVariables: Record<string, string> = {};
    if (props.awsRegion) environmentVariables.AWS_REGION_NAME = props.awsRegion;
    if (props.bedrockModelId) environmentVariables.BEDROCK_MODEL_ID = props.bedrockModelId;
    if (Object.keys(environmentVariables).length > 0) {
      this.runtime.addPropertyOverride("EnvironmentVariables", environmentVariables);
    }

    const defaultPolicy = this.executionRole.node.tryFindChild("DefaultPolicy");
    const policyCfn = defaultPolicy?.node.defaultChild;
    if (policyCfn && cdk.CfnResource.isCfnResource(policyCfn)) {
      this.runtime.addDependency(policyCfn);
    }

    this.runtimeArn = this.runtime.getAtt("AgentRuntimeArn").toString();

    if (props.verificationAccountId) {
      new cdk.CfnOutput(this, "SlackSearchRuntimeArn", {
        description: "Slack Search Agent AgentCore Runtime ARN; resource policy applied via deploy script",
        value: this.runtimeArn,
        exportName: `${stack.stackName}-SlackSearchRuntimeArn`,
      });
    }
  }
}
