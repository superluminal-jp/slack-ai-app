/**
 * Verification Agent AgentCore Runtime construct.
 *
 * Purpose: Create an Amazon Bedrock AgentCore Runtime (A2A protocol) for the Verification Agent.
 * Invokes Execution Agent via A2A; receives Slack events from SlackEventHandler (or AgentInvoker).
 *
 * Responsibilities: Create Runtime CFN resource, IAM role, grant DynamoDB/Secrets/S3/SQS; optional
 * error debug log group and file-exchange bucket. A2A container port 9000, ARM64.
 *
 * Inputs: VerificationAgentRuntimeProps (agentRuntimeName, containerImageUri, DynamoDB tables,
 * secrets, executionAgentArn, optional slackPostRequestQueue, errorDebugLogGroup, fileExchangeBucket).
 *
 * Outputs: runtime, executionRole, runtimeArn (verificationAgentRuntimeArn).
 *
 * @module cdk/lib/verification/constructs/verification-agent-runtime
 */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { getCostAllocationTagValues } from "../../utils/cost-allocation-tags";

/** Lifecycle configuration for AgentCore Runtime (optional). See research.md §2. */
export interface AgentCoreLifecycleConfig {
  /** Idle session timeout in seconds (60–28800). Default: 900. */
  readonly idleRuntimeSessionTimeoutSeconds?: number;
  /** Max instance lifetime in seconds (60–28800). Default: 28800. */
  readonly maxLifetimeSeconds?: number;
}

export interface VerificationAgentRuntimeProps {
  /** Name for the AgentCore Runtime */
  readonly agentRuntimeName: string;
  /** ECR container image URI (including tag) */
  readonly containerImageUri: string;
  /** Lifecycle configuration (optional). Omit to use platform defaults. */
  readonly lifecycleConfiguration?: AgentCoreLifecycleConfig;
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
/** 019: SQS queue for Slack post requests; Agent sends here instead of calling Slack API */
  readonly slackPostRequestQueue?: sqs.IQueue;
  /** CloudWatch Log group for execution error debug (troubleshooting) */
  readonly errorDebugLogGroup?: logs.ILogGroup;
  /** S3 bucket for temporary file exchange between zones (024) */
  readonly fileExchangeBucket?: s3.IBucket;
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

    // Create IAM execution role for AgentCore Runtime (roleName unique per account; use stack name so Dev/Prod do not collide)
    // Trust policy: bedrock-agentcore.amazonaws.com
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
          StringLike: {
            "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"],
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

    // AgentCore InvokeAgentRuntime permission (for calling Execution Agent).
    // AWS requires identity-based policy to allow the action on BOTH the agent runtime and
    // the agent endpoint (see resource-based-policies.html "Hierarchical authorization").
    // Include both endpoint ARN forms: ...:runtime-endpoint/Name/DEFAULT and
    // ...:runtime/Name/runtime-endpoint/DEFAULT (latter is used at evaluation per AccessDenied message).
    const invokeResources = props.executionAgentArn
      ? (() => {
          const runtimeArn = props.executionAgentArn;
          const endpointArnDoc =
            runtimeArn.replace(/:runtime\//, ":runtime-endpoint/") + "/DEFAULT";
          const endpointArnAlt = `${runtimeArn}/runtime-endpoint/DEFAULT`;
          return [runtimeArn, endpointArnDoc, endpointArnAlt];
        })()
      : [`arn:aws:bedrock-agentcore:${stack.region}:*:runtime/*`];
    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AgentCoreInvoke",
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock-agentcore:InvokeAgentRuntime",
          "bedrock-agentcore:GetAsyncTaskResult",
        ],
        resources: invokeResources,
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
if (props.slackPostRequestQueue) {
      environmentVariables.SLACK_POST_REQUEST_QUEUE_URL =
        props.slackPostRequestQueue.queueUrl;
      props.slackPostRequestQueue.grantSendMessages(this.executionRole);
    }
    if (props.errorDebugLogGroup) {
      environmentVariables.EXECUTION_AGENT_ERROR_LOG_GROUP =
        props.errorDebugLogGroup.logGroupName;
      props.errorDebugLogGroup.grantWrite(this.executionRole);
    }
    if (props.fileExchangeBucket) {
      environmentVariables.FILE_EXCHANGE_BUCKET =
        props.fileExchangeBucket.bucketName;
      environmentVariables.FILE_EXCHANGE_PREFIX = "attachments/";
      environmentVariables.PRESIGNED_URL_EXPIRY = "900";
      props.fileExchangeBucket.grantReadWrite(this.executionRole, "attachments/*");
      props.fileExchangeBucket.grantDelete(this.executionRole, "attachments/*");
      props.fileExchangeBucket.grantReadWrite(this.executionRole, "generated_files/*");
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
    // L1 CfnResource does not receive stack-level Tags from CDK aspect; set explicitly for cost allocation
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
