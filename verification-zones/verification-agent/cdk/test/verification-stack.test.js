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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tc3RhY2sudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOzs7Ozs7R0FNRztBQUNILGlEQUFtQztBQUNuQyx1REFBc0U7QUFDdEUsMkRBQThFO0FBQzlFLHFDQUE2QztBQUM3QyxrRUFBOEQ7QUFhOUQsU0FBUyxlQUFlLENBQ3RCLFFBQWtCLEVBQ2xCLGFBQXFCO0lBRXJCLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUN6RCxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FDNUMsR0FBNkIsQ0FBQyxVQUFVLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUNoRixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMscUJBQXFCLENBQzVCLFFBQWtCLEVBQ2xCLFNBQXlDO0lBRXpDLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsQ0FBQztJQUNoRSxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDN0UsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUN0QixRQUFpQyxFQUNqQyxNQUFjO0lBRWQsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO1FBQzFDLE1BQU0sR0FBRyxHQUFJLEdBQXlCLENBQUMsVUFBVSxFQUFFLGNBQWMsQ0FBQztRQUNsRSxNQUFNLEtBQUssR0FBRyxDQUFDLEdBQUcsRUFBRSxTQUFTLElBQUksRUFBRSxDQUFtQixDQUFDO1FBQ3ZELE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ3RCLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbkIsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssTUFBTSxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsUUFBUSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtJQUNqQyxJQUFJLFFBQWtCLENBQUM7SUFFdkIsU0FBUyxDQUFDLEdBQUcsRUFBRTtRQUNiLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO1FBQ2hELE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEdBQUcscUJBQXFCLENBQUM7UUFFekQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxzQ0FBaUIsQ0FBQyxHQUFHLEVBQUUsdUJBQXVCLEVBQUU7WUFDaEUsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUU7WUFDMUQsa0JBQWtCLEVBQUU7Z0JBQ2xCLGNBQWMsRUFDWixrRkFBa0Y7YUFDckY7U0FDRixDQUFDLENBQUM7UUFDSCxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkMsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ1osT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQztRQUNuQyxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO1FBQ3BDLEVBQUUsQ0FBQyxtREFBbUQsRUFBRSxHQUFHLEVBQUU7WUFDM0QsTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQzFFLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtZQUN0RCxNQUFNLENBQ0oscUJBQXFCLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FDN0UsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNwQixDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyw0RUFBNEUsRUFBRSxHQUFHLEVBQUU7WUFDcEYsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUM7WUFDaEQsTUFBTSxDQUFDLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQzFELE1BQU0sQ0FBQyxPQUFPLENBQUMseUJBQXlCLENBQUMsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUM1RCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtRQUMxRCxFQUFFLENBQUMscURBQXFELEVBQUUsR0FBRyxFQUFFO1lBQzdELE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUM5RSxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7WUFDeEQsTUFBTSxZQUFZLEdBQUcscUJBQXFCLENBQ3hDLFFBQVEsRUFDUixDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FDekUsQ0FBQztZQUNGLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNyQyxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxtRkFBbUYsRUFBRSxHQUFHLEVBQUU7WUFDM0YsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGtCQUFrQixFQUFFO2dCQUNqRCxjQUFjLEVBQUU7b0JBQ2QsU0FBUyxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO3dCQUN6QixrQkFBSyxDQUFDLFVBQVUsQ0FBQzs0QkFDZixNQUFNLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDOzRCQUM1QyxNQUFNLEVBQUUsT0FBTzt5QkFDaEIsQ0FBQztxQkFDSCxDQUFDO2lCQUNIO2FBQ0YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsMEVBQTBFLEVBQUUsR0FBRyxFQUFFO1lBQ2xGLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQ0osZUFBZSxDQUFDLFFBQVEsRUFBRSxzQ0FBc0MsQ0FBQyxDQUNsRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHVHQUF1RyxFQUFFLEdBQUcsRUFBRTtZQUMvRyxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELFNBQVMsRUFBRSxrQkFBSyxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixDQUFDO2dCQUM3RCxhQUFhLEVBQUUsa0JBQUssQ0FBQyxVQUFVLENBQUM7b0JBQzlCLG1CQUFtQixFQUFFLGtCQUFLLENBQUMsUUFBUSxFQUFFO29CQUNyQyxlQUFlLEVBQUUsQ0FBQztpQkFDbkIsQ0FBQzthQUNILENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO1FBQ3hDLEVBQUUsQ0FBQyxpREFBaUQsRUFBRSxHQUFHLEVBQUU7WUFDekQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHVCQUF1QixFQUFFO2dCQUN0RCxPQUFPLEVBQUUsWUFBWTtnQkFDckIsT0FBTyxFQUFFLEdBQUc7YUFDYixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxtRUFBbUUsRUFBRSxHQUFHLEVBQUU7WUFDM0UsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGtCQUFrQixFQUFFO2dCQUNqRCxjQUFjLEVBQUU7b0JBQ2QsU0FBUyxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO3dCQUN6QixrQkFBSyxDQUFDLFVBQVUsQ0FBQzs0QkFDZixNQUFNLEVBQUUsc0NBQXNDOzRCQUM5QyxNQUFNLEVBQUUsT0FBTzt5QkFDaEIsQ0FBQztxQkFDSCxDQUFDO2lCQUNIO2FBQ0YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7UUFDL0IsRUFBRSxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtZQUN6QyxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLHNCQUFzQixDQUFDLENBQUM7WUFDOUQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdDLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLG1EQUFtRCxFQUFFLEdBQUcsRUFBRTtZQUMzRCxRQUFRLENBQUMscUJBQXFCLENBQUMsc0JBQXNCLEVBQUU7Z0JBQ3JELFdBQVcsRUFBRSxpQkFBaUI7YUFDL0IsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxFQUFFO1lBQy9DLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxzQkFBc0IsRUFBRTtnQkFDckQsZ0JBQWdCLEVBQUU7b0JBQ2hCLFVBQVUsRUFBRSxJQUFJO2lCQUNqQjthQUNGLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtZQUNuRCxRQUFRLENBQUMscUJBQXFCLENBQUMsc0JBQXNCLEVBQUU7Z0JBQ3JELFNBQVMsRUFBRSxvQ0FBb0M7Z0JBQy9DLHVCQUF1QixFQUFFO29CQUN2QixhQUFhLEVBQUUsS0FBSztvQkFDcEIsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7YUFDRixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtRQUMvQixFQUFFLENBQUMsb0NBQW9DLEVBQUUsR0FBRyxFQUFFO1lBQzVDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyw2QkFBNkIsRUFBRTtnQkFDNUQsV0FBVyxFQUFFLG1EQUFtRDthQUNqRSxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7WUFDOUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLDZCQUE2QixFQUFFO2dCQUM1RCxXQUFXLEVBQUUsdUJBQXVCO2FBQ3JDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO1FBQ2pDLEVBQUUsQ0FBQyxxREFBcUQsRUFBRSxHQUFHLEVBQUU7WUFDN0QsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixFQUFFO2dCQUN2RCxnQkFBZ0IsRUFBRSxrQkFBSyxDQUFDLGdCQUFnQixDQUN0QyxrQ0FBa0MsQ0FDbkM7Z0JBQ0QsU0FBUyxFQUFFLG1CQUFtQjtnQkFDOUIsVUFBVSxFQUFFLDhCQUE4QjthQUMzQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyw2Q0FBNkMsRUFBRSxHQUFHLEVBQUU7WUFDckQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixFQUFFO2dCQUN2RCxnQkFBZ0IsRUFBRSxrQkFBSyxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixDQUFDO2dCQUNwRSxTQUFTLEVBQUUsbUJBQW1CO2dCQUM5QixVQUFVLEVBQUUsc0JBQXNCO2FBQ25DLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHlDQUF5QyxFQUFFLEdBQUcsRUFBRTtZQUNqRCxRQUFRLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLEVBQUU7Z0JBQ3ZELGdCQUFnQixFQUFFLGtCQUFLLENBQUMsZ0JBQWdCLENBQUMscUJBQXFCLENBQUM7Z0JBQy9ELFNBQVMsRUFBRSxtQkFBbUI7Z0JBQzlCLFVBQVUsRUFBRSxtQkFBbUI7YUFDaEMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDdkMsRUFBRSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtZQUNuRCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDMUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN4QyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RELENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLGlFQUFpRSxFQUFFLEdBQUcsRUFBRTtZQUN6RSxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELDhCQUE4QixFQUFFO29CQUM5QixlQUFlLEVBQUUsSUFBSTtvQkFDckIsaUJBQWlCLEVBQUUsSUFBSTtvQkFDdkIsZ0JBQWdCLEVBQUUsSUFBSTtvQkFDdEIscUJBQXFCLEVBQUUsSUFBSTtpQkFDNUI7YUFDRixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxzRUFBc0UsRUFBRSxHQUFHLEVBQUU7WUFDOUUsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCxzQkFBc0IsRUFBRTtvQkFDdEIsS0FBSyxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO3dCQUNyQixrQkFBSyxDQUFDLFVBQVUsQ0FBQzs0QkFDZixNQUFNLEVBQUUsY0FBYzs0QkFDdEIsZ0JBQWdCLEVBQUUsQ0FBQzs0QkFDbkIsTUFBTSxFQUFFLFNBQVM7eUJBQ2xCLENBQUM7cUJBQ0gsQ0FBQztpQkFDSDthQUNGLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDhEQUE4RCxFQUFFLEdBQUcsRUFBRTtZQUN0RSxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELGdCQUFnQixFQUFFO29CQUNoQixpQ0FBaUMsRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQzt3QkFDakQsa0JBQUssQ0FBQyxVQUFVLENBQUM7NEJBQ2YsNkJBQTZCLEVBQUU7Z0NBQzdCLFlBQVksRUFBRSxRQUFROzZCQUN2Qjt5QkFDRixDQUFDO3FCQUNILENBQUM7aUJBQ0g7YUFDRixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQywyRUFBMkUsRUFBRSxHQUFHLEVBQUU7WUFDbkYsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzlELE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzdELE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkUsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDcEMsRUFBRSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtZQUM1RCxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLGdDQUFnQyxDQUFDLENBQUM7WUFDMUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0QsS0FBSyxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQy9DLE1BQU0sSUFBSSxHQUFJLEdBQTBELENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQztnQkFDMUYsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUMzQixLQUFLLE1BQU0sR0FBRyxJQUFJLCtDQUFpQyxFQUFFLENBQUM7b0JBQ3BELE1BQU0sQ0FBQyxJQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDakMsTUFBTSxDQUFDLE9BQU8sSUFBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUMzQyxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFHSCxRQUFRLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO1FBQzVDLEVBQUUsQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUU7WUFDdkQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLDBCQUEwQixFQUFFO2dCQUN6RCxJQUFJLEVBQUUsa0JBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUM7Z0JBQzdDLHFCQUFxQixFQUFFO29CQUNyQixLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUM7aUJBQ3BCO2FBQ0YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1lBQ3ZELFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyx3QkFBd0IsRUFBRTtnQkFDdkQsY0FBYyxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUM5QixrQkFBSyxDQUFDLFVBQVUsQ0FBQzt3QkFDZixVQUFVLEVBQUUsR0FBRzt3QkFDZixZQUFZLEVBQUUsSUFBSTt3QkFDbEIsb0JBQW9CLEVBQUUsRUFBRTt3QkFDeEIsbUJBQW1CLEVBQUUsRUFBRTtxQkFDeEIsQ0FBQztpQkFDSCxDQUFDO2FBQ0gsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsbUVBQW1FLEVBQUUsR0FBRyxFQUFFO1lBQzNFLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxvQkFBb0IsRUFBRTtnQkFDbkQsS0FBSyxFQUFFLFVBQVU7Z0JBQ2pCLEtBQUssRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDckIsa0JBQUssQ0FBQyxVQUFVLENBQUM7d0JBQ2YsSUFBSSxFQUFFLGtDQUFrQztxQkFDekMsQ0FBQztvQkFDRixrQkFBSyxDQUFDLFVBQVUsQ0FBQzt3QkFDZixJQUFJLEVBQUUsdUJBQXVCO3FCQUM5QixDQUFDO2lCQUNILENBQUM7YUFDSCxDQUFDLENBQUM7WUFFSCw4RkFBOEY7WUFDOUYsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1lBQzdFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDN0IsRUFBRSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtZQUN0RCxRQUFRLENBQUMsU0FBUyxDQUFDLGdDQUFnQyxFQUFFO2dCQUNuRCxXQUFXLEVBQUUsa0JBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQzthQUN2RCxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7WUFDakQsUUFBUSxDQUFDLFNBQVMsQ0FBQywyQkFBMkIsRUFBRTtnQkFDOUMsV0FBVyxFQUFFLGtCQUFLLENBQUMsZ0JBQWdCLENBQUMsOEJBQThCLENBQUM7YUFDcEUsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsb0NBQW9DLEVBQUUsR0FBRyxFQUFFO1lBQzVDLFFBQVEsQ0FBQyxTQUFTLENBQUMsc0JBQXNCLEVBQUU7Z0JBQ3pDLFdBQVcsRUFBRSxrQkFBSyxDQUFDLGdCQUFnQixDQUFDLDhCQUE4QixDQUFDO2FBQ3BFLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO1FBQ2hELEVBQUUsQ0FBQyxnRkFBZ0YsRUFBRSxHQUFHLEVBQUU7WUFDeEYseUVBQXlFO1lBQ3pFLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsQ0FBQztZQUNoRSxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUN6RCxFQUFFLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FDM0QsQ0FBQztZQUNGLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNuQyxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNqQixNQUFNLE9BQU8sR0FDVixZQUFZLENBQUMsQ0FBQyxDQUFnRjtvQkFDN0YsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLFNBQVMsSUFBSSxFQUFFLENBQUM7Z0JBQy9DLE1BQU0sQ0FBQyxPQUFPLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQzVELENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyx3RUFBd0UsRUFBRSxHQUFHLEVBQUU7WUFDaEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEdBQUcsaUJBQWlCLENBQUM7WUFDaEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsR0FBRyxxQkFBcUIsQ0FBQztZQUN6RCxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUMzQixNQUFNLE1BQU0sR0FBRyxJQUFJLHNDQUFpQixDQUFDLElBQUksRUFBRSxnQ0FBZ0MsRUFBRTtnQkFDM0UsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUU7Z0JBQzFELG1CQUFtQixFQUFFLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQzthQUNwRCxDQUFDLENBQUM7WUFDSCxNQUFNLEVBQUUsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN0QyxFQUFFLENBQUMscUJBQXFCLENBQUMsdUJBQXVCLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRTtvQkFDWCxTQUFTLEVBQUUsa0JBQUssQ0FBQyxVQUFVLENBQUM7d0JBQzFCLHNCQUFzQixFQUFFLHlCQUF5QjtxQkFDbEQsQ0FBQztpQkFDSDthQUNGLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO1FBQzdDLEVBQUUsQ0FBQywyRUFBMkUsRUFBRSxHQUFHLEVBQUU7WUFDbkYsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQ3pELEVBQUUsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUMzRCxDQUFDO1lBQ0YsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ25DLElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sT0FBTyxHQUNWLFlBQVksQ0FBQyxDQUFDLENBQWdGO29CQUM3RixFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsU0FBUyxJQUFJLEVBQUUsQ0FBQztnQkFDL0MsTUFBTSxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDekQsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLG1FQUFtRSxFQUFFLEdBQUcsRUFBRTtZQUMzRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztZQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLHFCQUFxQixDQUFDO1lBQ3pELE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzNCLE1BQU0sTUFBTSxHQUFHLElBQUksc0NBQWlCLENBQUMsSUFBSSxFQUFFLHNDQUFzQyxFQUFFO2dCQUNqRixHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRTtnQkFDMUQsaUJBQWlCLEVBQUUsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDO2FBQ2xELENBQUMsQ0FBQztZQUNILE1BQU0sRUFBRSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RDLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsRUFBRTtnQkFDaEQsV0FBVyxFQUFFO29CQUNYLFNBQVMsRUFBRSxrQkFBSyxDQUFDLFVBQVUsQ0FBQzt3QkFDMUIsbUJBQW1CLEVBQUUseUJBQXlCO3FCQUMvQyxDQUFDO2lCQUNIO2FBQ0YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUNyQyxFQUFFLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO1FBQzFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO1FBQ2hELE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEdBQUcscUJBQXFCLENBQUM7UUFDekQsTUFBTSxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDN0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxzQ0FBaUIsQ0FBQyxNQUFNLEVBQUUsY0FBYyxFQUFFO1lBQzdELEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFFO1lBQzFELGtCQUFrQixFQUFFO2dCQUNsQixjQUFjLEVBQ1osa0ZBQWtGO2FBQ3JGO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksNEJBQWtCLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sTUFBTSxHQUFHLHdCQUFXLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFNBQVMsQ0FDdEQsR0FBRyxFQUNILGtCQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQzdCLENBQUM7UUFDRixPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQ25DLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQztRQUN4QyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pDLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFZlcmlmaWNhdGlvblN0YWNrIENESyB1bml0IHRlc3RzLlxuICpcbiAqIFN5bnRoZXNpcyBydW5zIExhbWJkYSBhc3NldCBidW5kbGluZyAobG9jYWwgcGlwIGZpcnN0LCB0aGVuIERvY2tlcikuIEZvciBDSS9zYW5kYm94OlxuICogLSBQcmVmZXIgbG9jYWwgcGlwIHNvIERvY2tlci9Db2xpbWEgaXMgbm90IHJlcXVpcmVkLlxuICogLSBJZiB1c2luZyBEb2NrZXIsIGVuc3VyZSBDb2xpbWEgKG9yIERvY2tlcikgaXMgcnVubmluZyBhbmQgRE9DS0VSX0hPU1QgaXMgc2V0LlxuICovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2gsIEFubm90YXRpb25zIH0gZnJvbSBcImF3cy1jZGstbGliL2Fzc2VydGlvbnNcIjtcbmltcG9ydCB7IFJFUVVJUkVEX0NPU1RfQUxMT0NBVElPTl9UQUdfS0VZUyB9IGZyb20gXCJAc2xhY2stYWktYXBwL2Nkay10b29saW5nXCI7XG5pbXBvcnQgeyBBd3NTb2x1dGlvbnNDaGVja3MgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uU3RhY2sgfSBmcm9tIFwiLi4vbGliL3ZlcmlmaWNhdGlvbi1zdGFja1wiO1xuXG4vKiogUmVzb3VyY2Ugd2l0aCBvcHRpb25hbCBQcm9wZXJ0aWVzLlF1ZXVlTmFtZSAoU1FTLCBldGMuKSAqL1xudHlwZSBSZXNvdXJjZVdpdGhRdWV1ZU5hbWUgPSB7IFByb3BlcnRpZXM/OiB7IFF1ZXVlTmFtZT86IHN0cmluZyB9IH07XG5cbi8qKiBJQU0gcG9saWN5IHJlc291cmNlIHdpdGggU3RhdGVtZW50IGFycmF5ICovXG50eXBlIElBTVBvbGljeVJlc291cmNlID0ge1xuICBQcm9wZXJ0aWVzPzogeyBQb2xpY3lEb2N1bWVudD86IHsgU3RhdGVtZW50PzogdW5rbm93bltdIH0gfTtcbn07XG5cbi8qKiBJQU0gc3RhdGVtZW50IHdpdGggQWN0aW9uIChzdHJpbmcgb3Igc3RyaW5nW10pICovXG50eXBlIElBTVN0YXRlbWVudCA9IHsgQWN0aW9uPzogc3RyaW5nIHwgc3RyaW5nW107IEVmZmVjdD86IHN0cmluZyB9O1xuXG5mdW5jdGlvbiBmaW5kUXVldWVCeU5hbWUoXG4gIHRlbXBsYXRlOiBUZW1wbGF0ZSxcbiAgbmFtZVN1YnN0cmluZzogc3RyaW5nXG4pOiBbc3RyaW5nLCB1bmtub3duXSB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHF1ZXVlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OlNRUzo6UXVldWVcIik7XG4gIHJldHVybiBPYmplY3QuZW50cmllcyhxdWV1ZXMpLmZpbmQoKFssIHJlc10pID0+XG4gICAgKHJlcyBhcyBSZXNvdXJjZVdpdGhRdWV1ZU5hbWUpLlByb3BlcnRpZXM/LlF1ZXVlTmFtZT8uaW5jbHVkZXM/LihuYW1lU3Vic3RyaW5nKVxuICApO1xufVxuXG5mdW5jdGlvbiBmaW5kTGFtYmRhQnlMb2dpY2FsSWQoXG4gIHRlbXBsYXRlOiBUZW1wbGF0ZSxcbiAgcHJlZGljYXRlOiAobG9naWNhbElkOiBzdHJpbmcpID0+IGJvb2xlYW5cbik6IFtzdHJpbmcsIHVua25vd25dIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgbGFtYmRhcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIik7XG4gIHJldHVybiBPYmplY3QuZW50cmllcyhsYW1iZGFzKS5maW5kKChbbG9naWNhbElkXSkgPT4gcHJlZGljYXRlKGxvZ2ljYWxJZCkpO1xufVxuXG5mdW5jdGlvbiBwb2xpY3lIYXNBY3Rpb24oXG4gIHBvbGljaWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbiAgYWN0aW9uOiBzdHJpbmdcbik6IGJvb2xlYW4ge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwb2xpY2llcykuc29tZSgocmVzKSA9PiB7XG4gICAgY29uc3QgZG9jID0gKHJlcyBhcyBJQU1Qb2xpY3lSZXNvdXJjZSkuUHJvcGVydGllcz8uUG9saWN5RG9jdW1lbnQ7XG4gICAgY29uc3Qgc3RtdHMgPSAoZG9jPy5TdGF0ZW1lbnQgPz8gW10pIGFzIElBTVN0YXRlbWVudFtdO1xuICAgIHJldHVybiBzdG10cy5zb21lKChzKSA9PiB7XG4gICAgICBjb25zdCBhID0gcy5BY3Rpb247XG4gICAgICByZXR1cm4gQXJyYXkuaXNBcnJheShhKSA/IGEuaW5jbHVkZXMoYWN0aW9uKSA6IGEgPT09IGFjdGlvbjtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmRlc2NyaWJlKFwiVmVyaWZpY2F0aW9uU3RhY2tcIiwgKCkgPT4ge1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOID0gXCJ4b3hiLXRlc3QtdG9rZW5cIjtcbiAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCA9IFwidGVzdC1zaWduaW5nLXNlY3JldFwiO1xuXG4gICAgY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBjb25zdCBzdGFjayA9IG5ldyBWZXJpZmljYXRpb25TdGFjayhhcHAsIFwiVGVzdFZlcmlmaWNhdGlvblN0YWNrXCIsIHtcbiAgICAgIGVudjogeyBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLCByZWdpb246IFwiYXAtbm9ydGhlYXN0LTFcIiB9LFxuICAgICAgZXhlY3V0aW9uQWdlbnRBcm5zOiB7XG4gICAgICAgIFwiZmlsZS1jcmVhdG9yXCI6XG4gICAgICAgICAgXCJhcm46YXdzOmJlZHJvY2stYWdlbnRjb3JlOmFwLW5vcnRoZWFzdC0xOjEyMzQ1Njc4OTAxMjpydW50aW1lL1Rlc3RFeGVjdXRpb25BZ2VudFwiLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIGFmdGVyQWxsKCgpID0+IHtcbiAgICBkZWxldGUgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOO1xuICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVDtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJBMkEgb25seSAobm8gbGVnYWN5KVwiLCAoKSA9PiB7XG4gICAgaXQoXCJtdXN0IE5PVCBjb250YWluIEV4ZWN1dGlvblJlc3BvbnNlUXVldWUgU1FTIHF1ZXVlXCIsICgpID0+IHtcbiAgICAgIGV4cGVjdChmaW5kUXVldWVCeU5hbWUodGVtcGxhdGUsIFwiZXhlY3V0aW9uLXJlc3BvbnNlXCIpKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdChcIm11c3QgTk9UIGNvbnRhaW4gU2xhY2tSZXNwb25zZUhhbmRsZXIgTGFtYmRhXCIsICgpID0+IHtcbiAgICAgIGV4cGVjdChcbiAgICAgICAgZmluZExhbWJkYUJ5TG9naWNhbElkKHRlbXBsYXRlLCAoaWQpID0+IGlkLmluY2x1ZGVzKFwiU2xhY2tSZXNwb25zZUhhbmRsZXJcIikpXG4gICAgICApLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KFwibXVzdCBOT1QgaGF2ZSBvdXRwdXRzIEV4ZWN1dGlvblJlc3BvbnNlUXVldWVVcmwsIEV4ZWN1dGlvblJlc3BvbnNlUXVldWVBcm5cIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLnRvSlNPTigpLk91dHB1dHMgPz8ge307XG4gICAgICBleHBlY3Qob3V0cHV0cy5FeGVjdXRpb25SZXNwb25zZVF1ZXVlVXJsKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgICBleHBlY3Qob3V0cHV0cy5FeGVjdXRpb25SZXNwb25zZVF1ZXVlQXJuKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiMDE2IGFzeW5jIGludm9jYXRpb24gKFNRUyArIEFnZW50IEludm9rZXIpXCIsICgpID0+IHtcbiAgICBpdChcIm11c3QgY29udGFpbiBTUVMgcXVldWUgZm9yIGFnZW50LWludm9jYXRpb24tcmVxdWVzdFwiLCAoKSA9PiB7XG4gICAgICBleHBlY3QoZmluZFF1ZXVlQnlOYW1lKHRlbXBsYXRlLCBcImFnZW50LWludm9jYXRpb24tcmVxdWVzdFwiKSkudG9CZURlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KFwibXVzdCBjb250YWluIExhbWJkYSBmdW5jdGlvbiBmb3IgQWdlbnQgSW52b2tlclwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBhZ2VudEludm9rZXIgPSBmaW5kTGFtYmRhQnlMb2dpY2FsSWQoXG4gICAgICAgIHRlbXBsYXRlLFxuICAgICAgICAoaWQpID0+IGlkLmluY2x1ZGVzKFwiQWdlbnRJbnZva2VyXCIpICYmICFpZC5pbmNsdWRlcyhcIlNsYWNrRXZlbnRIYW5kbGVyXCIpXG4gICAgICApO1xuICAgICAgZXhwZWN0KGFnZW50SW52b2tlcikudG9CZURlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KFwiU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIHJvbGUgbXVzdCBoYXZlIHNxczpTZW5kTWVzc2FnZSBvbiBhZ2VudC1pbnZvY2F0aW9uIHF1ZXVlXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6SUFNOjpQb2xpY3lcIiwge1xuICAgICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbXCJzcXM6U2VuZE1lc3NhZ2VcIl0pLFxuICAgICAgICAgICAgICBFZmZlY3Q6IFwiQWxsb3dcIixcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcIkFnZW50IEludm9rZXIgTGFtYmRhIHJvbGUgbXVzdCBoYXZlIGJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBwb2xpY2llcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OklBTTo6UG9saWN5XCIpO1xuICAgICAgZXhwZWN0KFxuICAgICAgICBwb2xpY3lIYXNBY3Rpb24ocG9saWNpZXMsIFwiYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCIpXG4gICAgICApLnRvQmUodHJ1ZSk7XG4gICAgfSk7XG5cbiAgICBpdChcImFnZW50LWludm9jYXRpb24tcmVxdWVzdCBxdWV1ZSBtdXN0IGhhdmUgcmVkcml2ZVBvbGljeSB3aXRoIGRlYWRMZXR0ZXJUYXJnZXRBcm4gYW5kIG1heFJlY2VpdmVDb3VudCAzXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6U1FTOjpRdWV1ZVwiLCB7XG4gICAgICAgIFF1ZXVlTmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcImFnZW50LWludm9jYXRpb24tcmVxdWVzdFwiKSxcbiAgICAgICAgUmVkcml2ZVBvbGljeTogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgZGVhZExldHRlclRhcmdldEFybjogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBjcmVhdGUgU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIGZ1bmN0aW9uXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIFJ1bnRpbWU6IFwicHl0aG9uMy4xMVwiLFxuICAgICAgICBUaW1lb3V0OiAxMjAsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGhhdmUgYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lIHBlcm1pc3Npb24gKEEyQSlcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpJQU06OlBvbGljeVwiLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEFjdGlvbjogXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIixcbiAgICAgICAgICAgICAgRWZmZWN0OiBcIkFsbG93XCIsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIkR5bmFtb0RCIFRhYmxlc1wiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIDYgRHluYW1vREIgdGFibGVzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHRhYmxlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyh0YWJsZXMpLmxlbmd0aCkudG9CZSg2KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSB0YWJsZXMgd2l0aCBQQVlfUEVSX1JFUVVFU1QgYmlsbGluZ1wiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiLCB7XG4gICAgICAgIEJpbGxpbmdNb2RlOiBcIlBBWV9QRVJfUkVRVUVTVFwiLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgdGFibGVzIHdpdGggU1NFIGVuYWJsZWRcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIiwge1xuICAgICAgICBTU0VTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgICAgU1NFRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIGV2ZW50IGRlZHVwZSB0YWJsZSB3aXRoIFRUTFwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiLCB7XG4gICAgICAgIFRhYmxlTmFtZTogXCJUZXN0VmVyaWZpY2F0aW9uU3RhY2stZXZlbnQtZGVkdXBlXCIsXG4gICAgICAgIFRpbWVUb0xpdmVTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgICAgQXR0cmlidXRlTmFtZTogXCJ0dGxcIixcbiAgICAgICAgICBFbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiU2VjcmV0cyBNYW5hZ2VyXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBjcmVhdGUgU2xhY2sgc2lnbmluZyBzZWNyZXRcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTZWNyZXRzTWFuYWdlcjo6U2VjcmV0XCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IFwiU2xhY2sgYXBwIHNpZ25pbmcgc2VjcmV0IGZvciByZXF1ZXN0IHZlcmlmaWNhdGlvblwiLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgU2xhY2sgYm90IHRva2VuIHNlY3JldFwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXRcIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogXCJTbGFjayBib3QgT0F1dGggdG9rZW5cIixcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIkNsb3VkV2F0Y2ggQWxhcm1zXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBjcmVhdGUgd2hpdGVsaXN0IGF1dGhvcml6YXRpb24gZmFpbHVyZSBhbGFybVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtXCIsIHtcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcbiAgICAgICAgICBcIndoaXRlbGlzdCBhdXRob3JpemF0aW9uIGZhaWx1cmVzXCJcbiAgICAgICAgKSxcbiAgICAgICAgTmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIE1ldHJpY05hbWU6IFwiV2hpdGVsaXN0QXV0aG9yaXphdGlvbkZhaWxlZFwiLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgZXhpc3RlbmNlIGNoZWNrIGZhaWx1cmUgYWxhcm1cIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpDbG91ZFdhdGNoOjpBbGFybVwiLCB7XG4gICAgICAgIEFsYXJtRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJFeGlzdGVuY2UgQ2hlY2sgZmFpbHVyZXNcIiksXG4gICAgICAgIE5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBNZXRyaWNOYW1lOiBcIkV4aXN0ZW5jZUNoZWNrRmFpbGVkXCIsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSByYXRlIGxpbWl0IGV4Y2VlZGVkIGFsYXJtXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Q2xvdWRXYXRjaDo6QWxhcm1cIiwge1xuICAgICAgICBBbGFybURlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwicmF0ZSBsaW1pdCBleGNlZWRlZFwiKSxcbiAgICAgICAgTmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIE1ldHJpY05hbWU6IFwiUmF0ZUxpbWl0RXhjZWVkZWRcIixcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIlMzIEZpbGUgRXhjaGFuZ2UgQnVja2V0XCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBjcmVhdGUgUzMgYnVja2V0IGZvciBmaWxlIGV4Y2hhbmdlXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGJ1Y2tldHMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpTMzo6QnVja2V0XCIpO1xuICAgICAgY29uc3QgYnVja2V0S2V5cyA9IE9iamVjdC5rZXlzKGJ1Y2tldHMpO1xuICAgICAgZXhwZWN0KGJ1Y2tldEtleXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDEpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgaGF2ZSBibG9jayBwdWJsaWMgYWNjZXNzIGVuYWJsZWQgb24gZmlsZSBleGNoYW5nZSBidWNrZXRcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBoYXZlIGxpZmVjeWNsZSBydWxlIGZvciBhdHRhY2htZW50cy8gcHJlZml4IHdpdGggMS1kYXkgZXhwaXJ5XCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBQcmVmaXg6IFwiYXR0YWNobWVudHMvXCIsXG4gICAgICAgICAgICAgIEV4cGlyYXRpb25JbkRheXM6IDEsXG4gICAgICAgICAgICAgIFN0YXR1czogXCJFbmFibGVkXCIsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgaGF2ZSBTU0UtUzMgZW5jcnlwdGlvbiAoQnVja2V0RW5jcnlwdGlvbiB3aXRoIEFFUzI1NilcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgQnVja2V0RW5jcnlwdGlvbjoge1xuICAgICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkJ5RGVmYXVsdDoge1xuICAgICAgICAgICAgICAgIFNTRUFsZ29yaXRobTogXCJBRVMyNTZcIixcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInZlcmlmaWNhdGlvbiBhZ2VudCByb2xlIG11c3QgaGF2ZSBTMyBwZXJtaXNzaW9ucyBmb3IgZmlsZSBleGNoYW5nZSBidWNrZXRcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgcG9saWNpZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpJQU06OlBvbGljeVwiKTtcbiAgICAgIGV4cGVjdChwb2xpY3lIYXNBY3Rpb24ocG9saWNpZXMsIFwiczM6R2V0T2JqZWN0KlwiKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChwb2xpY3lIYXNBY3Rpb24ocG9saWNpZXMsIFwiczM6UHV0T2JqZWN0XCIpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KHBvbGljeUhhc0FjdGlvbihwb2xpY2llcywgXCJzMzpEZWxldGVPYmplY3QqXCIpKS50b0JlKHRydWUpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIkNvc3QgYWxsb2NhdGlvbiB0YWdzXCIsICgpID0+IHtcbiAgICBpdChcIkFnZW50Q29yZSBSdW50aW1lIHNob3VsZCBoYXZlIGNvc3QgYWxsb2NhdGlvbiB0YWdzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJ1bnRpbWVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6QmVkcm9ja0FnZW50Q29yZTo6UnVudGltZVwiKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhydW50aW1lcykubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDEpO1xuICAgICAgZm9yIChjb25zdCBbLCBkZWZdIG9mIE9iamVjdC5lbnRyaWVzKHJ1bnRpbWVzKSkge1xuICAgICAgICBjb25zdCB0YWdzID0gKGRlZiBhcyB7IFByb3BlcnRpZXM/OiB7IFRhZ3M/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0gfSkuUHJvcGVydGllcz8uVGFncztcbiAgICAgICAgZXhwZWN0KHRhZ3MpLnRvQmVEZWZpbmVkKCk7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIFJFUVVJUkVEX0NPU1RfQUxMT0NBVElPTl9UQUdfS0VZUykge1xuICAgICAgICAgIGV4cGVjdCh0YWdzIVtrZXldKS50b0JlRGVmaW5lZCgpO1xuICAgICAgICAgIGV4cGVjdCh0eXBlb2YgdGFncyFba2V5XSkudG9CZShcInN0cmluZ1wiKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuXG4gIGRlc2NyaWJlKFwiQVBJIEdhdGV3YXkgaW5ncmVzcyB3aXRoIFdBRlwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIGEgUmVnaW9uYWwgQVBJIEdhdGV3YXkgUkVTVCBBUElcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpBcGlHYXRld2F5OjpSZXN0QXBpXCIsIHtcbiAgICAgICAgTmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcInNsYWNrLWluZ3Jlc3NcIiksXG4gICAgICAgIEVuZHBvaW50Q29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIFR5cGVzOiBbXCJSRUdJT05BTFwiXSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY29uZmlndXJlIEFQSSBHYXRld2F5IHN0YWdlIHRocm90dGxpbmdcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpBcGlHYXRld2F5OjpTdGFnZVwiLCB7XG4gICAgICAgIE1ldGhvZFNldHRpbmdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgSHR0cE1ldGhvZDogXCIqXCIsXG4gICAgICAgICAgICBSZXNvdXJjZVBhdGg6IFwiLypcIixcbiAgICAgICAgICAgIFRocm90dGxpbmdCdXJzdExpbWl0OiA1MCxcbiAgICAgICAgICAgIFRocm90dGxpbmdSYXRlTGltaXQ6IDI1LFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFdBRiBXZWIgQUNMIGFuZCBhc3NvY2lhdGUgaXQgd2l0aCBBUEkgR2F0ZXdheSBzdGFnZVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OldBRnYyOjpXZWJBQ0xcIiwge1xuICAgICAgICBTY29wZTogXCJSRUdJT05BTFwiLFxuICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6IFwiQVdTLUFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXRcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6IFwiU2xhY2tJbmdyZXNzUmF0ZUxpbWl0XCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFJlc291cmNlQXJuIGlzIGEgQ0ZuIEZuOjpKb2luIGludHJpbnNpYyAobm90IGEgcGxhaW4gc3RyaW5nKTsgdmVyaWZ5IHRoZSBhc3NvY2lhdGlvbiBleGlzdHNcbiAgICAgIGNvbnN0IGFzc29jaWF0aW9ucyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OldBRnYyOjpXZWJBQ0xBc3NvY2lhdGlvblwiKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhhc3NvY2lhdGlvbnMpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIlN0YWNrIE91dHB1dHNcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIG91dHB1dCBTbGFja0V2ZW50SGFuZGxlckFwaUdhdGV3YXlVcmxcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwiU2xhY2tFdmVudEhhbmRsZXJBcGlHYXRld2F5VXJsXCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJBUEkgR2F0ZXdheSBVUkxcIiksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIG91dHB1dCBWZXJpZmljYXRpb25MYW1iZGFSb2xlQXJuXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlZlcmlmaWNhdGlvbkxhbWJkYVJvbGVBcm5cIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcIlZlcmlmaWNhdGlvbiBMYW1iZGEgUm9sZSBBUk5cIiksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIG91dHB1dCBTbGFja0V2ZW50SGFuZGxlckFyblwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoXCJTbGFja0V2ZW50SGFuZGxlckFyblwiLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIEFSTlwiKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIkF1dG8tcmVwbHkgY2hhbm5lbCBjb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBOT1Qgc2V0IEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFMgd2hlbiBhdXRvUmVwbHlDaGFubmVsSWRzIGlzIG5vdCBwcm92aWRlZFwiLCAoKSA9PiB7XG4gICAgICAvLyBUaGUgZGVmYXVsdCB0ZW1wbGF0ZSAoY3JlYXRlZCBpbiBiZWZvcmVBbGwpIGhhcyBubyBhdXRvUmVwbHlDaGFubmVsSWRzXG4gICAgICBjb25zdCBsYW1iZGFzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiKTtcbiAgICAgIGNvbnN0IGhhbmRsZXJFbnRyeSA9IE9iamVjdC5lbnRyaWVzKGxhbWJkYXMpLmZpbmQoKFtpZF0pID0+XG4gICAgICAgIGlkLmluY2x1ZGVzKFwiU2xhY2tFdmVudEhhbmRsZXJcIikgJiYgaWQuaW5jbHVkZXMoXCJIYW5kbGVyXCIpXG4gICAgICApO1xuICAgICAgZXhwZWN0KGhhbmRsZXJFbnRyeSkudG9CZURlZmluZWQoKTtcbiAgICAgIGlmIChoYW5kbGVyRW50cnkpIHtcbiAgICAgICAgY29uc3QgZW52VmFyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPVxuICAgICAgICAgIChoYW5kbGVyRW50cnlbMV0gYXMgeyBQcm9wZXJ0aWVzPzogeyBFbnZpcm9ubWVudD86IHsgVmFyaWFibGVzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSB9IH0pXG4gICAgICAgICAgICA/LlByb3BlcnRpZXM/LkVudmlyb25tZW50Py5WYXJpYWJsZXMgPz8ge307XG4gICAgICAgIGV4cGVjdChlbnZWYXJzW1wiQVVUT19SRVBMWV9DSEFOTkVMX0lEU1wiXSkudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgc2V0IEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFMgd2hlbiBhdXRvUmVwbHlDaGFubmVsSWRzIGlzIHByb3ZpZGVkXCIsICgpID0+IHtcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiA9IFwieG94Yi10ZXN0LXRva2VuXCI7XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCA9IFwidGVzdC1zaWduaW5nLXNlY3JldFwiO1xuICAgICAgY29uc3QgYXBwMiA9IG5ldyBjZGsuQXBwKCk7XG4gICAgICBjb25zdCBzdGFjazIgPSBuZXcgVmVyaWZpY2F0aW9uU3RhY2soYXBwMiwgXCJUZXN0VmVyaWZpY2F0aW9uU3RhY2tBdXRvUmVwbHlcIiwge1xuICAgICAgICBlbnY6IHsgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIiwgcmVnaW9uOiBcImFwLW5vcnRoZWFzdC0xXCIgfSxcbiAgICAgICAgYXV0b1JlcGx5Q2hhbm5lbElkczogW1wiQzBBRlNHNzlUOERcIiwgXCJDMUJCQkJCQkJCQlwiXSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdDIgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2syKTtcbiAgICAgIHQyLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgVmFyaWFibGVzOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFM6IFwiQzBBRlNHNzlUOEQsQzFCQkJCQkJCQkJcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIk1lbnRpb24gY2hhbm5lbCBjb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBOT1Qgc2V0IE1FTlRJT05fQ0hBTk5FTF9JRFMgd2hlbiBtZW50aW9uQ2hhbm5lbElkcyBpcyBub3QgcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgbGFtYmRhcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIik7XG4gICAgICBjb25zdCBoYW5kbGVyRW50cnkgPSBPYmplY3QuZW50cmllcyhsYW1iZGFzKS5maW5kKChbaWRdKSA9PlxuICAgICAgICBpZC5pbmNsdWRlcyhcIlNsYWNrRXZlbnRIYW5kbGVyXCIpICYmIGlkLmluY2x1ZGVzKFwiSGFuZGxlclwiKVxuICAgICAgKTtcbiAgICAgIGV4cGVjdChoYW5kbGVyRW50cnkpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBpZiAoaGFuZGxlckVudHJ5KSB7XG4gICAgICAgIGNvbnN0IGVudlZhcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID1cbiAgICAgICAgICAoaGFuZGxlckVudHJ5WzFdIGFzIHsgUHJvcGVydGllcz86IHsgRW52aXJvbm1lbnQ/OiB7IFZhcmlhYmxlcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0gfSB9KVxuICAgICAgICAgICAgPy5Qcm9wZXJ0aWVzPy5FbnZpcm9ubWVudD8uVmFyaWFibGVzID8/IHt9O1xuICAgICAgICBleHBlY3QoZW52VmFyc1tcIk1FTlRJT05fQ0hBTk5FTF9JRFNcIl0pLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIHNldCBNRU5USU9OX0NIQU5ORUxfSURTIHdoZW4gbWVudGlvbkNoYW5uZWxJZHMgaXMgcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOID0gXCJ4b3hiLXRlc3QtdG9rZW5cIjtcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX1NJR05JTkdfU0VDUkVUID0gXCJ0ZXN0LXNpZ25pbmctc2VjcmV0XCI7XG4gICAgICBjb25zdCBhcHAyID0gbmV3IGNkay5BcHAoKTtcbiAgICAgIGNvbnN0IHN0YWNrMiA9IG5ldyBWZXJpZmljYXRpb25TdGFjayhhcHAyLCBcIlRlc3RWZXJpZmljYXRpb25TdGFja01lbnRpb25DaGFubmVsc1wiLCB7XG4gICAgICAgIGVudjogeyBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLCByZWdpb246IFwiYXAtbm9ydGhlYXN0LTFcIiB9LFxuICAgICAgICBtZW50aW9uQ2hhbm5lbElkczogW1wiQzBBRlNHNzlUOERcIiwgXCJDMkNDQ0NDQ0NDQ1wiXSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdDIgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2syKTtcbiAgICAgIHQyLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgVmFyaWFibGVzOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE1FTlRJT05fQ0hBTk5FTF9JRFM6IFwiQzBBRlNHNzlUOEQsQzJDQ0NDQ0NDQ0NcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuXG5kZXNjcmliZShcImNkay1uYWcgc2VjdXJpdHkgc2NhblwiLCAoKSA9PiB7XG4gIGl0KFwiaGFzIG5vIHVucmVzb2x2ZWQgY2RrLW5hZyBlcnJvcnNcIiwgKCkgPT4ge1xuICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiA9IFwieG94Yi10ZXN0LXRva2VuXCI7XG4gICAgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQgPSBcInRlc3Qtc2lnbmluZy1zZWNyZXRcIjtcbiAgICBjb25zdCBuYWdBcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIGNvbnN0IG5hZ1N0YWNrID0gbmV3IFZlcmlmaWNhdGlvblN0YWNrKG5hZ0FwcCwgXCJOYWdUZXN0U3RhY2tcIiwge1xuICAgICAgZW52OiB7IGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsIHJlZ2lvbjogXCJhcC1ub3J0aGVhc3QtMVwiIH0sXG4gICAgICBleGVjdXRpb25BZ2VudEFybnM6IHtcbiAgICAgICAgXCJmaWxlLWNyZWF0b3JcIjpcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jay1hZ2VudGNvcmU6YXAtbm9ydGhlYXN0LTE6MTIzNDU2Nzg5MDEyOnJ1bnRpbWUvVGVzdEV4ZWN1dGlvbkFnZW50XCIsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGNkay5Bc3BlY3RzLm9mKG5hZ0FwcCkuYWRkKG5ldyBBd3NTb2x1dGlvbnNDaGVja3MoeyB2ZXJib3NlOiB0cnVlIH0pKTtcbiAgICBjb25zdCBlcnJvcnMgPSBBbm5vdGF0aW9ucy5mcm9tU3RhY2sobmFnU3RhY2spLmZpbmRFcnJvcihcbiAgICAgIFwiKlwiLFxuICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcIi4qXCIpXG4gICAgKTtcbiAgICBkZWxldGUgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOO1xuICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVDtcbiAgICBleHBlY3QoZXJyb3JzKS50b0hhdmVMZW5ndGgoMCk7XG4gIH0pO1xufSk7XG4iXX0=