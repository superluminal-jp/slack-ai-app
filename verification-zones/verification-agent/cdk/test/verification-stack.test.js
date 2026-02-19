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
/**
 * VerificationStack CDK unit tests.
 *
 * Synthesis runs Lambda asset bundling (local pip first, then Docker). For CI/sandbox:
 * - Prefer local pip so Docker/Colima is not required.
 * - If using Docker, ensure Colima (or Docker) is running and DOCKER_HOST is set.
 */
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const cost_allocation_tags_1 = require("../lib/utils/cost-allocation-tags");
const verification_stack_1 = require("../lib/verification-stack");
function findQueueByName(template, nameSubstring) {
    const queues = template.findResources("AWS::SQS::Queue");
    return Object.entries(queues).find(([, res]) => res.Properties?.QueueName?.includes?.(nameSubstring));
}
function findLambdaByLogicalId(template, predicate) {
    const lambdas = template.findResources("AWS::Lambda::Function");
    return Object.entries(lambdas).find(([logicalId]) => predicate(logicalId));
}
function policyHasAction(policies, action) {
    return Object.values(policies).some((res) => {
        const doc = res.Properties?.PolicyDocument;
        const stmts = (doc?.Statement ?? []);
        return stmts.some((s) => {
            const a = s.Action;
            return Array.isArray(a) ? a.includes(action) : a === action;
        });
    });
}
describe("VerificationStack", () => {
    let template;
    beforeAll(() => {
        process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
        process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
        const app = new cdk.App();
        const stack = new verification_stack_1.VerificationStack(app, "TestVerificationStack", {
            env: { account: "123456789012", region: "ap-northeast-1" },
            executionAgentArns: {
                "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/TestExecutionAgent",
            },
        });
        template = assertions_1.Template.fromStack(stack);
    });
    afterAll(() => {
        delete process.env.SLACK_BOT_TOKEN;
        delete process.env.SLACK_SIGNING_SECRET;
    });
    describe("A2A only (no legacy)", () => {
        it("must NOT contain ExecutionResponseQueue SQS queue", () => {
            expect(findQueueByName(template, "execution-response")).toBeUndefined();
        });
        it("must NOT contain SlackResponseHandler Lambda", () => {
            expect(findLambdaByLogicalId(template, (id) => id.includes("SlackResponseHandler"))).toBeUndefined();
        });
        it("must NOT have outputs ExecutionResponseQueueUrl, ExecutionResponseQueueArn", () => {
            const outputs = template.toJSON().Outputs ?? {};
            expect(outputs.ExecutionResponseQueueUrl).toBeUndefined();
            expect(outputs.ExecutionResponseQueueArn).toBeUndefined();
        });
    });
    describe("016 async invocation (SQS + Agent Invoker)", () => {
        it("must contain SQS queue for agent-invocation-request", () => {
            expect(findQueueByName(template, "agent-invocation-request")).toBeDefined();
        });
        it("must contain Lambda function for Agent Invoker", () => {
            const agentInvoker = findLambdaByLogicalId(template, (id) => id.includes("AgentInvoker") && !id.includes("SlackEventHandler"));
            expect(agentInvoker).toBeDefined();
        });
        it("SlackEventHandler Lambda role must have sqs:SendMessage on agent-invocation queue", () => {
            template.hasResourceProperties("AWS::IAM::Policy", {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Action: assertions_1.Match.arrayWith(["sqs:SendMessage"]),
                            Effect: "Allow",
                        }),
                    ]),
                },
            });
        });
        it("Agent Invoker Lambda role must have bedrock-agentcore:InvokeAgentRuntime", () => {
            const policies = template.findResources("AWS::IAM::Policy");
            expect(policyHasAction(policies, "bedrock-agentcore:InvokeAgentRuntime")).toBe(true);
        });
        it("agent-invocation-request queue must have redrivePolicy with deadLetterTargetArn and maxReceiveCount 3", () => {
            template.hasResourceProperties("AWS::SQS::Queue", {
                QueueName: assertions_1.Match.stringLikeRegexp("agent-invocation-request"),
                RedrivePolicy: assertions_1.Match.objectLike({
                    deadLetterTargetArn: assertions_1.Match.anyValue(),
                    maxReceiveCount: 3,
                }),
            });
        });
    });
    describe("SlackEventHandler Lambda", () => {
        it("should create SlackEventHandler Lambda function", () => {
            template.hasResourceProperties("AWS::Lambda::Function", {
                Runtime: "python3.11",
                Timeout: 120,
            });
        });
        it("should have Function URL enabled", () => {
            template.hasResourceProperties("AWS::Lambda::Url", {
                AuthType: "NONE",
            });
        });
        it("should have bedrock-agentcore:InvokeAgentRuntime permission (A2A)", () => {
            template.hasResourceProperties("AWS::IAM::Policy", {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Action: "bedrock-agentcore:InvokeAgentRuntime",
                            Effect: "Allow",
                        }),
                    ]),
                },
            });
        });
    });
    describe("DynamoDB Tables", () => {
        it("should create 5 DynamoDB tables", () => {
            const tables = template.findResources("AWS::DynamoDB::Table");
            expect(Object.keys(tables).length).toBe(5);
        });
        it("should create tables with PAY_PER_REQUEST billing", () => {
            template.hasResourceProperties("AWS::DynamoDB::Table", {
                BillingMode: "PAY_PER_REQUEST",
            });
        });
        it("should create tables with SSE enabled", () => {
            template.hasResourceProperties("AWS::DynamoDB::Table", {
                SSESpecification: {
                    SSEEnabled: true,
                },
            });
        });
        it("should create event dedupe table with TTL", () => {
            template.hasResourceProperties("AWS::DynamoDB::Table", {
                TableName: "TestVerificationStack-event-dedupe",
                TimeToLiveSpecification: {
                    AttributeName: "ttl",
                    Enabled: true,
                },
            });
        });
    });
    describe("Secrets Manager", () => {
        it("should create Slack signing secret", () => {
            template.hasResourceProperties("AWS::SecretsManager::Secret", {
                Description: "Slack app signing secret for request verification",
            });
        });
        it("should create Slack bot token secret", () => {
            template.hasResourceProperties("AWS::SecretsManager::Secret", {
                Description: "Slack bot OAuth token",
            });
        });
    });
    describe("CloudWatch Alarms", () => {
        it("should create whitelist authorization failure alarm", () => {
            template.hasResourceProperties("AWS::CloudWatch::Alarm", {
                AlarmDescription: assertions_1.Match.stringLikeRegexp("whitelist authorization failures"),
                Namespace: "SlackEventHandler",
                MetricName: "WhitelistAuthorizationFailed",
            });
        });
        it("should create existence check failure alarm", () => {
            template.hasResourceProperties("AWS::CloudWatch::Alarm", {
                AlarmDescription: assertions_1.Match.stringLikeRegexp("Existence Check failures"),
                Namespace: "SlackEventHandler",
                MetricName: "ExistenceCheckFailed",
            });
        });
        it("should create rate limit exceeded alarm", () => {
            template.hasResourceProperties("AWS::CloudWatch::Alarm", {
                AlarmDescription: assertions_1.Match.stringLikeRegexp("rate limit exceeded"),
                Namespace: "SlackEventHandler",
                MetricName: "RateLimitExceeded",
            });
        });
    });
    describe("S3 File Exchange Bucket (024)", () => {
        it("should create S3 bucket for file exchange", () => {
            const buckets = template.findResources("AWS::S3::Bucket");
            const bucketKeys = Object.keys(buckets);
            expect(bucketKeys.length).toBeGreaterThanOrEqual(1);
        });
        it("should have block public access enabled on file exchange bucket", () => {
            template.hasResourceProperties("AWS::S3::Bucket", {
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true,
                },
            });
        });
        it("should have lifecycle rule for attachments/ prefix with 1-day expiry", () => {
            template.hasResourceProperties("AWS::S3::Bucket", {
                LifecycleConfiguration: {
                    Rules: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Prefix: "attachments/",
                            ExpirationInDays: 1,
                            Status: "Enabled",
                        }),
                    ]),
                },
            });
        });
        it("should have SSE-S3 encryption (BucketEncryption with AES256)", () => {
            template.hasResourceProperties("AWS::S3::Bucket", {
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            ServerSideEncryptionByDefault: {
                                SSEAlgorithm: "AES256",
                            },
                        }),
                    ]),
                },
            });
        });
        it("verification agent role must have S3 permissions for file exchange bucket", () => {
            const policies = template.findResources("AWS::IAM::Policy");
            expect(policyHasAction(policies, "s3:GetObject*")).toBe(true);
            expect(policyHasAction(policies, "s3:PutObject")).toBe(true);
            expect(policyHasAction(policies, "s3:DeleteObject*")).toBe(true);
        });
    });
    describe("Cost allocation tags (031)", () => {
        it("AgentCore Runtime should have cost allocation tags", () => {
            const runtimes = template.findResources("AWS::BedrockAgentCore::Runtime");
            expect(Object.keys(runtimes).length).toBeGreaterThanOrEqual(1);
            for (const [, def] of Object.entries(runtimes)) {
                const tags = def.Properties?.Tags;
                expect(tags).toBeDefined();
                for (const key of cost_allocation_tags_1.REQUIRED_COST_ALLOCATION_TAG_KEYS) {
                    expect(tags[key]).toBeDefined();
                    expect(typeof tags[key]).toBe("string");
                }
            }
        });
    });
    describe("Stack Outputs", () => {
        it("should output SlackEventHandlerUrl", () => {
            template.hasOutput("SlackEventHandlerUrl", {
                Description: assertions_1.Match.stringLikeRegexp("Slack Event Handler Function URL"),
            });
        });
        it("should output VerificationLambdaRoleArn", () => {
            template.hasOutput("VerificationLambdaRoleArn", {
                Description: assertions_1.Match.stringLikeRegexp("Verification Lambda Role ARN"),
            });
        });
        it("should output SlackEventHandlerArn", () => {
            template.hasOutput("SlackEventHandlerArn", {
                Description: assertions_1.Match.stringLikeRegexp("SlackEventHandler Lambda ARN"),
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tc3RhY2sudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOzs7Ozs7R0FNRztBQUNILGlEQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsNEVBQXNGO0FBQ3RGLGtFQUE4RDtBQWE5RCxTQUFTLGVBQWUsQ0FDdEIsUUFBa0IsRUFDbEIsYUFBcUI7SUFFckIsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3pELE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUM1QyxHQUE2QixDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDLENBQ2hGLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FDNUIsUUFBa0IsRUFDbEIsU0FBeUM7SUFFekMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ2hFLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUM3RSxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQ3RCLFFBQWlDLEVBQ2pDLE1BQWM7SUFFZCxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUU7UUFDMUMsTUFBTSxHQUFHLEdBQUksR0FBeUIsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDO1FB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QUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzNDLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1FBQzdCLEVBQUUsQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7WUFDNUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsRUFBRTtnQkFDekMsV0FBVyxFQUFFLGtCQUFLLENBQUMsZ0JBQWdCLENBQUMsa0NBQWtDLENBQUM7YUFDeEUsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO1lBQ2pELFFBQVEsQ0FBQyxTQUFTLENBQUMsMkJBQTJCLEVBQUU7Z0JBQzlDLFdBQVcsRUFBRSxrQkFBSyxDQUFDLGdCQUFnQixDQUFDLDhCQUE4QixDQUFDO2FBQ3BFLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtZQUM1QyxRQUFRLENBQUMsU0FBUyxDQUFDLHNCQUFzQixFQUFFO2dCQUN6QyxXQUFXLEVBQUUsa0JBQUssQ0FBQyxnQkFBZ0IsQ0FBQyw4QkFBOEIsQ0FBQzthQUNwRSxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFZlcmlmaWNhdGlvblN0YWNrIENESyB1bml0IHRlc3RzLlxuICpcbiAqIFN5bnRoZXNpcyBydW5zIExhbWJkYSBhc3NldCBidW5kbGluZyAobG9jYWwgcGlwIGZpcnN0LCB0aGVuIERvY2tlcikuIEZvciBDSS9zYW5kYm94OlxuICogLSBQcmVmZXIgbG9jYWwgcGlwIHNvIERvY2tlci9Db2xpbWEgaXMgbm90IHJlcXVpcmVkLlxuICogLSBJZiB1c2luZyBEb2NrZXIsIGVuc3VyZSBDb2xpbWEgKG9yIERvY2tlcikgaXMgcnVubmluZyBhbmQgRE9DS0VSX0hPU1QgaXMgc2V0LlxuICovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiO1xuaW1wb3J0IHsgUkVRVUlSRURfQ09TVF9BTExPQ0FUSU9OX1RBR19LRVlTIH0gZnJvbSBcIi4uL2xpYi91dGlscy9jb3N0LWFsbG9jYXRpb24tdGFnc1wiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uU3RhY2sgfSBmcm9tIFwiLi4vbGliL3ZlcmlmaWNhdGlvbi1zdGFja1wiO1xuXG4vKiogUmVzb3VyY2Ugd2l0aCBvcHRpb25hbCBQcm9wZXJ0aWVzLlF1ZXVlTmFtZSAoU1FTLCBldGMuKSAqL1xudHlwZSBSZXNvdXJjZVdpdGhRdWV1ZU5hbWUgPSB7IFByb3BlcnRpZXM/OiB7IFF1ZXVlTmFtZT86IHN0cmluZyB9IH07XG5cbi8qKiBJQU0gcG9saWN5IHJlc291cmNlIHdpdGggU3RhdGVtZW50IGFycmF5ICovXG50eXBlIElBTVBvbGljeVJlc291cmNlID0ge1xuICBQcm9wZXJ0aWVzPzogeyBQb2xpY3lEb2N1bWVudD86IHsgU3RhdGVtZW50PzogdW5rbm93bltdIH0gfTtcbn07XG5cbi8qKiBJQU0gc3RhdGVtZW50IHdpdGggQWN0aW9uIChzdHJpbmcgb3Igc3RyaW5nW10pICovXG50eXBlIElBTVN0YXRlbWVudCA9IHsgQWN0aW9uPzogc3RyaW5nIHwgc3RyaW5nW107IEVmZmVjdD86IHN0cmluZyB9O1xuXG5mdW5jdGlvbiBmaW5kUXVldWVCeU5hbWUoXG4gIHRlbXBsYXRlOiBUZW1wbGF0ZSxcbiAgbmFtZVN1YnN0cmluZzogc3RyaW5nXG4pOiBbc3RyaW5nLCB1bmtub3duXSB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHF1ZXVlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OlNRUzo6UXVldWVcIik7XG4gIHJldHVybiBPYmplY3QuZW50cmllcyhxdWV1ZXMpLmZpbmQoKFssIHJlc10pID0+XG4gICAgKHJlcyBhcyBSZXNvdXJjZVdpdGhRdWV1ZU5hbWUpLlByb3BlcnRpZXM/LlF1ZXVlTmFtZT8uaW5jbHVkZXM/LihuYW1lU3Vic3RyaW5nKVxuICApO1xufVxuXG5mdW5jdGlvbiBmaW5kTGFtYmRhQnlMb2dpY2FsSWQoXG4gIHRlbXBsYXRlOiBUZW1wbGF0ZSxcbiAgcHJlZGljYXRlOiAobG9naWNhbElkOiBzdHJpbmcpID0+IGJvb2xlYW5cbik6IFtzdHJpbmcsIHVua25vd25dIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgbGFtYmRhcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIik7XG4gIHJldHVybiBPYmplY3QuZW50cmllcyhsYW1iZGFzKS5maW5kKChbbG9naWNhbElkXSkgPT4gcHJlZGljYXRlKGxvZ2ljYWxJZCkpO1xufVxuXG5mdW5jdGlvbiBwb2xpY3lIYXNBY3Rpb24oXG4gIHBvbGljaWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbiAgYWN0aW9uOiBzdHJpbmdcbik6IGJvb2xlYW4ge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwb2xpY2llcykuc29tZSgocmVzKSA9PiB7XG4gICAgY29uc3QgZG9jID0gKHJlcyBhcyBJQU1Qb2xpY3lSZXNvdXJjZSkuUHJvcGVydGllcz8uUG9saWN5RG9jdW1lbnQ7XG4gICAgY29uc3Qgc3RtdHMgPSAoZG9jPy5TdGF0ZW1lbnQgPz8gW10pIGFzIElBTVN0YXRlbWVudFtdO1xuICAgIHJldHVybiBzdG10cy5zb21lKChzKSA9PiB7XG4gICAgICBjb25zdCBhID0gcy5BY3Rpb247XG4gICAgICByZXR1cm4gQXJyYXkuaXNBcnJheShhKSA/IGEuaW5jbHVkZXMoYWN0aW9uKSA6IGEgPT09IGFjdGlvbjtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmRlc2NyaWJlKFwiVmVyaWZpY2F0aW9uU3RhY2tcIiwgKCkgPT4ge1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOID0gXCJ4b3hiLXRlc3QtdG9rZW5cIjtcbiAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCA9IFwidGVzdC1zaWduaW5nLXNlY3JldFwiO1xuXG4gICAgY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBjb25zdCBzdGFjayA9IG5ldyBWZXJpZmljYXRpb25TdGFjayhhcHAsIFwiVGVzdFZlcmlmaWNhdGlvblN0YWNrXCIsIHtcbiAgICAgIGVudjogeyBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLCByZWdpb246IFwiYXAtbm9ydGhlYXN0LTFcIiB9LFxuICAgICAgZXhlY3V0aW9uQWdlbnRBcm5zOiB7XG4gICAgICAgIFwiZmlsZS1jcmVhdG9yXCI6XG4gICAgICAgICAgXCJhcm46YXdzOmJlZHJvY2stYWdlbnRjb3JlOmFwLW5vcnRoZWFzdC0xOjEyMzQ1Njc4OTAxMjpydW50aW1lL1Rlc3RFeGVjdXRpb25BZ2VudFwiLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIGFmdGVyQWxsKCgpID0+IHtcbiAgICBkZWxldGUgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOO1xuICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVDtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJBMkEgb25seSAobm8gbGVnYWN5KVwiLCAoKSA9PiB7XG4gICAgaXQoXCJtdXN0IE5PVCBjb250YWluIEV4ZWN1dGlvblJlc3BvbnNlUXVldWUgU1FTIHF1ZXVlXCIsICgpID0+IHtcbiAgICAgIGV4cGVjdChmaW5kUXVldWVCeU5hbWUodGVtcGxhdGUsIFwiZXhlY3V0aW9uLXJlc3BvbnNlXCIpKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdChcIm11c3QgTk9UIGNvbnRhaW4gU2xhY2tSZXNwb25zZUhhbmRsZXIgTGFtYmRhXCIsICgpID0+IHtcbiAgICAgIGV4cGVjdChcbiAgICAgICAgZmluZExhbWJkYUJ5TG9naWNhbElkKHRlbXBsYXRlLCAoaWQpID0+IGlkLmluY2x1ZGVzKFwiU2xhY2tSZXNwb25zZUhhbmRsZXJcIikpXG4gICAgICApLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KFwibXVzdCBOT1QgaGF2ZSBvdXRwdXRzIEV4ZWN1dGlvblJlc3BvbnNlUXVldWVVcmwsIEV4ZWN1dGlvblJlc3BvbnNlUXVldWVBcm5cIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLnRvSlNPTigpLk91dHB1dHMgPz8ge307XG4gICAgICBleHBlY3Qob3V0cHV0cy5FeGVjdXRpb25SZXNwb25zZVF1ZXVlVXJsKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgICBleHBlY3Qob3V0cHV0cy5FeGVjdXRpb25SZXNwb25zZVF1ZXVlQXJuKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiMDE2IGFzeW5jIGludm9jYXRpb24gKFNRUyArIEFnZW50IEludm9rZXIpXCIsICgpID0+IHtcbiAgICBpdChcIm11c3QgY29udGFpbiBTUVMgcXVldWUgZm9yIGFnZW50LWludm9jYXRpb24tcmVxdWVzdFwiLCAoKSA9PiB7XG4gICAgICBleHBlY3QoZmluZFF1ZXVlQnlOYW1lKHRlbXBsYXRlLCBcImFnZW50LWludm9jYXRpb24tcmVxdWVzdFwiKSkudG9CZURlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KFwibXVzdCBjb250YWluIExhbWJkYSBmdW5jdGlvbiBmb3IgQWdlbnQgSW52b2tlclwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBhZ2VudEludm9rZXIgPSBmaW5kTGFtYmRhQnlMb2dpY2FsSWQoXG4gICAgICAgIHRlbXBsYXRlLFxuICAgICAgICAoaWQpID0+IGlkLmluY2x1ZGVzKFwiQWdlbnRJbnZva2VyXCIpICYmICFpZC5pbmNsdWRlcyhcIlNsYWNrRXZlbnRIYW5kbGVyXCIpXG4gICAgICApO1xuICAgICAgZXhwZWN0KGFnZW50SW52b2tlcikudG9CZURlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KFwiU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIHJvbGUgbXVzdCBoYXZlIHNxczpTZW5kTWVzc2FnZSBvbiBhZ2VudC1pbnZvY2F0aW9uIHF1ZXVlXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6SUFNOjpQb2xpY3lcIiwge1xuICAgICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbXCJzcXM6U2VuZE1lc3NhZ2VcIl0pLFxuICAgICAgICAgICAgICBFZmZlY3Q6IFwiQWxsb3dcIixcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcIkFnZW50IEludm9rZXIgTGFtYmRhIHJvbGUgbXVzdCBoYXZlIGJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBwb2xpY2llcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OklBTTo6UG9saWN5XCIpO1xuICAgICAgZXhwZWN0KFxuICAgICAgICBwb2xpY3lIYXNBY3Rpb24ocG9saWNpZXMsIFwiYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCIpXG4gICAgICApLnRvQmUodHJ1ZSk7XG4gICAgfSk7XG5cbiAgICBpdChcImFnZW50LWludm9jYXRpb24tcmVxdWVzdCBxdWV1ZSBtdXN0IGhhdmUgcmVkcml2ZVBvbGljeSB3aXRoIGRlYWRMZXR0ZXJUYXJnZXRBcm4gYW5kIG1heFJlY2VpdmVDb3VudCAzXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6U1FTOjpRdWV1ZVwiLCB7XG4gICAgICAgIFF1ZXVlTmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcImFnZW50LWludm9jYXRpb24tcmVxdWVzdFwiKSxcbiAgICAgICAgUmVkcml2ZVBvbGljeTogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgZGVhZExldHRlclRhcmdldEFybjogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBjcmVhdGUgU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIGZ1bmN0aW9uXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIFJ1bnRpbWU6IFwicHl0aG9uMy4xMVwiLFxuICAgICAgICBUaW1lb3V0OiAxMjAsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGhhdmUgRnVuY3Rpb24gVVJMIGVuYWJsZWRcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OlVybFwiLCB7XG4gICAgICAgIEF1dGhUeXBlOiBcIk5PTkVcIixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgaGF2ZSBiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWUgcGVybWlzc2lvbiAoQTJBKVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OklBTTo6UG9saWN5XCIsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgQWN0aW9uOiBcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiLFxuICAgICAgICAgICAgICBFZmZlY3Q6IFwiQWxsb3dcIixcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiRHluYW1vREIgVGFibGVzXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBjcmVhdGUgNSBEeW5hbW9EQiB0YWJsZXNcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgdGFibGVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6RHluYW1vREI6OlRhYmxlXCIpO1xuICAgICAgZXhwZWN0KE9iamVjdC5rZXlzKHRhYmxlcykubGVuZ3RoKS50b0JlKDUpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIHRhYmxlcyB3aXRoIFBBWV9QRVJfUkVRVUVTVCBiaWxsaW5nXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RHluYW1vREI6OlRhYmxlXCIsIHtcbiAgICAgICAgQmlsbGluZ01vZGU6IFwiUEFZX1BFUl9SRVFVRVNUXCIsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSB0YWJsZXMgd2l0aCBTU0UgZW5hYmxlZFwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiLCB7XG4gICAgICAgIFNTRVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgICBTU0VFbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgZXZlbnQgZGVkdXBlIHRhYmxlIHdpdGggVFRMXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RHluYW1vREI6OlRhYmxlXCIsIHtcbiAgICAgICAgVGFibGVOYW1lOiBcIlRlc3RWZXJpZmljYXRpb25TdGFjay1ldmVudC1kZWR1cGVcIixcbiAgICAgICAgVGltZVRvTGl2ZVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiBcInR0bFwiLFxuICAgICAgICAgIEVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJTZWNyZXRzIE1hbmFnZXJcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBTbGFjayBzaWduaW5nIHNlY3JldFwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXRcIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogXCJTbGFjayBhcHAgc2lnbmluZyBzZWNyZXQgZm9yIHJlcXVlc3QgdmVyaWZpY2F0aW9uXCIsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBTbGFjayBib3QgdG9rZW4gc2VjcmV0XCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6U2VjcmV0c01hbmFnZXI6OlNlY3JldFwiLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiBcIlNsYWNrIGJvdCBPQXV0aCB0b2tlblwiLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiQ2xvdWRXYXRjaCBBbGFybXNcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSB3aGl0ZWxpc3QgYXV0aG9yaXphdGlvbiBmYWlsdXJlIGFsYXJtXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Q2xvdWRXYXRjaDo6QWxhcm1cIiwge1xuICAgICAgICBBbGFybURlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFxuICAgICAgICAgIFwid2hpdGVsaXN0IGF1dGhvcml6YXRpb24gZmFpbHVyZXNcIlxuICAgICAgICApLFxuICAgICAgICBOYW1lc3BhY2U6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgTWV0cmljTmFtZTogXCJXaGl0ZWxpc3RBdXRob3JpemF0aW9uRmFpbGVkXCIsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBleGlzdGVuY2UgY2hlY2sgZmFpbHVyZSBhbGFybVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtXCIsIHtcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcIkV4aXN0ZW5jZSBDaGVjayBmYWlsdXJlc1wiKSxcbiAgICAgICAgTmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIE1ldHJpY05hbWU6IFwiRXhpc3RlbmNlQ2hlY2tGYWlsZWRcIixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIHJhdGUgbGltaXQgZXhjZWVkZWQgYWxhcm1cIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpDbG91ZFdhdGNoOjpBbGFybVwiLCB7XG4gICAgICAgIEFsYXJtRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJyYXRlIGxpbWl0IGV4Y2VlZGVkXCIpLFxuICAgICAgICBOYW1lc3BhY2U6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgTWV0cmljTmFtZTogXCJSYXRlTGltaXRFeGNlZWRlZFwiLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiUzMgRmlsZSBFeGNoYW5nZSBCdWNrZXQgKDAyNClcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBTMyBidWNrZXQgZm9yIGZpbGUgZXhjaGFuZ2VcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgYnVja2V0cyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OlMzOjpCdWNrZXRcIik7XG4gICAgICBjb25zdCBidWNrZXRLZXlzID0gT2JqZWN0LmtleXMoYnVja2V0cyk7XG4gICAgICBleHBlY3QoYnVja2V0S2V5cy5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBoYXZlIGJsb2NrIHB1YmxpYyBhY2Nlc3MgZW5hYmxlZCBvbiBmaWxlIGV4Y2hhbmdlIGJ1Y2tldFwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGhhdmUgbGlmZWN5Y2xlIHJ1bGUgZm9yIGF0dGFjaG1lbnRzLyBwcmVmaXggd2l0aCAxLWRheSBleHBpcnlcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgTGlmZWN5Y2xlQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIFJ1bGVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIFByZWZpeDogXCJhdHRhY2htZW50cy9cIixcbiAgICAgICAgICAgICAgRXhwaXJhdGlvbkluRGF5czogMSxcbiAgICAgICAgICAgICAgU3RhdHVzOiBcIkVuYWJsZWRcIixcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBoYXZlIFNTRS1TMyBlbmNyeXB0aW9uIChCdWNrZXRFbmNyeXB0aW9uIHdpdGggQUVTMjU2KVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBCdWNrZXRFbmNyeXB0aW9uOiB7XG4gICAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25Db25maWd1cmF0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQnlEZWZhdWx0OiB7XG4gICAgICAgICAgICAgICAgU1NFQWxnb3JpdGhtOiBcIkFFUzI1NlwiLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwidmVyaWZpY2F0aW9uIGFnZW50IHJvbGUgbXVzdCBoYXZlIFMzIHBlcm1pc3Npb25zIGZvciBmaWxlIGV4Y2hhbmdlIGJ1Y2tldFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBwb2xpY2llcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OklBTTo6UG9saWN5XCIpO1xuICAgICAgZXhwZWN0KHBvbGljeUhhc0FjdGlvbihwb2xpY2llcywgXCJzMzpHZXRPYmplY3QqXCIpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KHBvbGljeUhhc0FjdGlvbihwb2xpY2llcywgXCJzMzpQdXRPYmplY3RcIikpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3QocG9saWN5SGFzQWN0aW9uKHBvbGljaWVzLCBcInMzOkRlbGV0ZU9iamVjdCpcIikpLnRvQmUodHJ1ZSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiQ29zdCBhbGxvY2F0aW9uIHRhZ3MgKDAzMSlcIiwgKCkgPT4ge1xuICAgIGl0KFwiQWdlbnRDb3JlIFJ1bnRpbWUgc2hvdWxkIGhhdmUgY29zdCBhbGxvY2F0aW9uIHRhZ3NcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgcnVudGltZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpCZWRyb2NrQWdlbnRDb3JlOjpSdW50aW1lXCIpO1xuICAgICAgZXhwZWN0KE9iamVjdC5rZXlzKHJ1bnRpbWVzKS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMSk7XG4gICAgICBmb3IgKGNvbnN0IFssIGRlZl0gb2YgT2JqZWN0LmVudHJpZXMocnVudGltZXMpKSB7XG4gICAgICAgIGNvbnN0IHRhZ3MgPSAoZGVmIGFzIHsgUHJvcGVydGllcz86IHsgVGFncz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSB9KS5Qcm9wZXJ0aWVzPy5UYWdzO1xuICAgICAgICBleHBlY3QodGFncykudG9CZURlZmluZWQoKTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgUkVRVUlSRURfQ09TVF9BTExPQ0FUSU9OX1RBR19LRVlTKSB7XG4gICAgICAgICAgZXhwZWN0KHRhZ3MhW2tleV0pLnRvQmVEZWZpbmVkKCk7XG4gICAgICAgICAgZXhwZWN0KHR5cGVvZiB0YWdzIVtrZXldKS50b0JlKFwic3RyaW5nXCIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiU3RhY2sgT3V0cHV0c1wiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgb3V0cHV0IFNsYWNrRXZlbnRIYW5kbGVyVXJsXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlNsYWNrRXZlbnRIYW5kbGVyVXJsXCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJTbGFjayBFdmVudCBIYW5kbGVyIEZ1bmN0aW9uIFVSTFwiKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgb3V0cHV0IFZlcmlmaWNhdGlvbkxhbWJkYVJvbGVBcm5cIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwiVmVyaWZpY2F0aW9uTGFtYmRhUm9sZUFyblwiLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiVmVyaWZpY2F0aW9uIExhbWJkYSBSb2xlIEFSTlwiKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgb3V0cHV0IFNsYWNrRXZlbnRIYW5kbGVyQXJuXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlNsYWNrRXZlbnRIYW5kbGVyQXJuXCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJTbGFja0V2ZW50SGFuZGxlciBMYW1iZGEgQVJOXCIpLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=