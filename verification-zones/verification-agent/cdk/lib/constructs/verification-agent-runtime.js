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
        // Router Agent runs Bedrock model inference for agent selection.
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: "BedrockInvokeModel",
            effect: iam.Effect.ALLOW,
            actions: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
            ],
            resources: [
                `arn:aws:bedrock:${stack.region}::foundation-model/*`,
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
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.executionRole, [
            {
                id: "AwsSolutions-IAM5",
                reason: "ECR GetAuthorizationToken requires resource:* (AWS service constraint, cannot be scoped to a repo ARN). " +
                    "X-Ray trace and sampling APIs do not support resource-level restrictions. " +
                    "CloudWatch PutMetricData requires resource:* (namespace scoped via condition key). " +
                    "CloudWatch Logs scoped to /aws/bedrock-agentcore/ prefix. " +
                    "Bedrock uses foundation-model/* and inference-profile/* ARN patterns (AWS ARN schema, version wildcard). " +
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tYWdlbnQtcnVudGltZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7OztHQWVHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMseURBQTJDO0FBTTNDLDJDQUFtRDtBQUNuRCwyREFBdUU7QUFDdkUscUNBQTBDO0FBMEMxQyxNQUFhLHdCQUF5QixTQUFRLHNCQUFTO0lBQ3JELHlDQUF5QztJQUN6QixPQUFPLENBQWtCO0lBQ3pDLDBFQUEwRTtJQUMxRCxRQUFRLEdBQWdDLFNBQVMsQ0FBQztJQUNsRSx1REFBdUQ7SUFDdkMsYUFBYSxDQUFXO0lBQ3hDLHVDQUF1QztJQUN2QixVQUFVLENBQVM7SUFFbkMsWUFDRSxLQUFnQixFQUNoQixFQUFVLEVBQ1YsS0FBb0M7UUFFcEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVqQywySEFBMkg7UUFDM0gsZ0RBQWdEO1FBQ2hELElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkQsUUFBUSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsZ0JBQWdCO1lBQzVDLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxpQ0FBaUMsRUFBRTtnQkFDckUsVUFBVSxFQUFFO29CQUNWLFlBQVksRUFBRTt3QkFDWixtQkFBbUIsRUFBRSxLQUFLLENBQUMsT0FBTztxQkFDbkM7b0JBQ0QsT0FBTyxFQUFFO3dCQUNQLGVBQWUsRUFBRSw2QkFBNkIsS0FBSyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMs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biBBZ2VudCBBZ2VudENvcmUgUnVudGltZSBjb25zdHJ1Y3QuXG4gKlxuICogUHVycG9zZTogQ3JlYXRlIGFuIEFtYXpvbiBCZWRyb2NrIEFnZW50Q29yZSBSdW50aW1lIChBMkEgcHJvdG9jb2wpIGZvciB0aGUgVmVyaWZpY2F0aW9uIEFnZW50LlxuICogSW52b2tlcyBFeGVjdXRpb24gQWdlbnQgdmlhIEEyQTsgcmVjZWl2ZXMgU2xhY2sgZXZlbnRzIGZyb20gU2xhY2tFdmVudEhhbmRsZXIgKG9yIEFnZW50SW52b2tlcikuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogQ3JlYXRlIFJ1bnRpbWUgQ0ZOIHJlc291cmNlLCBJQU0gcm9sZSwgZ3JhbnQgRHluYW1vREIvU2VjcmV0cy9TMy9TUVM7IG9wdGlvbmFsXG4gKiBlcnJvciBkZWJ1ZyBsb2cgZ3JvdXAgYW5kIGZpbGUtZXhjaGFuZ2UgYnVja2V0LiBBMkEgY29udGFpbmVyIHBvcnQgOTAwMCwgQVJNNjQuXG4gKlxuICogSW5wdXRzOiBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVQcm9wcyAoYWdlbnRSdW50aW1lTmFtZSwgY29udGFpbmVySW1hZ2VVcmksIER5bmFtb0RCIHRhYmxlcyxcbiAqIHNlY3JldHMsIGV4ZWN1dGlvbkFnZW50QXJucywgb3B0aW9uYWwgc2xhY2tQb3N0UmVxdWVzdFF1ZXVlLCBlcnJvckRlYnVnTG9nR3JvdXAsIGZpbGVFeGNoYW5nZUJ1Y2tldCkuXG4gKlxuICogT3V0cHV0czogcnVudGltZSwgZXhlY3V0aW9uUm9sZSwgcnVudGltZUFybiAodmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuKS5cbiAqXG4gKiBAbW9kdWxlIGNkay9saWIvdmVyaWZpY2F0aW9uL2NvbnN0cnVjdHMvdmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWVcbiAqL1xuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sb2dzXCI7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zcXNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCwgSUNvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBnZXRDb3N0QWxsb2NhdGlvblRhZ1ZhbHVlcyB9IGZyb20gXCJAc2xhY2stYWktYXBwL2Nkay10b29saW5nXCI7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuXG4vKiogTGlmZWN5Y2xlIGNvbmZpZ3VyYXRpb24gZm9yIEFnZW50Q29yZSBSdW50aW1lIChvcHRpb25hbCkuIFNlZSByZXNlYXJjaC5tZCDCpzIuICovXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50Q29yZUxpZmVjeWNsZUNvbmZpZyB7XG4gIC8qKiBJZGxlIHNlc3Npb24gdGltZW91dCBpbiBzZWNvbmRzICg2MOKAkzI4ODAwKS4gRGVmYXVsdDogOTAwLiAqL1xuICByZWFkb25seSBpZGxlUnVudGltZVNlc3Npb25UaW1lb3V0U2Vjb25kcz86IG51bWJlcjtcbiAgLyoqIE1heCBpbnN0YW5jZSBsaWZldGltZSBpbiBzZWNvbmRzICg2MOKAkzI4ODAwKS4gRGVmYXVsdDogMjg4MDAuICovXG4gIHJlYWRvbmx5IG1heExpZmV0aW1lU2Vjb25kcz86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVQcm9wcyB7XG4gIC8qKiBOYW1lIGZvciB0aGUgQWdlbnRDb3JlIFJ1bnRpbWUgKi9cbiAgcmVhZG9ubHkgYWdlbnRSdW50aW1lTmFtZTogc3RyaW5nO1xuICAvKiogRUNSIGNvbnRhaW5lciBpbWFnZSBVUkkgKGluY2x1ZGluZyB0YWcpICovXG4gIHJlYWRvbmx5IGNvbnRhaW5lckltYWdlVXJpOiBzdHJpbmc7XG4gIC8qKiBMaWZlY3ljbGUgY29uZmlndXJhdGlvbiAob3B0aW9uYWwpLiBPbWl0IHRvIHVzZSBwbGF0Zm9ybSBkZWZhdWx0cy4gKi9cbiAgcmVhZG9ubHkgbGlmZWN5Y2xlQ29uZmlndXJhdGlvbj86IEFnZW50Q29yZUxpZmVjeWNsZUNvbmZpZztcbiAgLyoqIER5bmFtb0RCIHRhYmxlcyBmb3Igc2VjdXJpdHkgdmFsaWRhdGlvbiAqL1xuICByZWFkb25seSB0b2tlblRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIHJlYWRvbmx5IGRlZHVwZVRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIHJlYWRvbmx5IGV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICByZWFkb25seSB3aGl0ZWxpc3RDb25maWdUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICByZWFkb25seSByYXRlTGltaXRUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICAvKiogU2VjcmV0cyBNYW5hZ2VyIHNlY3JldHMgKi9cbiAgcmVhZG9ubHkgc2xhY2tTaWduaW5nU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuICByZWFkb25seSBzbGFja0JvdFRva2VuU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuICAvKiogTWFwIG9mIGV4ZWN1dGlvbiBhZ2VudCBJRHMgdG8gcnVudGltZSBBUk5zIChmb3IgQTJBIGludm9jYXRpb24pICovXG4gIHJlYWRvbmx5IGV4ZWN1dGlvbkFnZW50QXJucz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIC8qKiBTUVMgcXVldWUgZm9yIFNsYWNrIHBvc3QgcmVxdWVzdHM7IEFnZW50IHNlbmRzIGhlcmUgaW5zdGVhZCBvZiBjYWxsaW5nIFNsYWNrIEFQSSAqL1xuICByZWFkb25seSBzbGFja1Bvc3RSZXF1ZXN0UXVldWU/OiBzcXMuSVF1ZXVlO1xuICAvKiogQ2xvdWRXYXRjaCBMb2cgZ3JvdXAgZm9yIGV4ZWN1dGlvbiBlcnJvciBkZWJ1ZyAodHJvdWJsZXNob290aW5nKSAqL1xuICByZWFkb25seSBlcnJvckRlYnVnTG9nR3JvdXA/OiBsb2dzLklMb2dHcm91cDtcbiAgLyoqIFMzIGJ1Y2tldCBmb3IgdGVtcG9yYXJ5IGZpbGUgZXhjaGFuZ2UgYmV0d2VlbiB6b25lcyAqL1xuICByZWFkb25seSBmaWxlRXhjaGFuZ2VCdWNrZXQ/OiBzMy5JQnVja2V0O1xuICAvKiogQVJOIG9mIHRoZSBTbGFjayBTZWFyY2ggQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgKG9wdGlvbmFsKSAqL1xuICByZWFkb25seSBzbGFja1NlYXJjaEFnZW50QXJuPzogc3RyaW5nO1xuICAvKiogRHluYW1vREIgdGFibGUgZm9yIHVzYWdlIGhpc3RvcnkgbWV0YWRhdGEgKG9wdGlvbmFsKSAqL1xuICByZWFkb25seSB1c2FnZUhpc3RvcnlUYWJsZT86IGR5bmFtb2RiLklUYWJsZTtcbiAgLyoqIFMzIGJ1Y2tldCBmb3IgdXNhZ2UgaGlzdG9yeSBjb250ZW50IGFuZCBhdHRhY2htZW50cyAob3B0aW9uYWwpICovXG4gIHJlYWRvbmx5IHVzYWdlSGlzdG9yeUJ1Y2tldD86IHMzLklCdWNrZXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKiogVGhlIEFnZW50Q29yZSBSdW50aW1lIENGTiByZXNvdXJjZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcnVudGltZTogY2RrLkNmblJlc291cmNlO1xuICAvKiogQWdlbnRDb3JlIGF1dG8tY3JlYXRlcyBERUZBVUxUIGVuZHBvaW50OyB3ZSBkbyBub3QgY3JlYXRlIGl0IGluIENGbiAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZW5kcG9pbnQ6IGNkay5DZm5SZXNvdXJjZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgLyoqIFRoZSBJQU0gZXhlY3V0aW9uIHJvbGUgZm9yIHRoZSBBZ2VudENvcmUgUnVudGltZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZXhlY3V0aW9uUm9sZTogaWFtLlJvbGU7XG4gIC8qKiBUaGUgQVJOIG9mIHRoZSBBZ2VudENvcmUgUnVudGltZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcnVudGltZUFybjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHNjb3BlOiBDb25zdHJ1Y3QsXG4gICAgaWQ6IHN0cmluZyxcbiAgICBwcm9wczogVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lUHJvcHNcbiAgKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHN0YWNrID0gY2RrLlN0YWNrLm9mKHRoaXMpO1xuXG4gICAgLy8gQ3JlYXRlIElBTSBleGVjdXRpb24gcm9sZSBmb3IgQWdlbnRDb3JlIFJ1bnRpbWUgKHJvbGVOYW1lIHVuaXF1ZSBwZXIgYWNjb3VudDsgdXNlIHN0YWNrIG5hbWUgc28gRGV2L1Byb2QgZG8gbm90IGNvbGxpZGUpXG4gICAgLy8gVHJ1c3QgcG9saWN5OiBiZWRyb2NrLWFnZW50Y29yZS5hbWF6b25hd3MuY29tXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiRXhlY3V0aW9uUm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogYCR7c3RhY2suc3RhY2tOYW1lfS1FeGVjdXRpb25Sb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwiYmVkcm9jay1hZ2VudGNvcmUuYW1hem9uYXdzLmNvbVwiLCB7XG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgIFwiYXdzOlNvdXJjZUFjY291bnRcIjogc3RhY2suYWNjb3VudCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIEFybkxpa2U6IHtcbiAgICAgICAgICAgIFwiYXdzOlNvdXJjZUFyblwiOiBgYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZToke3N0YWNrLnJlZ2lvbn06JHtzdGFjay5hY2NvdW50fToqYCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgXCJFeGVjdXRpb24gcm9sZSBmb3IgVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIHdpdGggRHluYW1vREIsIFNlY3JldHMgTWFuYWdlciwgYW5kIEFnZW50Q29yZSBpbnZva2UgcGVybWlzc2lvbnNcIixcbiAgICB9KTtcblxuICAgIC8vIEVDUiBwZXJtaXNzaW9ucyBmb3IgY29udGFpbmVyIGltYWdlIHJldHJpZXZhbFxuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkVDUkltYWdlQWNjZXNzXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiZWNyOkJhdGNoR2V0SW1hZ2VcIixcbiAgICAgICAgICBcImVjcjpHZXREb3dubG9hZFVybEZvckxheWVyXCIsXG4gICAgICAgICAgXCJlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9ncyBwZXJtaXNzaW9uc1xuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkNsb3VkV2F0Y2hMb2dzXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwibG9nczpDcmVhdGVMb2dHcm91cFwiLFxuICAgICAgICAgIFwibG9nczpDcmVhdGVMb2dTdHJlYW1cIixcbiAgICAgICAgICBcImxvZ3M6UHV0TG9nRXZlbnRzXCIsXG4gICAgICAgICAgXCJsb2dzOkRlc2NyaWJlTG9nR3JvdXBzXCIsXG4gICAgICAgICAgXCJsb2dzOkRlc2NyaWJlTG9nU3RyZWFtc1wiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpsb2dzOiR7c3RhY2sucmVnaW9ufToke3N0YWNrLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2JlZHJvY2stYWdlbnRjb3JlLypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gWC1SYXkgdHJhY2luZyBwZXJtaXNzaW9uc1xuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIlhSYXlUcmFjaW5nXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwieHJheTpQdXRUcmFjZVNlZ21lbnRzXCIsXG4gICAgICAgICAgXCJ4cmF5OlB1dFRlbGVtZXRyeVJlY29yZHNcIixcbiAgICAgICAgICBcInhyYXk6R2V0U2FtcGxpbmdSdWxlc1wiLFxuICAgICAgICAgIFwieHJheTpHZXRTYW1wbGluZ1RhcmdldHNcIixcbiAgICAgICAgICBcInhyYXk6R2V0U2FtcGxpbmdTdGF0aXN0aWNTdW1tYXJpZXNcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBNZXRyaWNzIHBlcm1pc3Npb25zXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiQ2xvdWRXYXRjaE1ldHJpY3NcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGFcIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgIFN0cmluZ0xpa2U6IHtcbiAgICAgICAgICAgIFwiY2xvdWR3YXRjaDpuYW1lc3BhY2VcIjogW1wiU2xhY2tFdmVudEhhbmRsZXJcIiwgXCJTbGFja0FJLypcIl0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFJvdXRlciBBZ2VudCBydW5zIEJlZHJvY2sgbW9kZWwgaW5mZXJlbmNlIGZvciBhZ2VudCBzZWxlY3Rpb24uXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiQmVkcm9ja0ludm9rZU1vZGVsXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFwiLFxuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbVwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7c3RhY2sucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC8qYCxcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7c3RhY2sucmVnaW9ufToke3N0YWNrLmFjY291bnR9OmluZmVyZW5jZS1wcm9maWxlLypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIDUgc2VjdXJpdHkgdGFibGVzXG4gICAgcHJvcHMudG9rZW5UYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5kZWR1cGVUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5leGlzdGVuY2VDaGVja0NhY2hlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMud2hpdGVsaXN0Q29uZmlnVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmV4ZWN1dGlvblJvbGUpOyAvLyBSZWFkLW9ubHkgZm9yIHNlY3VyaXR5XG4gICAgcHJvcHMucmF0ZUxpbWl0VGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBTZWNyZXRzIE1hbmFnZXIgcGVybWlzc2lvbnNcbiAgICBwcm9wcy5zbGFja1NpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2xhY2tCb3RUb2tlblNlY3JldC5ncmFudFJlYWQodGhpcy5leGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIFdoaXRlbGlzdCBjb25maWcgc2VjcmV0IHBlcm1pc3Npb25cbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJTZWNyZXRzTWFuYWdlcldoaXRlbGlzdFwiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcInNlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke3N0YWNrLnJlZ2lvbn06JHtzdGFjay5hY2NvdW50fTpzZWNyZXQ6JHtzdGFjay5zdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWcqYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEFnZW50Q29yZSBJbnZva2VBZ2VudFJ1bnRpbWUgcGVybWlzc2lvbiAoZm9yIGNhbGxpbmcgRXhlY3V0aW9uIEFnZW50KS5cbiAgICAvLyBBV1MgcmVxdWlyZXMgaWRlbnRpdHktYmFzZWQgcG9saWN5IHRvIGFsbG93IHRoZSBhY3Rpb24gb24gQk9USCB0aGUgYWdlbnQgcnVudGltZSBhbmRcbiAgICAvLyB0aGUgYWdlbnQgZW5kcG9pbnQgKHNlZSByZXNvdXJjZS1iYXNlZC1wb2xpY2llcy5odG1sIFwiSGllcmFyY2hpY2FsIGF1dGhvcml6YXRpb25cIikuXG4gICAgLy8gSW5jbHVkZSBib3RoIGVuZHBvaW50IEFSTiBmb3JtczogLi4uOnJ1bnRpbWUtZW5kcG9pbnQvTmFtZS9ERUZBVUxUIGFuZFxuICAgIC8vIC4uLjpydW50aW1lL05hbWUvcnVudGltZS1lbmRwb2ludC9ERUZBVUxUIChsYXR0ZXIgaXMgdXNlZCBhdCBldmFsdWF0aW9uIHBlciBBY2Nlc3NEZW5pZWQgbWVzc2FnZSkuXG4gICAgY29uc3QgdGFyZ2V0QWdlbnRBcm5zID0gW1xuICAgICAgLi4uT2JqZWN0LnZhbHVlcyhwcm9wcy5leGVjdXRpb25BZ2VudEFybnMgfHwge30pLFxuICAgICAgLi4uKHByb3BzLnNsYWNrU2VhcmNoQWdlbnRBcm4gPyBbcHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybl0gOiBbXSksXG4gICAgXS5maWx0ZXIoKGFybik6IGFybiBpcyBzdHJpbmcgPT4gQm9vbGVhbihhcm4pKTtcbiAgICBjb25zdCBpbnZva2VSZXNvdXJjZXMgPSB0YXJnZXRBZ2VudEFybnMubGVuZ3RoXG4gICAgICA/IHRhcmdldEFnZW50QXJucy5mbGF0TWFwKChydW50aW1lQXJuKSA9PiB7XG4gICAgICAgICAgY29uc3QgZW5kcG9pbnRBcm5Eb2MgPVxuICAgICAgICAgICAgcnVudGltZUFybi5yZXBsYWNlKC86cnVudGltZVxcLy8sIFwiOnJ1bnRpbWUtZW5kcG9pbnQvXCIpICsgXCIvREVGQVVMVFwiO1xuICAgICAgICAgIGNvbnN0IGVuZHBvaW50QXJuQWx0ID0gYCR7cnVudGltZUFybn0vcnVudGltZS1lbmRwb2ludC9ERUZBVUxUYDtcbiAgICAgICAgICByZXR1cm4gW3J1bnRpbWVBcm4sIGVuZHBvaW50QXJuRG9jLCBlbmRwb2ludEFybkFsdF07XG4gICAgICAgIH0pXG4gICAgICA6IFtgYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZToke3N0YWNrLnJlZ2lvbn06KjpydW50aW1lLypgXTtcbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJBZ2VudENvcmVJbnZva2VcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIixcbiAgICAgICAgICBcImJlZHJvY2stYWdlbnRjb3JlOkdldEFzeW5jVGFza1Jlc3VsdFwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IGludm9rZVJlc291cmNlcyxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZUFnZW50UnVudGltZSBlbnZpcm9ubWVudFZhcmlhYmxlczogXCJFbnZpcm9ubWVudCB2YXJpYWJsZXMgdG8gc2V0IGluIHRoZSBBZ2VudENvcmUgUnVudGltZSBlbnZpcm9ubWVudFwiXG4gICAgLy8gaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2JlZHJvY2stYWdlbnRjb3JlLWNvbnRyb2wvbGF0ZXN0L0FQSVJlZmVyZW5jZS9BUElfQ3JlYXRlQWdlbnRSdW50aW1lLmh0bWxcbiAgICBjb25zdCBlbnZpcm9ubWVudFZhcmlhYmxlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgIEFXU19SRUdJT05fTkFNRTogc3RhY2sucmVnaW9uLFxuICAgICAgREVEVVBFX1RBQkxFX05BTUU6IHByb3BzLmRlZHVwZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIFdISVRFTElTVF9UQUJMRV9OQU1FOiBwcm9wcy53aGl0ZWxpc3RDb25maWdUYWJsZS50YWJsZU5hbWUsXG4gICAgICBXSElURUxJU1RfU0VDUkVUX05BTUU6IGAke3N0YWNrLnN0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ2AsXG4gICAgICBSQVRFX0xJTUlUX1RBQkxFX05BTUU6IHByb3BzLnJhdGVMaW1pdFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIEVYSVNURU5DRV9DSEVDS19DQUNIRV9UQUJMRTogcHJvcHMuZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIFJBVEVfTElNSVRfUEVSX01JTlVURTogXCIxMFwiLFxuICAgICAgRU5BQkxFX0FHRU5UX0NBUkRfRElTQ09WRVJZOiBcInRydWVcIixcbiAgICAgIE1BWF9BR0VOVF9UVVJOUzogXCI1XCIsXG4gICAgfTtcbiAgICBjb25zdCBleGVjdXRpb25BZ2VudEFybnNNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAuLi4ocHJvcHMuZXhlY3V0aW9uQWdlbnRBcm5zIHx8IHt9KSxcbiAgICB9O1xuICAgIC8vIEJhY2t3YXJkIGNvbXBhdGliaWxpdHkgZm9yIG9sZGVyIGtleSB3aGlsZSByb3V0aW5nIGRlZmF1bHQgYWdlbnQgaXMgZmlsZS1jcmVhdG9yLlxuICAgIGlmIChcbiAgICAgIGV4ZWN1dGlvbkFnZW50QXJuc01hcC5nZW5lcmFsICYmXG4gICAgICAhZXhlY3V0aW9uQWdlbnRBcm5zTWFwW1wiZmlsZS1jcmVhdG9yXCJdXG4gICAgKSB7XG4gICAgICBleGVjdXRpb25BZ2VudEFybnNNYXBbXCJmaWxlLWNyZWF0b3JcIl0gPSBleGVjdXRpb25BZ2VudEFybnNNYXAuZ2VuZXJhbDtcbiAgICAgIGRlbGV0ZSBleGVjdXRpb25BZ2VudEFybnNNYXAuZ2VuZXJhbDtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4ZWN1dGlvbkFnZW50QXJuc01hcCkubGVuZ3RoID4gMCkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuRVhFQ1VUSU9OX0FHRU5UX0FSTlMgPSBKU09OLnN0cmluZ2lmeShcbiAgICAgICAgZXhlY3V0aW9uQWdlbnRBcm5zTWFwXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocHJvcHMuc2xhY2tQb3N0UmVxdWVzdFF1ZXVlKSB7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5TTEFDS19QT1NUX1JFUVVFU1RfUVVFVUVfVVJMID1cbiAgICAgICAgcHJvcHMuc2xhY2tQb3N0UmVxdWVzdFF1ZXVlLnF1ZXVlVXJsO1xuICAgICAgcHJvcHMuc2xhY2tQb3N0UmVxdWVzdFF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuICAgIGlmIChwcm9wcy5lcnJvckRlYnVnTG9nR3JvdXApIHtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLkVYRUNVVElPTl9BR0VOVF9FUlJPUl9MT0dfR1JPVVAgPVxuICAgICAgICBwcm9wcy5lcnJvckRlYnVnTG9nR3JvdXAubG9nR3JvdXBOYW1lO1xuICAgICAgcHJvcHMuZXJyb3JEZWJ1Z0xvZ0dyb3VwLmdyYW50V3JpdGUodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICB9XG4gICAgaWYgKHByb3BzLmZpbGVFeGNoYW5nZUJ1Y2tldCkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuRklMRV9FWENIQU5HRV9CVUNLRVQgPVxuICAgICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuYnVja2V0TmFtZTtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLkZJTEVfRVhDSEFOR0VfUFJFRklYID0gXCJhdHRhY2htZW50cy9cIjtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLlBSRVNJR05FRF9VUkxfRVhQSVJZID0gXCI5MDBcIjtcbiAgICAgIHByb3BzLmZpbGVFeGNoYW5nZUJ1Y2tldC5ncmFudFJlYWRXcml0ZSh0aGlzLmV4ZWN1dGlvblJvbGUsIFwiYXR0YWNobWVudHMvKlwiKTtcbiAgICAgIHByb3BzLmZpbGVFeGNoYW5nZUJ1Y2tldC5ncmFudERlbGV0ZSh0aGlzLmV4ZWN1dGlvblJvbGUsIFwiYXR0YWNobWVudHMvKlwiKTtcbiAgICAgIHByb3BzLmZpbGVFeGNoYW5nZUJ1Y2tldC5ncmFudFJlYWRXcml0ZSh0aGlzLmV4ZWN1dGlvblJvbGUsIFwiZ2VuZXJhdGVkX2ZpbGVzLypcIik7XG4gICAgfVxuICAgIGlmIChwcm9wcy5zbGFja1NlYXJjaEFnZW50QXJuKSB7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5TTEFDS19TRUFSQ0hfQUdFTlRfQVJOID0gcHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybjtcbiAgICB9XG4gICAgaWYgKHByb3BzLnVzYWdlSGlzdG9yeVRhYmxlKSB7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5VU0FHRV9ISVNUT1JZX1RBQkxFX05BTUUgPVxuICAgICAgICBwcm9wcy51c2FnZUhpc3RvcnlUYWJsZS50YWJsZU5hbWU7XG4gICAgICBwcm9wcy51c2FnZUhpc3RvcnlUYWJsZS5ncmFudFdyaXRlRGF0YSh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuICAgIH1cbiAgICBpZiAocHJvcHMudXNhZ2VIaXN0b3J5QnVja2V0KSB7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5VU0FHRV9ISVNUT1JZX0JVQ0tFVF9OQU1FID1cbiAgICAgICAgcHJvcHMudXNhZ2VIaXN0b3J5QnVja2V0LmJ1Y2tldE5hbWU7XG4gICAgICBwcm9wcy51c2FnZUhpc3RvcnlCdWNrZXQuZ3JhbnRQdXQodGhpcy5leGVjdXRpb25Sb2xlLCBcImNvbnRlbnQvKlwiKTtcbiAgICAgIHByb3BzLnVzYWdlSGlzdG9yeUJ1Y2tldC5ncmFudFB1dCh0aGlzLmV4ZWN1dGlvblJvbGUsIFwiYXR0YWNobWVudHMvKlwiKTtcbiAgICB9XG5cbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICB0aGlzLmV4ZWN1dGlvblJvbGUsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtSUFNNVwiLFxuICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgIFwiRUNSIEdldEF1dGhvcml6YXRpb25Ub2tlbiByZXF1aXJlcyByZXNvdXJjZToqIChBV1Mgc2VydmljZSBjb25zdHJhaW50LCBjYW5ub3QgYmUgc2NvcGVkIHRvIGEgcmVwbyBBUk4pLiBcIiArXG4gICAgICAgICAgICBcIlgtUmF5IHRyYWNlIGFuZCBzYW1wbGluZyBBUElzIGRvIG5vdCBzdXBwb3J0IHJlc291cmNlLWxldmVsIHJlc3RyaWN0aW9ucy4gXCIgK1xuICAgICAgICAgICAgXCJDbG91ZFdhdGNoIFB1dE1ldHJpY0RhdGEgcmVxdWlyZXMgcmVzb3VyY2U6KiAobmFtZXNwYWNlIHNjb3BlZCB2aWEgY29uZGl0aW9uIGtleSkuIFwiICtcbiAgICAgICAgICAgIFwiQ2xvdWRXYXRjaCBMb2dzIHNjb3BlZCB0byAvYXdzL2JlZHJvY2stYWdlbnRjb3JlLyBwcmVmaXguIFwiICtcbiAgICAgICAgICAgIFwiQmVkcm9jayB1c2VzIGZvdW5kYXRpb24tbW9kZWwvKiBhbmQgaW5mZXJlbmNlLXByb2ZpbGUvKiBBUk4gcGF0dGVybnMgKEFXUyBBUk4gc2NoZW1hLCB2ZXJzaW9uIHdpbGRjYXJkKS4gXCIgK1xuICAgICAgICAgICAgXCJBZ2VudENvcmUgSW52b2tlQWdlbnRSdW50aW1lIHVzZXMgcnVudGltZS1zcGVjaWZpYyBBUk5zIHdoZW4gZXhlY3V0aW9uQWdlbnRBcm5zIGFyZSBwcm92aWRlZDsgXCIgK1xuICAgICAgICAgICAgXCJmYWxsYmFjayBhcm46YXdzOmJlZHJvY2stYWdlbnRjb3JlOnJlZ2lvbjoqOnJ1bnRpbWUvKiBpcyB1c2VkIG9ubHkgd2hlbiBubyBBUk5zIGFyZSBjb25maWd1cmVkIGF0IGRlcGxveSB0aW1lLlwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRydWUsXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBBZ2VudENvcmUgUnVudGltZSB1c2luZyBMMSBDZm5SZXNvdXJjZVxuICAgIHRoaXMucnVudGltZSA9IG5ldyBjZGsuQ2ZuUmVzb3VyY2UodGhpcywgXCJSdW50aW1lXCIsIHtcbiAgICAgIHR5cGU6IFwiQVdTOjpCZWRyb2NrQWdlbnRDb3JlOjpSdW50aW1lXCIsXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIEFnZW50UnVudGltZU5hbWU6IHByb3BzLmFnZW50UnVudGltZU5hbWUsXG4gICAgICAgIFJvbGVBcm46IHRoaXMuZXhlY3V0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgICBQcm90b2NvbENvbmZpZ3VyYXRpb246IFwiQTJBXCIsXG4gICAgICAgIEFnZW50UnVudGltZUFydGlmYWN0OiB7XG4gICAgICAgICAgQ29udGFpbmVyQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgICAgQ29udGFpbmVyVXJpOiBwcm9wcy5jb250YWluZXJJbWFnZVVyaSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBOZXR3b3JrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIE5ldHdvcmtNb2RlOiBcIlBVQkxJQ1wiLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgICAvLyBMMSBDZm5SZXNvdXJjZSBkb2VzIG5vdCByZWNlaXZlIHN0YWNrLWxldmVsIFRhZ3MgZnJvbSBDREsgYXNwZWN0OyBzZXQgZXhwbGljaXRseSBmb3IgY29zdCBhbGxvY2F0aW9uXG4gICAgY29uc3QgZGVwbG95bWVudEVudiA9XG4gICAgICAodGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIpIGFzIHN0cmluZyB8IHVuZGVmaW5lZCkgPz9cbiAgICAgIHByb2Nlc3MuZW52LkRFUExPWU1FTlRfRU5WID8/XG4gICAgICBcImRldlwiO1xuICAgIHRoaXMucnVudGltZS5hZGRQcm9wZXJ0eU92ZXJyaWRlKFxuICAgICAgXCJUYWdzXCIsXG4gICAgICBnZXRDb3N0QWxsb2NhdGlvblRhZ1ZhbHVlcyh7XG4gICAgICAgIGRlcGxveW1lbnRFbnY6IFN0cmluZyhkZXBsb3ltZW50RW52KS50b0xvd2VyQ2FzZSgpLnRyaW0oKSxcbiAgICAgICAgc3RhY2tOYW1lOiBzdGFjay5zdGFja05hbWUsXG4gICAgICB9KVxuICAgICk7XG4gICAgaWYgKHByb3BzLmxpZmVjeWNsZUNvbmZpZ3VyYXRpb24pIHtcbiAgICAgIGNvbnN0IGxjID0gcHJvcHMubGlmZWN5Y2xlQ29uZmlndXJhdGlvbjtcbiAgICAgIGNvbnN0IGlkbGUgPSBsYy5pZGxlUnVudGltZVNlc3Npb25UaW1lb3V0U2Vjb25kcyA/PyA5MDA7XG4gICAgICBjb25zdCBtYXhMdCA9IGxjLm1heExpZmV0aW1lU2Vjb25kcyA/PyAyODgwMDtcbiAgICAgIHRoaXMucnVudGltZS5hZGRQcm9wZXJ0eU92ZXJyaWRlKFwiTGlmZWN5Y2xlQ29uZmlndXJhdGlvblwiLCB7XG4gICAgICAgIElkbGVSdW50aW1lU2Vzc2lvblRpbWVvdXQ6IE1hdGgubWF4KDYwLCBNYXRoLm1pbigyODgwMCwgaWRsZSkpLFxuICAgICAgICBNYXhMaWZldGltZTogTWF0aC5tYXgoNjAsIE1hdGgubWluKDI4ODAwLCBtYXhMdCkpLFxuICAgICAgfSk7XG4gICAgfVxuICAgIC8vIEVudmlyb25tZW50VmFyaWFibGVzIChzdHJpbmctdG8tc3RyaW5nIG1hcCkgYXJlIGluIENyZWF0ZUFnZW50UnVudGltZSBBUEkgYnV0IG5vdCBpbiBDREsgTDEgc2NoZW1hOyBhcHBsaWVkIGF0IGRlcGxveSB0aW1lXG4gICAgdGhpcy5ydW50aW1lLmFkZFByb3BlcnR5T3ZlcnJpZGUoXCJFbnZpcm9ubWVudFZhcmlhYmxlc1wiLCBlbnZpcm9ubWVudFZhcmlhYmxlcyk7XG5cbiAgICBjb25zdCBkZWZhdWx0UG9saWN5ID0gdGhpcy5leGVjdXRpb25Sb2xlLm5vZGUudHJ5RmluZENoaWxkKFwiRGVmYXVsdFBvbGljeVwiKTtcbiAgICBjb25zdCBwb2xpY3lDZm4gPSBkZWZhdWx0UG9saWN5Py5ub2RlLmRlZmF1bHRDaGlsZDtcbiAgICBpZiAocG9saWN5Q2ZuICYmIGNkay5DZm5SZXNvdXJjZS5pc0NmblJlc291cmNlKHBvbGljeUNmbikpIHtcbiAgICAgIHRoaXMucnVudGltZS5hZGREZXBlbmRlbmN5KHBvbGljeUNmbik7XG4gICAgfVxuXG4gICAgLy8gRGVyaXZlIEFSTiBmcm9tIHRoZSBydW50aW1lXG4gICAgdGhpcy5ydW50aW1lQXJuID0gdGhpcy5ydW50aW1lLmdldEF0dChcIkFnZW50UnVudGltZUFyblwiKS50b1N0cmluZygpO1xuXG4gICAgLy8gRG8gTk9UIGNyZWF0ZSBSdW50aW1lRW5kcG9pbnQgaW4gQ0ZuOiBBZ2VudENvcmUgYXV0by1jcmVhdGVzIERFRkFVTFQgKHdvdWxkIGNvbmZsaWN0KS5cbiAgICB0aGlzLmVuZHBvaW50ID0gdW5kZWZpbmVkO1xuICB9XG59XG4iXX0=