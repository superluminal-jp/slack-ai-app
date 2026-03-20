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
const cdk_tooling_1 = require("@slack-ai-app/cdk-tooling");
const cdk_nag_1 = require("cdk-nag");
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
        it("should create 6 DynamoDB tables", () => {
            const tables = template.findResources("AWS::DynamoDB::Table");
            expect(Object.keys(tables).length).toBe(6);
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
    describe("S3 File Exchange Bucket", () => {
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
    describe("Cost allocation tags", () => {
        it("AgentCore Runtime should have cost allocation tags", () => {
            const runtimes = template.findResources("AWS::BedrockAgentCore::Runtime");
            expect(Object.keys(runtimes).length).toBeGreaterThanOrEqual(1);
            for (const [, def] of Object.entries(runtimes)) {
                const tags = def.Properties?.Tags;
                expect(tags).toBeDefined();
                for (const key of cdk_tooling_1.REQUIRED_COST_ALLOCATION_TAG_KEYS) {
                    expect(tags[key]).toBeDefined();
                    expect(typeof tags[key]).toBe("string");
                }
            }
        });
    });
    describe("API Gateway ingress with WAF", () => {
        it("should create a Regional API Gateway REST API", () => {
            template.hasResourceProperties("AWS::ApiGateway::RestApi", {
                Name: assertions_1.Match.stringLikeRegexp("slack-ingress"),
                EndpointConfiguration: {
                    Types: ["REGIONAL"],
                },
            });
        });
        it("should configure API Gateway stage throttling", () => {
            template.hasResourceProperties("AWS::ApiGateway::Stage", {
                MethodSettings: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        HttpMethod: "*",
                        ResourcePath: "/*",
                        ThrottlingBurstLimit: 50,
                        ThrottlingRateLimit: 25,
                    }),
                ]),
            });
        });
        it("should create WAF Web ACL and associate it with API Gateway stage", () => {
            template.hasResourceProperties("AWS::WAFv2::WebACL", {
                Scope: "REGIONAL",
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Name: "AWS-AWSManagedRulesCommonRuleSet",
                    }),
                    assertions_1.Match.objectLike({
                        Name: "SlackIngressRateLimit",
                    }),
                ]),
            });
            // ResourceArn is a CFn Fn::Join intrinsic (not a plain string); verify the association exists
            const associations = template.findResources("AWS::WAFv2::WebACLAssociation");
            expect(Object.keys(associations).length).toBeGreaterThan(0);
        });
    });
    describe("Stack Outputs", () => {
        it("should output SlackEventHandlerApiGatewayUrl", () => {
            template.hasOutput("SlackEventHandlerApiGatewayUrl", {
                Description: assertions_1.Match.stringLikeRegexp("API Gateway URL"),
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
    describe("Auto-reply channel configuration", () => {
        it("should NOT set AUTO_REPLY_CHANNEL_IDS when autoReplyChannelIds is not provided", () => {
            // The default template (created in beforeAll) has no autoReplyChannelIds
            const lambdas = template.findResources("AWS::Lambda::Function");
            const handlerEntry = Object.entries(lambdas).find(([id]) => id.includes("SlackEventHandler") && id.includes("Handler"));
            expect(handlerEntry).toBeDefined();
            if (handlerEntry) {
                const envVars = handlerEntry[1]
                    ?.Properties?.Environment?.Variables ?? {};
                expect(envVars["AUTO_REPLY_CHANNEL_IDS"]).toBeUndefined();
            }
        });
        it("should set AUTO_REPLY_CHANNEL_IDS when autoReplyChannelIds is provided", () => {
            process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
            process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
            const app2 = new cdk.App();
            const stack2 = new verification_stack_1.VerificationStack(app2, "TestVerificationStackAutoReply", {
                env: { account: "123456789012", region: "ap-northeast-1" },
                autoReplyChannelIds: ["C0AFSG79T8D", "C1BBBBBBBBB"],
            });
            const t2 = assertions_1.Template.fromStack(stack2);
            t2.hasResourceProperties("AWS::Lambda::Function", {
                Environment: {
                    Variables: assertions_1.Match.objectLike({
                        AUTO_REPLY_CHANNEL_IDS: "C0AFSG79T8D,C1BBBBBBBBB",
                    }),
                },
            });
        });
        it("should set AUTO_REPLY_CHANNEL_IDS with only IDs when object-format entries are provided", () => {
            process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
            process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
            const app3 = new cdk.App();
            const stack3 = new verification_stack_1.VerificationStack(app3, "TestVerificationStackAutoReplyObj", {
                env: { account: "123456789012", region: "ap-northeast-1" },
                autoReplyChannelIds: [
                    { id: "C0AFSG79T8D", label: "#general" },
                    "C1BBBBBBBBB",
                ],
            });
            const t3 = assertions_1.Template.fromStack(stack3);
            t3.hasResourceProperties("AWS::Lambda::Function", {
                Environment: {
                    Variables: assertions_1.Match.objectLike({
                        AUTO_REPLY_CHANNEL_IDS: "C0AFSG79T8D,C1BBBBBBBBB",
                    }),
                },
            });
        });
    });
    describe("Mention channel configuration", () => {
        it("should NOT set MENTION_CHANNEL_IDS when mentionChannelIds is not provided", () => {
            const lambdas = template.findResources("AWS::Lambda::Function");
            const handlerEntry = Object.entries(lambdas).find(([id]) => id.includes("SlackEventHandler") && id.includes("Handler"));
            expect(handlerEntry).toBeDefined();
            if (handlerEntry) {
                const envVars = handlerEntry[1]
                    ?.Properties?.Environment?.Variables ?? {};
                expect(envVars["MENTION_CHANNEL_IDS"]).toBeUndefined();
            }
        });
        it("should set MENTION_CHANNEL_IDS when mentionChannelIds is provided", () => {
            process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
            process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
            const app2 = new cdk.App();
            const stack2 = new verification_stack_1.VerificationStack(app2, "TestVerificationStackMentionChannels", {
                env: { account: "123456789012", region: "ap-northeast-1" },
                mentionChannelIds: ["C0AFSG79T8D", "C2CCCCCCCCC"],
            });
            const t2 = assertions_1.Template.fromStack(stack2);
            t2.hasResourceProperties("AWS::Lambda::Function", {
                Environment: {
                    Variables: assertions_1.Match.objectLike({
                        MENTION_CHANNEL_IDS: "C0AFSG79T8D,C2CCCCCCCCC",
                    }),
                },
            });
        });
        it("should set MENTION_CHANNEL_IDS with only IDs when object-format entries are provided", () => {
            process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
            process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
            const app3 = new cdk.App();
            const stack3 = new verification_stack_1.VerificationStack(app3, "TestVerificationStackMentionChannelsObj", {
                env: { account: "123456789012", region: "ap-northeast-1" },
                mentionChannelIds: [
                    { id: "C0AFSG79T8D", label: "#ai-bot" },
                    { id: "C2CCCCCCCCC", label: "#engineering" },
                ],
            });
            const t3 = assertions_1.Template.fromStack(stack3);
            t3.hasResourceProperties("AWS::Lambda::Function", {
                Environment: {
                    Variables: assertions_1.Match.objectLike({
                        MENTION_CHANNEL_IDS: "C0AFSG79T8D,C2CCCCCCCCC",
                    }),
                },
            });
        });
    });
});
describe("cdk-nag security scan", () => {
    it("has no unresolved cdk-nag errors", () => {
        process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
        process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
        const nagApp = new cdk.App();
        const nagStack = new verification_stack_1.VerificationStack(nagApp, "NagTestStack", {
            env: { account: "123456789012", region: "ap-northeast-1" },
            executionAgentArns: {
                "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/TestExecutionAgent",
            },
        });
        cdk.Aspects.of(nagApp).add(new cdk_nag_1.AwsSolutionsChecks({ verbose: true }));
        const errors = assertions_1.Annotations.fromStack(nagStack).findError("*", assertions_1.Match.stringLikeRegexp(".*"));
        delete process.env.SLACK_BOT_TOKEN;
        delete process.env.SLACK_SIGNING_SECRET;
        expect(errors).toHaveLength(0);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tc3RhY2sudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOzs7Ozs7R0FNRztBQUNILGlEQUFtQztBQUNuQyx1REFBc0U7QUFDdEUsMkRBQThFO0FBQzlFLHFDQUE2QztBQUM3QyxrRUFBOEQ7QUFhOUQsU0FBUyxlQUFlLENBQ3RCLFFBQWtCLEVBQ2xCLGFBQXFCO0lBRXJCLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUN6RCxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FDNUMsR0FBNkIsQ0FBQyxVQUFVLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUNoRixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMscUJBQXFCLENBQzVCLFFBQWtCLEVBQ2xCLFNBQXlDO0lBRXpDLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsQ0FBQztJQUNoRSxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDN0UsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUN0QixRQUFpQyxFQUNqQyxNQUFjO0lBRWQsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO1FBQzFDLE1BQU0sR0FBRyxHQUFJLEdBQXlCLENBQUMsVUFBVSxFQUFF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QUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztRQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLHFCQUFxQixDQUFDO1FBQ3pELE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzdCLE1BQU0sUUFBUSxHQUFHLElBQUksc0NBQWlCLENBQUMsTUFBTSxFQUFFLGNBQWMsRUFBRTtZQUM3RCxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRTtZQUMxRCxrQkFBa0IsRUFBRTtnQkFDbEIsY0FBYyxFQUNaLGtGQUFrRjthQUNyRjtTQUNGLENBQUMsQ0FBQztRQUNILEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDRCQUFrQixDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0RSxNQUFNLE1BQU0sR0FBRyx3QkFBVyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQ3RELEdBQUcsRUFDSCxrQkFBSyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUM3QixDQUFDO1FBQ0YsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQztRQUNuQyxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUM7UUFDeEMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqQyxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBWZXJpZmljYXRpb25TdGFjayBDREsgdW5pdCB0ZXN0cy5cbiAqXG4gKiBTeW50aGVzaXMgcnVucyBMYW1iZGEgYXNzZXQgYnVuZGxpbmcgKGxvY2FsIHBpcCBmaXJzdCwgdGhlbiBEb2NrZXIpLiBGb3IgQ0kvc2FuZGJveDpcbiAqIC0gUHJlZmVyIGxvY2FsIHBpcCBzbyBEb2NrZXIvQ29saW1hIGlzIG5vdCByZXF1aXJlZC5cbiAqIC0gSWYgdXNpbmcgRG9ja2VyLCBlbnN1cmUgQ29saW1hIChvciBEb2NrZXIpIGlzIHJ1bm5pbmcgYW5kIERPQ0tFUl9IT1NUIGlzIHNldC5cbiAqL1xuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgVGVtcGxhdGUsIE1hdGNoLCBBbm5vdGF0aW9ucyB9IGZyb20gXCJhd3MtY2RrLWxpYi9hc3NlcnRpb25zXCI7XG5pbXBvcnQgeyBSRVFVSVJFRF9DT1NUX0FMTE9DQVRJT05fVEFHX0tFWVMgfSBmcm9tIFwiQHNsYWNrLWFpLWFwcC9jZGstdG9vbGluZ1wiO1xuaW1wb3J0IHsgQXdzU29sdXRpb25zQ2hlY2tzIH0gZnJvbSBcImNkay1uYWdcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvblN0YWNrIH0gZnJvbSBcIi4uL2xpYi92ZXJpZmljYXRpb24tc3RhY2tcIjtcblxuLyoqIFJlc291cmNlIHdpdGggb3B0aW9uYWwgUHJvcGVydGllcy5RdWV1ZU5hbWUgKFNRUywgZXRjLikgKi9cbnR5cGUgUmVzb3VyY2VXaXRoUXVldWVOYW1lID0geyBQcm9wZXJ0aWVzPzogeyBRdWV1ZU5hbWU/OiBzdHJpbmcgfSB9O1xuXG4vKiogSUFNIHBvbGljeSByZXNvdXJjZSB3aXRoIFN0YXRlbWVudCBhcnJheSAqL1xudHlwZSBJQU1Qb2xpY3lSZXNvdXJjZSA9IHtcbiAgUHJvcGVydGllcz86IHsgUG9saWN5RG9jdW1lbnQ/OiB7IFN0YXRlbWVudD86IHVua25vd25bXSB9IH07XG59O1xuXG4vKiogSUFNIHN0YXRlbWVudCB3aXRoIEFjdGlvbiAoc3RyaW5nIG9yIHN0cmluZ1tdKSAqL1xudHlwZSBJQU1TdGF0ZW1lbnQgPSB7IEFjdGlvbj86IHN0cmluZyB8IHN0cmluZ1tdOyBFZmZlY3Q/OiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZmluZFF1ZXVlQnlOYW1lKFxuICB0ZW1wbGF0ZTogVGVtcGxhdGUsXG4gIG5hbWVTdWJzdHJpbmc6IHN0cmluZ1xuKTogW3N0cmluZywgdW5rbm93bl0gfCB1bmRlZmluZWQge1xuICBjb25zdCBxdWV1ZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpTUVM6OlF1ZXVlXCIpO1xuICByZXR1cm4gT2JqZWN0LmVudHJpZXMocXVldWVzKS5maW5kKChbLCByZXNdKSA9PlxuICAgIChyZXMgYXMgUmVzb3VyY2VXaXRoUXVldWVOYW1lKS5Qcm9wZXJ0aWVzPy5RdWV1ZU5hbWU/LmluY2x1ZGVzPy4obmFtZVN1YnN0cmluZylcbiAgKTtcbn1cblxuZnVuY3Rpb24gZmluZExhbWJkYUJ5TG9naWNhbElkKFxuICB0ZW1wbGF0ZTogVGVtcGxhdGUsXG4gIHByZWRpY2F0ZTogKGxvZ2ljYWxJZDogc3RyaW5nKSA9PiBib29sZWFuXG4pOiBbc3RyaW5nLCB1bmtub3duXSB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGxhbWJkYXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIpO1xuICByZXR1cm4gT2JqZWN0LmVudHJpZXMobGFtYmRhcykuZmluZCgoW2xvZ2ljYWxJZF0pID0+IHByZWRpY2F0ZShsb2dpY2FsSWQpKTtcbn1cblxuZnVuY3Rpb24gcG9saWN5SGFzQWN0aW9uKFxuICBwb2xpY2llczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gIGFjdGlvbjogc3RyaW5nXG4pOiBib29sZWFuIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMocG9saWNpZXMpLnNvbWUoKHJlcykgPT4ge1xuICAgIGNvbnN0IGRvYyA9IChyZXMgYXMgSUFNUG9saWN5UmVzb3VyY2UpLlByb3BlcnRpZXM/LlBvbGljeURvY3VtZW50O1xuICAgIGNvbnN0IHN0bXRzID0gKGRvYz8uU3RhdGVtZW50ID8/IFtdKSBhcyBJQU1TdGF0ZW1lbnRbXTtcbiAgICByZXR1cm4gc3RtdHMuc29tZSgocykgPT4ge1xuICAgICAgY29uc3QgYSA9IHMuQWN0aW9uO1xuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYSkgPyBhLmluY2x1ZGVzKGFjdGlvbikgOiBhID09PSBhY3Rpb247XG4gICAgfSk7XG4gIH0pO1xufVxuXG5kZXNjcmliZShcIlZlcmlmaWNhdGlvblN0YWNrXCIsICgpID0+IHtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiA9IFwieG94Yi10ZXN0LXRva2VuXCI7XG4gICAgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQgPSBcInRlc3Qtc2lnbmluZy1zZWNyZXRcIjtcblxuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3Qgc3RhY2sgPSBuZXcgVmVyaWZpY2F0aW9uU3RhY2soYXBwLCBcIlRlc3RWZXJpZmljYXRpb25TdGFja1wiLCB7XG4gICAgICBlbnY6IHsgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIiwgcmVnaW9uOiBcImFwLW5vcnRoZWFzdC0xXCIgfSxcbiAgICAgIGV4ZWN1dGlvbkFnZW50QXJuczoge1xuICAgICAgICBcImZpbGUtY3JlYXRvclwiOlxuICAgICAgICAgIFwiYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZTphcC1ub3J0aGVhc3QtMToxMjM0NTY3ODkwMTI6cnVudGltZS9UZXN0RXhlY3V0aW9uQWdlbnRcIixcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICB9KTtcblxuICBhZnRlckFsbCgoKSA9PiB7XG4gICAgZGVsZXRlIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTjtcbiAgICBkZWxldGUgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQ7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiQTJBIG9ubHkgKG5vIGxlZ2FjeSlcIiwgKCkgPT4ge1xuICAgIGl0KFwibXVzdCBOT1QgY29udGFpbiBFeGVjdXRpb25SZXNwb25zZVF1ZXVlIFNRUyBxdWV1ZVwiLCAoKSA9PiB7XG4gICAgICBleHBlY3QoZmluZFF1ZXVlQnlOYW1lKHRlbXBsYXRlLCBcImV4ZWN1dGlvbi1yZXNwb25zZVwiKSkudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJtdXN0IE5PVCBjb250YWluIFNsYWNrUmVzcG9uc2VIYW5kbGVyIExhbWJkYVwiLCAoKSA9PiB7XG4gICAgICBleHBlY3QoXG4gICAgICAgIGZpbmRMYW1iZGFCeUxvZ2ljYWxJZCh0ZW1wbGF0ZSwgKGlkKSA9PiBpZC5pbmNsdWRlcyhcIlNsYWNrUmVzcG9uc2VIYW5kbGVyXCIpKVxuICAgICAgKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdChcIm11c3QgTk9UIGhhdmUgb3V0cHV0cyBFeGVjdXRpb25SZXNwb25zZVF1ZXVlVXJsLCBFeGVjdXRpb25SZXNwb25zZVF1ZXVlQXJuXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS50b0pTT04oKS5PdXRwdXRzID8/IHt9O1xuICAgICAgZXhwZWN0KG91dHB1dHMuRXhlY3V0aW9uUmVzcG9uc2VRdWV1ZVVybCkudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KG91dHB1dHMuRXhlY3V0aW9uUmVzcG9uc2VRdWV1ZUFybikudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIjAxNiBhc3luYyBpbnZvY2F0aW9uIChTUVMgKyBBZ2VudCBJbnZva2VyKVwiLCAoKSA9PiB7XG4gICAgaXQoXCJtdXN0IGNvbnRhaW4gU1FTIHF1ZXVlIGZvciBhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3RcIiwgKCkgPT4ge1xuICAgICAgZXhwZWN0KGZpbmRRdWV1ZUJ5TmFtZSh0ZW1wbGF0ZSwgXCJhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3RcIikpLnRvQmVEZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdChcIm11c3QgY29udGFpbiBMYW1iZGEgZnVuY3Rpb24gZm9yIEFnZW50IEludm9rZXJcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgYWdlbnRJbnZva2VyID0gZmluZExhbWJkYUJ5TG9naWNhbElkKFxuICAgICAgICB0ZW1wbGF0ZSxcbiAgICAgICAgKGlkKSA9PiBpZC5pbmNsdWRlcyhcIkFnZW50SW52b2tlclwiKSAmJiAhaWQuaW5jbHVkZXMoXCJTbGFja0V2ZW50SGFuZGxlclwiKVxuICAgICAgKTtcbiAgICAgIGV4cGVjdChhZ2VudEludm9rZXIpLnRvQmVEZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdChcIlNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSByb2xlIG11c3QgaGF2ZSBzcXM6U2VuZE1lc3NhZ2Ugb24gYWdlbnQtaW52b2NhdGlvbiBxdWV1ZVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OklBTTo6UG9saWN5XCIsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1wic3FzOlNlbmRNZXNzYWdlXCJdKSxcbiAgICAgICAgICAgICAgRWZmZWN0OiBcIkFsbG93XCIsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJBZ2VudCBJbnZva2VyIExhbWJkYSByb2xlIG11c3QgaGF2ZSBiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgcG9saWNpZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpJQU06OlBvbGljeVwiKTtcbiAgICAgIGV4cGVjdChcbiAgICAgICAgcG9saWN5SGFzQWN0aW9uKHBvbGljaWVzLCBcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiKVxuICAgICAgKS50b0JlKHRydWUpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3QgcXVldWUgbXVzdCBoYXZlIHJlZHJpdmVQb2xpY3kgd2l0aCBkZWFkTGV0dGVyVGFyZ2V0QXJuIGFuZCBtYXhSZWNlaXZlQ291bnQgM1wiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNRUzo6UXVldWVcIiwge1xuICAgICAgICBRdWV1ZU5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3RcIiksXG4gICAgICAgIFJlZHJpdmVQb2xpY3k6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgIGRlYWRMZXR0ZXJUYXJnZXRBcm46IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIlNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYVwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSBmdW5jdGlvblwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBSdW50aW1lOiBcInB5dGhvbjMuMTFcIixcbiAgICAgICAgVGltZW91dDogMTIwLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBoYXZlIGJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZSBwZXJtaXNzaW9uIChBMkEpXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6SUFNOjpQb2xpY3lcIiwge1xuICAgICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBBY3Rpb246IFwiYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCIsXG4gICAgICAgICAgICAgIEVmZmVjdDogXCJBbGxvd1wiLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJEeW5hbW9EQiBUYWJsZXNcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSA2IER5bmFtb0RCIHRhYmxlc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCB0YWJsZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIik7XG4gICAgICBleHBlY3QoT2JqZWN0LmtleXModGFibGVzKS5sZW5ndGgpLnRvQmUoNik7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgdGFibGVzIHdpdGggUEFZX1BFUl9SRVFVRVNUIGJpbGxpbmdcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIiwge1xuICAgICAgICBCaWxsaW5nTW9kZTogXCJQQVlfUEVSX1JFUVVFU1RcIixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIHRhYmxlcyB3aXRoIFNTRSBlbmFibGVkXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RHluYW1vREI6OlRhYmxlXCIsIHtcbiAgICAgICAgU1NFU3BlY2lmaWNhdGlvbjoge1xuICAgICAgICAgIFNTRUVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBldmVudCBkZWR1cGUgdGFibGUgd2l0aCBUVExcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIiwge1xuICAgICAgICBUYWJsZU5hbWU6IFwiVGVzdFZlcmlmaWNhdGlvblN0YWNrLWV2ZW50LWRlZHVwZVwiLFxuICAgICAgICBUaW1lVG9MaXZlU3BlY2lmaWNhdGlvbjoge1xuICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6IFwidHRsXCIsXG4gICAgICAgICAgRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIlNlY3JldHMgTWFuYWdlclwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFNsYWNrIHNpZ25pbmcgc2VjcmV0XCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6U2VjcmV0c01hbmFnZXI6OlNlY3JldFwiLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiBcIlNsYWNrIGFwcCBzaWduaW5nIHNlY3JldCBmb3IgcmVxdWVzdCB2ZXJpZmljYXRpb25cIixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFNsYWNrIGJvdCB0b2tlbiBzZWNyZXRcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTZWNyZXRzTWFuYWdlcjo6U2VjcmV0XCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IFwiU2xhY2sgYm90IE9BdXRoIHRva2VuXCIsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJDbG91ZFdhdGNoIEFsYXJtc1wiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIHdoaXRlbGlzdCBhdXRob3JpemF0aW9uIGZhaWx1cmUgYWxhcm1cIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpDbG91ZFdhdGNoOjpBbGFybVwiLCB7XG4gICAgICAgIEFsYXJtRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXG4gICAgICAgICAgXCJ3aGl0ZWxpc3QgYXV0aG9yaXphdGlvbiBmYWlsdXJlc1wiXG4gICAgICAgICksXG4gICAgICAgIE5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBNZXRyaWNOYW1lOiBcIldoaXRlbGlzdEF1dGhvcml6YXRpb25GYWlsZWRcIixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIGV4aXN0ZW5jZSBjaGVjayBmYWlsdXJlIGFsYXJtXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Q2xvdWRXYXRjaDo6QWxhcm1cIiwge1xuICAgICAgICBBbGFybURlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiRXhpc3RlbmNlIENoZWNrIGZhaWx1cmVzXCIpLFxuICAgICAgICBOYW1lc3BhY2U6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgTWV0cmljTmFtZTogXCJFeGlzdGVuY2VDaGVja0ZhaWxlZFwiLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgcmF0ZSBsaW1pdCBleGNlZWRlZCBhbGFybVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtXCIsIHtcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcInJhdGUgbGltaXQgZXhjZWVkZWRcIiksXG4gICAgICAgIE5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBNZXRyaWNOYW1lOiBcIlJhdGVMaW1pdEV4Y2VlZGVkXCIsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJTMyBGaWxlIEV4Y2hhbmdlIEJ1Y2tldFwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFMzIGJ1Y2tldCBmb3IgZmlsZSBleGNoYW5nZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBidWNrZXRzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6UzM6OkJ1Y2tldFwiKTtcbiAgICAgIGNvbnN0IGJ1Y2tldEtleXMgPSBPYmplY3Qua2V5cyhidWNrZXRzKTtcbiAgICAgIGV4cGVjdChidWNrZXRLZXlzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgxKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGhhdmUgYmxvY2sgcHVibGljIGFjY2VzcyBlbmFibGVkIG9uIGZpbGUgZXhjaGFuZ2UgYnVja2V0XCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIEJsb2NrUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcbiAgICAgICAgICBJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIFJlc3RyaWN0UHVibGljQnVja2V0czogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgaGF2ZSBsaWZlY3ljbGUgcnVsZSBmb3IgYXR0YWNobWVudHMvIHByZWZpeCB3aXRoIDEtZGF5IGV4cGlyeVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBMaWZlY3ljbGVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgUHJlZml4OiBcImF0dGFjaG1lbnRzL1wiLFxuICAgICAgICAgICAgICBFeHBpcmF0aW9uSW5EYXlzOiAxLFxuICAgICAgICAgICAgICBTdGF0dXM6IFwiRW5hYmxlZFwiLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGhhdmUgU1NFLVMzIGVuY3J5cHRpb24gKEJ1Y2tldEVuY3J5cHRpb24gd2l0aCBBRVMyNTYpXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIEJ1Y2tldEVuY3J5cHRpb246IHtcbiAgICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkNvbmZpZ3VyYXRpb246IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25CeURlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICBTU0VBbGdvcml0aG06IFwiQUVTMjU2XCIsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJ2ZXJpZmljYXRpb24gYWdlbnQgcm9sZSBtdXN0IGhhdmUgUzMgcGVybWlzc2lvbnMgZm9yIGZpbGUgZXhjaGFuZ2UgYnVja2V0XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHBvbGljaWVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6SUFNOjpQb2xpY3lcIik7XG4gICAgICBleHBlY3QocG9saWN5SGFzQWN0aW9uKHBvbGljaWVzLCBcInMzOkdldE9iamVjdCpcIikpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3QocG9saWN5SGFzQWN0aW9uKHBvbGljaWVzLCBcInMzOlB1dE9iamVjdFwiKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChwb2xpY3lIYXNBY3Rpb24ocG9saWNpZXMsIFwiczM6RGVsZXRlT2JqZWN0KlwiKSkudG9CZSh0cnVlKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJDb3N0IGFsbG9jYXRpb24gdGFnc1wiLCAoKSA9PiB7XG4gICAgaXQoXCJBZ2VudENvcmUgUnVudGltZSBzaG91bGQgaGF2ZSBjb3N0IGFsbG9jYXRpb24gdGFnc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBydW50aW1lcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkJlZHJvY2tBZ2VudENvcmU6OlJ1bnRpbWVcIik7XG4gICAgICBleHBlY3QoT2JqZWN0LmtleXMocnVudGltZXMpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgxKTtcbiAgICAgIGZvciAoY29uc3QgWywgZGVmXSBvZiBPYmplY3QuZW50cmllcyhydW50aW1lcykpIHtcbiAgICAgICAgY29uc3QgdGFncyA9IChkZWYgYXMgeyBQcm9wZXJ0aWVzPzogeyBUYWdzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9IH0pLlByb3BlcnRpZXM/LlRhZ3M7XG4gICAgICAgIGV4cGVjdCh0YWdzKS50b0JlRGVmaW5lZCgpO1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBSRVFVSVJFRF9DT1NUX0FMTE9DQVRJT05fVEFHX0tFWVMpIHtcbiAgICAgICAgICBleHBlY3QodGFncyFba2V5XSkudG9CZURlZmluZWQoKTtcbiAgICAgICAgICBleHBlY3QodHlwZW9mIHRhZ3MhW2tleV0pLnRvQmUoXCJzdHJpbmdcIik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cblxuICBkZXNjcmliZShcIkFQSSBHYXRld2F5IGluZ3Jlc3Mgd2l0aCBXQUZcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBhIFJlZ2lvbmFsIEFQSSBHYXRld2F5IFJFU1QgQVBJXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6QXBpR2F0ZXdheTo6UmVzdEFwaVwiLCB7XG4gICAgICAgIE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJzbGFjay1pbmdyZXNzXCIpLFxuICAgICAgICBFbmRwb2ludENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBUeXBlczogW1wiUkVHSU9OQUxcIl0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNvbmZpZ3VyZSBBUEkgR2F0ZXdheSBzdGFnZSB0aHJvdHRsaW5nXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6QXBpR2F0ZXdheTo6U3RhZ2VcIiwge1xuICAgICAgICBNZXRob2RTZXR0aW5nczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEh0dHBNZXRob2Q6IFwiKlwiLFxuICAgICAgICAgICAgUmVzb3VyY2VQYXRoOiBcIi8qXCIsXG4gICAgICAgICAgICBUaHJvdHRsaW5nQnVyc3RMaW1pdDogNTAsXG4gICAgICAgICAgICBUaHJvdHRsaW5nUmF0ZUxpbWl0OiAyNSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBXQUYgV2ViIEFDTCBhbmQgYXNzb2NpYXRlIGl0IHdpdGggQVBJIEdhdGV3YXkgc3RhZ2VcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpXQUZ2Mjo6V2ViQUNMXCIsIHtcbiAgICAgICAgU2NvcGU6IFwiUkVHSU9OQUxcIixcbiAgICAgICAgUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiBcIkFXUy1BV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0XCIsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiBcIlNsYWNrSW5ncmVzc1JhdGVMaW1pdFwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBSZXNvdXJjZUFybiBpcyBhIENGbiBGbjo6Sm9pbiBpbnRyaW5zaWMgKG5vdCBhIHBsYWluIHN0cmluZyk7IHZlcmlmeSB0aGUgYXNzb2NpYXRpb24gZXhpc3RzXG4gICAgICBjb25zdCBhc3NvY2lhdGlvbnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpXQUZ2Mjo6V2ViQUNMQXNzb2NpYXRpb25cIik7XG4gICAgICBleHBlY3QoT2JqZWN0LmtleXMoYXNzb2NpYXRpb25zKS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJTdGFjayBPdXRwdXRzXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBvdXRwdXQgU2xhY2tFdmVudEhhbmRsZXJBcGlHYXRld2F5VXJsXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlNsYWNrRXZlbnRIYW5kbGVyQXBpR2F0ZXdheVVybFwiLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiQVBJIEdhdGV3YXkgVVJMXCIpLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBvdXRwdXQgVmVyaWZpY2F0aW9uTGFtYmRhUm9sZUFyblwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoXCJWZXJpZmljYXRpb25MYW1iZGFSb2xlQXJuXCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJWZXJpZmljYXRpb24gTGFtYmRhIFJvbGUgQVJOXCIpLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBvdXRwdXQgU2xhY2tFdmVudEhhbmRsZXJBcm5cIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwiU2xhY2tFdmVudEhhbmRsZXJBcm5cIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcIlNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSBBUk5cIiksXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJBdXRvLXJlcGx5IGNoYW5uZWwgY29uZmlndXJhdGlvblwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgTk9UIHNldCBBVVRPX1JFUExZX0NIQU5ORUxfSURTIHdoZW4gYXV0b1JlcGx5Q2hhbm5lbElkcyBpcyBub3QgcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgLy8gVGhlIGRlZmF1bHQgdGVtcGxhdGUgKGNyZWF0ZWQgaW4gYmVmb3JlQWxsKSBoYXMgbm8gYXV0b1JlcGx5Q2hhbm5lbElkc1xuICAgICAgY29uc3QgbGFtYmRhcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIik7XG4gICAgICBjb25zdCBoYW5kbGVyRW50cnkgPSBPYmplY3QuZW50cmllcyhsYW1iZGFzKS5maW5kKChbaWRdKSA9PlxuICAgICAgICBpZC5pbmNsdWRlcyhcIlNsYWNrRXZlbnRIYW5kbGVyXCIpICYmIGlkLmluY2x1ZGVzKFwiSGFuZGxlclwiKVxuICAgICAgKTtcbiAgICAgIGV4cGVjdChoYW5kbGVyRW50cnkpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBpZiAoaGFuZGxlckVudHJ5KSB7XG4gICAgICAgIGNvbnN0IGVudlZhcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID1cbiAgICAgICAgICAoaGFuZGxlckVudHJ5WzFdIGFzIHsgUHJvcGVydGllcz86IHsgRW52aXJvbm1lbnQ/OiB7IFZhcmlhYmxlcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0gfSB9KVxuICAgICAgICAgICAgPy5Qcm9wZXJ0aWVzPy5FbnZpcm9ubWVudD8uVmFyaWFibGVzID8/IHt9O1xuICAgICAgICBleHBlY3QoZW52VmFyc1tcIkFVVE9fUkVQTFlfQ0hBTk5FTF9JRFNcIl0pLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIHNldCBBVVRPX1JFUExZX0NIQU5ORUxfSURTIHdoZW4gYXV0b1JlcGx5Q2hhbm5lbElkcyBpcyBwcm92aWRlZFwiLCAoKSA9PiB7XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19CT1RfVE9LRU4gPSBcInhveGItdGVzdC10b2tlblwiO1xuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQgPSBcInRlc3Qtc2lnbmluZy1zZWNyZXRcIjtcbiAgICAgIGNvbnN0IGFwcDIgPSBuZXcgY2RrLkFwcCgpO1xuICAgICAgY29uc3Qgc3RhY2syID0gbmV3IFZlcmlmaWNhdGlvblN0YWNrKGFwcDIsIFwiVGVzdFZlcmlmaWNhdGlvblN0YWNrQXV0b1JlcGx5XCIsIHtcbiAgICAgICAgZW52OiB7IGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsIHJlZ2lvbjogXCJhcC1ub3J0aGVhc3QtMVwiIH0sXG4gICAgICAgIGF1dG9SZXBseUNoYW5uZWxJZHM6IFtcIkMwQUZTRzc5VDhEXCIsIFwiQzFCQkJCQkJCQkJcIl0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHQyID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrMik7XG4gICAgICB0Mi5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBFbnZpcm9ubWVudDoge1xuICAgICAgICAgIFZhcmlhYmxlczogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBBVVRPX1JFUExZX0NIQU5ORUxfSURTOiBcIkMwQUZTRzc5VDhELEMxQkJCQkJCQkJCXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIHNldCBBVVRPX1JFUExZX0NIQU5ORUxfSURTIHdpdGggb25seSBJRHMgd2hlbiBvYmplY3QtZm9ybWF0IGVudHJpZXMgYXJlIHByb3ZpZGVkXCIsICgpID0+IHtcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiA9IFwieG94Yi10ZXN0LXRva2VuXCI7XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCA9IFwidGVzdC1zaWduaW5nLXNlY3JldFwiO1xuICAgICAgY29uc3QgYXBwMyA9IG5ldyBjZGsuQXBwKCk7XG4gICAgICBjb25zdCBzdGFjazMgPSBuZXcgVmVyaWZpY2F0aW9uU3RhY2soYXBwMywgXCJUZXN0VmVyaWZpY2F0aW9uU3RhY2tBdXRvUmVwbHlPYmpcIiwge1xuICAgICAgICBlbnY6IHsgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIiwgcmVnaW9uOiBcImFwLW5vcnRoZWFzdC0xXCIgfSxcbiAgICAgICAgYXV0b1JlcGx5Q2hhbm5lbElkczogW1xuICAgICAgICAgIHsgaWQ6IFwiQzBBRlNHNzlUOERcIiwgbGFiZWw6IFwiI2dlbmVyYWxcIiB9LFxuICAgICAgICAgIFwiQzFCQkJCQkJCQkJcIixcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdDMgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2szKTtcbiAgICAgIHQzLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgVmFyaWFibGVzOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFM6IFwiQzBBRlNHNzlUOEQsQzFCQkJCQkJCQkJcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIk1lbnRpb24gY2hhbm5lbCBjb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBOT1Qgc2V0IE1FTlRJT05fQ0hBTk5FTF9JRFMgd2hlbiBtZW50aW9uQ2hhbm5lbElkcyBpcyBub3QgcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgbGFtYmRhcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIik7XG4gICAgICBjb25zdCBoYW5kbGVyRW50cnkgPSBPYmplY3QuZW50cmllcyhsYW1iZGFzKS5maW5kKChbaWRdKSA9PlxuICAgICAgICBpZC5pbmNsdWRlcyhcIlNsYWNrRXZlbnRIYW5kbGVyXCIpICYmIGlkLmluY2x1ZGVzKFwiSGFuZGxlclwiKVxuICAgICAgKTtcbiAgICAgIGV4cGVjdChoYW5kbGVyRW50cnkpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBpZiAoaGFuZGxlckVudHJ5KSB7XG4gICAgICAgIGNvbnN0IGVudlZhcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID1cbiAgICAgICAgICAoaGFuZGxlckVudHJ5WzFdIGFzIHsgUHJvcGVydGllcz86IHsgRW52aXJvbm1lbnQ/OiB7IFZhcmlhYmxlcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0gfSB9KVxuICAgICAgICAgICAgPy5Qcm9wZXJ0aWVzPy5FbnZpcm9ubWVudD8uVmFyaWFibGVzID8/IHt9O1xuICAgICAgICBleHBlY3QoZW52VmFyc1tcIk1FTlRJT05fQ0hBTk5FTF9JRFNcIl0pLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIHNldCBNRU5USU9OX0NIQU5ORUxfSURTIHdoZW4gbWVudGlvbkNoYW5uZWxJZHMgaXMgcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOID0gXCJ4b3hiLXRlc3QtdG9rZW5cIjtcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX1NJR05JTkdfU0VDUkVUID0gXCJ0ZXN0LXNpZ25pbmctc2VjcmV0XCI7XG4gICAgICBjb25zdCBhcHAyID0gbmV3IGNkay5BcHAoKTtcbiAgICAgIGNvbnN0IHN0YWNrMiA9IG5ldyBWZXJpZmljYXRpb25TdGFjayhhcHAyLCBcIlRlc3RWZXJpZmljYXRpb25TdGFja01lbnRpb25DaGFubmVsc1wiLCB7XG4gICAgICAgIGVudjogeyBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLCByZWdpb246IFwiYXAtbm9ydGhlYXN0LTFcIiB9LFxuICAgICAgICBtZW50aW9uQ2hhbm5lbElkczogW1wiQzBBRlNHNzlUOERcIiwgXCJDMkNDQ0NDQ0NDQ1wiXSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdDIgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2syKTtcbiAgICAgIHQyLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgVmFyaWFibGVzOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE1FTlRJT05fQ0hBTk5FTF9JRFM6IFwiQzBBRlNHNzlUOEQsQzJDQ0NDQ0NDQ0NcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgc2V0IE1FTlRJT05fQ0hBTk5FTF9JRFMgd2l0aCBvbmx5IElEcyB3aGVuIG9iamVjdC1mb3JtYXQgZW50cmllcyBhcmUgcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOID0gXCJ4b3hiLXRlc3QtdG9rZW5cIjtcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX1NJR05JTkdfU0VDUkVUID0gXCJ0ZXN0LXNpZ25pbmctc2VjcmV0XCI7XG4gICAgICBjb25zdCBhcHAzID0gbmV3IGNkay5BcHAoKTtcbiAgICAgIGNvbnN0IHN0YWNrMyA9IG5ldyBWZXJpZmljYXRpb25TdGFjayhhcHAzLCBcIlRlc3RWZXJpZmljYXRpb25TdGFja01lbnRpb25DaGFubmVsc09ialwiLCB7XG4gICAgICAgIGVudjogeyBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLCByZWdpb246IFwiYXAtbm9ydGhlYXN0LTFcIiB9LFxuICAgICAgICBtZW50aW9uQ2hhbm5lbElkczogW1xuICAgICAgICAgIHsgaWQ6IFwiQzBBRlNHNzlUOERcIiwgbGFiZWw6IFwiI2FpLWJvdFwiIH0sXG4gICAgICAgICAgeyBpZDogXCJDMkNDQ0NDQ0NDQ1wiLCBsYWJlbDogXCIjZW5naW5lZXJpbmdcIiB9LFxuICAgICAgICBdLFxuICAgICAgfSk7XG4gICAgICBjb25zdCB0MyA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjazMpO1xuICAgICAgdDMuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWYXJpYWJsZXM6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTUVOVElPTl9DSEFOTkVMX0lEUzogXCJDMEFGU0c3OVQ4RCxDMkNDQ0NDQ0NDQ1wiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKFwiY2RrLW5hZyBzZWN1cml0eSBzY2FuXCIsICgpID0+IHtcbiAgaXQoXCJoYXMgbm8gdW5yZXNvbHZlZCBjZGstbmFnIGVycm9yc1wiLCAoKSA9PiB7XG4gICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOID0gXCJ4b3hiLXRlc3QtdG9rZW5cIjtcbiAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCA9IFwidGVzdC1zaWduaW5nLXNlY3JldFwiO1xuICAgIGNvbnN0IG5hZ0FwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3QgbmFnU3RhY2sgPSBuZXcgVmVyaWZpY2F0aW9uU3RhY2sobmFnQXBwLCBcIk5hZ1Rlc3RTdGFja1wiLCB7XG4gICAgICBlbnY6IHsgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIiwgcmVnaW9uOiBcImFwLW5vcnRoZWFzdC0xXCIgfSxcbiAgICAgIGV4ZWN1dGlvbkFnZW50QXJuczoge1xuICAgICAgICBcImZpbGUtY3JlYXRvclwiOlxuICAgICAgICAgIFwiYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZTphcC1ub3J0aGVhc3QtMToxMjM0NTY3ODkwMTI6cnVudGltZS9UZXN0RXhlY3V0aW9uQWdlbnRcIixcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgY2RrLkFzcGVjdHMub2YobmFnQXBwKS5hZGQobmV3IEF3c1NvbHV0aW9uc0NoZWNrcyh7IHZlcmJvc2U6IHRydWUgfSkpO1xuICAgIGNvbnN0IGVycm9ycyA9IEFubm90YXRpb25zLmZyb21TdGFjayhuYWdTdGFjaykuZmluZEVycm9yKFxuICAgICAgXCIqXCIsXG4gICAgICBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiLipcIilcbiAgICApO1xuICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5TTEFDS19CT1RfVE9LRU47XG4gICAgZGVsZXRlIHByb2Nlc3MuZW52LlNMQUNLX1NJR05JTkdfU0VDUkVUO1xuICAgIGV4cGVjdChlcnJvcnMpLnRvSGF2ZUxlbmd0aCgwKTtcbiAgfSk7XG59KTtcbiJdfQ==