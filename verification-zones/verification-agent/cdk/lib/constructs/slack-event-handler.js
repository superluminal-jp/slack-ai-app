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
                    AUTO_REPLY_CHANNEL_IDS: props.autoReplyChannelIds
                        .map((e) => (typeof e === "string" ? e : e.id))
                        .join(","),
                }),
                // Channels where @mention responses are allowed (empty = all channels)
                ...(props.mentionChannelIds && props.mentionChannelIds.length > 0 && {
                    MENTION_CHANNEL_IDS: props.mentionChannelIds
                        .map((e) => (typeof e === "string" ? e : e.id))
                        .join(","),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xhY2stZXZlbnQtaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNsYWNrLWV2ZW50LWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx5REFBMkM7QUFHM0MsMkNBQXVDO0FBQ3ZDLHFDQUEwQztBQUUxQywyQ0FBNkI7QUFDN0IsaURBQXlDO0FBQ3pDLHVDQUF5QjtBQStDekIsTUFBYSxpQkFBa0IsU0FBUSxzQkFBUztJQUM5QixRQUFRLENBQWtCO0lBRTFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBNkI7UUFDckUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO1FBRXpFLGtEQUFrRDtRQUNsRCxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ25ELE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLHdCQUF3QjtZQUNqQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFO2dCQUN0QyxRQUFRLEVBQUU7b0JBQ1IsS0FBSyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLGFBQWE7b0JBQy9DLE9BQU8sRUFBRTt3QkFDUCxNQUFNO3dCQUNOLElBQUk7d0JBQ0osMEZBQTBGO3FCQUMzRjtvQkFDRCw0REFBNEQ7b0JBQzVELEtBQUssRUFBRTt3QkFDTCxTQUFTLENBQUMsU0FB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LENBQ0gsQ0FBQztRQUVGLHlFQUF5RTtRQUN6RSxvRUFBb0U7UUFDcEUseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsSUFBSSxDQUFDLFFBQVEsRUFDYjtZQUNFO2dCQUNFLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLE1BQU0sRUFDSix5RUFBeUU7b0JBQ3pFLGdHQUFnRzthQUNuRztTQUNGLEVBQ0QsSUFBSSxDQUNMLENBQUM7UUFFRixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDdkIseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFDMUQ7Z0JBQ0U7b0JBQ0UsRUFBRSxFQUFFLG1CQUFtQjtvQkFDdkIsTUFBTSxFQUNKLDZGQUE2RjtpQkFDaEc7Z0JBQ0Q7b0JBQ0UsRUFBRSxFQUFFLG1CQUFtQjtvQkFDdkIsTUFBTSxFQUNKLHFHQUFxRzt3QkFDckcsb0dBQW9HO2lCQUN2RzthQUNGLEVBQ0QsSUFBSSxDQUNMLENBQUM7UUFDSixDQUFDO1FBRUQseUJBQWUsQ0FBQyx1QkFBdUIsQ0FDckMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQ2hEO1lBQ0U7Z0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtnQkFDckIsTUFBTSxFQUNKLGlIQUFpSDthQUNwSDtTQUNGLENBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTVMRCw4Q0E0TEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlclwiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSBcImNkay1uYWdcIjtcbmltcG9ydCB7IENoYW5uZWxJZEVudHJ5IH0gZnJvbSBcIi4uL3R5cGVzL2Nkay1jb25maWdcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSBcImNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCAqIGFzIGZzIGZyb20gXCJmc1wiO1xuXG4vKipcbiAqIFNsYWNrIEV2ZW50IEhhbmRsZXIgTGFtYmRhIGNvbnN0cnVjdC5cbiAqXG4gKiBQdXJwb3NlOiBSZWNlaXZlIFNsYWNrIGV2ZW50cyAoRnVuY3Rpb24gVVJMKSwgdmFsaWRhdGUgc2lnbmF0dXJlIGFuZCB0b2tlbiwgdGhlbiBpbnZva2VcbiAqIFZlcmlmaWNhdGlvbiBBZ2VudCAoQTJBKSBvciBlbnF1ZXVlIHRvIFNRUyBmb3IgYXN5bmMgaW52b2NhdGlvbi5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOiBMYW1iZGEgd2l0aCBGdW5jdGlvbiBVUkw7IFNsYWNrIHNpZ25pbmcgdmVyaWZpY2F0aW9uOyBEeW5hbW9EQi9TZWNyZXRzXG4gKiBpbnRlZ3JhdGlvbjsgaW52b2tlIEFnZW50Q29yZSBvciBwdXNoIHRvIGFnZW50SW52b2NhdGlvblF1ZXVlLlxuICpcbiAqIElucHV0czogU2xhY2tFdmVudEhhbmRsZXJQcm9wcyAoc2VjcmV0cywgdGFibGUgbmFtZXMsIHZlcmlmaWNhdGlvbkFnZW50QXJuLCByZWdpb24sIG1vZGVsLCBvcHRpb25hbCBxdWV1ZSkuXG4gKlxuICogT3V0cHV0czogZnVuY3Rpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2xhY2tFdmVudEhhbmRsZXJQcm9wcyB7XG4gIHNsYWNrU2lnbmluZ1NlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDsgLy8gU2xhY2sgYXBwIHNpZ25pbmcgc2VjcmV0IGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gIHNsYWNrQm90VG9rZW5TZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7IC8vIEJvdCBPQXV0aCB0b2tlbiBmcm9tIFNlY3JldHMgTWFuYWdlclxuICB0b2tlblRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciB0b2tlbiBzdG9yYWdlXG4gIGRlZHVwZVRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBldmVudCBkZWR1cGxpY2F0aW9uXG4gIGV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZU5hbWU6IHN0cmluZzsgLy8gRHluYW1vREIgdGFibGUgbmFtZSBmb3IgRXhpc3RlbmNlIENoZWNrIGNhY2hlXG4gIHdoaXRlbGlzdENvbmZpZ1RhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciB3aGl0ZWxpc3QgY29uZmlndXJhdGlvblxuICByYXRlTGltaXRUYWJsZU5hbWU6IHN0cmluZzsgLy8gRHluYW1vREIgdGFibGUgbmFtZSBmb3IgcmF0ZSBsaW1pdGluZ1xuICBhd3NSZWdpb246IHN0cmluZzsgLy8gQVdTIHJlZ2lvbiAoZS5nLiwgYXAtbm9ydGhlYXN0LTEpXG4gIGJlZHJvY2tNb2RlbElkOiBzdHJpbmc7IC8vIEJlZHJvY2sgbW9kZWwgSUQgKGUuZy4sIGFtYXpvbi5ub3ZhLXByby12MTowKVxuICAvKiogQVJOIG9mIFZlcmlmaWNhdGlvbiBBZ2VudCBSdW50aW1lIChBMkEgcGF0aCkuIFJlcXVpcmVkLiAqL1xuICB2ZXJpZmljYXRpb25BZ2VudEFybjogc3RyaW5nO1xuICAvKiogU1FTIHF1ZXVlIGZvciBhc3luYyBhZ2VudCBpbnZvY2F0aW9uLiBXaGVuIHNldCwgaGFuZGxlciBzZW5kcyByZXF1ZXN0cyBoZXJlIGluc3RlYWQgb2YgaW52b2tpbmcgQWdlbnRDb3JlIGRpcmVjdGx5LiAqL1xuICBhZ2VudEludm9jYXRpb25RdWV1ZT86IHNxcy5JUXVldWU7XG4gIC8qKlxuICAgKiBSZXZpc2lvbiB0b2tlbiBzbyBMYW1iZGEgY29uZmlnIGNoYW5nZXMgd2hlbiBzZWNyZXRzIGNoYW5nZSAoZS5nLiBoYXNoIG9mIHNpZ25pbmcgc2VjcmV0KS5cbiAgICogRW5zdXJlcyB3YXJtIGluc3RhbmNlcyBhcmUgcmV0aXJlZCBhbmQgbmV3IG9uZXMgZmV0Y2ggdXBkYXRlZCBzZWNyZXRzIGZyb20gU2VjcmV0cyBNYW5hZ2VyLlxuICAgKi9cbiAgY29uZmlnUmV2aXNpb24/OiBzdHJpbmc7XG4gIC8qKlxuICAgKiBDaGFubmVsIElEcyB3aGVyZSB0aGUgYm90IGF1dG8tcmVwbGllcyB0byBhbGwgbWVzc2FnZXMgd2l0aG91dCByZXF1aXJpbmcgYSBtZW50aW9uLlxuICAgKiBBY2NlcHRzIHBsYWluIElEcyBvciBvYmplY3RzIHdpdGggaWQgYW5kIGxhYmVsLiBPbmx5IElEcyBhcmUgcGFzc2VkIHRvIHRoZSBMYW1iZGEgZW52IHZhci5cbiAgICovXG4gIGF1dG9SZXBseUNoYW5uZWxJZHM/OiBDaGFubmVsSWRFbnRyeVtdO1xuICAvKipcbiAgICogQ2hhbm5lbCBJRHMgd2hlcmUgQG1lbnRpb24gcmVzcG9uc2VzIGFyZSBhbGxvd2VkLlxuICAgKiBXaGVuIHNldCwgYXBwX21lbnRpb24gZXZlbnRzIGZyb20gb3RoZXIgY2hhbm5lbHMgYXJlIHNpbGVudGx5IGlnbm9yZWQuXG4gICAqIEFjY2VwdHMgcGxhaW4gSURzIG9yIG9iamVjdHMgd2l0aCBpZCBhbmQgbGFiZWwuIE9ubHkgSURzIGFyZSBwYXNzZWQgdG8gdGhlIExhbWJkYSBlbnYgdmFyLlxuICAgKi9cbiAgbWVudGlvbkNoYW5uZWxJZHM/OiBDaGFubmVsSWRFbnRyeVtdO1xufVxuXG5leHBvcnQgY2xhc3MgU2xhY2tFdmVudEhhbmRsZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgZnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2xhY2tFdmVudEhhbmRsZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBzdGFjayA9IGNkay5TdGFjay5vZih0aGlzKTtcbiAgICBjb25zdCBsYW1iZGFQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGEvc2xhY2stZXZlbnQtaGFuZGxlclwiKTtcbiAgICBcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBTbGFjayBldmVudCBoYW5kbGluZ1xuICAgIHRoaXMuZnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiSGFuZGxlclwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5sYW1iZGFfaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KGxhbWJkYVBhdGgsIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICBcImJhc2hcIixcbiAgICAgICAgICAgIFwiLWNcIixcbiAgICAgICAgICAgIFwicGlwIGluc3RhbGwgLS1uby1jYWNoZS1kaXIgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmIGNwIC1yIC4gL2Fzc2V0LW91dHB1dFwiLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgLy8gTG9jYWwgYnVuZGxpbmcgZm9yIGZhc3RlciBidWlsZHMgYW5kIENvbGltYSBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgbG9jYWw6IHtcbiAgICAgICAgICAgIHRyeUJ1bmRsZShvdXRwdXREaXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHBpcCBpcyBhdmFpbGFibGUgbG9jYWxseVxuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFwicGlwIC0tdmVyc2lvblwiLCB7IHN0ZGlvOiBcInBpcGVcIiB9KTtcbiAgICAgICAgICAgICAgICAvLyBJbnN0YWxsIHJlcXVpcmVtZW50cyBsb2NhbGx5XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXG4gICAgICAgICAgICAgICAgICBgcGlwIGluc3RhbGwgLS1uby1jYWNoZS1kaXIgLXIgJHtwYXRoLmpvaW4obGFtYmRhUGF0aCwgXCJyZXF1aXJlbWVudHMudHh0XCIpfSAtdCAke291dHB1dERpcn0gLS1xdWlldGAsXG4gICAgICAgICAgICAgICAgICB7IHN0ZGlvOiBcInBpcGVcIiB9XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvLyBDb3B5IHNvdXJjZSBmaWxlcyAodXNpbmcgZnMgZm9yIGNyb3NzLXBsYXRmb3JtIGNvbXBhdGliaWxpdHkpXG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhsYW1iZGFQYXRoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4obGFtYmRhUGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHNyY1BhdGgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIGZpbGUgIT09IFwiX19weWNhY2hlX19cIikge1xuICAgICAgICAgICAgICAgICAgICBmcy5jcFN5bmMoc3JjUGF0aCwgZGVzdFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gRmFsbCBiYWNrIHRvIERvY2tlciBidW5kbGluZ1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICAvLyBXYWl0IGZvciBBMkEgLyBleGVjdXRpb24gcmVzcG9uc2VzIChpbmNsdWRpbmcgQmVkcm9jayBpbmZlcmVuY2UpLiBFeHRlbmQgYmV5b25kIHRoZSBkZWZhdWx0IDYwcy5cbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBUT0tFTl9UQUJMRV9OQU1FOiBwcm9wcy50b2tlblRhYmxlTmFtZSxcbiAgICAgICAgREVEVVBFX1RBQkxFX05BTUU6IHByb3BzLmRlZHVwZVRhYmxlTmFtZSxcbiAgICAgICAgRVhJU1RFTkNFX0NIRUNLX0NBQ0hFX1RBQkxFOiBwcm9wcy5leGlzdGVuY2VDaGVja0NhY2hlVGFibGVOYW1lLFxuICAgICAgICBXSElURUxJU1RfVEFCTEVfTkFNRTogcHJvcHMud2hpdGVsaXN0Q29uZmlnVGFibGVOYW1lLFxuICAgICAgICBSQVRFX0xJTUlUX1RBQkxFX05BTUU6IHByb3BzLnJhdGVMaW1pdFRhYmxlTmFtZSxcbiAgICAgICAgQVdTX1JFR0lPTl9OQU1FOiBwcm9wcy5hd3NSZWdpb24sXG4gICAgICAgIEJFRFJPQ0tfTU9ERUxfSUQ6IHByb3BzLmJlZHJvY2tNb2RlbElkLFxuICAgICAgICAvLyBTdG9yZSBzZWNyZXQgbmFtZXMgKG5vdCB2YWx1ZXMpIGluIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgICAgICAvLyBMYW1iZGEgZnVuY3Rpb24gd2lsbCBmZXRjaCB0aGUgYWN0dWFsIHNlY3JldCB2YWx1ZXMgZnJvbSBTZWNyZXRzIE1hbmFnZXIgYXQgcnVudGltZVxuICAgICAgICBTTEFDS19TSUdOSU5HX1NFQ1JFVF9OQU1FOiBwcm9wcy5zbGFja1NpZ25pbmdTZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgU0xBQ0tfQk9UX1RPS0VOX1NFQ1JFVF9OQU1FOiBwcm9wcy5zbGFja0JvdFRva2VuU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIC8vIE9wdGlvbmFsOiBXaGl0ZWxpc3Qgc2VjcmV0IG5hbWUgKGNhbiBiZSBzZXQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlIG9yIFNlY3JldHMgTWFuYWdlcilcbiAgICAgICAgLy8gRm9ybWF0OiB7c3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnXG4gICAgICAgIFdISVRFTElTVF9TRUNSRVRfTkFNRTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ2AsXG4gICAgICAgIC8vIEEyQTogVmVyaWZpY2F0aW9uIEFnZW50IFJ1bnRpbWUgQVJOIChyZXF1aXJlZClcbiAgICAgICAgVkVSSUZJQ0FUSU9OX0FHRU5UX0FSTjogcHJvcHMudmVyaWZpY2F0aW9uQWdlbnRBcm4sXG4gICAgICAgIC8vIFdoZW4gc2V0LCBoYW5kbGVyIHNlbmRzIHRvIFNRUyBpbnN0ZWFkIG9mIGludm9raW5nIEFnZW50Q29yZSBkaXJlY3RseS5cbiAgICAgICAgLi4uKHByb3BzLmFnZW50SW52b2NhdGlvblF1ZXVlICYmIHtcbiAgICAgICAgICBBR0VOVF9JTlZPQ0FUSU9OX1FVRVVFX1VSTDogcHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUucXVldWVVcmwsXG4gICAgICAgIH0pLFxuICAgICAgICAvLyBXaGVuIHNlY3JldHMgY2hhbmdlLCBjb25maWdSZXZpc2lvbiBjaGFuZ2VzIHNvIExhbWJkYSBnZXRzIG5ldyBjb25maWcgYW5kIGRyb3BzIGNhY2hlZCBzZWNyZXRzXG4gICAgICAgIC4uLihwcm9wcy5jb25maWdSZXZpc2lvbiAmJiB7IENPTkZJR19SRVZJU0lPTjogcHJvcHMuY29uZmlnUmV2aXNpb24gfSksXG4gICAgICAgIC8vIENoYW5uZWxzIHdoZXJlIHRoZSBib3QgYXV0by1yZXBsaWVzIHdpdGhvdXQgcmVxdWlyaW5nIGEgbWVudGlvblxuICAgICAgICAuLi4ocHJvcHMuYXV0b1JlcGx5Q2hhbm5lbElkcyAmJiBwcm9wcy5hdXRvUmVwbHlDaGFubmVsSWRzLmxlbmd0aCA+IDAgJiYge1xuICAgICAgICAgIEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFM6IHByb3BzLmF1dG9SZXBseUNoYW5uZWxJZHNcbiAgICAgICAgICAgIC5tYXAoKGUpID0+ICh0eXBlb2YgZSA9PT0gXCJzdHJpbmdcIiA/IGUgOiBlLmlkKSlcbiAgICAgICAgICAgIC5qb2luKFwiLFwiKSxcbiAgICAgICAgfSksXG4gICAgICAgIC8vIENoYW5uZWxzIHdoZXJlIEBtZW50aW9uIHJlc3BvbnNlcyBhcmUgYWxsb3dlZCAoZW1wdHkgPSBhbGwgY2hhbm5lbHMpXG4gICAgICAgIC4uLihwcm9wcy5tZW50aW9uQ2hhbm5lbElkcyAmJiBwcm9wcy5tZW50aW9uQ2hhbm5lbElkcy5sZW5ndGggPiAwICYmIHtcbiAgICAgICAgICBNRU5USU9OX0NIQU5ORUxfSURTOiBwcm9wcy5tZW50aW9uQ2hhbm5lbElkc1xuICAgICAgICAgICAgLm1hcCgoZSkgPT4gKHR5cGVvZiBlID09PSBcInN0cmluZ1wiID8gZSA6IGUuaWQpKVxuICAgICAgICAgICAgLmpvaW4oXCIsXCIpLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBTUVMgU2VuZE1lc3NhZ2Ugd2hlbiBhc3luYyBpbnZvY2F0aW9uIHF1ZXVlIGlzIHByb3ZpZGVkLlxuICAgIGlmIChwcm9wcy5hZ2VudEludm9jYXRpb25RdWV1ZSkge1xuICAgICAgcHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXModGhpcy5mdW5jdGlvbik7XG4gICAgfVxuXG4gICAgLy8gR3JhbnQgTGFtYmRhIGZ1bmN0aW9uIHBlcm1pc3Npb24gdG8gcmVhZCBzZWNyZXRzXG4gICAgcHJvcHMuc2xhY2tTaWduaW5nU2VjcmV0LmdyYW50UmVhZCh0aGlzLmZ1bmN0aW9uKTtcbiAgICBwcm9wcy5zbGFja0JvdFRva2VuU2VjcmV0LmdyYW50UmVhZCh0aGlzLmZ1bmN0aW9uKTtcbiAgICBcbiAgICAvLyBHcmFudCBMYW1iZGEgZnVuY3Rpb24gcGVybWlzc2lvbiB0byByZWFkIHdoaXRlbGlzdCBjb25maWcgZnJvbSBTZWNyZXRzIE1hbmFnZXIgKG9wdGlvbmFsKVxuICAgIC8vIFRoZSBzZWNyZXQgbmFtZSBmb2xsb3dzIHRoZSBwYXR0ZXJuOiB7c3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnXG4gICAgLy8gVGhpcyBwZXJtaXNzaW9uIGFsbG93cyByZWFkaW5nIHRoZSB3aGl0ZWxpc3QgY29uZmlnIHNlY3JldCBpZiBpdCBleGlzdHNcbiAgICB0aGlzLmZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJzZWNyZXRzbWFuYWdlcjpHZXRTZWNyZXRWYWx1ZVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c2VjcmV0c21hbmFnZXI6JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufToke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fTpzZWNyZXQ6JHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBHcmFudCBBZ2VudENvcmUgUnVudGltZSBpbnZvY2F0aW9uIHBlcm1pc3Npb24gKEEyQSBwYXRoKS5cbiAgICAvLyBMZWFzdCBwcml2aWxlZ2Ug4oCUIHNjb3BlZCB0byBzcGVjaWZpYyBBUk5zOyBib3RoIHJ1bnRpbWUgYW5kIGVuZHBvaW50IG1heSBiZVxuICAgIC8vIGV2YWx1YXRlZCBieSBBV1MgZm9yIEludm9rZUFnZW50UnVudGltZSBhdXRob3JpemF0aW9uLlxuICAgIC8vIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9iZWRyb2NrLWFnZW50Y29yZS9sYXRlc3QvZGV2Z3VpZGUvcmVzb3VyY2UtYmFzZWQtcG9saWNpZXMuaHRtbFxuICAgIGNvbnN0IHJ1bnRpbWVFbmRwb2ludEFybiA9IGAke3Byb3BzLnZlcmlmaWNhdGlvbkFnZW50QXJufS9ydW50aW1lLWVuZHBvaW50L0RFRkFVTFRgO1xuICAgIHRoaXMuZnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMudmVyaWZpY2F0aW9uQWdlbnRBcm4sIHJ1bnRpbWVFbmRwb2ludEFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBHcmFudCBDbG91ZFdhdGNoIHBlcm1pc3Npb25zIGZvciBFeGlzdGVuY2UgQ2hlY2sgbWV0cmljc1xuICAgIHRoaXMuZnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcImNsb3Vkd2F0Y2g6UHV0TWV0cmljRGF0YVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImNsb3Vkd2F0Y2g6bmFtZXNwYWNlXCI6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBQdXRNZXRyaWNEYXRhIHJlcXVpcmVzIHJlc291cmNlOiogKEFXUyBzZXJ2aWNlIGNvbnN0cmFpbnQpO1xuICAgIC8vIG5hbWVzcGFjZSBpcyByZXN0cmljdGVkIHZpYSBjb25kaXRpb24ga2V5IFwiY2xvdWR3YXRjaDpuYW1lc3BhY2VcIi5cbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICB0aGlzLmZ1bmN0aW9uLFxuICAgICAgW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTVcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIkNsb3VkV2F0Y2ggUHV0TWV0cmljRGF0YSByZXF1aXJlcyByZXNvdXJjZToqIChBV1Mgc2VydmljZSBjb25zdHJhaW50KS4gXCIgK1xuICAgICAgICAgICAgXCJUaGUgbmFtZXNwYWNlIGlzIHJlc3RyaWN0ZWQgdG8gJ1NsYWNrRXZlbnRIYW5kbGVyJyB2aWEgdGhlIGNsb3Vkd2F0Y2g6bmFtZXNwYWNlIGNvbmRpdGlvbiBrZXkuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuXG4gICAgaWYgKHRoaXMuZnVuY3Rpb24ucm9sZSkge1xuICAgICAgTmFnU3VwcHJlc3Npb25zLmFkZFJlc291cmNlU3VwcHJlc3Npb25zKFxuICAgICAgICB0aGlzLmZ1bmN0aW9uLnJvbGUubm9kZS5kZWZhdWx0Q2hpbGQgPz8gdGhpcy5mdW5jdGlvbi5yb2xlLFxuICAgICAgICBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTRcIixcbiAgICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgICAgXCJMYW1iZGEgdXNlcyBBV1MtbWFuYWdlZCBwb2xpY3kgZm9yIGJhc2ljIGxvZ2dpbmcgcGVybWlzc2lvbnMgKEFXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZSkuXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtSUFNNVwiLFxuICAgICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgICBcIkxhbWJkYSBwZXJtaXNzaW9ucyBpbmNsdWRlIEFXUyBzZXJ2aWNlIGNvbnN0cmFpbnRzIChDbG91ZFdhdGNoIFB1dE1ldHJpY0RhdGEsIEVDUiBhdXRoLCBYLVJheSkgYW5kIFwiICtcbiAgICAgICAgICAgICAgXCJTZWNyZXRzIE1hbmFnZXIgQVJOIHBhdHRlcm5zIHdpdGggd2lsZGNhcmQgc3VmZml4IHJlcXVpcmVkIGJ5IFNlY3JldHMgTWFuYWdlciBzZWNyZXQgdmVyc2lvbiBBUk5zLlwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIHRydWUsXG4gICAgICApO1xuICAgIH1cblxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIHRoaXMuZnVuY3Rpb24ubm9kZS5kZWZhdWx0Q2hpbGQgPz8gdGhpcy5mdW5jdGlvbixcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1MMVwiLFxuICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgIFwiTGFtYmRhIHJ1bnRpbWUgaXMgcGlubmVkIHRvIFB5dGhvbiAzLjExIHRvIG1hdGNoIHRoZSBwcm9qZWN0IGJhc2VsaW5lLiBSdW50aW1lIHVwZ3JhZGVzIGFyZSBoYW5kbGVkIHNlcGFyYXRlbHkuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICk7XG4gIH1cbn1cbiJdfQ==