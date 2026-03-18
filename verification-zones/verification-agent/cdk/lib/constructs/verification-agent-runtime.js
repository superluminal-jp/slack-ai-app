"use strict";
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
 * secrets, executionAgentArns, optional slackPostRequestQueue, errorDebugLogGroup, fileExchangeBucket).
 *
 * Outputs: runtime, executionRole, runtimeArn (verificationAgentRuntimeArn).
 *
 * @module cdk/lib/verification/constructs/verification-agent-runtime
 */
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
exports.VerificationAgentRuntime = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const constructs_1 = require("constructs");
const cdk_tooling_1 = require("@slack-ai-app/cdk-tooling");
class VerificationAgentRuntime extends constructs_1.Construct {
    /** The AgentCore Runtime CFN resource */
    runtime;
    /** AgentCore auto-creates DEFAULT endpoint; we do not create it in CFn */
    endpoint = undefined;
    /** The IAM execution role for the AgentCore Runtime */
    executionRole;
    /** The ARN of the AgentCore Runtime */
    runtimeArn;
    constructor(scope, id, props) {
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
            description: "Execution role for Verification Agent AgentCore Runtime with DynamoDB, Secrets Manager, and AgentCore invoke permissions",
        });
        // ECR permissions for container image retrieval
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: "ECRImageAccess",
            effect: iam.Effect.ALLOW,
            actions: [
                "ecr:BatchGetImage",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetAuthorizationToken",
            ],
            resources: ["*"],
        }));
        // CloudWatch Logs permissions
        this.executionRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // X-Ray tracing permissions
        this.executionRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // CloudWatch Metrics permissions
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: "CloudWatchMetrics",
            effect: iam.Effect.ALLOW,
            actions: ["cloudwatch:PutMetricData"],
            resources: ["*"],
            conditions: {
                StringLike: {
                    "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"],
                },
            },
        }));
        // Router Agent runs Bedrock model inference for agent selection.
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: "BedrockInvokeModel",
            effect: iam.Effect.ALLOW,
            actions: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
            ],
            resources: ["*"],
        }));
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
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: "SecretsManagerWhitelist",
            effect: iam.Effect.ALLOW,
            actions: ["secretsmanager:GetSecretValue"],
            resources: [
                `arn:aws:secretsmanager:${stack.region}:${stack.account}:secret:${stack.stackName}/slack/whitelist-config*`,
            ],
        }));
        // AgentCore InvokeAgentRuntime permission (for calling Execution Agent).
        // AWS requires identity-based policy to allow the action on BOTH the agent runtime and
        // the agent endpoint (see resource-based-policies.html "Hierarchical authorization").
        // Include both endpoint ARN forms: ...:runtime-endpoint/Name/DEFAULT and
        // ...:runtime/Name/runtime-endpoint/DEFAULT (latter is used at evaluation per AccessDenied message).
        const targetAgentArns = [
            ...Object.values(props.executionAgentArns || {}),
            ...(props.slackSearchAgentArn ? [props.slackSearchAgentArn] : []),
        ].filter((arn) => Boolean(arn));
        const invokeResources = targetAgentArns.length
            ? targetAgentArns.flatMap((runtimeArn) => {
                const endpointArnDoc = runtimeArn.replace(/:runtime\//, ":runtime-endpoint/") + "/DEFAULT";
                const endpointArnAlt = `${runtimeArn}/runtime-endpoint/DEFAULT`;
                return [runtimeArn, endpointArnDoc, endpointArnAlt];
            })
            : [`arn:aws:bedrock-agentcore:${stack.region}:*:runtime/*`];
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: "AgentCoreInvoke",
            effect: iam.Effect.ALLOW,
            actions: [
                "bedrock-agentcore:InvokeAgentRuntime",
                "bedrock-agentcore:GetAsyncTaskResult",
            ],
            resources: invokeResources,
        }));
        // CreateAgentRuntime environmentVariables: "Environment variables to set in the AgentCore Runtime environment"
        // https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_CreateAgentRuntime.html
        const environmentVariables = {
            AWS_REGION_NAME: stack.region,
            DEDUPE_TABLE_NAME: props.dedupeTable.tableName,
            WHITELIST_TABLE_NAME: props.whitelistConfigTable.tableName,
            WHITELIST_SECRET_NAME: `${stack.stackName}/slack/whitelist-config`,
            RATE_LIMIT_TABLE_NAME: props.rateLimitTable.tableName,
            EXISTENCE_CHECK_CACHE_TABLE: props.existenceCheckCacheTable.tableName,
            RATE_LIMIT_PER_MINUTE: "10",
            ENABLE_AGENT_CARD_DISCOVERY: "true",
            MAX_AGENT_TURNS: "5",
        };
        const executionAgentArnsMap = {
            ...(props.executionAgentArns || {}),
        };
        // Backward compatibility for older key while routing default agent is file-creator.
        if (executionAgentArnsMap.general &&
            !executionAgentArnsMap["file-creator"]) {
            executionAgentArnsMap["file-creator"] = executionAgentArnsMap.general;
            delete executionAgentArnsMap.general;
        }
        if (Object.keys(executionAgentArnsMap).length > 0) {
            environmentVariables.EXECUTION_AGENT_ARNS = JSON.stringify(executionAgentArnsMap);
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
        if (props.slackSearchAgentArn) {
            environmentVariables.SLACK_SEARCH_AGENT_ARN = props.slackSearchAgentArn;
        }
        if (props.usageHistoryTable) {
            environmentVariables.USAGE_HISTORY_TABLE_NAME =
                props.usageHistoryTable.tableName;
            props.usageHistoryTable.grantWriteData(this.executionRole);
        }
        if (props.usageHistoryBucket) {
            environmentVariables.USAGE_HISTORY_BUCKET_NAME =
                props.usageHistoryBucket.bucketName;
            props.usageHistoryBucket.grantPut(this.executionRole, "content/*");
            props.usageHistoryBucket.grantPut(this.executionRole, "attachments/*");
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
        const deploymentEnv = this.node.tryGetContext("deploymentEnv") ??
            process.env.DEPLOYMENT_ENV ??
            "dev";
        this.runtime.addPropertyOverride("Tags", (0, cdk_tooling_1.getCostAllocationTagValues)({
            deploymentEnv: String(deploymentEnv).toLowerCase().trim(),
            stackName: stack.stackName,
        }));
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
exports.VerificationAgentRuntime = VerificationAgentRuntime;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tYWdlbnQtcnVudGltZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7OztHQWVHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMseURBQTJDO0FBTTNDLDJDQUF1QztBQUN2QywyREFBdUU7QUEwQ3ZFLE1BQWEsd0JBQXlCLFNBQVEsc0JBQVM7SUFDckQseUNBQXlDO0lBQ3pCLE9BQU8sQ0FBa0I7SUFDekMsMEVBQTBFO0lBQzFELFFBQVEsR0FBZ0MsU0FBUyxDQUFDO0lBQ2xFLHVEQUF1RDtJQUN2QyxhQUFhLENBQVc7SUFDeEMsdUNBQXVDO0lBQ3ZCLFVBQVUsQ0FBUztJQUVuQyxZQUNFLEtBQWdCLEVBQ2hCLEVBQVUsRUFDVixLQUFvQztRQUVwQyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWpDLDJIQUEySDtRQUMzSCxnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2RCxRQUFRLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyxnQkFBZ0I7WUFDNUMsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLGlDQUFpQyxFQUFFO2dCQUNyRSxVQUFVLEVBQUU7b0JBQ1YsWUFBWSxFQUFFO3dCQUNaLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxPQUFPO3FCQUNuQztvQkFDRCxPQUFPLEVBQUU7d0JBQ1AsZUFBZSxFQUFFLDZCQUE2QixLQUFLLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUk7cUJB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QyxDQUFDO2FBQ2xELENBQUMsQ0FBQztRQUNMLENBQUM7UUFDRCw2SEFBNkg7UUFDN0gsSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxzQkFBc0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRS9FLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM1RSxNQUFNLFNBQVMsR0FBRyxhQUFhLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQztRQUNuRCxJQUFJLFNBQVMsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQzFELElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFFRCw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRXBFLHlGQUF5RjtRQUN6RixJQUFJLENBQUMsUUFBUSxHQUFHLFNBQVMsQ0FBQztJQUM1QixDQUFDO0NBQ0Y7QUF6UkQsNERBeVJDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBWZXJpZmljYXRpb24gQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IENyZWF0ZSBhbiBBbWF6b24gQmVkcm9jayBBZ2VudENvcmUgUnVudGltZSAoQTJBIHByb3RvY29sKSBmb3IgdGhlIFZlcmlmaWNhdGlvbiBBZ2VudC5cbiAqIEludm9rZXMgRXhlY3V0aW9uIEFnZW50IHZpYSBBMkE7IHJlY2VpdmVzIFNsYWNrIGV2ZW50cyBmcm9tIFNsYWNrRXZlbnRIYW5kbGVyIChvciBBZ2VudEludm9rZXIpLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IENyZWF0ZSBSdW50aW1lIENGTiByZXNvdXJjZSwgSUFNIHJvbGUsIGdyYW50IER5bmFtb0RCL1NlY3JldHMvUzMvU1FTOyBvcHRpb25hbFxuICogZXJyb3IgZGVidWcgbG9nIGdyb3VwIGFuZCBmaWxlLWV4Y2hhbmdlIGJ1Y2tldC4gQTJBIGNvbnRhaW5lciBwb3J0IDkwMDAsIEFSTTY0LlxuICpcbiAqIElucHV0czogVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lUHJvcHMgKGFnZW50UnVudGltZU5hbWUsIGNvbnRhaW5lckltYWdlVXJpLCBEeW5hbW9EQiB0YWJsZXMsXG4gKiBzZWNyZXRzLCBleGVjdXRpb25BZ2VudEFybnMsIG9wdGlvbmFsIHNsYWNrUG9zdFJlcXVlc3RRdWV1ZSwgZXJyb3JEZWJ1Z0xvZ0dyb3VwLCBmaWxlRXhjaGFuZ2VCdWNrZXQpLlxuICpcbiAqIE91dHB1dHM6IHJ1bnRpbWUsIGV4ZWN1dGlvblJvbGUsIHJ1bnRpbWVBcm4gKHZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybikuXG4gKlxuICogQG1vZHVsZSBjZGsvbGliL3ZlcmlmaWNhdGlvbi9jb25zdHJ1Y3RzL3ZlcmlmaWNhdGlvbi1hZ2VudC1ydW50aW1lXG4gKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiXCI7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbG9nc1wiO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlclwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgZ2V0Q29zdEFsbG9jYXRpb25UYWdWYWx1ZXMgfSBmcm9tIFwiQHNsYWNrLWFpLWFwcC9jZGstdG9vbGluZ1wiO1xuXG4vKiogTGlmZWN5Y2xlIGNvbmZpZ3VyYXRpb24gZm9yIEFnZW50Q29yZSBSdW50aW1lIChvcHRpb25hbCkuIFNlZSByZXNlYXJjaC5tZCDCpzIuICovXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50Q29yZUxpZmVjeWNsZUNvbmZpZyB7XG4gIC8qKiBJZGxlIHNlc3Npb24gdGltZW91dCBpbiBzZWNvbmRzICg2MOKAkzI4ODAwKS4gRGVmYXVsdDogOTAwLiAqL1xuICByZWFkb25seSBpZGxlUnVudGltZVNlc3Npb25UaW1lb3V0U2Vjb25kcz86IG51bWJlcjtcbiAgLyoqIE1heCBpbnN0YW5jZSBsaWZldGltZSBpbiBzZWNvbmRzICg2MOKAkzI4ODAwKS4gRGVmYXVsdDogMjg4MDAuICovXG4gIHJlYWRvbmx5IG1heExpZmV0aW1lU2Vjb25kcz86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVQcm9wcyB7XG4gIC8qKiBOYW1lIGZvciB0aGUgQWdlbnRDb3JlIFJ1bnRpbWUgKi9cbiAgcmVhZG9ubHkgYWdlbnRSdW50aW1lTmFtZTogc3RyaW5nO1xuICAvKiogRUNSIGNvbnRhaW5lciBpbWFnZSBVUkkgKGluY2x1ZGluZyB0YWcpICovXG4gIHJlYWRvbmx5IGNvbnRhaW5lckltYWdlVXJpOiBzdHJpbmc7XG4gIC8qKiBMaWZlY3ljbGUgY29uZmlndXJhdGlvbiAob3B0aW9uYWwpLiBPbWl0IHRvIHVzZSBwbGF0Zm9ybSBkZWZhdWx0cy4gKi9cbiAgcmVhZG9ubHkgbGlmZWN5Y2xlQ29uZmlndXJhdGlvbj86IEFnZW50Q29yZUxpZmVjeWNsZUNvbmZpZztcbiAgLyoqIER5bmFtb0RCIHRhYmxlcyBmb3Igc2VjdXJpdHkgdmFsaWRhdGlvbiAqL1xuICByZWFkb25seSB0b2tlblRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIHJlYWRvbmx5IGRlZHVwZVRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIHJlYWRvbmx5IGV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICByZWFkb25seSB3aGl0ZWxpc3RDb25maWdUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICByZWFkb25seSByYXRlTGltaXRUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICAvKiogU2VjcmV0cyBNYW5hZ2VyIHNlY3JldHMgKi9cbiAgcmVhZG9ubHkgc2xhY2tTaWduaW5nU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuICByZWFkb25seSBzbGFja0JvdFRva2VuU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuICAvKiogTWFwIG9mIGV4ZWN1dGlvbiBhZ2VudCBJRHMgdG8gcnVudGltZSBBUk5zIChmb3IgQTJBIGludm9jYXRpb24pICovXG4gIHJlYWRvbmx5IGV4ZWN1dGlvbkFnZW50QXJucz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIC8qKiAwMTk6IFNRUyBxdWV1ZSBmb3IgU2xhY2sgcG9zdCByZXF1ZXN0czsgQWdlbnQgc2VuZHMgaGVyZSBpbnN0ZWFkIG9mIGNhbGxpbmcgU2xhY2sgQVBJICovXG4gIHJlYWRvbmx5IHNsYWNrUG9zdFJlcXVlc3RRdWV1ZT86IHNxcy5JUXVldWU7XG4gIC8qKiBDbG91ZFdhdGNoIExvZyBncm91cCBmb3IgZXhlY3V0aW9uIGVycm9yIGRlYnVnICh0cm91Ymxlc2hvb3RpbmcpICovXG4gIHJlYWRvbmx5IGVycm9yRGVidWdMb2dHcm91cD86IGxvZ3MuSUxvZ0dyb3VwO1xuICAvKiogUzMgYnVja2V0IGZvciB0ZW1wb3JhcnkgZmlsZSBleGNoYW5nZSBiZXR3ZWVuIHpvbmVzICgwMjQpICovXG4gIHJlYWRvbmx5IGZpbGVFeGNoYW5nZUJ1Y2tldD86IHMzLklCdWNrZXQ7XG4gIC8qKiBBUk4gb2YgdGhlIFNsYWNrIFNlYXJjaCBBZ2VudCBBZ2VudENvcmUgUnVudGltZSAob3B0aW9uYWw7IDAzOCkgKi9cbiAgcmVhZG9ubHkgc2xhY2tTZWFyY2hBZ2VudEFybj86IHN0cmluZztcbiAgLyoqIER5bmFtb0RCIHRhYmxlIGZvciB1c2FnZSBoaXN0b3J5IG1ldGFkYXRhIChvcHRpb25hbDsgMDM5KSAqL1xuICByZWFkb25seSB1c2FnZUhpc3RvcnlUYWJsZT86IGR5bmFtb2RiLklUYWJsZTtcbiAgLyoqIFMzIGJ1Y2tldCBmb3IgdXNhZ2UgaGlzdG9yeSBjb250ZW50IGFuZCBhdHRhY2htZW50cyAob3B0aW9uYWw7IDAzOSkgKi9cbiAgcmVhZG9ubHkgdXNhZ2VIaXN0b3J5QnVja2V0PzogczMuSUJ1Y2tldDtcbn1cblxuZXhwb3J0IGNsYXNzIFZlcmlmaWNhdGlvbkFnZW50UnVudGltZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKiBUaGUgQWdlbnRDb3JlIFJ1bnRpbWUgQ0ZOIHJlc291cmNlICovXG4gIHB1YmxpYyByZWFkb25seSBydW50aW1lOiBjZGsuQ2ZuUmVzb3VyY2U7XG4gIC8qKiBBZ2VudENvcmUgYXV0by1jcmVhdGVzIERFRkFVTFQgZW5kcG9pbnQ7IHdlIGRvIG5vdCBjcmVhdGUgaXQgaW4gQ0ZuICovXG4gIHB1YmxpYyByZWFkb25seSBlbmRwb2ludDogY2RrLkNmblJlc291cmNlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAvKiogVGhlIElBTSBleGVjdXRpb24gcm9sZSBmb3IgdGhlIEFnZW50Q29yZSBSdW50aW1lICovXG4gIHB1YmxpYyByZWFkb25seSBleGVjdXRpb25Sb2xlOiBpYW0uUm9sZTtcbiAgLyoqIFRoZSBBUk4gb2YgdGhlIEFnZW50Q29yZSBSdW50aW1lICovXG4gIHB1YmxpYyByZWFkb25seSBydW50aW1lQXJuOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgc2NvcGU6IENvbnN0cnVjdCxcbiAgICBpZDogc3RyaW5nLFxuICAgIHByb3BzOiBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVQcm9wc1xuICApIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qgc3RhY2sgPSBjZGsuU3RhY2sub2YodGhpcyk7XG5cbiAgICAvLyBDcmVhdGUgSUFNIGV4ZWN1dGlvbiByb2xlIGZvciBBZ2VudENvcmUgUnVudGltZSAocm9sZU5hbWUgdW5pcXVlIHBlciBhY2NvdW50OyB1c2Ugc3RhY2sgbmFtZSBzbyBEZXYvUHJvZCBkbyBub3QgY29sbGlkZSlcbiAgICAvLyBUcnVzdCBwb2xpY3k6IGJlZHJvY2stYWdlbnRjb3JlLmFtYXpvbmF3cy5jb21cbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJFeGVjdXRpb25Sb2xlXCIsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtzdGFjay5zdGFja05hbWV9LUV4ZWN1dGlvblJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJiZWRyb2NrLWFnZW50Y29yZS5hbWF6b25hd3MuY29tXCIsIHtcbiAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgXCJhd3M6U291cmNlQWNjb3VudFwiOiBzdGFjay5hY2NvdW50LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgQXJuTGlrZToge1xuICAgICAgICAgICAgXCJhd3M6U291cmNlQXJuXCI6IGBhcm46YXdzOmJlZHJvY2stYWdlbnRjb3JlOiR7c3RhY2sucmVnaW9ufToke3N0YWNrLmFjY291bnR9OipgLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICBcIkV4ZWN1dGlvbiByb2xlIGZvciBWZXJpZmljYXRpb24gQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgd2l0aCBEeW5hbW9EQiwgU2VjcmV0cyBNYW5hZ2VyLCBhbmQgQWdlbnRDb3JlIGludm9rZSBwZXJtaXNzaW9uc1wiLFxuICAgIH0pO1xuXG4gICAgLy8gRUNSIHBlcm1pc3Npb25zIGZvciBjb250YWluZXIgaW1hZ2UgcmV0cmlldmFsXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiRUNSSW1hZ2VBY2Nlc3NcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJlY3I6QmF0Y2hHZXRJbWFnZVwiLFxuICAgICAgICAgIFwiZWNyOkdldERvd25sb2FkVXJsRm9yTGF5ZXJcIixcbiAgICAgICAgICBcImVjcjpHZXRBdXRob3JpemF0aW9uVG9rZW5cIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb25zXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiQ2xvdWRXYXRjaExvZ3NcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJsb2dzOkNyZWF0ZUxvZ0dyb3VwXCIsXG4gICAgICAgICAgXCJsb2dzOkNyZWF0ZUxvZ1N0cmVhbVwiLFxuICAgICAgICAgIFwibG9nczpQdXRMb2dFdmVudHNcIixcbiAgICAgICAgICBcImxvZ3M6RGVzY3JpYmVMb2dHcm91cHNcIixcbiAgICAgICAgICBcImxvZ3M6RGVzY3JpYmVMb2dTdHJlYW1zXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmxvZ3M6JHtzdGFjay5yZWdpb259OiR7c3RhY2suYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvYmVkcm9jay1hZ2VudGNvcmUvKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBYLVJheSB0cmFjaW5nIHBlcm1pc3Npb25zXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiWFJheVRyYWNpbmdcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJ4cmF5OlB1dFRyYWNlU2VnbWVudHNcIixcbiAgICAgICAgICBcInhyYXk6UHV0VGVsZW1ldHJ5UmVjb3Jkc1wiLFxuICAgICAgICAgIFwieHJheTpHZXRTYW1wbGluZ1J1bGVzXCIsXG4gICAgICAgICAgXCJ4cmF5OkdldFNhbXBsaW5nVGFyZ2V0c1wiLFxuICAgICAgICAgIFwieHJheTpHZXRTYW1wbGluZ1N0YXRpc3RpY1N1bW1hcmllc1wiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIE1ldHJpY3MgcGVybWlzc2lvbnNcbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJDbG91ZFdhdGNoTWV0cmljc1wiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcImNsb3Vkd2F0Y2g6UHV0TWV0cmljRGF0YVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgU3RyaW5nTGlrZToge1xuICAgICAgICAgICAgXCJjbG91ZHdhdGNoOm5hbWVzcGFjZVwiOiBbXCJTbGFja0V2ZW50SGFuZGxlclwiLCBcIlNsYWNrQUkvKlwiXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gUm91dGVyIEFnZW50IHJ1bnMgQmVkcm9jayBtb2RlbCBpbmZlcmVuY2UgZm9yIGFnZW50IHNlbGVjdGlvbi5cbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJCZWRyb2NrSW52b2tlTW9kZWxcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJiZWRyb2NrOkludm9rZU1vZGVsXCIsXG4gICAgICAgICAgXCJiZWRyb2NrOkludm9rZU1vZGVsV2l0aFJlc3BvbnNlU3RyZWFtXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciA1IHNlY3VyaXR5IHRhYmxlc1xuICAgIHByb3BzLnRva2VuVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuZGVkdXBlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLndoaXRlbGlzdENvbmZpZ1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5leGVjdXRpb25Sb2xlKTsgLy8gUmVhZC1vbmx5IGZvciBzZWN1cml0eVxuICAgIHByb3BzLnJhdGVMaW1pdFRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gU2VjcmV0cyBNYW5hZ2VyIHBlcm1pc3Npb25zXG4gICAgcHJvcHMuc2xhY2tTaWduaW5nU2VjcmV0LmdyYW50UmVhZCh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLnNsYWNrQm90VG9rZW5TZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBXaGl0ZWxpc3QgY29uZmlnIHNlY3JldCBwZXJtaXNzaW9uXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiU2VjcmV0c01hbmFnZXJXaGl0ZWxpc3RcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJzZWNyZXRzbWFuYWdlcjpHZXRTZWNyZXRWYWx1ZVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c2VjcmV0c21hbmFnZXI6JHtzdGFjay5yZWdpb259OiR7c3RhY2suYWNjb3VudH06c2VjcmV0OiR7c3RhY2suc3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBBZ2VudENvcmUgSW52b2tlQWdlbnRSdW50aW1lIHBlcm1pc3Npb24gKGZvciBjYWxsaW5nIEV4ZWN1dGlvbiBBZ2VudCkuXG4gICAgLy8gQVdTIHJlcXVpcmVzIGlkZW50aXR5LWJhc2VkIHBvbGljeSB0byBhbGxvdyB0aGUgYWN0aW9uIG9uIEJPVEggdGhlIGFnZW50IHJ1bnRpbWUgYW5kXG4gICAgLy8gdGhlIGFnZW50IGVuZHBvaW50IChzZWUgcmVzb3VyY2UtYmFzZWQtcG9saWNpZXMuaHRtbCBcIkhpZXJhcmNoaWNhbCBhdXRob3JpemF0aW9uXCIpLlxuICAgIC8vIEluY2x1ZGUgYm90aCBlbmRwb2ludCBBUk4gZm9ybXM6IC4uLjpydW50aW1lLWVuZHBvaW50L05hbWUvREVGQVVMVCBhbmRcbiAgICAvLyAuLi46cnVudGltZS9OYW1lL3J1bnRpbWUtZW5kcG9pbnQvREVGQVVMVCAobGF0dGVyIGlzIHVzZWQgYXQgZXZhbHVhdGlvbiBwZXIgQWNjZXNzRGVuaWVkIG1lc3NhZ2UpLlxuICAgIGNvbnN0IHRhcmdldEFnZW50QXJucyA9IFtcbiAgICAgIC4uLk9iamVjdC52YWx1ZXMocHJvcHMuZXhlY3V0aW9uQWdlbnRBcm5zIHx8IHt9KSxcbiAgICAgIC4uLihwcm9wcy5zbGFja1NlYXJjaEFnZW50QXJuID8gW3Byb3BzLnNsYWNrU2VhcmNoQWdlbnRBcm5dIDogW10pLFxuICAgIF0uZmlsdGVyKChhcm4pOiBhcm4gaXMgc3RyaW5nID0+IEJvb2xlYW4oYXJuKSk7XG4gICAgY29uc3QgaW52b2tlUmVzb3VyY2VzID0gdGFyZ2V0QWdlbnRBcm5zLmxlbmd0aFxuICAgICAgPyB0YXJnZXRBZ2VudEFybnMuZmxhdE1hcCgocnVudGltZUFybikgPT4ge1xuICAgICAgICAgIGNvbnN0IGVuZHBvaW50QXJuRG9jID1cbiAgICAgICAgICAgIHJ1bnRpbWVBcm4ucmVwbGFjZSgvOnJ1bnRpbWVcXC8vLCBcIjpydW50aW1lLWVuZHBvaW50L1wiKSArIFwiL0RFRkFVTFRcIjtcbiAgICAgICAgICBjb25zdCBlbmRwb2ludEFybkFsdCA9IGAke3J1bnRpbWVBcm59L3J1bnRpbWUtZW5kcG9pbnQvREVGQVVMVGA7XG4gICAgICAgICAgcmV0dXJuIFtydW50aW1lQXJuLCBlbmRwb2ludEFybkRvYywgZW5kcG9pbnRBcm5BbHRdO1xuICAgICAgICB9KVxuICAgICAgOiBbYGFybjphd3M6YmVkcm9jay1hZ2VudGNvcmU6JHtzdGFjay5yZWdpb259Oio6cnVudGltZS8qYF07XG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiQWdlbnRDb3JlSW52b2tlXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCIsXG4gICAgICAgICAgXCJiZWRyb2NrLWFnZW50Y29yZTpHZXRBc3luY1Rhc2tSZXN1bHRcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBpbnZva2VSZXNvdXJjZXMsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGVBZ2VudFJ1bnRpbWUgZW52aXJvbm1lbnRWYXJpYWJsZXM6IFwiRW52aXJvbm1lbnQgdmFyaWFibGVzIHRvIHNldCBpbiB0aGUgQWdlbnRDb3JlIFJ1bnRpbWUgZW52aXJvbm1lbnRcIlxuICAgIC8vIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9iZWRyb2NrLWFnZW50Y29yZS1jb250cm9sL2xhdGVzdC9BUElSZWZlcmVuY2UvQVBJX0NyZWF0ZUFnZW50UnVudGltZS5odG1sXG4gICAgY29uc3QgZW52aXJvbm1lbnRWYXJpYWJsZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICBBV1NfUkVHSU9OX05BTUU6IHN0YWNrLnJlZ2lvbixcbiAgICAgIERFRFVQRV9UQUJMRV9OQU1FOiBwcm9wcy5kZWR1cGVUYWJsZS50YWJsZU5hbWUsXG4gICAgICBXSElURUxJU1RfVEFCTEVfTkFNRTogcHJvcHMud2hpdGVsaXN0Q29uZmlnVGFibGUudGFibGVOYW1lLFxuICAgICAgV0hJVEVMSVNUX1NFQ1JFVF9OQU1FOiBgJHtzdGFjay5zdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWdgLFxuICAgICAgUkFURV9MSU1JVF9UQUJMRV9OQU1FOiBwcm9wcy5yYXRlTGltaXRUYWJsZS50YWJsZU5hbWUsXG4gICAgICBFWElTVEVOQ0VfQ0hFQ0tfQ0FDSEVfVEFCTEU6IHByb3BzLmV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZS50YWJsZU5hbWUsXG4gICAgICBSQVRFX0xJTUlUX1BFUl9NSU5VVEU6IFwiMTBcIixcbiAgICAgIEVOQUJMRV9BR0VOVF9DQVJEX0RJU0NPVkVSWTogXCJ0cnVlXCIsXG4gICAgICBNQVhfQUdFTlRfVFVSTlM6IFwiNVwiLFxuICAgIH07XG4gICAgY29uc3QgZXhlY3V0aW9uQWdlbnRBcm5zTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgLi4uKHByb3BzLmV4ZWN1dGlvbkFnZW50QXJucyB8fCB7fSksXG4gICAgfTtcbiAgICAvLyBCYWNrd2FyZCBjb21wYXRpYmlsaXR5IGZvciBvbGRlciBrZXkgd2hpbGUgcm91dGluZyBkZWZhdWx0IGFnZW50IGlzIGZpbGUtY3JlYXRvci5cbiAgICBpZiAoXG4gICAgICBleGVjdXRpb25BZ2VudEFybnNNYXAuZ2VuZXJhbCAmJlxuICAgICAgIWV4ZWN1dGlvbkFnZW50QXJuc01hcFtcImZpbGUtY3JlYXRvclwiXVxuICAgICkge1xuICAgICAgZXhlY3V0aW9uQWdlbnRBcm5zTWFwW1wiZmlsZS1jcmVhdG9yXCJdID0gZXhlY3V0aW9uQWdlbnRBcm5zTWFwLmdlbmVyYWw7XG4gICAgICBkZWxldGUgZXhlY3V0aW9uQWdlbnRBcm5zTWFwLmdlbmVyYWw7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGVjdXRpb25BZ2VudEFybnNNYXApLmxlbmd0aCA+IDApIHtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLkVYRUNVVElPTl9BR0VOVF9BUk5TID0gSlNPTi5zdHJpbmdpZnkoXG4gICAgICAgIGV4ZWN1dGlvbkFnZW50QXJuc01hcFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHByb3BzLnNsYWNrUG9zdFJlcXVlc3RRdWV1ZSkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuU0xBQ0tfUE9TVF9SRVFVRVNUX1FVRVVFX1VSTCA9XG4gICAgICAgIHByb3BzLnNsYWNrUG9zdFJlcXVlc3RRdWV1ZS5xdWV1ZVVybDtcbiAgICAgIHByb3BzLnNsYWNrUG9zdFJlcXVlc3RRdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuICAgIH1cbiAgICBpZiAocHJvcHMuZXJyb3JEZWJ1Z0xvZ0dyb3VwKSB7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5FWEVDVVRJT05fQUdFTlRfRVJST1JfTE9HX0dST1VQID1cbiAgICAgICAgcHJvcHMuZXJyb3JEZWJ1Z0xvZ0dyb3VwLmxvZ0dyb3VwTmFtZTtcbiAgICAgIHByb3BzLmVycm9yRGVidWdMb2dHcm91cC5ncmFudFdyaXRlKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuICAgIGlmIChwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQpIHtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLkZJTEVfRVhDSEFOR0VfQlVDS0VUID1cbiAgICAgICAgcHJvcHMuZmlsZUV4Y2hhbmdlQnVja2V0LmJ1Y2tldE5hbWU7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5GSUxFX0VYQ0hBTkdFX1BSRUZJWCA9IFwiYXR0YWNobWVudHMvXCI7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5QUkVTSUdORURfVVJMX0VYUElSWSA9IFwiOTAwXCI7XG4gICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodGhpcy5leGVjdXRpb25Sb2xlLCBcImF0dGFjaG1lbnRzLypcIik7XG4gICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuZ3JhbnREZWxldGUodGhpcy5leGVjdXRpb25Sb2xlLCBcImF0dGFjaG1lbnRzLypcIik7XG4gICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodGhpcy5leGVjdXRpb25Sb2xlLCBcImdlbmVyYXRlZF9maWxlcy8qXCIpO1xuICAgIH1cbiAgICBpZiAocHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybikge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuU0xBQ0tfU0VBUkNIX0FHRU5UX0FSTiA9IHByb3BzLnNsYWNrU2VhcmNoQWdlbnRBcm47XG4gICAgfVxuICAgIGlmIChwcm9wcy51c2FnZUhpc3RvcnlUYWJsZSkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuVVNBR0VfSElTVE9SWV9UQUJMRV9OQU1FID1cbiAgICAgICAgcHJvcHMudXNhZ2VIaXN0b3J5VGFibGUudGFibGVOYW1lO1xuICAgICAgcHJvcHMudXNhZ2VIaXN0b3J5VGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICB9XG4gICAgaWYgKHByb3BzLnVzYWdlSGlzdG9yeUJ1Y2tldCkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuVVNBR0VfSElTVE9SWV9CVUNLRVRfTkFNRSA9XG4gICAgICAgIHByb3BzLnVzYWdlSGlzdG9yeUJ1Y2tldC5idWNrZXROYW1lO1xuICAgICAgcHJvcHMudXNhZ2VIaXN0b3J5QnVja2V0LmdyYW50UHV0KHRoaXMuZXhlY3V0aW9uUm9sZSwgXCJjb250ZW50LypcIik7XG4gICAgICBwcm9wcy51c2FnZUhpc3RvcnlCdWNrZXQuZ3JhbnRQdXQodGhpcy5leGVjdXRpb25Sb2xlLCBcImF0dGFjaG1lbnRzLypcIik7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIEFnZW50Q29yZSBSdW50aW1lIHVzaW5nIEwxIENmblJlc291cmNlXG4gICAgdGhpcy5ydW50aW1lID0gbmV3IGNkay5DZm5SZXNvdXJjZSh0aGlzLCBcIlJ1bnRpbWVcIiwge1xuICAgICAgdHlwZTogXCJBV1M6OkJlZHJvY2tBZ2VudENvcmU6OlJ1bnRpbWVcIixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgQWdlbnRSdW50aW1lTmFtZTogcHJvcHMuYWdlbnRSdW50aW1lTmFtZSxcbiAgICAgICAgUm9sZUFybjogdGhpcy5leGVjdXRpb25Sb2xlLnJvbGVBcm4sXG4gICAgICAgIFByb3RvY29sQ29uZmlndXJhdGlvbjogXCJBMkFcIixcbiAgICAgICAgQWdlbnRSdW50aW1lQXJ0aWZhY3Q6IHtcbiAgICAgICAgICBDb250YWluZXJDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgICBDb250YWluZXJVcmk6IHByb3BzLmNvbnRhaW5lckltYWdlVXJpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIE5ldHdvcmtDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgTmV0d29ya01vZGU6IFwiUFVCTElDXCIsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIC8vIEwxIENmblJlc291cmNlIGRvZXMgbm90IHJlY2VpdmUgc3RhY2stbGV2ZWwgVGFncyBmcm9tIENESyBhc3BlY3Q7IHNldCBleHBsaWNpdGx5IGZvciBjb3N0IGFsbG9jYXRpb25cbiAgICBjb25zdCBkZXBsb3ltZW50RW52ID1cbiAgICAgICh0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcImRlcGxveW1lbnRFbnZcIikgYXMgc3RyaW5nIHwgdW5kZWZpbmVkKSA/P1xuICAgICAgcHJvY2Vzcy5lbnYuREVQTE9ZTUVOVF9FTlYgPz9cbiAgICAgIFwiZGV2XCI7XG4gICAgdGhpcy5ydW50aW1lLmFkZFByb3BlcnR5T3ZlcnJpZGUoXG4gICAgICBcIlRhZ3NcIixcbiAgICAgIGdldENvc3RBbGxvY2F0aW9uVGFnVmFsdWVzKHtcbiAgICAgICAgZGVwbG95bWVudEVudjogU3RyaW5nKGRlcGxveW1lbnRFbnYpLnRvTG93ZXJDYXNlKCkudHJpbSgpLFxuICAgICAgICBzdGFja05hbWU6IHN0YWNrLnN0YWNrTmFtZSxcbiAgICAgIH0pXG4gICAgKTtcbiAgICBpZiAocHJvcHMubGlmZWN5Y2xlQ29uZmlndXJhdGlvbikge1xuICAgICAgY29uc3QgbGMgPSBwcm9wcy5saWZlY3ljbGVDb25maWd1cmF0aW9uO1xuICAgICAgY29uc3QgaWRsZSA9IGxjLmlkbGVSdW50aW1lU2Vzc2lvblRpbWVvdXRTZWNvbmRzID8/IDkwMDtcbiAgICAgIGNvbnN0IG1heEx0ID0gbGMubWF4TGlmZXRpbWVTZWNvbmRzID8/IDI4ODAwO1xuICAgICAgdGhpcy5ydW50aW1lLmFkZFByb3BlcnR5T3ZlcnJpZGUoXCJMaWZlY3ljbGVDb25maWd1cmF0aW9uXCIsIHtcbiAgICAgICAgSWRsZVJ1bnRpbWVTZXNzaW9uVGltZW91dDogTWF0aC5tYXgoNjAsIE1hdGgubWluKDI4ODAwLCBpZGxlKSksXG4gICAgICAgIE1heExpZmV0aW1lOiBNYXRoLm1heCg2MCwgTWF0aC5taW4oMjg4MDAsIG1heEx0KSksXG4gICAgICB9KTtcbiAgICB9XG4gICAgLy8gRW52aXJvbm1lbnRWYXJpYWJsZXMgKHN0cmluZy10by1zdHJpbmcgbWFwKSBhcmUgaW4gQ3JlYXRlQWdlbnRSdW50aW1lIEFQSSBidXQgbm90IGluIENESyBMMSBzY2hlbWE7IGFwcGxpZWQgYXQgZGVwbG95IHRpbWVcbiAgICB0aGlzLnJ1bnRpbWUuYWRkUHJvcGVydHlPdmVycmlkZShcIkVudmlyb25tZW50VmFyaWFibGVzXCIsIGVudmlyb25tZW50VmFyaWFibGVzKTtcblxuICAgIGNvbnN0IGRlZmF1bHRQb2xpY3kgPSB0aGlzLmV4ZWN1dGlvblJvbGUubm9kZS50cnlGaW5kQ2hpbGQoXCJEZWZhdWx0UG9saWN5XCIpO1xuICAgIGNvbnN0IHBvbGljeUNmbiA9IGRlZmF1bHRQb2xpY3k/Lm5vZGUuZGVmYXVsdENoaWxkO1xuICAgIGlmIChwb2xpY3lDZm4gJiYgY2RrLkNmblJlc291cmNlLmlzQ2ZuUmVzb3VyY2UocG9saWN5Q2ZuKSkge1xuICAgICAgdGhpcy5ydW50aW1lLmFkZERlcGVuZGVuY3kocG9saWN5Q2ZuKTtcbiAgICB9XG5cbiAgICAvLyBEZXJpdmUgQVJOIGZyb20gdGhlIHJ1bnRpbWVcbiAgICB0aGlzLnJ1bnRpbWVBcm4gPSB0aGlzLnJ1bnRpbWUuZ2V0QXR0KFwiQWdlbnRSdW50aW1lQXJuXCIpLnRvU3RyaW5nKCk7XG5cbiAgICAvLyBEbyBOT1QgY3JlYXRlIFJ1bnRpbWVFbmRwb2ludCBpbiBDRm46IEFnZW50Q29yZSBhdXRvLWNyZWF0ZXMgREVGQVVMVCAod291bGQgY29uZmxpY3QpLlxuICAgIHRoaXMuZW5kcG9pbnQgPSB1bmRlZmluZWQ7XG4gIH1cbn1cbiJdfQ==