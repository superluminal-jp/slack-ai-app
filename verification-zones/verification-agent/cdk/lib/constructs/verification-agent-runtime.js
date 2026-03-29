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
const cdk_nag_1 = require("cdk-nag");
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
        // Strands BedrockModel uses bedrock-runtime Converse/ConverseStream APIs for orchestration.
        // InvokeModel/InvokeModelWithResponseStream retained for direct SDK calls if needed.
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: "BedrockModelAccess",
            effect: iam.Effect.ALLOW,
            actions: [
                "bedrock:Converse",
                "bedrock:ConverseStream",
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
            ],
            resources: [
                `arn:aws:bedrock:ap-northeast-1::foundation-model/*`,
                `arn:aws:bedrock:ap-northeast-3::foundation-model/*`,
                `arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/*`,
            ],
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
            MAX_AGENT_TURNS: "5",
        };
        if (props.agentRegistryTable) {
            environmentVariables.AGENT_REGISTRY_TABLE =
                props.agentRegistryTable.tableName;
        }
        if (props.agentRegistryEnv) {
            environmentVariables.AGENT_REGISTRY_ENV =
                props.agentRegistryEnv;
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
        // Agent registry DynamoDB read permissions (Query)
        if (props.agentRegistryTable) {
            props.agentRegistryTable.grantReadData(this.executionRole);
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
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.executionRole, [
            {
                id: "AwsSolutions-IAM5",
                reason: "ECR GetAuthorizationToken requires resource:* (AWS service constraint, cannot be scoped to a repo ARN). " +
                    "X-Ray trace and sampling APIs do not support resource-level restrictions. " +
                    "CloudWatch PutMetricData requires resource:* (namespace scoped via condition key). " +
                    "CloudWatch Logs scoped to /aws/bedrock-agentcore/ prefix. " +
                    "Bedrock uses foundation-model/* (ap-northeast-1/3 for JP inference profiles) and inference-profile/* ARN patterns. " +
                    "AgentCore InvokeAgentRuntime uses runtime-specific ARNs when executionAgentArns are provided; " +
                    "fallback arn:aws:bedrock-agentcore:region:*:runtime/* is used only when no ARNs are configured at deploy time.",
            },
        ], true);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tYWdlbnQtcnVudGltZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7OztHQWVHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMseURBQTJDO0FBTTNDLDJDQUFtRDtBQUNuRCwyREFBdUU7QUFDdkUscUNBQTBDO0FBOEMxQyxNQUFhLHdCQUF5QixTQUFRLHNCQUFTO0lBQ3JELHlDQUF5QztJQUN6QixPQUFPLENBQWtCO0lBQ3pDLDBFQUEwRTtJQUMxRCxRQUFRLEdBQWdDLFNBQVMsQ0FBQztJQUNsRSx1REFBdUQ7SUFDdkMsYUFBYSxDQUFXO0lBQ3hDLHVDQUF1QztJQUN2QixVQUFVLENBQVM7SUFFbkMsWUFDRSxLQUFnQixFQUNoQixFQUFVLEVBQ1YsS0FBb0M7UUFFcEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVqQywySEFBMkg7UUFDM0gsZ0RBQWdEO1FBQ2hELElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkQsUUFBUSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsZ0JBQWdCO1lBQzVDLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxpQ0FBaUMsRUFBRTtnQkFDckUsVUFBVSxFQUFFO29CQUNWLFlBQVksRUFBRTt3QkFDWixtQkFBbUIsRUFBRSxLQUFLLENBQUMsT0FBTztxQkFDbkM7b0JBQ0QsT0FBTyxFQUFFO3dCQUNQLGVBQWUsRUFBRSw2QkFBNkIsS0FBSyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMs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QUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDOUQsV0FBVyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO2FBQ2xELENBQUMsQ0FBQztRQUNMLENBQUM7UUFDRCw2SEFBNkg7UUFDN0gsSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxzQkFBc0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRS9FLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM1RSxNQUFNLFNBQVMsR0FBRyxhQUFhLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQztRQUNuRCxJQUFJLFNBQVMsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQzFELElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFFRCw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRXBFLHlGQUF5RjtRQUN6RixJQUFJLENBQUMsUUFBUSxHQUFHLFNBQVMsQ0FBQztJQUM1QixDQUFDO0NBQ0Y7QUExU0QsNERBMFNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBWZXJpZmljYXRpb24gQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IENyZWF0ZSBhbiBBbWF6b24gQmVkcm9jayBBZ2VudENvcmUgUnVudGltZSAoQTJBIHByb3RvY29sKSBmb3IgdGhlIFZlcmlmaWNhdGlvbiBBZ2VudC5cbiAqIEludm9rZXMgRXhlY3V0aW9uIEFnZW50IHZpYSBBMkE7IHJlY2VpdmVzIFNsYWNrIGV2ZW50cyBmcm9tIFNsYWNrRXZlbnRIYW5kbGVyIChvciBBZ2VudEludm9rZXIpLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IENyZWF0ZSBSdW50aW1lIENGTiByZXNvdXJjZSwgSUFNIHJvbGUsIGdyYW50IER5bmFtb0RCL1NlY3JldHMvUzMvU1FTOyBvcHRpb25hbFxuICogZXJyb3IgZGVidWcgbG9nIGdyb3VwIGFuZCBmaWxlLWV4Y2hhbmdlIGJ1Y2tldC4gQTJBIGNvbnRhaW5lciBwb3J0IDkwMDAsIEFSTTY0LlxuICpcbiAqIElucHV0czogVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lUHJvcHMgKGFnZW50UnVudGltZU5hbWUsIGNvbnRhaW5lckltYWdlVXJpLCBEeW5hbW9EQiB0YWJsZXMsXG4gKiBzZWNyZXRzLCBleGVjdXRpb25BZ2VudEFybnMsIG9wdGlvbmFsIHNsYWNrUG9zdFJlcXVlc3RRdWV1ZSwgZXJyb3JEZWJ1Z0xvZ0dyb3VwLCBmaWxlRXhjaGFuZ2VCdWNrZXQpLlxuICpcbiAqIE91dHB1dHM6IHJ1bnRpbWUsIGV4ZWN1dGlvblJvbGUsIHJ1bnRpbWVBcm4gKHZlcmlmaWNhdGlvbkFnZW50UnVudGltZUFybikuXG4gKlxuICogQG1vZHVsZSBjZGsvbGliL3ZlcmlmaWNhdGlvbi9jb25zdHJ1Y3RzL3ZlcmlmaWNhdGlvbi1hZ2VudC1ydW50aW1lXG4gKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiXCI7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbG9nc1wiO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlclwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QsIElDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgZ2V0Q29zdEFsbG9jYXRpb25UYWdWYWx1ZXMgfSBmcm9tIFwiQHNsYWNrLWFpLWFwcC9jZGstdG9vbGluZ1wiO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSBcImNkay1uYWdcIjtcblxuLyoqIExpZmVjeWNsZSBjb25maWd1cmF0aW9uIGZvciBBZ2VudENvcmUgUnVudGltZSAob3B0aW9uYWwpLiBTZWUgcmVzZWFyY2gubWQgwqcyLiAqL1xuZXhwb3J0IGludGVyZmFjZSBBZ2VudENvcmVMaWZlY3ljbGVDb25maWcge1xuICAvKiogSWRsZSBzZXNzaW9uIHRpbWVvdXQgaW4gc2Vjb25kcyAoNjDigJMyODgwMCkuIERlZmF1bHQ6IDkwMC4gKi9cbiAgcmVhZG9ubHkgaWRsZVJ1bnRpbWVTZXNzaW9uVGltZW91dFNlY29uZHM/OiBudW1iZXI7XG4gIC8qKiBNYXggaW5zdGFuY2UgbGlmZXRpbWUgaW4gc2Vjb25kcyAoNjDigJMyODgwMCkuIERlZmF1bHQ6IDI4ODAwLiAqL1xuICByZWFkb25seSBtYXhMaWZldGltZVNlY29uZHM/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lUHJvcHMge1xuICAvKiogTmFtZSBmb3IgdGhlIEFnZW50Q29yZSBSdW50aW1lICovXG4gIHJlYWRvbmx5IGFnZW50UnVudGltZU5hbWU6IHN0cmluZztcbiAgLyoqIEVDUiBjb250YWluZXIgaW1hZ2UgVVJJIChpbmNsdWRpbmcgdGFnKSAqL1xuICByZWFkb25seSBjb250YWluZXJJbWFnZVVyaTogc3RyaW5nO1xuICAvKiogTGlmZWN5Y2xlIGNvbmZpZ3VyYXRpb24gKG9wdGlvbmFsKS4gT21pdCB0byB1c2UgcGxhdGZvcm0gZGVmYXVsdHMuICovXG4gIHJlYWRvbmx5IGxpZmVjeWNsZUNvbmZpZ3VyYXRpb24/OiBBZ2VudENvcmVMaWZlY3ljbGVDb25maWc7XG4gIC8qKiBEeW5hbW9EQiB0YWJsZXMgZm9yIHNlY3VyaXR5IHZhbGlkYXRpb24gKi9cbiAgcmVhZG9ubHkgdG9rZW5UYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICByZWFkb25seSBkZWR1cGVUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICByZWFkb25seSBleGlzdGVuY2VDaGVja0NhY2hlVGFibGU6IGR5bmFtb2RiLklUYWJsZTtcbiAgcmVhZG9ubHkgd2hpdGVsaXN0Q29uZmlnVGFibGU6IGR5bmFtb2RiLklUYWJsZTtcbiAgcmVhZG9ubHkgcmF0ZUxpbWl0VGFibGU6IGR5bmFtb2RiLklUYWJsZTtcbiAgLyoqIFNlY3JldHMgTWFuYWdlciBzZWNyZXRzICovXG4gIHJlYWRvbmx5IHNsYWNrU2lnbmluZ1NlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcbiAgcmVhZG9ubHkgc2xhY2tCb3RUb2tlblNlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcbiAgLyoqIE1hcCBvZiBleGVjdXRpb24gYWdlbnQgSURzIHRvIHJ1bnRpbWUgQVJOcyAoZm9yIEEyQSBpbnZvY2F0aW9uKSAqL1xuICByZWFkb25seSBleGVjdXRpb25BZ2VudEFybnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAvKiogU1FTIHF1ZXVlIGZvciBTbGFjayBwb3N0IHJlcXVlc3RzOyBBZ2VudCBzZW5kcyBoZXJlIGluc3RlYWQgb2YgY2FsbGluZyBTbGFjayBBUEkgKi9cbiAgcmVhZG9ubHkgc2xhY2tQb3N0UmVxdWVzdFF1ZXVlPzogc3FzLklRdWV1ZTtcbiAgLyoqIENsb3VkV2F0Y2ggTG9nIGdyb3VwIGZvciBleGVjdXRpb24gZXJyb3IgZGVidWcgKHRyb3VibGVzaG9vdGluZykgKi9cbiAgcmVhZG9ubHkgZXJyb3JEZWJ1Z0xvZ0dyb3VwPzogbG9ncy5JTG9nR3JvdXA7XG4gIC8qKiBTMyBidWNrZXQgZm9yIHRlbXBvcmFyeSBmaWxlIGV4Y2hhbmdlIGJldHdlZW4gem9uZXMgKi9cbiAgcmVhZG9ubHkgZmlsZUV4Y2hhbmdlQnVja2V0PzogczMuSUJ1Y2tldDtcbiAgLyoqIEFSTiBvZiB0aGUgU2xhY2sgU2VhcmNoIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIChvcHRpb25hbCkgKi9cbiAgcmVhZG9ubHkgc2xhY2tTZWFyY2hBZ2VudEFybj86IHN0cmluZztcbiAgLyoqIER5bmFtb0RCIHRhYmxlIGZvciBhZ2VudCByZWdpc3RyeSAqL1xuICByZWFkb25seSBhZ2VudFJlZ2lzdHJ5VGFibGU/OiBkeW5hbW9kYi5JVGFibGU7XG4gIC8qKiBFbnZpcm9ubWVudCBpZGVudGlmaWVyIGZvciBhZ2VudCByZWdpc3RyeSBwYXJ0aXRpb24ga2V5IChlLmcuIFwiZGV2XCIsIFwicHJvZFwiKSAqL1xuICByZWFkb25seSBhZ2VudFJlZ2lzdHJ5RW52Pzogc3RyaW5nO1xuICAvKiogRHluYW1vREIgdGFibGUgZm9yIHVzYWdlIGhpc3RvcnkgbWV0YWRhdGEgKG9wdGlvbmFsKSAqL1xuICByZWFkb25seSB1c2FnZUhpc3RvcnlUYWJsZT86IGR5bmFtb2RiLklUYWJsZTtcbiAgLyoqIFMzIGJ1Y2tldCBmb3IgdXNhZ2UgaGlzdG9yeSBjb250ZW50IGFuZCBhdHRhY2htZW50cyAob3B0aW9uYWwpICovXG4gIHJlYWRvbmx5IHVzYWdlSGlzdG9yeUJ1Y2tldD86IHMzLklCdWNrZXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKiogVGhlIEFnZW50Q29yZSBSdW50aW1lIENGTiByZXNvdXJjZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcnVudGltZTogY2RrLkNmblJlc291cmNlO1xuICAvKiogQWdlbnRDb3JlIGF1dG8tY3JlYXRlcyBERUZBVUxUIGVuZHBvaW50OyB3ZSBkbyBub3QgY3JlYXRlIGl0IGluIENGbiAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZW5kcG9pbnQ6IGNkay5DZm5SZXNvdXJjZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgLyoqIFRoZSBJQU0gZXhlY3V0aW9uIHJvbGUgZm9yIHRoZSBBZ2VudENvcmUgUnVudGltZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZXhlY3V0aW9uUm9sZTogaWFtLlJvbGU7XG4gIC8qKiBUaGUgQVJOIG9mIHRoZSBBZ2VudENvcmUgUnVudGltZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcnVudGltZUFybjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHNjb3BlOiBDb25zdHJ1Y3QsXG4gICAgaWQ6IHN0cmluZyxcbiAgICBwcm9wczogVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lUHJvcHNcbiAgKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHN0YWNrID0gY2RrLlN0YWNrLm9mKHRoaXMpO1xuXG4gICAgLy8gQ3JlYXRlIElBTSBleGVjdXRpb24gcm9sZSBmb3IgQWdlbnRDb3JlIFJ1bnRpbWUgKHJvbGVOYW1lIHVuaXF1ZSBwZXIgYWNjb3VudDsgdXNlIHN0YWNrIG5hbWUgc28gRGV2L1Byb2QgZG8gbm90IGNvbGxpZGUpXG4gICAgLy8gVHJ1c3QgcG9saWN5OiBiZWRyb2NrLWFnZW50Y29yZS5hbWF6b25hd3MuY29tXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiRXhlY3V0aW9uUm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogYCR7c3RhY2suc3RhY2tOYW1lfS1FeGVjdXRpb25Sb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwiYmVkcm9jay1hZ2VudGNvcmUuYW1hem9uYXdzLmNvbVwiLCB7XG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgIFwiYXdzOlNvdXJjZUFjY291bnRcIjogc3RhY2suYWNjb3VudCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIEFybkxpa2U6IHtcbiAgICAgICAgICAgIFwiYXdzOlNvdXJjZUFyblwiOiBgYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZToke3N0YWNrLnJlZ2lvbn06JHtzdGFjay5hY2NvdW50fToqYCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgXCJFeGVjdXRpb24gcm9sZSBmb3IgVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIHdpdGggRHluYW1vREIsIFNlY3JldHMgTWFuYWdlciwgYW5kIEFnZW50Q29yZSBpbnZva2UgcGVybWlzc2lvbnNcIixcbiAgICB9KTtcblxuICAgIC8vIEVDUiBwZXJtaXNzaW9ucyBmb3IgY29udGFpbmVyIGltYWdlIHJldHJpZXZhbFxuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkVDUkltYWdlQWNjZXNzXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiZWNyOkJhdGNoR2V0SW1hZ2VcIixcbiAgICAgICAgICBcImVjcjpHZXREb3dubG9hZFVybEZvckxheWVyXCIsXG4gICAgICAgICAgXCJlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9ncyBwZXJtaXNzaW9uc1xuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkNsb3VkV2F0Y2hMb2dzXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwibG9nczpDcmVhdGVMb2dHcm91cFwiLFxuICAgICAgICAgIFwibG9nczpDcmVhdGVMb2dTdHJlYW1cIixcbiAgICAgICAgICBcImxvZ3M6UHV0TG9nRXZlbnRzXCIsXG4gICAgICAgICAgXCJsb2dzOkRlc2NyaWJlTG9nR3JvdXBzXCIsXG4gICAgICAgICAgXCJsb2dzOkRlc2NyaWJlTG9nU3RyZWFtc1wiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpsb2dzOiR7c3RhY2sucmVnaW9ufToke3N0YWNrLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2JlZHJvY2stYWdlbnRjb3JlLypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gWC1SYXkgdHJhY2luZyBwZXJtaXNzaW9uc1xuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIlhSYXlUcmFjaW5nXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwieHJheTpQdXRUcmFjZVNlZ21lbnRzXCIsXG4gICAgICAgICAgXCJ4cmF5OlB1dFRlbGVtZXRyeVJlY29yZHNcIixcbiAgICAgICAgICBcInhyYXk6R2V0U2FtcGxpbmdSdWxlc1wiLFxuICAgICAgICAgIFwieHJheTpHZXRTYW1wbGluZ1RhcmdldHNcIixcbiAgICAgICAgICBcInhyYXk6R2V0U2FtcGxpbmdTdGF0aXN0aWNTdW1tYXJpZXNcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBNZXRyaWNzIHBlcm1pc3Npb25zXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiQ2xvdWRXYXRjaE1ldHJpY3NcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGFcIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgIFN0cmluZ0xpa2U6IHtcbiAgICAgICAgICAgIFwiY2xvdWR3YXRjaDpuYW1lc3BhY2VcIjogW1wiU2xhY2tFdmVudEhhbmRsZXJcIiwgXCJTbGFja0FJLypcIl0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFN0cmFuZHMgQmVkcm9ja01vZGVsIHVzZXMgYmVkcm9jay1ydW50aW1lIENvbnZlcnNlL0NvbnZlcnNlU3RyZWFtIEFQSXMgZm9yIG9yY2hlc3RyYXRpb24uXG4gICAgLy8gSW52b2tlTW9kZWwvSW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW0gcmV0YWluZWQgZm9yIGRpcmVjdCBTREsgY2FsbHMgaWYgbmVlZGVkLlxuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkJlZHJvY2tNb2RlbEFjY2Vzc1wiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImJlZHJvY2s6Q29udmVyc2VcIixcbiAgICAgICAgICBcImJlZHJvY2s6Q29udmVyc2VTdHJlYW1cIixcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxcIixcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW1cIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6YmVkcm9jazphcC1ub3J0aGVhc3QtMTo6Zm91bmRhdGlvbi1tb2RlbC8qYCxcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOmFwLW5vcnRoZWFzdC0zOjpmb3VuZGF0aW9uLW1vZGVsLypgLFxuICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6JHtzdGFjay5yZWdpb259OiR7c3RhY2suYWNjb3VudH06aW5mZXJlbmNlLXByb2ZpbGUvKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgNSBzZWN1cml0eSB0YWJsZXNcbiAgICBwcm9wcy50b2tlblRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLmRlZHVwZVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLmV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy53aGl0ZWxpc3RDb25maWdUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7IC8vIFJlYWQtb25seSBmb3Igc2VjdXJpdHlcbiAgICBwcm9wcy5yYXRlTGltaXRUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIFNlY3JldHMgTWFuYWdlciBwZXJtaXNzaW9uc1xuICAgIHByb3BzLnNsYWNrU2lnbmluZ1NlY3JldC5ncmFudFJlYWQodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5zbGFja0JvdFRva2VuU2VjcmV0LmdyYW50UmVhZCh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gV2hpdGVsaXN0IGNvbmZpZyBzZWNyZXQgcGVybWlzc2lvblxuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIlNlY3JldHNNYW5hZ2VyV2hpdGVsaXN0XCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wic2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWVcIl0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7c3RhY2sucmVnaW9ufToke3N0YWNrLmFjY291bnR9OnNlY3JldDoke3N0YWNrLnN0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQWdlbnRDb3JlIEludm9rZUFnZW50UnVudGltZSBwZXJtaXNzaW9uIChmb3IgY2FsbGluZyBFeGVjdXRpb24gQWdlbnQpLlxuICAgIC8vIEFXUyByZXF1aXJlcyBpZGVudGl0eS1iYXNlZCBwb2xpY3kgdG8gYWxsb3cgdGhlIGFjdGlvbiBvbiBCT1RIIHRoZSBhZ2VudCBydW50aW1lIGFuZFxuICAgIC8vIHRoZSBhZ2VudCBlbmRwb2ludCAoc2VlIHJlc291cmNlLWJhc2VkLXBvbGljaWVzLmh0bWwgXCJIaWVyYXJjaGljYWwgYXV0aG9yaXphdGlvblwiKS5cbiAgICAvLyBJbmNsdWRlIGJvdGggZW5kcG9pbnQgQVJOIGZvcm1zOiAuLi46cnVudGltZS1lbmRwb2ludC9OYW1lL0RFRkFVTFQgYW5kXG4gICAgLy8gLi4uOnJ1bnRpbWUvTmFtZS9ydW50aW1lLWVuZHBvaW50L0RFRkFVTFQgKGxhdHRlciBpcyB1c2VkIGF0IGV2YWx1YXRpb24gcGVyIEFjY2Vzc0RlbmllZCBtZXNzYWdlKS5cbiAgICBjb25zdCB0YXJnZXRBZ2VudEFybnMgPSBbXG4gICAgICAuLi5PYmplY3QudmFsdWVzKHByb3BzLmV4ZWN1dGlvbkFnZW50QXJucyB8fCB7fSksXG4gICAgICAuLi4ocHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybiA/IFtwcm9wcy5zbGFja1NlYXJjaEFnZW50QXJuXSA6IFtdKSxcbiAgICBdLmZpbHRlcigoYXJuKTogYXJuIGlzIHN0cmluZyA9PiBCb29sZWFuKGFybikpO1xuICAgIGNvbnN0IGludm9rZVJlc291cmNlcyA9IHRhcmdldEFnZW50QXJucy5sZW5ndGhcbiAgICAgID8gdGFyZ2V0QWdlbnRBcm5zLmZsYXRNYXAoKHJ1bnRpbWVBcm4pID0+IHtcbiAgICAgICAgICBjb25zdCBlbmRwb2ludEFybkRvYyA9XG4gICAgICAgICAgICBydW50aW1lQXJuLnJlcGxhY2UoLzpydW50aW1lXFwvLywgXCI6cnVudGltZS1lbmRwb2ludC9cIikgKyBcIi9ERUZBVUxUXCI7XG4gICAgICAgICAgY29uc3QgZW5kcG9pbnRBcm5BbHQgPSBgJHtydW50aW1lQXJufS9ydW50aW1lLWVuZHBvaW50L0RFRkFVTFRgO1xuICAgICAgICAgIHJldHVybiBbcnVudGltZUFybiwgZW5kcG9pbnRBcm5Eb2MsIGVuZHBvaW50QXJuQWx0XTtcbiAgICAgICAgfSlcbiAgICAgIDogW2Bhcm46YXdzOmJlZHJvY2stYWdlbnRjb3JlOiR7c3RhY2sucmVnaW9ufToqOnJ1bnRpbWUvKmBdO1xuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkFnZW50Q29yZUludm9rZVwiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiLFxuICAgICAgICAgIFwiYmVkcm9jay1hZ2VudGNvcmU6R2V0QXN5bmNUYXNrUmVzdWx0XCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogaW52b2tlUmVzb3VyY2VzLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlQWdlbnRSdW50aW1lIGVudmlyb25tZW50VmFyaWFibGVzOiBcIkVudmlyb25tZW50IHZhcmlhYmxlcyB0byBzZXQgaW4gdGhlIEFnZW50Q29yZSBSdW50aW1lIGVudmlyb25tZW50XCJcbiAgICAvLyBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vYmVkcm9jay1hZ2VudGNvcmUtY29udHJvbC9sYXRlc3QvQVBJUmVmZXJlbmNlL0FQSV9DcmVhdGVBZ2VudFJ1bnRpbWUuaHRtbFxuICAgIGNvbnN0IGVudmlyb25tZW50VmFyaWFibGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgQVdTX1JFR0lPTl9OQU1FOiBzdGFjay5yZWdpb24sXG4gICAgICBERURVUEVfVEFCTEVfTkFNRTogcHJvcHMuZGVkdXBlVGFibGUudGFibGVOYW1lLFxuICAgICAgV0hJVEVMSVNUX1RBQkxFX05BTUU6IHByb3BzLndoaXRlbGlzdENvbmZpZ1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIFdISVRFTElTVF9TRUNSRVRfTkFNRTogYCR7c3RhY2suc3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnYCxcbiAgICAgIFJBVEVfTElNSVRfVEFCTEVfTkFNRTogcHJvcHMucmF0ZUxpbWl0VGFibGUudGFibGVOYW1lLFxuICAgICAgRVhJU1RFTkNFX0NIRUNLX0NBQ0hFX1RBQkxFOiBwcm9wcy5leGlzdGVuY2VDaGVja0NhY2hlVGFibGUudGFibGVOYW1lLFxuICAgICAgUkFURV9MSU1JVF9QRVJfTUlOVVRFOiBcIjEwXCIsXG4gICAgICBNQVhfQUdFTlRfVFVSTlM6IFwiNVwiLFxuICAgIH07XG4gICAgaWYgKHByb3BzLmFnZW50UmVnaXN0cnlUYWJsZSkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuQUdFTlRfUkVHSVNUUllfVEFCTEUgPVxuICAgICAgICBwcm9wcy5hZ2VudFJlZ2lzdHJ5VGFibGUudGFibGVOYW1lO1xuICAgIH1cbiAgICBpZiAocHJvcHMuYWdlbnRSZWdpc3RyeUVudikge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuQUdFTlRfUkVHSVNUUllfRU5WID1cbiAgICAgICAgcHJvcHMuYWdlbnRSZWdpc3RyeUVudjtcbiAgICB9XG4gICAgaWYgKHByb3BzLnNsYWNrUG9zdFJlcXVlc3RRdWV1ZSkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuU0xBQ0tfUE9TVF9SRVFVRVNUX1FVRVVFX1VSTCA9XG4gICAgICAgIHByb3BzLnNsYWNrUG9zdFJlcXVlc3RRdWV1ZS5xdWV1ZVVybDtcbiAgICAgIHByb3BzLnNsYWNrUG9zdFJlcXVlc3RRdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuICAgIH1cbiAgICBpZiAocHJvcHMuZXJyb3JEZWJ1Z0xvZ0dyb3VwKSB7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5FWEVDVVRJT05fQUdFTlRfRVJST1JfTE9HX0dST1VQID1cbiAgICAgICAgcHJvcHMuZXJyb3JEZWJ1Z0xvZ0dyb3VwLmxvZ0dyb3VwTmFtZTtcbiAgICAgIHByb3BzLmVycm9yRGVidWdMb2dHcm91cC5ncmFudFdyaXRlKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuICAgIGlmIChwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQpIHtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLkZJTEVfRVhDSEFOR0VfQlVDS0VUID1cbiAgICAgICAgcHJvcHMuZmlsZUV4Y2hhbmdlQnVja2V0LmJ1Y2tldE5hbWU7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5GSUxFX0VYQ0hBTkdFX1BSRUZJWCA9IFwiYXR0YWNobWVudHMvXCI7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5QUkVTSUdORURfVVJMX0VYUElSWSA9IFwiOTAwXCI7XG4gICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodGhpcy5leGVjdXRpb25Sb2xlLCBcImF0dGFjaG1lbnRzLypcIik7XG4gICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuZ3JhbnREZWxldGUodGhpcy5leGVjdXRpb25Sb2xlLCBcImF0dGFjaG1lbnRzLypcIik7XG4gICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodGhpcy5leGVjdXRpb25Sb2xlLCBcImdlbmVyYXRlZF9maWxlcy8qXCIpO1xuICAgIH1cbiAgICAvLyBBZ2VudCByZWdpc3RyeSBEeW5hbW9EQiByZWFkIHBlcm1pc3Npb25zIChRdWVyeSlcbiAgICBpZiAocHJvcHMuYWdlbnRSZWdpc3RyeVRhYmxlKSB7XG4gICAgICBwcm9wcy5hZ2VudFJlZ2lzdHJ5VGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuICAgIH1cbiAgICBpZiAocHJvcHMudXNhZ2VIaXN0b3J5VGFibGUpIHtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLlVTQUdFX0hJU1RPUllfVEFCTEVfTkFNRSA9XG4gICAgICAgIHByb3BzLnVzYWdlSGlzdG9yeVRhYmxlLnRhYmxlTmFtZTtcbiAgICAgIHByb3BzLnVzYWdlSGlzdG9yeVRhYmxlLmdyYW50V3JpdGVEYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuICAgIGlmIChwcm9wcy51c2FnZUhpc3RvcnlCdWNrZXQpIHtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLlVTQUdFX0hJU1RPUllfQlVDS0VUX05BTUUgPVxuICAgICAgICBwcm9wcy51c2FnZUhpc3RvcnlCdWNrZXQuYnVja2V0TmFtZTtcbiAgICAgIHByb3BzLnVzYWdlSGlzdG9yeUJ1Y2tldC5ncmFudFB1dCh0aGlzLmV4ZWN1dGlvblJvbGUsIFwiY29udGVudC8qXCIpO1xuICAgICAgcHJvcHMudXNhZ2VIaXN0b3J5QnVja2V0LmdyYW50UHV0KHRoaXMuZXhlY3V0aW9uUm9sZSwgXCJhdHRhY2htZW50cy8qXCIpO1xuICAgIH1cblxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIHRoaXMuZXhlY3V0aW9uUm9sZSxcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU01XCIsXG4gICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgXCJFQ1IgR2V0QXV0aG9yaXphdGlvblRva2VuIHJlcXVpcmVzIHJlc291cmNlOiogKEFXUyBzZXJ2aWNlIGNvbnN0cmFpbnQsIGNhbm5vdCBiZSBzY29wZWQgdG8gYSByZXBvIEFSTikuIFwiICtcbiAgICAgICAgICAgIFwiWC1SYXkgdHJhY2UgYW5kIHNhbXBsaW5nIEFQSXMgZG8gbm90IHN1cHBvcnQgcmVzb3VyY2UtbGV2ZWwgcmVzdHJpY3Rpb25zLiBcIiArXG4gICAgICAgICAgICBcIkNsb3VkV2F0Y2ggUHV0TWV0cmljRGF0YSByZXF1aXJlcyByZXNvdXJjZToqIChuYW1lc3BhY2Ugc2NvcGVkIHZpYSBjb25kaXRpb24ga2V5KS4gXCIgK1xuICAgICAgICAgICAgXCJDbG91ZFdhdGNoIExvZ3Mgc2NvcGVkIHRvIC9hd3MvYmVkcm9jay1hZ2VudGNvcmUvIHByZWZpeC4gXCIgK1xuICAgICAgICAgICAgXCJCZWRyb2NrIHVzZXMgZm91bmRhdGlvbi1tb2RlbC8qIChhcC1ub3J0aGVhc3QtMS8zIGZvciBKUCBpbmZlcmVuY2UgcHJvZmlsZXMpIGFuZCBpbmZlcmVuY2UtcHJvZmlsZS8qIEFSTiBwYXR0ZXJucy4gXCIgK1xuICAgICAgICAgICAgXCJBZ2VudENvcmUgSW52b2tlQWdlbnRSdW50aW1lIHVzZXMgcnVudGltZS1zcGVjaWZpYyBBUk5zIHdoZW4gZXhlY3V0aW9uQWdlbnRBcm5zIGFyZSBwcm92aWRlZDsgXCIgK1xuICAgICAgICAgICAgXCJmYWxsYmFjayBhcm46YXdzOmJlZHJvY2stYWdlbnRjb3JlOnJlZ2lvbjoqOnJ1bnRpbWUvKiBpcyB1c2VkIG9ubHkgd2hlbiBubyBBUk5zIGFyZSBjb25maWd1cmVkIGF0IGRlcGxveSB0aW1lLlwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRydWUsXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBBZ2VudENvcmUgUnVudGltZSB1c2luZyBMMSBDZm5SZXNvdXJjZVxuICAgIHRoaXMucnVudGltZSA9IG5ldyBjZGsuQ2ZuUmVzb3VyY2UodGhpcywgXCJSdW50aW1lXCIsIHtcbiAgICAgIHR5cGU6IFwiQVdTOjpCZWRyb2NrQWdlbnRDb3JlOjpSdW50aW1lXCIsXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIEFnZW50UnVudGltZU5hbWU6IHByb3BzLmFnZW50UnVudGltZU5hbWUsXG4gICAgICAgIFJvbGVBcm46IHRoaXMuZXhlY3V0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgICBQcm90b2NvbENvbmZpZ3VyYXRpb246IFwiQTJBXCIsXG4gICAgICAgIEFnZW50UnVudGltZUFydGlmYWN0OiB7XG4gICAgICAgICAgQ29udGFpbmVyQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgICAgQ29udGFpbmVyVXJpOiBwcm9wcy5jb250YWluZXJJbWFnZVVyaSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBOZXR3b3JrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIE5ldHdvcmtNb2RlOiBcIlBVQkxJQ1wiLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgICAvLyBMMSBDZm5SZXNvdXJjZSBkb2VzIG5vdCByZWNlaXZlIHN0YWNrLWxldmVsIFRhZ3MgZnJvbSBDREsgYXNwZWN0OyBzZXQgZXhwbGljaXRseSBmb3IgY29zdCBhbGxvY2F0aW9uXG4gICAgY29uc3QgZGVwbG95bWVudEVudiA9XG4gICAgICAodGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIpIGFzIHN0cmluZyB8IHVuZGVmaW5lZCkgPz9cbiAgICAgIHByb2Nlc3MuZW52LkRFUExPWU1FTlRfRU5WID8/XG4gICAgICBcImRldlwiO1xuICAgIHRoaXMucnVudGltZS5hZGRQcm9wZXJ0eU92ZXJyaWRlKFxuICAgICAgXCJUYWdzXCIsXG4gICAgICBnZXRDb3N0QWxsb2NhdGlvblRhZ1ZhbHVlcyh7XG4gICAgICAgIGRlcGxveW1lbnRFbnY6IFN0cmluZyhkZXBsb3ltZW50RW52KS50b0xvd2VyQ2FzZSgpLnRyaW0oKSxcbiAgICAgICAgc3RhY2tOYW1lOiBzdGFjay5zdGFja05hbWUsXG4gICAgICB9KVxuICAgICk7XG4gICAgaWYgKHByb3BzLmxpZmVjeWNsZUNvbmZpZ3VyYXRpb24pIHtcbiAgICAgIGNvbnN0IGxjID0gcHJvcHMubGlmZWN5Y2xlQ29uZmlndXJhdGlvbjtcbiAgICAgIGNvbnN0IGlkbGUgPSBsYy5pZGxlUnVudGltZVNlc3Npb25UaW1lb3V0U2Vjb25kcyA/PyA5MDA7XG4gICAgICBjb25zdCBtYXhMdCA9IGxjLm1heExpZmV0aW1lU2Vjb25kcyA/PyAyODgwMDtcbiAgICAgIHRoaXMucnVudGltZS5hZGRQcm9wZXJ0eU92ZXJyaWRlKFwiTGlmZWN5Y2xlQ29uZmlndXJhdGlvblwiLCB7XG4gICAgICAgIElkbGVSdW50aW1lU2Vzc2lvblRpbWVvdXQ6IE1hdGgubWF4KDYwLCBNYXRoLm1pbigyODgwMCwgaWRsZSkpLFxuICAgICAgICBNYXhMaWZldGltZTogTWF0aC5tYXgoNjAsIE1hdGgubWluKDI4ODAwLCBtYXhMdCkpLFxuICAgICAgfSk7XG4gICAgfVxuICAgIC8vIEVudmlyb25tZW50VmFyaWFibGVzIChzdHJpbmctdG8tc3RyaW5nIG1hcCkgYXJlIGluIENyZWF0ZUFnZW50UnVudGltZSBBUEkgYnV0IG5vdCBpbiBDREsgTDEgc2NoZW1hOyBhcHBsaWVkIGF0IGRlcGxveSB0aW1lXG4gICAgdGhpcy5ydW50aW1lLmFkZFByb3BlcnR5T3ZlcnJpZGUoXCJFbnZpcm9ubWVudFZhcmlhYmxlc1wiLCBlbnZpcm9ubWVudFZhcmlhYmxlcyk7XG5cbiAgICBjb25zdCBkZWZhdWx0UG9saWN5ID0gdGhpcy5leGVjdXRpb25Sb2xlLm5vZGUudHJ5RmluZENoaWxkKFwiRGVmYXVsdFBvbGljeVwiKTtcbiAgICBjb25zdCBwb2xpY3lDZm4gPSBkZWZhdWx0UG9saWN5Py5ub2RlLmRlZmF1bHRDaGlsZDtcbiAgICBpZiAocG9saWN5Q2ZuICYmIGNkay5DZm5SZXNvdXJjZS5pc0NmblJlc291cmNlKHBvbGljeUNmbikpIHtcbiAgICAgIHRoaXMucnVudGltZS5hZGREZXBlbmRlbmN5KHBvbGljeUNmbik7XG4gICAgfVxuXG4gICAgLy8gRGVyaXZlIEFSTiBmcm9tIHRoZSBydW50aW1lXG4gICAgdGhpcy5ydW50aW1lQXJuID0gdGhpcy5ydW50aW1lLmdldEF0dChcIkFnZW50UnVudGltZUFyblwiKS50b1N0cmluZygpO1xuXG4gICAgLy8gRG8gTk9UIGNyZWF0ZSBSdW50aW1lRW5kcG9pbnQgaW4gQ0ZuOiBBZ2VudENvcmUgYXV0by1jcmVhdGVzIERFRkFVTFQgKHdvdWxkIGNvbmZsaWN0KS5cbiAgICB0aGlzLmVuZHBvaW50ID0gdW5kZWZpbmVkO1xuICB9XG59XG4iXX0=