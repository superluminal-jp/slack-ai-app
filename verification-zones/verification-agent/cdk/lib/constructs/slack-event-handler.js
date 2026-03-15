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
    functionUrl;
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
        // Create Function URL (no auth - signature verification in code)
        this.functionUrl = this.function.addFunctionUrl({
            authType: lambda.FunctionUrlAuthType.NONE,
        });
    }
}
exports.SlackEventHandler = SlackEventHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xhY2stZXZlbnQtaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNsYWNrLWV2ZW50LWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx5REFBMkM7QUFHM0MsMkNBQXVDO0FBQ3ZDLDJDQUE2QjtBQUM3QixpREFBeUM7QUFDekMsdUNBQXlCO0FBK0N6QixNQUFhLGlCQUFrQixTQUFRLHNCQUFTO0lBQzlCLFFBQVEsQ0FBa0I7SUFDMUIsV0FBVyxDQUFxQjtJQUVoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsK0JBQStCLENBQUMsQ0FBQztRQUV6RSxrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNuRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSx3QkFBd0I7WUFDakMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRTtnQkFDdEMsUUFBUSxFQUFFO29CQUNSLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhO29CQUMvQyxPQUFPLEVBQUU7d0JBQ1AsTUFBTTt3QkFDTixJQUFJO3dCQUNKLDBGQUEwRjtxQkFDM0Y7b0JBQ0QsNERBQTREO29CQUM1RCxLQUFLLEVBQUU7d0JBQ0wsU0FBUyxDQUFD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QUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUywwQkFBMEI7YUFDbko7U0FDRixDQUFDLENBQ0gsQ0FBQztRQUVGLDREQUE0RDtRQUM1RCxzRkFBc0Y7UUFDdEYsOEVBQThFO1FBQzlFLDZGQUE2RjtRQUM3RixNQUFNLGtCQUFrQixHQUFHLEdBQUcsS0FBSyxDQUFDLG9CQUFvQiwyQkFBMkIsQ0FBQztRQUNwRixJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FDM0IsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFLENBQUMsc0NBQXNDLENBQUM7WUFDakQsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLG9CQUFvQixFQUFFLGtCQUFrQixDQUFDO1NBQzVELENBQUMsQ0FDSCxDQUFDO1FBRUYsOEVBQThFO1FBQzlFLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUMzQixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQztZQUNyQyxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDaEIsVUFBVSxFQUFFO2dCQUNWLFlBQVksRUFBRTtvQkFDWixzQkFBc0IsRUFBRSxtQkFBbUI7aUJBQzVDO2FBQ0Y7U0FDRixDQUFDLENBQ0gsQ0FBQztRQUVGLGlFQUFpRTtRQUNqRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDO1lBQzlDLFFBQVEsRUFBRSxNQUFNLENBQUMsbUJBQW1CLENBQUMsSUFBSTtTQUMxQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFoSkQsOENBZ0pDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXJcIjtcbmltcG9ydCAqIGFzIHNxcyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNxc1wiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSBcImNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCAqIGFzIGZzIGZyb20gXCJmc1wiO1xuXG4vKipcbiAqIFNsYWNrIEV2ZW50IEhhbmRsZXIgTGFtYmRhIGNvbnN0cnVjdC5cbiAqXG4gKiBQdXJwb3NlOiBSZWNlaXZlIFNsYWNrIGV2ZW50cyAoRnVuY3Rpb24gVVJMKSwgdmFsaWRhdGUgc2lnbmF0dXJlIGFuZCB0b2tlbiwgdGhlbiBpbnZva2VcbiAqIFZlcmlmaWNhdGlvbiBBZ2VudCAoQTJBKSBvciBlbnF1ZXVlIHRvIFNRUyBmb3IgYXN5bmMgaW52b2NhdGlvbi5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOiBMYW1iZGEgd2l0aCBGdW5jdGlvbiBVUkw7IFNsYWNrIHNpZ25pbmcgdmVyaWZpY2F0aW9uOyBEeW5hbW9EQi9TZWNyZXRzXG4gKiBpbnRlZ3JhdGlvbjsgaW52b2tlIEFnZW50Q29yZSBvciBwdXNoIHRvIGFnZW50SW52b2NhdGlvblF1ZXVlLlxuICpcbiAqIElucHV0czogU2xhY2tFdmVudEhhbmRsZXJQcm9wcyAoc2VjcmV0cywgdGFibGUgbmFtZXMsIHZlcmlmaWNhdGlvbkFnZW50QXJuLCByZWdpb24sIG1vZGVsLCBvcHRpb25hbCBxdWV1ZSkuXG4gKlxuICogT3V0cHV0czogZnVuY3Rpb24sIGZ1bmN0aW9uVXJsLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNsYWNrRXZlbnRIYW5kbGVyUHJvcHMge1xuICBzbGFja1NpZ25pbmdTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7IC8vIFNsYWNrIGFwcCBzaWduaW5nIHNlY3JldCBmcm9tIFNlY3JldHMgTWFuYWdlclxuICBzbGFja0JvdFRva2VuU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0OyAvLyBCb3QgT0F1dGggdG9rZW4gZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgdG9rZW5UYWJsZU5hbWU6IHN0cmluZzsgLy8gRHluYW1vREIgdGFibGUgbmFtZSBmb3IgdG9rZW4gc3RvcmFnZVxuICBkZWR1cGVUYWJsZU5hbWU6IHN0cmluZzsgLy8gRHluYW1vREIgdGFibGUgbmFtZSBmb3IgZXZlbnQgZGVkdXBsaWNhdGlvblxuICBleGlzdGVuY2VDaGVja0NhY2hlVGFibGVOYW1lOiBzdHJpbmc7IC8vIER5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIEV4aXN0ZW5jZSBDaGVjayBjYWNoZVxuICB3aGl0ZWxpc3RDb25maWdUYWJsZU5hbWU6IHN0cmluZzsgLy8gRHluYW1vREIgdGFibGUgbmFtZSBmb3Igd2hpdGVsaXN0IGNvbmZpZ3VyYXRpb25cbiAgcmF0ZUxpbWl0VGFibGVOYW1lOiBzdHJpbmc7IC8vIER5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHJhdGUgbGltaXRpbmdcbiAgYXdzUmVnaW9uOiBzdHJpbmc7IC8vIEFXUyByZWdpb24gKGUuZy4sIGFwLW5vcnRoZWFzdC0xKVxuICBiZWRyb2NrTW9kZWxJZDogc3RyaW5nOyAvLyBCZWRyb2NrIG1vZGVsIElEIChlLmcuLCBhbWF6b24ubm92YS1wcm8tdjE6MClcbiAgLyoqIEFSTiBvZiBWZXJpZmljYXRpb24gQWdlbnQgUnVudGltZSAoQTJBIHBhdGgpLiBSZXF1aXJlZC4gKi9cbiAgdmVyaWZpY2F0aW9uQWdlbnRBcm46IHN0cmluZztcbiAgLyoqIFNRUyBxdWV1ZSBmb3IgYXN5bmMgYWdlbnQgaW52b2NhdGlvbiAoMDE2KS4gV2hlbiBzZXQsIGhhbmRsZXIgc2VuZHMgcmVxdWVzdHMgaGVyZSBpbnN0ZWFkIG9mIGludm9raW5nIEFnZW50Q29yZSBkaXJlY3RseS4gKi9cbiAgYWdlbnRJbnZvY2F0aW9uUXVldWU/OiBzcXMuSVF1ZXVlO1xuICAvKipcbiAgICogUmV2aXNpb24gdG9rZW4gc28gTGFtYmRhIGNvbmZpZyBjaGFuZ2VzIHdoZW4gc2VjcmV0cyBjaGFuZ2UgKGUuZy4gaGFzaCBvZiBzaWduaW5nIHNlY3JldCkuXG4gICAqIEVuc3VyZXMgd2FybSBpbnN0YW5jZXMgYXJlIHJldGlyZWQgYW5kIG5ldyBvbmVzIGZldGNoIHVwZGF0ZWQgc2VjcmV0cyBmcm9tIFNlY3JldHMgTWFuYWdlci5cbiAgICovXG4gIGNvbmZpZ1JldmlzaW9uPzogc3RyaW5nO1xuICAvKipcbiAgICogQ2hhbm5lbCBJRHMgd2hlcmUgdGhlIGJvdCBhdXRvLXJlcGxpZXMgdG8gYWxsIG1lc3NhZ2VzIHdpdGhvdXQgcmVxdWlyaW5nIGEgbWVudGlvbi5cbiAgICogQ29tbWEtc2VwYXJhdGVkIHN0cmluZyBpcyBzZXQgYXMgQVVUT19SRVBMWV9DSEFOTkVMX0lEUyBlbnYgdmFyLlxuICAgKi9cbiAgYXV0b1JlcGx5Q2hhbm5lbElkcz86IHN0cmluZ1tdO1xuICAvKipcbiAgICogQ2hhbm5lbCBJRHMgd2hlcmUgQG1lbnRpb24gcmVzcG9uc2VzIGFyZSBhbGxvd2VkLlxuICAgKiBXaGVuIHNldCwgYXBwX21lbnRpb24gZXZlbnRzIGZyb20gb3RoZXIgY2hhbm5lbHMgYXJlIHNpbGVudGx5IGlnbm9yZWQuXG4gICAqIENvbW1hLXNlcGFyYXRlZCBzdHJpbmcgaXMgc2V0IGFzIE1FTlRJT05fQ0hBTk5FTF9JRFMgZW52IHZhci5cbiAgICovXG4gIG1lbnRpb25DaGFubmVsSWRzPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBTbGFja0V2ZW50SGFuZGxlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBmdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZnVuY3Rpb25Vcmw6IGxhbWJkYS5GdW5jdGlvblVybDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2xhY2tFdmVudEhhbmRsZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBzdGFjayA9IGNkay5TdGFjay5vZih0aGlzKTtcbiAgICBjb25zdCBsYW1iZGFQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGEvc2xhY2stZXZlbnQtaGFuZGxlclwiKTtcbiAgICBcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBTbGFjayBldmVudCBoYW5kbGluZ1xuICAgIHRoaXMuZnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiSGFuZGxlclwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5sYW1iZGFfaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KGxhbWJkYVBhdGgsIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICBcImJhc2hcIixcbiAgICAgICAgICAgIFwiLWNcIixcbiAgICAgICAgICAgIFwicGlwIGluc3RhbGwgLS1uby1jYWNoZS1kaXIgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmIGNwIC1yIC4gL2Fzc2V0LW91dHB1dFwiLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgLy8gTG9jYWwgYnVuZGxpbmcgZm9yIGZhc3RlciBidWlsZHMgYW5kIENvbGltYSBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgbG9jYWw6IHtcbiAgICAgICAgICAgIHRyeUJ1bmRsZShvdXRwdXREaXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHBpcCBpcyBhdmFpbGFibGUgbG9jYWxseVxuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFwicGlwIC0tdmVyc2lvblwiLCB7IHN0ZGlvOiBcInBpcGVcIiB9KTtcbiAgICAgICAgICAgICAgICAvLyBJbnN0YWxsIHJlcXVpcmVtZW50cyBsb2NhbGx5XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXG4gICAgICAgICAgICAgICAgICBgcGlwIGluc3RhbGwgLS1uby1jYWNoZS1kaXIgLXIgJHtwYXRoLmpvaW4obGFtYmRhUGF0aCwgXCJyZXF1aXJlbWVudHMudHh0XCIpfSAtdCAke291dHB1dERpcn0gLS1xdWlldGAsXG4gICAgICAgICAgICAgICAgICB7IHN0ZGlvOiBcInBpcGVcIiB9XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvLyBDb3B5IHNvdXJjZSBmaWxlcyAodXNpbmcgZnMgZm9yIGNyb3NzLXBsYXRmb3JtIGNvbXBhdGliaWxpdHkpXG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhsYW1iZGFQYXRoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4obGFtYmRhUGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHNyY1BhdGgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIGZpbGUgIT09IFwiX19weWNhY2hlX19cIikge1xuICAgICAgICAgICAgICAgICAgICBmcy5jcFN5bmMoc3JjUGF0aCwgZGVzdFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gRmFsbCBiYWNrIHRvIERvY2tlciBidW5kbGluZ1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICAvLyBBMkEgLyBFeGVjdXRpb24g5b+c562U5b6F44Gh77yIQmVkcm9jayDmjqjoq5blkKvjgoDvvInjgII2MHMg44Gn44K/44Kk44Og44Ki44Km44OI44GZ44KL44Gf44KBIDEyMHMg44Gr5bu26ZW3XG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMjApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVE9LRU5fVEFCTEVfTkFNRTogcHJvcHMudG9rZW5UYWJsZU5hbWUsXG4gICAgICAgIERFRFVQRV9UQUJMRV9OQU1FOiBwcm9wcy5kZWR1cGVUYWJsZU5hbWUsXG4gICAgICAgIEVYSVNURU5DRV9DSEVDS19DQUNIRV9UQUJMRTogcHJvcHMuZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlTmFtZSxcbiAgICAgICAgV0hJVEVMSVNUX1RBQkxFX05BTUU6IHByb3BzLndoaXRlbGlzdENvbmZpZ1RhYmxlTmFtZSxcbiAgICAgICAgUkFURV9MSU1JVF9UQUJMRV9OQU1FOiBwcm9wcy5yYXRlTGltaXRUYWJsZU5hbWUsXG4gICAgICAgIEFXU19SRUdJT05fTkFNRTogcHJvcHMuYXdzUmVnaW9uLFxuICAgICAgICBCRURST0NLX01PREVMX0lEOiBwcm9wcy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgICAgLy8gU3RvcmUgc2VjcmV0IG5hbWVzIChub3QgdmFsdWVzKSBpbiBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICAgICAgLy8gTGFtYmRhIGZ1bmN0aW9uIHdpbGwgZmV0Y2ggdGhlIGFjdHVhbCBzZWNyZXQgdmFsdWVzIGZyb20gU2VjcmV0cyBNYW5hZ2VyIGF0IHJ1bnRpbWVcbiAgICAgICAgU0xBQ0tfU0lHTklOR19TRUNSRVRfTkFNRTogcHJvcHMuc2xhY2tTaWduaW5nU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIFNMQUNLX0JPVF9UT0tFTl9TRUNSRVRfTkFNRTogcHJvcHMuc2xhY2tCb3RUb2tlblNlY3JldC5zZWNyZXROYW1lLFxuICAgICAgICAvLyBPcHRpb25hbDogV2hpdGVsaXN0IHNlY3JldCBuYW1lIChjYW4gYmUgc2V0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSBvciBTZWNyZXRzIE1hbmFnZXIpXG4gICAgICAgIC8vIEZvcm1hdDoge3N0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ1xuICAgICAgICBXSElURUxJU1RfU0VDUkVUX05BTUU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWdgLFxuICAgICAgICAvLyBBMkE6IFZlcmlmaWNhdGlvbiBBZ2VudCBSdW50aW1lIEFSTiAocmVxdWlyZWQpXG4gICAgICAgIFZFUklGSUNBVElPTl9BR0VOVF9BUk46IHByb3BzLnZlcmlmaWNhdGlvbkFnZW50QXJuLFxuICAgICAgICAvLyAwMTY6IHdoZW4gc2V0LCBoYW5kbGVyIHNlbmRzIHRvIFNRUyBpbnN0ZWFkIG9mIGludm9raW5nIEFnZW50Q29yZSBkaXJlY3RseVxuICAgICAgICAuLi4ocHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUgJiYge1xuICAgICAgICAgIEFHRU5UX0lOVk9DQVRJT05fUVVFVUVfVVJMOiBwcm9wcy5hZ2VudEludm9jYXRpb25RdWV1ZS5xdWV1ZVVybCxcbiAgICAgICAgfSksXG4gICAgICAgIC8vIFdoZW4gc2VjcmV0cyBjaGFuZ2UsIGNvbmZpZ1JldmlzaW9uIGNoYW5nZXMgc28gTGFtYmRhIGdldHMgbmV3IGNvbmZpZyBhbmQgZHJvcHMgY2FjaGVkIHNlY3JldHNcbiAgICAgICAgLi4uKHByb3BzLmNvbmZpZ1JldmlzaW9uICYmIHsgQ09ORklHX1JFVklTSU9OOiBwcm9wcy5jb25maWdSZXZpc2lvbiB9KSxcbiAgICAgICAgLy8gQ2hhbm5lbHMgd2hlcmUgdGhlIGJvdCBhdXRvLXJlcGxpZXMgd2l0aG91dCByZXF1aXJpbmcgYSBtZW50aW9uXG4gICAgICAgIC4uLihwcm9wcy5hdXRvUmVwbHlDaGFubmVsSWRzICYmIHByb3BzLmF1dG9SZXBseUNoYW5uZWxJZHMubGVuZ3RoID4gMCAmJiB7XG4gICAgICAgICAgQVVUT19SRVBMWV9DSEFOTkVMX0lEUzogcHJvcHMuYXV0b1JlcGx5Q2hhbm5lbElkcy5qb2luKFwiLFwiKSxcbiAgICAgICAgfSksXG4gICAgICAgIC8vIENoYW5uZWxzIHdoZXJlIEBtZW50aW9uIHJlc3BvbnNlcyBhcmUgYWxsb3dlZCAoZW1wdHkgPSBhbGwgY2hhbm5lbHMpXG4gICAgICAgIC4uLihwcm9wcy5tZW50aW9uQ2hhbm5lbElkcyAmJiBwcm9wcy5tZW50aW9uQ2hhbm5lbElkcy5sZW5ndGggPiAwICYmIHtcbiAgICAgICAgICBNRU5USU9OX0NIQU5ORUxfSURTOiBwcm9wcy5tZW50aW9uQ2hhbm5lbElkcy5qb2luKFwiLFwiKSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gMDE2OiBHcmFudCBTUVMgU2VuZE1lc3NhZ2Ugd2hlbiBhc3luYyBpbnZvY2F0aW9uIHF1ZXVlIGlzIHByb3ZpZGVkXG4gICAgaWYgKHByb3BzLmFnZW50SW52b2NhdGlvblF1ZXVlKSB7XG4gICAgICBwcm9wcy5hZ2VudEludm9jYXRpb25RdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyh0aGlzLmZ1bmN0aW9uKTtcbiAgICB9XG5cbiAgICAvLyBHcmFudCBMYW1iZGEgZnVuY3Rpb24gcGVybWlzc2lvbiB0byByZWFkIHNlY3JldHNcbiAgICBwcm9wcy5zbGFja1NpZ25pbmdTZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZnVuY3Rpb24pO1xuICAgIHByb3BzLnNsYWNrQm90VG9rZW5TZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZnVuY3Rpb24pO1xuICAgIFxuICAgIC8vIEdyYW50IExhbWJkYSBmdW5jdGlvbiBwZXJtaXNzaW9uIHRvIHJlYWQgd2hpdGVsaXN0IGNvbmZpZyBmcm9tIFNlY3JldHMgTWFuYWdlciAob3B0aW9uYWwpXG4gICAgLy8gVGhlIHNlY3JldCBuYW1lIGZvbGxvd3MgdGhlIHBhdHRlcm46IHtzdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWdcbiAgICAvLyBUaGlzIHBlcm1pc3Npb24gYWxsb3dzIHJlYWRpbmcgdGhlIHdoaXRlbGlzdCBjb25maWcgc2VjcmV0IGlmIGl0IGV4aXN0c1xuICAgIHRoaXMuZnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcInNlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9OnNlY3JldDoke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWcqYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEdyYW50IEFnZW50Q29yZSBSdW50aW1lIGludm9jYXRpb24gcGVybWlzc2lvbiAoQTJBIHBhdGgpLlxuICAgIC8vIDAyNiBVUzEgKFQwMDcpOiBMZWFzdCBwcml2aWxlZ2Ug4oCUIHNjb3BlZCB0byBzcGVjaWZpYyBBUk5zIHBlciBhdWRpdC1pYW0tYmVkcm9jay5tZC5cbiAgICAvLyBQZXIgQVdTOiBib3RoIHJ1bnRpbWUgYW5kIGVuZHBvaW50IG1heSBiZSBldmFsdWF0ZWQgZm9yIEludm9rZUFnZW50UnVudGltZS5cbiAgICAvLyBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vYmVkcm9jay1hZ2VudGNvcmUvbGF0ZXN0L2Rldmd1aWRlL3Jlc291cmNlLWJhc2VkLXBvbGljaWVzLmh0bWxcbiAgICBjb25zdCBydW50aW1lRW5kcG9pbnRBcm4gPSBgJHtwcm9wcy52ZXJpZmljYXRpb25BZ2VudEFybn0vcnVudGltZS1lbmRwb2ludC9ERUZBVUxUYDtcbiAgICB0aGlzLmZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIl0sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLnZlcmlmaWNhdGlvbkFnZW50QXJuLCBydW50aW1lRW5kcG9pbnRBcm5dLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgQ2xvdWRXYXRjaCBwZXJtaXNzaW9ucyBmb3IgRXhpc3RlbmNlIENoZWNrIG1ldHJpY3MgKFBoYXNlIDYgLSBQb2xpc2gpXG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgIFwiY2xvdWR3YXRjaDpuYW1lc3BhY2VcIjogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgRnVuY3Rpb24gVVJMIChubyBhdXRoIC0gc2lnbmF0dXJlIHZlcmlmaWNhdGlvbiBpbiBjb2RlKVxuICAgIHRoaXMuZnVuY3Rpb25VcmwgPSB0aGlzLmZ1bmN0aW9uLmFkZEZ1bmN0aW9uVXJsKHtcbiAgICAgIGF1dGhUeXBlOiBsYW1iZGEuRnVuY3Rpb25VcmxBdXRoVHlwZS5OT05FLFxuICAgIH0pO1xuICB9XG59XG4iXX0=