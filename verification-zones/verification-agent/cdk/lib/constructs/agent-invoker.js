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
exports.AgentInvoker = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const lambdaEventSources = __importStar(require("aws-cdk-lib/aws-lambda-event-sources"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const constructs_1 = require("constructs");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const cdk_nag_1 = require("cdk-nag");
class AgentInvoker extends constructs_1.Construct {
    function;
    constructor(scope, id, props) {
        super(scope, id);
        const stack = cdk.Stack.of(this);
        const lambdaPath = path.join(__dirname, "../lambda/agent-invoker");
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
                    local: {
                        tryBundle(outputDir) {
                            try {
                                (0, child_process_1.execSync)("pip --version", { stdio: "pipe" });
                                (0, child_process_1.execSync)(`pip install --no-cache-dir -r ${path.join(lambdaPath, "requirements.txt")} -t ${outputDir} --quiet`, { stdio: "pipe" });
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
                                return false;
                            }
                        },
                    },
                },
            }),
            timeout: cdk.Duration.seconds(900),
            environment: {
                VERIFICATION_AGENT_ARN: props.verificationAgentArn,
                AWS_REGION_NAME: stack.region,
            },
        });
        // Grant InvokeAgentRuntime on Verification Agent runtime and its DEFAULT endpoint.
        // Least privilege — scoped to specific ARNs for InvokeAgentRuntime authorization.
        const runtimeEndpointArn = `${props.verificationAgentArn}/runtime-endpoint/DEFAULT`;
        this.function.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["bedrock-agentcore:InvokeAgentRuntime"],
            resources: [props.verificationAgentArn, runtimeEndpointArn],
        }));
        // Grant SQS consume permissions
        props.agentInvocationQueue.grantConsumeMessages(this.function);
        // SQS event source: batch size 1 per research (long-running per message)
        this.function.addEventSource(new lambdaEventSources.SqsEventSource(props.agentInvocationQueue, {
            batchSize: 1,
        }));
        if (this.function.role) {
            cdk_nag_1.NagSuppressions.addResourceSuppressions(this.function.role, [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Lambda uses AWS-managed policy for basic logging permissions (AWSLambdaBasicExecutionRole).",
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
exports.AgentInvoker = AgentInvoker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQtaW52b2tlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFnZW50LWludm9rZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx5RkFBMkU7QUFDM0UseURBQTJDO0FBRTNDLDJDQUF1QztBQUN2QywyQ0FBNkI7QUFDN0IsaURBQXlDO0FBQ3pDLHVDQUF5QjtBQUN6QixxQ0FBMEM7QUFxQjFDLE1BQWEsWUFBYSxTQUFRLHNCQUFTO0lBQ3pCLFFBQVEsQ0FBa0I7SUFFMUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHlCQUF5QixDQUFDLENBQUM7UUFFbkUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNuRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSx3QkFBd0I7WUFDakMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRTtnQkFDdEMsUUFBUSxFQUFFO29CQUNSLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhO29CQUMvQyxPQUFPLEVBQUU7d0JBQ1AsTUFBTTt3QkFDTixJQUFJO3dCQUNKLDBGQUEwRjtxQkFDM0Y7b0JBQ0QsS0FBSyxFQUFFO3dCQUNMLFNBQVMsQ0FBQyxTQUFpQjs0QkFDekIsSUFBSSxDQUFDO2dDQUNILElB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SSxJQUFJLENBQUMsUUFBUSxFQUNoRDtZQUNFO2dCQUNFLEVBQUUsRUFBRSxpQkFBaUI7Z0JBQ3JCLE1BQU0sRUFDSixpSEFBaUg7YUFDcEg7U0FDRixDQUNGLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUFwR0Qsb0NBb0dDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGFFdmVudFNvdXJjZXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlc1wiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zcXNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gXCJjaGlsZF9wcm9jZXNzXCI7XG5pbXBvcnQgKiBhcyBmcyBmcm9tIFwiZnNcIjtcbmltcG9ydCB7IE5hZ1N1cHByZXNzaW9ucyB9IGZyb20gXCJjZGstbmFnXCI7XG5cbi8qKlxuICogQWdlbnQgSW52b2tlciBMYW1iZGEgY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IENvbnN1bWUgYWdlbnQtaW52b2NhdGlvbiByZXF1ZXN0cyBmcm9tIFNRUyBhbmQgaW52b2tlIHRoZSBWZXJpZmljYXRpb24gQWdlbnRcbiAqIHZpYSBBZ2VudENvcmUgSW52b2tlQWdlbnRSdW50aW1lLiBEZWNvdXBsZXMgU2xhY2sgZXZlbnQgaGFuZGxlciBmcm9tIGFnZW50IGV4ZWN1dGlvbi5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOiBMYW1iZGEgdHJpZ2dlcmVkIGJ5IFNRUzsgY2FsbCBJbnZva2VBZ2VudFJ1bnRpbWU7IDkwMHMgdGltZW91dC92aXNpYmlsaXR5LlxuICpcbiAqIElucHV0czogQWdlbnRJbnZva2VyUHJvcHMgKGFnZW50SW52b2NhdGlvblF1ZXVlLCB2ZXJpZmljYXRpb25BZ2VudEFybikuXG4gKlxuICogT3V0cHV0czogZnVuY3Rpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQWdlbnRJbnZva2VyUHJvcHMge1xuICAvKiogU1FTIHF1ZXVlIGZvciBhZ2VudCBpbnZvY2F0aW9uIHJlcXVlc3RzIChhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3QpLiAqL1xuICBhZ2VudEludm9jYXRpb25RdWV1ZTogc3FzLklRdWV1ZTtcbiAgLyoqIEFSTiBvZiB0aGUgVmVyaWZpY2F0aW9uIEFnZW50IFJ1bnRpbWUgdG8gaW52b2tlLiAqL1xuICB2ZXJpZmljYXRpb25BZ2VudEFybjogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRJbnZva2VyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEFnZW50SW52b2tlclByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHN0YWNrID0gY2RrLlN0YWNrLm9mKHRoaXMpO1xuICAgIGNvbnN0IGxhbWJkYVBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYS9hZ2VudC1pbnZva2VyXCIpO1xuXG4gICAgdGhpcy5mdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJIYW5kbGVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQobGFtYmRhUGF0aCwge1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMS5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgIFwiYmFzaFwiLFxuICAgICAgICAgICAgXCItY1wiLFxuICAgICAgICAgICAgXCJwaXAgaW5zdGFsbCAtLW5vLWNhY2hlLWRpciAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLXIgLiAvYXNzZXQtb3V0cHV0XCIsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBsb2NhbDoge1xuICAgICAgICAgICAgdHJ5QnVuZGxlKG91dHB1dERpcjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXCJwaXAgLS12ZXJzaW9uXCIsIHsgc3RkaW86IFwicGlwZVwiIH0pO1xuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFxuICAgICAgICAgICAgICAgICAgYHBpcCBpbnN0YWxsIC0tbm8tY2FjaGUtZGlyIC1yICR7cGF0aC5qb2luKGxhbWJkYVBhdGgsIFwicmVxdWlyZW1lbnRzLnR4dFwiKX0gLXQgJHtvdXRwdXREaXJ9IC0tcXVpZXRgLFxuICAgICAgICAgICAgICAgICAgeyBzdGRpbzogXCJwaXBlXCIgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhsYW1iZGFQYXRoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4obGFtYmRhUGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHNyY1BhdGgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIGZpbGUgIT09IFwiX19weWNhY2hlX19cIikge1xuICAgICAgICAgICAgICAgICAgICBmcy5jcFN5bmMoc3JjUGF0aCwgZGVzdFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDkwMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBWRVJJRklDQVRJT05fQUdFTlRfQVJOOiBwcm9wcy52ZXJpZmljYXRpb25BZ2VudEFybixcbiAgICAgICAgQVdTX1JFR0lPTl9OQU1FOiBzdGFjay5yZWdpb24sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgSW52b2tlQWdlbnRSdW50aW1lIG9uIFZlcmlmaWNhdGlvbiBBZ2VudCBydW50aW1lIGFuZCBpdHMgREVGQVVMVCBlbmRwb2ludC5cbiAgICAvLyBMZWFzdCBwcml2aWxlZ2Ug4oCUIHNjb3BlZCB0byBzcGVjaWZpYyBBUk5zIGZvciBJbnZva2VBZ2VudFJ1bnRpbWUgYXV0aG9yaXphdGlvbi5cbiAgICBjb25zdCBydW50aW1lRW5kcG9pbnRBcm4gPSBgJHtwcm9wcy52ZXJpZmljYXRpb25BZ2VudEFybn0vcnVudGltZS1lbmRwb2ludC9ERUZBVUxUYDtcbiAgICB0aGlzLmZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIl0sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLnZlcmlmaWNhdGlvbkFnZW50QXJuLCBydW50aW1lRW5kcG9pbnRBcm5dLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgU1FTIGNvbnN1bWUgcGVybWlzc2lvbnNcbiAgICBwcm9wcy5hZ2VudEludm9jYXRpb25RdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyh0aGlzLmZ1bmN0aW9uKTtcblxuICAgIC8vIFNRUyBldmVudCBzb3VyY2U6IGJhdGNoIHNpemUgMSBwZXIgcmVzZWFyY2ggKGxvbmctcnVubmluZyBwZXIgbWVzc2FnZSlcbiAgICB0aGlzLmZ1bmN0aW9uLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IGxhbWJkYUV2ZW50U291cmNlcy5TcXNFdmVudFNvdXJjZShwcm9wcy5hZ2VudEludm9jYXRpb25RdWV1ZSwge1xuICAgICAgICBiYXRjaFNpemU6IDEsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBpZiAodGhpcy5mdW5jdGlvbi5yb2xlKSB7XG4gICAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgIHRoaXMuZnVuY3Rpb24ucm9sZSxcbiAgICAgICAgW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU00XCIsXG4gICAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICAgIFwiTGFtYmRhIHVzZXMgQVdTLW1hbmFnZWQgcG9saWN5IGZvciBiYXNpYyBsb2dnaW5nIHBlcm1pc3Npb25zIChBV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUpLlwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIHRydWUsXG4gICAgICApO1xuICAgIH1cblxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIHRoaXMuZnVuY3Rpb24ubm9kZS5kZWZhdWx0Q2hpbGQgPz8gdGhpcy5mdW5jdGlvbixcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1MMVwiLFxuICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgIFwiTGFtYmRhIHJ1bnRpbWUgaXMgcGlubmVkIHRvIFB5dGhvbiAzLjExIHRvIG1hdGNoIHRoZSBwcm9qZWN0IGJhc2VsaW5lLiBSdW50aW1lIHVwZ3JhZGVzIGFyZSBoYW5kbGVkIHNlcGFyYXRlbHkuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICk7XG4gIH1cbn1cbiJdfQ==