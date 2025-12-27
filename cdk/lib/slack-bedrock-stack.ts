import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { SlackEventHandler } from "./constructs/slack-event-handler";
import { TokenStorage } from "./constructs/token-storage";
import { EventDedupe } from "./constructs/event-dedupe";
import { ExistenceCheckCache } from "./constructs/existence-check-cache";
import { WhitelistConfig } from "./constructs/whitelist-config";
import { RateLimit } from "./constructs/rate-limit";
import { BedrockProcessor } from "./constructs/bedrock-processor";
import { ExecutionApi } from "./constructs/execution-api";
import { ApiGatewayMonitoring } from "./constructs/api-gateway-monitoring";

export class SlackBedrockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get Slack Bot Token from environment variable (required for initial secret creation)
    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (!slackBotToken) {
      throw new Error(
        "SLACK_BOT_TOKEN environment variable is required for initial deployment"
      );
    }

    // Get Slack Signing Secret from environment variable (required for initial secret creation)
    const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
    if (!slackSigningSecret) {
      throw new Error(
        "SLACK_SIGNING_SECRET environment variable is required for initial deployment"
      );
    }

    // Create Secrets Manager secrets for Slack credentials
    // These secrets are created in the stack and will be automatically deleted when the stack is destroyed
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

    // Get AWS Region from CDK context (cdk.json)
    const awsRegion = this.node.tryGetContext("awsRegion") || "ap-northeast-1";

    // Get Bedrock Model ID from CDK context (cdk.json)
    const bedrockModelId =
      this.node.tryGetContext("bedrockModelId") || "amazon.nova-pro-v1:0";

    // Create DynamoDB table for workspace tokens
    const tokenStorage = new TokenStorage(this, "TokenStorage");

    // Create DynamoDB table for event deduplication
    const eventDedupe = new EventDedupe(this, "EventDedupe");

    // Create DynamoDB table for Existence Check cache
    const existenceCheckCache = new ExistenceCheckCache(this, "ExistenceCheckCache");

    // Create DynamoDB table for whitelist configuration
    const whitelistConfig = new WhitelistConfig(this, "WhitelistConfig");

    // Create DynamoDB table for rate limiting
    const rateLimit = new RateLimit(this, "RateLimit");

    // Create Bedrock processor Lambda (Lambda②)
    const bedrockProcessor = new BedrockProcessor(this, "BedrockProcessor", {
      awsRegion,
      bedrockModelId,
    });

    // Create Execution API Gateway with IAM authentication
    // Note: Created before SlackEventHandler to get API URL for environment variable
    const executionApi = new ExecutionApi(this, "ExecutionApi", {
      executionLambda: bedrockProcessor.function,
      // verificationLambdaRoleArn will be set after SlackEventHandler is created
    });

    // Create Slack event handler Lambda with Function URL
    const slackEventHandler = new SlackEventHandler(this, "SlackEventHandler", {
      slackSigningSecret: slackSigningSecretResource,
      slackBotTokenSecret: slackBotTokenSecret,
      tokenTableName: tokenStorage.table.tableName,
      dedupeTableName: eventDedupe.table.tableName,
      existenceCheckCacheTableName: existenceCheckCache.table.tableName,
      whitelistConfigTableName: whitelistConfig.table.tableName,
      rateLimitTableName: rateLimit.table.tableName,
      awsRegion,
      bedrockModelId,
      executionApiUrl: executionApi.apiUrl,
    });

    // Add Verification Layer permission to API Gateway resource policy
    executionApi.addVerificationLayerPermission(
      slackEventHandler.function.role!.roleArn
    );

    // Grant Verification Layer permission to invoke API Gateway
    // Add execute-api:Invoke permission to Lambda role
    slackEventHandler.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["execute-api:Invoke"],
        resources: [executionApi.api.arnForExecuteApi("*")],
      })
    );

    // Grant Lambda① read/write permissions to DynamoDB tables
    tokenStorage.table.grantReadWriteData(slackEventHandler.function);
    eventDedupe.table.grantReadWriteData(slackEventHandler.function);
    existenceCheckCache.table.grantReadWriteData(slackEventHandler.function);
    // Grant Lambda① read permissions to whitelist config table (read-only for security)
    whitelistConfig.table.grantReadData(slackEventHandler.function);
    // Grant Lambda① read/write permissions to rate limit table
    rateLimit.table.grantReadWriteData(slackEventHandler.function);

    // CloudWatch Alarms for Whitelist Authorization
    // Alarm for whitelist authorization failures (5 failures in 5 minutes)
    const whitelistAuthFailureAlarm = new cloudwatch.Alarm(
      this,
      "WhitelistAuthorizationFailureAlarm",
      {
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
      }
    );

    // Alarm for whitelist config load errors
    const whitelistConfigLoadErrorAlarm = new cloudwatch.Alarm(
      this,
      "WhitelistConfigLoadErrorAlarm",
      {
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
      }
    );

    // Output the Function URL for Slack Event Subscriptions configuration
    new cdk.CfnOutput(this, "SlackEventHandlerUrl", {
      value: slackEventHandler.functionUrl.url,
      description: "Slack Event Handler Function URL",
    });

    // Output the Execution API Gateway URL
    new cdk.CfnOutput(this, "ExecutionApiUrl", {
      value: executionApi.apiUrl,
      description: "Execution Layer API Gateway URL",
    });

    // Optional: Create CloudWatch monitoring (can be enabled via environment variable)
    // Set ENABLE_API_GATEWAY_MONITORING=true to enable
    const enableMonitoring =
      process.env.ENABLE_API_GATEWAY_MONITORING === "true";
    if (enableMonitoring) {
      const monitoring = new ApiGatewayMonitoring(this, "ApiGatewayMonitoring", {
        api: executionApi.api,
        alarmEmail: process.env.ALARM_EMAIL, // Optional email for alerts
      });

      new cdk.CfnOutput(this, "MonitoringDashboardUrl", {
        value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${monitoring.dashboard.dashboardName}`,
        description: "CloudWatch Dashboard URL for API Gateway monitoring",
      });
    }

    // CloudWatch Alarm for Existence Check failures (Phase 6 - Polish)
    // Alarm triggers when 5+ failures occur in 5 minutes
    const existenceCheckAlarm = new cloudwatch.Alarm(this, "ExistenceCheckFailedAlarm", {
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

    // CloudWatch Alarm for Rate Limit exceeded (DDoS protection)
    // Alarm triggers when 10+ rate limit exceeded events occur in 5 minutes
    const rateLimitExceededAlarm = new cloudwatch.Alarm(this, "RateLimitExceededAlarm", {
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

    // Note: To add SNS notification, create SNS topic and add alarm action
    // Example:
    // const alarmTopic = new sns.Topic(this, "ExistenceCheckAlarmTopic", {...});
    // existenceCheckAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));
  }
}
