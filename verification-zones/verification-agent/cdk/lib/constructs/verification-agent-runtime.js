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
            ENABLE_AGENT_CARD_DISCOVERY: "false",
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tYWdlbnQtcnVudGltZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7OztHQWVHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMseURBQTJDO0FBTTNDLDJDQUFtRDtBQUNuRCwyREFBdUU7QUFDdkUscUNBQTBDO0FBMEMxQyxNQUFhLHdCQUF5QixTQUFRLHNCQUFTO0lBQ3JELHlDQUF5QztJQUN6QixPQUFPLENBQWtCO0lBQ3pDLDBFQUEwRTtJQUMxRCxRQUFRLEdBQWdDLFNBQVMsQ0FBQztJQUNsRSx1REFBdUQ7SUFDdkMsYUFBYSxDQUFXO0lBQ3hDLHVDQUF1QztJQUN2QixVQUFVLENBQVM7SUFFbkMsWUFDRSxLQUFnQixFQUNoQixFQUFVLEVBQ1YsS0FBb0M7UUFFcEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVqQywySEFBMkg7UUFDM0gsZ0RBQWdEO1FBQ2hELElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkQsUUFBUSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsZ0JBQWdCO1lBQzVDLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxpQ0FBaUMsRUFBRTtnQkFDckUsVUFBVSxFQUFFO29CQUNWLFlBQVksRUFBRTt3QkFDWixtQkFBbUIsRUFBRSxLQUFLLENBQUMsT0FBTztxQkFDbkM7b0JBQ0QsT0FBTyxFQUFFO3dCQUNQLGVBQWUsRUFBRSw2QkFBNkIsS0FBSyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMs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biBBZ2VudCBBZ2VudENvcmUgUnVudGltZSBjb25zdHJ1Y3QuXG4gKlxuICogUHVycG9zZTogQ3JlYXRlIGFuIEFtYXpvbiBCZWRyb2NrIEFnZW50Q29yZSBSdW50aW1lIChBMkEgcHJvdG9jb2wpIGZvciB0aGUgVmVyaWZpY2F0aW9uIEFnZW50LlxuICogSW52b2tlcyBFeGVjdXRpb24gQWdlbnQgdmlhIEEyQTsgcmVjZWl2ZXMgU2xhY2sgZXZlbnRzIGZyb20gU2xhY2tFdmVudEhhbmRsZXIgKG9yIEFnZW50SW52b2tlcikuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogQ3JlYXRlIFJ1bnRpbWUgQ0ZOIHJlc291cmNlLCBJQU0gcm9sZSwgZ3JhbnQgRHluYW1vREIvU2VjcmV0cy9TMy9TUVM7IG9wdGlvbmFsXG4gKiBlcnJvciBkZWJ1ZyBsb2cgZ3JvdXAgYW5kIGZpbGUtZXhjaGFuZ2UgYnVja2V0LiBBMkEgY29udGFpbmVyIHBvcnQgOTAwMCwgQVJNNjQuXG4gKlxuICogSW5wdXRzOiBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVQcm9wcyAoYWdlbnRSdW50aW1lTmFtZSwgY29udGFpbmVySW1hZ2VVcmksIER5bmFtb0RCIHRhYmxlcyxcbiAqIHNlY3JldHMsIGV4ZWN1dGlvbkFnZW50QXJucywgb3B0aW9uYWwgc2xhY2tQb3N0UmVxdWVzdFF1ZXVlLCBlcnJvckRlYnVnTG9nR3JvdXAsIGZpbGVFeGNoYW5nZUJ1Y2tldCkuXG4gKlxuICogT3V0cHV0czogcnVudGltZSwgZXhlY3V0aW9uUm9sZSwgcnVudGltZUFybiAodmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuKS5cbiAqXG4gKiBAbW9kdWxlIGNkay9saWIvdmVyaWZpY2F0aW9uL2NvbnN0cnVjdHMvdmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWVcbiAqL1xuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sb2dzXCI7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zcXNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCwgSUNvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBnZXRDb3N0QWxsb2NhdGlvblRhZ1ZhbHVlcyB9IGZyb20gXCJAc2xhY2stYWktYXBwL2Nkay10b29saW5nXCI7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuXG4vKiogTGlmZWN5Y2xlIGNvbmZpZ3VyYXRpb24gZm9yIEFnZW50Q29yZSBSdW50aW1lIChvcHRpb25hbCkuIFNlZSByZXNlYXJjaC5tZCDCpzIuICovXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50Q29yZUxpZmVjeWNsZUNvbmZpZyB7XG4gIC8qKiBJZGxlIHNlc3Npb24gdGltZW91dCBpbiBzZWNvbmRzICg2MOKAkzI4ODAwKS4gRGVmYXVsdDogOTAwLiAqL1xuICByZWFkb25seSBpZGxlUnVudGltZVNlc3Npb25UaW1lb3V0U2Vjb25kcz86IG51bWJlcjtcbiAgLyoqIE1heCBpbnN0YW5jZSBsaWZldGltZSBpbiBzZWNvbmRzICg2MOKAkzI4ODAwKS4gRGVmYXVsdDogMjg4MDAuICovXG4gIHJlYWRvbmx5IG1heExpZmV0aW1lU2Vjb25kcz86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVQcm9wcyB7XG4gIC8qKiBOYW1lIGZvciB0aGUgQWdlbnRDb3JlIFJ1bnRpbWUgKi9cbiAgcmVhZG9ubHkgYWdlbnRSdW50aW1lTmFtZTogc3RyaW5nO1xuICAvKiogRUNSIGNvbnRhaW5lciBpbWFnZSBVUkkgKGluY2x1ZGluZyB0YWcpICovXG4gIHJlYWRvbmx5IGNvbnRhaW5lckltYWdlVXJpOiBzdHJpbmc7XG4gIC8qKiBMaWZlY3ljbGUgY29uZmlndXJhdGlvbiAob3B0aW9uYWwpLiBPbWl0IHRvIHVzZSBwbGF0Zm9ybSBkZWZhdWx0cy4gKi9cbiAgcmVhZG9ubHkgbGlmZWN5Y2xlQ29uZmlndXJhdGlvbj86IEFnZW50Q29yZUxpZmVjeWNsZUNvbmZpZztcbiAgLyoqIER5bmFtb0RCIHRhYmxlcyBmb3Igc2VjdXJpdHkgdmFsaWRhdGlvbiAqL1xuICByZWFkb25seSB0b2tlblRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIHJlYWRvbmx5IGRlZHVwZVRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIHJlYWRvbmx5IGV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICByZWFkb25seSB3aGl0ZWxpc3RDb25maWdUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICByZWFkb25seSByYXRlTGltaXRUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xuICAvKiogU2VjcmV0cyBNYW5hZ2VyIHNlY3JldHMgKi9cbiAgcmVhZG9ubHkgc2xhY2tTaWduaW5nU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuICByZWFkb25seSBzbGFja0JvdFRva2VuU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuICAvKiogTWFwIG9mIGV4ZWN1dGlvbiBhZ2VudCBJRHMgdG8gcnVudGltZSBBUk5zIChmb3IgQTJBIGludm9jYXRpb24pICovXG4gIHJlYWRvbmx5IGV4ZWN1dGlvbkFnZW50QXJucz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIC8qKiBTUVMgcXVldWUgZm9yIFNsYWNrIHBvc3QgcmVxdWVzdHM7IEFnZW50IHNlbmRzIGhlcmUgaW5zdGVhZCBvZiBjYWxsaW5nIFNsYWNrIEFQSSAqL1xuICByZWFkb25seSBzbGFja1Bvc3RSZXF1ZXN0UXVldWU/OiBzcXMuSVF1ZXVlO1xuICAvKiogQ2xvdWRXYXRjaCBMb2cgZ3JvdXAgZm9yIGV4ZWN1dGlvbiBlcnJvciBkZWJ1ZyAodHJvdWJsZXNob290aW5nKSAqL1xuICByZWFkb25seSBlcnJvckRlYnVnTG9nR3JvdXA/OiBsb2dzLklMb2dHcm91cDtcbiAgLyoqIFMzIGJ1Y2tldCBmb3IgdGVtcG9yYXJ5IGZpbGUgZXhjaGFuZ2UgYmV0d2VlbiB6b25lcyAqL1xuICByZWFkb25seSBmaWxlRXhjaGFuZ2VCdWNrZXQ/OiBzMy5JQnVja2V0O1xuICAvKiogQVJOIG9mIHRoZSBTbGFjayBTZWFyY2ggQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgKG9wdGlvbmFsKSAqL1xuICByZWFkb25seSBzbGFja1NlYXJjaEFnZW50QXJuPzogc3RyaW5nO1xuICAvKiogRHluYW1vREIgdGFibGUgZm9yIHVzYWdlIGhpc3RvcnkgbWV0YWRhdGEgKG9wdGlvbmFsKSAqL1xuICByZWFkb25seSB1c2FnZUhpc3RvcnlUYWJsZT86IGR5bmFtb2RiLklUYWJsZTtcbiAgLyoqIFMzIGJ1Y2tldCBmb3IgdXNhZ2UgaGlzdG9yeSBjb250ZW50IGFuZCBhdHRhY2htZW50cyAob3B0aW9uYWwpICovXG4gIHJlYWRvbmx5IHVzYWdlSGlzdG9yeUJ1Y2tldD86IHMzLklCdWNrZXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWUgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKiogVGhlIEFnZW50Q29yZSBSdW50aW1lIENGTiByZXNvdXJjZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcnVudGltZTogY2RrLkNmblJlc291cmNlO1xuICAvKiogQWdlbnRDb3JlIGF1dG8tY3JlYXRlcyBERUZBVUxUIGVuZHBvaW50OyB3ZSBkbyBub3QgY3JlYXRlIGl0IGluIENGbiAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZW5kcG9pbnQ6IGNkay5DZm5SZXNvdXJjZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgLyoqIFRoZSBJQU0gZXhlY3V0aW9uIHJvbGUgZm9yIHRoZSBBZ2VudENvcmUgUnVudGltZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZXhlY3V0aW9uUm9sZTogaWFtLlJvbGU7XG4gIC8qKiBUaGUgQVJOIG9mIHRoZSBBZ2VudENvcmUgUnVudGltZSAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcnVudGltZUFybjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHNjb3BlOiBDb25zdHJ1Y3QsXG4gICAgaWQ6IHN0cmluZyxcbiAgICBwcm9wczogVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lUHJvcHNcbiAgKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHN0YWNrID0gY2RrLlN0YWNrLm9mKHRoaXMpO1xuXG4gICAgLy8gQ3JlYXRlIElBTSBleGVjdXRpb24gcm9sZSBmb3IgQWdlbnRDb3JlIFJ1bnRpbWUgKHJvbGVOYW1lIHVuaXF1ZSBwZXIgYWNjb3VudDsgdXNlIHN0YWNrIG5hbWUgc28gRGV2L1Byb2QgZG8gbm90IGNvbGxpZGUpXG4gICAgLy8gVHJ1c3QgcG9saWN5OiBiZWRyb2NrLWFnZW50Y29yZS5hbWF6b25hd3MuY29tXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiRXhlY3V0aW9uUm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogYCR7c3RhY2suc3RhY2tOYW1lfS1FeGVjdXRpb25Sb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwiYmVkcm9jay1hZ2VudGNvcmUuYW1hem9uYXdzLmNvbVwiLCB7XG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgIFwiYXdzOlNvdXJjZUFjY291bnRcIjogc3RhY2suYWNjb3VudCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIEFybkxpa2U6IHtcbiAgICAgICAgICAgIFwiYXdzOlNvdXJjZUFyblwiOiBgYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZToke3N0YWNrLnJlZ2lvbn06JHtzdGFjay5hY2NvdW50fToqYCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgXCJFeGVjdXRpb24gcm9sZSBmb3IgVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIHdpdGggRHluYW1vREIsIFNlY3JldHMgTWFuYWdlciwgYW5kIEFnZW50Q29yZSBpbnZva2UgcGVybWlzc2lvbnNcIixcbiAgICB9KTtcblxuICAgIC8vIEVDUiBwZXJtaXNzaW9ucyBmb3IgY29udGFpbmVyIGltYWdlIHJldHJpZXZhbFxuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkVDUkltYWdlQWNjZXNzXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiZWNyOkJhdGNoR2V0SW1hZ2VcIixcbiAgICAgICAgICBcImVjcjpHZXREb3dubG9hZFVybEZvckxheWVyXCIsXG4gICAgICAgICAgXCJlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9ncyBwZXJtaXNzaW9uc1xuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkNsb3VkV2F0Y2hMb2dzXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwibG9nczpDcmVhdGVMb2dHcm91cFwiLFxuICAgICAgICAgIFwibG9nczpDcmVhdGVMb2dTdHJlYW1cIixcbiAgICAgICAgICBcImxvZ3M6UHV0TG9nRXZlbnRzXCIsXG4gICAgICAgICAgXCJsb2dzOkRlc2NyaWJlTG9nR3JvdXBzXCIsXG4gICAgICAgICAgXCJsb2dzOkRlc2NyaWJlTG9nU3RyZWFtc1wiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpsb2dzOiR7c3RhY2sucmVnaW9ufToke3N0YWNrLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2JlZHJvY2stYWdlbnRjb3JlLypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gWC1SYXkgdHJhY2luZyBwZXJtaXNzaW9uc1xuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIlhSYXlUcmFjaW5nXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwieHJheTpQdXRUcmFjZVNlZ21lbnRzXCIsXG4gICAgICAgICAgXCJ4cmF5OlB1dFRlbGVtZXRyeVJlY29yZHNcIixcbiAgICAgICAgICBcInhyYXk6R2V0U2FtcGxpbmdSdWxlc1wiLFxuICAgICAgICAgIFwieHJheTpHZXRTYW1wbGluZ1RhcmdldHNcIixcbiAgICAgICAgICBcInhyYXk6R2V0U2FtcGxpbmdTdGF0aXN0aWNTdW1tYXJpZXNcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBNZXRyaWNzIHBlcm1pc3Npb25zXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiQ2xvdWRXYXRjaE1ldHJpY3NcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGFcIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgIFN0cmluZ0xpa2U6IHtcbiAgICAgICAgICAgIFwiY2xvdWR3YXRjaDpuYW1lc3BhY2VcIjogW1wiU2xhY2tFdmVudEhhbmRsZXJcIiwgXCJTbGFja0FJLypcIl0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFJvdXRlciBBZ2VudCBydW5zIEJlZHJvY2sgbW9kZWwgaW5mZXJlbmNlIGZvciBhZ2VudCBzZWxlY3Rpb24uXG4gICAgdGhpcy5leGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6IFwiQmVkcm9ja0ludm9rZU1vZGVsXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFwiLFxuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbVwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7c3RhY2sucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC8qYCxcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7c3RhY2sucmVnaW9ufToke3N0YWNrLmFjY291bnR9OmluZmVyZW5jZS1wcm9maWxlLypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIDUgc2VjdXJpdHkgdGFibGVzXG4gICAgcHJvcHMudG9rZW5UYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5kZWR1cGVUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5leGlzdGVuY2VDaGVja0NhY2hlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMud2hpdGVsaXN0Q29uZmlnVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmV4ZWN1dGlvblJvbGUpOyAvLyBSZWFkLW9ubHkgZm9yIHNlY3VyaXR5XG4gICAgcHJvcHMucmF0ZUxpbWl0VGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBTZWNyZXRzIE1hbmFnZXIgcGVybWlzc2lvbnNcbiAgICBwcm9wcy5zbGFja1NpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2xhY2tCb3RUb2tlblNlY3JldC5ncmFudFJlYWQodGhpcy5leGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIFdoaXRlbGlzdCBjb25maWcgc2VjcmV0IHBlcm1pc3Npb25cbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJTZWNyZXRzTWFuYWdlcldoaXRlbGlzdFwiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcInNlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke3N0YWNrLnJlZ2lvbn06JHtzdGFjay5hY2NvdW50fTpzZWNyZXQ6JHtzdGFjay5zdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWcqYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEFnZW50Q29yZSBJbnZva2VBZ2VudFJ1bnRpbWUgcGVybWlzc2lvbiAoZm9yIGNhbGxpbmcgRXhlY3V0aW9uIEFnZW50KS5cbiAgICAvLyBBV1MgcmVxdWlyZXMgaWRlbnRpdHktYmFzZWQgcG9saWN5IHRvIGFsbG93IHRoZSBhY3Rpb24gb24gQk9USCB0aGUgYWdlbnQgcnVudGltZSBhbmRcbiAgICAvLyB0aGUgYWdlbnQgZW5kcG9pbnQgKHNlZSByZXNvdXJjZS1iYXNlZC1wb2xpY2llcy5odG1sIFwiSGllcmFyY2hpY2FsIGF1dGhvcml6YXRpb25cIikuXG4gICAgLy8gSW5jbHVkZSBib3RoIGVuZHBvaW50IEFSTiBmb3JtczogLi4uOnJ1bnRpbWUtZW5kcG9pbnQvTmFtZS9ERUZBVUxUIGFuZFxuICAgIC8vIC4uLjpydW50aW1lL05hbWUvcnVudGltZS1lbmRwb2ludC9ERUZBVUxUIChsYXR0ZXIgaXMgdXNlZCBhdCBldmFsdWF0aW9uIHBlciBBY2Nlc3NEZW5pZWQgbWVzc2FnZSkuXG4gICAgY29uc3QgdGFyZ2V0QWdlbnRBcm5zID0gW1xuICAgICAgLi4uT2JqZWN0LnZhbHVlcyhwcm9wcy5leGVjdXRpb25BZ2VudEFybnMgfHwge30pLFxuICAgICAgLi4uKHByb3BzLnNsYWNrU2VhcmNoQWdlbnRBcm4gPyBbcHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybl0gOiBbXSksXG4gICAgXS5maWx0ZXIoKGFybik6IGFybiBpcyBzdHJpbmcgPT4gQm9vbGVhbihhcm4pKTtcbiAgICBjb25zdCBpbnZva2VSZXNvdXJjZXMgPSB0YXJnZXRBZ2VudEFybnMubGVuZ3RoXG4gICAgICA/IHRhcmdldEFnZW50QXJucy5mbGF0TWFwKChydW50aW1lQXJuKSA9PiB7XG4gICAgICAgICAgY29uc3QgZW5kcG9pbnRBcm5Eb2MgPVxuICAgICAgICAgICAgcnVudGltZUFybi5yZXBsYWNlKC86cnVudGltZVxcLy8sIFwiOnJ1bnRpbWUtZW5kcG9pbnQvXCIpICsgXCIvREVGQVVMVFwiO1xuICAgICAgICAgIGNvbnN0IGVuZHBvaW50QXJuQWx0ID0gYCR7cnVudGltZUFybn0vcnVudGltZS1lbmRwb2ludC9ERUZBVUxUYDtcbiAgICAgICAgICByZXR1cm4gW3J1bnRpbWVBcm4sIGVuZHBvaW50QXJuRG9jLCBlbmRwb2ludEFybkFsdF07XG4gICAgICAgIH0pXG4gICAgICA6IFtgYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZToke3N0YWNrLnJlZ2lvbn06KjpydW50aW1lLypgXTtcbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJBZ2VudENvcmVJbnZva2VcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIixcbiAgICAgICAgICBcImJlZHJvY2stYWdlbnRjb3JlOkdldEFzeW5jVGFza1Jlc3VsdFwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IGludm9rZVJlc291cmNlcyxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZUFnZW50UnVudGltZSBlbnZpcm9ubWVudFZhcmlhYmxlczogXCJFbnZpcm9ubWVudCB2YXJpYWJsZXMgdG8gc2V0IGluIHRoZSBBZ2VudENvcmUgUnVudGltZSBlbnZpcm9ubWVudFwiXG4gICAgLy8gaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2JlZHJvY2stYWdlbnRjb3JlLWNvbnRyb2wvbGF0ZXN0L0FQSVJlZmVyZW5jZS9BUElfQ3JlYXRlQWdlbnRSdW50aW1lLmh0bWxcbiAgICBjb25zdCBlbnZpcm9ubWVudFZhcmlhYmxlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgIEFXU19SRUdJT05fTkFNRTogc3RhY2sucmVnaW9uLFxuICAgICAgREVEVVBFX1RBQkxFX05BTUU6IHByb3BzLmRlZHVwZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIFdISVRFTElTVF9UQUJMRV9OQU1FOiBwcm9wcy53aGl0ZWxpc3RDb25maWdUYWJsZS50YWJsZU5hbWUsXG4gICAgICBXSElURUxJU1RfU0VDUkVUX05BTUU6IGAke3N0YWNrLnN0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ2AsXG4gICAgICBSQVRFX0xJTUlUX1RBQkxFX05BTUU6IHByb3BzLnJhdGVMaW1pdFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIEVYSVNURU5DRV9DSEVDS19DQUNIRV9UQUJMRTogcHJvcHMuZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIFJBVEVfTElNSVRfUEVSX01JTlVURTogXCIxMFwiLFxuICAgICAgRU5BQkxFX0FHRU5UX0NBUkRfRElTQ09WRVJZOiBcImZhbHNlXCIsXG4gICAgICBNQVhfQUdFTlRfVFVSTlM6IFwiNVwiLFxuICAgIH07XG4gICAgY29uc3QgZXhlY3V0aW9uQWdlbnRBcm5zTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgLi4uKHByb3BzLmV4ZWN1dGlvbkFnZW50QXJucyB8fCB7fSksXG4gICAgfTtcbiAgICAvLyBCYWNrd2FyZCBjb21wYXRpYmlsaXR5IGZvciBvbGRlciBrZXkgd2hpbGUgcm91dGluZyBkZWZhdWx0IGFnZW50IGlzIGZpbGUtY3JlYXRvci5cbiAgICBpZiAoXG4gICAgICBleGVjdXRpb25BZ2VudEFybnNNYXAuZ2VuZXJhbCAmJlxuICAgICAgIWV4ZWN1dGlvbkFnZW50QXJuc01hcFtcImZpbGUtY3JlYXRvclwiXVxuICAgICkge1xuICAgICAgZXhlY3V0aW9uQWdlbnRBcm5zTWFwW1wiZmlsZS1jcmVhdG9yXCJdID0gZXhlY3V0aW9uQWdlbnRBcm5zTWFwLmdlbmVyYWw7XG4gICAgICBkZWxldGUgZXhlY3V0aW9uQWdlbnRBcm5zTWFwLmdlbmVyYWw7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGVjdXRpb25BZ2VudEFybnNNYXApLmxlbmd0aCA+IDApIHtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLkVYRUNVVElPTl9BR0VOVF9BUk5TID0gSlNPTi5zdHJpbmdpZnkoXG4gICAgICAgIGV4ZWN1dGlvbkFnZW50QXJuc01hcFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHByb3BzLnNsYWNrUG9zdFJlcXVlc3RRdWV1ZSkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuU0xBQ0tfUE9TVF9SRVFVRVNUX1FVRVVFX1VSTCA9XG4gICAgICAgIHByb3BzLnNsYWNrUG9zdFJlcXVlc3RRdWV1ZS5xdWV1ZVVybDtcbiAgICAgIHByb3BzLnNsYWNrUG9zdFJlcXVlc3RRdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyh0aGlzLmV4ZWN1dGlvblJvbGUpO1xuICAgIH1cbiAgICBpZiAocHJvcHMuZXJyb3JEZWJ1Z0xvZ0dyb3VwKSB7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5FWEVDVVRJT05fQUdFTlRfRVJST1JfTE9HX0dST1VQID1cbiAgICAgICAgcHJvcHMuZXJyb3JEZWJ1Z0xvZ0dyb3VwLmxvZ0dyb3VwTmFtZTtcbiAgICAgIHByb3BzLmVycm9yRGVidWdMb2dHcm91cC5ncmFudFdyaXRlKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuICAgIGlmIChwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQpIHtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLkZJTEVfRVhDSEFOR0VfQlVDS0VUID1cbiAgICAgICAgcHJvcHMuZmlsZUV4Y2hhbmdlQnVja2V0LmJ1Y2tldE5hbWU7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5GSUxFX0VYQ0hBTkdFX1BSRUZJWCA9IFwiYXR0YWNobWVudHMvXCI7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5QUkVTSUdORURfVVJMX0VYUElSWSA9IFwiOTAwXCI7XG4gICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodGhpcy5leGVjdXRpb25Sb2xlLCBcImF0dGFjaG1lbnRzLypcIik7XG4gICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuZ3JhbnREZWxldGUodGhpcy5leGVjdXRpb25Sb2xlLCBcImF0dGFjaG1lbnRzLypcIik7XG4gICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodGhpcy5leGVjdXRpb25Sb2xlLCBcImdlbmVyYXRlZF9maWxlcy8qXCIpO1xuICAgIH1cbiAgICBpZiAocHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybikge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuU0xBQ0tfU0VBUkNIX0FHRU5UX0FSTiA9IHByb3BzLnNsYWNrU2VhcmNoQWdlbnRBcm47XG4gICAgfVxuICAgIGlmIChwcm9wcy51c2FnZUhpc3RvcnlUYWJsZSkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuVVNBR0VfSElTVE9SWV9UQUJMRV9OQU1FID1cbiAgICAgICAgcHJvcHMudXNhZ2VIaXN0b3J5VGFibGUudGFibGVOYW1lO1xuICAgICAgcHJvcHMudXNhZ2VIaXN0b3J5VGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICB9XG4gICAgaWYgKHByb3BzLnVzYWdlSGlzdG9yeUJ1Y2tldCkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuVVNBR0VfSElTVE9SWV9CVUNLRVRfTkFNRSA9XG4gICAgICAgIHByb3BzLnVzYWdlSGlzdG9yeUJ1Y2tldC5idWNrZXROYW1lO1xuICAgICAgcHJvcHMudXNhZ2VIaXN0b3J5QnVja2V0LmdyYW50UHV0KHRoaXMuZXhlY3V0aW9uUm9sZSwgXCJjb250ZW50LypcIik7XG4gICAgICBwcm9wcy51c2FnZUhpc3RvcnlCdWNrZXQuZ3JhbnRQdXQodGhpcy5leGVjdXRpb25Sb2xlLCBcImF0dGFjaG1lbnRzLypcIik7XG4gICAgfVxuXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgdGhpcy5leGVjdXRpb25Sb2xlLFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTVcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIkVDUiBHZXRBdXRob3JpemF0aW9uVG9rZW4gcmVxdWlyZXMgcmVzb3VyY2U6KiAoQVdTIHNlcnZpY2UgY29uc3RyYWludCwgY2Fubm90IGJlIHNjb3BlZCB0byBhIHJlcG8gQVJOKS4gXCIgK1xuICAgICAgICAgICAgXCJYLVJheSB0cmFjZSBhbmQgc2FtcGxpbmcgQVBJcyBkbyBub3Qgc3VwcG9ydCByZXNvdXJjZS1sZXZlbCByZXN0cmljdGlvbnMuIFwiICtcbiAgICAgICAgICAgIFwiQ2xvdWRXYXRjaCBQdXRNZXRyaWNEYXRhIHJlcXVpcmVzIHJlc291cmNlOiogKG5hbWVzcGFjZSBzY29wZWQgdmlhIGNvbmRpdGlvbiBrZXkpLiBcIiArXG4gICAgICAgICAgICBcIkNsb3VkV2F0Y2ggTG9ncyBzY29wZWQgdG8gL2F3cy9iZWRyb2NrLWFnZW50Y29yZS8gcHJlZml4LiBcIiArXG4gICAgICAgICAgICBcIkJlZHJvY2sgdXNlcyBmb3VuZGF0aW9uLW1vZGVsLyogYW5kIGluZmVyZW5jZS1wcm9maWxlLyogQVJOIHBhdHRlcm5zIChBV1MgQVJOIHNjaGVtYSwgdmVyc2lvbiB3aWxkY2FyZCkuIFwiICtcbiAgICAgICAgICAgIFwiQWdlbnRDb3JlIEludm9rZUFnZW50UnVudGltZSB1c2VzIHJ1bnRpbWUtc3BlY2lmaWMgQVJOcyB3aGVuIGV4ZWN1dGlvbkFnZW50QXJucyBhcmUgcHJvdmlkZWQ7IFwiICtcbiAgICAgICAgICAgIFwiZmFsbGJhY2sgYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZTpyZWdpb246KjpydW50aW1lLyogaXMgdXNlZCBvbmx5IHdoZW4gbm8gQVJOcyBhcmUgY29uZmlndXJlZCBhdCBkZXBsb3kgdGltZS5cIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0cnVlLFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgQWdlbnRDb3JlIFJ1bnRpbWUgdXNpbmcgTDEgQ2ZuUmVzb3VyY2VcbiAgICB0aGlzLnJ1bnRpbWUgPSBuZXcgY2RrLkNmblJlc291cmNlKHRoaXMsIFwiUnVudGltZVwiLCB7XG4gICAgICB0eXBlOiBcIkFXUzo6QmVkcm9ja0FnZW50Q29yZTo6UnVudGltZVwiLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBBZ2VudFJ1bnRpbWVOYW1lOiBwcm9wcy5hZ2VudFJ1bnRpbWVOYW1lLFxuICAgICAgICBSb2xlQXJuOiB0aGlzLmV4ZWN1dGlvblJvbGUucm9sZUFybixcbiAgICAgICAgUHJvdG9jb2xDb25maWd1cmF0aW9uOiBcIkEyQVwiLFxuICAgICAgICBBZ2VudFJ1bnRpbWVBcnRpZmFjdDoge1xuICAgICAgICAgIENvbnRhaW5lckNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICAgIENvbnRhaW5lclVyaTogcHJvcHMuY29udGFpbmVySW1hZ2VVcmksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgTmV0d29ya0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBOZXR3b3JrTW9kZTogXCJQVUJMSUNcIixcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8gTDEgQ2ZuUmVzb3VyY2UgZG9lcyBub3QgcmVjZWl2ZSBzdGFjay1sZXZlbCBUYWdzIGZyb20gQ0RLIGFzcGVjdDsgc2V0IGV4cGxpY2l0bHkgZm9yIGNvc3QgYWxsb2NhdGlvblxuICAgIGNvbnN0IGRlcGxveW1lbnRFbnYgPVxuICAgICAgKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiKSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpID8/XG4gICAgICBwcm9jZXNzLmVudi5ERVBMT1lNRU5UX0VOViA/P1xuICAgICAgXCJkZXZcIjtcbiAgICB0aGlzLnJ1bnRpbWUuYWRkUHJvcGVydHlPdmVycmlkZShcbiAgICAgIFwiVGFnc1wiLFxuICAgICAgZ2V0Q29zdEFsbG9jYXRpb25UYWdWYWx1ZXMoe1xuICAgICAgICBkZXBsb3ltZW50RW52OiBTdHJpbmcoZGVwbG95bWVudEVudikudG9Mb3dlckNhc2UoKS50cmltKCksXG4gICAgICAgIHN0YWNrTmFtZTogc3RhY2suc3RhY2tOYW1lLFxuICAgICAgfSlcbiAgICApO1xuICAgIGlmIChwcm9wcy5saWZlY3ljbGVDb25maWd1cmF0aW9uKSB7XG4gICAgICBjb25zdCBsYyA9IHByb3BzLmxpZmVjeWNsZUNvbmZpZ3VyYXRpb247XG4gICAgICBjb25zdCBpZGxlID0gbGMuaWRsZVJ1bnRpbWVTZXNzaW9uVGltZW91dFNlY29uZHMgPz8gOTAwO1xuICAgICAgY29uc3QgbWF4THQgPSBsYy5tYXhMaWZldGltZVNlY29uZHMgPz8gMjg4MDA7XG4gICAgICB0aGlzLnJ1bnRpbWUuYWRkUHJvcGVydHlPdmVycmlkZShcIkxpZmVjeWNsZUNvbmZpZ3VyYXRpb25cIiwge1xuICAgICAgICBJZGxlUnVudGltZVNlc3Npb25UaW1lb3V0OiBNYXRoLm1heCg2MCwgTWF0aC5taW4oMjg4MDAsIGlkbGUpKSxcbiAgICAgICAgTWF4TGlmZXRpbWU6IE1hdGgubWF4KDYwLCBNYXRoLm1pbigyODgwMCwgbWF4THQpKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBFbnZpcm9ubWVudFZhcmlhYmxlcyAoc3RyaW5nLXRvLXN0cmluZyBtYXApIGFyZSBpbiBDcmVhdGVBZ2VudFJ1bnRpbWUgQVBJIGJ1dCBub3QgaW4gQ0RLIEwxIHNjaGVtYTsgYXBwbGllZCBhdCBkZXBsb3kgdGltZVxuICAgIHRoaXMucnVudGltZS5hZGRQcm9wZXJ0eU92ZXJyaWRlKFwiRW52aXJvbm1lbnRWYXJpYWJsZXNcIiwgZW52aXJvbm1lbnRWYXJpYWJsZXMpO1xuXG4gICAgY29uc3QgZGVmYXVsdFBvbGljeSA9IHRoaXMuZXhlY3V0aW9uUm9sZS5ub2RlLnRyeUZpbmRDaGlsZChcIkRlZmF1bHRQb2xpY3lcIik7XG4gICAgY29uc3QgcG9saWN5Q2ZuID0gZGVmYXVsdFBvbGljeT8ubm9kZS5kZWZhdWx0Q2hpbGQ7XG4gICAgaWYgKHBvbGljeUNmbiAmJiBjZGsuQ2ZuUmVzb3VyY2UuaXNDZm5SZXNvdXJjZShwb2xpY3lDZm4pKSB7XG4gICAgICB0aGlzLnJ1bnRpbWUuYWRkRGVwZW5kZW5jeShwb2xpY3lDZm4pO1xuICAgIH1cblxuICAgIC8vIERlcml2ZSBBUk4gZnJvbSB0aGUgcnVudGltZVxuICAgIHRoaXMucnVudGltZUFybiA9IHRoaXMucnVudGltZS5nZXRBdHQoXCJBZ2VudFJ1bnRpbWVBcm5cIikudG9TdHJpbmcoKTtcblxuICAgIC8vIERvIE5PVCBjcmVhdGUgUnVudGltZUVuZHBvaW50IGluIENGbjogQWdlbnRDb3JlIGF1dG8tY3JlYXRlcyBERUZBVUxUICh3b3VsZCBjb25mbGljdCkuXG4gICAgdGhpcy5lbmRwb2ludCA9IHVuZGVmaW5lZDtcbiAgfVxufVxuIl19