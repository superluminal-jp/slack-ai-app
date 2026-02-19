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
const cost_allocation_tags_1 = require("./utils/cost-allocation-tags");
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
 * (AgentCore A2A). Communicates with Execution Stack only via AgentCore A2A (SigV4); no API Gateway or SQS.
 *
 * Responsibilities:
 * - Slack event ingestion (SlackEventHandler Lambda with Function URL)
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
        (0, cost_allocation_tags_1.applyCostAllocationTags)(this, { deploymentEnv });
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
            "amazon.nova-pro-v1:0";
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
exports.VerificationStack = VerificationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmVyaWZpY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLCtDQUFpQztBQUNqQyxpREFBbUM7QUFDbkMsMkRBQTZDO0FBQzdDLCtFQUFpRTtBQUNqRSx1RUFBeUQ7QUFDekQseURBQTJDO0FBRTNDLHVFQUF1RTtBQUN2RSwwRUFBcUU7QUFDckUsOERBQTBEO0FBQzFELDREQUF3RDtBQUN4RCw4RUFBeUU7QUFDekUsb0VBQWdFO0FBQ2hFLHdEQUFvRDtBQUNwRCx3RkFBbUY7QUFDbkYsZ0ZBQTJFO0FBQzNFLDhEQUEwRDtBQUMxRCw0REFBd0Q7QUFDeEQsNEVBQXVFO0FBR3ZFOzs7Ozs7Ozs7Ozs7Ozs7OztHQWlCRztBQUNILE1BQWEsaUJBQWtCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDOUMscUNBQXFDO0lBQ3JCLGlCQUFpQixDQUFvQjtJQUVyRCwwQkFBMEI7SUFDVixhQUFhLENBQVM7SUFFdEMsdURBQXVEO0lBQ3ZDLFdBQVcsQ0FBUztJQUVwQyxxREFBcUQ7SUFDckMsd0JBQXdCLENBQTJCO0lBRW5FLGlEQUFpRDtJQUNqQyxvQkFBb0IsQ0FBdUI7SUFFM0Qsc0RBQXNEO0lBQ3RDLDJCQUEyQixDQUFTO0lBRXBELDBEQUEwRDtJQUMxQyxvQkFBb0IsQ0FBYTtJQUVqRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sZ0JBQWdCLEdBQ3BCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQztZQUN4QyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWM7WUFDMUIsS0FBSyxDQUFDO1FBQ1IsTUFBTSxhQUFhLEdBQUcsZ0JBQWdCLENBQUMs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RSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxXQUFXO1lBQ2xELFdBQVcsRUFBRSw4QkFBOEI7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBcFNELDhDQW9TQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNyeXB0byBmcm9tIFwiY3J5cHRvXCI7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbG9nc1wiO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlclwiO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2hcIjtcbmltcG9ydCAqIGFzIHNxcyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNxc1wiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCB7IGFwcGx5Q29zdEFsbG9jYXRpb25UYWdzIH0gZnJvbSBcIi4vdXRpbHMvY29zdC1hbGxvY2F0aW9uLXRhZ3NcIjtcbmltcG9ydCB7IFNsYWNrRXZlbnRIYW5kbGVyIH0gZnJvbSBcIi4vY29uc3RydWN0cy9zbGFjay1ldmVudC1oYW5kbGVyXCI7XG5pbXBvcnQgeyBUb2tlblN0b3JhZ2UgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3Rva2VuLXN0b3JhZ2VcIjtcbmltcG9ydCB7IEV2ZW50RGVkdXBlIH0gZnJvbSBcIi4vY29uc3RydWN0cy9ldmVudC1kZWR1cGVcIjtcbmltcG9ydCB7IEV4aXN0ZW5jZUNoZWNrQ2FjaGUgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2V4aXN0ZW5jZS1jaGVjay1jYWNoZVwiO1xuaW1wb3J0IHsgV2hpdGVsaXN0Q29uZmlnIH0gZnJvbSBcIi4vY29uc3RydWN0cy93aGl0ZWxpc3QtY29uZmlnXCI7XG5pbXBvcnQgeyBSYXRlTGltaXQgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL3JhdGUtbGltaXRcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSB9IGZyb20gXCIuL2NvbnN0cnVjdHMvdmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWVcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvbkFnZW50RWNyIH0gZnJvbSBcIi4vY29uc3RydWN0cy92ZXJpZmljYXRpb24tYWdlbnQtZWNyXCI7XG5pbXBvcnQgeyBBZ2VudEludm9rZXIgfSBmcm9tIFwiLi9jb25zdHJ1Y3RzL2FnZW50LWludm9rZXJcIjtcbmltcG9ydCB7IFNsYWNrUG9zdGVyIH0gZnJvbSBcIi4vY29uc3RydWN0cy9zbGFjay1wb3N0ZXJcIjtcbmltcG9ydCB7IEZpbGVFeGNoYW5nZUJ1Y2tldCB9IGZyb20gXCIuL2NvbnN0cnVjdHMvZmlsZS1leGNoYW5nZS1idWNrZXRcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvblN0YWNrUHJvcHMgfSBmcm9tIFwiLi90eXBlcy9zdGFjay1jb25maWdcIjtcblxuLyoqXG4gKiBWZXJpZmljYXRpb24gU3RhY2sgKEFjY291bnQgQSAvIFZlcmlmaWNhdGlvbiBab25lKVxuICpcbiAqIFB1cnBvc2U6IEhhbmRsZXMgU2xhY2sgZXZlbnRzLCB2YWxpZGF0ZXMgYW5kIGF1dGhvcml6ZXMgcmVxdWVzdHMsIGFuZCBpbnZva2VzIHRoZSBWZXJpZmljYXRpb24gQWdlbnRcbiAqIChBZ2VudENvcmUgQTJBKS4gQ29tbXVuaWNhdGVzIHdpdGggRXhlY3V0aW9uIFN0YWNrIG9ubHkgdmlhIEFnZW50Q29yZSBBMkEgKFNpZ1Y0KTsgbm8gQVBJIEdhdGV3YXkgb3IgU1FTLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6XG4gKiAtIFNsYWNrIGV2ZW50IGluZ2VzdGlvbiAoU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIHdpdGggRnVuY3Rpb24gVVJMKVxuICogLSBEeW5hbW9EQiAodG9rZW4gc3RvcmFnZSwgZXZlbnQgZGVkdXBlLCBleGlzdGVuY2UgY2hlY2sgY2FjaGUsIHdoaXRlbGlzdCwgcmF0ZSBsaW1pdClcbiAqIC0gU2VjcmV0cyBNYW5hZ2VyIChTbGFjayBjcmVkZW50aWFscylcbiAqIC0gVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIChBMkEpIGFuZCBFQ1IgaW1hZ2VcbiAqIC0gQWdlbnQgaW52b2NhdGlvbiAoQWdlbnRJbnZva2VyLCBTbGFja1Bvc3RlciksIFMzIGZpbGUgZXhjaGFuZ2UgYnVja2V0LCBDbG91ZFdhdGNoIGFsYXJtc1xuICpcbiAqIElucHV0czogVmVyaWZpY2F0aW9uU3RhY2tQcm9wcyAoZW52LCBleGVjdXRpb25BY2NvdW50SWQsIHZlcmlmaWNhdGlvbkFnZW50TmFtZSwgZXhlY3V0aW9uQWdlbnRBcm5zLCBldGMuKTtcbiAqIGNvbnRleHQ6IGRlcGxveW1lbnRFbnYsIGF3c1JlZ2lvbiwgc2xhY2tCb3RUb2tlbiwgc2xhY2tTaWduaW5nU2VjcmV0LCBiZWRyb2NrTW9kZWxJZCwgZXhlY3V0aW9uQWdlbnRBcm5zLlxuICpcbiAqIE91dHB1dHM6IHNsYWNrRXZlbnRIYW5kbGVyLCBmdW5jdGlvblVybCwgbGFtYmRhUm9sZUFybiwgdmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuLCBhZ2VudEludm9jYXRpb25RdWV1ZTsgQ2ZuT3V0cHV0cyBmb3IgVVJMcyBhbmQgQVJOcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFZlcmlmaWNhdGlvblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgLyoqIFRoZSBTbGFjayBFdmVudCBIYW5kbGVyIExhbWJkYSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgc2xhY2tFdmVudEhhbmRsZXI6IFNsYWNrRXZlbnRIYW5kbGVyO1xuXG4gIC8qKiBUaGUgTGFtYmRhIHJvbGUgQVJOICovXG4gIHB1YmxpYyByZWFkb25seSBsYW1iZGFSb2xlQXJuOiBzdHJpbmc7XG5cbiAgLyoqIFRoZSBGdW5jdGlvbiBVUkwgKGZvciBTbGFjayBFdmVudCBTdWJzY3JpcHRpb25zKSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZnVuY3Rpb25Vcmw6IHN0cmluZztcblxuICAvKiogQWdlbnRDb3JlIFJ1bnRpbWUgZm9yIFZlcmlmaWNhdGlvbiBBZ2VudCAoQTJBKSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lOiBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWU7XG5cbiAgLyoqIEFnZW50Q29yZSBFQ1IgaW1hZ2UgZm9yIFZlcmlmaWNhdGlvbiBBZ2VudCAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdmVyaWZpY2F0aW9uQWdlbnRFY3I6IFZlcmlmaWNhdGlvbkFnZW50RWNyO1xuXG4gIC8qKiBBZ2VudENvcmUgUnVudGltZSBBUk4gZm9yIGNyb3NzLXN0YWNrIHJlZmVyZW5jZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuOiBzdHJpbmc7XG5cbiAgLyoqIFNRUyBxdWV1ZSBmb3IgYXN5bmMgYWdlbnQgaW52b2NhdGlvbiByZXF1ZXN0cyAoMDE2KSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYWdlbnRJbnZvY2F0aW9uUXVldWU6IHNxcy5JUXVldWU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFZlcmlmaWNhdGlvblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IGRlcGxveW1lbnRFbnZSYXcgPVxuICAgICAgdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIpIHx8XG4gICAgICBwcm9jZXNzLmVudi5ERVBMT1lNRU5UX0VOViB8fFxuICAgICAgXCJkZXZcIjtcbiAgICBjb25zdCBkZXBsb3ltZW50RW52ID0gZGVwbG95bWVudEVudlJhdy50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcblxuICAgIGFwcGx5Q29zdEFsbG9jYXRpb25UYWdzKHRoaXMsIHsgZGVwbG95bWVudEVudiB9KTtcblxuICAgIGNvbnN0IHNsYWNrQm90VG9rZW4gPVxuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInNsYWNrQm90VG9rZW5cIikgfHxcbiAgICAgIFwiXCI7XG4gICAgaWYgKCFzbGFja0JvdFRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiU0xBQ0tfQk9UX1RPS0VOIGlzIHJlcXVpcmVkLiBTZXQgaXQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlIChTTEFDS19CT1RfVE9LRU4pIG9yIGNvbmZpZyBmaWxlIChzbGFja0JvdFRva2VuKS5cIlxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBzbGFja1NpZ25pbmdTZWNyZXQgPVxuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQgfHxcbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwic2xhY2tTaWduaW5nU2VjcmV0XCIpIHx8XG4gICAgICBcIlwiO1xuICAgIGlmICghc2xhY2tTaWduaW5nU2VjcmV0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiU0xBQ0tfU0lHTklOR19TRUNSRVQgaXMgcmVxdWlyZWQuIFNldCBpdCB2aWEgZW52aXJvbm1lbnQgdmFyaWFibGUgKFNMQUNLX1NJR05JTkdfU0VDUkVUKSBvciBjb25maWcgZmlsZSAoc2xhY2tTaWduaW5nU2VjcmV0KS5cIlxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBhd3NSZWdpb24gPVxuICAgICAgcHJvcHMuYXdzUmVnaW9uIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImF3c1JlZ2lvblwiKSB8fFxuICAgICAgXCJhcC1ub3J0aGVhc3QtMVwiO1xuICAgIGNvbnN0IGJlZHJvY2tNb2RlbElkID1cbiAgICAgIHByb3BzLmJlZHJvY2tNb2RlbElkIHx8XG4gICAgICB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImJlZHJvY2tNb2RlbElkXCIpIHx8XG4gICAgICBcImFtYXpvbi5ub3ZhLXByby12MTowXCI7XG5jb25zdCBzbGFja1NpZ25pbmdTZWNyZXRSZXNvdXJjZSA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQoXG4gICAgICB0aGlzLFxuICAgICAgXCJTbGFja1NpZ25pbmdTZWNyZXRcIixcbiAgICAgIHtcbiAgICAgICAgc2VjcmV0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9L3NsYWNrL3NpZ25pbmctc2VjcmV0YCxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgYXBwIHNpZ25pbmcgc2VjcmV0IGZvciByZXF1ZXN0IHZlcmlmaWNhdGlvblwiLFxuICAgICAgICBzZWNyZXRTdHJpbmdWYWx1ZTogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dChzbGFja1NpZ25pbmdTZWNyZXQpLFxuICAgICAgfVxuICAgICk7XG5cbiAgICBjb25zdCBzbGFja0JvdFRva2VuU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldChcbiAgICAgIHRoaXMsXG4gICAgICBcIlNsYWNrQm90VG9rZW5cIixcbiAgICAgIHtcbiAgICAgICAgc2VjcmV0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9L3NsYWNrL2JvdC10b2tlbmAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrIGJvdCBPQXV0aCB0b2tlblwiLFxuICAgICAgICBzZWNyZXRTdHJpbmdWYWx1ZTogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dChzbGFja0JvdFRva2VuKSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gT3JkZXI6IER5bmFtb0RCIHRhYmxlcyBhbmQgU1FTL1NlY3JldHMgZmlyc3Q7IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSBkZXBlbmRzIG9uIGFsbCBvZiB0aGVtXG4gICAgY29uc3QgdG9rZW5TdG9yYWdlID0gbmV3IFRva2VuU3RvcmFnZSh0aGlzLCBcIlRva2VuU3RvcmFnZVwiKTtcbiAgICBjb25zdCBldmVudERlZHVwZSA9IG5ldyBFdmVudERlZHVwZSh0aGlzLCBcIkV2ZW50RGVkdXBlXCIpO1xuICAgIGNvbnN0IGV4aXN0ZW5jZUNoZWNrQ2FjaGUgPSBuZXcgRXhpc3RlbmNlQ2hlY2tDYWNoZSh0aGlzLCBcIkV4aXN0ZW5jZUNoZWNrQ2FjaGVcIik7XG4gICAgY29uc3Qgd2hpdGVsaXN0Q29uZmlnID0gbmV3IFdoaXRlbGlzdENvbmZpZyh0aGlzLCBcIldoaXRlbGlzdENvbmZpZ1wiKTtcbiAgICBjb25zdCByYXRlTGltaXQgPSBuZXcgUmF0ZUxpbWl0KHRoaXMsIFwiUmF0ZUxpbWl0XCIpO1xuICAgIGNvbnN0IGZpbGVFeGNoYW5nZUJ1Y2tldCA9IG5ldyBGaWxlRXhjaGFuZ2VCdWNrZXQodGhpcywgXCJGaWxlRXhjaGFuZ2VCdWNrZXRcIik7XG5cbiAgICBjb25zdCBhZ2VudEludm9jYXRpb25EbHEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsIFwiQWdlbnRJbnZvY2F0aW9uUmVxdWVzdERscVwiLCB7XG4gICAgICBxdWV1ZU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1hZ2VudC1pbnZvY2F0aW9uLWRscWAsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICB9KTtcblxuICAgIC8vIFZpc2liaWxpdHkgdGltZW91dCA+PSA2ICogQWdlbnQgSW52b2tlciBMYW1iZGEgdGltZW91dCAoOTAwcykgcGVyIEFXUyBTUVMrTGFtYmRhIGJlc3QgcHJhY3RpY2U7IHByZXZlbnRzIHJlZHJpdmUgZHVyaW5nIGxvbmcgcnVuc1xuICAgIGNvbnN0IGFnZW50SW52b2NhdGlvblF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCBcIkFnZW50SW52b2NhdGlvblJlcXVlc3RcIiwge1xuICAgICAgcXVldWVOYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tYWdlbnQtaW52b2NhdGlvbi1yZXF1ZXN0YCxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1NDAwKSxcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBhZ2VudEludm9jYXRpb25EbHEsXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGhpcy5hZ2VudEludm9jYXRpb25RdWV1ZSA9IGFnZW50SW52b2NhdGlvblF1ZXVlO1xuXG4gICAgLy8gUnVudGltZSBuYW1lIG11c3QgYmUgdW5pcXVlIHBlciBhY2NvdW50IChEZXYgYW5kIFByb2QgY29leGlzdCk7IGRlZmF1bHQgaW5jbHVkZXMgZW52IGZyb20gc3RhY2sgbmFtZVxuICAgIGNvbnN0IHZlcmlmaWNhdGlvbkFnZW50TmFtZSA9XG4gICAgICBwcm9wcy52ZXJpZmljYXRpb25BZ2VudE5hbWUgfHxcbiAgICAgIHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwidmVyaWZpY2F0aW9uQWdlbnROYW1lXCIpIHx8XG4gICAgICBgU2xhY2tBSV9WZXJpZmljYXRpb25BZ2VudF8ke3RoaXMuc3RhY2tOYW1lLmluY2x1ZGVzKFwiLVByb2RcIikgPyBcIlByb2RcIiA6IFwiRGV2XCJ9YDtcbiAgICBjb25zdCBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3ID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXG4gICAgICBcImV4ZWN1dGlvbkFnZW50QXJuc1wiXG4gICAgKTtcbiAgICBjb25zdCBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zID1cbiAgICAgIGNvbnRleHRFeGVjdXRpb25BZ2VudEFybnNSYXcgJiZcbiAgICAgIHR5cGVvZiBjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3ID09PSBcIm9iamVjdFwiICYmXG4gICAgICAhQXJyYXkuaXNBcnJheShjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3KVxuICAgICAgICA/IChjb250ZXh0RXhlY3V0aW9uQWdlbnRBcm5zUmF3IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pXG4gICAgICAgIDoge307XG4gICAgY29uc3QgZXhlY3V0aW9uQWdlbnRBcm5zID0ge1xuICAgICAgLi4uY29udGV4dEV4ZWN1dGlvbkFnZW50QXJucyxcbiAgICAgIC4uLihwcm9wcy5leGVjdXRpb25BZ2VudEFybnMgfHwge30pLFxuICAgIH07XG5cbiAgICAvLyBFQ1IgYmVmb3JlIFJ1bnRpbWUgKFJ1bnRpbWUgbmVlZHMgY29udGFpbmVySW1hZ2VVcmkpLiBTbGFja1Bvc3RlciBhbmQgTG9nR3JvdXAgYmVmb3JlIFJ1bnRpbWUgKG9wdGlvbmFsIHF1ZXVlIGFuZCBsb2cgZ3JvdXApLlxuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRFY3IgPSBuZXcgVmVyaWZpY2F0aW9uQWdlbnRFY3IoXG4gICAgICB0aGlzLFxuICAgICAgXCJWZXJpZmljYXRpb25BZ2VudEVjclwiXG4gICAgKTtcblxuICAgIGNvbnN0IHNsYWNrUG9zdGVyID0gbmV3IFNsYWNrUG9zdGVyKHRoaXMsIFwiU2xhY2tQb3N0ZXJcIiwge1xuICAgICAgc3RhY2tOYW1lOiB0aGlzLnN0YWNrTmFtZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGVycm9yRGVidWdMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsIFwiVmVyaWZpY2F0aW9uQWdlbnRFcnJvckxvZ3NcIiwge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9iZWRyb2NrLWFnZW50Y29yZS8ke3RoaXMuc3RhY2tOYW1lfS12ZXJpZmljYXRpb24tYWdlbnQtZXJyb3JzYCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lID0gbmV3IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZShcbiAgICAgIHRoaXMsXG4gICAgICBcIlZlcmlmaWNhdGlvbkFnZW50UnVudGltZVwiLFxuICAgICAge1xuICAgICAgICBhZ2VudFJ1bnRpbWVOYW1lOiB2ZXJpZmljYXRpb25BZ2VudE5hbWUsXG4gICAgICAgIGNvbnRhaW5lckltYWdlVXJpOiB0aGlzLnZlcmlmaWNhdGlvbkFnZW50RWNyLmltYWdlVXJpLFxuICAgICAgICB0b2tlblRhYmxlOiB0b2tlblN0b3JhZ2UudGFibGUsXG4gICAgICAgIGRlZHVwZVRhYmxlOiBldmVudERlZHVwZS50YWJsZSxcbiAgICAgICAgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlOiBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLFxuICAgICAgICB3aGl0ZWxpc3RDb25maWdUYWJsZTogd2hpdGVsaXN0Q29uZmlnLnRhYmxlLFxuICAgICAgICByYXRlTGltaXRUYWJsZTogcmF0ZUxpbWl0LnRhYmxlLFxuICAgICAgICBzbGFja1NpZ25pbmdTZWNyZXQ6IHNsYWNrU2lnbmluZ1NlY3JldFJlc291cmNlLFxuICAgICAgICBzbGFja0JvdFRva2VuU2VjcmV0OiBzbGFja0JvdFRva2VuU2VjcmV0LFxuICAgICAgICBleGVjdXRpb25BZ2VudEFybnM6XG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IGV4ZWN1dGlvbkFnZW50QXJuc1xuICAgICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIHNsYWNrUG9zdFJlcXVlc3RRdWV1ZTogc2xhY2tQb3N0ZXIucXVldWUsXG4gICAgICAgIGVycm9yRGVidWdMb2dHcm91cDogZXJyb3JEZWJ1Z0xvZ0dyb3VwLFxuICAgICAgICBmaWxlRXhjaGFuZ2VCdWNrZXQ6IGZpbGVFeGNoYW5nZUJ1Y2tldC5idWNrZXQsXG4gICAgICB9XG4gICAgKTtcbiAgICB0aGlzLnZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybiA9IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lLnJ1bnRpbWVBcm47XG5cbiAgICAvLyBSZXZpc2lvbiBmcm9tIHNpZ25pbmcgc2VjcmV0IHNvIExhbWJkYSBlbnYgY2hhbmdlcyB3aGVuIHNlY3JldCBjaGFuZ2VzOyB3YXJtIGluc3RhbmNlcyB0aGVuIHJlZmV0Y2ggZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgICBjb25zdCBjb25maWdSZXZpc2lvbiA9IGNyeXB0b1xuICAgICAgLmNyZWF0ZUhhc2goXCJzaGEyNTZcIilcbiAgICAgIC51cGRhdGUoc2xhY2tTaWduaW5nU2VjcmV0KVxuICAgICAgLmRpZ2VzdChcImhleFwiKVxuICAgICAgLnNsaWNlKDAsIDE2KTtcblxuICAgIHRoaXMuc2xhY2tFdmVudEhhbmRsZXIgPSBuZXcgU2xhY2tFdmVudEhhbmRsZXIodGhpcywgXCJTbGFja0V2ZW50SGFuZGxlclwiLCB7XG4gICAgICBzbGFja1NpZ25pbmdTZWNyZXQ6IHNsYWNrU2lnbmluZ1NlY3JldFJlc291cmNlLFxuICAgICAgc2xhY2tCb3RUb2tlblNlY3JldDogc2xhY2tCb3RUb2tlblNlY3JldCxcbiAgICAgIHRva2VuVGFibGVOYW1lOiB0b2tlblN0b3JhZ2UudGFibGUudGFibGVOYW1lLFxuICAgICAgZGVkdXBlVGFibGVOYW1lOiBldmVudERlZHVwZS50YWJsZS50YWJsZU5hbWUsXG4gICAgICBleGlzdGVuY2VDaGVja0NhY2hlVGFibGVOYW1lOiBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIHdoaXRlbGlzdENvbmZpZ1RhYmxlTmFtZTogd2hpdGVsaXN0Q29uZmlnLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIHJhdGVMaW1pdFRhYmxlTmFtZTogcmF0ZUxpbWl0LnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGF3c1JlZ2lvbixcbiAgICAgIGJlZHJvY2tNb2RlbElkLFxuICAgICAgdmVyaWZpY2F0aW9uQWdlbnRBcm46IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuLFxuICAgICAgYWdlbnRJbnZvY2F0aW9uUXVldWU6IHRoaXMuYWdlbnRJbnZvY2F0aW9uUXVldWUsXG4gICAgICBjb25maWdSZXZpc2lvbixcbiAgICB9KTtcblxuICAgIG5ldyBBZ2VudEludm9rZXIodGhpcywgXCJBZ2VudEludm9rZXJcIiwge1xuICAgICAgYWdlbnRJbnZvY2F0aW9uUXVldWU6IHRoaXMuYWdlbnRJbnZvY2F0aW9uUXVldWUsXG4gICAgICB2ZXJpZmljYXRpb25BZ2VudEFybjogdGhpcy52ZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm4sXG4gICAgfSk7XG5cbiAgICB0b2tlblN0b3JhZ2UudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuICAgIGV2ZW50RGVkdXBlLnRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uKTtcbiAgICBleGlzdGVuY2VDaGVja0NhY2hlLnRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uKTtcbiAgICB3aGl0ZWxpc3RDb25maWcudGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uKTtcbiAgICByYXRlTGltaXQudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuc2xhY2tFdmVudEhhbmRsZXIuZnVuY3Rpb24pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVBcm5cIiwge1xuICAgICAgdmFsdWU6IHRoaXMudmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lLnJ1bnRpbWVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJWZXJpZmljYXRpb24gQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgQVJOXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tVmVyaWZpY2F0aW9uQWdlbnRBcm5gLFxuICAgIH0pO1xuXG4gICAgdGhpcy5sYW1iZGFSb2xlQXJuID0gdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbi5yb2xlIS5yb2xlQXJuO1xuICAgIHRoaXMuZnVuY3Rpb25VcmwgPSB0aGlzLnNsYWNrRXZlbnRIYW5kbGVyLmZ1bmN0aW9uVXJsLnVybDtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiV2hpdGVsaXN0QXV0aG9yaXphdGlvbkZhaWx1cmVBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1XaGl0ZWxpc3RBdXRob3JpemF0aW9uRmFpbHVyZWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOlxuICAgICAgICBcIkFsZXJ0IHdoZW4gd2hpdGVsaXN0IGF1dGhvcml6YXRpb24gZmFpbHVyZXMgZXhjZWVkIHRocmVzaG9sZCAoNSBmYWlsdXJlcyBpbiA1IG1pbnV0ZXMpXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIldoaXRlbGlzdEF1dGhvcml6YXRpb25GYWlsZWRcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJXaGl0ZWxpc3RDb25maWdMb2FkRXJyb3JBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1XaGl0ZWxpc3RDb25maWdMb2FkRXJyb3JgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjpcbiAgICAgICAgXCJBbGVydCB3aGVuIHdoaXRlbGlzdCBjb25maWd1cmF0aW9uIGxvYWQgZXJyb3JzIG9jY3VyXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIldoaXRlbGlzdENvbmZpZ0xvYWRFcnJvcnNcIixcbiAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjpcbiAgICAgICAgY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgXCJFeGlzdGVuY2VDaGVja0ZhaWxlZEFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7dGhpcy5zdGFja05hbWV9LWV4aXN0ZW5jZS1jaGVjay1mYWlsZWRgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjpcbiAgICAgICAgXCJBbGVydCB3aGVuIEV4aXN0ZW5jZSBDaGVjayBmYWlsdXJlcyBleGNlZWQgdGhyZXNob2xkIChwb3RlbnRpYWwgc2VjdXJpdHkgaXNzdWUpXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIkV4aXN0ZW5jZUNoZWNrRmFpbGVkXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6XG4gICAgICAgIGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiUmF0ZUxpbWl0RXhjZWVkZWRBbGFybVwiLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1yYXRlLWxpbWl0LWV4Y2VlZGVkYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246XG4gICAgICAgIFwiQWxlcnQgd2hlbiByYXRlIGxpbWl0IGV4Y2VlZGVkIGV2ZW50cyBleGNlZWQgdGhyZXNob2xkIChwb3RlbnRpYWwgRERvUyBhdHRhY2spXCIsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBtZXRyaWNOYW1lOiBcIlJhdGVMaW1pdEV4Y2VlZGVkXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJTdW1cIixcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOlxuICAgICAgICBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlNsYWNrRXZlbnRIYW5kbGVyVXJsXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmZ1bmN0aW9uVXJsLFxuICAgICAgZGVzY3JpcHRpb246IFwiU2xhY2sgRXZlbnQgSGFuZGxlciBGdW5jdGlvbiBVUkwgKGZvciBTbGFjayBFdmVudCBTdWJzY3JpcHRpb25zKVwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVNsYWNrRXZlbnRIYW5kbGVyVXJsYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVmVyaWZpY2F0aW9uTGFtYmRhUm9sZUFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sYW1iZGFSb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246IFwiVmVyaWZpY2F0aW9uIExhbWJkYSBSb2xlIEFSTlwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVZlcmlmaWNhdGlvbkxhbWJkYVJvbGVBcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJTbGFja0V2ZW50SGFuZGxlckFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zbGFja0V2ZW50SGFuZGxlci5mdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSBBUk5cIixcbiAgICB9KTtcbiAgfVxufVxuIl19