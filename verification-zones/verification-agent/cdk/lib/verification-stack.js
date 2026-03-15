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
 * Outputs: slackEventHandler, functionUrl, lambdaRoleArn, verificationAgentRuntimeArn, agentInvocationQueue; CfnOutputs for URLs and ARNs.
 */
class VerificationStack extends cdk.Stack {
    /** The Slack Event Handler Lambda */
    slackEventHandler;
    /** The Lambda role ARN */
    lambdaRoleArn;
    /** The Function URL (for Slack Event Subscriptions) */
    functionUrl;
    /** API Gateway URL (recommended ingress for high-security environments) */
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
        this.functionUrl = this.slackEventHandler.functionUrl.url;
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
        new cdk.CfnOutput(this, "SlackEventHandlerUrl", {
            value: this.functionUrl,
            description: "Slack Event Handler Function URL (for Slack Event Subscriptions)",
            exportName: `${this.stackName}-SlackEventHandlerUrl`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmVyaWZpY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLCtDQUFpQztBQUNqQyxpREFBbUM7QUFDbkMsMkRBQTZDO0FBQzdDLCtFQUFpRTtBQUNqRSx1RUFBeUQ7QUFDekQseURBQTJDO0FBQzNDLHVFQUF5RDtBQUN6RCw2REFBK0M7QUFFL0MsMkRBQW9FO0FBQ3BFLDBFQUFxRTtBQUNyRSw4REFBMEQ7QUFDMUQsNERBQXdEO0FBQ3hELDhFQUF5RTtBQUN6RSxvRUFBZ0U7QUFDaEUsd0RBQW9EO0FBQ3BELHdGQUFtRjtBQUNuRixnRkFBMkU7QUFDM0UsOERBQTBEO0FBQzFELDREQUF3RDtBQUN4RCw0RUFBdUU7QUFHdkU7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBaUJHO0FBQ0gsTUFBYSxpQkFBa0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM5QyxxQ0FBcUM7SUFDckIsaUJBQWlCLENBQW9CO0lBRXJELDBCQUEwQjtJQUNWLGFBQWEsQ0FBUztJQUV0Qyx1REFBdUQ7SUFDdkMsV0FBVyxDQUFTO0lBRXBDLDJFQUEyRTtJQUMzRCxhQUFhLENBQVM7SUFFdEMscURBQXFEO0lBQ3JDLHdCQUF3QixDQUEyQjtJQUVuRSxpREFBaUQ7SUFDakMsb0JBQW9CLENBQXVCO0lBRTNELHNEQUFzRDtJQUN0QywyQkFBMkIsQ0FBUztJQUVwRCwwREFBMEQ7SUFDMUMsb0JBQW9CLENBQWE7SUFFakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLGdCQUFnQixHQUNwQixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUM7WUFDeEMsT0FBTyxDQUFDLEdBQUcsQ0FB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QUFDLGFBQWE7U0FDNUQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDdkIsV0FBVyxFQUNULGtFQUFrRTtZQUNwRSxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyx1QkFBdUI7U0FDckQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQ0FBZ0MsRUFBRTtZQUN4RCxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWE7WUFDekIsV0FBVyxFQUFFLG9FQUFvRTtZQUNqRixVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxpQ0FBaUM7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUNuRCxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWE7WUFDekIsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQyxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyw0QkFBNEI7U0FDMUQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxXQUFXO1lBQ2xELFdBQVcsRUFBRSw4QkFBOEI7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBamNELDhDQWljQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNyeXB0byBmcm9tIFwiY3J5cHRvXCI7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbG9nc1wiO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlclwiO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2hcIjtcbmltcG9ydCAqIGFzIHNxcyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNxc1wiO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXlcIjtcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtd2FmdjJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBhcHBseUNvc3RBbGxvY2F0aW9uVGFncyB9IGZyb20gXCJAc2xhY2stYWktYXBwL2Nkay10b29saW5nXCI7XG5pbXBvcnQgeyBTbGFja0V2ZW50SGFuZGxlciB9IGZyb20gXCIuL2NvbnN0cnVjdHMvc2xhY2stZXZlbnQtaGFuZGxlclwiO1xuaW1wb3J0IHsgVG9rZW5TdG9yYWdlIH0gZnJvbSBcIi4vY29uc3RydWN0cy90b2tlbi1zdG9yYWdlXCI7XG5pbXBvcnQgeyBFdmVudERlZHVwZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvZXZlbnQtZGVkdXBlXCI7XG5pbXBvcnQgeyBFeGlzdGVuY2VDaGVja0NhY2hlIH0gZnJvbSBcIi4vY29uc3RydWN0cy9leGlzdGVuY2UtY2hlY2stY2FjaGVcIjtcbmltcG9ydCB7IFdoaXRlbGlzdENvbmZpZyB9IGZyb20gXCIuL2NvbnN0cnVjdHMvd2hpdGVsaXN0LWNvbmZpZ1wiO1xuaW1wb3J0IHsgUmF0ZUxpbWl0IH0gZnJvbSBcIi4vY29uc3RydWN0cy9yYXRlLWxpbWl0XCI7XG5pbXBvcnQgeyBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3ZlcmlmaWNhdGlvbi1hZ2VudC1ydW50aW1lXCI7XG5pbXBvcnQgeyBWZXJpZmljYXRpb25BZ2VudEVjciB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdmVyaWZpY2F0aW9uLWFnZW50LWVjclwiO1xuaW1wb3J0IHsgQWdlbnRJbnZva2VyIH0gZnJvbSBcIi4vY29uc3RydWN0cy9hZ2VudC1pbnZva2VyXCI7XG5pbXBvcnQgeyBTbGFja1Bvc3RlciB9IGZyb20gXCIuL2NvbnN0cnVjdHMvc2xhY2stcG9zdGVyXCI7XG5pbXBvcnQgeyBGaWxlRXhjaGFuZ2VCdWNrZXQgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2ZpbGUtZXhjaGFuZ2UtYnVja2V0XCI7XG5pbXBvcnQgeyBWZXJpZmljYXRpb25TdGFja1Byb3BzIH0gZnJvbSBcIi4vdHlwZXMvc3RhY2stY29uZmlnXCI7XG5cbi8qKlxuICogVmVyaWZpY2F0aW9uIFN0YWNrIChBY2NvdW50IEEgLyBWZXJpZmljYXRpb24gWm9uZSlcbiAqXG4gKiBQdXJwb3NlOiBIYW5kbGVzIFNsYWNrIGV2ZW50cywgdmFsaWRhdGVzIGFuZCBhdXRob3JpemVzIHJlcXVlc3RzLCBhbmQgaW52b2tlcyB0aGUgVmVyaWZpY2F0aW9uIEFnZW50XG4gKiAoQWdlbnRDb3JlIEEyQSkuIENvbW11bmljYXRlcyB3aXRoIEV4ZWN1dGlvbiBTdGFjayBvbmx5IHZpYSBBZ2VudENvcmUgQTJBIChTaWdWNCk7IGluZ3Jlc3MgaXMgZXhwb3NlZCB2aWEgRnVuY3Rpb24gVVJMIGFuZCBBUEkgR2F0ZXdheSAoUmVnaW9uYWwgKyBXQUYpLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6XG4gKiAtIFNsYWNrIGV2ZW50IGluZ2VzdGlvbiAoU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIHdpdGggRnVuY3Rpb24gVVJMIGFuZCBBUEkgR2F0ZXdheSlcbiAqIC0gRHluYW1vREIgKHRva2VuIHN0b3JhZ2UsIGV2ZW50IGRlZHVwZSwgZXhpc3RlbmNlIGNoZWNrIGNhY2hlLCB3aGl0ZWxpc3QsIHJhdGUgbGltaXQpXG4gKiAtIFNlY3JldHMgTWFuYWdlciAoU2xhY2sgY3JlZGVudGlhbHMpXG4gKiAtIFZlcmlmaWNhdGlvbiBBZ2VudCBBZ2VudENvcmUgUnVudGltZSAoQTJBKSBhbmQgRUNSIGltYWdlXG4gKiAtIEFnZW50IGludm9jYXRpb24gKEFnZW50SW52b2tlciwgU2xhY2tQb3N0ZXIpLCBTMyBmaWxlIGV4Y2hhbmdlIGJ1Y2tldCwgQ2xvdWRXYXRjaCBhbGFybXNcbiAqXG4gKiBJbnB1dHM6IFZlcmlmaWNhdGlvblN0YWNrUHJvcHMgKGVudiwgZXhlY3V0aW9uQWNjb3VudElkLCB2ZXJpZmljYXRpb25BZ2VudE5hbWUsIGV4ZWN1dGlvbkFnZW50QXJucywgZXRjLik7XG4gKiBjb250ZXh0OiBkZXBsb3ltZW50RW52LCBhd3NSZWdpb24sIHNsYWNrQm90VG9rZW4sIHNsYWNrU2lnbmluZ1NlY3JldCwgYmVkcm9ja01vZGVsSWQsIGV4ZWN1dGlvbkFnZW50QXJucy5cbiAqXG4gKiBPdXRwdXRzOiBzbGFja0V2ZW50SGFuZGxlciwgZnVuY3Rpb25VcmwsIGxhbWJkYVJvbGVBcm4sIHZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybiwgYWdlbnRJbnZvY2F0aW9uUXVldWU7IENmbk91dHB1dHMgZm9yIFVSTHMgYW5kIEFSTnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBWZXJpZmljYXRpb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIC8qKiBUaGUgU2xhY2sgRXZlbnQgSGFuZGxlciBMYW1iZGEgKi9cbiAgcHVibGljIHJlYWRvbmx5IHNsYWNrRXZlbnRIYW5kbGVyOiBTbGFja0V2ZW50SGFuZGxlcjtcblxuICAvKiogVGhlIExhbWJkYSByb2xlIEFSTiAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbGFtYmRhUm9sZUFybjogc3RyaW5nO1xuXG4gIC8qKiBUaGUgRnVuY3Rpb24gVVJMIChmb3IgU2xhY2sgRXZlbnQgU3Vic2NyaXB0aW9ucykgKi9cbiAgcHVibGljIHJlYWRvbmx5IGZ1bmN0aW9uVXJsOiBzdHJpbmc7XG5cbiAgLyoqIEFQSSBHYXRld2F5IFVSTCAocmVjb21tZW5kZWQgaW5ncmVzcyBmb3IgaGlnaC1zZWN1cml0eSBlbnZpcm9ubWVudHMpICovXG4gIHB1YmxpYyByZWFkb25seSBhcGlHYXRld2F5VXJsOiBzdHJpbmc7XG5cbiAgLyoqIEFnZW50Q29yZSBSdW50aW1lIGZvciBWZXJpZmljYXRpb24gQWdlbnQgKEEyQSkgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50UnVudGltZTogVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lO1xuXG4gIC8qKiBBZ2VudENvcmUgRUNSIGltYWdlIGZvciBWZXJpZmljYXRpb24gQWdlbnQgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50RWNyOiBWZXJpZmljYXRpb25BZ2VudEVjcjtcblxuICAvKiogQWdlbnRDb3JlIFJ1bnRpbWUgQVJOIGZvciBjcm9zcy1zdGFjayByZWZlcmVuY2UgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybjogc3RyaW5nO1xuXG4gIC8qKiBTUVMgcXVldWUgZm9yIGFzeW5jIGFnZW50IGludm9jYXRpb24gcmVxdWVzdHMgKDAxNikgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFnZW50SW52b2NhdGlvblF1ZXVlOiBzcXMuSVF1ZXVlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBWZXJpZmljYXRpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBkZXBsb3ltZW50RW52UmF3ID1cbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiKSB8fFxuICAgICAgcHJvY2Vzcy5lbnYuREVQTE9ZTUVOVF9FTlYgfHxcbiAgICAgIFwiZGV2XCI7XG4gICAgY29uc3QgZGVwbG95bWVudEVudiA9IGRlcGxveW1lbnRFbnZSYXcudG9Mb3dlckNhc2UoKS50cmltKCk7XG5cbiAgICBhcHBseUNvc3RBbGxvY2F0aW9uVGFncyh0aGlzLCB7IGRlcGxveW1lbnRFbnYgfSk7XG5cbiAgICBjb25zdCBzbGFja0JvdFRva2VuID1cbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJzbGFja0JvdFRva2VuXCIpIHx8XG4gICAgICBcIlwiO1xuICAgIGlmICghc2xhY2tCb3RUb2tlbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIlNMQUNLX0JPVF9UT0tFTiBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSAoU0xBQ0tfQk9UX1RPS0VOKSBvciBjb25maWcgZmlsZSAoc2xhY2tCb3RUb2tlbikuXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHNsYWNrU2lnbmluZ1NlY3JldCA9XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJzbGFja1NpZ25pbmdTZWNyZXRcIikgfHxcbiAgICAgIFwiXCI7XG4gICAgaWYgKCFzbGFja1NpZ25pbmdTZWNyZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJTTEFDS19TSUdOSU5HX1NFQ1JFVCBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSAoU0xBQ0tfU0lHTklOR19TRUNSRVQpIG9yIGNvbmZpZyBmaWxlIChzbGFja1NpZ25pbmdTZWNyZXQpLlwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBhd3NSZWdpb24gPVxuICAgICAgcHJvcHMuYXdzUmVnaW9uIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImF3c1JlZ2lvblwiKSB8fFxuICAgICAgXCJhcC1ub3J0aGVhc3QtMVwiO1xuICAgIGNvbnN0IGJlZHJvY2tNb2RlbElkID1cbiAgICAgIHByb3BzLmJlZHJvY2tNb2RlbElkIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImJlZHJvY2tNb2RlbElkXCIpIHx8XG4gICAgICBcImpwLmFudGhyb3BpYy5jbGF1ZGUtc29ubmV0LTQtNS0yMDI1MDkyOS12MTowXCI7XG4gICAgY29uc3Qgc2xhY2tTaWduaW5nU2VjcmV0UmVzb3VyY2UgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tTaWduaW5nU2VjcmV0XCIsXG4gICAgICB7XG4gICAgICAgIHNlY3JldE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS9zbGFjay9zaWduaW5nLXNlY3JldGAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIGFwcCBzaWduaW5nIHNlY3JldCBmb3IgcmVxdWVzdCB2ZXJpZmljYXRpb25cIixcbiAgICAgICAgc2VjcmV0U3RyaW5nVmFsdWU6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoc2xhY2tTaWduaW5nU2VjcmV0KSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrQm90VG9rZW5TZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tCb3RUb2tlblwiLFxuICAgICAge1xuICAgICAgICBzZWNyZXROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0vc2xhY2svYm90LXRva2VuYCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgYm90IE9BdXRoIHRva2VuXCIsXG4gICAgICAgIHNlY3JldFN0cmluZ1ZhbHVlOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHNsYWNrQm90VG9rZW4pLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gT3JkZXI6IER5bmFtb0RCIHRhYmxlcyBhbmQgU1FTL1NlY3JldHMgZmlyc3Q7IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSBkZXBlbmRzIG9uIGFsbCBvZiB0aGVtXG4gICAgY29uc3QgdG9rZW5TdG9yYWdlID0gbmV3IFRva2VuU3RvcmFnZSh0aGlzLCBcIlRva2VuU3RvcmFnZVwiKTtcbiAgICBjb25zdCBldmVudERlZHVwZSA9IG5ldyBFdmVudERlZHVwZSh0aGlzLCBcIkV2ZW50RGVkdXBlXCIpO1xuICAgIGNvbnN0IGV4aXN0ZW5jZUNoZWNrQ2FjaGUgPSBuZXcgRXhpc3RlbmNlQ2hlY2tDYWNoZShcbiAgICAgIHRoaXMsXG4gICAgICBcIkV4aXN0ZW5jZUNoZWNrQ2FjaGVcIixcbiAgICApO1xuICAgIGNvbnN0IHdoaXRlbGlzdENvbmZpZyA9IG5ldyBXaGl0ZWxpc3RDb25maWcodGhpcywgXCJXaGl0ZWxpc3RDb25maWdcIik7XG4gICAgY29uc3QgcmF0ZUxpbWl0ID0gbmV3IFJhdGVMaW1pdCh0aGlzLCBcIlJhdGVMaW1pdFwiKTtcbiAgICBjb25zdCBmaWxlRXhjaGFuZ2VCdWNrZXQgPSBuZXcgRmlsZUV4Y2hhbmdlQnVja2V0KFxuICAgICAgdGhpcyxcbiAgICAgIFwiRmlsZUV4Y2hhbmdlQnVja2V0XCIsXG4gICAgKTtcblxuICAgIGNvbnN0IGFnZW50SW52b2NhdGlvbkRscSA9IG5ldyBzcXMuUXVldWUoXG4gICAgICB0aGlzLFxuICAgICAgXCJBZ2VudEludm9jYXRpb25SZXF1ZXN0RGxxXCIsXG4gICAgICB7XG4gICAgICAgIHF1ZXVlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWFnZW50LWludm9jYXRpb24tZGxxYCxcbiAgICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBWaXNpYmlsaXR5IHRpbWVvdXQgPj0gNiAqIEFnZW50IEludm9rZXIgTGFtYmRhIHRpbWVvdXQgKDkwMHMpIHBlciBBV1MgU1FTK0xhbWJkYSBiZXN0IHByYWN0aWNlOyBwcmV2ZW50cyByZWRyaXZlIGR1cmluZyBsb25nIHJ1bnNcbiAgICBjb25zdCBhZ2VudEludm9jYXRpb25RdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgXCJBZ2VudEludm9jYXRpb25SZXF1ZXN0XCIsIHtcbiAgICAgIHF1ZXVlTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWFnZW50LWludm9jYXRpb24tcmVxdWVzdGAsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNTQwMCksXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogYWdlbnRJbnZvY2F0aW9uRGxxLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRoaXMuYWdlbnRJbnZvY2F0aW9uUXVldWUgPSBhZ2VudEludm9jYXRpb25RdWV1ZTtcblxuICAgIC8vIFJ1bnRpbWUgbmFtZSBtdXN0IGJlIHVuaXF1ZSBwZXIgYWNjb3VudCAoRGV2IGFuZCBQcm9kIGNvZXhpc3QpOyBkZWZhdWx0IGluY2x1ZGVzIGVudiBmcm9tIHN0YWNrIG5hbWVcbiAgICBjb25zdCB2ZXJpZmljYXRpb25BZ2VudE5hbWUgPVxuICAgICAgcHJvcHMudmVyaWZpY2F0aW9uQWdlbnROYW1lIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInZlcmlmaWNhdGlvbkFnZW50TmFtZVwiKSB8fFxuICAgICAgYFNsYWNrQUlfVmVyaWZpY2F0aW9uQWdlbnRfJHt0aGlzLnN0YWNrTmFtZS5pbmNsdWRlcyhcIi1Qcm9kXCIpID8gXCJQcm9kXCIgOiBcIkRldlwifWA7XG4gICAgY29uc3QgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyA9XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImV4ZWN1dGlvbkFnZW50QXJuc1wiKTtcbiAgICBjb25zdCBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zID1cbiAgICAgIGNvbnRleHRFeGVjdXRpb25BZ2VudEFybnNSYXcgJiZcbiAgICAgIHR5cGVvZiBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3ID09PSBcIm9iamVjdFwiICYmXG4gICAgICAhQXJyYXkuaXNBcnJheShjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3KVxuICAgICAgICA/IChjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pXG4gICAgICAgIDoge307XG4gICAgY29uc3QgZXhlY3V0aW9uQWdlbnRBcm5zID0ge1xuICAgICAgLi4uY29udGV4dEV4ZWN1dGlvbkFnZW50QXJucyxcbiAgICAgIC4uLihwcm9wcy5leGVjdXRpb25BZ2VudEFybnMgfHwge30pLFxuICAgIH07XG5cbiAgICAvLyBFQ1IgYmVmb3JlIFJ1bnRpbWUgKFJ1bnRpbWUgbmVlZHMgY29udGFpbmVySW1hZ2VVcmkpLiBTbGFja1Bvc3RlciBhbmQgTG9nR3JvdXAgYmVmb3JlIFJ1bnRpbWUgKG9wdGlvbmFsIHF1ZXVlIGFuZCBsb2cgZ3JvdXApLlxuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRFY3IgPSBuZXcgVmVyaWZpY2F0aW9uQWdlbnRFY3IoXG4gICAgICB0aGlzLFxuICAgICAgXCJWZXJpZmljYXRpb25BZ2VudEVjclwiLFxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja1Bvc3RlciA9IG5ldyBTbGFja1Bvc3Rlcih0aGlzLCBcIlNsYWNrUG9zdGVyXCIsIHtcbiAgICAgIHN0YWNrTmFtZTogdGhpcy5zdGFja05hbWUsXG4gICAgfSk7XG5cbiAgICBjb25zdCBlcnJvckRlYnVnTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cChcbiAgICAgIHRoaXMsXG4gICAgICBcIlZlcmlmaWNhdGlvbkFnZW50RXJyb3JMb2dzXCIsXG4gICAgICB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvYmVkcm9jay1hZ2VudGNvcmUvJHt0aGlzLnN0YWNrTmFtZX0tdmVyaWZpY2F0aW9uLWFnZW50LWVycm9yc2AsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUgPSBuZXcgVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lKFxuICAgICAgdGhpcyxcbiAgICAgIFwiVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lXCIsXG4gICAgICB7XG4gICAgICAgIGFnZW50UnVudGltZU5hbWU6IHZlcmlmaWNhdGlvbkFnZW50TmFtZSxcbiAgICAgICAgY29udGFpbmVySW1hZ2VVcmk6IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRFY3IuaW1hZ2VVcmksXG4gICAgICAgIHRva2VuVGFibGU6IHRva2VuU3RvcmFnZS50YWJsZSxcbiAgICAgICAgZGVkdXBlVGFibGU6IGV2ZW50RGVkdXBlLnRhYmxlLFxuICAgICAgICBleGlzdGVuY2VDaGVja0NhY2hlVGFibGU6IGV4aXN0ZW5jZUNoZWNrQ2FjaGUudGFibGUsXG4gICAgICAgIHdoaXRlbGlzdENvbmZpZ1RhYmxlOiB3aGl0ZWxpc3RDb25maWcudGFibGUsXG4gICAgICAgIHJhdGVMaW1pdFRhYmxlOiByYXRlTGltaXQudGFibGUsXG4gICAgICAgIHNsYWNrU2lnbmluZ1NlY3JldDogc2xhY2tTaWduaW5nU2VjcmV0UmVzb3VyY2UsXG4gICAgICAgIHNsYWNrQm90VG9rZW5TZWNyZXQ6IHNsYWNrQm90VG9rZW5TZWNyZXQsXG4gICAgICAgIGV4ZWN1dGlvbkFnZW50QXJuczpcbiAgICAgICAgICBPYmplY3Qua2V5cyhleGVjdXRpb25BZ2VudEFybnMpLmxlbmd0aCA+IDBcbiAgICAgICAgICAgID8gZXhlY3V0aW9uQWdlbnRBcm5zXG4gICAgICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgICAgc2xhY2tQb3N0UmVxdWVzdFF1ZXVlOiBzbGFja1Bvc3Rlci5xdWV1ZSxcbiAgICAgICAgZXJyb3JEZWJ1Z0xvZ0dyb3VwOiBlcnJvckRlYnVnTG9nR3JvdXAsXG4gICAgICAgIGZpbGVFeGNoYW5nZUJ1Y2tldDogZmlsZUV4Y2hhbmdlQnVja2V0LmJ1Y2tldCxcbiAgICAgICAgc2xhY2tTZWFyY2hBZ2VudEFybjpcbiAgICAgICAgICBwcm9wcy5zbGFja1NlYXJjaEFnZW50QXJuIHx8XG4gICAgICAgICAgKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwic2xhY2tTZWFyY2hBZ2VudEFyblwiKSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpIHx8XG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgfSxcbiAgICApO1xuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuID0gdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUucnVudGltZUFybjtcblxuICAgIC8vIFJldmlzaW9uIGZyb20gc2lnbmluZyBzZWNyZXQgc28gTGFtYmRhIGVudiBjaGFuZ2VzIHdoZW4gc2VjcmV0IGNoYW5nZXM7IHdhcm0gaW5zdGFuY2VzIHRoZW4gcmVmZXRjaCBmcm9tIFNlY3JldHMgTWFuYWdlclxuICAgIGNvbnN0IGNvbmZpZ1JldmlzaW9uID0gY3J5cHRvXG4gICAgICAuY3JlYXRlSGFzaChcInNoYTI1NlwiKVxuICAgICAgLnVwZGF0ZShzbGFja1NpZ25pbmdTZWNyZXQpXG4gICAgICAuZGlnZXN0KFwiaGV4XCIpXG4gICAgICAuc2xpY2UoMCwgMTYpO1xuXG4gICAgdGhpcy5zbGFja0V2ZW50SGFuZGxlciA9IG5ldyBTbGFja0V2ZW50SGFuZGxlcih0aGlzLCBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsIHtcbiAgICAgIHNsYWNrU2lnbmluZ1NlY3JldDogc2xhY2tTaWduaW5nU2VjcmV0UmVzb3VyY2UsXG4gICAgICBzbGFja0JvdFRva2VuU2VjcmV0OiBzbGFja0JvdFRva2VuU2VjcmV0LFxuICAgICAgdG9rZW5UYWJsZU5hbWU6IHRva2VuU3RvcmFnZS50YWJsZS50YWJsZU5hbWUsXG4gICAgICBkZWR1cGVUYWJsZU5hbWU6IGV2ZW50RGVkdXBlLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZU5hbWU6IGV4aXN0ZW5jZUNoZWNrQ2FjaGUudGFibGUudGFibGVOYW1lLFxuICAgICAgd2hpdGVsaXN0Q29uZmlnVGFibGVOYW1lOiB3aGl0ZWxpc3RDb25maWcudGFibGUudGFibGVOYW1lLFxuICAgICAgcmF0ZUxpbWl0VGFibGVOYW1lOiByYXRlTGltaXQudGFibGUudGFibGVOYW1lLFxuICAgICAgYXdzUmVnaW9uLFxuICAgICAgYmVkcm9ja01vZGVsSWQsXG4gICAgICB2ZXJpZmljYXRpb25BZ2VudEFybjogdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4sXG4gICAgICBhZ2VudEludm9jYXRpb25RdWV1ZTogdGhpcy5hZ2VudEludm9jYXRpb25RdWV1ZSxcbiAgICAgIGNvbmZpZ1JldmlzaW9uLFxuICAgICAgYXV0b1JlcGx5Q2hhbm5lbElkczogcHJvcHMuYXV0b1JlcGx5Q2hhbm5lbElkcyxcbiAgICAgIG1lbnRpb25DaGFubmVsSWRzOiBwcm9wcy5tZW50aW9uQ2hhbm5lbElkcyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0FwaUFjY2Vzc0xvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAoXG4gICAgICB0aGlzLFxuICAgICAgXCJTbGFja0luZ3Jlc3NBcGlBY2Nlc3NMb2dzXCIsXG4gICAgICB7XG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0FwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgXCJTbGFja0luZ3Jlc3NBcGlcIiwge1xuICAgICAgZW5kcG9pbnRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIHR5cGVzOiBbYXBpZ2F0ZXdheS5FbmRwb2ludFR5cGUuUkVHSU9OQUxdLFxuICAgICAgfSxcbiAgICAgIHJlc3RBcGlOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tc2xhY2staW5ncmVzc2AsXG4gICAgICBkZXNjcmlwdGlvbjogXCJTbGFjayBpbmdyZXNzIGVuZHBvaW50IGZvciBTbGFja0V2ZW50SGFuZGxlciAoQVBJIEdhdGV3YXkpXCIsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogXCJwcm9kXCIsXG4gICAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiA1MCxcbiAgICAgICAgdGhyb3R0bGluZ1JhdGVMaW1pdDogMjUsXG4gICAgICAgIGFjY2Vzc0xvZ0Rlc3RpbmF0aW9uOiBuZXcgYXBpZ2F0ZXdheS5Mb2dHcm91cExvZ0Rlc3RpbmF0aW9uKFxuICAgICAgICAgIHNsYWNrSW5ncmVzc0FwaUFjY2Vzc0xvZ0dyb3VwLFxuICAgICAgICApLFxuICAgICAgICBhY2Nlc3NMb2dGb3JtYXQ6IGFwaWdhdGV3YXkuQWNjZXNzTG9nRm9ybWF0Lmpzb25XaXRoU3RhbmRhcmRGaWVsZHMoe1xuICAgICAgICAgIGNhbGxlcjogdHJ1ZSxcbiAgICAgICAgICBodHRwTWV0aG9kOiB0cnVlLFxuICAgICAgICAgIGlwOiB0cnVlLFxuICAgICAgICAgIHByb3RvY29sOiB0cnVlLFxuICAgICAgICAgIHJlcXVlc3RUaW1lOiB0cnVlLFxuICAgICAgICAgIHJlc291cmNlUGF0aDogdHJ1ZSxcbiAgICAgICAgICByZXNwb25zZUxlbmd0aDogdHJ1ZSxcbiAgICAgICAgICBzdGF0dXM6IHRydWUsXG4gICAgICAgICAgdXNlcjogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgICAgY2xvdWRXYXRjaFJvbGU6IHRydWUsXG4gICAgfSk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NMYW1iZGFJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbixcbiAgICAgIHsgcHJveHk6IHRydWUgfSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tSZXNvdXJjZSA9IHNsYWNrSW5ncmVzc0FwaS5yb290XG4gICAgICAuYWRkUmVzb3VyY2UoXCJzbGFja1wiKVxuICAgICAgLmFkZFJlc291cmNlKFwiZXZlbnRzXCIpO1xuICAgIHNsYWNrUmVzb3VyY2UuYWRkTWV0aG9kKFwiUE9TVFwiLCBzbGFja0luZ3Jlc3NMYW1iZGFJbnRlZ3JhdGlvbik7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBY2xOYW1lID0gYCR7dGhpcy5zdGFja05hbWV9LXNsYWNrLWluZ3Jlc3MtYWNsYDtcbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBY2xNZXRyaWNOYW1lID0gYCR7dGhpcy5zdGFja05hbWV9U2xhY2tJbmdyZXNzQWNsYC5yZXBsYWNlKFxuICAgICAgL1teQS1aYS16MC05XS9nLFxuICAgICAgXCJcIixcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQWNsID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCBcIlNsYWNrSW5ncmVzc1dlYkFjbFwiLCB7XG4gICAgICBuYW1lOiBzbGFja0luZ3Jlc3NBY2xOYW1lLFxuICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgIHNjb3BlOiBcIlJFR0lPTkFMXCIsXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogc2xhY2tJbmdyZXNzQWNsTWV0cmljTmFtZSxcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBydWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogXCJBV1MtQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldFwiLFxuICAgICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiBcIkFXU1wiLFxuICAgICAgICAgICAgICBuYW1lOiBcIkFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXRcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldFwiLFxuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogXCJTbGFja0luZ3Jlc3NSYXRlTGltaXRcIixcbiAgICAgICAgICBwcmlvcml0eTogMTAsXG4gICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogXCJJUFwiLFxuICAgICAgICAgICAgICBsaW1pdDogMjAwMCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogXCJTbGFja0luZ3Jlc3NSYXRlTGltaXRcIixcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NTdGFnZUFybiA9IGBhcm46YXdzOmFwaWdhdGV3YXk6JHt0aGlzLnJlZ2lvbn06Oi9yZXN0YXBpcy8ke3NsYWNrSW5ncmVzc0FwaS5yZXN0QXBpSWR9L3N0YWdlcy8ke3NsYWNrSW5ncmVzc0FwaS5kZXBsb3ltZW50U3RhZ2Uuc3RhZ2VOYW1lfWA7XG5cbiAgICBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgXCJTbGFja0luZ3Jlc3NXZWJBY2xBc3NvY2lhdGlvblwiLCB7XG4gICAgICB3ZWJBY2xBcm46IHNsYWNrSW5ncmVzc0FjbC5hdHRyQXJuLFxuICAgICAgcmVzb3VyY2VBcm46IHNsYWNrSW5ncmVzc1N0YWdlQXJuLFxuICAgIH0pO1xuXG4gICAgbmV3IEFnZW50SW52b2tlcih0aGlzLCBcIkFnZW50SW52b2tlclwiLCB7XG4gICAgICBhZ2VudEludm9jYXRpb25RdWV1ZTogdGhpcy5hZ2VudEludm9jYXRpb25RdWV1ZSxcbiAgICAgIHZlcmlmaWNhdGlvbkFnZW50QXJuOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybixcbiAgICB9KTtcblxuICAgIHRva2VuU3RvcmFnZS50YWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbik7XG4gICAgZXZlbnREZWR1cGUudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuICAgIGV4aXN0ZW5jZUNoZWNrQ2FjaGUudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKFxuICAgICAgdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbixcbiAgICApO1xuICAgIHdoaXRlbGlzdENvbmZpZy50YWJsZS5ncmFudFJlYWREYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuICAgIHJhdGVMaW1pdC50YWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbik7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUucnVudGltZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlZlcmlmaWNhdGlvbiBBZ2VudCBBZ2VudENvcmUgUnVudGltZSBBUk5cIixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1WZXJpZmljYXRpb25BZ2VudEFybmAsXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYVJvbGVBcm4gPSB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uLnJvbGUhLnJvbGVBcm47XG4gICAgdGhpcy5mdW5jdGlvblVybCA9IHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb25VcmwudXJsO1xuICAgIHRoaXMuYXBpR2F0ZXdheVVybCA9IHNsYWNrSW5ncmVzc0FwaS51cmw7XG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIldoaXRlbGlzdEF1dGhvcml6YXRpb25GYWlsdXJlQWxhcm1cIiwge1xuICAgICAgYWxhcm1OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tV2hpdGVsaXN0QXV0aG9yaXphdGlvbkZhaWx1cmVgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjpcbiAgICAgICAgXCJBbGVydCB3aGVuIHdoaXRlbGlzdCBhdXRob3JpemF0aW9uIGZhaWx1cmVzIGV4Y2VlZCB0aHJlc2hvbGQgKDUgZmFpbHVyZXMgaW4gNSBtaW51dGVzKVwiLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgbWV0cmljTmFtZTogXCJXaGl0ZWxpc3RBdXRob3JpemF0aW9uRmFpbGVkXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiV2hpdGVsaXN0Q29uZmlnTG9hZEVycm9yQWxhcm1cIiwge1xuICAgICAgYWxhcm1OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tV2hpdGVsaXN0Q29uZmlnTG9hZEVycm9yYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IFwiQWxlcnQgd2hlbiB3aGl0ZWxpc3QgY29uZmlndXJhdGlvbiBsb2FkIGVycm9ycyBvY2N1clwiLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgbWV0cmljTmFtZTogXCJXaGl0ZWxpc3RDb25maWdMb2FkRXJyb3JzXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiRXhpc3RlbmNlQ2hlY2tGYWlsZWRBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1leGlzdGVuY2UtY2hlY2stZmFpbGVkYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiBFeGlzdGVuY2UgQ2hlY2sgZmFpbHVyZXMgZXhjZWVkIHRocmVzaG9sZCAocG90ZW50aWFsIHNlY3VyaXR5IGlzc3VlKVwiLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgbWV0cmljTmFtZTogXCJFeGlzdGVuY2VDaGVja0ZhaWxlZFwiLFxuICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIlJhdGVMaW1pdEV4Y2VlZGVkQWxhcm1cIiwge1xuICAgICAgYWxhcm1OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tcmF0ZS1saW1pdC1leGNlZWRlZGAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gcmF0ZSBsaW1pdCBleGNlZWRlZCBldmVudHMgZXhjZWVkIHRocmVzaG9sZCAocG90ZW50aWFsIEREb1MgYXR0YWNrKVwiLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgbWV0cmljTmFtZTogXCJSYXRlTGltaXRFeGNlZWRlZFwiLFxuICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMTAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJTbGFja0luZ3Jlc3NXYWZCbG9ja2VkUmVxdWVzdHNBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1zbGFjay1pbmdyZXNzLXdhZi1ibG9ja2VkLXJlcXVlc3RzYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiBXQUYgYmxvY2tlZCByZXF1ZXN0cyBzcGlrZSBvbiBTbGFjayBpbmdyZXNzIGVuZHBvaW50XCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJBV1MvV0FGVjJcIixcbiAgICAgICAgbWV0cmljTmFtZTogXCJCbG9ja2VkUmVxdWVzdHNcIixcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIFdlYkFDTDogc2xhY2tJbmdyZXNzQWNsTmFtZSxcbiAgICAgICAgICBSZWdpb246IHRoaXMucmVnaW9uLFxuICAgICAgICAgIFJ1bGU6IFwiQUxMXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAyMDAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJTbGFja0V2ZW50SGFuZGxlclVybFwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5mdW5jdGlvblVybCxcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICBcIlNsYWNrIEV2ZW50IEhhbmRsZXIgRnVuY3Rpb24gVVJMIChmb3IgU2xhY2sgRXZlbnQgU3Vic2NyaXB0aW9ucylcIixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1TbGFja0V2ZW50SGFuZGxlclVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlNsYWNrRXZlbnRIYW5kbGVyQXBpR2F0ZXdheVVybFwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGlHYXRld2F5VXJsLFxuICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgRXZlbnQgSGFuZGxlciBBUEkgR2F0ZXdheSBVUkwgKHJlY29tbWVuZGVkIGluZ3Jlc3MgZW5kcG9pbnQpXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tU2xhY2tFdmVudEhhbmRsZXJBcGlHYXRld2F5VXJsYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVmVyaWZpY2F0aW9uTGFtYmRhUm9sZUFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sYW1iZGFSb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiVmVyaWZpY2F0aW9uIExhbWJkYSBSb2xlIEFSTlwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVZlcmlmaWNhdGlvbkxhbWJkYVJvbGVBcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJTbGFja0V2ZW50SGFuZGxlckFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSBBUk5cIixcbiAgICB9KTtcbiAgfVxufVxuIl19