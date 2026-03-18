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
exports.SlackPoster = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const lambdaEventSources = __importStar(require("aws-cdk-lib/aws-lambda-event-sources"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const constructs_1 = require("constructs");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const cdk_nag_1 = require("cdk-nag");
class SlackPoster extends constructs_1.Construct {
    queue;
    function;
    constructor(scope, id, props) {
        super(scope, id);
        const lambdaPath = path.join(__dirname, "../lambda/slack-poster");
        const dlq = new sqs.Queue(this, "SlackPostRequestDlq", {
            queueName: `${props.stackName}-slack-post-request-dlq`,
            retentionPeriod: cdk.Duration.days(14),
        });
        this.queue = new sqs.Queue(this, "SlackPostRequest", {
            queueName: `${props.stackName}-slack-post-request`,
            retentionPeriod: cdk.Duration.days(1),
            visibilityTimeout: cdk.Duration.seconds(60),
            deadLetterQueue: {
                queue: dlq,
                maxReceiveCount: 3,
            },
        });
        // Enforce TLS-in-transit (deny non-SSL SQS requests).
        for (const queue of [dlq, this.queue]) {
            queue.addToResourcePolicy(new iam.PolicyStatement({
                sid: "DenyInsecureTransport",
                effect: iam.Effect.DENY,
                principals: [new iam.AnyPrincipal()],
                actions: ["sqs:*"],
                resources: [queue.queueArn],
                conditions: { Bool: { "aws:SecureTransport": "false" } },
            }));
        }
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
            timeout: cdk.Duration.seconds(30),
        });
        this.queue.grantConsumeMessages(this.function);
        this.function.addEventSource(new lambdaEventSources.SqsEventSource(this.queue, { batchSize: 10 }));
        // AWS-managed policies are used for standard Lambda logging; runtime is pinned to Python 3.11.
        if (this.function.role) {
            cdk_nag_1.NagSuppressions.addResourceSuppressions(this.function.role.node.defaultChild ?? this.function.role, [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Lambda uses AWS-managed policy for basic logging permissions (AWSLambdaBasicExecutionRole). " +
                        "Inline-only policies would increase maintenance risk without improving security for this standard AWS pattern.",
                },
                {
                    id: "AwsSolutions-L1",
                    reason: "Lambda runtime is pinned to Python 3.11 to match the project baseline and deployment images. " +
                        "Runtime upgrades are handled as separate maintenance work to avoid unintended compatibility changes.",
                },
            ]);
        }
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.function.node.defaultChild ?? this.function, [
            {
                id: "AwsSolutions-L1",
                reason: "Lambda runtime is pinned to Python 3.11 to match the project baseline. Runtime upgrades are handled separately.",
            },
        ]);
    }
}
exports.SlackPoster = SlackPoster;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xhY2stcG9zdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2xhY2stcG9zdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx5REFBMkM7QUFDM0MsK0RBQWlEO0FBQ2pELHlGQUEyRTtBQUMzRSx5REFBMkM7QUFDM0MsMkNBQXVDO0FBQ3ZDLDJDQUE2QjtBQUM3QixpREFBeUM7QUFDekMsdUNBQXlCO0FBQ3pCLHFDQUEwQztBQW1CMUMsTUFBYSxXQUFZLFNBQVEsc0JBQVM7SUFDeEIsS0FBSyxDQUFhO0lBQ2xCLFFBQVEsQ0FBa0I7SUFFMUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF1QjtRQUMvRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHdCQUF3QixDQUFDLENBQUM7UUFFbEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNyRCxTQUFTLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyx5QkFBeUI7WUFDdEQsZUFBZSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztTQUN2QyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDbkQsU0FBUyxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMscUJBQXFCO1lBQ2xELGVBQWUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDckMsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzNDLGVB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QUMsQ0FBQztRQUVILElBQUksQ0FBQyxLQUFLLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUMxQixJQUFJLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQ3JFLENBQUM7UUFFRiwrRkFBK0Y7UUFDL0YsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZCLHlCQUFlLENBQUMsdUJBQXVCLENBQ3JDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQzFEO2dCQUNFO29CQUNFLEVBQUUsRUFBRSxtQkFBbUI7b0JBQ3ZCLE1BQU0sRUFDSiw4RkFBOEY7d0JBQzlGLGdIQUFnSDtpQkFDbkg7Z0JBQ0Q7b0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtvQkFDckIsTUFBTSxFQUNKLCtGQUErRjt3QkFDL0Ysc0dBQXNHO2lCQUN6RzthQUNGLENBQ0YsQ0FBQztRQUNKLENBQUM7UUFFRCx5QkFBZSxDQUFDLHVCQUF1QixDQUNyQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFFBQVEsRUFDaEQ7WUFDRTtnQkFDRSxFQUFFLEVBQUUsaUJBQWlCO2dCQUNyQixNQUFNLEVBQ0osaUhBQWlIO2FBQ3BIO1NBQ0YsQ0FDRixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBcEhELGtDQW9IQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGFFdmVudFNvdXJjZXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlc1wiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tIFwiY2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuXG4vKipcbiAqIFNsYWNrIFBvc3RlciBjb25zdHJ1Y3Q6IFNRUyBxdWV1ZSArIExhbWJkYSBmb3IgcG9zdGluZyBtZXNzYWdlcyB0byBTbGFjay5cbiAqXG4gKiBQdXJwb3NlOiBWZXJpZmljYXRpb24gQWdlbnQgc2VuZHMgcG9zdCByZXF1ZXN0cyB0byB0aGlzIHF1ZXVlOyBMYW1iZGEgY29uc3VtZXMgYW5kIGNhbGxzIFNsYWNrIEFQSS5cbiAqIERlY291cGxlcyBhZ2VudCBmcm9tIFNsYWNrIEFQSSBhbmQgYWxsb3dzIHJldHJpZXMuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogQ3JlYXRlIFNRUyBxdWV1ZSBhbmQgTGFtYmRhOyBMYW1iZGEgaGFzIFNsYWNrIE9BdXRoIHRva2VuIGFuZCBwb3N0cyB0byBjaGFubmVscy5cbiAqXG4gKiBJbnB1dHM6IFNsYWNrUG9zdGVyUHJvcHMgKHN0YWNrTmFtZSBmb3IgcXVldWUgbmFtaW5nKS5cbiAqXG4gKiBPdXRwdXRzOiBxdWV1ZSwgZnVuY3Rpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2xhY2tQb3N0ZXJQcm9wcyB7XG4gIC8qKiBTdGFjayBuYW1lIGZvciBxdWV1ZSBuYW1pbmcgKi9cbiAgc3RhY2tOYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTbGFja1Bvc3RlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBxdWV1ZTogc3FzLklRdWV1ZTtcbiAgcHVibGljIHJlYWRvbmx5IGZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNsYWNrUG9zdGVyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgbGFtYmRhUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhL3NsYWNrLXBvc3RlclwiKTtcblxuICAgIGNvbnN0IGRscSA9IG5ldyBzcXMuUXVldWUodGhpcywgXCJTbGFja1Bvc3RSZXF1ZXN0RGxxXCIsIHtcbiAgICAgIHF1ZXVlTmFtZTogYCR7cHJvcHMuc3RhY2tOYW1lfS1zbGFjay1wb3N0LXJlcXVlc3QtZGxxYCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgIH0pO1xuXG4gICAgdGhpcy5xdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgXCJTbGFja1Bvc3RSZXF1ZXN0XCIsIHtcbiAgICAgIHF1ZXVlTmFtZTogYCR7cHJvcHMuc3RhY2tOYW1lfS1zbGFjay1wb3N0LXJlcXVlc3RgLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcbiAgICAgICAgcXVldWU6IGRscSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEVuZm9yY2UgVExTLWluLXRyYW5zaXQgKGRlbnkgbm9uLVNTTCBTUVMgcmVxdWVzdHMpLlxuICAgIGZvciAoY29uc3QgcXVldWUgb2YgW2RscSwgdGhpcy5xdWV1ZV0pIHtcbiAgICAgIHF1ZXVlLmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBzaWQ6IFwiRGVueUluc2VjdXJlVHJhbnNwb3J0XCIsXG4gICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkRFTlksXG4gICAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldLFxuICAgICAgICAgIGFjdGlvbnM6IFtcInNxczoqXCJdLFxuICAgICAgICAgIHJlc291cmNlczogW3F1ZXVlLnF1ZXVlQXJuXSxcbiAgICAgICAgICBjb25kaXRpb25zOiB7IEJvb2w6IHsgXCJhd3M6U2VjdXJlVHJhbnNwb3J0XCI6IFwiZmFsc2VcIiB9IH0sXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aGlzLmZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkhhbmRsZXJcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiBcImhhbmRsZXIubGFtYmRhX2hhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChsYW1iZGFQYXRoLCB7XG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLmJ1bmRsaW5nSW1hZ2UsXG4gICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgXCJiYXNoXCIsXG4gICAgICAgICAgICBcIi1jXCIsXG4gICAgICAgICAgICBcInBpcCBpbnN0YWxsIC0tbm8tY2FjaGUtZGlyIC1yIHJlcXVpcmVtZW50cy50eHQgLXQgL2Fzc2V0LW91dHB1dCAmJiBjcCAtciAuIC9hc3NldC1vdXRwdXRcIixcbiAgICAgICAgICBdLFxuICAgICAgICAgIGxvY2FsOiB7XG4gICAgICAgICAgICB0cnlCdW5kbGUob3V0cHV0RGlyOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBleGVjU3luYyhcInBpcCAtLXZlcnNpb25cIiwgeyBzdGRpbzogXCJwaXBlXCIgfSk7XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXG4gICAgICAgICAgICAgICAgICBgcGlwIGluc3RhbGwgLS1uby1jYWNoZS1kaXIgLXIgJHtwYXRoLmpvaW4obGFtYmRhUGF0aCwgXCJyZXF1aXJlbWVudHMudHh0XCIpfSAtdCAke291dHB1dERpcn0gLS1xdWlldGAsXG4gICAgICAgICAgICAgICAgICB7IHN0ZGlvOiBcInBpcGVcIiB9XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlcyA9IGZzLnJlYWRkaXJTeW5jKGxhbWJkYVBhdGgpO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3JjUGF0aCA9IHBhdGguam9pbihsYW1iZGFQYXRoLCBmaWxlKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGRlc3RQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoc3JjUGF0aCk7XG4gICAgICAgICAgICAgICAgICBpZiAoc3RhdC5pc0ZpbGUoKSkge1xuICAgICAgICAgICAgICAgICAgICBmcy5jb3B5RmlsZVN5bmMoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0LmlzRGlyZWN0b3J5KCkgJiYgZmlsZSAhPT0gXCJfX3B5Y2FjaGVfX1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZzLmNwU3luYyhzcmNQYXRoLCBkZXN0UGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgIH0pO1xuXG4gICAgdGhpcy5xdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyh0aGlzLmZ1bmN0aW9uKTtcbiAgICB0aGlzLmZ1bmN0aW9uLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IGxhbWJkYUV2ZW50U291cmNlcy5TcXNFdmVudFNvdXJjZSh0aGlzLnF1ZXVlLCB7IGJhdGNoU2l6ZTogMTAgfSlcbiAgICApO1xuXG4gICAgLy8gQVdTLW1hbmFnZWQgcG9saWNpZXMgYXJlIHVzZWQgZm9yIHN0YW5kYXJkIExhbWJkYSBsb2dnaW5nOyBydW50aW1lIGlzIHBpbm5lZCB0byBQeXRob24gMy4xMS5cbiAgICBpZiAodGhpcy5mdW5jdGlvbi5yb2xlKSB7XG4gICAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICAgIHRoaXMuZnVuY3Rpb24ucm9sZS5ub2RlLmRlZmF1bHRDaGlsZCA/PyB0aGlzLmZ1bmN0aW9uLnJvbGUsXG4gICAgICAgIFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtSUFNNFwiLFxuICAgICAgICAgICAgcmVhc29uOlxuICAgICAgICAgICAgICBcIkxhbWJkYSB1c2VzIEFXUy1tYW5hZ2VkIHBvbGljeSBmb3IgYmFzaWMgbG9nZ2luZyBwZXJtaXNzaW9ucyAoQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlKS4gXCIgK1xuICAgICAgICAgICAgICBcIklubGluZS1vbmx5IHBvbGljaWVzIHdvdWxkIGluY3JlYXNlIG1haW50ZW5hbmNlIHJpc2sgd2l0aG91dCBpbXByb3Zpbmcgc2VjdXJpdHkgZm9yIHRoaXMgc3RhbmRhcmQgQVdTIHBhdHRlcm4uXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtTDFcIixcbiAgICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgICAgXCJMYW1iZGEgcnVudGltZSBpcyBwaW5uZWQgdG8gUHl0aG9uIDMuMTEgdG8gbWF0Y2ggdGhlIHByb2plY3QgYmFzZWxpbmUgYW5kIGRlcGxveW1lbnQgaW1hZ2VzLiBcIiArXG4gICAgICAgICAgICAgIFwiUnVudGltZSB1cGdyYWRlcyBhcmUgaGFuZGxlZCBhcyBzZXBhcmF0ZSBtYWludGVuYW5jZSB3b3JrIHRvIGF2b2lkIHVuaW50ZW5kZWQgY29tcGF0aWJpbGl0eSBjaGFuZ2VzLlwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICApO1xuICAgIH1cblxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIHRoaXMuZnVuY3Rpb24ubm9kZS5kZWZhdWx0Q2hpbGQgPz8gdGhpcy5mdW5jdGlvbixcbiAgICAgIFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1MMVwiLFxuICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgIFwiTGFtYmRhIHJ1bnRpbWUgaXMgcGlubmVkIHRvIFB5dGhvbiAzLjExIHRvIG1hdGNoIHRoZSBwcm9qZWN0IGJhc2VsaW5lLiBSdW50aW1lIHVwZ3JhZGVzIGFyZSBoYW5kbGVkIHNlcGFyYXRlbHkuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICk7XG4gIH1cbn1cbiJdfQ==