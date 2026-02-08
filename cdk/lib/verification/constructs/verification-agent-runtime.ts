/**
 * CDK Construct for Verification Agent AgentCore Runtime.
 *
 * Creates an Amazon Bedrock AgentCore Runtime with A2A protocol per AWS documentation:
 * - CreateAgentRuntime: https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_CreateAgentRuntime.html
 * - A2A protocol contract: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html
 * - Host agent or tools: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html
 *
 * A2A container: port 9000, ARM64 (see runtime-a2a-protocol-contract). EnvironmentVariables
 * are supported by CreateAgentRuntime and passed to the runtime environment (string-to-string map).
 *
 * @module cdk/lib/verification/constructs/verification-agent-runtime
 */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
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
  /** 018: When true, Verification Agent echoes task text to Slack and does not call Execution Agent */
  readonly validationZoneEchoMode?: boolean;
  /** 019: SQS queue for Slack post requests; Agent sends here instead of calling Slack API */
  readonly slackPostRequestQueue?: sqs.IQueue;
}

export class VerificationAgentRuntime extends Construct {
  /** The AgentCore Runtime CFN resource */
  public readonly runtime: cdk.CfnResource;
  /** AgentCore auto-creates DEFAULT endpoint; we do not create it in CFn */
  public readonly endpoint: cdk.CfnResource | undefined = undefined;
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

    // CreateAgentRuntime environmentVariables: "Environment variables to set in the AgentCore Runtime environment"
    // https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_CreateAgentRuntime.html
    const environmentVariables: Record<string, string> = {
      AWS_REGION_NAME: stack.region,
      DEDUPE_TABLE_NAME: props.dedupeTable.tableName,
      WHITELIST_TABLE_NAME: props.whitelistConfigTable.tableName,
      WHITELIST_SECRET_NAME: `${stack.stackName}/slack/whitelist-config`,
      RATE_LIMIT_TABLE_NAME: props.rateLimitTable.tableName,
      EXISTENCE_CHECK_CACHE_TABLE: props.existenceCheckCacheTable.tableName,
      RATE_LIMIT_PER_MINUTE: "10",
    };
    if (props.executionAgentArn) {
      environmentVariables.EXECUTION_AGENT_ARN = props.executionAgentArn;
    }
    if (props.validationZoneEchoMode === true) {
      environmentVariables.VALIDATION_ZONE_ECHO_MODE = "true";
    }
    if (props.slackPostRequestQueue) {
      environmentVariables.SLACK_POST_REQUEST_QUEUE_URL =
        props.slackPostRequestQueue.queueUrl;
      props.slackPostRequestQueue.grantSendMessages(this.executionRole);
    }

    // Create AgentCore Runtime using L1 CfnResource
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
    // EnvironmentVariables (string-to-string map) are in CreateAgentRuntime API but not in CDK L1 schema; applied at deploy time
    this.runtime.addPropertyOverride("EnvironmentVariables", environmentVariables);

    const defaultPolicy = this.executionRole.node.tryFindChild("DefaultPolicy");
    const policyCfn = defaultPolicy?.node.defaultChild;
    if (policyCfn && cdk.CfnResource.isCfnResource(policyCfn)) {
      this.runtime.addDependency(policyCfn);
    }

    // Derive ARN from the runtime
    this.runtimeArn = this.runtime.getAtt("AgentRuntimeArn").toString();

    // Do NOT create RuntimeEndpoint in CFn: AgentCore auto-creates DEFAULT (would conflict).
    this.endpoint = undefined;
  }
}
