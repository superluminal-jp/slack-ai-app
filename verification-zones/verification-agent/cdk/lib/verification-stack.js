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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmVyaWZpY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLCtDQUFpQztBQUNqQyxpREFBbUM7QUFDbkMsMkRBQTZDO0FBQzdDLCtFQUFpRTtBQUNqRSx1RUFBeUQ7QUFDekQseURBQTJDO0FBQzNDLHVFQUF5RDtBQUN6RCw2REFBK0M7QUFFL0MsMkRBQW9FO0FBQ3BFLDBFQUFxRTtBQUNyRSw4REFBMEQ7QUFDMUQsNERBQXdEO0FBQ3hELDhFQUF5RTtBQUN6RSxvRUFBZ0U7QUFDaEUsd0RBQW9EO0FBQ3BELHdGQUFtRjtBQUNuRixnRkFBMkU7QUFDM0UsOERBQTBEO0FBQzFELDREQUF3RDtBQUN4RCw0RUFBdUU7QUFHdkU7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBaUJHO0FBQ0gsTUFBYSxpQkFBa0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM5QyxxQ0FBcUM7SUFDckIsaUJBQWlCLENBQW9CO0lBRXJELDBCQUEwQjtJQUNWLGFBQWEsQ0FBUztJQUV0Qyx1REFBdUQ7SUFDdkMsV0FBVyxDQUFTO0lBRXBDLDJFQUEyRTtJQUMzRCxhQUFhLENBQVM7SUFFdEMscURBQXFEO0lBQ3JDLHdCQUF3QixDQUEyQjtJQUVuRSxpREFBaUQ7SUFDakMsb0JBQW9CLENBQXVCO0lBRTNELHNEQUFzRDtJQUN0QywyQkFBMkIsQ0FBUztJQUVwRCwwREFBMEQ7SUFDMUMsb0JBQW9CLENBQWE7SUFFakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLGdCQUFnQixHQUNwQixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUM7WUFDeEMsT0FBTyxDQUFDLEdBQUcsQ0FB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R0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXO1lBQ3ZCLFdBQVcsRUFDVCxrRUFBa0U7WUFDcEUsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsdUJBQXVCO1NBQ3JELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZ0NBQWdDLEVBQUU7WUFDeEQsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ3pCLFdBQVcsRUFBRSxvRUFBb0U7WUFDakYsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsaUNBQWlDO1NBQy9ELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDbkQsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ3pCLFdBQVcsRUFBRSw4QkFBOEI7WUFDM0MsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsNEJBQTRCO1NBQzFELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsV0FBVztZQUNsRCxXQUFXLEVBQUUsOEJBQThCO1NBQzVDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWhjRCw4Q0FnY0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSBcImNyeXB0b1wiO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxvZ3NcIjtcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXJcIjtcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoXCI7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zcXNcIjtcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSBcImF3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5XCI7XG5pbXBvcnQgKiBhcyB3YWZ2MiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXdhZnYyXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgYXBwbHlDb3N0QWxsb2NhdGlvblRhZ3MgfSBmcm9tIFwiQHNsYWNrLWFpLWFwcC9jZGstdG9vbGluZ1wiO1xuaW1wb3J0IHsgU2xhY2tFdmVudEhhbmRsZXIgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3NsYWNrLWV2ZW50LWhhbmRsZXJcIjtcbmltcG9ydCB7IFRva2VuU3RvcmFnZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdG9rZW4tc3RvcmFnZVwiO1xuaW1wb3J0IHsgRXZlbnREZWR1cGUgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2V2ZW50LWRlZHVwZVwiO1xuaW1wb3J0IHsgRXhpc3RlbmNlQ2hlY2tDYWNoZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvZXhpc3RlbmNlLWNoZWNrLWNhY2hlXCI7XG5pbXBvcnQgeyBXaGl0ZWxpc3RDb25maWcgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3doaXRlbGlzdC1jb25maWdcIjtcbmltcG9ydCB7IFJhdGVMaW1pdCB9IGZyb20gXCIuL2NvbnN0cnVjdHMvcmF0ZS1saW1pdFwiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lIH0gZnJvbSBcIi4vY29uc3RydWN0cy92ZXJpZmljYXRpb24tYWdlbnQtcnVudGltZVwiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uQWdlbnRFY3IgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3ZlcmlmaWNhdGlvbi1hZ2VudC1lY3JcIjtcbmltcG9ydCB7IEFnZW50SW52b2tlciB9IGZyb20gXCIuL2NvbnN0cnVjdHMvYWdlbnQtaW52b2tlclwiO1xuaW1wb3J0IHsgU2xhY2tQb3N0ZXIgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3NsYWNrLXBvc3RlclwiO1xuaW1wb3J0IHsgRmlsZUV4Y2hhbmdlQnVja2V0IH0gZnJvbSBcIi4vY29uc3RydWN0cy9maWxlLWV4Y2hhbmdlLWJ1Y2tldFwiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uU3RhY2tQcm9wcyB9IGZyb20gXCIuL3R5cGVzL3N0YWNrLWNvbmZpZ1wiO1xuXG4vKipcbiAqIFZlcmlmaWNhdGlvbiBTdGFjayAoQWNjb3VudCBBIC8gVmVyaWZpY2F0aW9uIFpvbmUpXG4gKlxuICogUHVycG9zZTogSGFuZGxlcyBTbGFjayBldmVudHMsIHZhbGlkYXRlcyBhbmQgYXV0aG9yaXplcyByZXF1ZXN0cywgYW5kIGludm9rZXMgdGhlIFZlcmlmaWNhdGlvbiBBZ2VudFxuICogKEFnZW50Q29yZSBBMkEpLiBDb21tdW5pY2F0ZXMgd2l0aCBFeGVjdXRpb24gU3RhY2sgb25seSB2aWEgQWdlbnRDb3JlIEEyQSAoU2lnVjQpOyBpbmdyZXNzIGlzIGV4cG9zZWQgdmlhIEZ1bmN0aW9uIFVSTCBhbmQgQVBJIEdhdGV3YXkgKFJlZ2lvbmFsICsgV0FGKS5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOlxuICogLSBTbGFjayBldmVudCBpbmdlc3Rpb24gKFNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSB3aXRoIEZ1bmN0aW9uIFVSTCBhbmQgQVBJIEdhdGV3YXkpXG4gKiAtIER5bmFtb0RCICh0b2tlbiBzdG9yYWdlLCBldmVudCBkZWR1cGUsIGV4aXN0ZW5jZSBjaGVjayBjYWNoZSwgd2hpdGVsaXN0LCByYXRlIGxpbWl0KVxuICogLSBTZWNyZXRzIE1hbmFnZXIgKFNsYWNrIGNyZWRlbnRpYWxzKVxuICogLSBWZXJpZmljYXRpb24gQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgKEEyQSkgYW5kIEVDUiBpbWFnZVxuICogLSBBZ2VudCBpbnZvY2F0aW9uIChBZ2VudEludm9rZXIsIFNsYWNrUG9zdGVyKSwgUzMgZmlsZSBleGNoYW5nZSBidWNrZXQsIENsb3VkV2F0Y2ggYWxhcm1zXG4gKlxuICogSW5wdXRzOiBWZXJpZmljYXRpb25TdGFja1Byb3BzIChlbnYsIGV4ZWN1dGlvbkFjY291bnRJZCwgdmVyaWZpY2F0aW9uQWdlbnROYW1lLCBleGVjdXRpb25BZ2VudEFybnMsIGV0Yy4pO1xuICogY29udGV4dDogZGVwbG95bWVudEVudiwgYXdzUmVnaW9uLCBzbGFja0JvdFRva2VuLCBzbGFja1NpZ25pbmdTZWNyZXQsIGJlZHJvY2tNb2RlbElkLCBleGVjdXRpb25BZ2VudEFybnMuXG4gKlxuICogT3V0cHV0czogc2xhY2tFdmVudEhhbmRsZXIsIGZ1bmN0aW9uVXJsLCBsYW1iZGFSb2xlQXJuLCB2ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4sIGFnZW50SW52b2NhdGlvblF1ZXVlOyBDZm5PdXRwdXRzIGZvciBVUkxzIGFuZCBBUk5zLlxuICovXG5leHBvcnQgY2xhc3MgVmVyaWZpY2F0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICAvKiogVGhlIFNsYWNrIEV2ZW50IEhhbmRsZXIgTGFtYmRhICovXG4gIHB1YmxpYyByZWFkb25seSBzbGFja0V2ZW50SGFuZGxlcjogU2xhY2tFdmVudEhhbmRsZXI7XG5cbiAgLyoqIFRoZSBMYW1iZGEgcm9sZSBBUk4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGxhbWJkYVJvbGVBcm46IHN0cmluZztcblxuICAvKiogVGhlIEZ1bmN0aW9uIFVSTCAoZm9yIFNsYWNrIEV2ZW50IFN1YnNjcmlwdGlvbnMpICovXG4gIHB1YmxpYyByZWFkb25seSBmdW5jdGlvblVybDogc3RyaW5nO1xuXG4gIC8qKiBBUEkgR2F0ZXdheSBVUkwgKHJlY29tbWVuZGVkIGluZ3Jlc3MgZm9yIGhpZ2gtc2VjdXJpdHkgZW52aXJvbm1lbnRzKSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpR2F0ZXdheVVybDogc3RyaW5nO1xuXG4gIC8qKiBBZ2VudENvcmUgUnVudGltZSBmb3IgVmVyaWZpY2F0aW9uIEFnZW50IChBMkEpICovXG4gIHB1YmxpYyByZWFkb25seSB2ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWU6IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZTtcblxuICAvKiogQWdlbnRDb3JlIEVDUiBpbWFnZSBmb3IgVmVyaWZpY2F0aW9uIEFnZW50ICovXG4gIHB1YmxpYyByZWFkb25seSB2ZXJpZmljYXRpb25BZ2VudEVjcjogVmVyaWZpY2F0aW9uQWdlbnRFY3I7XG5cbiAgLyoqIEFnZW50Q29yZSBSdW50aW1lIEFSTiBmb3IgY3Jvc3Mtc3RhY2sgcmVmZXJlbmNlICovXG4gIHB1YmxpYyByZWFkb25seSB2ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm46IHN0cmluZztcblxuICAvKiogU1FTIHF1ZXVlIGZvciBhc3luYyBhZ2VudCBpbnZvY2F0aW9uIHJlcXVlc3RzICgwMTYpICovXG4gIHB1YmxpYyByZWFkb25seSBhZ2VudEludm9jYXRpb25RdWV1ZTogc3FzLklRdWV1ZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVmVyaWZpY2F0aW9uU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgZGVwbG95bWVudEVudlJhdyA9XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImRlcGxveW1lbnRFbnZcIikgfHxcbiAgICAgIHByb2Nlc3MuZW52LkRFUExPWU1FTlRfRU5WIHx8XG4gICAgICBcImRldlwiO1xuICAgIGNvbnN0IGRlcGxveW1lbnRFbnYgPSBkZXBsb3ltZW50RW52UmF3LnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuXG4gICAgYXBwbHlDb3N0QWxsb2NhdGlvblRhZ3ModGhpcywgeyBkZXBsb3ltZW50RW52IH0pO1xuXG4gICAgY29uc3Qgc2xhY2tCb3RUb2tlbiA9XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19CT1RfVE9LRU4gfHxcbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwic2xhY2tCb3RUb2tlblwiKSB8fFxuICAgICAgXCJcIjtcbiAgICBpZiAoIXNsYWNrQm90VG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJTTEFDS19CT1RfVE9LRU4gaXMgcmVxdWlyZWQuIFNldCBpdCB2aWEgZW52aXJvbm1lbnQgdmFyaWFibGUgKFNMQUNLX0JPVF9UT0tFTikgb3IgY29uZmlnIGZpbGUgKHNsYWNrQm90VG9rZW4pLlwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBzbGFja1NpZ25pbmdTZWNyZXQgPVxuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQgfHxcbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwic2xhY2tTaWduaW5nU2VjcmV0XCIpIHx8XG4gICAgICBcIlwiO1xuICAgIGlmICghc2xhY2tTaWduaW5nU2VjcmV0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiU0xBQ0tfU0lHTklOR19TRUNSRVQgaXMgcmVxdWlyZWQuIFNldCBpdCB2aWEgZW52aXJvbm1lbnQgdmFyaWFibGUgKFNMQUNLX1NJR05JTkdfU0VDUkVUKSBvciBjb25maWcgZmlsZSAoc2xhY2tTaWduaW5nU2VjcmV0KS5cIixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgYXdzUmVnaW9uID1cbiAgICAgIHByb3BzLmF3c1JlZ2lvbiB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJhd3NSZWdpb25cIikgfHxcbiAgICAgIFwiYXAtbm9ydGhlYXN0LTFcIjtcbiAgICBjb25zdCBiZWRyb2NrTW9kZWxJZCA9XG4gICAgICBwcm9wcy5iZWRyb2NrTW9kZWxJZCB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJiZWRyb2NrTW9kZWxJZFwiKSB8fFxuICAgICAgXCJqcC5hbnRocm9waWMuY2xhdWRlLXNvbm5ldC00LTUtMjAyNTA5MjktdjE6MFwiO1xuICAgIGNvbnN0IHNsYWNrU2lnbmluZ1NlY3JldFJlc291cmNlID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldChcbiAgICAgIHRoaXMsXG4gICAgICBcIlNsYWNrU2lnbmluZ1NlY3JldFwiLFxuICAgICAge1xuICAgICAgICBzZWNyZXROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0vc2xhY2svc2lnbmluZy1zZWNyZXRgLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJTbGFjayBhcHAgc2lnbmluZyBzZWNyZXQgZm9yIHJlcXVlc3QgdmVyaWZpY2F0aW9uXCIsXG4gICAgICAgIHNlY3JldFN0cmluZ1ZhbHVlOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KHNsYWNrU2lnbmluZ1NlY3JldCksXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja0JvdFRva2VuU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldChcbiAgICAgIHRoaXMsXG4gICAgICBcIlNsYWNrQm90VG9rZW5cIixcbiAgICAgIHtcbiAgICAgICAgc2VjcmV0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9L3NsYWNrL2JvdC10b2tlbmAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIGJvdCBPQXV0aCB0b2tlblwiLFxuICAgICAgICBzZWNyZXRTdHJpbmdWYWx1ZTogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dChzbGFja0JvdFRva2VuKSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIE9yZGVyOiBEeW5hbW9EQiB0YWJsZXMgYW5kIFNRUy9TZWNyZXRzIGZpcnN0OyBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUgZGVwZW5kcyBvbiBhbGwgb2YgdGhlbVxuICAgIGNvbnN0IHRva2VuU3RvcmFnZSA9IG5ldyBUb2tlblN0b3JhZ2UodGhpcywgXCJUb2tlblN0b3JhZ2VcIik7XG4gICAgY29uc3QgZXZlbnREZWR1cGUgPSBuZXcgRXZlbnREZWR1cGUodGhpcywgXCJFdmVudERlZHVwZVwiKTtcbiAgICBjb25zdCBleGlzdGVuY2VDaGVja0NhY2hlID0gbmV3IEV4aXN0ZW5jZUNoZWNrQ2FjaGUoXG4gICAgICB0aGlzLFxuICAgICAgXCJFeGlzdGVuY2VDaGVja0NhY2hlXCIsXG4gICAgKTtcbiAgICBjb25zdCB3aGl0ZWxpc3RDb25maWcgPSBuZXcgV2hpdGVsaXN0Q29uZmlnKHRoaXMsIFwiV2hpdGVsaXN0Q29uZmlnXCIpO1xuICAgIGNvbnN0IHJhdGVMaW1pdCA9IG5ldyBSYXRlTGltaXQodGhpcywgXCJSYXRlTGltaXRcIik7XG4gICAgY29uc3QgZmlsZUV4Y2hhbmdlQnVja2V0ID0gbmV3IEZpbGVFeGNoYW5nZUJ1Y2tldChcbiAgICAgIHRoaXMsXG4gICAgICBcIkZpbGVFeGNoYW5nZUJ1Y2tldFwiLFxuICAgICk7XG5cbiAgICBjb25zdCBhZ2VudEludm9jYXRpb25EbHEgPSBuZXcgc3FzLlF1ZXVlKFxuICAgICAgdGhpcyxcbiAgICAgIFwiQWdlbnRJbnZvY2F0aW9uUmVxdWVzdERscVwiLFxuICAgICAge1xuICAgICAgICBxdWV1ZU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1hZ2VudC1pbnZvY2F0aW9uLWRscWAsXG4gICAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gVmlzaWJpbGl0eSB0aW1lb3V0ID49IDYgKiBBZ2VudCBJbnZva2VyIExhbWJkYSB0aW1lb3V0ICg5MDBzKSBwZXIgQVdTIFNRUytMYW1iZGEgYmVzdCBwcmFjdGljZTsgcHJldmVudHMgcmVkcml2ZSBkdXJpbmcgbG9uZyBydW5zXG4gICAgY29uc3QgYWdlbnRJbnZvY2F0aW9uUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsIFwiQWdlbnRJbnZvY2F0aW9uUmVxdWVzdFwiLCB7XG4gICAgICBxdWV1ZU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1hZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3RgLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDU0MDApLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcbiAgICAgICAgcXVldWU6IGFnZW50SW52b2NhdGlvbkRscSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICB0aGlzLmFnZW50SW52b2NhdGlvblF1ZXVlID0gYWdlbnRJbnZvY2F0aW9uUXVldWU7XG5cbiAgICAvLyBSdW50aW1lIG5hbWUgbXVzdCBiZSB1bmlxdWUgcGVyIGFjY291bnQgKERldiBhbmQgUHJvZCBjb2V4aXN0KTsgZGVmYXVsdCBpbmNsdWRlcyBlbnYgZnJvbSBzdGFjayBuYW1lXG4gICAgY29uc3QgdmVyaWZpY2F0aW9uQWdlbnROYW1lID1cbiAgICAgIHByb3BzLnZlcmlmaWNhdGlvbkFnZW50TmFtZSB8fFxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJ2ZXJpZmljYXRpb25BZ2VudE5hbWVcIikgfHxcbiAgICAgIGBTbGFja0FJX1ZlcmlmaWNhdGlvbkFnZW50XyR7dGhpcy5zdGFja05hbWUuaW5jbHVkZXMoXCItUHJvZFwiKSA/IFwiUHJvZFwiIDogXCJEZXZcIn1gO1xuICAgIGNvbnN0IGNvbnRleHRFeGVjdXRpb25BZ2VudEFybnNSYXcgPVxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJleGVjdXRpb25BZ2VudEFybnNcIik7XG4gICAgY29uc3QgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJucyA9XG4gICAgICBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3ICYmXG4gICAgICB0eXBlb2YgY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyA9PT0gXCJvYmplY3RcIiAmJlxuICAgICAgIUFycmF5LmlzQXJyYXkoY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdylcbiAgICAgICAgPyAoY29udGV4dEV4ZWN1dGlvbkFnZW50QXJuc1JhdyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KVxuICAgICAgICA6IHt9O1xuICAgIGNvbnN0IGV4ZWN1dGlvbkFnZW50QXJucyA9IHtcbiAgICAgIC4uLmNvbnRleHRFeGVjdXRpb25BZ2VudEFybnMsXG4gICAgICAuLi4ocHJvcHMuZXhlY3V0aW9uQWdlbnRBcm5zIHx8IHt9KSxcbiAgICB9O1xuXG4gICAgLy8gRUNSIGJlZm9yZSBSdW50aW1lIChSdW50aW1lIG5lZWRzIGNvbnRhaW5lckltYWdlVXJpKS4gU2xhY2tQb3N0ZXIgYW5kIExvZ0dyb3VwIGJlZm9yZSBSdW50aW1lIChvcHRpb25hbCBxdWV1ZSBhbmQgbG9nIGdyb3VwKS5cbiAgICB0aGlzLnZlcmlmaWNhdGlvbkFnZW50RWNyID0gbmV3IFZlcmlmaWNhdGlvbkFnZW50RWNyKFxuICAgICAgdGhpcyxcbiAgICAgIFwiVmVyaWZpY2F0aW9uQWdlbnRFY3JcIixcbiAgICApO1xuXG4gICAgY29uc3Qgc2xhY2tQb3N0ZXIgPSBuZXcgU2xhY2tQb3N0ZXIodGhpcywgXCJTbGFja1Bvc3RlclwiLCB7XG4gICAgICBzdGFja05hbWU6IHRoaXMuc3RhY2tOYW1lLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZXJyb3JEZWJ1Z0xvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAoXG4gICAgICB0aGlzLFxuICAgICAgXCJWZXJpZmljYXRpb25BZ2VudEVycm9yTG9nc1wiLFxuICAgICAge1xuICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2JlZHJvY2stYWdlbnRjb3JlLyR7dGhpcy5zdGFja05hbWV9LXZlcmlmaWNhdGlvbi1hZ2VudC1lcnJvcnNgLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lID0gbmV3IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZShcbiAgICAgIHRoaXMsXG4gICAgICBcIlZlcmlmaWNhdGlvbkFnZW50UnVudGltZVwiLFxuICAgICAge1xuICAgICAgICBhZ2VudFJ1bnRpbWVOYW1lOiB2ZXJpZmljYXRpb25BZ2VudE5hbWUsXG4gICAgICAgIGNvbnRhaW5lckltYWdlVXJpOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50RWNyLmltYWdlVXJpLFxuICAgICAgICB0b2tlblRhYmxlOiB0b2tlblN0b3JhZ2UudGFibGUsXG4gICAgICAgIGRlZHVwZVRhYmxlOiBldmVudERlZHVwZS50YWJsZSxcbiAgICAgICAgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlOiBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLFxuICAgICAgICB3aGl0ZWxpc3RDb25maWdUYWJsZTogd2hpdGVsaXN0Q29uZmlnLnRhYmxlLFxuICAgICAgICByYXRlTGltaXRUYWJsZTogcmF0ZUxpbWl0LnRhYmxlLFxuICAgICAgICBzbGFja1NpZ25pbmdTZWNyZXQ6IHNsYWNrU2lnbmluZ1NlY3JldFJlc291cmNlLFxuICAgICAgICBzbGFja0JvdFRva2VuU2VjcmV0OiBzbGFja0JvdFRva2VuU2VjcmV0LFxuICAgICAgICBleGVjdXRpb25BZ2VudEFybnM6XG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IGV4ZWN1dGlvbkFnZW50QXJuc1xuICAgICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIHNsYWNrUG9zdFJlcXVlc3RRdWV1ZTogc2xhY2tQb3N0ZXIucXVldWUsXG4gICAgICAgIGVycm9yRGVidWdMb2dHcm91cDogZXJyb3JEZWJ1Z0xvZ0dyb3VwLFxuICAgICAgICBmaWxlRXhjaGFuZ2VCdWNrZXQ6IGZpbGVFeGNoYW5nZUJ1Y2tldC5idWNrZXQsXG4gICAgICAgIHNsYWNrU2VhcmNoQWdlbnRBcm46XG4gICAgICAgICAgcHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybiB8fFxuICAgICAgICAgICh0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInNsYWNrU2VhcmNoQWdlbnRBcm5cIikgYXMgc3RyaW5nIHwgdW5kZWZpbmVkKSB8fFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgIH0sXG4gICAgKTtcbiAgICB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybiA9IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lLnJ1bnRpbWVBcm47XG5cbiAgICAvLyBSZXZpc2lvbiBmcm9tIHNpZ25pbmcgc2VjcmV0IHNvIExhbWJkYSBlbnYgY2hhbmdlcyB3aGVuIHNlY3JldCBjaGFuZ2VzOyB3YXJtIGluc3RhbmNlcyB0aGVuIHJlZmV0Y2ggZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgICBjb25zdCBjb25maWdSZXZpc2lvbiA9IGNyeXB0b1xuICAgICAgLmNyZWF0ZUhhc2goXCJzaGEyNTZcIilcbiAgICAgIC51cGRhdGUoc2xhY2tTaWduaW5nU2VjcmV0KVxuICAgICAgLmRpZ2VzdChcImhleFwiKVxuICAgICAgLnNsaWNlKDAsIDE2KTtcblxuICAgIHRoaXMuc2xhY2tFdmVudEhhbmRsZXIgPSBuZXcgU2xhY2tFdmVudEhhbmRsZXIodGhpcywgXCJTbGFja0V2ZW50SGFuZGxlclwiLCB7XG4gICAgICBzbGFja1NpZ25pbmdTZWNyZXQ6IHNsYWNrU2lnbmluZ1NlY3JldFJlc291cmNlLFxuICAgICAgc2xhY2tCb3RUb2tlblNlY3JldDogc2xhY2tCb3RUb2tlblNlY3JldCxcbiAgICAgIHRva2VuVGFibGVOYW1lOiB0b2tlblN0b3JhZ2UudGFibGUudGFibGVOYW1lLFxuICAgICAgZGVkdXBlVGFibGVOYW1lOiBldmVudERlZHVwZS50YWJsZS50YWJsZU5hbWUsXG4gICAgICBleGlzdGVuY2VDaGVja0NhY2hlVGFibGVOYW1lOiBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIHdoaXRlbGlzdENvbmZpZ1RhYmxlTmFtZTogd2hpdGVsaXN0Q29uZmlnLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIHJhdGVMaW1pdFRhYmxlTmFtZTogcmF0ZUxpbWl0LnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGF3c1JlZ2lvbixcbiAgICAgIGJlZHJvY2tNb2RlbElkLFxuICAgICAgdmVyaWZpY2F0aW9uQWdlbnRBcm46IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuLFxuICAgICAgYWdlbnRJbnZvY2F0aW9uUXVldWU6IHRoaXMuYWdlbnRJbnZvY2F0aW9uUXVldWUsXG4gICAgICBjb25maWdSZXZpc2lvbixcbiAgICAgIGF1dG9SZXBseUNoYW5uZWxJZHM6IHByb3BzLmF1dG9SZXBseUNoYW5uZWxJZHMsXG4gICAgfSk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBcGlBY2Nlc3NMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKFxuICAgICAgdGhpcyxcbiAgICAgIFwiU2xhY2tJbmdyZXNzQXBpQWNjZXNzTG9nc1wiLFxuICAgICAge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja0luZ3Jlc3NBcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsIFwiU2xhY2tJbmdyZXNzQXBpXCIsIHtcbiAgICAgIGVuZHBvaW50Q29uZmlndXJhdGlvbjoge1xuICAgICAgICB0eXBlczogW2FwaWdhdGV3YXkuRW5kcG9pbnRUeXBlLlJFR0lPTkFMXSxcbiAgICAgIH0sXG4gICAgICByZXN0QXBpTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXNsYWNrLWluZ3Jlc3NgLFxuICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgaW5ncmVzcyBlbmRwb2ludCBmb3IgU2xhY2tFdmVudEhhbmRsZXIgKEFQSSBHYXRld2F5KVwiLFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IFwicHJvZFwiLFxuICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogNTAsXG4gICAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IDI1LFxuICAgICAgICBhY2Nlc3NMb2dEZXN0aW5hdGlvbjogbmV3IGFwaWdhdGV3YXkuTG9nR3JvdXBMb2dEZXN0aW5hdGlvbihcbiAgICAgICAgICBzbGFja0luZ3Jlc3NBcGlBY2Nlc3NMb2dHcm91cCxcbiAgICAgICAgKSxcbiAgICAgICAgYWNjZXNzTG9nRm9ybWF0OiBhcGlnYXRld2F5LkFjY2Vzc0xvZ0Zvcm1hdC5qc29uV2l0aFN0YW5kYXJkRmllbGRzKHtcbiAgICAgICAgICBjYWxsZXI6IHRydWUsXG4gICAgICAgICAgaHR0cE1ldGhvZDogdHJ1ZSxcbiAgICAgICAgICBpcDogdHJ1ZSxcbiAgICAgICAgICBwcm90b2NvbDogdHJ1ZSxcbiAgICAgICAgICByZXF1ZXN0VGltZTogdHJ1ZSxcbiAgICAgICAgICByZXNvdXJjZVBhdGg6IHRydWUsXG4gICAgICAgICAgcmVzcG9uc2VMZW5ndGg6IHRydWUsXG4gICAgICAgICAgc3RhdHVzOiB0cnVlLFxuICAgICAgICAgIHVzZXI6IHRydWUsXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICAgIGNsb3VkV2F0Y2hSb2xlOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzTGFtYmRhSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24sXG4gICAgICB7IHByb3h5OiB0cnVlIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrUmVzb3VyY2UgPSBzbGFja0luZ3Jlc3NBcGkucm9vdFxuICAgICAgLmFkZFJlc291cmNlKFwic2xhY2tcIilcbiAgICAgIC5hZGRSZXNvdXJjZShcImV2ZW50c1wiKTtcbiAgICBzbGFja1Jlc291cmNlLmFkZE1ldGhvZChcIlBPU1RcIiwgc2xhY2tJbmdyZXNzTGFtYmRhSW50ZWdyYXRpb24pO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQWNsTmFtZSA9IGAke3RoaXMuc3RhY2tOYW1lfS1zbGFjay1pbmdyZXNzLWFjbGA7XG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzQWNsTWV0cmljTmFtZSA9IGAke3RoaXMuc3RhY2tOYW1lfVNsYWNrSW5ncmVzc0FjbGAucmVwbGFjZShcbiAgICAgIC9bXkEtWmEtejAtOV0vZyxcbiAgICAgIFwiXCIsXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrSW5ncmVzc0FjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgXCJTbGFja0luZ3Jlc3NXZWJBY2xcIiwge1xuICAgICAgbmFtZTogc2xhY2tJbmdyZXNzQWNsTmFtZSxcbiAgICAgIGRlZmF1bHRBY3Rpb246IHsgYWxsb3c6IHt9IH0sXG4gICAgICBzY29wZTogXCJSRUdJT05BTFwiLFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IHNsYWNrSW5ncmVzc0FjbE1ldHJpY05hbWUsXG4gICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgcnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6IFwiQVdTLUFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXRcIixcbiAgICAgICAgICBwcmlvcml0eTogMCxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgdmVuZG9yTmFtZTogXCJBV1NcIixcbiAgICAgICAgICAgICAgbmFtZTogXCJBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0XCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiBcIkFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXRcIixcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6IFwiU2xhY2tJbmdyZXNzUmF0ZUxpbWl0XCIsXG4gICAgICAgICAgcHJpb3JpdHk6IDEwLFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6IFwiSVBcIixcbiAgICAgICAgICAgICAgbGltaXQ6IDIwMDAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiU2xhY2tJbmdyZXNzUmF0ZUxpbWl0XCIsXG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2xhY2tJbmdyZXNzU3RhZ2VBcm4gPSBgYXJuOmF3czphcGlnYXRld2F5OiR7dGhpcy5yZWdpb259OjovcmVzdGFwaXMvJHtzbGFja0luZ3Jlc3NBcGkucmVzdEFwaUlkfS9zdGFnZXMvJHtzbGFja0luZ3Jlc3NBcGkuZGVwbG95bWVudFN0YWdlLnN0YWdlTmFtZX1gO1xuXG4gICAgbmV3IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uKHRoaXMsIFwiU2xhY2tJbmdyZXNzV2ViQWNsQXNzb2NpYXRpb25cIiwge1xuICAgICAgd2ViQWNsQXJuOiBzbGFja0luZ3Jlc3NBY2wuYXR0ckFybixcbiAgICAgIHJlc291cmNlQXJuOiBzbGFja0luZ3Jlc3NTdGFnZUFybixcbiAgICB9KTtcblxuICAgIG5ldyBBZ2VudEludm9rZXIodGhpcywgXCJBZ2VudEludm9rZXJcIiwge1xuICAgICAgYWdlbnRJbnZvY2F0aW9uUXVldWU6IHRoaXMuYWdlbnRJbnZvY2F0aW9uUXVldWUsXG4gICAgICB2ZXJpZmljYXRpb25BZ2VudEFybjogdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4sXG4gICAgfSk7XG5cbiAgICB0b2tlblN0b3JhZ2UudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuICAgIGV2ZW50RGVkdXBlLnRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uKTtcbiAgICBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShcbiAgICAgIHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24sXG4gICAgKTtcbiAgICB3aGl0ZWxpc3RDb25maWcudGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uKTtcbiAgICByYXRlTGltaXQudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm5cIiwge1xuICAgICAgdmFsdWU6IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lLnJ1bnRpbWVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJWZXJpZmljYXRpb24gQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgQVJOXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tVmVyaWZpY2F0aW9uQWdlbnRBcm5gLFxuICAgIH0pO1xuXG4gICAgdGhpcy5sYW1iZGFSb2xlQXJuID0gdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbi5yb2xlIS5yb2xlQXJuO1xuICAgIHRoaXMuZnVuY3Rpb25VcmwgPSB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uVXJsLnVybDtcbiAgICB0aGlzLmFwaUdhdGV3YXlVcmwgPSBzbGFja0luZ3Jlc3NBcGkudXJsO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJXaGl0ZWxpc3RBdXRob3JpemF0aW9uRmFpbHVyZUFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVdoaXRlbGlzdEF1dGhvcml6YXRpb25GYWlsdXJlYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiB3aGl0ZWxpc3QgYXV0aG9yaXphdGlvbiBmYWlsdXJlcyBleGNlZWQgdGhyZXNob2xkICg1IGZhaWx1cmVzIGluIDUgbWludXRlcylcIixcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiV2hpdGVsaXN0QXV0aG9yaXphdGlvbkZhaWxlZFwiLFxuICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIldoaXRlbGlzdENvbmZpZ0xvYWRFcnJvckFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVdoaXRlbGlzdENvbmZpZ0xvYWRFcnJvcmAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBcIkFsZXJ0IHdoZW4gd2hpdGVsaXN0IGNvbmZpZ3VyYXRpb24gbG9hZCBlcnJvcnMgb2NjdXJcIixcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiV2hpdGVsaXN0Q29uZmlnTG9hZEVycm9yc1wiLFxuICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIkV4aXN0ZW5jZUNoZWNrRmFpbGVkQWxhcm1cIiwge1xuICAgICAgYWxhcm1OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tZXhpc3RlbmNlLWNoZWNrLWZhaWxlZGAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gRXhpc3RlbmNlIENoZWNrIGZhaWx1cmVzIGV4Y2VlZCB0aHJlc2hvbGQgKHBvdGVudGlhbCBzZWN1cml0eSBpc3N1ZSlcIixcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiRXhpc3RlbmNlQ2hlY2tGYWlsZWRcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJSYXRlTGltaXRFeGNlZWRlZEFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LXJhdGUtbGltaXQtZXhjZWVkZWRgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjpcbiAgICAgICAgXCJBbGVydCB3aGVuIHJhdGUgbGltaXQgZXhjZWVkZWQgZXZlbnRzIGV4Y2VlZCB0aHJlc2hvbGQgKHBvdGVudGlhbCBERG9TIGF0dGFjaylcIixcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiUmF0ZUxpbWl0RXhjZWVkZWRcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiU2xhY2tJbmdyZXNzV2FmQmxvY2tlZFJlcXVlc3RzQWxhcm1cIiwge1xuICAgICAgYWxhcm1OYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tc2xhY2staW5ncmVzcy13YWYtYmxvY2tlZC1yZXF1ZXN0c2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gV0FGIGJsb2NrZWQgcmVxdWVzdHMgc3Bpa2Ugb24gU2xhY2sgaW5ncmVzcyBlbmRwb2ludFwiLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6IFwiQVdTL1dBRlYyXCIsXG4gICAgICAgIG1ldHJpY05hbWU6IFwiQmxvY2tlZFJlcXVlc3RzXCIsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBXZWJBQ0w6IHNsYWNrSW5ncmVzc0FjbE5hbWUsXG4gICAgICAgICAgUmVnaW9uOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgICBSdWxlOiBcIkFMTFwiLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6IFwiU3VtXCIsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMjAwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiU2xhY2tFdmVudEhhbmRsZXJVcmxcIiwge1xuICAgICAgdmFsdWU6IHRoaXMuZnVuY3Rpb25VcmwsXG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgXCJTbGFjayBFdmVudCBIYW5kbGVyIEZ1bmN0aW9uIFVSTCAoZm9yIFNsYWNrIEV2ZW50IFN1YnNjcmlwdGlvbnMpXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tU2xhY2tFdmVudEhhbmRsZXJVcmxgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJTbGFja0V2ZW50SGFuZGxlckFwaUdhdGV3YXlVcmxcIiwge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpR2F0ZXdheVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIEV2ZW50IEhhbmRsZXIgQVBJIEdhdGV3YXkgVVJMIChyZWNvbW1lbmRlZCBpbmdyZXNzIGVuZHBvaW50KVwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVNsYWNrRXZlbnRIYW5kbGVyQXBpR2F0ZXdheVVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlZlcmlmaWNhdGlvbkxhbWJkYVJvbGVBcm5cIiwge1xuICAgICAgdmFsdWU6IHRoaXMubGFtYmRhUm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlZlcmlmaWNhdGlvbiBMYW1iZGEgUm9sZSBBUk5cIixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1WZXJpZmljYXRpb25MYW1iZGFSb2xlQXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiU2xhY2tFdmVudEhhbmRsZXJBcm5cIiwge1xuICAgICAgdmFsdWU6IHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJTbGFja0V2ZW50SGFuZGxlciBMYW1iZGEgQVJOXCIsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==