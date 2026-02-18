/**
 * Docs Agent AgentCore Runtime construct.
 */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { getCostAllocationTagValues } from "../../utils/cost-allocation-tags";

export interface AgentCoreLifecycleConfig {
  /** Idle session timeout in seconds (60–28800). Default: 900. */
  readonly idleRuntimeSessionTimeoutSeconds?: number;
  /** Max instance lifetime in seconds (60–28800). Default: 28800. */
  readonly maxLifetimeSeconds?: number;
}

export interface DocsAgentRuntimeProps {
  /** Name for the AgentCore Runtime */
  readonly agentRuntimeName: string;
  /** ECR container image URI (including tag) */
  readonly containerImageUri: string;
  /** Lifecycle configuration (optional). */
  readonly lifecycleConfiguration?: AgentCoreLifecycleConfig;
  /** Bedrock model ID (BEDROCK_MODEL_ID env) */
  readonly bedrockModelId?: string;
  /** AWS Region (AWS_REGION_NAME env) */
  readonly awsRegion?: string;
  /** Account ID of the Verification Zone (for cross-account resource policy) */
  readonly verificationAccountId?: string;
}

export class DocsAgentRuntime extends Construct {
  /** The AgentCore Runtime CFN resource */
  public readonly runtime: cdk.CfnResource;
  /** AgentCore auto-creates DEFAULT endpoint; we do not create it in CFn */
  public readonly endpoint: cdk.CfnResource | undefined = undefined;
  /** IAM execution role for AgentCore Runtime */
  public readonly executionRole: iam.Role;
  /** Runtime ARN */
  public readonly runtimeArn: string;

  constructor(scope: Construct, id: string, props: DocsAgentRuntimeProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    this.executionRole = new iam.Role(this, "ExecutionRole", {
      roleName: `${stack.stackName}-ExecutionRole`,
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com", {
        conditions: {
          StringEquals: {
            "aws:SourceAccount": stack.account,
          },
          ArnLike: {
            "aws:SourceArn": `arn:aws:bedrock-agentcore:${stack.region}:${stack.account}:*`,
          },
        },
      }),
      description:
        "Execution role for Docs Agent AgentCore Runtime with Bedrock, ECR, CloudWatch, and X-Ray permissions",
    });

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ECRImageAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:GetAuthorizationToken",
        ],
        resources: ["*"],
      })
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CloudWatchLogs",
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
        ],
        resources: [
          `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/bedrock-agentcore/*`,
        ],
      })
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "XRayTracing",
        effect: iam.Effect.ALLOW,
        actions: [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
          "xray:GetSamplingStatisticSummaries",
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
          StringLike: {
            "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"],
          },
        },
      })
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "BedrockInvokeModel",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: ["*"],
      })
    );

    this.runtime = new cdk.CfnResource(this, "Runtime", {
      type: "AWS::BedrockAgentCore::Runtime",
      properties: {
        AgentRuntimeName: props.agentRuntimeName,
        RoleArn: this.executionRole.roleArn,
        ProtocolConfiguration: "A2A",
        AgentRuntimeArtifact: {
          ContainerConfiguration: {
            ContainerUri: props.containerImageUri,
          },
        },
        NetworkConfiguration: {
          NetworkMode: "PUBLIC",
        },
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
    if (props.awsRegion) {
      environmentVariables.AWS_REGION_NAME = props.awsRegion;
    }
    if (props.bedrockModelId) {
      environmentVariables.BEDROCK_MODEL_ID = props.bedrockModelId;
    }
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
      const endpointArnStatic = `arn:aws:bedrock-agentcore:${stack.region}:${stack.account}:runtime-endpoint/${props.agentRuntimeName}/DEFAULT`;
      new cdk.CfnOutput(this, "DocsRuntimeArn", {
        description: "AgentCore Runtime ARN; resource policy applied via deploy script",
        value: this.runtimeArn,
        exportName: `${stack.stackName}-DocsRuntimeArn`,
      });
      new cdk.CfnOutput(this, "DocsEndpointArn", {
        description: "AgentCore Runtime Endpoint ARN; resource policy applied via deploy script",
        value: endpointArnStatic,
        exportName: `${stack.stackName}-DocsEndpointArn`,
      });
    }
  }
}
