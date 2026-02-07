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
import { Construct } from "constructs";

export interface ExecutionAgentRuntimeProps {
  /** Name for the AgentCore Runtime */
  readonly agentRuntimeName: string;
  /** ECR container image URI (including tag) */
  readonly containerImageUri: string;
  /** Account ID of the Verification Zone (for cross-account resource policy) */
  readonly verificationAccountId?: string;
}

export class ExecutionAgentRuntime extends Construct {
  /** The AgentCore Runtime CFN resource */
  public readonly runtime: cdk.CfnResource;
  /** The AgentCore Runtime Endpoint CFN resource */
  public readonly endpoint: cdk.CfnResource;
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
          StringEquals: {
            "cloudwatch:namespace": "bedrock-agentcore",
          },
        },
      })
    );

    // Bedrock InvokeModel permissions for AI processing
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
        ProtocolConfiguration: {
          ServerProtocol: "A2A",
        },
        ContainerConfiguration: {
          ContainerUri: props.containerImageUri,
        },
        NetworkConfiguration: {
          NetworkMode: "PUBLIC",
        },
        AuthorizerConfiguration: {
          AuthorizerType: "SIGV4",
        },
      },
    });

    // Derive ARN from the runtime
    this.runtimeArn = this.runtime.getAtt("AgentRuntimeArn").toString();

    // Create AgentCore Runtime Endpoint (DEFAULT)
    this.endpoint = new cdk.CfnResource(this, "Endpoint", {
      type: "AWS::BedrockAgentCore::RuntimeEndpoint",
      properties: {
        AgentRuntimeId: this.runtime.getAtt("AgentRuntimeId").toString(),
        Name: "DEFAULT",
        Description: `Default endpoint for ${props.agentRuntimeName}`,
      },
    });

    // Ensure endpoint is created after runtime
    this.endpoint.addDependency(this.runtime);

    // ─── Cross-Account Resource-Based Policy (T037) ───
    // If verificationAccountId is provided, add a resource-based policy
    // allowing the Verification Account to invoke this Runtime via SigV4
    if (props.verificationAccountId) {
      // Resource-based policy on the Runtime itself
      new cdk.CfnResource(this, "RuntimeResourcePolicy", {
        type: "AWS::BedrockAgentCore::RuntimeResourcePolicy",
        properties: {
          AgentRuntimeId: this.runtime.getAtt("AgentRuntimeId").toString(),
          Policy: JSON.stringify({
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
              },
            ],
          }),
        },
      }).addDependency(this.runtime);
    }
  }
}
