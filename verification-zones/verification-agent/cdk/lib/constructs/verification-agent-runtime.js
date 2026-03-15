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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tYWdlbnQtcnVudGltZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7OztHQWVHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMseURBQTJDO0FBTTNDLDJDQUF1QztBQUN2QywyREFBdUU7QUFzQ3ZFLE1BQWEsd0JBQXlCLFNBQVEsc0JBQVM7SUFDckQseUNBQXlDO0lBQ3pCLE9BQU8sQ0FBa0I7SUFDekMsMEVBQTBFO0lBQzFELFFBQVEsR0FBZ0MsU0FBUyxDQUFDO0lBQ2xFLHVEQUF1RDtJQUN2QyxhQUFhLENBQVc7SUFDeEMsdUNBQXVDO0lBQ3ZCLFVBQVUsQ0FBUztJQUVuQyxZQUNFLEtBQWdCLEVBQ2hCLEVBQVUsRUFDVixLQUFvQztRQUVwQyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWpDLDJIQUEySDtRQUMzSCxnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2RCxRQUFRLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyxnQkFBZ0I7WUFDNUMsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLGlDQUFpQyxFQUFFO2dCQUNyRSxVQUFVLEVBQUU7b0JBQ1YsWUFBWSxFQUFFO3dCQUNaLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxPQUFPO3FCQUNuQztvQkFDRCxPQUFPLEVBQUU7d0JBQ1AsZUFBZSxFQUFFLDZCQUE2QixLQUFLLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUk7cUJB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TSxDQUFDLGlCQUFpQixDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFcEUseUZBQXlGO1FBQ3pGLElBQUksQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDO0lBQzVCLENBQUM7Q0FDRjtBQTlRRCw0REE4UUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFZlcmlmaWNhdGlvbiBBZ2VudCBBZ2VudENvcmUgUnVudGltZSBjb25zdHJ1Y3QuXG4gKlxuICogUHVycG9zZTogQ3JlYXRlIGFuIEFtYXpvbiBCZWRyb2NrIEFnZW50Q29yZSBSdW50aW1lIChBMkEgcHJvdG9jb2wpIGZvciB0aGUgVmVyaWZpY2F0aW9uIEFnZW50LlxuICogSW52b2tlcyBFeGVjdXRpb24gQWdlbnQgdmlhIEEyQTsgcmVjZWl2ZXMgU2xhY2sgZXZlbnRzIGZyb20gU2xhY2tFdmVudEhhbmRsZXIgKG9yIEFnZW50SW52b2tlcikuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogQ3JlYXRlIFJ1bnRpbWUgQ0ZOIHJlc291cmNlLCBJQU0gcm9sZSwgZ3JhbnQgRHluYW1vREIvU2VjcmV0cy9TMy9TUVM7IG9wdGlvbmFsXG4gKiBlcnJvciBkZWJ1ZyBsb2cgZ3JvdXAgYW5kIGZpbGUtZXhjaGFuZ2UgYnVja2V0LiBBMkEgY29udGFpbmVyIHBvcnQgOTAwMCwgQVJNNjQuXG4gKlxuICogSW5wdXRzOiBWZXJpZmljYXRpb25BZ2VudFJ1bnRpbWVQcm9wcyAoYWdlbnRSdW50aW1lTmFtZSwgY29udGFpbmVySW1hZ2VVcmksIER5bmFtb0RCIHRhYmxlcyxcbiAqIHNlY3JldHMsIGV4ZWN1dGlvbkFnZW50QXJucywgb3B0aW9uYWwgc2xhY2tQb3N0UmVxdWVzdFF1ZXVlLCBlcnJvckRlYnVnTG9nR3JvdXAsIGZpbGVFeGNoYW5nZUJ1Y2tldCkuXG4gKlxuICogT3V0cHV0czogcnVudGltZSwgZXhlY3V0aW9uUm9sZSwgcnVudGltZUFybiAodmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lQXJuKS5cbiAqXG4gKiBAbW9kdWxlIGNkay9saWIvdmVyaWZpY2F0aW9uL2NvbnN0cnVjdHMvdmVyaWZpY2F0aW9uLWFnZW50LXJ1bnRpbWVcbiAqL1xuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sb2dzXCI7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zcXNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBnZXRDb3N0QWxsb2NhdGlvblRhZ1ZhbHVlcyB9IGZyb20gXCJAc2xhY2stYWktYXBwL2Nkay10b29saW5nXCI7XG5cbi8qKiBMaWZlY3ljbGUgY29uZmlndXJhdGlvbiBmb3IgQWdlbnRDb3JlIFJ1bnRpbWUgKG9wdGlvbmFsKS4gU2VlIHJlc2VhcmNoLm1kIMKnMi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQWdlbnRDb3JlTGlmZWN5Y2xlQ29uZmlnIHtcbiAgLyoqIElkbGUgc2Vzc2lvbiB0aW1lb3V0IGluIHNlY29uZHMgKDYw4oCTMjg4MDApLiBEZWZhdWx0OiA5MDAuICovXG4gIHJlYWRvbmx5IGlkbGVSdW50aW1lU2Vzc2lvblRpbWVvdXRTZWNvbmRzPzogbnVtYmVyO1xuICAvKiogTWF4IGluc3RhbmNlIGxpZmV0aW1lIGluIHNlY29uZHMgKDYw4oCTMjg4MDApLiBEZWZhdWx0OiAyODgwMC4gKi9cbiAgcmVhZG9ubHkgbWF4TGlmZXRpbWVTZWNvbmRzPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZlcmlmaWNhdGlvbkFnZW50UnVudGltZVByb3BzIHtcbiAgLyoqIE5hbWUgZm9yIHRoZSBBZ2VudENvcmUgUnVudGltZSAqL1xuICByZWFkb25seSBhZ2VudFJ1bnRpbWVOYW1lOiBzdHJpbmc7XG4gIC8qKiBFQ1IgY29udGFpbmVyIGltYWdlIFVSSSAoaW5jbHVkaW5nIHRhZykgKi9cbiAgcmVhZG9ubHkgY29udGFpbmVySW1hZ2VVcmk6IHN0cmluZztcbiAgLyoqIExpZmVjeWNsZSBjb25maWd1cmF0aW9uIChvcHRpb25hbCkuIE9taXQgdG8gdXNlIHBsYXRmb3JtIGRlZmF1bHRzLiAqL1xuICByZWFkb25seSBsaWZlY3ljbGVDb25maWd1cmF0aW9uPzogQWdlbnRDb3JlTGlmZWN5Y2xlQ29uZmlnO1xuICAvKiogRHluYW1vREIgdGFibGVzIGZvciBzZWN1cml0eSB2YWxpZGF0aW9uICovXG4gIHJlYWRvbmx5IHRva2VuVGFibGU6IGR5bmFtb2RiLklUYWJsZTtcbiAgcmVhZG9ubHkgZGVkdXBlVGFibGU6IGR5bmFtb2RiLklUYWJsZTtcbiAgcmVhZG9ubHkgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIHJlYWRvbmx5IHdoaXRlbGlzdENvbmZpZ1RhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIHJlYWRvbmx5IHJhdGVMaW1pdFRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIC8qKiBTZWNyZXRzIE1hbmFnZXIgc2VjcmV0cyAqL1xuICByZWFkb25seSBzbGFja1NpZ25pbmdTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG4gIHJlYWRvbmx5IHNsYWNrQm90VG9rZW5TZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG4gIC8qKiBNYXAgb2YgZXhlY3V0aW9uIGFnZW50IElEcyB0byBydW50aW1lIEFSTnMgKGZvciBBMkEgaW52b2NhdGlvbikgKi9cbiAgcmVhZG9ubHkgZXhlY3V0aW9uQWdlbnRBcm5zPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgLyoqIDAxOTogU1FTIHF1ZXVlIGZvciBTbGFjayBwb3N0IHJlcXVlc3RzOyBBZ2VudCBzZW5kcyBoZXJlIGluc3RlYWQgb2YgY2FsbGluZyBTbGFjayBBUEkgKi9cbiAgcmVhZG9ubHkgc2xhY2tQb3N0UmVxdWVzdFF1ZXVlPzogc3FzLklRdWV1ZTtcbiAgLyoqIENsb3VkV2F0Y2ggTG9nIGdyb3VwIGZvciBleGVjdXRpb24gZXJyb3IgZGVidWcgKHRyb3VibGVzaG9vdGluZykgKi9cbiAgcmVhZG9ubHkgZXJyb3JEZWJ1Z0xvZ0dyb3VwPzogbG9ncy5JTG9nR3JvdXA7XG4gIC8qKiBTMyBidWNrZXQgZm9yIHRlbXBvcmFyeSBmaWxlIGV4Y2hhbmdlIGJldHdlZW4gem9uZXMgKDAyNCkgKi9cbiAgcmVhZG9ubHkgZmlsZUV4Y2hhbmdlQnVja2V0PzogczMuSUJ1Y2tldDtcbiAgLyoqIEFSTiBvZiB0aGUgU2xhY2sgU2VhcmNoIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIChvcHRpb25hbDsgMDM4KSAqL1xuICByZWFkb25seSBzbGFja1NlYXJjaEFnZW50QXJuPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVmVyaWZpY2F0aW9uQWdlbnRSdW50aW1lIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqIFRoZSBBZ2VudENvcmUgUnVudGltZSBDRk4gcmVzb3VyY2UgKi9cbiAgcHVibGljIHJlYWRvbmx5IHJ1bnRpbWU6IGNkay5DZm5SZXNvdXJjZTtcbiAgLyoqIEFnZW50Q29yZSBhdXRvLWNyZWF0ZXMgREVGQVVMVCBlbmRwb2ludDsgd2UgZG8gbm90IGNyZWF0ZSBpdCBpbiBDRm4gKi9cbiAgcHVibGljIHJlYWRvbmx5IGVuZHBvaW50OiBjZGsuQ2ZuUmVzb3VyY2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gIC8qKiBUaGUgSUFNIGV4ZWN1dGlvbiByb2xlIGZvciB0aGUgQWdlbnRDb3JlIFJ1bnRpbWUgKi9cbiAgcHVibGljIHJlYWRvbmx5IGV4ZWN1dGlvblJvbGU6IGlhbS5Sb2xlO1xuICAvKiogVGhlIEFSTiBvZiB0aGUgQWdlbnRDb3JlIFJ1bnRpbWUgKi9cbiAgcHVibGljIHJlYWRvbmx5IHJ1bnRpbWVBcm46IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihcbiAgICBzY29wZTogQ29uc3RydWN0LFxuICAgIGlkOiBzdHJpbmcsXG4gICAgcHJvcHM6IFZlcmlmaWNhdGlvbkFnZW50UnVudGltZVByb3BzXG4gICkge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBzdGFjayA9IGNkay5TdGFjay5vZih0aGlzKTtcblxuICAgIC8vIENyZWF0ZSBJQU0gZXhlY3V0aW9uIHJvbGUgZm9yIEFnZW50Q29yZSBSdW50aW1lIChyb2xlTmFtZSB1bmlxdWUgcGVyIGFjY291bnQ7IHVzZSBzdGFjayBuYW1lIHNvIERldi9Qcm9kIGRvIG5vdCBjb2xsaWRlKVxuICAgIC8vIFRydXN0IHBvbGljeTogYmVkcm9jay1hZ2VudGNvcmUuYW1hem9uYXdzLmNvbVxuICAgIHRoaXMuZXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIkV4ZWN1dGlvblJvbGVcIiwge1xuICAgICAgcm9sZU5hbWU6IGAke3N0YWNrLnN0YWNrTmFtZX0tRXhlY3V0aW9uUm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImJlZHJvY2stYWdlbnRjb3JlLmFtYXpvbmF3cy5jb21cIiwge1xuICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImF3czpTb3VyY2VBY2NvdW50XCI6IHN0YWNrLmFjY291bnQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBBcm5MaWtlOiB7XG4gICAgICAgICAgICBcImF3czpTb3VyY2VBcm5cIjogYGFybjphd3M6YmVkcm9jay1hZ2VudGNvcmU6JHtzdGFjay5yZWdpb259OiR7c3RhY2suYWNjb3VudH06KmAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgIFwiRXhlY3V0aW9uIHJvbGUgZm9yIFZlcmlmaWNhdGlvbiBBZ2VudCBBZ2VudENvcmUgUnVudGltZSB3aXRoIER5bmFtb0RCLCBTZWNyZXRzIE1hbmFnZXIsIGFuZCBBZ2VudENvcmUgaW52b2tlIHBlcm1pc3Npb25zXCIsXG4gICAgfSk7XG5cbiAgICAvLyBFQ1IgcGVybWlzc2lvbnMgZm9yIGNvbnRhaW5lciBpbWFnZSByZXRyaWV2YWxcbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJFQ1JJbWFnZUFjY2Vzc1wiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImVjcjpCYXRjaEdldEltYWdlXCIsXG4gICAgICAgICAgXCJlY3I6R2V0RG93bmxvYWRVcmxGb3JMYXllclwiLFxuICAgICAgICAgIFwiZWNyOkdldEF1dGhvcml6YXRpb25Ub2tlblwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIExvZ3MgcGVybWlzc2lvbnNcbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJDbG91ZFdhdGNoTG9nc1wiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImxvZ3M6Q3JlYXRlTG9nR3JvdXBcIixcbiAgICAgICAgICBcImxvZ3M6Q3JlYXRlTG9nU3RyZWFtXCIsXG4gICAgICAgICAgXCJsb2dzOlB1dExvZ0V2ZW50c1wiLFxuICAgICAgICAgIFwibG9nczpEZXNjcmliZUxvZ0dyb3Vwc1wiLFxuICAgICAgICAgIFwibG9nczpEZXNjcmliZUxvZ1N0cmVhbXNcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6bG9nczoke3N0YWNrLnJlZ2lvbn06JHtzdGFjay5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9iZWRyb2NrLWFnZW50Y29yZS8qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFgtUmF5IHRyYWNpbmcgcGVybWlzc2lvbnNcbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJYUmF5VHJhY2luZ1wiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcInhyYXk6UHV0VHJhY2VTZWdtZW50c1wiLFxuICAgICAgICAgIFwieHJheTpQdXRUZWxlbWV0cnlSZWNvcmRzXCIsXG4gICAgICAgICAgXCJ4cmF5OkdldFNhbXBsaW5nUnVsZXNcIixcbiAgICAgICAgICBcInhyYXk6R2V0U2FtcGxpbmdUYXJnZXRzXCIsXG4gICAgICAgICAgXCJ4cmF5OkdldFNhbXBsaW5nU3RhdGlzdGljU3VtbWFyaWVzXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTWV0cmljcyBwZXJtaXNzaW9uc1xuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkNsb3VkV2F0Y2hNZXRyaWNzXCIsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdMaWtlOiB7XG4gICAgICAgICAgICBcImNsb3Vkd2F0Y2g6bmFtZXNwYWNlXCI6IFtcIlNsYWNrRXZlbnRIYW5kbGVyXCIsIFwiU2xhY2tBSS8qXCJdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBSb3V0ZXIgQWdlbnQgcnVucyBCZWRyb2NrIG1vZGVsIGluZmVyZW5jZSBmb3IgYWdlbnQgc2VsZWN0aW9uLlxuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiBcIkJlZHJvY2tJbnZva2VNb2RlbFwiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxcIixcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW1cIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIDUgc2VjdXJpdHkgdGFibGVzXG4gICAgcHJvcHMudG9rZW5UYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5kZWR1cGVUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5leGlzdGVuY2VDaGVja0NhY2hlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMud2hpdGVsaXN0Q29uZmlnVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmV4ZWN1dGlvblJvbGUpOyAvLyBSZWFkLW9ubHkgZm9yIHNlY3VyaXR5XG4gICAgcHJvcHMucmF0ZUxpbWl0VGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBTZWNyZXRzIE1hbmFnZXIgcGVybWlzc2lvbnNcbiAgICBwcm9wcy5zbGFja1NpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2xhY2tCb3RUb2tlblNlY3JldC5ncmFudFJlYWQodGhpcy5leGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIFdoaXRlbGlzdCBjb25maWcgc2VjcmV0IHBlcm1pc3Npb25cbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJTZWNyZXRzTWFuYWdlcldoaXRlbGlzdFwiLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcInNlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke3N0YWNrLnJlZ2lvbn06JHtzdGFjay5hY2NvdW50fTpzZWNyZXQ6JHtzdGFjay5zdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWcqYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEFnZW50Q29yZSBJbnZva2VBZ2VudFJ1bnRpbWUgcGVybWlzc2lvbiAoZm9yIGNhbGxpbmcgRXhlY3V0aW9uIEFnZW50KS5cbiAgICAvLyBBV1MgcmVxdWlyZXMgaWRlbnRpdHktYmFzZWQgcG9saWN5IHRvIGFsbG93IHRoZSBhY3Rpb24gb24gQk9USCB0aGUgYWdlbnQgcnVudGltZSBhbmRcbiAgICAvLyB0aGUgYWdlbnQgZW5kcG9pbnQgKHNlZSByZXNvdXJjZS1iYXNlZC1wb2xpY2llcy5odG1sIFwiSGllcmFyY2hpY2FsIGF1dGhvcml6YXRpb25cIikuXG4gICAgLy8gSW5jbHVkZSBib3RoIGVuZHBvaW50IEFSTiBmb3JtczogLi4uOnJ1bnRpbWUtZW5kcG9pbnQvTmFtZS9ERUZBVUxUIGFuZFxuICAgIC8vIC4uLjpydW50aW1lL05hbWUvcnVudGltZS1lbmRwb2ludC9ERUZBVUxUIChsYXR0ZXIgaXMgdXNlZCBhdCBldmFsdWF0aW9uIHBlciBBY2Nlc3NEZW5pZWQgbWVzc2FnZSkuXG4gICAgY29uc3QgdGFyZ2V0QWdlbnRBcm5zID0gW1xuICAgICAgLi4uT2JqZWN0LnZhbHVlcyhwcm9wcy5leGVjdXRpb25BZ2VudEFybnMgfHwge30pLFxuICAgICAgLi4uKHByb3BzLnNsYWNrU2VhcmNoQWdlbnRBcm4gPyBbcHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybl0gOiBbXSksXG4gICAgXS5maWx0ZXIoKGFybik6IGFybiBpcyBzdHJpbmcgPT4gQm9vbGVhbihhcm4pKTtcbiAgICBjb25zdCBpbnZva2VSZXNvdXJjZXMgPSB0YXJnZXRBZ2VudEFybnMubGVuZ3RoXG4gICAgICA/IHRhcmdldEFnZW50QXJucy5mbGF0TWFwKChydW50aW1lQXJuKSA9PiB7XG4gICAgICAgICAgY29uc3QgZW5kcG9pbnRBcm5Eb2MgPVxuICAgICAgICAgICAgcnVudGltZUFybi5yZXBsYWNlKC86cnVudGltZVxcLy8sIFwiOnJ1bnRpbWUtZW5kcG9pbnQvXCIpICsgXCIvREVGQVVMVFwiO1xuICAgICAgICAgIGNvbnN0IGVuZHBvaW50QXJuQWx0ID0gYCR7cnVudGltZUFybn0vcnVudGltZS1lbmRwb2ludC9ERUZBVUxUYDtcbiAgICAgICAgICByZXR1cm4gW3J1bnRpbWVBcm4sIGVuZHBvaW50QXJuRG9jLCBlbmRwb2ludEFybkFsdF07XG4gICAgICAgIH0pXG4gICAgICA6IFtgYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZToke3N0YWNrLnJlZ2lvbn06KjpydW50aW1lLypgXTtcbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogXCJBZ2VudENvcmVJbnZva2VcIixcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIixcbiAgICAgICAgICBcImJlZHJvY2stYWdlbnRjb3JlOkdldEFzeW5jVGFza1Jlc3VsdFwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IGludm9rZVJlc291cmNlcyxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZUFnZW50UnVudGltZSBlbnZpcm9ubWVudFZhcmlhYmxlczogXCJFbnZpcm9ubWVudCB2YXJpYWJsZXMgdG8gc2V0IGluIHRoZSBBZ2VudENvcmUgUnVudGltZSBlbnZpcm9ubWVudFwiXG4gICAgLy8gaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2JlZHJvY2stYWdlbnRjb3JlLWNvbnRyb2wvbGF0ZXN0L0FQSVJlZmVyZW5jZS9BUElfQ3JlYXRlQWdlbnRSdW50aW1lLmh0bWxcbiAgICBjb25zdCBlbnZpcm9ubWVudFZhcmlhYmxlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgIEFXU19SRUdJT05fTkFNRTogc3RhY2sucmVnaW9uLFxuICAgICAgREVEVVBFX1RBQkxFX05BTUU6IHByb3BzLmRlZHVwZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIFdISVRFTElTVF9UQUJMRV9OQU1FOiBwcm9wcy53aGl0ZWxpc3RDb25maWdUYWJsZS50YWJsZU5hbWUsXG4gICAgICBXSElURUxJU1RfU0VDUkVUX05BTUU6IGAke3N0YWNrLnN0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ2AsXG4gICAgICBSQVRFX0xJTUlUX1RBQkxFX05BTUU6IHByb3BzLnJhdGVMaW1pdFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIEVYSVNURU5DRV9DSEVDS19DQUNIRV9UQUJMRTogcHJvcHMuZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIFJBVEVfTElNSVRfUEVSX01JTlVURTogXCIxMFwiLFxuICAgICAgRU5BQkxFX0FHRU5UX0NBUkRfRElTQ09WRVJZOiBcInRydWVcIixcbiAgICAgIE1BWF9BR0VOVF9UVVJOUzogXCI1XCIsXG4gICAgfTtcbiAgICBjb25zdCBleGVjdXRpb25BZ2VudEFybnNNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAuLi4ocHJvcHMuZXhlY3V0aW9uQWdlbnRBcm5zIHx8IHt9KSxcbiAgICB9O1xuICAgIC8vIEJhY2t3YXJkIGNvbXBhdGliaWxpdHkgZm9yIG9sZGVyIGtleSB3aGlsZSByb3V0aW5nIGRlZmF1bHQgYWdlbnQgaXMgZmlsZS1jcmVhdG9yLlxuICAgIGlmIChcbiAgICAgIGV4ZWN1dGlvbkFnZW50QXJuc01hcC5nZW5lcmFsICYmXG4gICAgICAhZXhlY3V0aW9uQWdlbnRBcm5zTWFwW1wiZmlsZS1jcmVhdG9yXCJdXG4gICAgKSB7XG4gICAgICBleGVjdXRpb25BZ2VudEFybnNNYXBbXCJmaWxlLWNyZWF0b3JcIl0gPSBleGVjdXRpb25BZ2VudEFybnNNYXAuZ2VuZXJhbDtcbiAgICAgIGRlbGV0ZSBleGVjdXRpb25BZ2VudEFybnNNYXAuZ2VuZXJhbDtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4ZWN1dGlvbkFnZW50QXJuc01hcCkubGVuZ3RoID4gMCkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuRVhFQ1VUSU9OX0FHRU5UX0FSTlMgPSBKU09OLnN0cmluZ2lmeShcbiAgICAgICAgZXhlY3V0aW9uQWdlbnRBcm5zTWFwXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocHJvcHMuc2xhY2tQb3N0UmVxdWVzdFF1ZXVlKSB7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5TTEFDS19QT1NUX1JFUVVFU1RfUVVFVUVfVVJMID1cbiAgICAgICAgcHJvcHMuc2xhY2tQb3N0UmVxdWVzdFF1ZXVlLnF1ZXVlVXJsO1xuICAgICAgcHJvcHMuc2xhY2tQb3N0UmVxdWVzdFF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKHRoaXMuZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuICAgIGlmIChwcm9wcy5lcnJvckRlYnVnTG9nR3JvdXApIHtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLkVYRUNVVElPTl9BR0VOVF9FUlJPUl9MT0dfR1JPVVAgPVxuICAgICAgICBwcm9wcy5lcnJvckRlYnVnTG9nR3JvdXAubG9nR3JvdXBOYW1lO1xuICAgICAgcHJvcHMuZXJyb3JEZWJ1Z0xvZ0dyb3VwLmdyYW50V3JpdGUodGhpcy5leGVjdXRpb25Sb2xlKTtcbiAgICB9XG4gICAgaWYgKHByb3BzLmZpbGVFeGNoYW5nZUJ1Y2tldCkge1xuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMuRklMRV9FWENIQU5HRV9CVUNLRVQgPVxuICAgICAgICBwcm9wcy5maWxlRXhjaGFuZ2VCdWNrZXQuYnVja2V0TmFtZTtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLkZJTEVfRVhDSEFOR0VfUFJFRklYID0gXCJhdHRhY2htZW50cy9cIjtcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzLlBSRVNJR05FRF9VUkxfRVhQSVJZID0gXCI5MDBcIjtcbiAgICAgIHByb3BzLmZpbGVFeGNoYW5nZUJ1Y2tldC5ncmFudFJlYWRXcml0ZSh0aGlzLmV4ZWN1dGlvblJvbGUsIFwiYXR0YWNobWVudHMvKlwiKTtcbiAgICAgIHByb3BzLmZpbGVFeGNoYW5nZUJ1Y2tldC5ncmFudERlbGV0ZSh0aGlzLmV4ZWN1dGlvblJvbGUsIFwiYXR0YWNobWVudHMvKlwiKTtcbiAgICAgIHByb3BzLmZpbGVFeGNoYW5nZUJ1Y2tldC5ncmFudFJlYWRXcml0ZSh0aGlzLmV4ZWN1dGlvblJvbGUsIFwiZ2VuZXJhdGVkX2ZpbGVzLypcIik7XG4gICAgfVxuICAgIGlmIChwcm9wcy5zbGFja1NlYXJjaEFnZW50QXJuKSB7XG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcy5TTEFDS19TRUFSQ0hfQUdFTlRfQVJOID0gcHJvcHMuc2xhY2tTZWFyY2hBZ2VudEFybjtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgQWdlbnRDb3JlIFJ1bnRpbWUgdXNpbmcgTDEgQ2ZuUmVzb3VyY2VcbiAgICB0aGlzLnJ1bnRpbWUgPSBuZXcgY2RrLkNmblJlc291cmNlKHRoaXMsIFwiUnVudGltZVwiLCB7XG4gICAgICB0eXBlOiBcIkFXUzo6QmVkcm9ja0FnZW50Q29yZTo6UnVudGltZVwiLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBBZ2VudFJ1bnRpbWVOYW1lOiBwcm9wcy5hZ2VudFJ1bnRpbWVOYW1lLFxuICAgICAgICBSb2xlQXJuOiB0aGlzLmV4ZWN1dGlvblJvbGUucm9sZUFybixcbiAgICAgICAgUHJvdG9jb2xDb25maWd1cmF0aW9uOiBcIkEyQVwiLFxuICAgICAgICBBZ2VudFJ1bnRpbWVBcnRpZmFjdDoge1xuICAgICAgICAgIENvbnRhaW5lckNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICAgIENvbnRhaW5lclVyaTogcHJvcHMuY29udGFpbmVySW1hZ2VVcmksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgTmV0d29ya0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBOZXR3b3JrTW9kZTogXCJQVUJMSUNcIixcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgLy8gTDEgQ2ZuUmVzb3VyY2UgZG9lcyBub3QgcmVjZWl2ZSBzdGFjay1sZXZlbCBUYWdzIGZyb20gQ0RLIGFzcGVjdDsgc2V0IGV4cGxpY2l0bHkgZm9yIGNvc3QgYWxsb2NhdGlvblxuICAgIGNvbnN0IGRlcGxveW1lbnRFbnYgPVxuICAgICAgKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiKSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpID8/XG4gICAgICBwcm9jZXNzLmVudi5ERVBMT1lNRU5UX0VOViA/P1xuICAgICAgXCJkZXZcIjtcbiAgICB0aGlzLnJ1bnRpbWUuYWRkUHJvcGVydHlPdmVycmlkZShcbiAgICAgIFwiVGFnc1wiLFxuICAgICAgZ2V0Q29zdEFsbG9jYXRpb25UYWdWYWx1ZXMoe1xuICAgICAgICBkZXBsb3ltZW50RW52OiBTdHJpbmcoZGVwbG95bWVudEVudikudG9Mb3dlckNhc2UoKS50cmltKCksXG4gICAgICAgIHN0YWNrTmFtZTogc3RhY2suc3RhY2tOYW1lLFxuICAgICAgfSlcbiAgICApO1xuICAgIGlmIChwcm9wcy5saWZlY3ljbGVDb25maWd1cmF0aW9uKSB7XG4gICAgICBjb25zdCBsYyA9IHByb3BzLmxpZmVjeWNsZUNvbmZpZ3VyYXRpb247XG4gICAgICBjb25zdCBpZGxlID0gbGMuaWRsZVJ1bnRpbWVTZXNzaW9uVGltZW91dFNlY29uZHMgPz8gOTAwO1xuICAgICAgY29uc3QgbWF4THQgPSBsYy5tYXhMaWZldGltZVNlY29uZHMgPz8gMjg4MDA7XG4gICAgICB0aGlzLnJ1bnRpbWUuYWRkUHJvcGVydHlPdmVycmlkZShcIkxpZmVjeWNsZUNvbmZpZ3VyYXRpb25cIiwge1xuICAgICAgICBJZGxlUnVudGltZVNlc3Npb25UaW1lb3V0OiBNYXRoLm1heCg2MCwgTWF0aC5taW4oMjg4MDAsIGlkbGUpKSxcbiAgICAgICAgTWF4TGlmZXRpbWU6IE1hdGgubWF4KDYwLCBNYXRoLm1pbigyODgwMCwgbWF4THQpKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBFbnZpcm9ubWVudFZhcmlhYmxlcyAoc3RyaW5nLXRvLXN0cmluZyBtYXApIGFyZSBpbiBDcmVhdGVBZ2VudFJ1bnRpbWUgQVBJIGJ1dCBub3QgaW4gQ0RLIEwxIHNjaGVtYTsgYXBwbGllZCBhdCBkZXBsb3kgdGltZVxuICAgIHRoaXMucnVudGltZS5hZGRQcm9wZXJ0eU92ZXJyaWRlKFwiRW52aXJvbm1lbnRWYXJpYWJsZXNcIiwgZW52aXJvbm1lbnRWYXJpYWJsZXMpO1xuXG4gICAgY29uc3QgZGVmYXVsdFBvbGljeSA9IHRoaXMuZXhlY3V0aW9uUm9sZS5ub2RlLnRyeUZpbmRDaGlsZChcIkRlZmF1bHRQb2xpY3lcIik7XG4gICAgY29uc3QgcG9saWN5Q2ZuID0gZGVmYXVsdFBvbGljeT8ubm9kZS5kZWZhdWx0Q2hpbGQ7XG4gICAgaWYgKHBvbGljeUNmbiAmJiBjZGsuQ2ZuUmVzb3VyY2UuaXNDZm5SZXNvdXJjZShwb2xpY3lDZm4pKSB7XG4gICAgICB0aGlzLnJ1bnRpbWUuYWRkRGVwZW5kZW5jeShwb2xpY3lDZm4pO1xuICAgIH1cblxuICAgIC8vIERlcml2ZSBBUk4gZnJvbSB0aGUgcnVudGltZVxuICAgIHRoaXMucnVudGltZUFybiA9IHRoaXMucnVudGltZS5nZXRBdHQoXCJBZ2VudFJ1bnRpbWVBcm5cIikudG9TdHJpbmcoKTtcblxuICAgIC8vIERvIE5PVCBjcmVhdGUgUnVudGltZUVuZHBvaW50IGluIENGbjogQWdlbnRDb3JlIGF1dG8tY3JlYXRlcyBERUZBVUxUICh3b3VsZCBjb25mbGljdCkuXG4gICAgdGhpcy5lbmRwb2ludCA9IHVuZGVmaW5lZDtcbiAgfVxufVxuIl19