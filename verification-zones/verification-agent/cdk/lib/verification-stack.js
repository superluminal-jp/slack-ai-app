"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationStack = void 0;
const crypto = __importStar(require("crypto"));
const cdk = __importStar(require("aws-cdk-lib"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const wafv2 = __importStar(require("aws-cdk-lib/aws-wafv2"));
const cdk_tooling_1 = require("@slack-ai-app/cdk-tooling");
const slack_event_handler_1 = require("./constructs/slack-event-handler");
const token_storage_1 = require("./constructs/token-storage");
const event_dedupe_1 = require("./constructs/event-dedupe");
const existence_check_cache_1 = require("./constructs/existence-check-cache");
const whitelist_config_1 = require("./constructs/whitelist-config");
const rate_limit_1 = require("./constructs/rate-limit");
const verification_agent_runtime_1 = require("./constructs/verification-agent-runtime");
const verification_agent_ecr_1 = require("./constructs/verification-agent-ecr");
const agent_invoker_1 = require("./constructs/agent-invoker");
const slack_poster_1 = require("./constructs/slack-poster");
const file_exchange_bucket_1 = require("./constructs/file-exchange-bucket");
const usage_history_table_1 = require("./constructs/usage-history-table");
const usage_history_bucket_1 = require("./constructs/usage-history-bucket");
const dynamodb_export_job_1 = require("./constructs/dynamodb-export-job");
const usage_history_archive_bucket_1 = require("./constructs/usage-history-archive-bucket");
const usage_history_replication_1 = require("./constructs/usage-history-replication");
/**
 * Verification Stack (Account A / Verification Zone)
 *
 * Purpose: Handles Slack events, validates and authorizes requests, and invokes the Verification Agent
 * (AgentCore A2A). Communicates with Execution Stack only via AgentCore A2A (SigV4); ingress is exposed via Function URL and API Gateway (Regional + WAF).
 *
 * Responsibilities:
 * - Slack event ingestion (SlackEventHandler Lambda with Function URL and API Gateway)
 * - DynamoDB (token storage, event dedupe, existence check cache, whitelist, rate limit)
 * - Secrets Manager (Slack credentials)
 * - Verification Agent AgentCore Runtime (A2A) and ECR image
 * - Agent invocation (AgentInvoker, SlackPoster), S3 file exchange bucket, CloudWatch alarms
 *
 * Inputs: VerificationStackProps (env, executionAccountId, verificationAgentName, executionAgentArns, etc.);
 * context: deploymentEnv, awsRegion, slackBotToken, slackSigningSecret, bedrockModelId, executionAgentArns.
 *
 * Outputs: slackEventHandler, lambdaRoleArn, verificationAgentRuntimeArn, agentInvocationQueue; CfnOutputs for URLs and ARNs.
 */
class VerificationStack extends cdk.Stack {
    /** The Slack Event Handler Lambda */
    slackEventHandler;
    /** The Lambda role ARN */
    lambdaRoleArn;
    /** API Gateway URL (WAF-protected ingress) */
    apiGatewayUrl;
    /** AgentCore Runtime for Verification Agent (A2A) */
    verificationAgentRuntime;
    /** AgentCore ECR image for Verification Agent */
    verificationAgentEcr;
    /** AgentCore Runtime ARN for cross-stack reference */
    verificationAgentRuntimeArn;
    /** SQS queue for async agent invocation requests (016) */
    agentInvocationQueue;
    constructor(scope, id, props) {
        super(scope, id, props);
        const deploymentEnvRaw = this.node.tryGetContext("deploymentEnv") ||
            process.env.DEPLOYMENT_ENV ||
            "dev";
        const deploymentEnv = deploymentEnvRaw.toLowerCase().trim();
        (0, cdk_tooling_1.applyCostAllocationTags)(this, { deploymentEnv });
        const slackBotToken = process.env.SLACK_BOT_TOKEN ||
            this.node.tryGetContext("slackBotToken") ||
            "";
        if (!slackBotToken) {
            throw new Error("SLACK_BOT_TOKEN is required. Set it via environment variable (SLACK_BOT_TOKEN) or config file (slackBotToken).");
        }
        const slackSigningSecret = process.env.SLACK_SIGNING_SECRET ||
            this.node.tryGetContext("slackSigningSecret") ||
            "";
        if (!slackSigningSecret) {
            throw new Error("SLACK_SIGNING_SECRET is required. Set it via environment variable (SLACK_SIGNING_SECRET) or config file (slackSigningSecret).");
        }
        const awsRegion = props.awsRegion ||
            this.node.tryGetContext("awsRegion") ||
            "ap-northeast-1";
        const bedrockModelId = props.bedrockModelId ||
            this.node.tryGetContext("bedrockModelId") ||
            "jp.anthropic.claude-sonnet-4-5-20250929-v1:0";
        const slackSigningSecretResource = new secretsmanager.Secret(this, "SlackSigningSecret", {
            secretName: `${this.stackName}/slack/signing-secret`,
            description: "Slack app signing secret for request verification",
            secretStringValue: cdk.SecretValue.unsafePlainText(slackSigningSecret),
        });
        const slackBotTokenSecret = new secretsmanager.Secret(this, "SlackBotToken", {
            secretName: `${this.stackName}/slack/bot-token`,
            description: "Slack bot OAuth token",
            secretStringValue: cdk.SecretValue.unsafePlainText(slackBotToken),
        });
        // Order: DynamoDB tables and SQS/Secrets first; VerificationAgentRuntime depends on all of them
        const tokenStorage = new token_storage_1.TokenStorage(this, "TokenStorage");
        const eventDedupe = new event_dedupe_1.EventDedupe(this, "EventDedupe");
        const existenceCheckCache = new existence_check_cache_1.ExistenceCheckCache(this, "ExistenceCheckCache");
        const whitelistConfig = new whitelist_config_1.WhitelistConfig(this, "WhitelistConfig");
        const rateLimit = new rate_limit_1.RateLimit(this, "RateLimit");
        const fileExchangeBucket = new file_exchange_bucket_1.FileExchangeBucket(this, "FileExchangeBucket");
        const usageHistoryTable = new usage_history_table_1.UsageHistoryTable(this, "UsageHistoryTable");
        const usageHistoryBucket = new usage_history_bucket_1.UsageHistoryBucket(this, "UsageHistoryBucket");
        const dynamoDbExportJob = new dynamodb_export_job_1.DynamoDbExportJob(this, "DynamoDbExportJob", {
            table: usageHistoryTable.table,
            bucket: usageHistoryBucket.bucket,
        });
        const usageHistoryArchiveBucket = new usage_history_archive_bucket_1.UsageHistoryArchiveBucket(this, "UsageHistoryArchiveBucket");
        new usage_history_replication_1.UsageHistoryReplication(this, "UsageHistoryReplication", {
            sourceBucket: usageHistoryBucket.bucket,
            archiveBucket: usageHistoryArchiveBucket.bucket,
            archiveAccountId: props.archiveAccountId,
        });
        const agentInvocationDlq = new sqs.Queue(this, "AgentInvocationRequestDlq", {
            queueName: `${this.stackName}-agent-invocation-dlq`,
            retentionPeriod: cdk.Duration.days(14),
        });
        // Visibility timeout >= 6 * Agent Invoker Lambda timeout (900s) per AWS SQS+Lambda best practice; prevents redrive during long runs
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
        // Runtime name must be unique per account (Dev and Prod coexist); default includes env from stack name
        const verificationAgentName = props.verificationAgentName ||
            this.node.tryGetContext("verificationAgentName") ||
            `SlackAI_VerificationAgent_${this.stackName.includes("-Prod") ? "Prod" : "Dev"}`;
        const contextExecutionAgentArnsRaw = this.node.tryGetContext("executionAgentArns");
        const contextExecutionAgentArns = contextExecutionAgentArnsRaw &&
            typeof contextExecutionAgentArnsRaw === "object" &&
            !Array.isArray(contextExecutionAgentArnsRaw)
            ? contextExecutionAgentArnsRaw
            : {};
        const executionAgentArns = {
            ...contextExecutionAgentArns,
            ...(props.executionAgentArns || {}),
        };
        // ECR before Runtime (Runtime needs containerImageUri). SlackPoster and LogGroup before Runtime (optional queue and log group).
        this.verificationAgentEcr = new verification_agent_ecr_1.VerificationAgentEcr(this, "VerificationAgentEcr");
        const slackPoster = new slack_poster_1.SlackPoster(this, "SlackPoster", {
            stackName: this.stackName,
        });
        const errorDebugLogGroup = new logs.LogGroup(this, "VerificationAgentErrorLogs", {
            logGroupName: `/aws/bedrock-agentcore/${this.stackName}-verification-agent-errors`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        this.verificationAgentRuntime = new verification_agent_runtime_1.VerificationAgentRuntime(this, "VerificationAgentRuntime", {
            agentRuntimeName: verificationAgentName,
            containerImageUri: this.verificationAgentEcr.imageUri,
            tokenTable: tokenStorage.table,
            dedupeTable: eventDedupe.table,
            existenceCheckCacheTable: existenceCheckCache.table,
            whitelistConfigTable: whitelistConfig.table,
            rateLimitTable: rateLimit.table,
            slackSigningSecret: slackSigningSecretResource,
            slackBotTokenSecret: slackBotTokenSecret,
            executionAgentArns: Object.keys(executionAgentArns).length > 0
                ? executionAgentArns
                : undefined,
            slackPostRequestQueue: slackPoster.queue,
            errorDebugLogGroup: errorDebugLogGroup,
            fileExchangeBucket: fileExchangeBucket.bucket,
            slackSearchAgentArn: props.slackSearchAgentArn ||
                this.node.tryGetContext("slackSearchAgentArn") ||
                undefined,
            usageHistoryTable: usageHistoryTable.table,
            usageHistoryBucket: usageHistoryBucket.bucket,
        });
        this.verificationAgentRuntimeArn = this.verificationAgentRuntime.runtimeArn;
        // Revision from signing secret so Lambda env changes when secret changes; warm instances then refetch from Secrets Manager
        const configRevision = crypto
            .createHash("sha256")
            .update(slackSigningSecret)
            .digest("hex")
            .slice(0, 16);
        this.slackEventHandler = new slack_event_handler_1.SlackEventHandler(this, "SlackEventHandler", {
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
            configRevision,
            autoReplyChannelIds: props.autoReplyChannelIds,
            mentionChannelIds: props.mentionChannelIds,
        });
        const slackIngressApiAccessLogGroup = new logs.LogGroup(this, "SlackIngressApiAccessLogs", {
            retention: logs.RetentionDays.ONE_MONTH,
        });
        const slackIngressApi = new apigateway.RestApi(this, "SlackIngressApi", {
            endpointConfiguration: {
                types: [apigateway.EndpointType.REGIONAL],
            },
            restApiName: `${this.stackName}-slack-ingress`,
            description: "Slack ingress endpoint for SlackEventHandler (API Gateway)",
            deployOptions: {
                stageName: "prod",
                throttlingBurstLimit: 50,
                throttlingRateLimit: 25,
                accessLogDestination: new apigateway.LogGroupLogDestination(slackIngressApiAccessLogGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
                    caller: true,
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    user: true,
                }),
            },
            cloudWatchRole: true,
        });
        const slackIngressLambdaIntegration = new apigateway.LambdaIntegration(this.slackEventHandler.function, { proxy: true });
        const slackResource = slackIngressApi.root
            .addResource("slack")
            .addResource("events");
        slackResource.addMethod("POST", slackIngressLambdaIntegration);
        const slackIngressAclName = `${this.stackName}-slack-ingress-acl`;
        const slackIngressAclMetricName = `${this.stackName}SlackIngressAcl`.replace(/[^A-Za-z0-9]/g, "");
        const slackIngressAcl = new wafv2.CfnWebACL(this, "SlackIngressWebAcl", {
            name: slackIngressAclName,
            defaultAction: { allow: {} },
            scope: "REGIONAL",
            visibilityConfig: {
                cloudWatchMetricsEnabled: true,
                metricName: slackIngressAclMetricName,
                sampledRequestsEnabled: true,
            },
            rules: [
                {
                    name: "AWS-AWSManagedRulesCommonRuleSet",
                    priority: 0,
                    statement: {
                        managedRuleGroupStatement: {
                            vendorName: "AWS",
                            name: "AWSManagedRulesCommonRuleSet",
                        },
                    },
                    overrideAction: { none: {} },
                    visibilityConfig: {
                        cloudWatchMetricsEnabled: true,
                        metricName: "AWSManagedRulesCommonRuleSet",
                        sampledRequestsEnabled: true,
                    },
                },
                {
                    name: "SlackIngressRateLimit",
                    priority: 10,
                    statement: {
                        rateBasedStatement: {
                            aggregateKeyType: "IP",
                            limit: 2000,
                        },
                    },
                    action: { block: {} },
                    visibilityConfig: {
                        cloudWatchMetricsEnabled: true,
                        metricName: "SlackIngressRateLimit",
                        sampledRequestsEnabled: true,
                    },
                },
            ],
        });
        const slackIngressStageArn = `arn:aws:apigateway:${this.region}::/restapis/${slackIngressApi.restApiId}/stages/${slackIngressApi.deploymentStage.stageName}`;
        new wafv2.CfnWebACLAssociation(this, "SlackIngressWebAclAssociation", {
            webAclArn: slackIngressAcl.attrArn,
            resourceArn: slackIngressStageArn,
        });
        new agent_invoker_1.AgentInvoker(this, "AgentInvoker", {
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
        this.lambdaRoleArn = this.slackEventHandler.function.role.roleArn;
        this.apiGatewayUrl = slackIngressApi.url;
        new cloudwatch.Alarm(this, "WhitelistAuthorizationFailureAlarm", {
            alarmName: `${this.stackName}-WhitelistAuthorizationFailure`,
            alarmDescription: "Alert when whitelist authorization failures exceed threshold (5 failures in 5 minutes)",
            metric: new cloudwatch.Metric({
                namespace: "SlackEventHandler",
                metricName: "WhitelistAuthorizationFailed",
                statistic: "Sum",
                period: cdk.Duration.minutes(5),
            }),
            threshold: 5,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        new cloudwatch.Alarm(this, "WhitelistConfigLoadErrorAlarm", {
            alarmName: `${this.stackName}-WhitelistConfigLoadError`,
            alarmDescription: "Alert when whitelist configuration load errors occur",
            metric: new cloudwatch.Metric({
                namespace: "SlackEventHandler",
                metricName: "WhitelistConfigLoadErrors",
                statistic: "Sum",
                period: cdk.Duration.minutes(5),
            }),
            threshold: 1,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        new cloudwatch.Alarm(this, "ExistenceCheckFailedAlarm", {
            alarmName: `${this.stackName}-existence-check-failed`,
            alarmDescription: "Alert when Existence Check failures exceed threshold (potential security issue)",
            metric: new cloudwatch.Metric({
                namespace: "SlackEventHandler",
                metricName: "ExistenceCheckFailed",
                statistic: "Sum",
                period: cdk.Duration.minutes(5),
            }),
            threshold: 5,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        new cloudwatch.Alarm(this, "RateLimitExceededAlarm", {
            alarmName: `${this.stackName}-rate-limit-exceeded`,
            alarmDescription: "Alert when rate limit exceeded events exceed threshold (potential DDoS attack)",
            metric: new cloudwatch.Metric({
                namespace: "SlackEventHandler",
                metricName: "RateLimitExceeded",
                statistic: "Sum",
                period: cdk.Duration.minutes(5),
            }),
            threshold: 10,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        new cloudwatch.Alarm(this, "DynamoDbExportJobFailureAlarm", {
            alarmName: `${this.stackName}-dynamodb-export-job-failure`,
            alarmDescription: "Alert when DynamoDB daily export job Lambda fails (potential data backup gap)",
            metric: dynamoDbExportJob.function.metricErrors({
                period: cdk.Duration.minutes(5),
                statistic: "Sum",
            }),
            threshold: 1,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        new cloudwatch.Alarm(this, "SlackIngressWafBlockedRequestsAlarm", {
            alarmName: `${this.stackName}-slack-ingress-waf-blocked-requests`,
            alarmDescription: "Alert when WAF blocked requests spike on Slack ingress endpoint",
            metric: new cloudwatch.Metric({
                namespace: "AWS/WAFV2",
                metricName: "BlockedRequests",
                dimensionsMap: {
                    WebACL: slackIngressAclName,
                    Region: this.region,
                    Rule: "ALL",
                },
                statistic: "Sum",
                period: cdk.Duration.minutes(5),
            }),
            threshold: 200,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        new cdk.CfnOutput(this, "SlackEventHandlerApiGatewayUrl", {
            value: this.apiGatewayUrl,
            description: "Slack Event Handler API Gateway URL (recommended ingress endpoint)",
            exportName: `${this.stackName}-SlackEventHandlerApiGatewayUrl`,
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
exports.VerificationStack = VerificationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmVyaWZpY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLCtDQUFpQztBQUNqQyxpREFBbUM7QUFDbkMsMkRBQTZDO0FBQzdDLCtFQUFpRTtBQUNqRSx1RUFBeUQ7QUFDekQseURBQTJDO0FBQzNDLHVFQUF5RDtBQUN6RCw2REFBK0M7QUFFL0MsMkRBQW9FO0FBQ3BFLDBFQUFxRTtBQUNyRSw4REFBMEQ7QUFDMUQsNERBQXdEO0FBQ3hELDhFQUF5RTtBQUN6RSxvRUFBZ0U7QUFDaEUsd0RBQW9EO0FBQ3BELHdGQUFtRjtBQUNuRixnRkFBMkU7QUFDM0UsOERBQTBEO0FBQzFELDREQUF3RDtBQUN4RCw0RUFBdUU7QUFDdkUsMEVBQXFFO0FBQ3JFLDRFQUF1RTtBQUN2RSwwRUFBcUU7QUFDckUsNEZBQXNGO0FBQ3RGLHNGQUFpRjtBQUdqRjs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7QUFDSCxNQUFhLGlCQUFrQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzlDLHFDQUFxQztJQUNyQixpQkFBaUIsQ0FBb0I7SUFFckQsMEJBQTBCO0lBQ1YsYUFBYSxDQUFTO0lBRXRDLDhDQUE4QztJQUM5QixhQUFhLENBQVM7SUFFdEMscURBQXFEO0lBQ3JDLHdCQUF3QixDQUEyQjtJQUVuRSxpREFBaUQ7SUFDakMsb0JBQW9CLENBQXVCO0lBRTNELHNEQUFzRDtJQUN0QywyQkFBMkIsQ0FBUztJQUVwRCwwREFBMEQ7SUFDMUMsb0JBQW9CLENBQWE7SUFFakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLGdCQUFnQixHQUNwQixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FB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QUFrQixDQUFDLGtDQUFrQztZQUNsRSxnQkFBZ0IsRUFBRSxVQUFVLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtTQUM1RCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGdDQUFnQyxFQUFFO1lBQ3hELEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYTtZQUN6QixXQUFXLEVBQUUsb0VBQW9FO1lBQ2pGLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLGlDQUFpQztTQUMvRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDJCQUEyQixFQUFFO1lBQ25ELEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYTtZQUN6QixXQUFXLEVBQUUsOEJBQThCO1lBQzNDLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLDRCQUE0QjtTQUMxRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDbEQsV0FBVyxFQUFFLDhCQUE4QjtTQUM1QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0ZEQsOENBc2RDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gXCJjcnlwdG9cIjtcbmltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sb2dzXCI7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyXCI7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaFwiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheVwiO1xuaW1wb3J0ICogYXMgd2FmdjIgZnJvbSBcImF3cy1jZGstbGliL2F3cy13YWZ2MlwiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCB7IGFwcGx5Q29zdEFsbG9jYXRpb25UYWdzIH0gZnJvbSBcIkBzbGFjay1haS1hcHAvY2RrLXRvb2xpbmdcIjtcbmltcG9ydCB7IFNsYWNrRXZlbnRIYW5kbGVyIH0gZnJvbSBcIi4vY29uc3RydWN0cy9zbGFjay1ldmVudC1oYW5kbGVyXCI7XG5pbXBvcnQgeyBUb2tlblN0b3JhZ2UgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3Rva2VuLXN0b3JhZ2VcIjtcbmltcG9ydCB7IEV2ZW50RGVkdXBlIH0gZnJvbSBcIi4vY29uc3RydWN0cy9ldmVudC1kZWR1cGVcIjtcbmltcG9ydCB7IEV4aXN0ZW5jZUNoZWNrQ2FjaGUgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2V4aXN0ZW5jZS1jaGVjay1jYWNoZVwiO1xuaW1wb3J0IHsgV2hpdGVsaXN0Q29uZmlnIH0gZnJvbSBcIi4vY29uc3RydWN0cy93aGl0ZWxpc3QtY29uZmlnXCI7XG5pbXBvcnQgeyBSYXRlTGltaXQgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3JhdGUtbGltaXRcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWVcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvbkFnZW50RWNyIH0gZnJvbSBcIi4vY29uc3RydWN0cy92ZXJpZmljYXRpb24tYWdlbnQtZWNyXCI7XG5pbXBvcnQgeyBBZ2VudEludm9rZXIgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2FnZW50LWludm9rZXJcIjtcbmltcG9ydCB7IFNsYWNrUG9zdGVyIH0gZnJvbSBcIi4vY29uc3RydWN0cy9zbGFjay1wb3N0ZXJcIjtcbmltcG9ydCB7IEZpbGVFeGNoYW5nZUJ1Y2tldCB9IGZyb20gXCIuL2NvbnN0cnVjdHMvZmlsZS1leGNoYW5nZS1idWNrZXRcIjtcbmltcG9ydCB7IFVzYWdlSGlzdG9yeVRhYmxlIH0gZnJvbSBcIi4vY29uc3RydWN0cy91c2FnZS1oaXN0b3J5LXRhYmxlXCI7XG5pbXBvcnQgeyBVc2FnZUhpc3RvcnlCdWNrZXQgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3VzYWdlLWhpc3RvcnktYnVja2V0XCI7XG5pbXBvcnQgeyBEeW5hbW9EYkV4cG9ydEpvYiB9IGZyb20gXCIuL2NvbnN0cnVjdHMvZHluYW1vZGItZXhwb3J0LWpvYlwiO1xuaW1wb3J0IHsgVXNhZ2VIaXN0b3J5QXJjaGl2ZUJ1Y2tldCB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdXNhZ2UtaGlzdG9yeS1hcmNoaXZlLWJ1Y2tldFwiO1xuaW1wb3J0IHsgVXNhZ2VIaXN0b3J5UmVwbGljYXRpb24gfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3VzYWdlLWhpc3RvcnktcmVwbGljYXRpb25cIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvblN0YWNrUHJvcHMgfSBmcm9tIFwiLi90eXBlcy9zdGFjay1jb25maWdcIjtcblxuLyoqXG4gKiBWZXJpZmljYXRpb24gU3RhY2sgKEFjY291bnQgQSAvIFZlcmlmaWNhdGlvbiBab25lKVxuICpcbiAqIFB1cnBvc2U6IEhhbmRsZXMgU2xhY2sgZXZlbnRzLCB2YWxpZGF0ZXMgYW5kIGF1dGhvcml6ZXMgcmVxdWVzdHMsIGFuZCBpbnZva2VzIHRoZSBWZXJpZmljYXRpb24gQWdlbnRcbiAqIChBZ2VudENvcmUgQTJBKS4gQ29tbXVuaWNhdGVzIHdpdGggRXhlY3V0aW9uIFN0YWNrIG9ubHkgdmlhIEFnZW50Q29yZSBBMkEgKFNpZ1Y0KTsgaW5ncmVzcyBpcyBleHBvc2VkIHZpYSBGdW5jdGlvbiBVUkwgYW5kIEFQSSBHYXRld2F5IChSZWdpb25hbCArIFdBRikuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczpcbiAqIC0gU2xhY2sgZXZlbnQgaW5nZXN0aW9uIChTbGFja0V2ZW50SGFuZGxlciBMYW1iZGEgd2l0aCBGdW5jdGlvbiBVUkwgYW5kIEFQSSBHYXRld2F5KVxuICogLSBEeW5hbW9EQiAodG9rZW4gc3RvcmFnZSwgZXZlbnQgZGVkdXBlLCBleGlzdGVuY2UgY2hlY2sgY2FjaGUsIHdoaXRlbGlzdCwgcmF0ZSBsaW1pdClcbiAqIC0gU2VjcmV0cyBNYW5hZ2VyIChTbGFjayBjcmVkZW50aWFscylcbiAqIC0gVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIChBMkEpIGFuZCBFQ1IgaW1hZ2VcbiAqIC0gQWdlbnQgaW52b2NhdGlvbiAoQWdlbnRJbnZva2VyLCBTbGFja1Bvc3RlciksIFMzIGZpbGUgZXhjaGFuZ2UgYnVja2V0LCBDbG91ZFdhdGNoIGFsYXJtc1xuICpcbiAqIElucHV0czogVmVyaWZpY2F0aW9uU3RhY2tQcm9wcyAoZW52LCBleGVjdXRpb25BY2NvdW50SWQsIHZlcmlmaWNhdGlvbkFnZW50TmFtZSwgZXhlY3V0aW9uQWdlbnRBcm5zLCBldGMuKTtcbiAqIGNvbnRleHQ6IGRlcGxveW1lbnRFbnYsIGF3c1JlZ2lvbiwgc2xhY2tCb3RUb2tlbiwgc2xhY2tTaWduaW5nU2VjcmV0LCBiZWRyb2NrTW9kZWxJZCwgZXhlY3V0aW9uQWdlbnRBcm5zLlxuICpcbiAqIE91dHB1dHM6IHNsYWNrRXZlbnRIYW5kbGVyLCBsYW1iZGFSb2xlQXJuLCB2ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4sIGFnZW50SW52b2NhdGlvblF1ZXVlOyBDZm5PdXRwdXRzIGZvciBVUkxzIGFuZCBBUk5zLlxuICovXG5leHBvcnQgY2xhc3MgVmVyaWZpY2F0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICAvKiogVGhlIFNsYWNrIEV2ZW50IEhhbmRsZXIgTGFtYmRhICovXG4gIHB1YmxpYyByZWFkb25seSBzbGFja0V2ZW50SGFuZGxlcjogU2xhY2tFdmVudEhhbmRsZXI7XG5cbiAgLyoqIFRoZSBMYW1iZGEgcm9sZSBBUk4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGxhbWJkYVJvbGVBcm46IHN0cmluZztcblxuICAvKiogQVBJIEdhdGV3YXkgVVJMIChXQUYtcHJvdGVjdGVkIGluZ3Jlc3MpICovXG4gIHB1YmxpYyByZWFkb25seSBhcGlHYXRld2F5VXJsOiBzdHJpbmc7XG5cbiAgLyoqIEFnZW50Q29yZSBSdW50aW1lIGZvciBWZXJpZmljYXRpb24gQWdlbnQgKEEyQSkgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50UnVudGltZTogVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lO1xuXG4gIC8qKiBBZ2VudENvcmUgRUNSIGltYWdlIGZvciBWZXJpZmljYXRpb24gQWdlbnQgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50RWNyOiBWZXJpZmljYXRpb25BZ2VudEVjcjtcblxuICAvKiogQWdlbnRDb3JlIFJ1bnRpbWUgQVJOIGZvciBjcm9zcy1zdGFjayByZWZlcmVuY2UgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybjogc3RyaW5nO1xuXG4gIC8qKiBTUVMgcXVldWUgZm9yIGFzeW5jIGFnZW50IGludm9jYXRpb24gcmVxdWVzdHMgKDAxNikgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFnZW50SW52b2NhdGlvblF1ZXVlOiBzcXMuSVF1ZXVlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBWZXJpZmljYXRpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBkZXBsb3ltZW50RW52UmF3ID1cbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiKSB8fFxuICAgICAgcHJvY2Vzcy5lbnYuREVQTE9ZTUVOVF9FTlYgfHxcbiAgICAgIFwiZGV2XCI7XG4gICAgY29uc3QgZGVwbG95bWVudEVudiA9IGRlcGxveW1lbnRFbnZSYXcudG9Mb3dlckNhc2UoKS50cmltKCk7XG5cbiAgICBhcHBseUNvc3RBbGxvY2F0aW9uVGFncyh0aGlzLCB7IGRlcGxveW1lbnRFbnYgfSk7XG5cbiAgICBjb25zdCBzbGFja0JvdFRva2VuID1cbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJzbGFja0JvdFRva2VuXCIpIHx8XG4gICAgICBcIlwiO1xuICAgIGlmICghc2xhY2tCb3RUb2tlbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIlNMQUNLX0JPVF9UT0tFTiBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSAoU0xBQ0tfQk9UX1RPS0VOKSBvciBjb25maWcgZmlsZSAoc2xhY2tCb3RUb2tlbikuXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHNsYWNrU2lnbmluZ1NlY3JldCA9XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJzbGFja1NpZ25pbmdTZWNyZXRcIikgfHxcbiAgICAgIFwiXCI7XG4gICAgaWYgKCFzbGFja1NpZ25pbmdTZWNyZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJTTEFDS19TSUdOSU5HX1NFQ1JFVCBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSAoU0xBQ0tfU0lHTklOR19TRUNSRVQpIG9yIGNvbmZpZyBmaWxlIChzbGFja1NpZ25pbmdTZWNyZXQpLlwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBhd3NSZWdpb24gPVxuICAgICAgcHJvcHMuYXdzUmVnaW9uIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImF3c1JlZ2lvblwiKSB8fFxuICAgICAgXCJhcC1ub3J0aGVhc3QtMVwiO1xuICAgIGNvbnN0IGJlZHJvY2tNb2RlbElkID1cbiAgICAgIHByb3BzLmJlZHJvY2tNb2RlbElkIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImJlZHJvY2tNb2RlbElkXCIpIHx8XG4gICAgICBcImpwLmFudGhyb3BpYy5jbGF1ZGUtc29ubmV0LTQtNS0yMDI1MDkyOS12MTowXCI7XG4gICAgY29uc3Qgc2xhY2tTaWduaW5nU2VjcmV0UmVzb3VyY2UgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tTaWduaW5nU2VjcmV0XCIsXG4gICAgICB7XG4gICAgICAgIHNlY3JldE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS9zbGFjay9zaWduaW5nLXNlY3JldGAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIGFwcCBzaWduaW5nIHNlY3JldCBmb3IgcmVxdWVzdCB2ZXJpZmljYXRpb25cIixcbiAgICAgICAgc2VjcmV0U3RyaW5nVmFsdWU6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoc2xhY2tTaWduaW5nU2VjcmV0KSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrQm90VG9rZW5TZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tCb3RUb2tlblwiLFxuICAgICAge1xuICAgICAgICBzZWNyZXROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0vc2xhY2svYm90LXRva2VuYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgYm90IE9BdXRoIHRva2VuXCIsXG4gICAgICAgIHNlY3JldFN0cmluZ1ZhbHVlOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHNsYWNrQm90VG9rZW4pLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gT3JkZXI6IER5bmFtb0RCIHRhYmxlcyBhbmQgU1FTL1NlY3JldHMgZmlyc3Q7IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSBkZXBlbmRzIG9uIGFsbCBvZiB0aGVtXG4gICAgY29uc3QgdG9rZW5TdG9yYWdlID0gbmV3IFRva2VuU3RvcmFnZSh0aGlzLCBcIlRva2VuU3RvcmFnZVwiKTtcbiAgICBjb25zdCBldmVudERlZHVwZSA9IG5ldyBFdmVudERlZHVwZSh0aGlzLCBcIkV2ZW50RGVkdXBlXCIpO1xuICAgIGNvbnN0IGV4aXN0ZW5jZUNoZWNrQ2FjaGUgPSBuZXcgRXhpc3RlbmNlQ2hlY2tDYWNoZShcbiAgICAgIHRoaXMsXG4gICAgICBcIkV4aXN0ZW5jZUNoZWNrQ2FjaGVcIixcbiAgICApO1xuICAgIGNvbnN0IHdoaXRlbGlzdENvbmZpZyA9IG5ldyBXaGl0ZWxpc3RDb25maWcodGhpcywgXCJXaGl0ZWxpc3RDb25maWdcIik7XG4gICAgY29uc3QgcmF0ZUxpbWl0ID0gbmV3IFJhdGVMaW1pdCh0aGlzLCBcIlJhdGVMaW1pdFwiKTtcbiAgICBjb25zdCBmaWxlRXhjaGFuZ2VCdWNrZXQgPSBuZXcgRmlsZUV4Y2hhbmdlQnVja2V0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiRmlsZUV4Y2hhbmdlQnVja2V0XCIsXG4gICAgKTtcbiAgICBjb25zdCB1c2FnZUhpc3RvcnlUYWJsZSA9IG5ldyBVc2FnZUhpc3RvcnlUYWJsZSh0aGlzLCBcIlVzYWdlSGlzdG9yeVRhYmxlXCIpO1xuICAgIGNvbnN0IHVzYWdlSGlzdG9yeUJ1Y2tldCA9IG5ldyBVc2FnZUhpc3RvcnlCdWNrZXQodGhpcywgXCJVc2FnZUhpc3RvcnlCdWNrZXRcIik7XG4gICAgY29uc3QgZHluYW1vRGJFeHBvcnRKb2IgPSBuZXcgRHluYW1vRGJFeHBvcnRKb2IodGhpcywgXCJEeW5hbW9EYkV4cG9ydEpvYlwiLCB7XG4gICAgICB0YWJsZTogdXNhZ2VIaXN0b3J5VGFibGUudGFibGUsXG4gICAgICBidWNrZXQ6IHVzYWdlSGlzdG9yeUJ1Y2tldC5idWNrZXQsXG4gICAgfSk7XG4gICAgY29uc3QgdXNhZ2VIaXN0b3J5QXJjaGl2ZUJ1Y2tldCA9IG5ldyBVc2FnZUhpc3RvcnlBcmNoaXZlQnVja2V0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiVXNhZ2VIaXN0b3J5QXJjaGl2ZUJ1Y2tldFwiXG4gICAgKTtcbiAgICBuZXcgVXNhZ2VIaXN0b3J5UmVwbGljYXRpb24odGhpcywgXCJVc2FnZUhpc3RvcnlSZXBsaWNhdGlvblwiLCB7XG4gICAgICBzb3VyY2VCdWNrZXQ6IHVzYWdlSGlzdG9yeUJ1Y2tldC5idWNrZXQsXG4gICAgICBhcmNoaXZlQnVja2V0OiB1c2FnZUhpc3RvcnlBcmNoaXZlQnVja2V0LmJ1Y2tldCxcbiAgICAgIGFyY2hpdmVBY2NvdW50SWQ6IHByb3BzLmFyY2hpdmVBY2NvdW50SWQsXG4gICAgfSk7XG5cbiAgICBjb25zdCBhZ2VudEludm9jYXRpb25EbHEgPSBuZXcgc3FzLlF1ZXVlKFxuICAgICAgdGhpcyxcbiAgICAgIFwiQWdlbnRJbnZvY2F0aW9uUmVxdWVzdERscVwiLFxuICAgICAge1xuICAgICAgICBxdWV1ZU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1hZ2VudC1pbnZvY2F0aW9uLWRscWAsXG4gICAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gVmlzaWJpbGl0eSB0aW1lb3V0ID49IDYgKiBBZ2VudCBJbnZva2VyIExhbWJkYSB0aW1lb3V0ICg5MDBzKSBwZXIgQVdTIFNRUytMYW1iZGEgYmVzdCBwcmFjdGljZTsgcHJldmVudHMgcmVkcml2ZSBkdXJpbmcgbG9uZyBydW5zXG4gICAgY29uc3QgYWdlbnRJbnZvY2F0aW9uUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsIFwiQWdlbnRJbnZvY2F0aW9uUmVxdWVzdFwiLCB7XG4gICAgICBxdWV1ZU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1hZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3RgLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDU0MDApLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcbiAgICAgICAgcXVldWU6IGFnZW50SW52b2NhdGlvbkRscSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICB0aGlzLmFnZW50SW52b2NhdGlvblF1ZXVlID0gYWdlbnRJbnZvY2F0aW9uUXVldWU7XG5cbiAgICAvLyBSdW50aW1lIG5hbWUgbXVzdCBiZSB1bmlxdWUgcGVyIGFjY291bnQgKERldiBhbmQgUHJvZCBjb2V4aXN0KTsgZGVmYXVsdCBpbmNsdWRlcyBlbnYgZnJvbSBzdGFjayBuYW1lXG4gICAgY29uc3QgdmVyaWZpY2F0aW9uQWdlbnROYW1lID1cbiAgICAgIHByb3BzLnZlcmlmaWNhdGlvbkFnZW50TmFtZSB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJ2ZXJpZmljYXRpb25BZ2VudE5hbWVcIikgfHxcbiAgICAgIGBTbGFja0FJX1ZlcmlmaWNhdGlvbkFnZW50XyR7dGhpcy5zdGFja05hbWUuaW5jbHVkZXMoXCItUHJvZFwiKSA/IFwiUHJvZFwiIDogXCJEZXZcIn1gO1xuICAgIGNvbnN0IGNvbnRleHRFeGVjdXRpb25BZ2VudEFybnNSYXcgPVxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJleGVjdXRpb25BZ2VudEFybnNcIik7XG4gICAgY29uc3QgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJucyA9XG4gICAgICBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3ICYmXG4gICAgICB0eXBlb2YgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyA9PT0gXCJvYmplY3RcIiAmJlxuICAgICAgIUFycmF5LmlzQXJyYXkoY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdylcbiAgICAgICAgPyAoY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KVxuICAgICAgICA6IHt9O1xuICAgIGNvbnN0IGV4ZWN1dGlvbkFnZW50QXJucyA9IHtcbiAgICAgIC4uLmNvbnRleHRFeGVjdXRpb25BZ2VudEFybnMsXG4gICAgICAuLi4ocHJvcHMuZXhlY3V0aW9uQWdlbnRBcm5zIHx8IHt9KSxcbiAgICB9O1xuXG4gICAgLy8gRUNSIGJlZm9yZSBSdW50aW1lIChSdW50aW1lIG5lZWRzIGNvbnRhaW5lckltYWdlVXJpKS4gU2xhY2tQb3N0ZXIgYW5kIExvZ0dyb3VwIGJlZm9yZSBSdW50aW1lIChvcHRpb25hbCBxdWV1ZSBhbmQgbG9nIGdyb3VwKS5cbiAgICB0aGlzLnZlcmlmaWNhdGlvbkFnZW50RWNyID0gbmV3IFZlcmlmaWNhdGlvbkFnZW50RWNyKFxuICAgICAgdGhpcyxcbiAgICAgIFwiVmVyaWZpY2F0aW9uQWdlbnRFY3JcIixcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tQb3N0ZXIgPSBuZXcgU2xhY2tQb3N0ZXIodGhpcywgXCJTbGFja1Bvc3RlclwiLCB7XG4gICAgICBzdGFja05hbWU6IHRoaXMuc3RhY2tOYW1lLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZXJyb3JEZWJ1Z0xvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAoXG4gICAgICB0aGlzLFxuICAgICAgXCJWZXJpZmljYXRpb25BZ2VudEVycm9yTG9nc1wiLFxuICAgICAge1xuICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2JlZHJvY2stYWdlbnRjb3JlLyR7dGhpcy5zdGFja05hbWV9LXZlcmlmaWNhdGlvbi1hZ2VudC1lcnJvcnNgLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lID0gbmV3IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZShcbiAgICAgIHRoaXMsXG4gICAgICBcIlZlcmlmaWNhdGlvbkFnZW50UnVudGltZVwiLFxuICAgICAge1xuICAgICAgICBhZ2VudFJ1bnRpbWVOYW1lOiB2ZXJpZmljYXRpb25BZ2VudE5hbWUsXG4gICAgICAgIGNvbnRhaW5lckltYWdlVXJpOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50RWNyLmltYWdlVXJpLFxuICAgICAgICB0b2tlblRhYmxlOiB0b2tlblN0b3JhZ2UudGFibGUsXG4gICAgICAgIGRlZHVwZVRhYmxlOiBldmVudERlZHVwZS50YWJsZSxcbiAgICAgICAgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlOiBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLFxuICAgICAgICB3aGl0ZWxpc3RDb25maWdUYWJsZTogd2hpdGVsaXN0Q29uZmlnLnRhYmxlLFxuICAgICAgICByYXRlTGltaXRUYWJsZTogcmF0ZUxpbWl0LnRhYmxlLFxuICAgICAgICBzbGFja1NpZ25pbmdTZWNyZXQ6IHNsYWNrU2lnbmluZ1NlY3JldFJlc291cmNlLFxuICAgICAgICBzbGFja0JvdFRva2VuU2VjcmV0OiBzbGFja0JvdFRva2VuU2VjcmV0LFxuICAgICAgICBleGVjdXRpb25BZ2VudEFybnM6XG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IGV4ZWN1dGlvbkFnZW50QXJuc1xuICAgICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIHNsYWNrUG9zdFJlcXVlc3RRdWV1ZTogc2xhY2tQb3N0ZXIucXVldWUsXG4gICAgICAgIGVycm9yRGVidWdMb2dHcm91cDogZXJyb3JEZWJ1Z0xvZ0dyb3VwLFxuICAgICAgICBmaWxlRXhjaGFuZ2VCdWNrZXQ6IGZpbGVFeGNoYW5nZUJ1Y2tldC5idWNrZXQsXG4gICAgICAgIHNsYWNrU2VhcmNoQWdlbnRBcm46XG4gICAgICAgICAgcHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybiB8fFxuICAgICAgICAgICh0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInNsYWNrU2VhcmNoQWdlbnRBcm5cIikgYXMgc3RyaW5nIHwgdW5kZWZpbmVkKSB8fFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgdXNhZ2VIaXN0b3J5VGFibGU6IHVzYWdlSGlzdG9yeVRhYmxlLnRhYmxlLFxuICAgICAgICB1c2FnZUhpc3RvcnlCdWNrZXQ6IHVzYWdlSGlzdG9yeUJ1Y2tldC5idWNrZXQsXG4gICAgICB9LFxuICAgICk7XG4gICAgdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4gPSB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZS5ydW50aW1lQXJuO1xuXG4gICAgLy8gUmV2aXNpb24gZnJvbSBzaWduaW5nIHNlY3JldCBzbyBMYW1iZGEgZW52IGNoYW5nZXMgd2hlbiBzZWNyZXQgY2hhbmdlczsgd2FybSBpbnN0YW5jZXMgdGhlbiByZWZldGNoIGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gICAgY29uc3QgY29uZmlnUmV2aXNpb24gPSBjcnlwdG9cbiAgICAgIC5jcmVhdGVIYXNoKFwic2hhMjU2XCIpXG4gICAgICAudXBkYXRlKHNsYWNrU2lnbmluZ1NlY3JldClcbiAgICAgIC5kaWdlc3QoXCJoZXhcIilcbiAgICAgIC5zbGljZSgwLCAxNik7XG5cbiAgICB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyID0gbmV3IFNsYWNrRXZlbnRIYW5kbGVyKHRoaXMsIFwiU2xhY2tFdmVudEhhbmRsZXJcIiwge1xuICAgICAgc2xhY2tTaWduaW5nU2VjcmV0OiBzbGFja1NpZ25pbmdTZWNyZXRSZXNvdXJjZSxcbiAgICAgIHNsYWNrQm90VG9rZW5TZWNyZXQ6IHNsYWNrQm90VG9rZW5TZWNyZXQsXG4gICAgICB0b2tlblRhYmxlTmFtZTogdG9rZW5TdG9yYWdlLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlZHVwZVRhYmxlTmFtZTogZXZlbnREZWR1cGUudGFibGUudGFibGVOYW1lLFxuICAgICAgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlTmFtZTogZXhpc3RlbmNlQ2hlY2tDYWNoZS50YWJsZS50YWJsZU5hbWUsXG4gICAgICB3aGl0ZWxpc3RDb25maWdUYWJsZU5hbWU6IHdoaXRlbGlzdENvbmZpZy50YWJsZS50YWJsZU5hbWUsXG4gICAgICByYXRlTGltaXRUYWJsZU5hbWU6IHJhdGVMaW1pdC50YWJsZS50YWJsZU5hbWUsXG4gICAgICBhd3NSZWdpb24sXG4gICAgICBiZWRyb2NrTW9kZWxJZCxcbiAgICAgIHZlcmlmaWNhdGlvbkFnZW50QXJuOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybixcbiAgICAgIGFnZW50SW52b2NhdGlvblF1ZXVlOiB0aGlzLmFnZW50SW52b2NhdGlvblF1ZXVlLFxuICAgICAgY29uZmlnUmV2aXNpb24sXG4gICAgICBhdXRvUmVwbHlDaGFubmVsSWRzOiBwcm9wcy5hdXRvUmVwbHlDaGFubmVsSWRzLFxuICAgICAgbWVudGlvbkNoYW5uZWxJZHM6IHByb3BzLm1lbnRpb25DaGFubmVsSWRzLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQXBpQWNjZXNzTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cChcbiAgICAgIHRoaXMsXG4gICAgICBcIlNsYWNrSW5ncmVzc0FwaUFjY2Vzc0xvZ3NcIixcbiAgICAgIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCBcIlNsYWNrSW5ncmVzc0FwaVwiLCB7XG4gICAgICBlbmRwb2ludENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgdHlwZXM6IFthcGlnYXRld2F5LkVuZHBvaW50VHlwZS5SRUdJT05BTF0sXG4gICAgICB9LFxuICAgICAgcmVzdEFwaU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1zbGFjay1pbmdyZXNzYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIGluZ3Jlc3MgZW5kcG9pbnQgZm9yIFNsYWNrRXZlbnRIYW5kbGVyIChBUEkgR2F0ZXdheSlcIixcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBcInByb2RcIixcbiAgICAgICAgdGhyb3R0bGluZ0J1cnN0TGltaXQ6IDUwLFxuICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiAyNSxcbiAgICAgICAgYWNjZXNzTG9nRGVzdGluYXRpb246IG5ldyBhcGlnYXRld2F5LkxvZ0dyb3VwTG9nRGVzdGluYXRpb24oXG4gICAgICAgICAgc2xhY2tJbmdyZXNzQXBpQWNjZXNzTG9nR3JvdXAsXG4gICAgICAgICksXG4gICAgICAgIGFjY2Vzc0xvZ0Zvcm1hdDogYXBpZ2F0ZXdheS5BY2Nlc3NMb2dGb3JtYXQuanNvbldpdGhTdGFuZGFyZEZpZWxkcyh7XG4gICAgICAgICAgY2FsbGVyOiB0cnVlLFxuICAgICAgICAgIGh0dHBNZXRob2Q6IHRydWUsXG4gICAgICAgICAgaXA6IHRydWUsXG4gICAgICAgICAgcHJvdG9jb2w6IHRydWUsXG4gICAgICAgICAgcmVxdWVzdFRpbWU6IHRydWUsXG4gICAgICAgICAgcmVzb3VyY2VQYXRoOiB0cnVlLFxuICAgICAgICAgIHJlc3BvbnNlTGVuZ3RoOiB0cnVlLFxuICAgICAgICAgIHN0YXR1czogdHJ1ZSxcbiAgICAgICAgICB1c2VyOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgICBjbG91ZFdhdGNoUm9sZTogdHJ1ZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0xhbWJkYUludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uLFxuICAgICAgeyBwcm94eTogdHJ1ZSB9LFxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja1Jlc291cmNlID0gc2xhY2tJbmdyZXNzQXBpLnJvb3RcbiAgICAgIC5hZGRSZXNvdXJjZShcInNsYWNrXCIpXG4gICAgICAuYWRkUmVzb3VyY2UoXCJldmVudHNcIik7XG4gICAgc2xhY2tSZXNvdXJjZS5hZGRNZXRob2QoXCJQT1NUXCIsIHNsYWNrSW5ncmVzc0xhbWJkYUludGVncmF0aW9uKTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0FjbE5hbWUgPSBgJHt0aGlzLnN0YWNrTmFtZX0tc2xhY2staW5ncmVzcy1hY2xgO1xuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0FjbE1ldHJpY05hbWUgPSBgJHt0aGlzLnN0YWNrTmFtZX1TbGFja0luZ3Jlc3NBY2xgLnJlcGxhY2UoXG4gICAgICAvW15BLVphLXowLTldL2csXG4gICAgICBcIlwiLFxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBY2wgPSBuZXcgd2FmdjIuQ2ZuV2ViQUNMKHRoaXMsIFwiU2xhY2tJbmdyZXNzV2ViQWNsXCIsIHtcbiAgICAgIG5hbWU6IHNsYWNrSW5ncmVzc0FjbE5hbWUsXG4gICAgICBkZWZhdWx0QWN0aW9uOiB7IGFsbG93OiB7fSB9LFxuICAgICAgc2NvcGU6IFwiUkVHSU9OQUxcIixcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBzbGFja0luZ3Jlc3NBY2xNZXRyaWNOYW1lLFxuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiBcIkFXUy1BV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0XCIsXG4gICAgICAgICAgcHJpb3JpdHk6IDAsXG4gICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIHZlbmRvck5hbWU6IFwiQVdTXCIsXG4gICAgICAgICAgICAgIG5hbWU6IFwiQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldFwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogXCJBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0XCIsXG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiBcIlNsYWNrSW5ncmVzc1JhdGVMaW1pdFwiLFxuICAgICAgICAgIHByaW9yaXR5OiAxMCxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiBcIklQXCIsXG4gICAgICAgICAgICAgIGxpbWl0OiAyMDAwLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiBcIlNsYWNrSW5ncmVzc1JhdGVMaW1pdFwiLFxuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc1N0YWdlQXJuID0gYGFybjphd3M6YXBpZ2F0ZXdheToke3RoaXMucmVnaW9ufTo6L3Jlc3RhcGlzLyR7c2xhY2tJbmdyZXNzQXBpLnJlc3RBcGlJZH0vc3RhZ2VzLyR7c2xhY2tJbmdyZXNzQXBpLmRlcGxveW1lbnRTdGFnZS5zdGFnZU5hbWV9YDtcblxuICAgIG5ldyB3YWZ2Mi5DZm5XZWJBQ0xBc3NvY2lhdGlvbih0aGlzLCBcIlNsYWNrSW5ncmVzc1dlYkFjbEFzc29jaWF0aW9uXCIsIHtcbiAgICAgIHdlYkFjbEFybjogc2xhY2tJbmdyZXNzQWNsLmF0dHJBcm4sXG4gICAgICByZXNvdXJjZUFybjogc2xhY2tJbmdyZXNzU3RhZ2VBcm4sXG4gICAgfSk7XG5cbiAgICBuZXcgQWdlbnRJbnZva2VyKHRoaXMsIFwiQWdlbnRJbnZva2VyXCIsIHtcbiAgICAgIGFnZW50SW52b2NhdGlvblF1ZXVlOiB0aGlzLmFnZW50SW52b2NhdGlvblF1ZXVlLFxuICAgICAgdmVyaWZpY2F0aW9uQWdlbnRBcm46IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuLFxuICAgIH0pO1xuXG4gICAgdG9rZW5TdG9yYWdlLnRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uKTtcbiAgICBldmVudERlZHVwZS50YWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbik7XG4gICAgZXhpc3RlbmNlQ2hlY2tDYWNoZS50YWJsZS5ncmFudFJlYWRXcml0ZURhdGEoXG4gICAgICB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uLFxuICAgICk7XG4gICAgd2hpdGVsaXN0Q29uZmlnLnRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbik7XG4gICAgcmF0ZUxpbWl0LnRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uKTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZS5ydW50aW1lQXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIEFSTlwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVZlcmlmaWNhdGlvbkFnZW50QXJuYCxcbiAgICB9KTtcblxuICAgIHRoaXMubGFtYmRhUm9sZUFybiA9IHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24ucm9sZSEucm9sZUFybjtcbiAgICB0aGlzLmFwaUdhdGV3YXlVcmwgPSBzbGFja0luZ3Jlc3NBcGkudXJsO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJXaGl0ZWxpc3RBdXRob3JpemF0aW9uRmFpbHVyZUFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVdoaXRlbGlzdEF1dGhvcml6YXRpb25GYWlsdXJlYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiB3aGl0ZWxpc3QgYXV0aG9yaXphdGlvbiBmYWlsdXJlcyBleGNlZWQgdGhyZXNob2xkICg1IGZhaWx1cmVzIGluIDUgbWludXRlcylcIixcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiV2hpdGVsaXN0QXV0aG9yaXphdGlvbkZhaWxlZFwiLFxuICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIldoaXRlbGlzdENvbmZpZ0xvYWRFcnJvckFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVdoaXRlbGlzdENvbmZpZ0xvYWRFcnJvcmAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBcIkFsZXJ0IHdoZW4gd2hpdGVsaXN0IGNvbmZpZ3VyYXRpb24gbG9hZCBlcnJvcnMgb2NjdXJcIixcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiV2hpdGVsaXN0Q29uZmlnTG9hZEVycm9yc1wiLFxuICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIkV4aXN0ZW5jZUNoZWNrRmFpbGVkQWxhcm1cIiwge1xuICAgICAgYWxhcm1OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tZXhpc3RlbmNlLWNoZWNrLWZhaWxlZGAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gRXhpc3RlbmNlIENoZWNrIGZhaWx1cmVzIGV4Y2VlZCB0aHJlc2hvbGQgKHBvdGVudGlhbCBzZWN1cml0eSBpc3N1ZSlcIixcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiRXhpc3RlbmNlQ2hlY2tGYWlsZWRcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJSYXRlTGltaXRFeGNlZWRlZEFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXJhdGUtbGltaXQtZXhjZWVkZWRgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjpcbiAgICAgICAgXCJBbGVydCB3aGVuIHJhdGUgbGltaXQgZXhjZWVkZWQgZXZlbnRzIGV4Y2VlZCB0aHJlc2hvbGQgKHBvdGVudGlhbCBERG9TIGF0dGFjaylcIixcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiUmF0ZUxpbWl0RXhjZWVkZWRcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiRHluYW1vRGJFeHBvcnRKb2JGYWlsdXJlQWxhcm1cIiwge1xuICAgICAgYWxhcm1OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tZHluYW1vZGItZXhwb3J0LWpvYi1mYWlsdXJlYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiBEeW5hbW9EQiBkYWlseSBleHBvcnQgam9iIExhbWJkYSBmYWlscyAocG90ZW50aWFsIGRhdGEgYmFja3VwIGdhcClcIixcbiAgICAgIG1ldHJpYzogZHluYW1vRGJFeHBvcnRKb2IuZnVuY3Rpb24ubWV0cmljRXJyb3JzKHtcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJTbGFja0luZ3Jlc3NXYWZCbG9ja2VkUmVxdWVzdHNBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1zbGFjay1pbmdyZXNzLXdhZi1ibG9ja2VkLXJlcXVlc3RzYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiBXQUYgYmxvY2tlZCByZXF1ZXN0cyBzcGlrZSBvbiBTbGFjayBpbmdyZXNzIGVuZHBvaW50XCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJBV1MvV0FGVjJcIixcbiAgICAgICAgbWV0cmljTmFtZTogXCJCbG9ja2VkUmVxdWVzdHNcIixcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIFdlYkFDTDogc2xhY2tJbmdyZXNzQWNsTmFtZSxcbiAgICAgICAgICBSZWdpb246IHRoaXMucmVnaW9uLFxuICAgICAgICAgIFJ1bGU6IFwiQUxMXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAyMDAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJTbGFja0V2ZW50SGFuZGxlckFwaUdhdGV3YXlVcmxcIiwge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpR2F0ZXdheVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIEV2ZW50IEhhbmRsZXIgQVBJIEdhdGV3YXkgVVJMIChyZWNvbW1lbmRlZCBpbmdyZXNzIGVuZHBvaW50KVwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVNsYWNrRXZlbnRIYW5kbGVyQXBpR2F0ZXdheVVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlZlcmlmaWNhdGlvbkxhbWJkYVJvbGVBcm5cIiwge1xuICAgICAgdmFsdWU6IHRoaXMubGFtYmRhUm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlZlcmlmaWNhdGlvbiBMYW1iZGEgUm9sZSBBUk5cIixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1WZXJpZmljYXRpb25MYW1iZGFSb2xlQXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiU2xhY2tFdmVudEhhbmRsZXJBcm5cIiwge1xuICAgICAgdmFsdWU6IHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJTbGFja0V2ZW50SGFuZGxlciBMYW1iZGEgQVJOXCIsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==