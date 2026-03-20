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
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const wafv2 = __importStar(require("aws-cdk-lib/aws-wafv2"));
const cdk_tooling_1 = require("@slack-ai-app/cdk-tooling");
const cdk_nag_1 = require("cdk-nag");
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
    /** SQS queue for async agent invocation requests */
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
        // Slack credentials are static tokens managed externally (Slack app console).
        // Programmatic rotation is not available from AWS because the token is issued and
        // controlled by the Slack platform, not by an AWS-managed service.
        for (const secret of [slackSigningSecretResource, slackBotTokenSecret]) {
            const secretResource = secret.node.defaultChild ?? secret;
            cdk_nag_1.NagSuppressions.addResourceSuppressions(secretResource, [
                {
                    id: "AwsSolutions-SMG4",
                    reason: "Slack signing secret and bot token are issued by the Slack platform and cannot be rotated " +
                        "programmatically via AWS Secrets Manager rotation Lambda. " +
                        "Rotation must be performed manually through the Slack App console.",
                },
            ]);
        }
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
        // Enforce TLS-in-transit (deny non-SSL SQS requests).
        for (const queue of [agentInvocationDlq, agentInvocationQueue]) {
            queue.addToResourcePolicy(new iam.PolicyStatement({
                sid: "DenyInsecureTransport",
                effect: iam.Effect.DENY,
                principals: [new iam.AnyPrincipal()],
                actions: ["sqs:*"],
                resources: [queue.queueArn],
                conditions: { Bool: { "aws:SecureTransport": "false" } },
            }));
        }
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
            lifecycleConfiguration: {
                idleRuntimeSessionTimeoutSeconds: 300,
                maxLifetimeSeconds: 3600,
            },
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
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: false,
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
        // API Gateway is fronting a Lambda that performs Slack signature verification and
        // additional security checks. CDK-nag expects request validation and authorization
        // at the API Gateway layer; for Slack event ingestion, those are implemented in the Lambda.
        cdk_nag_1.NagSuppressions.addResourceSuppressions(slackIngressApi, [
            {
                id: "AwsSolutions-APIG2",
                reason: "Slack event ingestion uses a proxy Lambda integration. Request validation is performed in " +
                    "the Lambda handler (Slack signature verification + payload validation) before any downstream actions.",
            },
            {
                id: "AwsSolutions-APIG4",
                reason: "API Gateway authorization is handled by Slack request signature verification in the Lambda handler. " +
                    "Slack does not support AWS-native authorizers for this integration pattern.",
            },
            {
                id: "AwsSolutions-COG4",
                reason: "Slack events are authenticated via Slack request signature verification in the Lambda handler, not Cognito user pools.",
            },
            {
                id: "AwsSolutions-IAM4",
                reason: "API Gateway is configured with CloudWatch logging enabled, which uses AWS-managed service role policies " +
                    "(AmazonAPIGatewayPushToCloudWatchLogs). Using AWS-managed policies is the standard AWS pattern here.",
            },
            {
                id: "AwsSolutions-APIG6",
                reason: "Stage-level logging is enabled via access logs and method logging configuration in deployOptions.",
            },
        ], true);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmVyaWZpY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLCtDQUFpQztBQUNqQyxpREFBbUM7QUFDbkMsMkRBQTZDO0FBQzdDLCtFQUFpRTtBQUNqRSx1RUFBeUQ7QUFDekQseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx1RUFBeUQ7QUFDekQsNkRBQStDO0FBRS9DLDJEQUFvRTtBQUNwRSxxQ0FBMEM7QUFDMUMsMEVBQXFFO0FBQ3JFLDhEQUEwRDtBQUMxRCw0REFBd0Q7QUFDeEQsOEVBQXlFO0FBQ3pFLG9FQUFnRTtBQUNoRSx3REFBb0Q7QUFDcEQsd0ZBQW1GO0FBQ25GLGdGQUEyRTtBQUMzRSw4REFBMEQ7QUFDMUQsNERBQXdEO0FBQ3hELDRFQUF1RTtBQUN2RSwwRUFBcUU7QUFDckUsNEVBQXVFO0FBQ3ZFLDBFQUFxRTtBQUNyRSw0RkFBc0Y7QUFDdEYsc0ZBQWlGO0FBR2pGOzs7Ozs7Ozs7Ozs7Ozs7OztHQWlCRztBQUNILE1BQWEsaUJBQWtCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDOUMscUNBQXFDO0lBQ3JCLGlCQUFpQixDQUFvQjtJQUVyRCwwQkFBMEI7SUFDVixhQUFhLENBQVM7SUFFdEMsOENBQThDO0lBQzlCLGFBQWEsQ0FBUztJQUV0QyxxREFBcUQ7SUFDckMsd0JBQXdCLENBQTJCO0lBRW5FLGlEQUFpRDtJQUNqQyxvQkFBb0IsQ0FBdUI7SUFFM0Qsc0RBQXNEO0lBQ3RDLDJCQUEyQixDQUFTO0lBRXBELG9EQUFvRDtJQUNwQyxvQkFBb0IsQ0FBYTtJQUVqRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sZ0JBQWdCLEdBQ3BCLElB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LEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDbEQsV0FBVyxFQUFFLDhCQUE4QjtTQUM1QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFuaUJELDhDQW1pQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSBcImNyeXB0b1wiO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxvZ3NcIjtcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXJcIjtcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoXCI7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zcXNcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXlcIjtcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtd2FmdjJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBhcHBseUNvc3RBbGxvY2F0aW9uVGFncyB9IGZyb20gXCJAc2xhY2stYWktYXBwL2Nkay10b29saW5nXCI7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuaW1wb3J0IHsgU2xhY2tFdmVudEhhbmRsZXIgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3NsYWNrLWV2ZW50LWhhbmRsZXJcIjtcbmltcG9ydCB7IFRva2VuU3RvcmFnZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdG9rZW4tc3RvcmFnZVwiO1xuaW1wb3J0IHsgRXZlbnREZWR1cGUgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2V2ZW50LWRlZHVwZVwiO1xuaW1wb3J0IHsgRXhpc3RlbmNlQ2hlY2tDYWNoZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvZXhpc3RlbmNlLWNoZWNrLWNhY2hlXCI7XG5pbXBvcnQgeyBXaGl0ZWxpc3RDb25maWcgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3doaXRlbGlzdC1jb25maWdcIjtcbmltcG9ydCB7IFJhdGVMaW1pdCB9IGZyb20gXCIuL2NvbnN0cnVjdHMvcmF0ZS1saW1pdFwiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lIH0gZnJvbSBcIi4vY29uc3RydWN0cy92ZXJpZmljYXRpb24tYWdlbnQtcnVudGltZVwiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uQWdlbnRFY3IgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3ZlcmlmaWNhdGlvbi1hZ2VudC1lY3JcIjtcbmltcG9ydCB7IEFnZW50SW52b2tlciB9IGZyb20gXCIuL2NvbnN0cnVjdHMvYWdlbnQtaW52b2tlclwiO1xuaW1wb3J0IHsgU2xhY2tQb3N0ZXIgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3NsYWNrLXBvc3RlclwiO1xuaW1wb3J0IHsgRmlsZUV4Y2hhbmdlQnVja2V0IH0gZnJvbSBcIi4vY29uc3RydWN0cy9maWxlLWV4Y2hhbmdlLWJ1Y2tldFwiO1xuaW1wb3J0IHsgVXNhZ2VIaXN0b3J5VGFibGUgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3VzYWdlLWhpc3RvcnktdGFibGVcIjtcbmltcG9ydCB7IFVzYWdlSGlzdG9yeUJ1Y2tldCB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdXNhZ2UtaGlzdG9yeS1idWNrZXRcIjtcbmltcG9ydCB7IER5bmFtb0RiRXhwb3J0Sm9iIH0gZnJvbSBcIi4vY29uc3RydWN0cy9keW5hbW9kYi1leHBvcnQtam9iXCI7XG5pbXBvcnQgeyBVc2FnZUhpc3RvcnlBcmNoaXZlQnVja2V0IH0gZnJvbSBcIi4vY29uc3RydWN0cy91c2FnZS1oaXN0b3J5LWFyY2hpdmUtYnVja2V0XCI7XG5pbXBvcnQgeyBVc2FnZUhpc3RvcnlSZXBsaWNhdGlvbiB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdXNhZ2UtaGlzdG9yeS1yZXBsaWNhdGlvblwiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uU3RhY2tQcm9wcyB9IGZyb20gXCIuL3R5cGVzL3N0YWNrLWNvbmZpZ1wiO1xuXG4vKipcbiAqIFZlcmlmaWNhdGlvbiBTdGFjayAoQWNjb3VudCBBIC8gVmVyaWZpY2F0aW9uIFpvbmUpXG4gKlxuICogUHVycG9zZTogSGFuZGxlcyBTbGFjayBldmVudHMsIHZhbGlkYXRlcyBhbmQgYXV0aG9yaXplcyByZXF1ZXN0cywgYW5kIGludm9rZXMgdGhlIFZlcmlmaWNhdGlvbiBBZ2VudFxuICogKEFnZW50Q29yZSBBMkEpLiBDb21tdW5pY2F0ZXMgd2l0aCBFeGVjdXRpb24gU3RhY2sgb25seSB2aWEgQWdlbnRDb3JlIEEyQSAoU2lnVjQpOyBpbmdyZXNzIGlzIGV4cG9zZWQgdmlhIEZ1bmN0aW9uIFVSTCBhbmQgQVBJIEdhdGV3YXkgKFJlZ2lvbmFsICsgV0FGKS5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOlxuICogLSBTbGFjayBldmVudCBpbmdlc3Rpb24gKFNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSB3aXRoIEZ1bmN0aW9uIFVSTCBhbmQgQVBJIEdhdGV3YXkpXG4gKiAtIER5bmFtb0RCICh0b2tlbiBzdG9yYWdlLCBldmVudCBkZWR1cGUsIGV4aXN0ZW5jZSBjaGVjayBjYWNoZSwgd2hpdGVsaXN0LCByYXRlIGxpbWl0KVxuICogLSBTZWNyZXRzIE1hbmFnZXIgKFNsYWNrIGNyZWRlbnRpYWxzKVxuICogLSBWZXJpZmljYXRpb24gQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgKEEyQSkgYW5kIEVDUiBpbWFnZVxuICogLSBBZ2VudCBpbnZvY2F0aW9uIChBZ2VudEludm9rZXIsIFNsYWNrUG9zdGVyKSwgUzMgZmlsZSBleGNoYW5nZSBidWNrZXQsIENsb3VkV2F0Y2ggYWxhcm1zXG4gKlxuICogSW5wdXRzOiBWZXJpZmljYXRpb25TdGFja1Byb3BzIChlbnYsIGV4ZWN1dGlvbkFjY291bnRJZCwgdmVyaWZpY2F0aW9uQWdlbnROYW1lLCBleGVjdXRpb25BZ2VudEFybnMsIGV0Yy4pO1xuICogY29udGV4dDogZGVwbG95bWVudEVudiwgYXdzUmVnaW9uLCBzbGFja0JvdFRva2VuLCBzbGFja1NpZ25pbmdTZWNyZXQsIGJlZHJvY2tNb2RlbElkLCBleGVjdXRpb25BZ2VudEFybnMuXG4gKlxuICogT3V0cHV0czogc2xhY2tFdmVudEhhbmRsZXIsIGxhbWJkYVJvbGVBcm4sIHZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybiwgYWdlbnRJbnZvY2F0aW9uUXVldWU7IENmbk91dHB1dHMgZm9yIFVSTHMgYW5kIEFSTnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBWZXJpZmljYXRpb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIC8qKiBUaGUgU2xhY2sgRXZlbnQgSGFuZGxlciBMYW1iZGEgKi9cbiAgcHVibGljIHJlYWRvbmx5IHNsYWNrRXZlbnRIYW5kbGVyOiBTbGFja0V2ZW50SGFuZGxlcjtcblxuICAvKiogVGhlIExhbWJkYSByb2xlIEFSTiAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbGFtYmRhUm9sZUFybjogc3RyaW5nO1xuXG4gIC8qKiBBUEkgR2F0ZXdheSBVUkwgKFdBRi1wcm90ZWN0ZWQgaW5ncmVzcykgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFwaUdhdGV3YXlVcmw6IHN0cmluZztcblxuICAvKiogQWdlbnRDb3JlIFJ1bnRpbWUgZm9yIFZlcmlmaWNhdGlvbiBBZ2VudCAoQTJBKSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lOiBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWU7XG5cbiAgLyoqIEFnZW50Q29yZSBFQ1IgaW1hZ2UgZm9yIFZlcmlmaWNhdGlvbiBBZ2VudCAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdmVyaWZpY2F0aW9uQWdlbnRFY3I6IFZlcmlmaWNhdGlvbkFnZW50RWNyO1xuXG4gIC8qKiBBZ2VudENvcmUgUnVudGltZSBBUk4gZm9yIGNyb3NzLXN0YWNrIHJlZmVyZW5jZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuOiBzdHJpbmc7XG5cbiAgLyoqIFNRUyBxdWV1ZSBmb3IgYXN5bmMgYWdlbnQgaW52b2NhdGlvbiByZXF1ZXN0cyAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYWdlbnRJbnZvY2F0aW9uUXVldWU6IHNxcy5JUXVldWU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFZlcmlmaWNhdGlvblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IGRlcGxveW1lbnRFbnZSYXcgPVxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIpIHx8XG4gICAgICBwcm9jZXNzLmVudi5ERVBMT1lNRU5UX0VOViB8fFxuICAgICAgXCJkZXZcIjtcbiAgICBjb25zdCBkZXBsb3ltZW50RW52ID0gZGVwbG95bWVudEVudlJhdy50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcblxuICAgIGFwcGx5Q29zdEFsbG9jYXRpb25UYWdzKHRoaXMsIHsgZGVwbG95bWVudEVudiB9KTtcblxuICAgIGNvbnN0IHNsYWNrQm90VG9rZW4gPVxuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInNsYWNrQm90VG9rZW5cIikgfHxcbiAgICAgIFwiXCI7XG4gICAgaWYgKCFzbGFja0JvdFRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiU0xBQ0tfQk9UX1RPS0VOIGlzIHJlcXVpcmVkLiBTZXQgaXQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlIChTTEFDS19CT1RfVE9LRU4pIG9yIGNvbmZpZyBmaWxlIChzbGFja0JvdFRva2VuKS5cIixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgc2xhY2tTaWduaW5nU2VjcmV0ID1cbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX1NJR05JTkdfU0VDUkVUIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInNsYWNrU2lnbmluZ1NlY3JldFwiKSB8fFxuICAgICAgXCJcIjtcbiAgICBpZiAoIXNsYWNrU2lnbmluZ1NlY3JldCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIlNMQUNLX1NJR05JTkdfU0VDUkVUIGlzIHJlcXVpcmVkLiBTZXQgaXQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlIChTTEFDS19TSUdOSU5HX1NFQ1JFVCkgb3IgY29uZmlnIGZpbGUgKHNsYWNrU2lnbmluZ1NlY3JldCkuXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IGF3c1JlZ2lvbiA9XG4gICAgICBwcm9wcy5hd3NSZWdpb24gfHxcbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwiYXdzUmVnaW9uXCIpIHx8XG4gICAgICBcImFwLW5vcnRoZWFzdC0xXCI7XG4gICAgY29uc3QgYmVkcm9ja01vZGVsSWQgPVxuICAgICAgcHJvcHMuYmVkcm9ja01vZGVsSWQgfHxcbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwiYmVkcm9ja01vZGVsSWRcIikgfHxcbiAgICAgIFwianAuYW50aHJvcGljLmNsYXVkZS1zb25uZXQtNC01LTIwMjUwOTI5LXYxOjBcIjtcbiAgICBjb25zdCBzbGFja1NpZ25pbmdTZWNyZXRSZXNvdXJjZSA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQoXG4gICAgICB0aGlzLFxuICAgICAgXCJTbGFja1NpZ25pbmdTZWNyZXRcIixcbiAgICAgIHtcbiAgICAgICAgc2VjcmV0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9L3NsYWNrL3NpZ25pbmctc2VjcmV0YCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgYXBwIHNpZ25pbmcgc2VjcmV0IGZvciByZXF1ZXN0IHZlcmlmaWNhdGlvblwiLFxuICAgICAgICBzZWNyZXRTdHJpbmdWYWx1ZTogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dChzbGFja1NpZ25pbmdTZWNyZXQpLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tCb3RUb2tlblNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQoXG4gICAgICB0aGlzLFxuICAgICAgXCJTbGFja0JvdFRva2VuXCIsXG4gICAgICB7XG4gICAgICAgIHNlY3JldE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS9zbGFjay9ib3QtdG9rZW5gLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJTbGFjayBib3QgT0F1dGggdG9rZW5cIixcbiAgICAgICAgc2VjcmV0U3RyaW5nVmFsdWU6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoc2xhY2tCb3RUb2tlbiksXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBTbGFjayBjcmVkZW50aWFscyBhcmUgc3RhdGljIHRva2VucyBtYW5hZ2VkIGV4dGVybmFsbHkgKFNsYWNrIGFwcCBjb25zb2xlKS5cbiAgICAvLyBQcm9ncmFtbWF0aWMgcm90YXRpb24gaXMgbm90IGF2YWlsYWJsZSBmcm9tIEFXUyBiZWNhdXNlIHRoZSB0b2tlbiBpcyBpc3N1ZWQgYW5kXG4gICAgLy8gY29udHJvbGxlZCBieSB0aGUgU2xhY2sgcGxhdGZvcm0sIG5vdCBieSBhbiBBV1MtbWFuYWdlZCBzZXJ2aWNlLlxuICAgIGZvciAoY29uc3Qgc2VjcmV0IG9mIFtzbGFja1NpZ25pbmdTZWNyZXRSZXNvdXJjZSwgc2xhY2tCb3RUb2tlblNlY3JldF0pIHtcbiAgICAgIGNvbnN0IHNlY3JldFJlc291cmNlID0gc2VjcmV0Lm5vZGUuZGVmYXVsdENoaWxkID8/IHNlY3JldDtcbiAgICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgICAgc2VjcmV0UmVzb3VyY2UsXG4gICAgICAgIFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtU01HNFwiLFxuICAgICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgICBcIlNsYWNrIHNpZ25pbmcgc2VjcmV0IGFuZCBib3QgdG9rZW4gYXJlIGlzc3VlZCBieSB0aGUgU2xhY2sgcGxhdGZvcm0gYW5kIGNhbm5vdCBiZSByb3RhdGVkIFwiICtcbiAgICAgICAgICAgICAgXCJwcm9ncmFtbWF0aWNhbGx5IHZpYSBBV1MgU2VjcmV0cyBNYW5hZ2VyIHJvdGF0aW9uIExhbWJkYS4gXCIgK1xuICAgICAgICAgICAgICBcIlJvdGF0aW9uIG11c3QgYmUgcGVyZm9ybWVkIG1hbnVhbGx5IHRocm91Z2ggdGhlIFNsYWNrIEFwcCBjb25zb2xlLlwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIE9yZGVyOiBEeW5hbW9EQiB0YWJsZXMgYW5kIFNRUy9TZWNyZXRzIGZpcnN0OyBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUgZGVwZW5kcyBvbiBhbGwgb2YgdGhlbVxuICAgIGNvbnN0IHRva2VuU3RvcmFnZSA9IG5ldyBUb2tlblN0b3JhZ2UodGhpcywgXCJUb2tlblN0b3JhZ2VcIik7XG4gICAgY29uc3QgZXZlbnREZWR1cGUgPSBuZXcgRXZlbnREZWR1cGUodGhpcywgXCJFdmVudERlZHVwZVwiKTtcbiAgICBjb25zdCBleGlzdGVuY2VDaGVja0NhY2hlID0gbmV3IEV4aXN0ZW5jZUNoZWNrQ2FjaGUoXG4gICAgICB0aGlzLFxuICAgICAgXCJFeGlzdGVuY2VDaGVja0NhY2hlXCIsXG4gICAgKTtcbiAgICBjb25zdCB3aGl0ZWxpc3RDb25maWcgPSBuZXcgV2hpdGVsaXN0Q29uZmlnKHRoaXMsIFwiV2hpdGVsaXN0Q29uZmlnXCIpO1xuICAgIGNvbnN0IHJhdGVMaW1pdCA9IG5ldyBSYXRlTGltaXQodGhpcywgXCJSYXRlTGltaXRcIik7XG4gICAgY29uc3QgZmlsZUV4Y2hhbmdlQnVja2V0ID0gbmV3IEZpbGVFeGNoYW5nZUJ1Y2tldChcbiAgICAgIHRoaXMsXG4gICAgICBcIkZpbGVFeGNoYW5nZUJ1Y2tldFwiLFxuICAgICk7XG4gICAgY29uc3QgdXNhZ2VIaXN0b3J5VGFibGUgPSBuZXcgVXNhZ2VIaXN0b3J5VGFibGUodGhpcywgXCJVc2FnZUhpc3RvcnlUYWJsZVwiKTtcbiAgICBjb25zdCB1c2FnZUhpc3RvcnlCdWNrZXQgPSBuZXcgVXNhZ2VIaXN0b3J5QnVja2V0KHRoaXMsIFwiVXNhZ2VIaXN0b3J5QnVja2V0XCIpO1xuICAgIGNvbnN0IGR5bmFtb0RiRXhwb3J0Sm9iID0gbmV3IER5bmFtb0RiRXhwb3J0Sm9iKHRoaXMsIFwiRHluYW1vRGJFeHBvcnRKb2JcIiwge1xuICAgICAgdGFibGU6IHVzYWdlSGlzdG9yeVRhYmxlLnRhYmxlLFxuICAgICAgYnVja2V0OiB1c2FnZUhpc3RvcnlCdWNrZXQuYnVja2V0LFxuICAgIH0pO1xuICAgIGNvbnN0IHVzYWdlSGlzdG9yeUFyY2hpdmVCdWNrZXQgPSBuZXcgVXNhZ2VIaXN0b3J5QXJjaGl2ZUJ1Y2tldChcbiAgICAgIHRoaXMsXG4gICAgICBcIlVzYWdlSGlzdG9yeUFyY2hpdmVCdWNrZXRcIlxuICAgICk7XG4gICAgbmV3IFVzYWdlSGlzdG9yeVJlcGxpY2F0aW9uKHRoaXMsIFwiVXNhZ2VIaXN0b3J5UmVwbGljYXRpb25cIiwge1xuICAgICAgc291cmNlQnVja2V0OiB1c2FnZUhpc3RvcnlCdWNrZXQuYnVja2V0LFxuICAgICAgYXJjaGl2ZUJ1Y2tldDogdXNhZ2VIaXN0b3J5QXJjaGl2ZUJ1Y2tldC5idWNrZXQsXG4gICAgICBhcmNoaXZlQWNjb3VudElkOiBwcm9wcy5hcmNoaXZlQWNjb3VudElkLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYWdlbnRJbnZvY2F0aW9uRGxxID0gbmV3IHNxcy5RdWV1ZShcbiAgICAgIHRoaXMsXG4gICAgICBcIkFnZW50SW52b2NhdGlvblJlcXVlc3REbHFcIixcbiAgICAgIHtcbiAgICAgICAgcXVldWVOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYWdlbnQtaW52b2NhdGlvbi1kbHFgLFxuICAgICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIFZpc2liaWxpdHkgdGltZW91dCA+PSA2ICogQWdlbnQgSW52b2tlciBMYW1iZGEgdGltZW91dCAoOTAwcykgcGVyIEFXUyBTUVMrTGFtYmRhIGJlc3QgcHJhY3RpY2U7IHByZXZlbnRzIHJlZHJpdmUgZHVyaW5nIGxvbmcgcnVuc1xuICAgIGNvbnN0IGFnZW50SW52b2NhdGlvblF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCBcIkFnZW50SW52b2NhdGlvblJlcXVlc3RcIiwge1xuICAgICAgcXVldWVOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYWdlbnQtaW52b2NhdGlvbi1yZXF1ZXN0YCxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1NDAwKSxcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBhZ2VudEludm9jYXRpb25EbHEsXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGhpcy5hZ2VudEludm9jYXRpb25RdWV1ZSA9IGFnZW50SW52b2NhdGlvblF1ZXVlO1xuXG4gICAgLy8gRW5mb3JjZSBUTFMtaW4tdHJhbnNpdCAoZGVueSBub24tU1NMIFNRUyByZXF1ZXN0cykuXG4gICAgZm9yIChjb25zdCBxdWV1ZSBvZiBbYWdlbnRJbnZvY2F0aW9uRGxxLCBhZ2VudEludm9jYXRpb25RdWV1ZV0pIHtcbiAgICAgIHF1ZXVlLmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBzaWQ6IFwiRGVueUluc2VjdXJlVHJhbnNwb3J0XCIsXG4gICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkRFTlksXG4gICAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldLFxuICAgICAgICAgIGFjdGlvbnM6IFtcInNxczoqXCJdLFxuICAgICAgICAgIHJlc291cmNlczogW3F1ZXVlLnF1ZXVlQXJuXSxcbiAgICAgICAgICBjb25kaXRpb25zOiB7IEJvb2w6IHsgXCJhd3M6U2VjdXJlVHJhbnNwb3J0XCI6IFwiZmFsc2VcIiB9IH0sXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBSdW50aW1lIG5hbWUgbXVzdCBiZSB1bmlxdWUgcGVyIGFjY291bnQgKERldiBhbmQgUHJvZCBjb2V4aXN0KTsgZGVmYXVsdCBpbmNsdWRlcyBlbnYgZnJvbSBzdGFjayBuYW1lXG4gICAgY29uc3QgdmVyaWZpY2F0aW9uQWdlbnROYW1lID1cbiAgICAgIHByb3BzLnZlcmlmaWNhdGlvbkFnZW50TmFtZSB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJ2ZXJpZmljYXRpb25BZ2VudE5hbWVcIikgfHxcbiAgICAgIGBTbGFja0FJX1ZlcmlmaWNhdGlvbkFnZW50XyR7dGhpcy5zdGFja05hbWUuaW5jbHVkZXMoXCItUHJvZFwiKSA/IFwiUHJvZFwiIDogXCJEZXZcIn1gO1xuICAgIGNvbnN0IGNvbnRleHRFeGVjdXRpb25BZ2VudEFybnNSYXcgPVxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJleGVjdXRpb25BZ2VudEFybnNcIik7XG4gICAgY29uc3QgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJucyA9XG4gICAgICBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3ICYmXG4gICAgICB0eXBlb2YgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyA9PT0gXCJvYmplY3RcIiAmJlxuICAgICAgIUFycmF5LmlzQXJyYXkoY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdylcbiAgICAgICAgPyAoY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KVxuICAgICAgICA6IHt9O1xuICAgIGNvbnN0IGV4ZWN1dGlvbkFnZW50QXJucyA9IHtcbiAgICAgIC4uLmNvbnRleHRFeGVjdXRpb25BZ2VudEFybnMsXG4gICAgICAuLi4ocHJvcHMuZXhlY3V0aW9uQWdlbnRBcm5zIHx8IHt9KSxcbiAgICB9O1xuXG4gICAgLy8gRUNSIGJlZm9yZSBSdW50aW1lIChSdW50aW1lIG5lZWRzIGNvbnRhaW5lckltYWdlVXJpKS4gU2xhY2tQb3N0ZXIgYW5kIExvZ0dyb3VwIGJlZm9yZSBSdW50aW1lIChvcHRpb25hbCBxdWV1ZSBhbmQgbG9nIGdyb3VwKS5cbiAgICB0aGlzLnZlcmlmaWNhdGlvbkFnZW50RWNyID0gbmV3IFZlcmlmaWNhdGlvbkFnZW50RWNyKFxuICAgICAgdGhpcyxcbiAgICAgIFwiVmVyaWZpY2F0aW9uQWdlbnRFY3JcIixcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tQb3N0ZXIgPSBuZXcgU2xhY2tQb3N0ZXIodGhpcywgXCJTbGFja1Bvc3RlclwiLCB7XG4gICAgICBzdGFja05hbWU6IHRoaXMuc3RhY2tOYW1lLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZXJyb3JEZWJ1Z0xvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAoXG4gICAgICB0aGlzLFxuICAgICAgXCJWZXJpZmljYXRpb25BZ2VudEVycm9yTG9nc1wiLFxuICAgICAge1xuICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2JlZHJvY2stYWdlbnRjb3JlLyR7dGhpcy5zdGFja05hbWV9LXZlcmlmaWNhdGlvbi1hZ2VudC1lcnJvcnNgLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lID0gbmV3IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZShcbiAgICAgIHRoaXMsXG4gICAgICBcIlZlcmlmaWNhdGlvbkFnZW50UnVudGltZVwiLFxuICAgICAge1xuICAgICAgICBhZ2VudFJ1bnRpbWVOYW1lOiB2ZXJpZmljYXRpb25BZ2VudE5hbWUsXG4gICAgICAgIGNvbnRhaW5lckltYWdlVXJpOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50RWNyLmltYWdlVXJpLFxuICAgICAgICB0b2tlblRhYmxlOiB0b2tlblN0b3JhZ2UudGFibGUsXG4gICAgICAgIGRlZHVwZVRhYmxlOiBldmVudERlZHVwZS50YWJsZSxcbiAgICAgICAgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlOiBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLFxuICAgICAgICB3aGl0ZWxpc3RDb25maWdUYWJsZTogd2hpdGVsaXN0Q29uZmlnLnRhYmxlLFxuICAgICAgICByYXRlTGltaXRUYWJsZTogcmF0ZUxpbWl0LnRhYmxlLFxuICAgICAgICBzbGFja1NpZ25pbmdTZWNyZXQ6IHNsYWNrU2lnbmluZ1NlY3JldFJlc291cmNlLFxuICAgICAgICBzbGFja0JvdFRva2VuU2VjcmV0OiBzbGFja0JvdFRva2VuU2VjcmV0LFxuICAgICAgICBleGVjdXRpb25BZ2VudEFybnM6XG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IGV4ZWN1dGlvbkFnZW50QXJuc1xuICAgICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIHNsYWNrUG9zdFJlcXVlc3RRdWV1ZTogc2xhY2tQb3N0ZXIucXVldWUsXG4gICAgICAgIGVycm9yRGVidWdMb2dHcm91cDogZXJyb3JEZWJ1Z0xvZ0dyb3VwLFxuICAgICAgICBmaWxlRXhjaGFuZ2VCdWNrZXQ6IGZpbGVFeGNoYW5nZUJ1Y2tldC5idWNrZXQsXG4gICAgICAgIHNsYWNrU2VhcmNoQWdlbnRBcm46XG4gICAgICAgICAgcHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybiB8fFxuICAgICAgICAgICh0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInNsYWNrU2VhcmNoQWdlbnRBcm5cIikgYXMgc3RyaW5nIHwgdW5kZWZpbmVkKSB8fFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgbGlmZWN5Y2xlQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIGlkbGVSdW50aW1lU2Vzc2lvblRpbWVvdXRTZWNvbmRzOiAzMDAsXG4gICAgICAgICAgbWF4TGlmZXRpbWVTZWNvbmRzOiAzNjAwLFxuICAgICAgICB9LFxuICAgICAgICB1c2FnZUhpc3RvcnlUYWJsZTogdXNhZ2VIaXN0b3J5VGFibGUudGFibGUsXG4gICAgICAgIHVzYWdlSGlzdG9yeUJ1Y2tldDogdXNhZ2VIaXN0b3J5QnVja2V0LmJ1Y2tldCxcbiAgICAgIH0sXG4gICAgKTtcbiAgICB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybiA9IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lLnJ1bnRpbWVBcm47XG5cbiAgICAvLyBSZXZpc2lvbiBmcm9tIHNpZ25pbmcgc2VjcmV0IHNvIExhbWJkYSBlbnYgY2hhbmdlcyB3aGVuIHNlY3JldCBjaGFuZ2VzOyB3YXJtIGluc3RhbmNlcyB0aGVuIHJlZmV0Y2ggZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgICBjb25zdCBjb25maWdSZXZpc2lvbiA9IGNyeXB0b1xuICAgICAgLmNyZWF0ZUhhc2goXCJzaGEyNTZcIilcbiAgICAgIC51cGRhdGUoc2xhY2tTaWduaW5nU2VjcmV0KVxuICAgICAgLmRpZ2VzdChcImhleFwiKVxuICAgICAgLnNsaWNlKDAsIDE2KTtcblxuICAgIHRoaXMuc2xhY2tFdmVudEhhbmRsZXIgPSBuZXcgU2xhY2tFdmVudEhhbmRsZXIodGhpcywgXCJTbGFja0V2ZW50SGFuZGxlclwiLCB7XG4gICAgICBzbGFja1NpZ25pbmdTZWNyZXQ6IHNsYWNrU2lnbmluZ1NlY3JldFJlc291cmNlLFxuICAgICAgc2xhY2tCb3RUb2tlblNlY3JldDogc2xhY2tCb3RUb2tlblNlY3JldCxcbiAgICAgIHRva2VuVGFibGVOYW1lOiB0b2tlblN0b3JhZ2UudGFibGUudGFibGVOYW1lLFxuICAgICAgZGVkdXBlVGFibGVOYW1lOiBldmVudERlZHVwZS50YWJsZS50YWJsZU5hbWUsXG4gICAgICBleGlzdGVuY2VDaGVja0NhY2hlVGFibGVOYW1lOiBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIHdoaXRlbGlzdENvbmZpZ1RhYmxlTmFtZTogd2hpdGVsaXN0Q29uZmlnLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIHJhdGVMaW1pdFRhYmxlTmFtZTogcmF0ZUxpbWl0LnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGF3c1JlZ2lvbixcbiAgICAgIGJlZHJvY2tNb2RlbElkLFxuICAgICAgdmVyaWZpY2F0aW9uQWdlbnRBcm46IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuLFxuICAgICAgYWdlbnRJbnZvY2F0aW9uUXVldWU6IHRoaXMuYWdlbnRJbnZvY2F0aW9uUXVldWUsXG4gICAgICBjb25maWdSZXZpc2lvbixcbiAgICAgIGF1dG9SZXBseUNoYW5uZWxJZHM6IHByb3BzLmF1dG9SZXBseUNoYW5uZWxJZHMsXG4gICAgICBtZW50aW9uQ2hhbm5lbElkczogcHJvcHMubWVudGlvbkNoYW5uZWxJZHMsXG4gICAgfSk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBcGlBY2Nlc3NMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tJbmdyZXNzQXBpQWNjZXNzTG9nc1wiLFxuICAgICAge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsIFwiU2xhY2tJbmdyZXNzQXBpXCIsIHtcbiAgICAgIGVuZHBvaW50Q29uZmlndXJhdGlvbjoge1xuICAgICAgICB0eXBlczogW2FwaWdhdGV3YXkuRW5kcG9pbnRUeXBlLlJFR0lPTkFMXSxcbiAgICAgIH0sXG4gICAgICByZXN0QXBpTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXNsYWNrLWluZ3Jlc3NgLFxuICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgaW5ncmVzcyBlbmRwb2ludCBmb3IgU2xhY2tFdmVudEhhbmRsZXIgKEFQSSBHYXRld2F5KVwiLFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IFwicHJvZFwiLFxuICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogNTAsXG4gICAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IDI1LFxuICAgICAgICBsb2dnaW5nTGV2ZWw6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8sXG4gICAgICAgIGRhdGFUcmFjZUVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICBhY2Nlc3NMb2dEZXN0aW5hdGlvbjogbmV3IGFwaWdhdGV3YXkuTG9nR3JvdXBMb2dEZXN0aW5hdGlvbihcbiAgICAgICAgICBzbGFja0luZ3Jlc3NBcGlBY2Nlc3NMb2dHcm91cCxcbiAgICAgICAgKSxcbiAgICAgICAgYWNjZXNzTG9nRm9ybWF0OiBhcGlnYXRld2F5LkFjY2Vzc0xvZ0Zvcm1hdC5qc29uV2l0aFN0YW5kYXJkRmllbGRzKHtcbiAgICAgICAgICBjYWxsZXI6IHRydWUsXG4gICAgICAgICAgaHR0cE1ldGhvZDogdHJ1ZSxcbiAgICAgICAgICBpcDogdHJ1ZSxcbiAgICAgICAgICBwcm90b2NvbDogdHJ1ZSxcbiAgICAgICAgICByZXF1ZXN0VGltZTogdHJ1ZSxcbiAgICAgICAgICByZXNvdXJjZVBhdGg6IHRydWUsXG4gICAgICAgICAgcmVzcG9uc2VMZW5ndGg6IHRydWUsXG4gICAgICAgICAgc3RhdHVzOiB0cnVlLFxuICAgICAgICAgIHVzZXI6IHRydWUsXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICAgIGNsb3VkV2F0Y2hSb2xlOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzTGFtYmRhSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24sXG4gICAgICB7IHByb3h5OiB0cnVlIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrUmVzb3VyY2UgPSBzbGFja0luZ3Jlc3NBcGkucm9vdFxuICAgICAgLmFkZFJlc291cmNlKFwic2xhY2tcIilcbiAgICAgIC5hZGRSZXNvdXJjZShcImV2ZW50c1wiKTtcbiAgICBzbGFja1Jlc291cmNlLmFkZE1ldGhvZChcIlBPU1RcIiwgc2xhY2tJbmdyZXNzTGFtYmRhSW50ZWdyYXRpb24pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgaXMgZnJvbnRpbmcgYSBMYW1iZGEgdGhhdCBwZXJmb3JtcyBTbGFjayBzaWduYXR1cmUgdmVyaWZpY2F0aW9uIGFuZFxuICAgIC8vIGFkZGl0aW9uYWwgc2VjdXJpdHkgY2hlY2tzLiBDREstbmFnIGV4cGVjdHMgcmVxdWVzdCB2YWxpZGF0aW9uIGFuZCBhdXRob3JpemF0aW9uXG4gICAgLy8gYXQgdGhlIEFQSSBHYXRld2F5IGxheWVyOyBmb3IgU2xhY2sgZXZlbnQgaW5nZXN0aW9uLCB0aG9zZSBhcmUgaW1wbGVtZW50ZWQgaW4gdGhlIExhbWJkYS5cbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICBzbGFja0luZ3Jlc3NBcGksXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtQVBJRzJcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIlNsYWNrIGV2ZW50IGluZ2VzdGlvbiB1c2VzIGEgcHJveHkgTGFtYmRhIGludGVncmF0aW9uLiBSZXF1ZXN0IHZhbGlkYXRpb24gaXMgcGVyZm9ybWVkIGluIFwiICtcbiAgICAgICAgICAgIFwidGhlIExhbWJkYSBoYW5kbGVyIChTbGFjayBzaWduYXR1cmUgdmVyaWZpY2F0aW9uICsgcGF5bG9hZCB2YWxpZGF0aW9uKSBiZWZvcmUgYW55IGRvd25zdHJlYW0gYWN0aW9ucy5cIixcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1BUElHNFwiLFxuICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgIFwiQVBJIEdhdGV3YXkgYXV0aG9yaXphdGlvbiBpcyBoYW5kbGVkIGJ5IFNsYWNrIHJlcXVlc3Qgc2lnbmF0dXJlIHZlcmlmaWNhdGlvbiBpbiB0aGUgTGFtYmRhIGhhbmRsZXIuIFwiICtcbiAgICAgICAgICAgIFwiU2xhY2sgZG9lcyBub3Qgc3VwcG9ydCBBV1MtbmF0aXZlIGF1dGhvcml6ZXJzIGZvciB0aGlzIGludGVncmF0aW9uIHBhdHRlcm4uXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtQ09HNFwiLFxuICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgIFwiU2xhY2sgZXZlbnRzIGFyZSBhdXRoZW50aWNhdGVkIHZpYSBTbGFjayByZXF1ZXN0IHNpZ25hdHVyZSB2ZXJpZmljYXRpb24gaW4gdGhlIExhbWJkYSBoYW5kbGVyLCBub3QgQ29nbml0byB1c2VyIHBvb2xzLlwiLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTRcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIkFQSSBHYXRld2F5IGlzIGNvbmZpZ3VyZWQgd2l0aCBDbG91ZFdhdGNoIGxvZ2dpbmcgZW5hYmxlZCwgd2hpY2ggdXNlcyBBV1MtbWFuYWdlZCBzZXJ2aWNlIHJvbGUgcG9saWNpZXMgXCIgK1xuICAgICAgICAgICAgXCIoQW1hem9uQVBJR2F0ZXdheVB1c2hUb0Nsb3VkV2F0Y2hMb2dzKS4gVXNpbmcgQVdTLW1hbmFnZWQgcG9saWNpZXMgaXMgdGhlIHN0YW5kYXJkIEFXUyBwYXR0ZXJuIGhlcmUuXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtQVBJRzZcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIlN0YWdlLWxldmVsIGxvZ2dpbmcgaXMgZW5hYmxlZCB2aWEgYWNjZXNzIGxvZ3MgYW5kIG1ldGhvZCBsb2dnaW5nIGNvbmZpZ3VyYXRpb24gaW4gZGVwbG95T3B0aW9ucy5cIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0cnVlLFxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBY2xOYW1lID0gYCR7dGhpcy5zdGFja05hbWV9LXNsYWNrLWluZ3Jlc3MtYWNsYDtcbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBY2xNZXRyaWNOYW1lID0gYCR7dGhpcy5zdGFja05hbWV9U2xhY2tJbmdyZXNzQWNsYC5yZXBsYWNlKFxuICAgICAgL1teQS1aYS16MC05XS9nLFxuICAgICAgXCJcIixcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQWNsID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCBcIlNsYWNrSW5ncmVzc1dlYkFjbFwiLCB7XG4gICAgICBuYW1lOiBzbGFja0luZ3Jlc3NBY2xOYW1lLFxuICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgIHNjb3BlOiBcIlJFR0lPTkFMXCIsXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogc2xhY2tJbmdyZXNzQWNsTWV0cmljTmFtZSxcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBydWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogXCJBV1MtQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldFwiLFxuICAgICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiBcIkFXU1wiLFxuICAgICAgICAgICAgICBuYW1lOiBcIkFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXRcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldFwiLFxuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogXCJTbGFja0luZ3Jlc3NSYXRlTGltaXRcIixcbiAgICAgICAgICBwcmlvcml0eTogMTAsXG4gICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogXCJJUFwiLFxuICAgICAgICAgICAgICBsaW1pdDogMjAwMCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogXCJTbGFja0luZ3Jlc3NSYXRlTGltaXRcIixcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NTdGFnZUFybiA9IGBhcm46YXdzOmFwaWdhdGV3YXk6JHt0aGlzLnJlZ2lvbn06Oi9yZXN0YXBpcy8ke3NsYWNrSW5ncmVzc0FwaS5yZXN0QXBpSWR9L3N0YWdlcy8ke3NsYWNrSW5ncmVzc0FwaS5kZXBsb3ltZW50U3RhZ2Uuc3RhZ2VOYW1lfWA7XG5cbiAgICBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgXCJTbGFja0luZ3Jlc3NXZWJBY2xBc3NvY2lhdGlvblwiLCB7XG4gICAgICB3ZWJBY2xBcm46IHNsYWNrSW5ncmVzc0FjbC5hdHRyQXJuLFxuICAgICAgcmVzb3VyY2VBcm46IHNsYWNrSW5ncmVzc1N0YWdlQXJuLFxuICAgIH0pO1xuXG4gICAgbmV3IEFnZW50SW52b2tlcih0aGlzLCBcIkFnZW50SW52b2tlclwiLCB7XG4gICAgICBhZ2VudEludm9jYXRpb25RdWV1ZTogdGhpcy5hZ2VudEludm9jYXRpb25RdWV1ZSxcbiAgICAgIHZlcmlmaWNhdGlvbkFnZW50QXJuOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybixcbiAgICB9KTtcblxuICAgIHRva2VuU3RvcmFnZS50YWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbik7XG4gICAgZXZlbnREZWR1cGUudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuICAgIGV4aXN0ZW5jZUNoZWNrQ2FjaGUudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKFxuICAgICAgdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbixcbiAgICApO1xuICAgIHdoaXRlbGlzdENvbmZpZy50YWJsZS5ncmFudFJlYWREYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuICAgIHJhdGVMaW1pdC50YWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbik7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUucnVudGltZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlZlcmlmaWNhdGlvbiBBZ2VudCBBZ2VudENvcmUgUnVudGltZSBBUk5cIixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1WZXJpZmljYXRpb25BZ2VudEFybmAsXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYVJvbGVBcm4gPSB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uLnJvbGUhLnJvbGVBcm47XG4gICAgdGhpcy5hcGlHYXRld2F5VXJsID0gc2xhY2tJbmdyZXNzQXBpLnVybDtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiV2hpdGVsaXN0QXV0aG9yaXphdGlvbkZhaWx1cmVBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1XaGl0ZWxpc3RBdXRob3JpemF0aW9uRmFpbHVyZWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gd2hpdGVsaXN0IGF1dGhvcml6YXRpb24gZmFpbHVyZXMgZXhjZWVkIHRocmVzaG9sZCAoNSBmYWlsdXJlcyBpbiA1IG1pbnV0ZXMpXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIldoaXRlbGlzdEF1dGhvcml6YXRpb25GYWlsZWRcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJXaGl0ZWxpc3RDb25maWdMb2FkRXJyb3JBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1XaGl0ZWxpc3RDb25maWdMb2FkRXJyb3JgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogXCJBbGVydCB3aGVuIHdoaXRlbGlzdCBjb25maWd1cmF0aW9uIGxvYWQgZXJyb3JzIG9jY3VyXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIldoaXRlbGlzdENvbmZpZ0xvYWRFcnJvcnNcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJFeGlzdGVuY2VDaGVja0ZhaWxlZEFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWV4aXN0ZW5jZS1jaGVjay1mYWlsZWRgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjpcbiAgICAgICAgXCJBbGVydCB3aGVuIEV4aXN0ZW5jZSBDaGVjayBmYWlsdXJlcyBleGNlZWQgdGhyZXNob2xkIChwb3RlbnRpYWwgc2VjdXJpdHkgaXNzdWUpXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIkV4aXN0ZW5jZUNoZWNrRmFpbGVkXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiUmF0ZUxpbWl0RXhjZWVkZWRBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1yYXRlLWxpbWl0LWV4Y2VlZGVkYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiByYXRlIGxpbWl0IGV4Y2VlZGVkIGV2ZW50cyBleGNlZWQgdGhyZXNob2xkIChwb3RlbnRpYWwgRERvUyBhdHRhY2spXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIlJhdGVMaW1pdEV4Y2VlZGVkXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIkR5bmFtb0RiRXhwb3J0Sm9iRmFpbHVyZUFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWR5bmFtb2RiLWV4cG9ydC1qb2ItZmFpbHVyZWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gRHluYW1vREIgZGFpbHkgZXhwb3J0IGpvYiBMYW1iZGEgZmFpbHMgKHBvdGVudGlhbCBkYXRhIGJhY2t1cCBnYXApXCIsXG4gICAgICBtZXRyaWM6IGR5bmFtb0RiRXhwb3J0Sm9iLmZ1bmN0aW9uLm1ldHJpY0Vycm9ycyh7XG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiU2xhY2tJbmdyZXNzV2FmQmxvY2tlZFJlcXVlc3RzQWxhcm1cIiwge1xuICAgICAgYWxhcm1OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tc2xhY2staW5ncmVzcy13YWYtYmxvY2tlZC1yZXF1ZXN0c2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gV0FGIGJsb2NrZWQgcmVxdWVzdHMgc3Bpa2Ugb24gU2xhY2sgaW5ncmVzcyBlbmRwb2ludFwiLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6IFwiQVdTL1dBRlYyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiQmxvY2tlZFJlcXVlc3RzXCIsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBXZWJBQ0w6IHNsYWNrSW5ncmVzc0FjbE5hbWUsXG4gICAgICAgICAgUmVnaW9uOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgICBSdWxlOiBcIkFMTFwiLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMjAwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiU2xhY2tFdmVudEhhbmRsZXJBcGlHYXRld2F5VXJsXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaUdhdGV3YXlVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogXCJTbGFjayBFdmVudCBIYW5kbGVyIEFQSSBHYXRld2F5IFVSTCAocmVjb21tZW5kZWQgaW5ncmVzcyBlbmRwb2ludClcIixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1TbGFja0V2ZW50SGFuZGxlckFwaUdhdGV3YXlVcmxgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJWZXJpZmljYXRpb25MYW1iZGFSb2xlQXJuXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmxhbWJkYVJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJWZXJpZmljYXRpb24gTGFtYmRhIFJvbGUgQVJOXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tVmVyaWZpY2F0aW9uTGFtYmRhUm9sZUFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlNsYWNrRXZlbnRIYW5kbGVyQXJuXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIEFSTlwiLFxuICAgIH0pO1xuICB9XG59XG4iXX0=