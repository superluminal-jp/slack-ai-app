/**
 * CDK Construct for Verification Agent AgentCore Runtime.
 *
 * Creates an Amazon Bedrock AgentCore Runtime with A2A protocol,
 * ARM64 container configuration, SigV4 authentication, and IAM
 * execution role with ECR, CloudWatch, X-Ray, DynamoDB (5 tables),
 * Secrets Manager, and bedrock-agentcore:InvokeAgentRuntime permissions.
 *
 * @module cdk/lib/verification/constructs/verification-agent-runtime
 */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface VerificationAgentRuntimeProps {
  /** Name for the AgentCore Runtime */
  readonly agentRuntimeName: string;
  /** ECR container image URI (including tag) */
  readonly containerImageUri: string;
  /** DynamoDB tables for security validation */
  readonly tokenTable: dynamodb.ITable;
  readonly dedupeTable: dynamodb.ITable;
  readonly existenceCheckCacheTable: dynamodb.ITable;
  readonly whitelistConfigTable: dynamodb.ITable;
  readonly rateLimitTable: dynamodb.ITable;
  /** Secrets Manager secrets */
  readonly slackSigningSecret: secretsmanager.ISecret;
  readonly slackBotTokenSecret: secretsmanager.ISecret;
  /** ARN of the Execution Agent Runtime (for A2A invocation) */
  readonly executionAgentArn?: string;
}

export class VerificationAgentRuntime extends Construct {
  /** The AgentCore Runtime CFN resource */
  public readonly runtime: cdk.CfnResource;
  /** The AgentCore Runtime Endpoint CFN resource */
  public readonly endpoint: cdk.CfnResource;
  /** The IAM execution role for the AgentCore Runtime */
  public readonly executionRole: iam.Role;
  /** The ARN of the AgentCore Runtime */
  public readonly runtimeArn: string;

  constructor(
    scope: Construct,
    id: string,
    props: VerificationAgentRuntimeProps
  ) {
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
        "Execution role for Verification Agent AgentCore Runtime with DynamoDB, Secrets Manager, and AgentCore invoke permissions",
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

    // DynamoDB permissions for 5 security tables
    props.tokenTable.grantReadWriteData(this.executionRole);
    props.dedupeTable.grantReadWriteData(this.executionRole);
    props.existenceCheckCacheTable.grantReadWriteData(this.executionRole);
    props.whitelistConfigTable.grantReadData(this.executionRole); // Read-only for security
    props.rateLimitTable.grantReadWriteData(this.executionRole);

    // Secrets Manager permissions
    props.slackSigningSecret.grantRead(this.executionRole);
    props.slackBotTokenSecret.grantRead(this.executionRole);

    // Whitelist config secret permission
    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SecretsManagerWhitelist",
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${stack.region}:${stack.account}:secret:${stack.stackName}/slack/whitelist-config*`,
        ],
      })
    );

    // AgentCore InvokeAgentRuntime permission (for calling Execution Agent)
    // Supports cross-account: scoped to specific Execution Agent ARN when provided
    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AgentCoreInvoke",
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock-agentcore:InvokeAgentRuntime",
          "bedrock-agentcore:GetAsyncTaskResult",
        ],
        // Scope to specific Execution Agent ARN if provided, otherwise wildcard
        // Cross-account: ARN includes the Execution Account's account ID
        resources: props.executionAgentArn
          ? [props.executionAgentArn]
          : [
              `arn:aws:bedrock-agentcore:${stack.region}:*:runtime/*`,
            ],
      })
    );

    // Create AgentCore Runtime using L1 CfnResource
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
  }
}
