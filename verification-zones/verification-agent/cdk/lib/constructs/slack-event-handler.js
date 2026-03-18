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
exports.SlackEventHandler = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const constructs_1 = require("constructs");
const cdk_nag_1 = require("cdk-nag");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
class SlackEventHandler extends constructs_1.Construct {
    function;
    constructor(scope, id, props) {
        super(scope, id);
        const stack = cdk.Stack.of(this);
        const lambdaPath = path.join(__dirname, "../lambda/slack-event-handler");
        // Create Lambda function for Slack event handling
        this.function = new lambda.Function(this, "Handler", {
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: "handler.lambda_handler",
            code: lambda.Code.fromAsset(lambdaPath, {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_11.bundlingImage,
                    command: [
                        "bash",
                        "-c",
                        "pip install --no-cache-dir -r requirements.txt -t /asset-output && cp -r . /asset-output",
                    ],
                    // Local bundling for faster builds and Colima compatibility
                    local: {
                        tryBundle(outputDir) {
                            try {
                                // Check if pip is available locally
                                (0, child_process_1.execSync)("pip --version", { stdio: "pipe" });
                                // Install requirements locally
                                (0, child_process_1.execSync)(`pip install --no-cache-dir -r ${path.join(lambdaPath, "requirements.txt")} -t ${outputDir} --quiet`, { stdio: "pipe" });
                                // Copy source files (using fs for cross-platform compatibility)
                                const files = fs.readdirSync(lambdaPath);
                                for (const file of files) {
                                    const srcPath = path.join(lambdaPath, file);
                                    const destPath = path.join(outputDir, file);
                                    const stat = fs.statSync(srcPath);
                                    if (stat.isFile()) {
                                        fs.copyFileSync(srcPath, destPath);
                                    }
                                    else if (stat.isDirectory() && file !== "__pycache__") {
                                        fs.cpSync(srcPath, destPath, { recursive: true });
                                    }
                                }
                                return true;
                            }
                            catch {
                                // Fall back to Docker bundling
                                return false;
                            }
                        },
                    },
                },
            }),
            // Wait for A2A / execution responses (including Bedrock inference). Extend beyond the default 60s.
            timeout: cdk.Duration.seconds(120),
            environment: {
                TOKEN_TABLE_NAME: props.tokenTableName,
                DEDUPE_TABLE_NAME: props.dedupeTableName,
                EXISTENCE_CHECK_CACHE_TABLE: props.existenceCheckCacheTableName,
                WHITELIST_TABLE_NAME: props.whitelistConfigTableName,
                RATE_LIMIT_TABLE_NAME: props.rateLimitTableName,
                AWS_REGION_NAME: props.awsRegion,
                BEDROCK_MODEL_ID: props.bedrockModelId,
                // Store secret names (not values) in environment variables
                // Lambda function will fetch the actual secret values from Secrets Manager at runtime
                SLACK_SIGNING_SECRET_NAME: props.slackSigningSecret.secretName,
                SLACK_BOT_TOKEN_SECRET_NAME: props.slackBotTokenSecret.secretName,
                // Optional: Whitelist secret name (can be set via environment variable or Secrets Manager)
                // Format: {stackName}/slack/whitelist-config
                WHITELIST_SECRET_NAME: `${cdk.Stack.of(this).stackName}/slack/whitelist-config`,
                // A2A: Verification Agent Runtime ARN (required)
                VERIFICATION_AGENT_ARN: props.verificationAgentArn,
                // When set, handler sends to SQS instead of invoking AgentCore directly.
                ...(props.agentInvocationQueue && {
                    AGENT_INVOCATION_QUEUE_URL: props.agentInvocationQueue.queueUrl,
                }),
                // When secrets change, configRevision changes so Lambda gets new config and drops cached secrets
                ...(props.configRevision && { CONFIG_REVISION: props.configRevision }),
                // Channels where the bot auto-replies without requiring a mention
                ...(props.autoReplyChannelIds && props.autoReplyChannelIds.length > 0 && {
                    AUTO_REPLY_CHANNEL_IDS: props.autoReplyChannelIds.join(","),
                }),
                // Channels where @mention responses are allowed (empty = all channels)
                ...(props.mentionChannelIds && props.mentionChannelIds.length > 0 && {
                    MENTION_CHANNEL_IDS: props.mentionChannelIds.join(","),
                }),
            },
        });
        // Grant SQS SendMessage when async invocation queue is provided.
        if (props.agentInvocationQueue) {
            props.agentInvocationQueue.grantSendMessages(this.function);
        }
        // Grant Lambda function permission to read secrets
        props.slackSigningSecret.grantRead(this.function);
        props.slackBotTokenSecret.grantRead(this.function);
        // Grant Lambda function permission to read whitelist config from Secrets Manager (optional)
        // The secret name follows the pattern: {stackName}/slack/whitelist-config
        // This permission allows reading the whitelist config secret if it exists
        this.function.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["secretsmanager:GetSecretValue"],
            resources: [
                `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:${cdk.Stack.of(this).stackName}/slack/whitelist-config*`,
            ],
        }));
        // Grant AgentCore Runtime invocation permission (A2A path).
        // Least privilege — scoped to specific ARNs; both runtime and endpoint may be
        // evaluated by AWS for InvokeAgentRuntime authorization.
        // https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html
        const runtimeEndpointArn = `${props.verificationAgentArn}/runtime-endpoint/DEFAULT`;
        this.function.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["bedrock-agentcore:InvokeAgentRuntime"],
            resources: [props.verificationAgentArn, runtimeEndpointArn],
        }));
        // Grant CloudWatch permissions for Existence Check metrics
        this.function.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["cloudwatch:PutMetricData"],
            resources: ["*"],
            conditions: {
                StringEquals: {
                    "cloudwatch:namespace": "SlackEventHandler",
                },
            },
        }));
        // CloudWatch PutMetricData requires resource:* (AWS service constraint);
        // namespace is restricted via condition key "cloudwatch:namespace".
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.function, [
            {
                id: "AwsSolutions-IAM5",
                reason: "CloudWatch PutMetricData requires resource:* (AWS service constraint). " +
                    "The namespace is restricted to 'SlackEventHandler' via the cloudwatch:namespace condition key.",
            },
        ], true);
        if (this.function.role) {
            cdk_nag_1.NagSuppressions.addResourceSuppressions(this.function.role.node.defaultChild ?? this.function.role, [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Lambda uses AWS-managed policy for basic logging permissions (AWSLambdaBasicExecutionRole).",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Lambda permissions include AWS service constraints (CloudWatch PutMetricData, ECR auth, X-Ray) and " +
                        "Secrets Manager ARN patterns with wildcard suffix required by Secrets Manager secret version ARNs.",
                },
            ], true);
        }
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.function.node.defaultChild ?? this.function, [
            {
                id: "AwsSolutions-L1",
                reason: "Lambda runtime is pinned to Python 3.11 to match the project baseline. Runtime upgrades are handled separately.",
            },
        ]);
    }
}
exports.SlackEventHandler = SlackEventHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xhY2stZXZlbnQtaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNsYWNrLWV2ZW50LWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx5REFBMkM7QUFHM0MsMkNBQXVDO0FBQ3ZDLHFDQUEwQztBQUMxQywyQ0FBNkI7QUFDN0IsaURBQXlDO0FBQ3pDLHVDQUF5QjtBQStDekIsTUFBYSxpQkFBa0IsU0FBUSxzQkFBUztJQUM5QixRQUFRLENBQWtCO0lBRTFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBNkI7UUFDckUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO1FBRXpFLGtEQUFrRDtRQUNsRCxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ25ELE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLHdCQUF3QjtZQUNqQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFO2dCQUN0QyxRQUFRLEVBQUU7b0JBQ1IsS0FBSyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLGFBQWE7b0JBQy9DLE9BQU8sRUFBRTt3QkFDUCxNQUFNO3dCQUNOLElBQUk7d0JBQ0osMEZBQTBGO3FCQUMzRjtvQkFDRCw0REFBNEQ7b0JBQzVELEtBQUssRUFBRTt3QkFDTCxTQUFTLENBQUMsU0FB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QyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUMxRDtnQkFDRTtvQkFDRSxFQUFFLEVBQUUsbUJBQW1CO29CQUN2QixNQUFNLEVBQ0osNkZBQTZGO2lCQUNoRztnQkFDRDtvQkFDRSxFQUFFLEVBQUUsbUJBQW1CO29CQUN2QixNQUFNLEVBQ0oscUdBQXFHO3dCQUNyRyxvR0FBb0c7aUJBQ3ZHO2FBQ0YsRUFDRCxJQUFJLENBQ0wsQ0FBQztRQUNKLENBQUM7UUFFRCx5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFFBQVEsRUFDaEQ7WUFDRTtnQkFDRSxFQUFFLEVBQUUsaUJBQWlCO2dCQUNyQixNQUFNLEVBQ0osaUhBQWlIO2FBQ3BIO1NBQ0YsQ0FDRixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBeExELDhDQXdMQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyXCI7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zcXNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tIFwiY2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5cbi8qKlxuICogU2xhY2sgRXZlbnQgSGFuZGxlciBMYW1iZGEgY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IFJlY2VpdmUgU2xhY2sgZXZlbnRzIChGdW5jdGlvbiBVUkwpLCB2YWxpZGF0ZSBzaWduYXR1cmUgYW5kIHRva2VuLCB0aGVuIGludm9rZVxuICogVmVyaWZpY2F0aW9uIEFnZW50IChBMkEpIG9yIGVucXVldWUgdG8gU1FTIGZvciBhc3luYyBpbnZvY2F0aW9uLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IExhbWJkYSB3aXRoIEZ1bmN0aW9uIFVSTDsgU2xhY2sgc2lnbmluZyB2ZXJpZmljYXRpb247IER5bmFtb0RCL1NlY3JldHNcbiAqIGludGVncmF0aW9uOyBpbnZva2UgQWdlbnRDb3JlIG9yIHB1c2ggdG8gYWdlbnRJbnZvY2F0aW9uUXVldWUuXG4gKlxuICogSW5wdXRzOiBTbGFja0V2ZW50SGFuZGxlclByb3BzIChzZWNyZXRzLCB0YWJsZSBuYW1lcywgdmVyaWZpY2F0aW9uQWdlbnRBcm4sIHJlZ2lvbiwgbW9kZWwsIG9wdGlvbmFsIHF1ZXVlKS5cbiAqXG4gKiBPdXRwdXRzOiBmdW5jdGlvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTbGFja0V2ZW50SGFuZGxlclByb3BzIHtcbiAgc2xhY2tTaWduaW5nU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0OyAvLyBTbGFjayBhcHAgc2lnbmluZyBzZWNyZXQgZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgc2xhY2tCb3RUb2tlblNlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDsgLy8gQm90IE9BdXRoIHRva2VuIGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gIHRva2VuVGFibGVOYW1lOiBzdHJpbmc7IC8vIER5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHRva2VuIHN0b3JhZ2VcbiAgZGVkdXBlVGFibGVOYW1lOiBzdHJpbmc7IC8vIER5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIGV2ZW50IGRlZHVwbGljYXRpb25cbiAgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBFeGlzdGVuY2UgQ2hlY2sgY2FjaGVcbiAgd2hpdGVsaXN0Q29uZmlnVGFibGVOYW1lOiBzdHJpbmc7IC8vIER5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHdoaXRlbGlzdCBjb25maWd1cmF0aW9uXG4gIHJhdGVMaW1pdFRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciByYXRlIGxpbWl0aW5nXG4gIGF3c1JlZ2lvbjogc3RyaW5nOyAvLyBBV1MgcmVnaW9uIChlLmcuLCBhcC1ub3J0aGVhc3QtMSlcbiAgYmVkcm9ja01vZGVsSWQ6IHN0cmluZzsgLy8gQmVkcm9jayBtb2RlbCBJRCAoZS5nLiwgYW1hem9uLm5vdmEtcHJvLXYxOjApXG4gIC8qKiBBUk4gb2YgVmVyaWZpY2F0aW9uIEFnZW50IFJ1bnRpbWUgKEEyQSBwYXRoKS4gUmVxdWlyZWQuICovXG4gIHZlcmlmaWNhdGlvbkFnZW50QXJuOiBzdHJpbmc7XG4gIC8qKiBTUVMgcXVldWUgZm9yIGFzeW5jIGFnZW50IGludm9jYXRpb24uIFdoZW4gc2V0LCBoYW5kbGVyIHNlbmRzIHJlcXVlc3RzIGhlcmUgaW5zdGVhZCBvZiBpbnZva2luZyBBZ2VudENvcmUgZGlyZWN0bHkuICovXG4gIGFnZW50SW52b2NhdGlvblF1ZXVlPzogc3FzLklRdWV1ZTtcbiAgLyoqXG4gICAqIFJldmlzaW9uIHRva2VuIHNvIExhbWJkYSBjb25maWcgY2hhbmdlcyB3aGVuIHNlY3JldHMgY2hhbmdlIChlLmcuIGhhc2ggb2Ygc2lnbmluZyBzZWNyZXQpLlxuICAgKiBFbnN1cmVzIHdhcm0gaW5zdGFuY2VzIGFyZSByZXRpcmVkIGFuZCBuZXcgb25lcyBmZXRjaCB1cGRhdGVkIHNlY3JldHMgZnJvbSBTZWNyZXRzIE1hbmFnZXIuXG4gICAqL1xuICBjb25maWdSZXZpc2lvbj86IHN0cmluZztcbiAgLyoqXG4gICAqIENoYW5uZWwgSURzIHdoZXJlIHRoZSBib3QgYXV0by1yZXBsaWVzIHRvIGFsbCBtZXNzYWdlcyB3aXRob3V0IHJlcXVpcmluZyBhIG1lbnRpb24uXG4gICAqIENvbW1hLXNlcGFyYXRlZCBzdHJpbmcgaXMgc2V0IGFzIEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFMgZW52IHZhci5cbiAgICovXG4gIGF1dG9SZXBseUNoYW5uZWxJZHM/OiBzdHJpbmdbXTtcbiAgLyoqXG4gICAqIENoYW5uZWwgSURzIHdoZXJlIEBtZW50aW9uIHJlc3BvbnNlcyBhcmUgYWxsb3dlZC5cbiAgICogV2hlbiBzZXQsIGFwcF9tZW50aW9uIGV2ZW50cyBmcm9tIG90aGVyIGNoYW5uZWxzIGFyZSBzaWxlbnRseSBpZ25vcmVkLlxuICAgKiBDb21tYS1zZXBhcmF0ZWQgc3RyaW5nIGlzIHNldCBhcyBNRU5USU9OX0NIQU5ORUxfSURTIGVudiB2YXIuXG4gICAqL1xuICBtZW50aW9uQ2hhbm5lbElkcz86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgU2xhY2tFdmVudEhhbmRsZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgZnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2xhY2tFdmVudEhhbmRsZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBzdGFjayA9IGNkay5TdGFjay5vZih0aGlzKTtcbiAgICBjb25zdCBsYW1iZGFQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGEvc2xhY2stZXZlbnQtaGFuZGxlclwiKTtcbiAgICBcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBTbGFjayBldmVudCBoYW5kbGluZ1xuICAgIHRoaXMuZnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiSGFuZGxlclwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5sYW1iZGFfaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KGxhbWJkYVBhdGgsIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICBcImJhc2hcIixcbiAgICAgICAgICAgIFwiLWNcIixcbiAgICAgICAgICAgIFwicGlwIGluc3RhbGwgLS1uby1jYWNoZS1kaXIgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmIGNwIC1yIC4gL2Fzc2V0LW91dHB1dFwiLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgLy8gTG9jYWwgYnVuZGxpbmcgZm9yIGZhc3RlciBidWlsZHMgYW5kIENvbGltYSBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgbG9jYWw6IHtcbiAgICAgICAgICAgIHRyeUJ1bmRsZShvdXRwdXREaXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHBpcCBpcyBhdmFpbGFibGUgbG9jYWxseVxuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFwicGlwIC0tdmVyc2lvblwiLCB7IHN0ZGlvOiBcInBpcGVcIiB9KTtcbiAgICAgICAgICAgICAgICAvLyBJbnN0YWxsIHJlcXVpcmVtZW50cyBsb2NhbGx5XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXG4gICAgICAgICAgICAgICAgICBgcGlwIGluc3RhbGwgLS1uby1jYWNoZS1kaXIgLXIgJHtwYXRoLmpvaW4obGFtYmRhUGF0aCwgXCJyZXF1aXJlbWVudHMudHh0XCIpfSAtdCAke291dHB1dERpcn0gLS1xdWlldGAsXG4gICAgICAgICAgICAgICAgICB7IHN0ZGlvOiBcInBpcGVcIiB9XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvLyBDb3B5IHNvdXJjZSBmaWxlcyAodXNpbmcgZnMgZm9yIGNyb3NzLXBsYXRmb3JtIGNvbXBhdGliaWxpdHkpXG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhsYW1iZGFQYXRoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4obGFtYmRhUGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHNyY1BhdGgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIGZpbGUgIT09IFwiX19weWNhY2hlX19cIikge1xuICAgICAgICAgICAgICAgICAgICBmcy5jcFN5bmMoc3JjUGF0aCwgZGVzdFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gRmFsbCBiYWNrIHRvIERvY2tlciBidW5kbGluZ1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICAvLyBXYWl0IGZvciBBMkEgLyBleGVjdXRpb24gcmVzcG9uc2VzIChpbmNsdWRpbmcgQmVkcm9jayBpbmZlcmVuY2UpLiBFeHRlbmQgYmV5b25kIHRoZSBkZWZhdWx0IDYwcy5cbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBUT0tFTl9UQUJMRV9OQU1FOiBwcm9wcy50b2tlblRhYmxlTmFtZSxcbiAgICAgICAgREVEVVBFX1RBQkxFX05BTUU6IHByb3BzLmRlZHVwZVRhYmxlTmFtZSxcbiAgICAgICAgRVhJU1RFTkNFX0NIRUNLX0NBQ0hFX1RBQkxFOiBwcm9wcy5leGlzdGVuY2VDaGVja0NhY2hlVGFibGVOYW1lLFxuICAgICAgICBXSElURUxJU1RfVEFCTEVfTkFNRTogcHJvcHMud2hpdGVsaXN0Q29uZmlnVGFibGVOYW1lLFxuICAgICAgICBSQVRFX0xJTUlUX1RBQkxFX05BTUU6IHByb3BzLnJhdGVMaW1pdFRhYmxlTmFtZSxcbiAgICAgICAgQVdTX1JFR0lPTl9OQU1FOiBwcm9wcy5hd3NSZWdpb24sXG4gICAgICAgIEJFRFJPQ0tfTU9ERUxfSUQ6IHByb3BzLmJlZHJvY2tNb2RlbElkLFxuICAgICAgICAvLyBTdG9yZSBzZWNyZXQgbmFtZXMgKG5vdCB2YWx1ZXMpIGluIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgICAgICAvLyBMYW1iZGEgZnVuY3Rpb24gd2lsbCBmZXRjaCB0aGUgYWN0dWFsIHNlY3JldCB2YWx1ZXMgZnJvbSBTZWNyZXRzIE1hbmFnZXIgYXQgcnVudGltZVxuICAgICAgICBTTEFDS19TSUdOSU5HX1NFQ1JFVF9OQU1FOiBwcm9wcy5zbGFja1NpZ25pbmdTZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgU0xBQ0tfQk9UX1RPS0VOX1NFQ1JFVF9OQU1FOiBwcm9wcy5zbGFja0JvdFRva2VuU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIC8vIE9wdGlvbmFsOiBXaGl0ZWxpc3Qgc2VjcmV0IG5hbWUgKGNhbiBiZSBzZXQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlIG9yIFNlY3JldHMgTWFuYWdlcilcbiAgICAgICAgLy8gRm9ybWF0OiB7c3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnXG4gICAgICAgIFdISVRFTElTVF9TRUNSRVRfTkFNRTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ2AsXG4gICAgICAgIC8vIEEyQTogVmVyaWZpY2F0aW9uIEFnZW50IFJ1bnRpbWUgQVJOIChyZXF1aXJlZClcbiAgICAgICAgVkVSSUZJQ0FUSU9OX0FHRU5UX0FSTjogcHJvcHMudmVyaWZpY2F0aW9uQWdlbnRBcm4sXG4gICAgICAgIC8vIFdoZW4gc2V0LCBoYW5kbGVyIHNlbmRzIHRvIFNRUyBpbnN0ZWFkIG9mIGludm9raW5nIEFnZW50Q29yZSBkaXJlY3RseS5cbiAgICAgICAgLi4uKHByb3BzLmFnZW50SW52b2NhdGlvblF1ZXVlICYmIHtcbiAgICAgICAgICBBR0VOVF9JTlZPQ0FUSU9OX1FVRVVFX1VSTDogcHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUucXVldWVVcmwsXG4gICAgICAgIH0pLFxuICAgICAgICAvLyBXaGVuIHNlY3JldHMgY2hhbmdlLCBjb25maWdSZXZpc2lvbiBjaGFuZ2VzIHNvIExhbWJkYSBnZXRzIG5ldyBjb25maWcgYW5kIGRyb3BzIGNhY2hlZCBzZWNyZXRzXG4gICAgICAgIC4uLihwcm9wcy5jb25maWdSZXZpc2lvbiAmJiB7IENPTkZJR19SRVZJU0lPTjogcHJvcHMuY29uZmlnUmV2aXNpb24gfSksXG4gICAgICAgIC8vIENoYW5uZWxzIHdoZXJlIHRoZSBib3QgYXV0by1yZXBsaWVzIHdpdGhvdXQgcmVxdWlyaW5nIGEgbWVudGlvblxuICAgICAgICAuLi4ocHJvcHMuYXV0b1JlcGx5Q2hhbm5lbElkcyAmJiBwcm9wcy5hdXRvUmVwbHlDaGFubmVsSWRzLmxlbmd0aCA+IDAgJiYge1xuICAgICAgICAgIEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFM6IHByb3BzLmF1dG9SZXBseUNoYW5uZWxJZHMuam9pbihcIixcIiksXG4gICAgICAgIH0pLFxuICAgICAgICAvLyBDaGFubmVscyB3aGVyZSBAbWVudGlvbiByZXNwb25zZXMgYXJlIGFsbG93ZWQgKGVtcHR5ID0gYWxsIGNoYW5uZWxzKVxuICAgICAgICAuLi4ocHJvcHMubWVudGlvbkNoYW5uZWxJZHMgJiYgcHJvcHMubWVudGlvbkNoYW5uZWxJZHMubGVuZ3RoID4gMCAmJiB7XG4gICAgICAgICAgTUVOVElPTl9DSEFOTkVMX0lEUzogcHJvcHMubWVudGlvbkNoYW5uZWxJZHMuam9pbihcIixcIiksXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFNRUyBTZW5kTWVzc2FnZSB3aGVuIGFzeW5jIGludm9jYXRpb24gcXVldWUgaXMgcHJvdmlkZWQuXG4gICAgaWYgKHByb3BzLmFnZW50SW52b2NhdGlvblF1ZXVlKSB7XG4gICAgICBwcm9wcy5hZ2VudEludm9jYXRpb25RdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyh0aGlzLmZ1bmN0aW9uKTtcbiAgICB9XG5cbiAgICAvLyBHcmFudCBMYW1iZGEgZnVuY3Rpb24gcGVybWlzc2lvbiB0byByZWFkIHNlY3JldHNcbiAgICBwcm9wcy5zbGFja1NpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZnVuY3Rpb24pO1xuICAgIHByb3BzLnNsYWNrQm90VG9rZW5TZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZnVuY3Rpb24pO1xuICAgIFxuICAgIC8vIEdyYW50IExhbWJkYSBmdW5jdGlvbiBwZXJtaXNzaW9uIHRvIHJlYWQgd2hpdGVsaXN0IGNvbmZpZyBmcm9tIFNlY3JldHMgTWFuYWdlciAob3B0aW9uYWwpXG4gICAgLy8gVGhlIHNlY3JldCBuYW1lIGZvbGxvd3MgdGhlIHBhdHRlcm46IHtzdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWdcbiAgICAvLyBUaGlzIHBlcm1pc3Npb24gYWxsb3dzIHJlYWRpbmcgdGhlIHdoaXRlbGlzdCBjb25maWcgc2VjcmV0IGlmIGl0IGV4aXN0c1xuICAgIHRoaXMuZnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcInNlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9OnNlY3JldDoke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWcqYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEdyYW50IEFnZW50Q29yZSBSdW50aW1lIGludm9jYXRpb24gcGVybWlzc2lvbiAoQTJBIHBhdGgpLlxuICAgIC8vIExlYXN0IHByaXZpbGVnZSDigJQgc2NvcGVkIHRvIHNwZWNpZmljIEFSTnM7IGJvdGggcnVudGltZSBhbmQgZW5kcG9pbnQgbWF5IGJlXG4gICAgLy8gZXZhbHVhdGVkIGJ5IEFXUyBmb3IgSW52b2tlQWdlbnRSdW50aW1lIGF1dGhvcml6YXRpb24uXG4gICAgLy8gaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2JlZHJvY2stYWdlbnRjb3JlL2xhdGVzdC9kZXZndWlkZS9yZXNvdXJjZS1iYXNlZC1wb2xpY2llcy5odG1sXG4gICAgY29uc3QgcnVudGltZUVuZHBvaW50QXJuID0gYCR7cHJvcHMudmVyaWZpY2F0aW9uQWdlbnRBcm59L3J1bnRpbWUtZW5kcG9pbnQvREVGQVVMVGA7XG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy52ZXJpZmljYXRpb25BZ2VudEFybiwgcnVudGltZUVuZHBvaW50QXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEdyYW50IENsb3VkV2F0Y2ggcGVybWlzc2lvbnMgZm9yIEV4aXN0ZW5jZSBDaGVjayBtZXRyaWNzXG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgIFwiY2xvdWR3YXRjaDpuYW1lc3BhY2VcIjogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIFB1dE1ldHJpY0RhdGEgcmVxdWlyZXMgcmVzb3VyY2U6KiAoQVdTIHNlcnZpY2UgY29uc3RyYWludCk7XG4gICAgLy8gbmFtZXNwYWNlIGlzIHJlc3RyaWN0ZWQgdmlhIGNvbmRpdGlvbiBrZXkgXCJjbG91ZHdhdGNoOm5hbWVzcGFjZVwiLlxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIHRoaXMuZnVuY3Rpb24sXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtSUFNNVwiLFxuICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgIFwiQ2xvdWRXYXRjaCBQdXRNZXRyaWNEYXRhIHJlcXVpcmVzIHJlc291cmNlOiogKEFXUyBzZXJ2aWNlIGNvbnN0cmFpbnQpLiBcIiArXG4gICAgICAgICAgICBcIlRoZSBuYW1lc3BhY2UgaXMgcmVzdHJpY3RlZCB0byAnU2xhY2tFdmVudEhhbmRsZXInIHZpYSB0aGUgY2xvdWR3YXRjaDpuYW1lc3BhY2UgY29uZGl0aW9uIGtleS5cIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0cnVlLFxuICAgICk7XG5cbiAgICBpZiAodGhpcy5mdW5jdGlvbi5yb2xlKSB7XG4gICAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgIHRoaXMuZnVuY3Rpb24ucm9sZS5ub2RlLmRlZmF1bHRDaGlsZCA/PyB0aGlzLmZ1bmN0aW9uLnJvbGUsXG4gICAgICAgIFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtSUFNNFwiLFxuICAgICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgICBcIkxhbWJkYSB1c2VzIEFXUy1tYW5hZ2VkIHBvbGljeSBmb3IgYmFzaWMgbG9nZ2luZyBwZXJtaXNzaW9ucyAoQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlKS5cIixcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU01XCIsXG4gICAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICAgIFwiTGFtYmRhIHBlcm1pc3Npb25zIGluY2x1ZGUgQVdTIHNlcnZpY2UgY29uc3RyYWludHMgKENsb3VkV2F0Y2ggUHV0TWV0cmljRGF0YSwgRUNSIGF1dGgsIFgtUmF5KSBhbmQgXCIgK1xuICAgICAgICAgICAgICBcIlNlY3JldHMgTWFuYWdlciBBUk4gcGF0dGVybnMgd2l0aCB3aWxkY2FyZCBzdWZmaXggcmVxdWlyZWQgYnkgU2VjcmV0cyBNYW5hZ2VyIHNlY3JldCB2ZXJzaW9uIEFSTnMuXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgdHJ1ZSxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgdGhpcy5mdW5jdGlvbi5ub2RlLmRlZmF1bHRDaGlsZCA/PyB0aGlzLmZ1bmN0aW9uLFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUwxXCIsXG4gICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgXCJMYW1iZGEgcnVudGltZSBpcyBwaW5uZWQgdG8gUHl0aG9uIDMuMTEgdG8gbWF0Y2ggdGhlIHByb2plY3QgYmFzZWxpbmUuIFJ1bnRpbWUgdXBncmFkZXMgYXJlIGhhbmRsZWQgc2VwYXJhdGVseS5cIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgKTtcbiAgfVxufVxuIl19