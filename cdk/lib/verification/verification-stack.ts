import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { SlackEventHandler } from "./constructs/slack-event-handler";
import { TokenStorage } from "./constructs/token-storage";
import { EventDedupe } from "./constructs/event-dedupe";
import { ExistenceCheckCache } from "./constructs/existence-check-cache";
import { WhitelistConfig } from "./constructs/whitelist-config";
import { RateLimit } from "./constructs/rate-limit";
import { VerificationAgentRuntime } from "./constructs/verification-agent-runtime";
import { VerificationAgentEcr } from "./constructs/verification-agent-ecr";
import { AgentInvoker } from "./constructs/agent-invoker";
import { SlackPoster } from "./constructs/slack-poster";
import { VerificationStackProps } from "../types/stack-config";

/**
 * Verification Stack (Account A / Verification Zone)
 *
 * Contains resources for request validation and authorization (A2A only):
 * - SlackEventHandler Lambda with Function URL (invokes Verification Agent via AgentCore)
 * - DynamoDB tables (token storage, event dedupe, existence check cache, whitelist config, rate limit)
 * - Secrets Manager (Slack credentials)
 * - Verification Agent AgentCore Runtime (A2A)
 * - CloudWatch alarms
 *
 * Communicates with Execution Stack only via AgentCore A2A (SigV4); no API Gateway or SQS.
 */
export class VerificationStack extends cdk.Stack {
  /** The Slack Event Handler Lambda */
  public readonly slackEventHandler: SlackEventHandler;

  /** The Lambda role ARN */
  public readonly lambdaRoleArn: string;

  /** The Function URL (for Slack Event Subscriptions) */
  public readonly functionUrl: string;

  /** AgentCore Runtime for Verification Agent (A2A) */
  public readonly verificationAgentRuntime: VerificationAgentRuntime;

  /** AgentCore ECR image for Verification Agent */
  public readonly verificationAgentEcr: VerificationAgentEcr;

  /** AgentCore Runtime ARN for cross-stack reference */
  public readonly verificationAgentRuntimeArn: string;

  /** SQS queue for async agent invocation requests (016) */
  public readonly agentInvocationQueue: sqs.IQueue;

  constructor(scope: Construct, id: string, props: VerificationStackProps) {
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

    const slackBotToken =
      process.env.SLACK_BOT_TOKEN ||
      this.node.tryGetContext("slackBotToken") ||
      "";
    if (!slackBotToken) {
      throw new Error(
        "SLACK_BOT_TOKEN is required. Set it via environment variable (SLACK_BOT_TOKEN) or config file (slackBotToken)."
      );
    }

    const slackSigningSecret =
      process.env.SLACK_SIGNING_SECRET ||
      this.node.tryGetContext("slackSigningSecret") ||
      "";
    if (!slackSigningSecret) {
      throw new Error(
        "SLACK_SIGNING_SECRET is required. Set it via environment variable (SLACK_SIGNING_SECRET) or config file (slackSigningSecret)."
      );
    }

    const awsRegion =
      props.awsRegion ||
      this.node.tryGetContext("awsRegion") ||
      "ap-northeast-1";
    const bedrockModelId =
      props.bedrockModelId ||
      this.node.tryGetContext("bedrockModelId") ||
      "amazon.nova-pro-v1:0";
    const validationZoneEchoMode =
      props.validationZoneEchoMode ??
      (this.node.tryGetContext("validationZoneEchoMode") === true ||
        this.node.tryGetContext("validationZoneEchoMode") === "true");

    const slackSigningSecretResource = new secretsmanager.Secret(
      this,
      "SlackSigningSecret",
      {
        secretName: `${this.stackName}/slack/signing-secret`,
        description: "Slack app signing secret for request verification",
        secretStringValue: cdk.SecretValue.unsafePlainText(slackSigningSecret),
      }
    );

    const slackBotTokenSecret = new secretsmanager.Secret(
      this,
      "SlackBotToken",
      {
        secretName: `${this.stackName}/slack/bot-token`,
        description: "Slack bot OAuth token",
        secretStringValue: cdk.SecretValue.unsafePlainText(slackBotToken),
      }
    );

    const tokenStorage = new TokenStorage(this, "TokenStorage");
    const eventDedupe = new EventDedupe(this, "EventDedupe");
    const existenceCheckCache = new ExistenceCheckCache(this, "ExistenceCheckCache");
    const whitelistConfig = new WhitelistConfig(this, "WhitelistConfig");
    const rateLimit = new RateLimit(this, "RateLimit");

    const agentInvocationDlq = new sqs.Queue(this, "AgentInvocationRequestDlq", {
      queueName: `${this.stackName}-agent-invocation-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Visibility timeout >= 6 * Agent Invoker Lambda timeout (900s) per AWS SQS+Lambda best practice
    const agentInvocationQueue = new sqs.Queue(this, "AgentInvocationRequest", {
      queueName: `${this.stackName}-agent-invocation-request`,
      visibilityTimeout: cdk.Duration.seconds(5400),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: agentInvocationDlq,
        maxReceiveCount: 3,
      },
    });
    this.agentInvocationQueue = agentInvocationQueue;

    const verificationAgentName =
      props.verificationAgentName ||
      this.node.tryGetContext("verificationAgentName") ||
      "SlackAI_VerificationAgent";
    const executionAgentArn =
      props.executionAgentArn ||
      this.node.tryGetContext("executionAgentArn") ||
      "";

    this.verificationAgentEcr = new VerificationAgentEcr(
      this,
      "VerificationAgentEcr"
    );

    const slackPoster = new SlackPoster(this, "SlackPoster", {
      stackName: this.stackName,
    });

    const errorDebugLogGroup = new logs.LogGroup(this, "VerificationAgentErrorLogs", {
      logGroupName: `/aws/bedrock-agentcore/${this.stackName}-verification-agent-errors`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.verificationAgentRuntime = new VerificationAgentRuntime(
      this,
      "VerificationAgentRuntime",
      {
        agentRuntimeName: verificationAgentName,
        containerImageUri: this.verificationAgentEcr.imageUri,
        tokenTable: tokenStorage.table,
        dedupeTable: eventDedupe.table,
        existenceCheckCacheTable: existenceCheckCache.table,
        whitelistConfigTable: whitelistConfig.table,
        rateLimitTable: rateLimit.table,
        slackSigningSecret: slackSigningSecretResource,
        slackBotTokenSecret: slackBotTokenSecret,
        executionAgentArn: executionAgentArn || undefined,
        validationZoneEchoMode: validationZoneEchoMode ?? false,
        slackPostRequestQueue: slackPoster.queue,
        errorDebugLogGroup: errorDebugLogGroup,
      }
    );
    this.verificationAgentRuntimeArn = this.verificationAgentRuntime.runtimeArn;

    this.slackEventHandler = new SlackEventHandler(this, "SlackEventHandler", {
      slackSigningSecret: slackSigningSecretResource,
      slackBotTokenSecret: slackBotTokenSecret,
      tokenTableName: tokenStorage.table.tableName,
      dedupeTableName: eventDedupe.table.tableName,
      existenceCheckCacheTableName: existenceCheckCache.table.tableName,
      whitelistConfigTableName: whitelistConfig.table.tableName,
      rateLimitTableName: rateLimit.table.tableName,
      awsRegion,
      bedrockModelId,
      verificationAgentArn: this.verificationAgentRuntimeArn,
      agentInvocationQueue: this.agentInvocationQueue,
      validationZoneEchoMode,
    });

    new AgentInvoker(this, "AgentInvoker", {
      agentInvocationQueue: this.agentInvocationQueue,
      verificationAgentArn: this.verificationAgentRuntimeArn,
    });

    tokenStorage.table.grantReadWriteData(this.slackEventHandler.function);
    eventDedupe.table.grantReadWriteData(this.slackEventHandler.function);
    existenceCheckCache.table.grantReadWriteData(this.slackEventHandler.function);
    whitelistConfig.table.grantReadData(this.slackEventHandler.function);
    rateLimit.table.grantReadWriteData(this.slackEventHandler.function);

    new cdk.CfnOutput(this, "VerificationAgentRuntimeArn", {
      value: this.verificationAgentRuntime.runtimeArn,
      description: "Verification Agent AgentCore Runtime ARN",
      exportName: `${this.stackName}-VerificationAgentArn`,
    });

    this.lambdaRoleArn = this.slackEventHandler.function.role!.roleArn;
    this.functionUrl = this.slackEventHandler.functionUrl.url;

    new cloudwatch.Alarm(this, "WhitelistAuthorizationFailureAlarm", {
      alarmName: `${this.stackName}-WhitelistAuthorizationFailure`,
      alarmDescription:
        "Alert when whitelist authorization failures exceed threshold (5 failures in 5 minutes)",
      metric: new cloudwatch.Metric({
        namespace: "SlackEventHandler",
        metricName: "WhitelistAuthorizationFailed",
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, "WhitelistConfigLoadErrorAlarm", {
      alarmName: `${this.stackName}-WhitelistConfigLoadError`,
      alarmDescription:
        "Alert when whitelist configuration load errors occur",
      metric: new cloudwatch.Metric({
        namespace: "SlackEventHandler",
        metricName: "WhitelistConfigLoadErrors",
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, "ExistenceCheckFailedAlarm", {
      alarmName: `${this.stackName}-existence-check-failed`,
      alarmDescription:
        "Alert when Existence Check failures exceed threshold (potential security issue)",
      metric: new cloudwatch.Metric({
        namespace: "SlackEventHandler",
        metricName: "ExistenceCheckFailed",
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, "RateLimitExceededAlarm", {
      alarmName: `${this.stackName}-rate-limit-exceeded`,
      alarmDescription:
        "Alert when rate limit exceeded events exceed threshold (potential DDoS attack)",
      metric: new cloudwatch.Metric({
        namespace: "SlackEventHandler",
        metricName: "RateLimitExceeded",
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cdk.CfnOutput(this, "SlackEventHandlerUrl", {
      value: this.functionUrl,
      description: "Slack Event Handler Function URL (for Slack Event Subscriptions)",
      exportName: `${this.stackName}-SlackEventHandlerUrl`,
    });

    new cdk.CfnOutput(this, "VerificationLambdaRoleArn", {
      value: this.lambdaRoleArn,
      description: "Verification Lambda Role ARN",
      exportName: `${this.stackName}-VerificationLambdaRoleArn`,
    });

    new cdk.CfnOutput(this, "SlackEventHandlerArn", {
      value: this.slackEventHandler.function.functionArn,
      description: "SlackEventHandler Lambda ARN",
    });
  }
}
