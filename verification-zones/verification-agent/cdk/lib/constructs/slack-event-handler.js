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
            // A2A / Execution 応答待ち（Bedrock 推論含む）。60s でタイムアウトするため 120s に延長
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
                // 016: when set, handler sends to SQS instead of invoking AgentCore directly
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
        // 016: Grant SQS SendMessage when async invocation queue is provided
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
        // 026 US1 (T007): Least privilege — scoped to specific ARNs per audit-iam-bedrock.md.
        // Per AWS: both runtime and endpoint may be evaluated for InvokeAgentRuntime.
        // https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html
        const runtimeEndpointArn = `${props.verificationAgentArn}/runtime-endpoint/DEFAULT`;
        this.function.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["bedrock-agentcore:InvokeAgentRuntime"],
            resources: [props.verificationAgentArn, runtimeEndpointArn],
        }));
        // Grant CloudWatch permissions for Existence Check metrics (Phase 6 - Polish)
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
    }
}
exports.SlackEventHandler = SlackEventHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xhY2stZXZlbnQtaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNsYWNrLWV2ZW50LWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx5REFBMkM7QUFHM0MsMkNBQXVDO0FBQ3ZDLDJDQUE2QjtBQUM3QixpREFBeUM7QUFDekMsdUNBQXlCO0FBK0N6QixNQUFhLGlCQUFrQixTQUFRLHNCQUFTO0lBQzlCLFFBQVEsQ0FBa0I7SUFFMUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLCtCQUErQixDQUFDLENBQUM7UUFFekUsa0RBQWtEO1FBQ2xELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkQsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUsd0JBQXdCO1lBQ2pDLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUU7Z0JBQ3RDLFFBQVEsRUFBRTtvQkFDUixLQUFLLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsYUFBYTtvQkFDL0MsT0FBTyxFQUFFO3dCQUNQLE1BQU07d0JBQ04sSUFBSTt3QkFDSiwwRkFBMEY7cUJBQzNGO29CQUNELDREQUE0RDtvQkFDNUQsS0FBSyxFQUFFO3dCQUNMLFNBQVMsQ0FBQyxTQUFpQjs0QkFDekIsSUFB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LElBQUksQ0FBQyxDQUFDLFNBQVMsMEJBQTBCO2FBQ25KO1NBQ0YsQ0FBQyxDQUNILENBQUM7UUFFRiw0REFBNEQ7UUFDNUQsc0ZBQXNGO1FBQ3RGLDhFQUE4RTtRQUM5RSw2RkFBNkY7UUFDN0YsTUFBTSxrQkFBa0IsR0FBRyxHQUFHLEtBQUssQ0FBQyxvQkFBb0IsMkJBQTJCLENBQUM7UUFDcEYsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQzNCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRSxDQUFDLHNDQUFzQyxDQUFDO1lBQ2pELFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxrQkFBa0IsQ0FBQztTQUM1RCxDQUFDLENBQ0gsQ0FBQztRQUVGLDhFQUE4RTtRQUM5RSxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FDM0IsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFLENBQUMsMEJBQTBCLENBQUM7WUFDckMsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDO1lBQ2hCLFVBQVUsRUFBRTtnQkFDVixZQUFZLEVBQUU7b0JBQ1osc0JBQXNCLEVBQUUsbUJBQW1CO2lCQUM1QzthQUNGO1NBQ0YsQ0FBQyxDQUNILENBQUM7SUFFSixDQUFDO0NBQ0Y7QUEzSUQsOENBMklDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXJcIjtcbmltcG9ydCAqIGFzIHNxcyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNxc1wiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSBcImNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCAqIGFzIGZzIGZyb20gXCJmc1wiO1xuXG4vKipcbiAqIFNsYWNrIEV2ZW50IEhhbmRsZXIgTGFtYmRhIGNvbnN0cnVjdC5cbiAqXG4gKiBQdXJwb3NlOiBSZWNlaXZlIFNsYWNrIGV2ZW50cyAoRnVuY3Rpb24gVVJMKSwgdmFsaWRhdGUgc2lnbmF0dXJlIGFuZCB0b2tlbiwgdGhlbiBpbnZva2VcbiAqIFZlcmlmaWNhdGlvbiBBZ2VudCAoQTJBKSBvciBlbnF1ZXVlIHRvIFNRUyBmb3IgYXN5bmMgaW52b2NhdGlvbi5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOiBMYW1iZGEgd2l0aCBGdW5jdGlvbiBVUkw7IFNsYWNrIHNpZ25pbmcgdmVyaWZpY2F0aW9uOyBEeW5hbW9EQi9TZWNyZXRzXG4gKiBpbnRlZ3JhdGlvbjsgaW52b2tlIEFnZW50Q29yZSBvciBwdXNoIHRvIGFnZW50SW52b2NhdGlvblF1ZXVlLlxuICpcbiAqIElucHV0czogU2xhY2tFdmVudEhhbmRsZXJQcm9wcyAoc2VjcmV0cywgdGFibGUgbmFtZXMsIHZlcmlmaWNhdGlvbkFnZW50QXJuLCByZWdpb24sIG1vZGVsLCBvcHRpb25hbCBxdWV1ZSkuXG4gKlxuICogT3V0cHV0czogZnVuY3Rpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2xhY2tFdmVudEhhbmRsZXJQcm9wcyB7XG4gIHNsYWNrU2lnbmluZ1NlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDsgLy8gU2xhY2sgYXBwIHNpZ25pbmcgc2VjcmV0IGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gIHNsYWNrQm90VG9rZW5TZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7IC8vIEJvdCBPQXV0aCB0b2tlbiBmcm9tIFNlY3JldHMgTWFuYWdlclxuICB0b2tlblRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciB0b2tlbiBzdG9yYWdlXG4gIGRlZHVwZVRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBldmVudCBkZWR1cGxpY2F0aW9uXG4gIGV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZU5hbWU6IHN0cmluZzsgLy8gRHluYW1vREIgdGFibGUgbmFtZSBmb3IgRXhpc3RlbmNlIENoZWNrIGNhY2hlXG4gIHdoaXRlbGlzdENvbmZpZ1RhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciB3aGl0ZWxpc3QgY29uZmlndXJhdGlvblxuICByYXRlTGltaXRUYWJsZU5hbWU6IHN0cmluZzsgLy8gRHluYW1vREIgdGFibGUgbmFtZSBmb3IgcmF0ZSBsaW1pdGluZ1xuICBhd3NSZWdpb246IHN0cmluZzsgLy8gQVdTIHJlZ2lvbiAoZS5nLiwgYXAtbm9ydGhlYXN0LTEpXG4gIGJlZHJvY2tNb2RlbElkOiBzdHJpbmc7IC8vIEJlZHJvY2sgbW9kZWwgSUQgKGUuZy4sIGFtYXpvbi5ub3ZhLXByby12MTowKVxuICAvKiogQVJOIG9mIFZlcmlmaWNhdGlvbiBBZ2VudCBSdW50aW1lIChBMkEgcGF0aCkuIFJlcXVpcmVkLiAqL1xuICB2ZXJpZmljYXRpb25BZ2VudEFybjogc3RyaW5nO1xuICAvKiogU1FTIHF1ZXVlIGZvciBhc3luYyBhZ2VudCBpbnZvY2F0aW9uICgwMTYpLiBXaGVuIHNldCwgaGFuZGxlciBzZW5kcyByZXF1ZXN0cyBoZXJlIGluc3RlYWQgb2YgaW52b2tpbmcgQWdlbnRDb3JlIGRpcmVjdGx5LiAqL1xuICBhZ2VudEludm9jYXRpb25RdWV1ZT86IHNxcy5JUXVldWU7XG4gIC8qKlxuICAgKiBSZXZpc2lvbiB0b2tlbiBzbyBMYW1iZGEgY29uZmlnIGNoYW5nZXMgd2hlbiBzZWNyZXRzIGNoYW5nZSAoZS5nLiBoYXNoIG9mIHNpZ25pbmcgc2VjcmV0KS5cbiAgICogRW5zdXJlcyB3YXJtIGluc3RhbmNlcyBhcmUgcmV0aXJlZCBhbmQgbmV3IG9uZXMgZmV0Y2ggdXBkYXRlZCBzZWNyZXRzIGZyb20gU2VjcmV0cyBNYW5hZ2VyLlxuICAgKi9cbiAgY29uZmlnUmV2aXNpb24/OiBzdHJpbmc7XG4gIC8qKlxuICAgKiBDaGFubmVsIElEcyB3aGVyZSB0aGUgYm90IGF1dG8tcmVwbGllcyB0byBhbGwgbWVzc2FnZXMgd2l0aG91dCByZXF1aXJpbmcgYSBtZW50aW9uLlxuICAgKiBDb21tYS1zZXBhcmF0ZWQgc3RyaW5nIGlzIHNldCBhcyBBVVRPX1JFUExZX0NIQU5ORUxfSURTIGVudiB2YXIuXG4gICAqL1xuICBhdXRvUmVwbHlDaGFubmVsSWRzPzogc3RyaW5nW107XG4gIC8qKlxuICAgKiBDaGFubmVsIElEcyB3aGVyZSBAbWVudGlvbiByZXNwb25zZXMgYXJlIGFsbG93ZWQuXG4gICAqIFdoZW4gc2V0LCBhcHBfbWVudGlvbiBldmVudHMgZnJvbSBvdGhlciBjaGFubmVscyBhcmUgc2lsZW50bHkgaWdub3JlZC5cbiAgICogQ29tbWEtc2VwYXJhdGVkIHN0cmluZyBpcyBzZXQgYXMgTUVOVElPTl9DSEFOTkVMX0lEUyBlbnYgdmFyLlxuICAgKi9cbiAgbWVudGlvbkNoYW5uZWxJZHM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIFNsYWNrRXZlbnRIYW5kbGVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNsYWNrRXZlbnRIYW5kbGVyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qgc3RhY2sgPSBjZGsuU3RhY2sub2YodGhpcyk7XG4gICAgY29uc3QgbGFtYmRhUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhL3NsYWNrLWV2ZW50LWhhbmRsZXJcIik7XG4gICAgXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbiBmb3IgU2xhY2sgZXZlbnQgaGFuZGxpbmdcbiAgICB0aGlzLmZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkhhbmRsZXJcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiBcImhhbmRsZXIubGFtYmRhX2hhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChsYW1iZGFQYXRoLCB7XG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLmJ1bmRsaW5nSW1hZ2UsXG4gICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgXCJiYXNoXCIsXG4gICAgICAgICAgICBcIi1jXCIsXG4gICAgICAgICAgICBcInBpcCBpbnN0YWxsIC0tbm8tY2FjaGUtZGlyIC1yIHJlcXVpcmVtZW50cy50eHQgLXQgL2Fzc2V0LW91dHB1dCAmJiBjcCAtciAuIC9hc3NldC1vdXRwdXRcIixcbiAgICAgICAgICBdLFxuICAgICAgICAgIC8vIExvY2FsIGJ1bmRsaW5nIGZvciBmYXN0ZXIgYnVpbGRzIGFuZCBDb2xpbWEgY29tcGF0aWJpbGl0eVxuICAgICAgICAgIGxvY2FsOiB7XG4gICAgICAgICAgICB0cnlCdW5kbGUob3V0cHV0RGlyOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBwaXAgaXMgYXZhaWxhYmxlIGxvY2FsbHlcbiAgICAgICAgICAgICAgICBleGVjU3luYyhcInBpcCAtLXZlcnNpb25cIiwgeyBzdGRpbzogXCJwaXBlXCIgfSk7XG4gICAgICAgICAgICAgICAgLy8gSW5zdGFsbCByZXF1aXJlbWVudHMgbG9jYWxseVxuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFxuICAgICAgICAgICAgICAgICAgYHBpcCBpbnN0YWxsIC0tbm8tY2FjaGUtZGlyIC1yICR7cGF0aC5qb2luKGxhbWJkYVBhdGgsIFwicmVxdWlyZW1lbnRzLnR4dFwiKX0gLXQgJHtvdXRwdXREaXJ9IC0tcXVpZXRgLFxuICAgICAgICAgICAgICAgICAgeyBzdGRpbzogXCJwaXBlXCIgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgLy8gQ29weSBzb3VyY2UgZmlsZXMgKHVzaW5nIGZzIGZvciBjcm9zcy1wbGF0Zm9ybSBjb21wYXRpYmlsaXR5KVxuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVzID0gZnMucmVhZGRpclN5bmMobGFtYmRhUGF0aCk7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBzcmNQYXRoID0gcGF0aC5qb2luKGxhbWJkYVBhdGgsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3QgZGVzdFBhdGggPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBmaWxlKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhzcmNQYXRoKTtcbiAgICAgICAgICAgICAgICAgIGlmIChzdGF0LmlzRmlsZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZzLmNvcHlGaWxlU3luYyhzcmNQYXRoLCBkZXN0UGF0aCk7XG4gICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXQuaXNEaXJlY3RvcnkoKSAmJiBmaWxlICE9PSBcIl9fcHljYWNoZV9fXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY3BTeW5jKHNyY1BhdGgsIGRlc3RQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIC8vIEZhbGwgYmFjayB0byBEb2NrZXIgYnVuZGxpbmdcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgLy8gQTJBIC8gRXhlY3V0aW9uIOW/nOetlOW+heOBoe+8iEJlZHJvY2sg5o6o6KuW5ZCr44KA77yJ44CCNjBzIOOBp+OCv+OCpOODoOOCouOCpuODiOOBmeOCi+OBn+OCgSAxMjBzIOOBq+W7tumVt1xuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFRPS0VOX1RBQkxFX05BTUU6IHByb3BzLnRva2VuVGFibGVOYW1lLFxuICAgICAgICBERURVUEVfVEFCTEVfTkFNRTogcHJvcHMuZGVkdXBlVGFibGVOYW1lLFxuICAgICAgICBFWElTVEVOQ0VfQ0hFQ0tfQ0FDSEVfVEFCTEU6IHByb3BzLmV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZU5hbWUsXG4gICAgICAgIFdISVRFTElTVF9UQUJMRV9OQU1FOiBwcm9wcy53aGl0ZWxpc3RDb25maWdUYWJsZU5hbWUsXG4gICAgICAgIFJBVEVfTElNSVRfVEFCTEVfTkFNRTogcHJvcHMucmF0ZUxpbWl0VGFibGVOYW1lLFxuICAgICAgICBBV1NfUkVHSU9OX05BTUU6IHByb3BzLmF3c1JlZ2lvbixcbiAgICAgICAgQkVEUk9DS19NT0RFTF9JRDogcHJvcHMuYmVkcm9ja01vZGVsSWQsXG4gICAgICAgIC8vIFN0b3JlIHNlY3JldCBuYW1lcyAobm90IHZhbHVlcykgaW4gZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgICAgIC8vIExhbWJkYSBmdW5jdGlvbiB3aWxsIGZldGNoIHRoZSBhY3R1YWwgc2VjcmV0IHZhbHVlcyBmcm9tIFNlY3JldHMgTWFuYWdlciBhdCBydW50aW1lXG4gICAgICAgIFNMQUNLX1NJR05JTkdfU0VDUkVUX05BTUU6IHByb3BzLnNsYWNrU2lnbmluZ1NlY3JldC5zZWNyZXROYW1lLFxuICAgICAgICBTTEFDS19CT1RfVE9LRU5fU0VDUkVUX05BTUU6IHByb3BzLnNsYWNrQm90VG9rZW5TZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgLy8gT3B0aW9uYWw6IFdoaXRlbGlzdCBzZWNyZXQgbmFtZSAoY2FuIGJlIHNldCB2aWEgZW52aXJvbm1lbnQgdmFyaWFibGUgb3IgU2VjcmV0cyBNYW5hZ2VyKVxuICAgICAgICAvLyBGb3JtYXQ6IHtzdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWdcbiAgICAgICAgV0hJVEVMSVNUX1NFQ1JFVF9OQU1FOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnYCxcbiAgICAgICAgLy8gQTJBOiBWZXJpZmljYXRpb24gQWdlbnQgUnVudGltZSBBUk4gKHJlcXVpcmVkKVxuICAgICAgICBWRVJJRklDQVRJT05fQUdFTlRfQVJOOiBwcm9wcy52ZXJpZmljYXRpb25BZ2VudEFybixcbiAgICAgICAgLy8gMDE2OiB3aGVuIHNldCwgaGFuZGxlciBzZW5kcyB0byBTUVMgaW5zdGVhZCBvZiBpbnZva2luZyBBZ2VudENvcmUgZGlyZWN0bHlcbiAgICAgICAgLi4uKHByb3BzLmFnZW50SW52b2NhdGlvblF1ZXVlICYmIHtcbiAgICAgICAgICBBR0VOVF9JTlZPQ0FUSU9OX1FVRVVFX1VSTDogcHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUucXVldWVVcmwsXG4gICAgICAgIH0pLFxuICAgICAgICAvLyBXaGVuIHNlY3JldHMgY2hhbmdlLCBjb25maWdSZXZpc2lvbiBjaGFuZ2VzIHNvIExhbWJkYSBnZXRzIG5ldyBjb25maWcgYW5kIGRyb3BzIGNhY2hlZCBzZWNyZXRzXG4gICAgICAgIC4uLihwcm9wcy5jb25maWdSZXZpc2lvbiAmJiB7IENPTkZJR19SRVZJU0lPTjogcHJvcHMuY29uZmlnUmV2aXNpb24gfSksXG4gICAgICAgIC8vIENoYW5uZWxzIHdoZXJlIHRoZSBib3QgYXV0by1yZXBsaWVzIHdpdGhvdXQgcmVxdWlyaW5nIGEgbWVudGlvblxuICAgICAgICAuLi4ocHJvcHMuYXV0b1JlcGx5Q2hhbm5lbElkcyAmJiBwcm9wcy5hdXRvUmVwbHlDaGFubmVsSWRzLmxlbmd0aCA+IDAgJiYge1xuICAgICAgICAgIEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFM6IHByb3BzLmF1dG9SZXBseUNoYW5uZWxJZHMuam9pbihcIixcIiksXG4gICAgICAgIH0pLFxuICAgICAgICAvLyBDaGFubmVscyB3aGVyZSBAbWVudGlvbiByZXNwb25zZXMgYXJlIGFsbG93ZWQgKGVtcHR5ID0gYWxsIGNoYW5uZWxzKVxuICAgICAgICAuLi4ocHJvcHMubWVudGlvbkNoYW5uZWxJZHMgJiYgcHJvcHMubWVudGlvbkNoYW5uZWxJZHMubGVuZ3RoID4gMCAmJiB7XG4gICAgICAgICAgTUVOVElPTl9DSEFOTkVMX0lEUzogcHJvcHMubWVudGlvbkNoYW5uZWxJZHMuam9pbihcIixcIiksXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIDAxNjogR3JhbnQgU1FTIFNlbmRNZXNzYWdlIHdoZW4gYXN5bmMgaW52b2NhdGlvbiBxdWV1ZSBpcyBwcm92aWRlZFxuICAgIGlmIChwcm9wcy5hZ2VudEludm9jYXRpb25RdWV1ZSkge1xuICAgICAgcHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXModGhpcy5mdW5jdGlvbik7XG4gICAgfVxuXG4gICAgLy8gR3JhbnQgTGFtYmRhIGZ1bmN0aW9uIHBlcm1pc3Npb24gdG8gcmVhZCBzZWNyZXRzXG4gICAgcHJvcHMuc2xhY2tTaWduaW5nU2VjcmV0LmdyYW50UmVhZCh0aGlzLmZ1bmN0aW9uKTtcbiAgICBwcm9wcy5zbGFja0JvdFRva2VuU2VjcmV0LmdyYW50UmVhZCh0aGlzLmZ1bmN0aW9uKTtcbiAgICBcbiAgICAvLyBHcmFudCBMYW1iZGEgZnVuY3Rpb24gcGVybWlzc2lvbiB0byByZWFkIHdoaXRlbGlzdCBjb25maWcgZnJvbSBTZWNyZXRzIE1hbmFnZXIgKG9wdGlvbmFsKVxuICAgIC8vIFRoZSBzZWNyZXQgbmFtZSBmb2xsb3dzIHRoZSBwYXR0ZXJuOiB7c3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnXG4gICAgLy8gVGhpcyBwZXJtaXNzaW9uIGFsbG93cyByZWFkaW5nIHRoZSB3aGl0ZWxpc3QgY29uZmlnIHNlY3JldCBpZiBpdCBleGlzdHNcbiAgICB0aGlzLmZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJzZWNyZXRzbWFuYWdlcjpHZXRTZWNyZXRWYWx1ZVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c2VjcmV0c21hbmFnZXI6JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufToke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fTpzZWNyZXQ6JHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBHcmFudCBBZ2VudENvcmUgUnVudGltZSBpbnZvY2F0aW9uIHBlcm1pc3Npb24gKEEyQSBwYXRoKS5cbiAgICAvLyAwMjYgVVMxIChUMDA3KTogTGVhc3QgcHJpdmlsZWdlIOKAlCBzY29wZWQgdG8gc3BlY2lmaWMgQVJOcyBwZXIgYXVkaXQtaWFtLWJlZHJvY2subWQuXG4gICAgLy8gUGVyIEFXUzogYm90aCBydW50aW1lIGFuZCBlbmRwb2ludCBtYXkgYmUgZXZhbHVhdGVkIGZvciBJbnZva2VBZ2VudFJ1bnRpbWUuXG4gICAgLy8gaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2JlZHJvY2stYWdlbnRjb3JlL2xhdGVzdC9kZXZndWlkZS9yZXNvdXJjZS1iYXNlZC1wb2xpY2llcy5odG1sXG4gICAgY29uc3QgcnVudGltZUVuZHBvaW50QXJuID0gYCR7cHJvcHMudmVyaWZpY2F0aW9uQWdlbnRBcm59L3J1bnRpbWUtZW5kcG9pbnQvREVGQVVMVGA7XG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy52ZXJpZmljYXRpb25BZ2VudEFybiwgcnVudGltZUVuZHBvaW50QXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEdyYW50IENsb3VkV2F0Y2ggcGVybWlzc2lvbnMgZm9yIEV4aXN0ZW5jZSBDaGVjayBtZXRyaWNzIChQaGFzZSA2IC0gUG9saXNoKVxuICAgIHRoaXMuZnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcImNsb3Vkd2F0Y2g6UHV0TWV0cmljRGF0YVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImNsb3Vkd2F0Y2g6bmFtZXNwYWNlXCI6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICApO1xuXG4gIH1cbn1cbiJdfQ==