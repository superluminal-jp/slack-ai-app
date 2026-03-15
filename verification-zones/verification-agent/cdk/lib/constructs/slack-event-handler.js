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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xhY2stZXZlbnQtaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNsYWNrLWV2ZW50LWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx5REFBMkM7QUFHM0MsMkNBQXVDO0FBQ3ZDLDJDQUE2QjtBQUM3QixpREFBeUM7QUFDekMsdUNBQXlCO0FBeUN6QixNQUFhLGlCQUFrQixTQUFRLHNCQUFTO0lBQzlCLFFBQVEsQ0FBa0I7SUFDMUIsV0FBVyxDQUFxQjtJQUVoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsK0JBQStCLENBQUMsQ0FBQztRQUV6RSxrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNuRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSx3QkFBd0I7WUFDakMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRTtnQkFDdEMsUUFBUSxFQUFFO29CQUNSLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhO29CQUMvQyxPQUFPLEVBQUU7d0JBQ1AsTUFBTTt3QkFDTixJQUFJO3dCQUNKLDBGQUEwRjtxQkFDM0Y7b0JBQ0QsNERBQTREO29CQUM1RCxLQUFLLEVBQUU7d0JBQ0wsU0FBUyxDQUFD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MkJBQTJCLENBQUM7UUFDcEYsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQzNCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRSxDQUFDLHNDQUFzQyxDQUFDO1lBQ2pELFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxrQkFBa0IsQ0FBQztTQUM1RCxDQUFDLENBQ0gsQ0FBQztRQUVGLDhFQUE4RTtRQUM5RSxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FDM0IsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFLENBQUMsMEJBQTBCLENBQUM7WUFDckMsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDO1lBQ2hCLFVBQVUsRUFBRTtnQkFDVixZQUFZLEVBQUU7b0JBQ1osc0JBQXNCLEVBQUUsbUJBQW1CO2lCQUM1QzthQUNGO1NBQ0YsQ0FBQyxDQUNILENBQUM7UUFFRixpRUFBaUU7UUFDakUsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQztZQUM5QyxRQUFRLEVBQUUsTUFBTSxDQUFDLG1CQUFtQixDQUFDLElBQUk7U0FDMUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBNUlELDhDQTRJQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyXCI7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zcXNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gXCJjaGlsZF9wcm9jZXNzXCI7XG5pbXBvcnQgKiBhcyBmcyBmcm9tIFwiZnNcIjtcblxuLyoqXG4gKiBTbGFjayBFdmVudCBIYW5kbGVyIExhbWJkYSBjb25zdHJ1Y3QuXG4gKlxuICogUHVycG9zZTogUmVjZWl2ZSBTbGFjayBldmVudHMgKEZ1bmN0aW9uIFVSTCksIHZhbGlkYXRlIHNpZ25hdHVyZSBhbmQgdG9rZW4sIHRoZW4gaW52b2tlXG4gKiBWZXJpZmljYXRpb24gQWdlbnQgKEEyQSkgb3IgZW5xdWV1ZSB0byBTUVMgZm9yIGFzeW5jIGludm9jYXRpb24uXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogTGFtYmRhIHdpdGggRnVuY3Rpb24gVVJMOyBTbGFjayBzaWduaW5nIHZlcmlmaWNhdGlvbjsgRHluYW1vREIvU2VjcmV0c1xuICogaW50ZWdyYXRpb247IGludm9rZSBBZ2VudENvcmUgb3IgcHVzaCB0byBhZ2VudEludm9jYXRpb25RdWV1ZS5cbiAqXG4gKiBJbnB1dHM6IFNsYWNrRXZlbnRIYW5kbGVyUHJvcHMgKHNlY3JldHMsIHRhYmxlIG5hbWVzLCB2ZXJpZmljYXRpb25BZ2VudEFybiwgcmVnaW9uLCBtb2RlbCwgb3B0aW9uYWwgcXVldWUpLlxuICpcbiAqIE91dHB1dHM6IGZ1bmN0aW9uLCBmdW5jdGlvblVybC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTbGFja0V2ZW50SGFuZGxlclByb3BzIHtcbiAgc2xhY2tTaWduaW5nU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0OyAvLyBTbGFjayBhcHAgc2lnbmluZyBzZWNyZXQgZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgc2xhY2tCb3RUb2tlblNlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDsgLy8gQm90IE9BdXRoIHRva2VuIGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gIHRva2VuVGFibGVOYW1lOiBzdHJpbmc7IC8vIER5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHRva2VuIHN0b3JhZ2VcbiAgZGVkdXBlVGFibGVOYW1lOiBzdHJpbmc7IC8vIER5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIGV2ZW50IGRlZHVwbGljYXRpb25cbiAgZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBFeGlzdGVuY2UgQ2hlY2sgY2FjaGVcbiAgd2hpdGVsaXN0Q29uZmlnVGFibGVOYW1lOiBzdHJpbmc7IC8vIER5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHdoaXRlbGlzdCBjb25maWd1cmF0aW9uXG4gIHJhdGVMaW1pdFRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciByYXRlIGxpbWl0aW5nXG4gIGF3c1JlZ2lvbjogc3RyaW5nOyAvLyBBV1MgcmVnaW9uIChlLmcuLCBhcC1ub3J0aGVhc3QtMSlcbiAgYmVkcm9ja01vZGVsSWQ6IHN0cmluZzsgLy8gQmVkcm9jayBtb2RlbCBJRCAoZS5nLiwgYW1hem9uLm5vdmEtcHJvLXYxOjApXG4gIC8qKiBBUk4gb2YgVmVyaWZpY2F0aW9uIEFnZW50IFJ1bnRpbWUgKEEyQSBwYXRoKS4gUmVxdWlyZWQuICovXG4gIHZlcmlmaWNhdGlvbkFnZW50QXJuOiBzdHJpbmc7XG4gIC8qKiBTUVMgcXVldWUgZm9yIGFzeW5jIGFnZW50IGludm9jYXRpb24gKDAxNikuIFdoZW4gc2V0LCBoYW5kbGVyIHNlbmRzIHJlcXVlc3RzIGhlcmUgaW5zdGVhZCBvZiBpbnZva2luZyBBZ2VudENvcmUgZGlyZWN0bHkuICovXG4gIGFnZW50SW52b2NhdGlvblF1ZXVlPzogc3FzLklRdWV1ZTtcbiAgLyoqXG4gICAqIFJldmlzaW9uIHRva2VuIHNvIExhbWJkYSBjb25maWcgY2hhbmdlcyB3aGVuIHNlY3JldHMgY2hhbmdlIChlLmcuIGhhc2ggb2Ygc2lnbmluZyBzZWNyZXQpLlxuICAgKiBFbnN1cmVzIHdhcm0gaW5zdGFuY2VzIGFyZSByZXRpcmVkIGFuZCBuZXcgb25lcyBmZXRjaCB1cGRhdGVkIHNlY3JldHMgZnJvbSBTZWNyZXRzIE1hbmFnZXIuXG4gICAqL1xuICBjb25maWdSZXZpc2lvbj86IHN0cmluZztcbiAgLyoqXG4gICAqIENoYW5uZWwgSURzIHdoZXJlIHRoZSBib3QgYXV0by1yZXBsaWVzIHRvIGFsbCBtZXNzYWdlcyB3aXRob3V0IHJlcXVpcmluZyBhIG1lbnRpb24uXG4gICAqIENvbW1hLXNlcGFyYXRlZCBzdHJpbmcgaXMgc2V0IGFzIEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFMgZW52IHZhci5cbiAgICovXG4gIGF1dG9SZXBseUNoYW5uZWxJZHM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIFNsYWNrRXZlbnRIYW5kbGVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBmdW5jdGlvblVybDogbGFtYmRhLkZ1bmN0aW9uVXJsO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTbGFja0V2ZW50SGFuZGxlclByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHN0YWNrID0gY2RrLlN0YWNrLm9mKHRoaXMpO1xuICAgIGNvbnN0IGxhbWJkYVBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYS9zbGFjay1ldmVudC1oYW5kbGVyXCIpO1xuICAgIFxuICAgIC8vIENyZWF0ZSBMYW1iZGEgZnVuY3Rpb24gZm9yIFNsYWNrIGV2ZW50IGhhbmRsaW5nXG4gICAgdGhpcy5mdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJIYW5kbGVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQobGFtYmRhUGF0aCwge1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMS5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgIFwiYmFzaFwiLFxuICAgICAgICAgICAgXCItY1wiLFxuICAgICAgICAgICAgXCJwaXAgaW5zdGFsbCAtLW5vLWNhY2hlLWRpciAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLXIgLiAvYXNzZXQtb3V0cHV0XCIsXG4gICAgICAgICAgXSxcbiAgICAgICAgICAvLyBMb2NhbCBidW5kbGluZyBmb3IgZmFzdGVyIGJ1aWxkcyBhbmQgQ29saW1hIGNvbXBhdGliaWxpdHlcbiAgICAgICAgICBsb2NhbDoge1xuICAgICAgICAgICAgdHJ5QnVuZGxlKG91dHB1dERpcjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcGlwIGlzIGF2YWlsYWJsZSBsb2NhbGx5XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXCJwaXAgLS12ZXJzaW9uXCIsIHsgc3RkaW86IFwicGlwZVwiIH0pO1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbGwgcmVxdWlyZW1lbnRzIGxvY2FsbHlcbiAgICAgICAgICAgICAgICBleGVjU3luYyhcbiAgICAgICAgICAgICAgICAgIGBwaXAgaW5zdGFsbCAtLW5vLWNhY2hlLWRpciAtciAke3BhdGguam9pbihsYW1iZGFQYXRoLCBcInJlcXVpcmVtZW50cy50eHRcIil9IC10ICR7b3V0cHV0RGlyfSAtLXF1aWV0YCxcbiAgICAgICAgICAgICAgICAgIHsgc3RkaW86IFwicGlwZVwiIH1cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIC8vIENvcHkgc291cmNlIGZpbGVzICh1c2luZyBmcyBmb3IgY3Jvc3MtcGxhdGZvcm0gY29tcGF0aWJpbGl0eSlcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlcyA9IGZzLnJlYWRkaXJTeW5jKGxhbWJkYVBhdGgpO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3JjUGF0aCA9IHBhdGguam9pbihsYW1iZGFQYXRoLCBmaWxlKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGRlc3RQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoc3JjUGF0aCk7XG4gICAgICAgICAgICAgICAgICBpZiAoc3RhdC5pc0ZpbGUoKSkge1xuICAgICAgICAgICAgICAgICAgICBmcy5jb3B5RmlsZVN5bmMoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0LmlzRGlyZWN0b3J5KCkgJiYgZmlsZSAhPT0gXCJfX3B5Y2FjaGVfX1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZzLmNwU3luYyhzcmNQYXRoLCBkZXN0UGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAvLyBGYWxsIGJhY2sgdG8gRG9ja2VyIGJ1bmRsaW5nXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIC8vIEEyQSAvIEV4ZWN1dGlvbiDlv5znrZTlvoXjgaHvvIhCZWRyb2NrIOaOqOirluWQq+OCgO+8ieOAgjYwcyDjgafjgr/jgqTjg6DjgqLjgqbjg4jjgZnjgovjgZ/jgoEgMTIwcyDjgavlu7bplbdcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBUT0tFTl9UQUJMRV9OQU1FOiBwcm9wcy50b2tlblRhYmxlTmFtZSxcbiAgICAgICAgREVEVVBFX1RBQkxFX05BTUU6IHByb3BzLmRlZHVwZVRhYmxlTmFtZSxcbiAgICAgICAgRVhJU1RFTkNFX0NIRUNLX0NBQ0hFX1RBQkxFOiBwcm9wcy5leGlzdGVuY2VDaGVja0NhY2hlVGFibGVOYW1lLFxuICAgICAgICBXSElURUxJU1RfVEFCTEVfTkFNRTogcHJvcHMud2hpdGVsaXN0Q29uZmlnVGFibGVOYW1lLFxuICAgICAgICBSQVRFX0xJTUlUX1RBQkxFX05BTUU6IHByb3BzLnJhdGVMaW1pdFRhYmxlTmFtZSxcbiAgICAgICAgQVdTX1JFR0lPTl9OQU1FOiBwcm9wcy5hd3NSZWdpb24sXG4gICAgICAgIEJFRFJPQ0tfTU9ERUxfSUQ6IHByb3BzLmJlZHJvY2tNb2RlbElkLFxuICAgICAgICAvLyBTdG9yZSBzZWNyZXQgbmFtZXMgKG5vdCB2YWx1ZXMpIGluIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgICAgICAvLyBMYW1iZGEgZnVuY3Rpb24gd2lsbCBmZXRjaCB0aGUgYWN0dWFsIHNlY3JldCB2YWx1ZXMgZnJvbSBTZWNyZXRzIE1hbmFnZXIgYXQgcnVudGltZVxuICAgICAgICBTTEFDS19TSUdOSU5HX1NFQ1JFVF9OQU1FOiBwcm9wcy5zbGFja1NpZ25pbmdTZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgU0xBQ0tfQk9UX1RPS0VOX1NFQ1JFVF9OQU1FOiBwcm9wcy5zbGFja0JvdFRva2VuU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIC8vIE9wdGlvbmFsOiBXaGl0ZWxpc3Qgc2VjcmV0IG5hbWUgKGNhbiBiZSBzZXQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlIG9yIFNlY3JldHMgTWFuYWdlcilcbiAgICAgICAgLy8gRm9ybWF0OiB7c3RhY2tOYW1lfS9zbGFjay93aGl0ZWxpc3QtY29uZmlnXG4gICAgICAgIFdISVRFTElTVF9TRUNSRVRfTkFNRTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ2AsXG4gICAgICAgIC8vIEEyQTogVmVyaWZpY2F0aW9uIEFnZW50IFJ1bnRpbWUgQVJOIChyZXF1aXJlZClcbiAgICAgICAgVkVSSUZJQ0FUSU9OX0FHRU5UX0FSTjogcHJvcHMudmVyaWZpY2F0aW9uQWdlbnRBcm4sXG4gICAgICAgIC8vIDAxNjogd2hlbiBzZXQsIGhhbmRsZXIgc2VuZHMgdG8gU1FTIGluc3RlYWQgb2YgaW52b2tpbmcgQWdlbnRDb3JlIGRpcmVjdGx5XG4gICAgICAgIC4uLihwcm9wcy5hZ2VudEludm9jYXRpb25RdWV1ZSAmJiB7XG4gICAgICAgICAgQUdFTlRfSU5WT0NBVElPTl9RVUVVRV9VUkw6IHByb3BzLmFnZW50SW52b2NhdGlvblF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICB9KSxcbiAgICAgICAgLy8gV2hlbiBzZWNyZXRzIGNoYW5nZSwgY29uZmlnUmV2aXNpb24gY2hhbmdlcyBzbyBMYW1iZGEgZ2V0cyBuZXcgY29uZmlnIGFuZCBkcm9wcyBjYWNoZWQgc2VjcmV0c1xuICAgICAgICAuLi4ocHJvcHMuY29uZmlnUmV2aXNpb24gJiYgeyBDT05GSUdfUkVWSVNJT046IHByb3BzLmNvbmZpZ1JldmlzaW9uIH0pLFxuICAgICAgICAvLyBDaGFubmVscyB3aGVyZSB0aGUgYm90IGF1dG8tcmVwbGllcyB3aXRob3V0IHJlcXVpcmluZyBhIG1lbnRpb25cbiAgICAgICAgLi4uKHByb3BzLmF1dG9SZXBseUNoYW5uZWxJZHMgJiYgcHJvcHMuYXV0b1JlcGx5Q2hhbm5lbElkcy5sZW5ndGggPiAwICYmIHtcbiAgICAgICAgICBBVVRPX1JFUExZX0NIQU5ORUxfSURTOiBwcm9wcy5hdXRvUmVwbHlDaGFubmVsSWRzLmpvaW4oXCIsXCIpLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyAwMTY6IEdyYW50IFNRUyBTZW5kTWVzc2FnZSB3aGVuIGFzeW5jIGludm9jYXRpb24gcXVldWUgaXMgcHJvdmlkZWRcbiAgICBpZiAocHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUpIHtcbiAgICAgIHByb3BzLmFnZW50SW52b2NhdGlvblF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKHRoaXMuZnVuY3Rpb24pO1xuICAgIH1cblxuICAgIC8vIEdyYW50IExhbWJkYSBmdW5jdGlvbiBwZXJtaXNzaW9uIHRvIHJlYWQgc2VjcmV0c1xuICAgIHByb3BzLnNsYWNrU2lnbmluZ1NlY3JldC5ncmFudFJlYWQodGhpcy5mdW5jdGlvbik7XG4gICAgcHJvcHMuc2xhY2tCb3RUb2tlblNlY3JldC5ncmFudFJlYWQodGhpcy5mdW5jdGlvbik7XG4gICAgXG4gICAgLy8gR3JhbnQgTGFtYmRhIGZ1bmN0aW9uIHBlcm1pc3Npb24gdG8gcmVhZCB3aGl0ZWxpc3QgY29uZmlnIGZyb20gU2VjcmV0cyBNYW5hZ2VyIChvcHRpb25hbClcbiAgICAvLyBUaGUgc2VjcmV0IG5hbWUgZm9sbG93cyB0aGUgcGF0dGVybjoge3N0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ1xuICAgIC8vIFRoaXMgcGVybWlzc2lvbiBhbGxvd3MgcmVhZGluZyB0aGUgd2hpdGVsaXN0IGNvbmZpZyBzZWNyZXQgaWYgaXQgZXhpc3RzXG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wic2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWVcIl0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudH06c2VjcmV0OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgQWdlbnRDb3JlIFJ1bnRpbWUgaW52b2NhdGlvbiBwZXJtaXNzaW9uIChBMkEgcGF0aCkuXG4gICAgLy8gMDI2IFVTMSAoVDAwNyk6IExlYXN0IHByaXZpbGVnZSDigJQgc2NvcGVkIHRvIHNwZWNpZmljIEFSTnMgcGVyIGF1ZGl0LWlhbS1iZWRyb2NrLm1kLlxuICAgIC8vIFBlciBBV1M6IGJvdGggcnVudGltZSBhbmQgZW5kcG9pbnQgbWF5IGJlIGV2YWx1YXRlZCBmb3IgSW52b2tlQWdlbnRSdW50aW1lLlxuICAgIC8vIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9iZWRyb2NrLWFnZW50Y29yZS9sYXRlc3QvZGV2Z3VpZGUvcmVzb3VyY2UtYmFzZWQtcG9saWNpZXMuaHRtbFxuICAgIGNvbnN0IHJ1bnRpbWVFbmRwb2ludEFybiA9IGAke3Byb3BzLnZlcmlmaWNhdGlvbkFnZW50QXJufS9ydW50aW1lLWVuZHBvaW50L0RFRkFVTFRgO1xuICAgIHRoaXMuZnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMudmVyaWZpY2F0aW9uQWdlbnRBcm4sIHJ1bnRpbWVFbmRwb2ludEFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBHcmFudCBDbG91ZFdhdGNoIHBlcm1pc3Npb25zIGZvciBFeGlzdGVuY2UgQ2hlY2sgbWV0cmljcyAoUGhhc2UgNiAtIFBvbGlzaClcbiAgICB0aGlzLmZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGFcIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgXCJjbG91ZHdhdGNoOm5hbWVzcGFjZVwiOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBGdW5jdGlvbiBVUkwgKG5vIGF1dGggLSBzaWduYXR1cmUgdmVyaWZpY2F0aW9uIGluIGNvZGUpXG4gICAgdGhpcy5mdW5jdGlvblVybCA9IHRoaXMuZnVuY3Rpb24uYWRkRnVuY3Rpb25Vcmwoe1xuICAgICAgYXV0aFR5cGU6IGxhbWJkYS5GdW5jdGlvblVybEF1dGhUeXBlLk5PTkUsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==