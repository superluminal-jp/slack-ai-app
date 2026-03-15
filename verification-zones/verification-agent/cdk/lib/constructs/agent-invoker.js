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
        // 026 US1 (T007): Least privilege — scoped to specific ARNs per audit-iam-bedrock.md.
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
    }
}
exports.AgentInvoker = AgentInvoker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQtaW52b2tlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFnZW50LWludm9rZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx5RkFBMkU7QUFDM0UseURBQTJDO0FBRTNDLDJDQUF1QztBQUN2QywyQ0FBNkI7QUFDN0IsaURBQXlDO0FBQ3pDLHVDQUF5QjtBQXFCekIsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFDekIsUUFBUSxDQUFrQjtJQUUxQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXdCO1FBQ2hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUseUJBQXlCLENBQUMsQ0FBQztRQUVuRSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ25ELE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLHdCQUF3QjtZQUNqQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFO2dCQUN0QyxRQUFRLEVBQUU7b0JBQ1IsS0FBSyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLGFBQWE7b0JBQy9DLE9BQU8sRUFBRTt3QkFDUCxNQUFNO3dCQUNOLElBQUk7d0JBQ0osMEZBQTBGO3FCQUMzRjtvQkFDRCxLQUFLLEVBQUU7d0JBQ0wsU0FBUyxDQUFDLFNBQWlCOzRCQUN6QixJQUFJLENBQUM7Z0NBQ0gsSUFBQSx3QkFBUSxFQUFDLGVBQWUsRUFBRSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO2dDQUM3QyxJQUFBLHdCQUFRLEVBQ04saUNBQWlDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLGtCQUFrQixDQUFDLE9BQU8sU0FBUyxVQUFVLEVBQ3BHLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUNsQixDQUFDO2dDQUNGLE1BQU0sS0FBSyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7Z0NBQ3pDLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7b0NBQ3pCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO29DQUM1QyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztvQ0FDNUMsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQ0FDbEMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQzt3Q0FDbEIsRUFBRSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7b0NBQ3JDLENBQUM7eUNBQU0sSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksSUFBSSxLQUFLLGFBQWEsRUFBRSxDQUFDO3dDQUN4RCxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztvQ0FDcEQsQ0FBQztnQ0FDSCxDQUFDO2dDQUNELE9BQU8sSUFBSSxDQUFDOzRCQUNkLENBQUM7NEJBQUMsTUFBTSxDQUFDO2dDQUNQLE9BQU8sS0FBSyxDQUFDOzRCQUNmLENBQUM7d0JBQ0gsQ0FBQztxQkFDRjtpQkFDRjthQUNGLENBQUM7WUFDRixPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO1lBQ2xDLFdBQVcsRUFBRTtnQkFDWCxzQkFBc0IsRUFBRSxLQUFLLENBQUMsb0JBQW9CO2dCQUNsRCxlQUFlLEVBQUUsS0FBSyxDQUFDLE1BQU07YUFDOUI7U0FDRixDQUFDLENBQUM7UUFFSCxtRkFBbUY7UUFDbkYsc0ZBQXNGO1FBQ3RGLE1BQU0sa0JBQWtCLEdBQUcsR0FBRyxLQUFLLENBQUMsb0JBQW9CLDJCQUEyQixDQUFDO1FBQ3BGLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUMzQixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUUsQ0FBQyxzQ0FBc0MsQ0FBQztZQUNqRCxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsb0JBQW9CLEVBQUUsa0JBQWtCLENBQUM7U0FDNUQsQ0FBQyxDQUNILENBQUM7UUFFRixnQ0FBZ0M7UUFDaEMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUUvRCx5RUFBeUU7UUFDekUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQzFCLElBQUksa0JBQWtCLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRTtZQUNoRSxTQUFTLEVBQUUsQ0FBQztTQUNiLENBQUMsQ0FDSCxDQUFDO0lBQ0osQ0FBQztDQUNGO0FBM0VELG9DQTJFQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0ICogYXMgbGFtYmRhRXZlbnRTb3VyY2VzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXNcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tIFwiY2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5cbi8qKlxuICogQWdlbnQgSW52b2tlciBMYW1iZGEgY29uc3RydWN0ICgwMTYpLlxuICpcbiAqIFB1cnBvc2U6IENvbnN1bWUgYWdlbnQtaW52b2NhdGlvbiByZXF1ZXN0cyBmcm9tIFNRUyBhbmQgaW52b2tlIHRoZSBWZXJpZmljYXRpb24gQWdlbnRcbiAqIHZpYSBBZ2VudENvcmUgSW52b2tlQWdlbnRSdW50aW1lLiBEZWNvdXBsZXMgU2xhY2sgZXZlbnQgaGFuZGxlciBmcm9tIGFnZW50IGV4ZWN1dGlvbi5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOiBMYW1iZGEgdHJpZ2dlcmVkIGJ5IFNRUzsgY2FsbCBJbnZva2VBZ2VudFJ1bnRpbWU7IDkwMHMgdGltZW91dC92aXNpYmlsaXR5LlxuICpcbiAqIElucHV0czogQWdlbnRJbnZva2VyUHJvcHMgKGFnZW50SW52b2NhdGlvblF1ZXVlLCB2ZXJpZmljYXRpb25BZ2VudEFybikuXG4gKlxuICogT3V0cHV0czogZnVuY3Rpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQWdlbnRJbnZva2VyUHJvcHMge1xuICAvKiogU1FTIHF1ZXVlIGZvciBhZ2VudCBpbnZvY2F0aW9uIHJlcXVlc3RzIChhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3QpLiAqL1xuICBhZ2VudEludm9jYXRpb25RdWV1ZTogc3FzLklRdWV1ZTtcbiAgLyoqIEFSTiBvZiB0aGUgVmVyaWZpY2F0aW9uIEFnZW50IFJ1bnRpbWUgdG8gaW52b2tlLiAqL1xuICB2ZXJpZmljYXRpb25BZ2VudEFybjogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRJbnZva2VyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEFnZW50SW52b2tlclByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHN0YWNrID0gY2RrLlN0YWNrLm9mKHRoaXMpO1xuICAgIGNvbnN0IGxhbWJkYVBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYS9hZ2VudC1pbnZva2VyXCIpO1xuXG4gICAgdGhpcy5mdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJIYW5kbGVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQobGFtYmRhUGF0aCwge1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMS5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgIFwiYmFzaFwiLFxuICAgICAgICAgICAgXCItY1wiLFxuICAgICAgICAgICAgXCJwaXAgaW5zdGFsbCAtLW5vLWNhY2hlLWRpciAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLXIgLiAvYXNzZXQtb3V0cHV0XCIsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBsb2NhbDoge1xuICAgICAgICAgICAgdHJ5QnVuZGxlKG91dHB1dERpcjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXCJwaXAgLS12ZXJzaW9uXCIsIHsgc3RkaW86IFwicGlwZVwiIH0pO1xuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFxuICAgICAgICAgICAgICAgICAgYHBpcCBpbnN0YWxsIC0tbm8tY2FjaGUtZGlyIC1yICR7cGF0aC5qb2luKGxhbWJkYVBhdGgsIFwicmVxdWlyZW1lbnRzLnR4dFwiKX0gLXQgJHtvdXRwdXREaXJ9IC0tcXVpZXRgLFxuICAgICAgICAgICAgICAgICAgeyBzdGRpbzogXCJwaXBlXCIgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhsYW1iZGFQYXRoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4obGFtYmRhUGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHNyY1BhdGgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIGZpbGUgIT09IFwiX19weWNhY2hlX19cIikge1xuICAgICAgICAgICAgICAgICAgICBmcy5jcFN5bmMoc3JjUGF0aCwgZGVzdFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDkwMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBWRVJJRklDQVRJT05fQUdFTlRfQVJOOiBwcm9wcy52ZXJpZmljYXRpb25BZ2VudEFybixcbiAgICAgICAgQVdTX1JFR0lPTl9OQU1FOiBzdGFjay5yZWdpb24sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgSW52b2tlQWdlbnRSdW50aW1lIG9uIFZlcmlmaWNhdGlvbiBBZ2VudCBydW50aW1lIGFuZCBpdHMgREVGQVVMVCBlbmRwb2ludC5cbiAgICAvLyAwMjYgVVMxIChUMDA3KTogTGVhc3QgcHJpdmlsZWdlIOKAlCBzY29wZWQgdG8gc3BlY2lmaWMgQVJOcyBwZXIgYXVkaXQtaWFtLWJlZHJvY2subWQuXG4gICAgY29uc3QgcnVudGltZUVuZHBvaW50QXJuID0gYCR7cHJvcHMudmVyaWZpY2F0aW9uQWdlbnRBcm59L3J1bnRpbWUtZW5kcG9pbnQvREVGQVVMVGA7XG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy52ZXJpZmljYXRpb25BZ2VudEFybiwgcnVudGltZUVuZHBvaW50QXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEdyYW50IFNRUyBjb25zdW1lIHBlcm1pc3Npb25zXG4gICAgcHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUuZ3JhbnRDb25zdW1lTWVzc2FnZXModGhpcy5mdW5jdGlvbik7XG5cbiAgICAvLyBTUVMgZXZlbnQgc291cmNlOiBiYXRjaCBzaXplIDEgcGVyIHJlc2VhcmNoIChsb25nLXJ1bm5pbmcgcGVyIG1lc3NhZ2UpXG4gICAgdGhpcy5mdW5jdGlvbi5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UocHJvcHMuYWdlbnRJbnZvY2F0aW9uUXVldWUsIHtcbiAgICAgICAgYmF0Y2hTaXplOiAxLFxuICAgICAgfSlcbiAgICApO1xuICB9XG59XG4iXX0=