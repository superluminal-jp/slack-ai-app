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
const agent_registry_table_1 = require("./constructs/agent-registry-table");
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
        const agentRegistryTable = new agent_registry_table_1.AgentRegistryTable(this, "AgentRegistryTable");
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
            agentRegistryTable: agentRegistryTable.table,
            agentRegistryEnv: deploymentEnv,
            lifecycleConfiguration: {
                idleRuntimeSessionTimeoutSeconds: 900,
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
        new cdk.CfnOutput(this, "AgentRegistryTableName", {
            value: agentRegistryTable.table.tableName,
            description: "DynamoDB table for agent registry",
            exportName: `${this.stackName}-AgentRegistryTableName`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmVyaWZpY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLCtDQUFpQztBQUNqQyxpREFBbUM7QUFDbkMsMkRBQTZDO0FBQzdDLCtFQUFpRTtBQUNqRSx1RUFBeUQ7QUFDekQseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx1RUFBeUQ7QUFDekQsNkRBQStDO0FBRS9DLDJEQUFvRTtBQUNwRSxxQ0FBMEM7QUFDMUMsMEVBQXFFO0FBQ3JFLDhEQUEwRDtBQUMxRCw0REFBd0Q7QUFDeEQsOEVBQXlFO0FBQ3pFLG9FQUFnRTtBQUNoRSx3REFBb0Q7QUFDcEQsd0ZBQW1GO0FBQ25GLGdGQUEyRTtBQUMzRSw4REFBMEQ7QUFDMUQsNERBQXdEO0FBQ3hELDRFQUF1RTtBQUN2RSwwRUFBcUU7QUFDckUsNEVBQXVFO0FBQ3ZFLDBFQUFxRTtBQUNyRSw0RkFBc0Y7QUFDdEYsc0ZBQWlGO0FBQ2pGLDRFQUF1RTtBQUd2RTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7QUFDSCxNQUFhLGlCQUFrQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzlDLHFDQUFxQztJQUNyQixpQkFBaUIsQ0FBb0I7SUFFckQsMEJBQTBCO0lBQ1YsYUFBYSxDQUFTO0lBRXRDLDhDQUE4QztJQUM5QixhQUFhLENBQVM7SUFFdEMscURBQXFEO0lBQ3JDLHdCQUF3QixDQUEyQjtJQUVuRSxpREFBaUQ7SUFDakMsb0JBQW9CLENBQXVCO0lBRTNELHNEQUFzRDtJQUN0QywyQkFBMkIsQ0FBUztJQUVwRCxvREFBb0Q7SUFDcEMsb0JBQW9CLENBQWE7SUFFakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLGdC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SSxDQUFDLGFBQWE7WUFDekIsV0FBVyxFQUFFLG9FQUFvRTtZQUNqRixVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxpQ0FBaUM7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUNuRCxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWE7WUFDekIsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQyxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyw0QkFBNEI7U0FDMUQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxXQUFXO1lBQ2xELFdBQVcsRUFBRSw4QkFBOEI7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBaGpCRCw4Q0FnakJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gXCJjcnlwdG9cIjtcbmltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sb2dzXCI7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyXCI7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaFwiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSBcImF3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5XCI7XG5pbXBvcnQgKiBhcyB3YWZ2MiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXdhZnYyXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgYXBwbHlDb3N0QWxsb2NhdGlvblRhZ3MgfSBmcm9tIFwiQHNsYWNrLWFpLWFwcC9jZGstdG9vbGluZ1wiO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSBcImNkay1uYWdcIjtcbmltcG9ydCB7IFNsYWNrRXZlbnRIYW5kbGVyIH0gZnJvbSBcIi4vY29uc3RydWN0cy9zbGFjay1ldmVudC1oYW5kbGVyXCI7XG5pbXBvcnQgeyBUb2tlblN0b3JhZ2UgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3Rva2VuLXN0b3JhZ2VcIjtcbmltcG9ydCB7IEV2ZW50RGVkdXBlIH0gZnJvbSBcIi4vY29uc3RydWN0cy9ldmVudC1kZWR1cGVcIjtcbmltcG9ydCB7IEV4aXN0ZW5jZUNoZWNrQ2FjaGUgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2V4aXN0ZW5jZS1jaGVjay1jYWNoZVwiO1xuaW1wb3J0IHsgV2hpdGVsaXN0Q29uZmlnIH0gZnJvbSBcIi4vY29uc3RydWN0cy93aGl0ZWxpc3QtY29uZmlnXCI7XG5pbXBvcnQgeyBSYXRlTGltaXQgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3JhdGUtbGltaXRcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWVcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvbkFnZW50RWNyIH0gZnJvbSBcIi4vY29uc3RydWN0cy92ZXJpZmljYXRpb24tYWdlbnQtZWNyXCI7XG5pbXBvcnQgeyBBZ2VudEludm9rZXIgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2FnZW50LWludm9rZXJcIjtcbmltcG9ydCB7IFNsYWNrUG9zdGVyIH0gZnJvbSBcIi4vY29uc3RydWN0cy9zbGFjay1wb3N0ZXJcIjtcbmltcG9ydCB7IEZpbGVFeGNoYW5nZUJ1Y2tldCB9IGZyb20gXCIuL2NvbnN0cnVjdHMvZmlsZS1leGNoYW5nZS1idWNrZXRcIjtcbmltcG9ydCB7IFVzYWdlSGlzdG9yeVRhYmxlIH0gZnJvbSBcIi4vY29uc3RydWN0cy91c2FnZS1oaXN0b3J5LXRhYmxlXCI7XG5pbXBvcnQgeyBVc2FnZUhpc3RvcnlCdWNrZXQgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3VzYWdlLWhpc3RvcnktYnVja2V0XCI7XG5pbXBvcnQgeyBEeW5hbW9EYkV4cG9ydEpvYiB9IGZyb20gXCIuL2NvbnN0cnVjdHMvZHluYW1vZGItZXhwb3J0LWpvYlwiO1xuaW1wb3J0IHsgVXNhZ2VIaXN0b3J5QXJjaGl2ZUJ1Y2tldCB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdXNhZ2UtaGlzdG9yeS1hcmNoaXZlLWJ1Y2tldFwiO1xuaW1wb3J0IHsgVXNhZ2VIaXN0b3J5UmVwbGljYXRpb24gfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3VzYWdlLWhpc3RvcnktcmVwbGljYXRpb25cIjtcbmltcG9ydCB7IEFnZW50UmVnaXN0cnlUYWJsZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvYWdlbnQtcmVnaXN0cnktdGFibGVcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvblN0YWNrUHJvcHMgfSBmcm9tIFwiLi90eXBlcy9zdGFjay1jb25maWdcIjtcblxuLyoqXG4gKiBWZXJpZmljYXRpb24gU3RhY2sgKEFjY291bnQgQSAvIFZlcmlmaWNhdGlvbiBab25lKVxuICpcbiAqIFB1cnBvc2U6IEhhbmRsZXMgU2xhY2sgZXZlbnRzLCB2YWxpZGF0ZXMgYW5kIGF1dGhvcml6ZXMgcmVxdWVzdHMsIGFuZCBpbnZva2VzIHRoZSBWZXJpZmljYXRpb24gQWdlbnRcbiAqIChBZ2VudENvcmUgQTJBKS4gQ29tbXVuaWNhdGVzIHdpdGggRXhlY3V0aW9uIFN0YWNrIG9ubHkgdmlhIEFnZW50Q29yZSBBMkEgKFNpZ1Y0KTsgaW5ncmVzcyBpcyBleHBvc2VkIHZpYSBGdW5jdGlvbiBVUkwgYW5kIEFQSSBHYXRld2F5IChSZWdpb25hbCArIFdBRikuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczpcbiAqIC0gU2xhY2sgZXZlbnQgaW5nZXN0aW9uIChTbGFja0V2ZW50SGFuZGxlciBMYW1iZGEgd2l0aCBGdW5jdGlvbiBVUkwgYW5kIEFQSSBHYXRld2F5KVxuICogLSBEeW5hbW9EQiAodG9rZW4gc3RvcmFnZSwgZXZlbnQgZGVkdXBlLCBleGlzdGVuY2UgY2hlY2sgY2FjaGUsIHdoaXRlbGlzdCwgcmF0ZSBsaW1pdClcbiAqIC0gU2VjcmV0cyBNYW5hZ2VyIChTbGFjayBjcmVkZW50aWFscylcbiAqIC0gVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIChBMkEpIGFuZCBFQ1IgaW1hZ2VcbiAqIC0gQWdlbnQgaW52b2NhdGlvbiAoQWdlbnRJbnZva2VyLCBTbGFja1Bvc3RlciksIFMzIGZpbGUgZXhjaGFuZ2UgYnVja2V0LCBDbG91ZFdhdGNoIGFsYXJtc1xuICpcbiAqIElucHV0czogVmVyaWZpY2F0aW9uU3RhY2tQcm9wcyAoZW52LCBleGVjdXRpb25BY2NvdW50SWQsIHZlcmlmaWNhdGlvbkFnZW50TmFtZSwgZXhlY3V0aW9uQWdlbnRBcm5zLCBldGMuKTtcbiAqIGNvbnRleHQ6IGRlcGxveW1lbnRFbnYsIGF3c1JlZ2lvbiwgc2xhY2tCb3RUb2tlbiwgc2xhY2tTaWduaW5nU2VjcmV0LCBiZWRyb2NrTW9kZWxJZCwgZXhlY3V0aW9uQWdlbnRBcm5zLlxuICpcbiAqIE91dHB1dHM6IHNsYWNrRXZlbnRIYW5kbGVyLCBsYW1iZGFSb2xlQXJuLCB2ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4sIGFnZW50SW52b2NhdGlvblF1ZXVlOyBDZm5PdXRwdXRzIGZvciBVUkxzIGFuZCBBUk5zLlxuICovXG5leHBvcnQgY2xhc3MgVmVyaWZpY2F0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICAvKiogVGhlIFNsYWNrIEV2ZW50IEhhbmRsZXIgTGFtYmRhICovXG4gIHB1YmxpYyByZWFkb25seSBzbGFja0V2ZW50SGFuZGxlcjogU2xhY2tFdmVudEhhbmRsZXI7XG5cbiAgLyoqIFRoZSBMYW1iZGEgcm9sZSBBUk4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGxhbWJkYVJvbGVBcm46IHN0cmluZztcblxuICAvKiogQVBJIEdhdGV3YXkgVVJMIChXQUYtcHJvdGVjdGVkIGluZ3Jlc3MpICovXG4gIHB1YmxpYyByZWFkb25seSBhcGlHYXRld2F5VXJsOiBzdHJpbmc7XG5cbiAgLyoqIEFnZW50Q29yZSBSdW50aW1lIGZvciBWZXJpZmljYXRpb24gQWdlbnQgKEEyQSkgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50UnVudGltZTogVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lO1xuXG4gIC8qKiBBZ2VudENvcmUgRUNSIGltYWdlIGZvciBWZXJpZmljYXRpb24gQWdlbnQgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50RWNyOiBWZXJpZmljYXRpb25BZ2VudEVjcjtcblxuICAvKiogQWdlbnRDb3JlIFJ1bnRpbWUgQVJOIGZvciBjcm9zcy1zdGFjayByZWZlcmVuY2UgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybjogc3RyaW5nO1xuXG4gIC8qKiBTUVMgcXVldWUgZm9yIGFzeW5jIGFnZW50IGludm9jYXRpb24gcmVxdWVzdHMgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFnZW50SW52b2NhdGlvblF1ZXVlOiBzcXMuSVF1ZXVlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBWZXJpZmljYXRpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBkZXBsb3ltZW50RW52UmF3ID1cbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiKSB8fFxuICAgICAgcHJvY2Vzcy5lbnYuREVQTE9ZTUVOVF9FTlYgfHxcbiAgICAgIFwiZGV2XCI7XG4gICAgY29uc3QgZGVwbG95bWVudEVudiA9IGRlcGxveW1lbnRFbnZSYXcudG9Mb3dlckNhc2UoKS50cmltKCk7XG5cbiAgICBhcHBseUNvc3RBbGxvY2F0aW9uVGFncyh0aGlzLCB7IGRlcGxveW1lbnRFbnYgfSk7XG5cbiAgICBjb25zdCBzbGFja0JvdFRva2VuID1cbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJzbGFja0JvdFRva2VuXCIpIHx8XG4gICAgICBcIlwiO1xuICAgIGlmICghc2xhY2tCb3RUb2tlbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIlNMQUNLX0JPVF9UT0tFTiBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSAoU0xBQ0tfQk9UX1RPS0VOKSBvciBjb25maWcgZmlsZSAoc2xhY2tCb3RUb2tlbikuXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHNsYWNrU2lnbmluZ1NlY3JldCA9XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJzbGFja1NpZ25pbmdTZWNyZXRcIikgfHxcbiAgICAgIFwiXCI7XG4gICAgaWYgKCFzbGFja1NpZ25pbmdTZWNyZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJTTEFDS19TSUdOSU5HX1NFQ1JFVCBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSAoU0xBQ0tfU0lHTklOR19TRUNSRVQpIG9yIGNvbmZpZyBmaWxlIChzbGFja1NpZ25pbmdTZWNyZXQpLlwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBhd3NSZWdpb24gPVxuICAgICAgcHJvcHMuYXdzUmVnaW9uIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImF3c1JlZ2lvblwiKSB8fFxuICAgICAgXCJhcC1ub3J0aGVhc3QtMVwiO1xuICAgIGNvbnN0IGJlZHJvY2tNb2RlbElkID1cbiAgICAgIHByb3BzLmJlZHJvY2tNb2RlbElkIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImJlZHJvY2tNb2RlbElkXCIpIHx8XG4gICAgICBcImpwLmFudGhyb3BpYy5jbGF1ZGUtc29ubmV0LTQtNS0yMDI1MDkyOS12MTowXCI7XG4gICAgY29uc3Qgc2xhY2tTaWduaW5nU2VjcmV0UmVzb3VyY2UgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tTaWduaW5nU2VjcmV0XCIsXG4gICAgICB7XG4gICAgICAgIHNlY3JldE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS9zbGFjay9zaWduaW5nLXNlY3JldGAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIGFwcCBzaWduaW5nIHNlY3JldCBmb3IgcmVxdWVzdCB2ZXJpZmljYXRpb25cIixcbiAgICAgICAgc2VjcmV0U3RyaW5nVmFsdWU6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoc2xhY2tTaWduaW5nU2VjcmV0KSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrQm90VG9rZW5TZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tCb3RUb2tlblwiLFxuICAgICAge1xuICAgICAgICBzZWNyZXROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0vc2xhY2svYm90LXRva2VuYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgYm90IE9BdXRoIHRva2VuXCIsXG4gICAgICAgIHNlY3JldFN0cmluZ1ZhbHVlOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHNsYWNrQm90VG9rZW4pLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gU2xhY2sgY3JlZGVudGlhbHMgYXJlIHN0YXRpYyB0b2tlbnMgbWFuYWdlZCBleHRlcm5hbGx5IChTbGFjayBhcHAgY29uc29sZSkuXG4gICAgLy8gUHJvZ3JhbW1hdGljIHJvdGF0aW9uIGlzIG5vdCBhdmFpbGFibGUgZnJvbSBBV1MgYmVjYXVzZSB0aGUgdG9rZW4gaXMgaXNzdWVkIGFuZFxuICAgIC8vIGNvbnRyb2xsZWQgYnkgdGhlIFNsYWNrIHBsYXRmb3JtLCBub3QgYnkgYW4gQVdTLW1hbmFnZWQgc2VydmljZS5cbiAgICBmb3IgKGNvbnN0IHNlY3JldCBvZiBbc2xhY2tTaWduaW5nU2VjcmV0UmVzb3VyY2UsIHNsYWNrQm90VG9rZW5TZWNyZXRdKSB7XG4gICAgICBjb25zdCBzZWNyZXRSZXNvdXJjZSA9IHNlY3JldC5ub2RlLmRlZmF1bHRDaGlsZCA/PyBzZWNyZXQ7XG4gICAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgIHNlY3JldFJlc291cmNlLFxuICAgICAgICBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLVNNRzRcIixcbiAgICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgICAgXCJTbGFjayBzaWduaW5nIHNlY3JldCBhbmQgYm90IHRva2VuIGFyZSBpc3N1ZWQgYnkgdGhlIFNsYWNrIHBsYXRmb3JtIGFuZCBjYW5ub3QgYmUgcm90YXRlZCBcIiArXG4gICAgICAgICAgICAgIFwicHJvZ3JhbW1hdGljYWxseSB2aWEgQVdTIFNlY3JldHMgTWFuYWdlciByb3RhdGlvbiBMYW1iZGEuIFwiICtcbiAgICAgICAgICAgICAgXCJSb3RhdGlvbiBtdXN0IGJlIHBlcmZvcm1lZCBtYW51YWxseSB0aHJvdWdoIHRoZSBTbGFjayBBcHAgY29uc29sZS5cIixcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBPcmRlcjogRHluYW1vREIgdGFibGVzIGFuZCBTUVMvU2VjcmV0cyBmaXJzdDsgVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lIGRlcGVuZHMgb24gYWxsIG9mIHRoZW1cbiAgICBjb25zdCB0b2tlblN0b3JhZ2UgPSBuZXcgVG9rZW5TdG9yYWdlKHRoaXMsIFwiVG9rZW5TdG9yYWdlXCIpO1xuICAgIGNvbnN0IGV2ZW50RGVkdXBlID0gbmV3IEV2ZW50RGVkdXBlKHRoaXMsIFwiRXZlbnREZWR1cGVcIik7XG4gICAgY29uc3QgZXhpc3RlbmNlQ2hlY2tDYWNoZSA9IG5ldyBFeGlzdGVuY2VDaGVja0NhY2hlKFxuICAgICAgdGhpcyxcbiAgICAgIFwiRXhpc3RlbmNlQ2hlY2tDYWNoZVwiLFxuICAgICk7XG4gICAgY29uc3Qgd2hpdGVsaXN0Q29uZmlnID0gbmV3IFdoaXRlbGlzdENvbmZpZyh0aGlzLCBcIldoaXRlbGlzdENvbmZpZ1wiKTtcbiAgICBjb25zdCByYXRlTGltaXQgPSBuZXcgUmF0ZUxpbWl0KHRoaXMsIFwiUmF0ZUxpbWl0XCIpO1xuICAgIGNvbnN0IGZpbGVFeGNoYW5nZUJ1Y2tldCA9IG5ldyBGaWxlRXhjaGFuZ2VCdWNrZXQoXG4gICAgICB0aGlzLFxuICAgICAgXCJGaWxlRXhjaGFuZ2VCdWNrZXRcIixcbiAgICApO1xuICAgIGNvbnN0IHVzYWdlSGlzdG9yeVRhYmxlID0gbmV3IFVzYWdlSGlzdG9yeVRhYmxlKHRoaXMsIFwiVXNhZ2VIaXN0b3J5VGFibGVcIik7XG4gICAgY29uc3QgdXNhZ2VIaXN0b3J5QnVja2V0ID0gbmV3IFVzYWdlSGlzdG9yeUJ1Y2tldCh0aGlzLCBcIlVzYWdlSGlzdG9yeUJ1Y2tldFwiKTtcbiAgICBjb25zdCBkeW5hbW9EYkV4cG9ydEpvYiA9IG5ldyBEeW5hbW9EYkV4cG9ydEpvYih0aGlzLCBcIkR5bmFtb0RiRXhwb3J0Sm9iXCIsIHtcbiAgICAgIHRhYmxlOiB1c2FnZUhpc3RvcnlUYWJsZS50YWJsZSxcbiAgICAgIGJ1Y2tldDogdXNhZ2VIaXN0b3J5QnVja2V0LmJ1Y2tldCxcbiAgICB9KTtcbiAgICBjb25zdCB1c2FnZUhpc3RvcnlBcmNoaXZlQnVja2V0ID0gbmV3IFVzYWdlSGlzdG9yeUFyY2hpdmVCdWNrZXQoXG4gICAgICB0aGlzLFxuICAgICAgXCJVc2FnZUhpc3RvcnlBcmNoaXZlQnVja2V0XCJcbiAgICApO1xuICAgIG5ldyBVc2FnZUhpc3RvcnlSZXBsaWNhdGlvbih0aGlzLCBcIlVzYWdlSGlzdG9yeVJlcGxpY2F0aW9uXCIsIHtcbiAgICAgIHNvdXJjZUJ1Y2tldDogdXNhZ2VIaXN0b3J5QnVja2V0LmJ1Y2tldCxcbiAgICAgIGFyY2hpdmVCdWNrZXQ6IHVzYWdlSGlzdG9yeUFyY2hpdmVCdWNrZXQuYnVja2V0LFxuICAgICAgYXJjaGl2ZUFjY291bnRJZDogcHJvcHMuYXJjaGl2ZUFjY291bnRJZCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGFnZW50SW52b2NhdGlvbkRscSA9IG5ldyBzcXMuUXVldWUoXG4gICAgICB0aGlzLFxuICAgICAgXCJBZ2VudEludm9jYXRpb25SZXF1ZXN0RGxxXCIsXG4gICAgICB7XG4gICAgICAgIHF1ZXVlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWFnZW50LWludm9jYXRpb24tZGxxYCxcbiAgICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBWaXNpYmlsaXR5IHRpbWVvdXQgPj0gNiAqIEFnZW50IEludm9rZXIgTGFtYmRhIHRpbWVvdXQgKDkwMHMpIHBlciBBV1MgU1FTK0xhbWJkYSBiZXN0IHByYWN0aWNlOyBwcmV2ZW50cyByZWRyaXZlIGR1cmluZyBsb25nIHJ1bnNcbiAgICBjb25zdCBhZ2VudEludm9jYXRpb25RdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgXCJBZ2VudEludm9jYXRpb25SZXF1ZXN0XCIsIHtcbiAgICAgIHF1ZXVlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWFnZW50LWludm9jYXRpb24tcmVxdWVzdGAsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNTQwMCksXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogYWdlbnRJbnZvY2F0aW9uRGxxLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRoaXMuYWdlbnRJbnZvY2F0aW9uUXVldWUgPSBhZ2VudEludm9jYXRpb25RdWV1ZTtcblxuICAgIC8vIEVuZm9yY2UgVExTLWluLXRyYW5zaXQgKGRlbnkgbm9uLVNTTCBTUVMgcmVxdWVzdHMpLlxuICAgIGZvciAoY29uc3QgcXVldWUgb2YgW2FnZW50SW52b2NhdGlvbkRscSwgYWdlbnRJbnZvY2F0aW9uUXVldWVdKSB7XG4gICAgICBxdWV1ZS5hZGRUb1Jlc291cmNlUG9saWN5KFxuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgc2lkOiBcIkRlbnlJbnNlY3VyZVRyYW5zcG9ydFwiLFxuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5ERU5ZLFxuICAgICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgICAgICBhY3Rpb25zOiBbXCJzcXM6KlwiXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtxdWV1ZS5xdWV1ZUFybl0sXG4gICAgICAgICAgY29uZGl0aW9uczogeyBCb29sOiB7IFwiYXdzOlNlY3VyZVRyYW5zcG9ydFwiOiBcImZhbHNlXCIgfSB9LFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgYWdlbnRSZWdpc3RyeVRhYmxlID0gbmV3IEFnZW50UmVnaXN0cnlUYWJsZShcbiAgICAgIHRoaXMsXG4gICAgICBcIkFnZW50UmVnaXN0cnlUYWJsZVwiLFxuICAgICk7XG5cbiAgICAvLyBSdW50aW1lIG5hbWUgbXVzdCBiZSB1bmlxdWUgcGVyIGFjY291bnQgKERldiBhbmQgUHJvZCBjb2V4aXN0KTsgZGVmYXVsdCBpbmNsdWRlcyBlbnYgZnJvbSBzdGFjayBuYW1lXG4gICAgY29uc3QgdmVyaWZpY2F0aW9uQWdlbnROYW1lID1cbiAgICAgIHByb3BzLnZlcmlmaWNhdGlvbkFnZW50TmFtZSB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJ2ZXJpZmljYXRpb25BZ2VudE5hbWVcIikgfHxcbiAgICAgIGBTbGFja0FJX1ZlcmlmaWNhdGlvbkFnZW50XyR7dGhpcy5zdGFja05hbWUuaW5jbHVkZXMoXCItUHJvZFwiKSA/IFwiUHJvZFwiIDogXCJEZXZcIn1gO1xuICAgIGNvbnN0IGNvbnRleHRFeGVjdXRpb25BZ2VudEFybnNSYXcgPVxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJleGVjdXRpb25BZ2VudEFybnNcIik7XG4gICAgY29uc3QgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJucyA9XG4gICAgICBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3ICYmXG4gICAgICB0eXBlb2YgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyA9PT0gXCJvYmplY3RcIiAmJlxuICAgICAgIUFycmF5LmlzQXJyYXkoY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdylcbiAgICAgICAgPyAoY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KVxuICAgICAgICA6IHt9O1xuICAgIGNvbnN0IGV4ZWN1dGlvbkFnZW50QXJucyA9IHtcbiAgICAgIC4uLmNvbnRleHRFeGVjdXRpb25BZ2VudEFybnMsXG4gICAgICAuLi4ocHJvcHMuZXhlY3V0aW9uQWdlbnRBcm5zIHx8IHt9KSxcbiAgICB9O1xuXG4gICAgLy8gRUNSIGJlZm9yZSBSdW50aW1lIChSdW50aW1lIG5lZWRzIGNvbnRhaW5lckltYWdlVXJpKS4gU2xhY2tQb3N0ZXIgYW5kIExvZ0dyb3VwIGJlZm9yZSBSdW50aW1lIChvcHRpb25hbCBxdWV1ZSBhbmQgbG9nIGdyb3VwKS5cbiAgICB0aGlzLnZlcmlmaWNhdGlvbkFnZW50RWNyID0gbmV3IFZlcmlmaWNhdGlvbkFnZW50RWNyKFxuICAgICAgdGhpcyxcbiAgICAgIFwiVmVyaWZpY2F0aW9uQWdlbnRFY3JcIixcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tQb3N0ZXIgPSBuZXcgU2xhY2tQb3N0ZXIodGhpcywgXCJTbGFja1Bvc3RlclwiLCB7XG4gICAgICBzdGFja05hbWU6IHRoaXMuc3RhY2tOYW1lLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZXJyb3JEZWJ1Z0xvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAoXG4gICAgICB0aGlzLFxuICAgICAgXCJWZXJpZmljYXRpb25BZ2VudEVycm9yTG9nc1wiLFxuICAgICAge1xuICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2JlZHJvY2stYWdlbnRjb3JlLyR7dGhpcy5zdGFja05hbWV9LXZlcmlmaWNhdGlvbi1hZ2VudC1lcnJvcnNgLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lID0gbmV3IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZShcbiAgICAgIHRoaXMsXG4gICAgICBcIlZlcmlmaWNhdGlvbkFnZW50UnVudGltZVwiLFxuICAgICAge1xuICAgICAgICBhZ2VudFJ1bnRpbWVOYW1lOiB2ZXJpZmljYXRpb25BZ2VudE5hbWUsXG4gICAgICAgIGNvbnRhaW5lckltYWdlVXJpOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50RWNyLmltYWdlVXJpLFxuICAgICAgICB0b2tlblRhYmxlOiB0b2tlblN0b3JhZ2UudGFibGUsXG4gICAgICAgIGRlZHVwZVRhYmxlOiBldmVudERlZHVwZS50YWJsZSxcbiAgICAgICAgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlOiBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLFxuICAgICAgICB3aGl0ZWxpc3RDb25maWdUYWJsZTogd2hpdGVsaXN0Q29uZmlnLnRhYmxlLFxuICAgICAgICByYXRlTGltaXRUYWJsZTogcmF0ZUxpbWl0LnRhYmxlLFxuICAgICAgICBzbGFja1NpZ25pbmdTZWNyZXQ6IHNsYWNrU2lnbmluZ1NlY3JldFJlc291cmNlLFxuICAgICAgICBzbGFja0JvdFRva2VuU2VjcmV0OiBzbGFja0JvdFRva2VuU2VjcmV0LFxuICAgICAgICBleGVjdXRpb25BZ2VudEFybnM6XG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IGV4ZWN1dGlvbkFnZW50QXJuc1xuICAgICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIHNsYWNrUG9zdFJlcXVlc3RRdWV1ZTogc2xhY2tQb3N0ZXIucXVldWUsXG4gICAgICAgIGVycm9yRGVidWdMb2dHcm91cDogZXJyb3JEZWJ1Z0xvZ0dyb3VwLFxuICAgICAgICBmaWxlRXhjaGFuZ2VCdWNrZXQ6IGZpbGVFeGNoYW5nZUJ1Y2tldC5idWNrZXQsXG4gICAgICAgIHNsYWNrU2VhcmNoQWdlbnRBcm46XG4gICAgICAgICAgcHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybiB8fFxuICAgICAgICAgICh0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInNsYWNrU2VhcmNoQWdlbnRBcm5cIikgYXMgc3RyaW5nIHwgdW5kZWZpbmVkKSB8fFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgYWdlbnRSZWdpc3RyeVRhYmxlOiBhZ2VudFJlZ2lzdHJ5VGFibGUudGFibGUsXG4gICAgICAgIGFnZW50UmVnaXN0cnlFbnY6IGRlcGxveW1lbnRFbnYsXG4gICAgICAgIGxpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBpZGxlUnVudGltZVNlc3Npb25UaW1lb3V0U2Vjb25kczogOTAwLFxuICAgICAgICAgIG1heExpZmV0aW1lU2Vjb25kczogMzYwMCxcbiAgICAgICAgfSxcbiAgICAgICAgdXNhZ2VIaXN0b3J5VGFibGU6IHVzYWdlSGlzdG9yeVRhYmxlLnRhYmxlLFxuICAgICAgICB1c2FnZUhpc3RvcnlCdWNrZXQ6IHVzYWdlSGlzdG9yeUJ1Y2tldC5idWNrZXQsXG4gICAgICB9LFxuICAgICk7XG4gICAgdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4gPSB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZS5ydW50aW1lQXJuO1xuXG4gICAgLy8gUmV2aXNpb24gZnJvbSBzaWduaW5nIHNlY3JldCBzbyBMYW1iZGEgZW52IGNoYW5nZXMgd2hlbiBzZWNyZXQgY2hhbmdlczsgd2FybSBpbnN0YW5jZXMgdGhlbiByZWZldGNoIGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gICAgY29uc3QgY29uZmlnUmV2aXNpb24gPSBjcnlwdG9cbiAgICAgIC5jcmVhdGVIYXNoKFwic2hhMjU2XCIpXG4gICAgICAudXBkYXRlKHNsYWNrU2lnbmluZ1NlY3JldClcbiAgICAgIC5kaWdlc3QoXCJoZXhcIilcbiAgICAgIC5zbGljZSgwLCAxNik7XG5cbiAgICB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyID0gbmV3IFNsYWNrRXZlbnRIYW5kbGVyKHRoaXMsIFwiU2xhY2tFdmVudEhhbmRsZXJcIiwge1xuICAgICAgc2xhY2tTaWduaW5nU2VjcmV0OiBzbGFja1NpZ25pbmdTZWNyZXRSZXNvdXJjZSxcbiAgICAgIHNsYWNrQm90VG9rZW5TZWNyZXQ6IHNsYWNrQm90VG9rZW5TZWNyZXQsXG4gICAgICB0b2tlblRhYmxlTmFtZTogdG9rZW5TdG9yYWdlLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlZHVwZVRhYmxlTmFtZTogZXZlbnREZWR1cGUudGFibGUudGFibGVOYW1lLFxuICAgICAgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlTmFtZTogZXhpc3RlbmNlQ2hlY2tDYWNoZS50YWJsZS50YWJsZU5hbWUsXG4gICAgICB3aGl0ZWxpc3RDb25maWdUYWJsZU5hbWU6IHdoaXRlbGlzdENvbmZpZy50YWJsZS50YWJsZU5hbWUsXG4gICAgICByYXRlTGltaXRUYWJsZU5hbWU6IHJhdGVMaW1pdC50YWJsZS50YWJsZU5hbWUsXG4gICAgICBhd3NSZWdpb24sXG4gICAgICBiZWRyb2NrTW9kZWxJZCxcbiAgICAgIHZlcmlmaWNhdGlvbkFnZW50QXJuOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybixcbiAgICAgIGFnZW50SW52b2NhdGlvblF1ZXVlOiB0aGlzLmFnZW50SW52b2NhdGlvblF1ZXVlLFxuICAgICAgY29uZmlnUmV2aXNpb24sXG4gICAgICBhdXRvUmVwbHlDaGFubmVsSWRzOiBwcm9wcy5hdXRvUmVwbHlDaGFubmVsSWRzLFxuICAgICAgbWVudGlvbkNoYW5uZWxJZHM6IHByb3BzLm1lbnRpb25DaGFubmVsSWRzLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQXBpQWNjZXNzTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cChcbiAgICAgIHRoaXMsXG4gICAgICBcIlNsYWNrSW5ncmVzc0FwaUFjY2Vzc0xvZ3NcIixcbiAgICAgIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCBcIlNsYWNrSW5ncmVzc0FwaVwiLCB7XG4gICAgICBlbmRwb2ludENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgdHlwZXM6IFthcGlnYXRld2F5LkVuZHBvaW50VHlwZS5SRUdJT05BTF0sXG4gICAgICB9LFxuICAgICAgcmVzdEFwaU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1zbGFjay1pbmdyZXNzYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIGluZ3Jlc3MgZW5kcG9pbnQgZm9yIFNsYWNrRXZlbnRIYW5kbGVyIChBUEkgR2F0ZXdheSlcIixcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBcInByb2RcIixcbiAgICAgICAgdGhyb3R0bGluZ0J1cnN0TGltaXQ6IDUwLFxuICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiAyNSxcbiAgICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiBmYWxzZSxcbiAgICAgICAgYWNjZXNzTG9nRGVzdGluYXRpb246IG5ldyBhcGlnYXRld2F5LkxvZ0dyb3VwTG9nRGVzdGluYXRpb24oXG4gICAgICAgICAgc2xhY2tJbmdyZXNzQXBpQWNjZXNzTG9nR3JvdXAsXG4gICAgICAgICksXG4gICAgICAgIGFjY2Vzc0xvZ0Zvcm1hdDogYXBpZ2F0ZXdheS5BY2Nlc3NMb2dGb3JtYXQuanNvbldpdGhTdGFuZGFyZEZpZWxkcyh7XG4gICAgICAgICAgY2FsbGVyOiB0cnVlLFxuICAgICAgICAgIGh0dHBNZXRob2Q6IHRydWUsXG4gICAgICAgICAgaXA6IHRydWUsXG4gICAgICAgICAgcHJvdG9jb2w6IHRydWUsXG4gICAgICAgICAgcmVxdWVzdFRpbWU6IHRydWUsXG4gICAgICAgICAgcmVzb3VyY2VQYXRoOiB0cnVlLFxuICAgICAgICAgIHJlc3BvbnNlTGVuZ3RoOiB0cnVlLFxuICAgICAgICAgIHN0YXR1czogdHJ1ZSxcbiAgICAgICAgICB1c2VyOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgICBjbG91ZFdhdGNoUm9sZTogdHJ1ZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0xhbWJkYUludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uLFxuICAgICAgeyBwcm94eTogdHJ1ZSB9LFxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja1Jlc291cmNlID0gc2xhY2tJbmdyZXNzQXBpLnJvb3RcbiAgICAgIC5hZGRSZXNvdXJjZShcInNsYWNrXCIpXG4gICAgICAuYWRkUmVzb3VyY2UoXCJldmVudHNcIik7XG4gICAgc2xhY2tSZXNvdXJjZS5hZGRNZXRob2QoXCJQT1NUXCIsIHNsYWNrSW5ncmVzc0xhbWJkYUludGVncmF0aW9uKTtcblxuICAgIC8vIEFQSSBHYXRld2F5IGlzIGZyb250aW5nIGEgTGFtYmRhIHRoYXQgcGVyZm9ybXMgU2xhY2sgc2lnbmF0dXJlIHZlcmlmaWNhdGlvbiBhbmRcbiAgICAvLyBhZGRpdGlvbmFsIHNlY3VyaXR5IGNoZWNrcy4gQ0RLLW5hZyBleHBlY3RzIHJlcXVlc3QgdmFsaWRhdGlvbiBhbmQgYXV0aG9yaXphdGlvblxuICAgIC8vIGF0IHRoZSBBUEkgR2F0ZXdheSBsYXllcjsgZm9yIFNsYWNrIGV2ZW50IGluZ2VzdGlvbiwgdGhvc2UgYXJlIGltcGxlbWVudGVkIGluIHRoZSBMYW1iZGEuXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgc2xhY2tJbmdyZXNzQXBpLFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUFQSUcyXCIsXG4gICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgXCJTbGFjayBldmVudCBpbmdlc3Rpb24gdXNlcyBhIHByb3h5IExhbWJkYSBpbnRlZ3JhdGlvbi4gUmVxdWVzdCB2YWxpZGF0aW9uIGlzIHBlcmZvcm1lZCBpbiBcIiArXG4gICAgICAgICAgICBcInRoZSBMYW1iZGEgaGFuZGxlciAoU2xhY2sgc2lnbmF0dXJlIHZlcmlmaWNhdGlvbiArIHBheWxvYWQgdmFsaWRhdGlvbikgYmVmb3JlIGFueSBkb3duc3RyZWFtIGFjdGlvbnMuXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtQVBJRzRcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIkFQSSBHYXRld2F5IGF1dGhvcml6YXRpb24gaXMgaGFuZGxlZCBieSBTbGFjayByZXF1ZXN0IHNpZ25hdHVyZSB2ZXJpZmljYXRpb24gaW4gdGhlIExhbWJkYSBoYW5kbGVyLiBcIiArXG4gICAgICAgICAgICBcIlNsYWNrIGRvZXMgbm90IHN1cHBvcnQgQVdTLW5hdGl2ZSBhdXRob3JpemVycyBmb3IgdGhpcyBpbnRlZ3JhdGlvbiBwYXR0ZXJuLlwiLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUNPRzRcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIlNsYWNrIGV2ZW50cyBhcmUgYXV0aGVudGljYXRlZCB2aWEgU2xhY2sgcmVxdWVzdCBzaWduYXR1cmUgdmVyaWZpY2F0aW9uIGluIHRoZSBMYW1iZGEgaGFuZGxlciwgbm90IENvZ25pdG8gdXNlciBwb29scy5cIixcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU00XCIsXG4gICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgXCJBUEkgR2F0ZXdheSBpcyBjb25maWd1cmVkIHdpdGggQ2xvdWRXYXRjaCBsb2dnaW5nIGVuYWJsZWQsIHdoaWNoIHVzZXMgQVdTLW1hbmFnZWQgc2VydmljZSByb2xlIHBvbGljaWVzIFwiICtcbiAgICAgICAgICAgIFwiKEFtYXpvbkFQSUdhdGV3YXlQdXNoVG9DbG91ZFdhdGNoTG9ncykuIFVzaW5nIEFXUy1tYW5hZ2VkIHBvbGljaWVzIGlzIHRoZSBzdGFuZGFyZCBBV1MgcGF0dGVybiBoZXJlLlwiLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUFQSUc2XCIsXG4gICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgXCJTdGFnZS1sZXZlbCBsb2dnaW5nIGlzIGVuYWJsZWQgdmlhIGFjY2VzcyBsb2dzIGFuZCBtZXRob2QgbG9nZ2luZyBjb25maWd1cmF0aW9uIGluIGRlcGxveU9wdGlvbnMuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQWNsTmFtZSA9IGAke3RoaXMuc3RhY2tOYW1lfS1zbGFjay1pbmdyZXNzLWFjbGA7XG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQWNsTWV0cmljTmFtZSA9IGAke3RoaXMuc3RhY2tOYW1lfVNsYWNrSW5ncmVzc0FjbGAucmVwbGFjZShcbiAgICAgIC9bXkEtWmEtejAtOV0vZyxcbiAgICAgIFwiXCIsXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0FjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgXCJTbGFja0luZ3Jlc3NXZWJBY2xcIiwge1xuICAgICAgbmFtZTogc2xhY2tJbmdyZXNzQWNsTmFtZSxcbiAgICAgIGRlZmF1bHRBY3Rpb246IHsgYWxsb3c6IHt9IH0sXG4gICAgICBzY29wZTogXCJSRUdJT05BTFwiLFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IHNsYWNrSW5ncmVzc0FjbE1ldHJpY05hbWUsXG4gICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgcnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6IFwiQVdTLUFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXRcIixcbiAgICAgICAgICBwcmlvcml0eTogMCxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgdmVuZG9yTmFtZTogXCJBV1NcIixcbiAgICAgICAgICAgICAgbmFtZTogXCJBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0XCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiBcIkFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXRcIixcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6IFwiU2xhY2tJbmdyZXNzUmF0ZUxpbWl0XCIsXG4gICAgICAgICAgcHJpb3JpdHk6IDEwLFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6IFwiSVBcIixcbiAgICAgICAgICAgICAgbGltaXQ6IDIwMDAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiU2xhY2tJbmdyZXNzUmF0ZUxpbWl0XCIsXG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzU3RhZ2VBcm4gPSBgYXJuOmF3czphcGlnYXRld2F5OiR7dGhpcy5yZWdpb259OjovcmVzdGFwaXMvJHtzbGFja0luZ3Jlc3NBcGkucmVzdEFwaUlkfS9zdGFnZXMvJHtzbGFja0luZ3Jlc3NBcGkuZGVwbG95bWVudFN0YWdlLnN0YWdlTmFtZX1gO1xuXG4gICAgbmV3IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uKHRoaXMsIFwiU2xhY2tJbmdyZXNzV2ViQWNsQXNzb2NpYXRpb25cIiwge1xuICAgICAgd2ViQWNsQXJuOiBzbGFja0luZ3Jlc3NBY2wuYXR0ckFybixcbiAgICAgIHJlc291cmNlQXJuOiBzbGFja0luZ3Jlc3NTdGFnZUFybixcbiAgICB9KTtcblxuICAgIG5ldyBBZ2VudEludm9rZXIodGhpcywgXCJBZ2VudEludm9rZXJcIiwge1xuICAgICAgYWdlbnRJbnZvY2F0aW9uUXVldWU6IHRoaXMuYWdlbnRJbnZvY2F0aW9uUXVldWUsXG4gICAgICB2ZXJpZmljYXRpb25BZ2VudEFybjogdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4sXG4gICAgfSk7XG5cbiAgICB0b2tlblN0b3JhZ2UudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuICAgIGV2ZW50RGVkdXBlLnRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uKTtcbiAgICBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShcbiAgICAgIHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24sXG4gICAgKTtcbiAgICB3aGl0ZWxpc3RDb25maWcudGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uKTtcbiAgICByYXRlTGltaXQudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm5cIiwge1xuICAgICAgdmFsdWU6IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lLnJ1bnRpbWVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJWZXJpZmljYXRpb24gQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgQVJOXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tVmVyaWZpY2F0aW9uQWdlbnRBcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJBZ2VudFJlZ2lzdHJ5VGFibGVOYW1lXCIsIHtcbiAgICAgIHZhbHVlOiBhZ2VudFJlZ2lzdHJ5VGFibGUudGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IFwiRHluYW1vREIgdGFibGUgZm9yIGFnZW50IHJlZ2lzdHJ5XCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tQWdlbnRSZWdpc3RyeVRhYmxlTmFtZWAsXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYVJvbGVBcm4gPSB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uLnJvbGUhLnJvbGVBcm47XG4gICAgdGhpcy5hcGlHYXRld2F5VXJsID0gc2xhY2tJbmdyZXNzQXBpLnVybDtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiV2hpdGVsaXN0QXV0aG9yaXphdGlvbkZhaWx1cmVBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1XaGl0ZWxpc3RBdXRob3JpemF0aW9uRmFpbHVyZWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gd2hpdGVsaXN0IGF1dGhvcml6YXRpb24gZmFpbHVyZXMgZXhjZWVkIHRocmVzaG9sZCAoNSBmYWlsdXJlcyBpbiA1IG1pbnV0ZXMpXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIldoaXRlbGlzdEF1dGhvcml6YXRpb25GYWlsZWRcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJXaGl0ZWxpc3RDb25maWdMb2FkRXJyb3JBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1XaGl0ZWxpc3RDb25maWdMb2FkRXJyb3JgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogXCJBbGVydCB3aGVuIHdoaXRlbGlzdCBjb25maWd1cmF0aW9uIGxvYWQgZXJyb3JzIG9jY3VyXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIldoaXRlbGlzdENvbmZpZ0xvYWRFcnJvcnNcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJFeGlzdGVuY2VDaGVja0ZhaWxlZEFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWV4aXN0ZW5jZS1jaGVjay1mYWlsZWRgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjpcbiAgICAgICAgXCJBbGVydCB3aGVuIEV4aXN0ZW5jZSBDaGVjayBmYWlsdXJlcyBleGNlZWQgdGhyZXNob2xkIChwb3RlbnRpYWwgc2VjdXJpdHkgaXNzdWUpXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIkV4aXN0ZW5jZUNoZWNrRmFpbGVkXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiUmF0ZUxpbWl0RXhjZWVkZWRBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1yYXRlLWxpbWl0LWV4Y2VlZGVkYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiByYXRlIGxpbWl0IGV4Y2VlZGVkIGV2ZW50cyBleGNlZWQgdGhyZXNob2xkIChwb3RlbnRpYWwgRERvUyBhdHRhY2spXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIlJhdGVMaW1pdEV4Y2VlZGVkXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIkR5bmFtb0RiRXhwb3J0Sm9iRmFpbHVyZUFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWR5bmFtb2RiLWV4cG9ydC1qb2ItZmFpbHVyZWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gRHluYW1vREIgZGFpbHkgZXhwb3J0IGpvYiBMYW1iZGEgZmFpbHMgKHBvdGVudGlhbCBkYXRhIGJhY2t1cCBnYXApXCIsXG4gICAgICBtZXRyaWM6IGR5bmFtb0RiRXhwb3J0Sm9iLmZ1bmN0aW9uLm1ldHJpY0Vycm9ycyh7XG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiU2xhY2tJbmdyZXNzV2FmQmxvY2tlZFJlcXVlc3RzQWxhcm1cIiwge1xuICAgICAgYWxhcm1OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tc2xhY2staW5ncmVzcy13YWYtYmxvY2tlZC1yZXF1ZXN0c2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gV0FGIGJsb2NrZWQgcmVxdWVzdHMgc3Bpa2Ugb24gU2xhY2sgaW5ncmVzcyBlbmRwb2ludFwiLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6IFwiQVdTL1dBRlYyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiQmxvY2tlZFJlcXVlc3RzXCIsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBXZWJBQ0w6IHNsYWNrSW5ncmVzc0FjbE5hbWUsXG4gICAgICAgICAgUmVnaW9uOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgICBSdWxlOiBcIkFMTFwiLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMjAwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiU2xhY2tFdmVudEhhbmRsZXJBcGlHYXRld2F5VXJsXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaUdhdGV3YXlVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogXCJTbGFjayBFdmVudCBIYW5kbGVyIEFQSSBHYXRld2F5IFVSTCAocmVjb21tZW5kZWQgaW5ncmVzcyBlbmRwb2ludClcIixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1TbGFja0V2ZW50SGFuZGxlckFwaUdhdGV3YXlVcmxgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJWZXJpZmljYXRpb25MYW1iZGFSb2xlQXJuXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmxhbWJkYVJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJWZXJpZmljYXRpb24gTGFtYmRhIFJvbGUgQVJOXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tVmVyaWZpY2F0aW9uTGFtYmRhUm9sZUFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlNsYWNrRXZlbnRIYW5kbGVyQXJuXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIEFSTlwiLFxuICAgIH0pO1xuICB9XG59XG4iXX0=