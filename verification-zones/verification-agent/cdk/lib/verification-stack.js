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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmVyaWZpY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLCtDQUFpQztBQUNqQyxpREFBbUM7QUFDbkMsMkRBQTZDO0FBQzdDLCtFQUFpRTtBQUNqRSx1RUFBeUQ7QUFDekQseURBQTJDO0FBQzNDLHVFQUF5RDtBQUN6RCw2REFBK0M7QUFFL0MsMkRBQW9FO0FBQ3BFLDBFQUFxRTtBQUNyRSw4REFBMEQ7QUFDMUQsNERBQXdEO0FBQ3hELDhFQUF5RTtBQUN6RSxvRUFBZ0U7QUFDaEUsd0RBQW9EO0FBQ3BELHdGQUFtRjtBQUNuRixnRkFBMkU7QUFDM0UsOERBQTBEO0FBQzFELDREQUF3RDtBQUN4RCw0RUFBdUU7QUFHdkU7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBaUJHO0FBQ0gsTUFBYSxpQkFBa0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM5QyxxQ0FBcUM7SUFDckIsaUJBQWlCLENBQW9CO0lBRXJELDBCQUEwQjtJQUNWLGFBQWEsQ0FBUztJQUV0Qyw4Q0FBOEM7SUFDOUIsYUFBYSxDQUFTO0lBRXRDLHFEQUFxRDtJQUNyQyx3QkFBd0IsQ0FBMkI7SUFFbkUsaURBQWlEO0lBQ2pDLG9CQUFvQixDQUF1QjtJQUUzRCxzREFBc0Q7SUFDdEMsMkJBQTJCLENBQVM7SUFFcEQsMERBQTBEO0lBQzFDLG9CQUFvQixDQUFhO0lBRWpELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBNkI7UUFDckUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxnQkFBZ0IsR0FDcEIsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDO1lBQ3hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYztZQUMxQixLQUFLLENBQUM7UUFDUixN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LENBQUMsYUFBYTtZQUN6QixXQUFXLEVBQUUsb0VBQW9FO1lBQ2pGLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLGlDQUFpQztTQUMvRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDJCQUEyQixFQUFFO1lBQ25ELEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYTtZQUN6QixXQUFXLEVBQUUsOEJBQThCO1lBQzNDLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLDRCQUE0QjtTQUMxRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDbEQsV0FBVyxFQUFFLDhCQUE4QjtTQUM1QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0YkQsOENBc2JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gXCJjcnlwdG9cIjtcbmltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sb2dzXCI7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyXCI7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaFwiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheVwiO1xuaW1wb3J0ICogYXMgd2FmdjIgZnJvbSBcImF3cy1jZGstbGliL2F3cy13YWZ2MlwiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCB7IGFwcGx5Q29zdEFsbG9jYXRpb25UYWdzIH0gZnJvbSBcIkBzbGFjay1haS1hcHAvY2RrLXRvb2xpbmdcIjtcbmltcG9ydCB7IFNsYWNrRXZlbnRIYW5kbGVyIH0gZnJvbSBcIi4vY29uc3RydWN0cy9zbGFjay1ldmVudC1oYW5kbGVyXCI7XG5pbXBvcnQgeyBUb2tlblN0b3JhZ2UgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3Rva2VuLXN0b3JhZ2VcIjtcbmltcG9ydCB7IEV2ZW50RGVkdXBlIH0gZnJvbSBcIi4vY29uc3RydWN0cy9ldmVudC1kZWR1cGVcIjtcbmltcG9ydCB7IEV4aXN0ZW5jZUNoZWNrQ2FjaGUgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2V4aXN0ZW5jZS1jaGVjay1jYWNoZVwiO1xuaW1wb3J0IHsgV2hpdGVsaXN0Q29uZmlnIH0gZnJvbSBcIi4vY29uc3RydWN0cy93aGl0ZWxpc3QtY29uZmlnXCI7XG5pbXBvcnQgeyBSYXRlTGltaXQgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3JhdGUtbGltaXRcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWVcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvbkFnZW50RWNyIH0gZnJvbSBcIi4vY29uc3RydWN0cy92ZXJpZmljYXRpb24tYWdlbnQtZWNyXCI7XG5pbXBvcnQgeyBBZ2VudEludm9rZXIgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2FnZW50LWludm9rZXJcIjtcbmltcG9ydCB7IFNsYWNrUG9zdGVyIH0gZnJvbSBcIi4vY29uc3RydWN0cy9zbGFjay1wb3N0ZXJcIjtcbmltcG9ydCB7IEZpbGVFeGNoYW5nZUJ1Y2tldCB9IGZyb20gXCIuL2NvbnN0cnVjdHMvZmlsZS1leGNoYW5nZS1idWNrZXRcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvblN0YWNrUHJvcHMgfSBmcm9tIFwiLi90eXBlcy9zdGFjay1jb25maWdcIjtcblxuLyoqXG4gKiBWZXJpZmljYXRpb24gU3RhY2sgKEFjY291bnQgQSAvIFZlcmlmaWNhdGlvbiBab25lKVxuICpcbiAqIFB1cnBvc2U6IEhhbmRsZXMgU2xhY2sgZXZlbnRzLCB2YWxpZGF0ZXMgYW5kIGF1dGhvcml6ZXMgcmVxdWVzdHMsIGFuZCBpbnZva2VzIHRoZSBWZXJpZmljYXRpb24gQWdlbnRcbiAqIChBZ2VudENvcmUgQTJBKS4gQ29tbXVuaWNhdGVzIHdpdGggRXhlY3V0aW9uIFN0YWNrIG9ubHkgdmlhIEFnZW50Q29yZSBBMkEgKFNpZ1Y0KTsgaW5ncmVzcyBpcyBleHBvc2VkIHZpYSBGdW5jdGlvbiBVUkwgYW5kIEFQSSBHYXRld2F5IChSZWdpb25hbCArIFdBRikuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczpcbiAqIC0gU2xhY2sgZXZlbnQgaW5nZXN0aW9uIChTbGFja0V2ZW50SGFuZGxlciBMYW1iZGEgd2l0aCBGdW5jdGlvbiBVUkwgYW5kIEFQSSBHYXRld2F5KVxuICogLSBEeW5hbW9EQiAodG9rZW4gc3RvcmFnZSwgZXZlbnQgZGVkdXBlLCBleGlzdGVuY2UgY2hlY2sgY2FjaGUsIHdoaXRlbGlzdCwgcmF0ZSBsaW1pdClcbiAqIC0gU2VjcmV0cyBNYW5hZ2VyIChTbGFjayBjcmVkZW50aWFscylcbiAqIC0gVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIChBMkEpIGFuZCBFQ1IgaW1hZ2VcbiAqIC0gQWdlbnQgaW52b2NhdGlvbiAoQWdlbnRJbnZva2VyLCBTbGFja1Bvc3RlciksIFMzIGZpbGUgZXhjaGFuZ2UgYnVja2V0LCBDbG91ZFdhdGNoIGFsYXJtc1xuICpcbiAqIElucHV0czogVmVyaWZpY2F0aW9uU3RhY2tQcm9wcyAoZW52LCBleGVjdXRpb25BY2NvdW50SWQsIHZlcmlmaWNhdGlvbkFnZW50TmFtZSwgZXhlY3V0aW9uQWdlbnRBcm5zLCBldGMuKTtcbiAqIGNvbnRleHQ6IGRlcGxveW1lbnRFbnYsIGF3c1JlZ2lvbiwgc2xhY2tCb3RUb2tlbiwgc2xhY2tTaWduaW5nU2VjcmV0LCBiZWRyb2NrTW9kZWxJZCwgZXhlY3V0aW9uQWdlbnRBcm5zLlxuICpcbiAqIE91dHB1dHM6IHNsYWNrRXZlbnRIYW5kbGVyLCBsYW1iZGFSb2xlQXJuLCB2ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4sIGFnZW50SW52b2NhdGlvblF1ZXVlOyBDZm5PdXRwdXRzIGZvciBVUkxzIGFuZCBBUk5zLlxuICovXG5leHBvcnQgY2xhc3MgVmVyaWZpY2F0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICAvKiogVGhlIFNsYWNrIEV2ZW50IEhhbmRsZXIgTGFtYmRhICovXG4gIHB1YmxpYyByZWFkb25seSBzbGFja0V2ZW50SGFuZGxlcjogU2xhY2tFdmVudEhhbmRsZXI7XG5cbiAgLyoqIFRoZSBMYW1iZGEgcm9sZSBBUk4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGxhbWJkYVJvbGVBcm46IHN0cmluZztcblxuICAvKiogQVBJIEdhdGV3YXkgVVJMIChXQUYtcHJvdGVjdGVkIGluZ3Jlc3MpICovXG4gIHB1YmxpYyByZWFkb25seSBhcGlHYXRld2F5VXJsOiBzdHJpbmc7XG5cbiAgLyoqIEFnZW50Q29yZSBSdW50aW1lIGZvciBWZXJpZmljYXRpb24gQWdlbnQgKEEyQSkgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50UnVudGltZTogVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lO1xuXG4gIC8qKiBBZ2VudENvcmUgRUNSIGltYWdlIGZvciBWZXJpZmljYXRpb24gQWdlbnQgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50RWNyOiBWZXJpZmljYXRpb25BZ2VudEVjcjtcblxuICAvKiogQWdlbnRDb3JlIFJ1bnRpbWUgQVJOIGZvciBjcm9zcy1zdGFjayByZWZlcmVuY2UgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybjogc3RyaW5nO1xuXG4gIC8qKiBTUVMgcXVldWUgZm9yIGFzeW5jIGFnZW50IGludm9jYXRpb24gcmVxdWVzdHMgKDAxNikgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFnZW50SW52b2NhdGlvblF1ZXVlOiBzcXMuSVF1ZXVlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBWZXJpZmljYXRpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBkZXBsb3ltZW50RW52UmF3ID1cbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiKSB8fFxuICAgICAgcHJvY2Vzcy5lbnYuREVQTE9ZTUVOVF9FTlYgfHxcbiAgICAgIFwiZGV2XCI7XG4gICAgY29uc3QgZGVwbG95bWVudEVudiA9IGRlcGxveW1lbnRFbnZSYXcudG9Mb3dlckNhc2UoKS50cmltKCk7XG5cbiAgICBhcHBseUNvc3RBbGxvY2F0aW9uVGFncyh0aGlzLCB7IGRlcGxveW1lbnRFbnYgfSk7XG5cbiAgICBjb25zdCBzbGFja0JvdFRva2VuID1cbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJzbGFja0JvdFRva2VuXCIpIHx8XG4gICAgICBcIlwiO1xuICAgIGlmICghc2xhY2tCb3RUb2tlbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIlNMQUNLX0JPVF9UT0tFTiBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSAoU0xBQ0tfQk9UX1RPS0VOKSBvciBjb25maWcgZmlsZSAoc2xhY2tCb3RUb2tlbikuXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHNsYWNrU2lnbmluZ1NlY3JldCA9XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJzbGFja1NpZ25pbmdTZWNyZXRcIikgfHxcbiAgICAgIFwiXCI7XG4gICAgaWYgKCFzbGFja1NpZ25pbmdTZWNyZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJTTEFDS19TSUdOSU5HX1NFQ1JFVCBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSAoU0xBQ0tfU0lHTklOR19TRUNSRVQpIG9yIGNvbmZpZyBmaWxlIChzbGFja1NpZ25pbmdTZWNyZXQpLlwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBhd3NSZWdpb24gPVxuICAgICAgcHJvcHMuYXdzUmVnaW9uIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImF3c1JlZ2lvblwiKSB8fFxuICAgICAgXCJhcC1ub3J0aGVhc3QtMVwiO1xuICAgIGNvbnN0IGJlZHJvY2tNb2RlbElkID1cbiAgICAgIHByb3BzLmJlZHJvY2tNb2RlbElkIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImJlZHJvY2tNb2RlbElkXCIpIHx8XG4gICAgICBcImpwLmFudGhyb3BpYy5jbGF1ZGUtc29ubmV0LTQtNS0yMDI1MDkyOS12MTowXCI7XG4gICAgY29uc3Qgc2xhY2tTaWduaW5nU2VjcmV0UmVzb3VyY2UgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tTaWduaW5nU2VjcmV0XCIsXG4gICAgICB7XG4gICAgICAgIHNlY3JldE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS9zbGFjay9zaWduaW5nLXNlY3JldGAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIGFwcCBzaWduaW5nIHNlY3JldCBmb3IgcmVxdWVzdCB2ZXJpZmljYXRpb25cIixcbiAgICAgICAgc2VjcmV0U3RyaW5nVmFsdWU6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoc2xhY2tTaWduaW5nU2VjcmV0KSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrQm90VG9rZW5TZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tCb3RUb2tlblwiLFxuICAgICAge1xuICAgICAgICBzZWNyZXROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0vc2xhY2svYm90LXRva2VuYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgYm90IE9BdXRoIHRva2VuXCIsXG4gICAgICAgIHNlY3JldFN0cmluZ1ZhbHVlOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHNsYWNrQm90VG9rZW4pLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gT3JkZXI6IER5bmFtb0RCIHRhYmxlcyBhbmQgU1FTL1NlY3JldHMgZmlyc3Q7IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSBkZXBlbmRzIG9uIGFsbCBvZiB0aGVtXG4gICAgY29uc3QgdG9rZW5TdG9yYWdlID0gbmV3IFRva2VuU3RvcmFnZSh0aGlzLCBcIlRva2VuU3RvcmFnZVwiKTtcbiAgICBjb25zdCBldmVudERlZHVwZSA9IG5ldyBFdmVudERlZHVwZSh0aGlzLCBcIkV2ZW50RGVkdXBlXCIpO1xuICAgIGNvbnN0IGV4aXN0ZW5jZUNoZWNrQ2FjaGUgPSBuZXcgRXhpc3RlbmNlQ2hlY2tDYWNoZShcbiAgICAgIHRoaXMsXG4gICAgICBcIkV4aXN0ZW5jZUNoZWNrQ2FjaGVcIixcbiAgICApO1xuICAgIGNvbnN0IHdoaXRlbGlzdENvbmZpZyA9IG5ldyBXaGl0ZWxpc3RDb25maWcodGhpcywgXCJXaGl0ZWxpc3RDb25maWdcIik7XG4gICAgY29uc3QgcmF0ZUxpbWl0ID0gbmV3IFJhdGVMaW1pdCh0aGlzLCBcIlJhdGVMaW1pdFwiKTtcbiAgICBjb25zdCBmaWxlRXhjaGFuZ2VCdWNrZXQgPSBuZXcgRmlsZUV4Y2hhbmdlQnVja2V0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiRmlsZUV4Y2hhbmdlQnVja2V0XCIsXG4gICAgKTtcblxuICAgIGNvbnN0IGFnZW50SW52b2NhdGlvbkRscSA9IG5ldyBzcXMuUXVldWUoXG4gICAgICB0aGlzLFxuICAgICAgXCJBZ2VudEludm9jYXRpb25SZXF1ZXN0RGxxXCIsXG4gICAgICB7XG4gICAgICAgIHF1ZXVlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWFnZW50LWludm9jYXRpb24tZGxxYCxcbiAgICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBWaXNpYmlsaXR5IHRpbWVvdXQgPj0gNiAqIEFnZW50IEludm9rZXIgTGFtYmRhIHRpbWVvdXQgKDkwMHMpIHBlciBBV1MgU1FTK0xhbWJkYSBiZXN0IHByYWN0aWNlOyBwcmV2ZW50cyByZWRyaXZlIGR1cmluZyBsb25nIHJ1bnNcbiAgICBjb25zdCBhZ2VudEludm9jYXRpb25RdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgXCJBZ2VudEludm9jYXRpb25SZXF1ZXN0XCIsIHtcbiAgICAgIHF1ZXVlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWFnZW50LWludm9jYXRpb24tcmVxdWVzdGAsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNTQwMCksXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogYWdlbnRJbnZvY2F0aW9uRGxxLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRoaXMuYWdlbnRJbnZvY2F0aW9uUXVldWUgPSBhZ2VudEludm9jYXRpb25RdWV1ZTtcblxuICAgIC8vIFJ1bnRpbWUgbmFtZSBtdXN0IGJlIHVuaXF1ZSBwZXIgYWNjb3VudCAoRGV2IGFuZCBQcm9kIGNvZXhpc3QpOyBkZWZhdWx0IGluY2x1ZGVzIGVudiBmcm9tIHN0YWNrIG5hbWVcbiAgICBjb25zdCB2ZXJpZmljYXRpb25BZ2VudE5hbWUgPVxuICAgICAgcHJvcHMudmVyaWZpY2F0aW9uQWdlbnROYW1lIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInZlcmlmaWNhdGlvbkFnZW50TmFtZVwiKSB8fFxuICAgICAgYFNsYWNrQUlfVmVyaWZpY2F0aW9uQWdlbnRfJHt0aGlzLnN0YWNrTmFtZS5pbmNsdWRlcyhcIi1Qcm9kXCIpID8gXCJQcm9kXCIgOiBcIkRldlwifWA7XG4gICAgY29uc3QgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyA9XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImV4ZWN1dGlvbkFnZW50QXJuc1wiKTtcbiAgICBjb25zdCBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zID1cbiAgICAgIGNvbnRleHRFeGVjdXRpb25BZ2VudEFybnNSYXcgJiZcbiAgICAgIHR5cGVvZiBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3ID09PSBcIm9iamVjdFwiICYmXG4gICAgICAhQXJyYXkuaXNBcnJheShjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3KVxuICAgICAgICA/IChjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pXG4gICAgICAgIDoge307XG4gICAgY29uc3QgZXhlY3V0aW9uQWdlbnRBcm5zID0ge1xuICAgICAgLi4uY29udGV4dEV4ZWN1dGlvbkFnZW50QXJucyxcbiAgICAgIC4uLihwcm9wcy5leGVjdXRpb25BZ2VudEFybnMgfHwge30pLFxuICAgIH07XG5cbiAgICAvLyBFQ1IgYmVmb3JlIFJ1bnRpbWUgKFJ1bnRpbWUgbmVlZHMgY29udGFpbmVySW1hZ2VVcmkpLiBTbGFja1Bvc3RlciBhbmQgTG9nR3JvdXAgYmVmb3JlIFJ1bnRpbWUgKG9wdGlvbmFsIHF1ZXVlIGFuZCBsb2cgZ3JvdXApLlxuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRFY3IgPSBuZXcgVmVyaWZpY2F0aW9uQWdlbnRFY3IoXG4gICAgICB0aGlzLFxuICAgICAgXCJWZXJpZmljYXRpb25BZ2VudEVjclwiLFxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja1Bvc3RlciA9IG5ldyBTbGFja1Bvc3Rlcih0aGlzLCBcIlNsYWNrUG9zdGVyXCIsIHtcbiAgICAgIHN0YWNrTmFtZTogdGhpcy5zdGFja05hbWUsXG4gICAgfSk7XG5cbiAgICBjb25zdCBlcnJvckRlYnVnTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cChcbiAgICAgIHRoaXMsXG4gICAgICBcIlZlcmlmaWNhdGlvbkFnZW50RXJyb3JMb2dzXCIsXG4gICAgICB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvYmVkcm9jay1hZ2VudGNvcmUvJHt0aGlzLnN0YWNrTmFtZX0tdmVyaWZpY2F0aW9uLWFnZW50LWVycm9yc2AsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUgPSBuZXcgVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lKFxuICAgICAgdGhpcyxcbiAgICAgIFwiVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lXCIsXG4gICAgICB7XG4gICAgICAgIGFnZW50UnVudGltZU5hbWU6IHZlcmlmaWNhdGlvbkFnZW50TmFtZSxcbiAgICAgICAgY29udGFpbmVySW1hZ2VVcmk6IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRFY3IuaW1hZ2VVcmksXG4gICAgICAgIHRva2VuVGFibGU6IHRva2VuU3RvcmFnZS50YWJsZSxcbiAgICAgICAgZGVkdXBlVGFibGU6IGV2ZW50RGVkdXBlLnRhYmxlLFxuICAgICAgICBleGlzdGVuY2VDaGVja0NhY2hlVGFibGU6IGV4aXN0ZW5jZUNoZWNrQ2FjaGUudGFibGUsXG4gICAgICAgIHdoaXRlbGlzdENvbmZpZ1RhYmxlOiB3aGl0ZWxpc3RDb25maWcudGFibGUsXG4gICAgICAgIHJhdGVMaW1pdFRhYmxlOiByYXRlTGltaXQudGFibGUsXG4gICAgICAgIHNsYWNrU2lnbmluZ1NlY3JldDogc2xhY2tTaWduaW5nU2VjcmV0UmVzb3VyY2UsXG4gICAgICAgIHNsYWNrQm90VG9rZW5TZWNyZXQ6IHNsYWNrQm90VG9rZW5TZWNyZXQsXG4gICAgICAgIGV4ZWN1dGlvbkFnZW50QXJuczpcbiAgICAgICAgICBPYmplY3Qua2V5cyhleGVjdXRpb25BZ2VudEFybnMpLmxlbmd0aCA+IDBcbiAgICAgICAgICAgID8gZXhlY3V0aW9uQWdlbnRBcm5zXG4gICAgICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgICAgc2xhY2tQb3N0UmVxdWVzdFF1ZXVlOiBzbGFja1Bvc3Rlci5xdWV1ZSxcbiAgICAgICAgZXJyb3JEZWJ1Z0xvZ0dyb3VwOiBlcnJvckRlYnVnTG9nR3JvdXAsXG4gICAgICAgIGZpbGVFeGNoYW5nZUJ1Y2tldDogZmlsZUV4Y2hhbmdlQnVja2V0LmJ1Y2tldCxcbiAgICAgICAgc2xhY2tTZWFyY2hBZ2VudEFybjpcbiAgICAgICAgICBwcm9wcy5zbGFja1NlYXJjaEFnZW50QXJuIHx8XG4gICAgICAgICAgKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwic2xhY2tTZWFyY2hBZ2VudEFyblwiKSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpIHx8XG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgfSxcbiAgICApO1xuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuID0gdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUucnVudGltZUFybjtcblxuICAgIC8vIFJldmlzaW9uIGZyb20gc2lnbmluZyBzZWNyZXQgc28gTGFtYmRhIGVudiBjaGFuZ2VzIHdoZW4gc2VjcmV0IGNoYW5nZXM7IHdhcm0gaW5zdGFuY2VzIHRoZW4gcmVmZXRjaCBmcm9tIFNlY3JldHMgTWFuYWdlclxuICAgIGNvbnN0IGNvbmZpZ1JldmlzaW9uID0gY3J5cHRvXG4gICAgICAuY3JlYXRlSGFzaChcInNoYTI1NlwiKVxuICAgICAgLnVwZGF0ZShzbGFja1NpZ25pbmdTZWNyZXQpXG4gICAgICAuZGlnZXN0KFwiaGV4XCIpXG4gICAgICAuc2xpY2UoMCwgMTYpO1xuXG4gICAgdGhpcy5zbGFja0V2ZW50SGFuZGxlciA9IG5ldyBTbGFja0V2ZW50SGFuZGxlcih0aGlzLCBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsIHtcbiAgICAgIHNsYWNrU2lnbmluZ1NlY3JldDogc2xhY2tTaWduaW5nU2VjcmV0UmVzb3VyY2UsXG4gICAgICBzbGFja0JvdFRva2VuU2VjcmV0OiBzbGFja0JvdFRva2VuU2VjcmV0LFxuICAgICAgdG9rZW5UYWJsZU5hbWU6IHRva2VuU3RvcmFnZS50YWJsZS50YWJsZU5hbWUsXG4gICAgICBkZWR1cGVUYWJsZU5hbWU6IGV2ZW50RGVkdXBlLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZU5hbWU6IGV4aXN0ZW5jZUNoZWNrQ2FjaGUudGFibGUudGFibGVOYW1lLFxuICAgICAgd2hpdGVsaXN0Q29uZmlnVGFibGVOYW1lOiB3aGl0ZWxpc3RDb25maWcudGFibGUudGFibGVOYW1lLFxuICAgICAgcmF0ZUxpbWl0VGFibGVOYW1lOiByYXRlTGltaXQudGFibGUudGFibGVOYW1lLFxuICAgICAgYXdzUmVnaW9uLFxuICAgICAgYmVkcm9ja01vZGVsSWQsXG4gICAgICB2ZXJpZmljYXRpb25BZ2VudEFybjogdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4sXG4gICAgICBhZ2VudEludm9jYXRpb25RdWV1ZTogdGhpcy5hZ2VudEludm9jYXRpb25RdWV1ZSxcbiAgICAgIGNvbmZpZ1JldmlzaW9uLFxuICAgICAgYXV0b1JlcGx5Q2hhbm5lbElkczogcHJvcHMuYXV0b1JlcGx5Q2hhbm5lbElkcyxcbiAgICAgIG1lbnRpb25DaGFubmVsSWRzOiBwcm9wcy5tZW50aW9uQ2hhbm5lbElkcyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0FwaUFjY2Vzc0xvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAoXG4gICAgICB0aGlzLFxuICAgICAgXCJTbGFja0luZ3Jlc3NBcGlBY2Nlc3NMb2dzXCIsXG4gICAgICB7XG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0FwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgXCJTbGFja0luZ3Jlc3NBcGlcIiwge1xuICAgICAgZW5kcG9pbnRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIHR5cGVzOiBbYXBpZ2F0ZXdheS5FbmRwb2ludFR5cGUuUkVHSU9OQUxdLFxuICAgICAgfSxcbiAgICAgIHJlc3RBcGlOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tc2xhY2staW5ncmVzc2AsXG4gICAgICBkZXNjcmlwdGlvbjogXCJTbGFjayBpbmdyZXNzIGVuZHBvaW50IGZvciBTbGFja0V2ZW50SGFuZGxlciAoQVBJIEdhdGV3YXkpXCIsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogXCJwcm9kXCIsXG4gICAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiA1MCxcbiAgICAgICAgdGhyb3R0bGluZ1JhdGVMaW1pdDogMjUsXG4gICAgICAgIGFjY2Vzc0xvZ0Rlc3RpbmF0aW9uOiBuZXcgYXBpZ2F0ZXdheS5Mb2dHcm91cExvZ0Rlc3RpbmF0aW9uKFxuICAgICAgICAgIHNsYWNrSW5ncmVzc0FwaUFjY2Vzc0xvZ0dyb3VwLFxuICAgICAgICApLFxuICAgICAgICBhY2Nlc3NMb2dGb3JtYXQ6IGFwaWdhdGV3YXkuQWNjZXNzTG9nRm9ybWF0Lmpzb25XaXRoU3RhbmRhcmRGaWVsZHMoe1xuICAgICAgICAgIGNhbGxlcjogdHJ1ZSxcbiAgICAgICAgICBodHRwTWV0aG9kOiB0cnVlLFxuICAgICAgICAgIGlwOiB0cnVlLFxuICAgICAgICAgIHByb3RvY29sOiB0cnVlLFxuICAgICAgICAgIHJlcXVlc3RUaW1lOiB0cnVlLFxuICAgICAgICAgIHJlc291cmNlUGF0aDogdHJ1ZSxcbiAgICAgICAgICByZXNwb25zZUxlbmd0aDogdHJ1ZSxcbiAgICAgICAgICBzdGF0dXM6IHRydWUsXG4gICAgICAgICAgdXNlcjogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgICAgY2xvdWRXYXRjaFJvbGU6IHRydWUsXG4gICAgfSk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NMYW1iZGFJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbixcbiAgICAgIHsgcHJveHk6IHRydWUgfSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tSZXNvdXJjZSA9IHNsYWNrSW5ncmVzc0FwaS5yb290XG4gICAgICAuYWRkUmVzb3VyY2UoXCJzbGFja1wiKVxuICAgICAgLmFkZFJlc291cmNlKFwiZXZlbnRzXCIpO1xuICAgIHNsYWNrUmVzb3VyY2UuYWRkTWV0aG9kKFwiUE9TVFwiLCBzbGFja0luZ3Jlc3NMYW1iZGFJbnRlZ3JhdGlvbik7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBY2xOYW1lID0gYCR7dGhpcy5zdGFja05hbWV9LXNsYWNrLWluZ3Jlc3MtYWNsYDtcbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBY2xNZXRyaWNOYW1lID0gYCR7dGhpcy5zdGFja05hbWV9U2xhY2tJbmdyZXNzQWNsYC5yZXBsYWNlKFxuICAgICAgL1teQS1aYS16MC05XS9nLFxuICAgICAgXCJcIixcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQWNsID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCBcIlNsYWNrSW5ncmVzc1dlYkFjbFwiLCB7XG4gICAgICBuYW1lOiBzbGFja0luZ3Jlc3NBY2xOYW1lLFxuICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgIHNjb3BlOiBcIlJFR0lPTkFMXCIsXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogc2xhY2tJbmdyZXNzQWNsTWV0cmljTmFtZSxcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBydWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogXCJBV1MtQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldFwiLFxuICAgICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiBcIkFXU1wiLFxuICAgICAgICAgICAgICBuYW1lOiBcIkFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXRcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldFwiLFxuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogXCJTbGFja0luZ3Jlc3NSYXRlTGltaXRcIixcbiAgICAgICAgICBwcmlvcml0eTogMTAsXG4gICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogXCJJUFwiLFxuICAgICAgICAgICAgICBsaW1pdDogMjAwMCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogXCJTbGFja0luZ3Jlc3NSYXRlTGltaXRcIixcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NTdGFnZUFybiA9IGBhcm46YXdzOmFwaWdhdGV3YXk6JHt0aGlzLnJlZ2lvbn06Oi9yZXN0YXBpcy8ke3NsYWNrSW5ncmVzc0FwaS5yZXN0QXBpSWR9L3N0YWdlcy8ke3NsYWNrSW5ncmVzc0FwaS5kZXBsb3ltZW50U3RhZ2Uuc3RhZ2VOYW1lfWA7XG5cbiAgICBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgXCJTbGFja0luZ3Jlc3NXZWJBY2xBc3NvY2lhdGlvblwiLCB7XG4gICAgICB3ZWJBY2xBcm46IHNsYWNrSW5ncmVzc0FjbC5hdHRyQXJuLFxuICAgICAgcmVzb3VyY2VBcm46IHNsYWNrSW5ncmVzc1N0YWdlQXJuLFxuICAgIH0pO1xuXG4gICAgbmV3IEFnZW50SW52b2tlcih0aGlzLCBcIkFnZW50SW52b2tlclwiLCB7XG4gICAgICBhZ2VudEludm9jYXRpb25RdWV1ZTogdGhpcy5hZ2VudEludm9jYXRpb25RdWV1ZSxcbiAgICAgIHZlcmlmaWNhdGlvbkFnZW50QXJuOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybixcbiAgICB9KTtcblxuICAgIHRva2VuU3RvcmFnZS50YWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbik7XG4gICAgZXZlbnREZWR1cGUudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuICAgIGV4aXN0ZW5jZUNoZWNrQ2FjaGUudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKFxuICAgICAgdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbixcbiAgICApO1xuICAgIHdoaXRlbGlzdENvbmZpZy50YWJsZS5ncmFudFJlYWREYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuICAgIHJhdGVMaW1pdC50YWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbik7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUucnVudGltZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlZlcmlmaWNhdGlvbiBBZ2VudCBBZ2VudENvcmUgUnVudGltZSBBUk5cIixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1WZXJpZmljYXRpb25BZ2VudEFybmAsXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYVJvbGVBcm4gPSB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uLnJvbGUhLnJvbGVBcm47XG4gICAgdGhpcy5hcGlHYXRld2F5VXJsID0gc2xhY2tJbmdyZXNzQXBpLnVybDtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiV2hpdGVsaXN0QXV0aG9yaXphdGlvbkZhaWx1cmVBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1XaGl0ZWxpc3RBdXRob3JpemF0aW9uRmFpbHVyZWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gd2hpdGVsaXN0IGF1dGhvcml6YXRpb24gZmFpbHVyZXMgZXhjZWVkIHRocmVzaG9sZCAoNSBmYWlsdXJlcyBpbiA1IG1pbnV0ZXMpXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIldoaXRlbGlzdEF1dGhvcml6YXRpb25GYWlsZWRcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJXaGl0ZWxpc3RDb25maWdMb2FkRXJyb3JBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1XaGl0ZWxpc3RDb25maWdMb2FkRXJyb3JgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogXCJBbGVydCB3aGVuIHdoaXRlbGlzdCBjb25maWd1cmF0aW9uIGxvYWQgZXJyb3JzIG9jY3VyXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIldoaXRlbGlzdENvbmZpZ0xvYWRFcnJvcnNcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJFeGlzdGVuY2VDaGVja0ZhaWxlZEFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWV4aXN0ZW5jZS1jaGVjay1mYWlsZWRgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjpcbiAgICAgICAgXCJBbGVydCB3aGVuIEV4aXN0ZW5jZSBDaGVjayBmYWlsdXJlcyBleGNlZWQgdGhyZXNob2xkIChwb3RlbnRpYWwgc2VjdXJpdHkgaXNzdWUpXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIkV4aXN0ZW5jZUNoZWNrRmFpbGVkXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiUmF0ZUxpbWl0RXhjZWVkZWRBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1yYXRlLWxpbWl0LWV4Y2VlZGVkYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiByYXRlIGxpbWl0IGV4Y2VlZGVkIGV2ZW50cyBleGNlZWQgdGhyZXNob2xkIChwb3RlbnRpYWwgRERvUyBhdHRhY2spXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIlJhdGVMaW1pdEV4Y2VlZGVkXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIlNsYWNrSW5ncmVzc1dhZkJsb2NrZWRSZXF1ZXN0c0FsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXNsYWNrLWluZ3Jlc3Mtd2FmLWJsb2NrZWQtcmVxdWVzdHNgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjpcbiAgICAgICAgXCJBbGVydCB3aGVuIFdBRiBibG9ja2VkIHJlcXVlc3RzIHNwaWtlIG9uIFNsYWNrIGluZ3Jlc3MgZW5kcG9pbnRcIixcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiBcIkFXUy9XQUZWMlwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIkJsb2NrZWRSZXF1ZXN0c1wiLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgV2ViQUNMOiBzbGFja0luZ3Jlc3NBY2xOYW1lLFxuICAgICAgICAgIFJlZ2lvbjogdGhpcy5yZWdpb24sXG4gICAgICAgICAgUnVsZTogXCJBTExcIixcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDIwMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlNsYWNrRXZlbnRIYW5kbGVyQXBpR2F0ZXdheVVybFwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGlHYXRld2F5VXJsLFxuICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgRXZlbnQgSGFuZGxlciBBUEkgR2F0ZXdheSBVUkwgKHJlY29tbWVuZGVkIGluZ3Jlc3MgZW5kcG9pbnQpXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tU2xhY2tFdmVudEhhbmRsZXJBcGlHYXRld2F5VXJsYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVmVyaWZpY2F0aW9uTGFtYmRhUm9sZUFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sYW1iZGFSb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiVmVyaWZpY2F0aW9uIExhbWJkYSBSb2xlIEFSTlwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVZlcmlmaWNhdGlvbkxhbWJkYVJvbGVBcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJTbGFja0V2ZW50SGFuZGxlckFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSBBUk5cIixcbiAgICB9KTtcbiAgfVxufVxuIl19