/**
 * CDK Construct for Execution Agent AgentCore Runtime.
 *
 * Creates an Amazon Bedrock AgentCore Runtime with A2A protocol,
 * ARM64 container configuration, SigV4 authentication, and IAM
 * execution role with Bedrock, ECR, CloudWatch, and X-Ray permissions.
 *
 * @module cdk/lib/execution/constructs/execution-agent-runtime
 */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

/** Lifecycle configuration for AgentCore Runtime (optional). See specs/026 research.md §2. */
export interface AgentCoreLifecycleConfig {
  /** Idle session timeout in seconds (60–28800). Default: 900. */
  readonly idleRuntimeSessionTimeoutSeconds?: number;
  /** Max instance lifetime in seconds (60–28800). Default: 28800. */
  readonly maxLifetimeSeconds?: number;
}

export interface ExecutionAgentRuntimeProps {
  /** Name for the AgentCore Runtime */
  readonly agentRuntimeName: string;
  /** ECR container image URI (including tag) */
  readonly containerImageUri: string;
  /** Lifecycle configuration (optional). Omit to use platform defaults. */
  readonly lifecycleConfiguration?: AgentCoreLifecycleConfig;
  /** Bedrock model ID (BEDROCK_MODEL_ID env) */
  readonly bedrockModelId?: string;
  /** AWS Region (AWS_REGION_NAME env) */
  readonly awsRegion?: string;
  /** Account ID of the Verification Zone (for cross-account resource policy) */
  readonly verificationAccountId?: string;
}

export class ExecutionAgentRuntime extends Construct {
  /** The AgentCore Runtime CFN resource */
  public readonly runtime: cdk.CfnResource;
  /** AgentCore auto-creates DEFAULT endpoint; we do not create it in CFn (would conflict) */
  public readonly endpoint: cdk.CfnResource | undefined = undefined;
  /** The IAM execution role for the AgentCore Runtime */
  public readonly executionRole: iam.Role;
  /** The ARN of the AgentCore Runtime */
  public readonly runtimeArn: string;

  constructor(scope: Construct, id: string, props: ExecutionAgentRuntimeProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    // Create IAM execution role for AgentCore Runtime
    // Trust policy: bedrock-agentcore.amazonaws.com
    this.executionRole = new iam.Role(this, "ExecutionRole", {
      roleName: `${props.agentRuntimeName}-ExecutionRole`,
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
        "Execution role for Execution Agent AgentCore Runtime with Bedrock, ECR, CloudWatch, and X-Ray permissions",
    });

    // ECR permissions for container image retrieval
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

    // CloudWatch Logs permissions
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

    // X-Ray tracing permissions
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

    // CloudWatch Metrics permissions
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

    // Bedrock InvokeModel permissions for AI processing.
    // 026 US1: Per AWS docs, foundation-model ARN scoping is supported
    // (arn:aws:bedrock:region::foundation-model/model-id). CDK addToPolicy merges with
    // other statements; when using raw CFn/IAM, scope to foundation-model ARN for least privilege.
    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "BedrockInvokeModel",
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: ["*"],
      })
    );

    // Create AgentCore Runtime using L1 CfnResource
    // (CfnRuntime may not be available yet in all CDK versions)
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
        // Omit AuthorizerConfiguration: default is SigV4 for A2A
      },
    });
    if (props.lifecycleConfiguration) {
      const lc = props.lifecycleConfiguration;
      const idle = lc.idleRuntimeSessionTimeoutSeconds ?? 900;
      const maxLt = lc.maxLifetimeSeconds ?? 28800;
      this.runtime.addPropertyOverride("LifecycleConfiguration", {
        IdleRuntimeSessionTimeout: Math.max(60, Math.min(28800, idle)),
        MaxLifetime: Math.max(60, Math.min(28800, maxLt)),
      });
    }

    // EnvironmentVariables for container (BEDROCK_MODEL_ID, AWS_REGION_NAME)
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

    // Ensure Runtime is created after the role's IAM policy (ECR permissions)
    // so that Bedrock AgentCore validation of ECR URI succeeds
    const defaultPolicy = this.executionRole.node.tryFindChild("DefaultPolicy");
    const policyCfn = defaultPolicy?.node.defaultChild;
    if (policyCfn && cdk.CfnResource.isCfnResource(policyCfn)) {
      this.runtime.addDependency(policyCfn);
    }

    // Derive ARN from the runtime
    this.runtimeArn = this.runtime.getAtt("AgentRuntimeArn").toString();

    // Do NOT create RuntimeEndpoint in CFn: Bedrock AgentCore auto-creates DEFAULT when Runtime is created.
    // Creating it here causes "An endpoint with the specified name already exists" (409).

    // ─── Cross-Account Resource-Based Policy (AWS best practice) ───
    // Per AWS docs: cross-account access requires resource-based policies on BOTH
    // the Agent Runtime and the Agent Endpoint; if either lacks an allow, the request is denied.
    // CloudFormation does not yet support RuntimeResourcePolicy as a native resource, so we
    // apply policy using bedrock-agentcore-control PutResourcePolicy via AwsCustomResource.
    // See specs/015-agentcore-a2a-migration/VALIDATION.md §5.1 for policy guidance.
    if (props.verificationAccountId) {
      const endpointArn = `arn:aws:bedrock-agentcore:${stack.region}:${stack.account}:runtime-endpoint/${props.agentRuntimeName}/DEFAULT`;

      const resourcePolicy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowVerificationAccountInvoke",
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${props.verificationAccountId}:root`,
            },
            Action: "bedrock-agentcore:InvokeAgentRuntime",
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:SourceAccount": props.verificationAccountId,
              },
            },
          },
        ],
      });

      const putPolicyPermissions = cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "bedrock-agentcore-control:PutResourcePolicy",
            "bedrock-agentcore-control:DeleteResourcePolicy",
          ],
          resources: [this.runtimeArn, endpointArn],
        }),
      ]);

      const runtimePolicy = new cr.AwsCustomResource(this, "ExecutionRuntimePolicy", {
        policy: putPolicyPermissions,
        onCreate: {
          service: "BedrockAgentCoreControl",
          action: "putResourcePolicy",
          parameters: {
            resourceArn: this.runtimeArn,
            policy: resourcePolicy,
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `${props.agentRuntimeName}-runtime-policy`
          ),
        },
        onUpdate: {
          service: "BedrockAgentCoreControl",
          action: "putResourcePolicy",
          parameters: {
            resourceArn: this.runtimeArn,
            policy: resourcePolicy,
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `${props.agentRuntimeName}-runtime-policy`
          ),
        },
        onDelete: {
          service: "BedrockAgentCoreControl",
          action: "deleteResourcePolicy",
          parameters: {
            resourceArn: this.runtimeArn,
          },
          ignoreErrorCodesMatching: "ResourceNotFoundException",
        },
      });
      runtimePolicy.node.addDependency(this.runtime);

      const endpointPolicy = new cr.AwsCustomResource(this, "ExecutionEndpointPolicy", {
        policy: putPolicyPermissions,
        onCreate: {
          service: "BedrockAgentCoreControl",
          action: "putResourcePolicy",
          parameters: {
            resourceArn: endpointArn,
            policy: resourcePolicy,
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `${props.agentRuntimeName}-endpoint-policy`
          ),
        },
        onUpdate: {
          service: "BedrockAgentCoreControl",
          action: "putResourcePolicy",
          parameters: {
            resourceArn: endpointArn,
            policy: resourcePolicy,
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `${props.agentRuntimeName}-endpoint-policy`
          ),
        },
        onDelete: {
          service: "BedrockAgentCoreControl",
          action: "deleteResourcePolicy",
          parameters: {
            resourceArn: endpointArn,
          },
          ignoreErrorCodesMatching: "ResourceNotFoundException",
        },
      });
      endpointPolicy.node.addDependency(this.runtime);

      new cdk.CfnOutput(this, "ExecutionRuntimeArn", {
        description: "AgentCore Runtime ARN with cross-account resource policy",
        value: this.runtimeArn,
        exportName: `${stack.stackName}-ExecutionRuntimeArn`,
      });
      new cdk.CfnOutput(this, "ExecutionEndpointArn", {
        description: "AgentCore Runtime Endpoint ARN with cross-account resource policy",
        value: endpointArn,
        exportName: `${stack.stackName}-ExecutionEndpointArn`,
      });
    }
  }
}
