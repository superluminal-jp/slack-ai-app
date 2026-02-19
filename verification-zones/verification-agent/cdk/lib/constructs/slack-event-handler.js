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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xhY2stZXZlbnQtaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNsYWNrLWV2ZW50LWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx5REFBMkM7QUFHM0MsMkNBQXVDO0FBQ3ZDLDJDQUE2QjtBQUM3QixpREFBeUM7QUFDekMsdUNBQXlCO0FBb0N6QixNQUFhLGlCQUFrQixTQUFRLHNCQUFTO0lBQzlCLFFBQVEsQ0FBa0I7SUFDMUIsV0FBVyxDQUFxQjtJQUVoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsK0JBQStCLENBQUMsQ0FBQztRQUV6RSxrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNuRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSx3QkFBd0I7WUFDakMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRTtnQkFDdEMsUUFBUSxFQUFFO29CQUNSLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhO29CQUMvQyxPQUFPLEVBQUU7d0JBQ1AsTUFBTTt3QkFDTixJQUFJO3dCQUNKLDBGQUEwRjtxQkFDM0Y7b0JBQ0QsNERBQTREO29CQUM1RCxLQUFLLEVBQUU7d0JBQ0wsU0FBUyxDQUFD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QyxLQUFLLENBQUMsb0JBQW9CLEVBQUUsa0JBQWtCLENBQUM7U0FDNUQsQ0FBQyxDQUNILENBQUM7UUFFRiw4RUFBOEU7UUFDOUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQzNCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRSxDQUFDLDBCQUEwQixDQUFDO1lBQ3JDLFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztZQUNoQixVQUFVLEVBQUU7Z0JBQ1YsWUFBWSxFQUFFO29CQUNaLHNCQUFzQixFQUFFLG1CQUFtQjtpQkFDNUM7YUFDRjtTQUNGLENBQUMsQ0FDSCxDQUFDO1FBRUYsaUVBQWlFO1FBQ2pFLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUM7WUFDOUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJO1NBQzFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXhJRCw4Q0F3SUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlclwiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tIFwiY2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5cbi8qKlxuICogU2xhY2sgRXZlbnQgSGFuZGxlciBMYW1iZGEgY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IFJlY2VpdmUgU2xhY2sgZXZlbnRzIChGdW5jdGlvbiBVUkwpLCB2YWxpZGF0ZSBzaWduYXR1cmUgYW5kIHRva2VuLCB0aGVuIGludm9rZVxuICogVmVyaWZpY2F0aW9uIEFnZW50IChBMkEpIG9yIGVucXVldWUgdG8gU1FTIGZvciBhc3luYyBpbnZvY2F0aW9uLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IExhbWJkYSB3aXRoIEZ1bmN0aW9uIFVSTDsgU2xhY2sgc2lnbmluZyB2ZXJpZmljYXRpb247IER5bmFtb0RCL1NlY3JldHNcbiAqIGludGVncmF0aW9uOyBpbnZva2UgQWdlbnRDb3JlIG9yIHB1c2ggdG8gYWdlbnRJbnZvY2F0aW9uUXVldWUuXG4gKlxuICogSW5wdXRzOiBTbGFja0V2ZW50SGFuZGxlclByb3BzIChzZWNyZXRzLCB0YWJsZSBuYW1lcywgdmVyaWZpY2F0aW9uQWdlbnRBcm4sIHJlZ2lvbiwgbW9kZWwsIG9wdGlvbmFsIHF1ZXVlKS5cbiAqXG4gKiBPdXRwdXRzOiBmdW5jdGlvbiwgZnVuY3Rpb25VcmwuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2xhY2tFdmVudEhhbmRsZXJQcm9wcyB7XG4gIHNsYWNrU2lnbmluZ1NlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDsgLy8gU2xhY2sgYXBwIHNpZ25pbmcgc2VjcmV0IGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gIHNsYWNrQm90VG9rZW5TZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7IC8vIEJvdCBPQXV0aCB0b2tlbiBmcm9tIFNlY3JldHMgTWFuYWdlclxuICB0b2tlblRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciB0b2tlbiBzdG9yYWdlXG4gIGRlZHVwZVRhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBldmVudCBkZWR1cGxpY2F0aW9uXG4gIGV4aXN0ZW5jZUNoZWNrQ2FjaGVUYWJsZU5hbWU6IHN0cmluZzsgLy8gRHluYW1vREIgdGFibGUgbmFtZSBmb3IgRXhpc3RlbmNlIENoZWNrIGNhY2hlXG4gIHdoaXRlbGlzdENvbmZpZ1RhYmxlTmFtZTogc3RyaW5nOyAvLyBEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciB3aGl0ZWxpc3QgY29uZmlndXJhdGlvblxuICByYXRlTGltaXRUYWJsZU5hbWU6IHN0cmluZzsgLy8gRHluYW1vREIgdGFibGUgbmFtZSBmb3IgcmF0ZSBsaW1pdGluZ1xuICBhd3NSZWdpb246IHN0cmluZzsgLy8gQVdTIHJlZ2lvbiAoZS5nLiwgYXAtbm9ydGhlYXN0LTEpXG4gIGJlZHJvY2tNb2RlbElkOiBzdHJpbmc7IC8vIEJlZHJvY2sgbW9kZWwgSUQgKGUuZy4sIGFtYXpvbi5ub3ZhLXByby12MTowKVxuICAvKiogQVJOIG9mIFZlcmlmaWNhdGlvbiBBZ2VudCBSdW50aW1lIChBMkEgcGF0aCkuIFJlcXVpcmVkLiAqL1xuICB2ZXJpZmljYXRpb25BZ2VudEFybjogc3RyaW5nO1xuICAvKiogU1FTIHF1ZXVlIGZvciBhc3luYyBhZ2VudCBpbnZvY2F0aW9uICgwMTYpLiBXaGVuIHNldCwgaGFuZGxlciBzZW5kcyByZXF1ZXN0cyBoZXJlIGluc3RlYWQgb2YgaW52b2tpbmcgQWdlbnRDb3JlIGRpcmVjdGx5LiAqL1xuICBhZ2VudEludm9jYXRpb25RdWV1ZT86IHNxcy5JUXVldWU7XG4gIC8qKlxuICAgKiBSZXZpc2lvbiB0b2tlbiBzbyBMYW1iZGEgY29uZmlnIGNoYW5nZXMgd2hlbiBzZWNyZXRzIGNoYW5nZSAoZS5nLiBoYXNoIG9mIHNpZ25pbmcgc2VjcmV0KS5cbiAgICogRW5zdXJlcyB3YXJtIGluc3RhbmNlcyBhcmUgcmV0aXJlZCBhbmQgbmV3IG9uZXMgZmV0Y2ggdXBkYXRlZCBzZWNyZXRzIGZyb20gU2VjcmV0cyBNYW5hZ2VyLlxuICAgKi9cbiAgY29uZmlnUmV2aXNpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTbGFja0V2ZW50SGFuZGxlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBmdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZnVuY3Rpb25Vcmw6IGxhbWJkYS5GdW5jdGlvblVybDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2xhY2tFdmVudEhhbmRsZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBzdGFjayA9IGNkay5TdGFjay5vZih0aGlzKTtcbiAgICBjb25zdCBsYW1iZGFQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGEvc2xhY2stZXZlbnQtaGFuZGxlclwiKTtcbiAgICBcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBTbGFjayBldmVudCBoYW5kbGluZ1xuICAgIHRoaXMuZnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiSGFuZGxlclwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlci5sYW1iZGFfaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KGxhbWJkYVBhdGgsIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICBcImJhc2hcIixcbiAgICAgICAgICAgIFwiLWNcIixcbiAgICAgICAgICAgIFwicGlwIGluc3RhbGwgLS1uby1jYWNoZS1kaXIgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmIGNwIC1yIC4gL2Fzc2V0LW91dHB1dFwiLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgLy8gTG9jYWwgYnVuZGxpbmcgZm9yIGZhc3RlciBidWlsZHMgYW5kIENvbGltYSBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgbG9jYWw6IHtcbiAgICAgICAgICAgIHRyeUJ1bmRsZShvdXRwdXREaXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHBpcCBpcyBhdmFpbGFibGUgbG9jYWxseVxuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFwicGlwIC0tdmVyc2lvblwiLCB7IHN0ZGlvOiBcInBpcGVcIiB9KTtcbiAgICAgICAgICAgICAgICAvLyBJbnN0YWxsIHJlcXVpcmVtZW50cyBsb2NhbGx5XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXG4gICAgICAgICAgICAgICAgICBgcGlwIGluc3RhbGwgLS1uby1jYWNoZS1kaXIgLXIgJHtwYXRoLmpvaW4obGFtYmRhUGF0aCwgXCJyZXF1aXJlbWVudHMudHh0XCIpfSAtdCAke291dHB1dERpcn0gLS1xdWlldGAsXG4gICAgICAgICAgICAgICAgICB7IHN0ZGlvOiBcInBpcGVcIiB9XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvLyBDb3B5IHNvdXJjZSBmaWxlcyAodXNpbmcgZnMgZm9yIGNyb3NzLXBsYXRmb3JtIGNvbXBhdGliaWxpdHkpXG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhsYW1iZGFQYXRoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4obGFtYmRhUGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHNyY1BhdGgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIGZpbGUgIT09IFwiX19weWNhY2hlX19cIikge1xuICAgICAgICAgICAgICAgICAgICBmcy5jcFN5bmMoc3JjUGF0aCwgZGVzdFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gRmFsbCBiYWNrIHRvIERvY2tlciBidW5kbGluZ1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICAvLyBBMkEgLyBFeGVjdXRpb24g5b+c562U5b6F44Gh77yIQmVkcm9jayDmjqjoq5blkKvjgoDvvInjgII2MHMg44Gn44K/44Kk44Og44Ki44Km44OI44GZ44KL44Gf44KBIDEyMHMg44Gr5bu26ZW3XG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMjApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVE9LRU5fVEFCTEVfTkFNRTogcHJvcHMudG9rZW5UYWJsZU5hbWUsXG4gICAgICAgIERFRFVQRV9UQUJMRV9OQU1FOiBwcm9wcy5kZWR1cGVUYWJsZU5hbWUsXG4gICAgICAgIEVYSVNURU5DRV9DSEVDS19DQUNIRV9UQUJMRTogcHJvcHMuZXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlTmFtZSxcbiAgICAgICAgV0hJVEVMSVNUX1RBQkxFX05BTUU6IHByb3BzLndoaXRlbGlzdENvbmZpZ1RhYmxlTmFtZSxcbiAgICAgICAgUkFURV9MSU1JVF9UQUJMRV9OQU1FOiBwcm9wcy5yYXRlTGltaXRUYWJsZU5hbWUsXG4gICAgICAgIEFXU19SRUdJT05fTkFNRTogcHJvcHMuYXdzUmVnaW9uLFxuICAgICAgICBCRURST0NLX01PREVMX0lEOiBwcm9wcy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgICAgLy8gU3RvcmUgc2VjcmV0IG5hbWVzIChub3QgdmFsdWVzKSBpbiBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICAgICAgLy8gTGFtYmRhIGZ1bmN0aW9uIHdpbGwgZmV0Y2ggdGhlIGFjdHVhbCBzZWNyZXQgdmFsdWVzIGZyb20gU2VjcmV0cyBNYW5hZ2VyIGF0IHJ1bnRpbWVcbiAgICAgICAgU0xBQ0tfU0lHTklOR19TRUNSRVRfTkFNRTogcHJvcHMuc2xhY2tTaWduaW5nU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIFNMQUNLX0JPVF9UT0tFTl9TRUNSRVRfTkFNRTogcHJvcHMuc2xhY2tCb3RUb2tlblNlY3JldC5zZWNyZXROYW1lLFxuICAgICAgICAvLyBPcHRpb25hbDogV2hpdGVsaXN0IHNlY3JldCBuYW1lIChjYW4gYmUgc2V0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSBvciBTZWNyZXRzIE1hbmFnZXIpXG4gICAgICAgIC8vIEZvcm1hdDoge3N0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ1xuICAgICAgICBXSElURUxJU1RfU0VDUkVUX05BTUU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9L3NsYWNrL3doaXRlbGlzdC1jb25maWdgLFxuICAgICAgICAvLyBBMkE6IFZlcmlmaWNhdGlvbiBBZ2VudCBSdW50aW1lIEFSTiAocmVxdWlyZWQpXG4gICAgICAgIFZFUklGSUNBVElPTl9BR0VOVF9BUk46IHByb3BzLnZlcmlmaWNhdGlvbkFnZW50QXJuLFxuICAgICAgICAvLyAwMTY6IHdoZW4gc2V0LCBoYW5kbGVyIHNlbmRzIHRvIFNRUyBpbnN0ZWFkIG9mIGludm9raW5nIEFnZW50Q29yZSBkaXJlY3RseVxuICAgICAgICAuLi4ocHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUgJiYge1xuICAgICAgICAgIEFHRU5UX0lOVk9DQVRJT05fUVVFVUVfVVJMOiBwcm9wcy5hZ2VudEludm9jYXRpb25RdWV1ZS5xdWV1ZVVybCxcbiAgICAgICAgfSksXG4gICAgICAgIC8vIFdoZW4gc2VjcmV0cyBjaGFuZ2UsIGNvbmZpZ1JldmlzaW9uIGNoYW5nZXMgc28gTGFtYmRhIGdldHMgbmV3IGNvbmZpZyBhbmQgZHJvcHMgY2FjaGVkIHNlY3JldHNcbiAgICAgICAgLi4uKHByb3BzLmNvbmZpZ1JldmlzaW9uICYmIHsgQ09ORklHX1JFVklTSU9OOiBwcm9wcy5jb25maWdSZXZpc2lvbiB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyAwMTY6IEdyYW50IFNRUyBTZW5kTWVzc2FnZSB3aGVuIGFzeW5jIGludm9jYXRpb24gcXVldWUgaXMgcHJvdmlkZWRcbiAgICBpZiAocHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUpIHtcbiAgICAgIHByb3BzLmFnZW50SW52b2NhdGlvblF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKHRoaXMuZnVuY3Rpb24pO1xuICAgIH1cblxuICAgIC8vIEdyYW50IExhbWJkYSBmdW5jdGlvbiBwZXJtaXNzaW9uIHRvIHJlYWQgc2VjcmV0c1xuICAgIHByb3BzLnNsYWNrU2lnbmluZ1NlY3JldC5ncmFudFJlYWQodGhpcy5mdW5jdGlvbik7XG4gICAgcHJvcHMuc2xhY2tCb3RUb2tlblNlY3JldC5ncmFudFJlYWQodGhpcy5mdW5jdGlvbik7XG4gICAgXG4gICAgLy8gR3JhbnQgTGFtYmRhIGZ1bmN0aW9uIHBlcm1pc3Npb24gdG8gcmVhZCB3aGl0ZWxpc3QgY29uZmlnIGZyb20gU2VjcmV0cyBNYW5hZ2VyIChvcHRpb25hbClcbiAgICAvLyBUaGUgc2VjcmV0IG5hbWUgZm9sbG93cyB0aGUgcGF0dGVybjoge3N0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZ1xuICAgIC8vIFRoaXMgcGVybWlzc2lvbiBhbGxvd3MgcmVhZGluZyB0aGUgd2hpdGVsaXN0IGNvbmZpZyBzZWNyZXQgaWYgaXQgZXhpc3RzXG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wic2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWVcIl0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudH06c2VjcmV0OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0vc2xhY2svd2hpdGVsaXN0LWNvbmZpZypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgQWdlbnRDb3JlIFJ1bnRpbWUgaW52b2NhdGlvbiBwZXJtaXNzaW9uIChBMkEgcGF0aCkuXG4gICAgLy8gMDI2IFVTMSAoVDAwNyk6IExlYXN0IHByaXZpbGVnZSDigJQgc2NvcGVkIHRvIHNwZWNpZmljIEFSTnMgcGVyIGF1ZGl0LWlhbS1iZWRyb2NrLm1kLlxuICAgIC8vIFBlciBBV1M6IGJvdGggcnVudGltZSBhbmQgZW5kcG9pbnQgbWF5IGJlIGV2YWx1YXRlZCBmb3IgSW52b2tlQWdlbnRSdW50aW1lLlxuICAgIC8vIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9iZWRyb2NrLWFnZW50Y29yZS9sYXRlc3QvZGV2Z3VpZGUvcmVzb3VyY2UtYmFzZWQtcG9saWNpZXMuaHRtbFxuICAgIGNvbnN0IHJ1bnRpbWVFbmRwb2ludEFybiA9IGAke3Byb3BzLnZlcmlmaWNhdGlvbkFnZW50QXJufS9ydW50aW1lLWVuZHBvaW50L0RFRkFVTFRgO1xuICAgIHRoaXMuZnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMudmVyaWZpY2F0aW9uQWdlbnRBcm4sIHJ1bnRpbWVFbmRwb2ludEFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBHcmFudCBDbG91ZFdhdGNoIHBlcm1pc3Npb25zIGZvciBFeGlzdGVuY2UgQ2hlY2sgbWV0cmljcyAoUGhhc2UgNiAtIFBvbGlzaClcbiAgICB0aGlzLmZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGFcIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgXCJjbG91ZHdhdGNoOm5hbWVzcGFjZVwiOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBGdW5jdGlvbiBVUkwgKG5vIGF1dGggLSBzaWduYXR1cmUgdmVyaWZpY2F0aW9uIGluIGNvZGUpXG4gICAgdGhpcy5mdW5jdGlvblVybCA9IHRoaXMuZnVuY3Rpb24uYWRkRnVuY3Rpb25Vcmwoe1xuICAgICAgYXV0aFR5cGU6IGxhbWJkYS5GdW5jdGlvblVybEF1dGhUeXBlLk5PTkUsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==