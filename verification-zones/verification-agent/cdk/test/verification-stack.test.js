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
        it("should output SlackEventHandlerUrl", () => {
            template.hasOutput("SlackEventHandlerUrl", {
                Description: assertions_1.Match.stringLikeRegexp("Slack Event Handler Function URL"),
            });
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tc3RhY2sudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOzs7Ozs7R0FNRztBQUNILGlEQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsMkRBQThFO0FBQzlFLGtFQUE4RDtBQWE5RCxTQUFTLGVBQWUsQ0FDdEIsUUFBa0IsRUFDbEIsYUFBcUI7SUFFckIsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3pELE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUM1QyxHQUE2QixDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDLENBQ2hGLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FDNUIsUUFBa0IsRUFDbEIsU0FBeUM7SUFFekMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ2hFLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUM3RSxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQ3RCLFFBQWlDLEVBQ2pDLE1BQWM7SUFFZCxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUU7UUFDMUMsTUFBTSxHQUFHLEdBQUksR0FBeUIsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDO1FB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LENBQUM7WUFDekQsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLG1FQUFtRSxFQUFFLEdBQUcsRUFBRTtZQUMzRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztZQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLHFCQUFxQixDQUFDO1lBQ3pELE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzNCLE1BQU0sTUFBTSxHQUFHLElBQUksc0NBQWlCLENBQUMsSUFBSSxFQUFFLHNDQUFzQyxFQUFFO2dCQUNqRixHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRTtnQkFDMUQsaUJBQWlCLEVBQUUsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDO2FBQ2xELENBQUMsQ0FBQztZQUNILE1BQU0sRUFBRSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RDLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsRUFBRTtnQkFDaEQsV0FBVyxFQUFFO29CQUNYLFNBQVMsRUFBRSxrQkFBSyxDQUFDLFVBQVUsQ0FBQzt3QkFDMUIsbUJBQW1CLEVBQUUseUJBQXlCO3FCQUMvQyxDQUFDO2lCQUNIO2FBQ0YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBWZXJpZmljYXRpb25TdGFjayBDREsgdW5pdCB0ZXN0cy5cbiAqXG4gKiBTeW50aGVzaXMgcnVucyBMYW1iZGEgYXNzZXQgYnVuZGxpbmcgKGxvY2FsIHBpcCBmaXJzdCwgdGhlbiBEb2NrZXIpLiBGb3IgQ0kvc2FuZGJveDpcbiAqIC0gUHJlZmVyIGxvY2FsIHBpcCBzbyBEb2NrZXIvQ29saW1hIGlzIG5vdCByZXF1aXJlZC5cbiAqIC0gSWYgdXNpbmcgRG9ja2VyLCBlbnN1cmUgQ29saW1hIChvciBEb2NrZXIpIGlzIHJ1bm5pbmcgYW5kIERPQ0tFUl9IT1NUIGlzIHNldC5cbiAqL1xuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgVGVtcGxhdGUsIE1hdGNoIH0gZnJvbSBcImF3cy1jZGstbGliL2Fzc2VydGlvbnNcIjtcbmltcG9ydCB7IFJFUVVJUkVEX0NPU1RfQUxMT0NBVElPTl9UQUdfS0VZUyB9IGZyb20gXCJAc2xhY2stYWktYXBwL2Nkay10b29saW5nXCI7XG5pbXBvcnQgeyBWZXJpZmljYXRpb25TdGFjayB9IGZyb20gXCIuLi9saWIvdmVyaWZpY2F0aW9uLXN0YWNrXCI7XG5cbi8qKiBSZXNvdXJjZSB3aXRoIG9wdGlvbmFsIFByb3BlcnRpZXMuUXVldWVOYW1lIChTUVMsIGV0Yy4pICovXG50eXBlIFJlc291cmNlV2l0aFF1ZXVlTmFtZSA9IHsgUHJvcGVydGllcz86IHsgUXVldWVOYW1lPzogc3RyaW5nIH0gfTtcblxuLyoqIElBTSBwb2xpY3kgcmVzb3VyY2Ugd2l0aCBTdGF0ZW1lbnQgYXJyYXkgKi9cbnR5cGUgSUFNUG9saWN5UmVzb3VyY2UgPSB7XG4gIFByb3BlcnRpZXM/OiB7IFBvbGljeURvY3VtZW50PzogeyBTdGF0ZW1lbnQ/OiB1bmtub3duW10gfSB9O1xufTtcblxuLyoqIElBTSBzdGF0ZW1lbnQgd2l0aCBBY3Rpb24gKHN0cmluZyBvciBzdHJpbmdbXSkgKi9cbnR5cGUgSUFNU3RhdGVtZW50ID0geyBBY3Rpb24/OiBzdHJpbmcgfCBzdHJpbmdbXTsgRWZmZWN0Pzogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGZpbmRRdWV1ZUJ5TmFtZShcbiAgdGVtcGxhdGU6IFRlbXBsYXRlLFxuICBuYW1lU3Vic3RyaW5nOiBzdHJpbmdcbik6IFtzdHJpbmcsIHVua25vd25dIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgcXVldWVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6U1FTOjpRdWV1ZVwiKTtcbiAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHF1ZXVlcykuZmluZCgoWywgcmVzXSkgPT5cbiAgICAocmVzIGFzIFJlc291cmNlV2l0aFF1ZXVlTmFtZSkuUHJvcGVydGllcz8uUXVldWVOYW1lPy5pbmNsdWRlcz8uKG5hbWVTdWJzdHJpbmcpXG4gICk7XG59XG5cbmZ1bmN0aW9uIGZpbmRMYW1iZGFCeUxvZ2ljYWxJZChcbiAgdGVtcGxhdGU6IFRlbXBsYXRlLFxuICBwcmVkaWNhdGU6IChsb2dpY2FsSWQ6IHN0cmluZykgPT4gYm9vbGVhblxuKTogW3N0cmluZywgdW5rbm93bl0gfCB1bmRlZmluZWQge1xuICBjb25zdCBsYW1iZGFzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiKTtcbiAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKGxhbWJkYXMpLmZpbmQoKFtsb2dpY2FsSWRdKSA9PiBwcmVkaWNhdGUobG9naWNhbElkKSk7XG59XG5cbmZ1bmN0aW9uIHBvbGljeUhhc0FjdGlvbihcbiAgcG9saWNpZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuICBhY3Rpb246IHN0cmluZ1xuKTogYm9vbGVhbiB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKHBvbGljaWVzKS5zb21lKChyZXMpID0+IHtcbiAgICBjb25zdCBkb2MgPSAocmVzIGFzIElBTVBvbGljeVJlc291cmNlKS5Qcm9wZXJ0aWVzPy5Qb2xpY3lEb2N1bWVudDtcbiAgICBjb25zdCBzdG10cyA9IChkb2M/LlN0YXRlbWVudCA/PyBbXSkgYXMgSUFNU3RhdGVtZW50W107XG4gICAgcmV0dXJuIHN0bXRzLnNvbWUoKHMpID0+IHtcbiAgICAgIGNvbnN0IGEgPSBzLkFjdGlvbjtcbiAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KGEpID8gYS5pbmNsdWRlcyhhY3Rpb24pIDogYSA9PT0gYWN0aW9uO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZGVzY3JpYmUoXCJWZXJpZmljYXRpb25TdGFja1wiLCAoKSA9PiB7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlQWxsKCgpID0+IHtcbiAgICBwcm9jZXNzLmVudi5TTEFDS19CT1RfVE9LRU4gPSBcInhveGItdGVzdC10b2tlblwiO1xuICAgIHByb2Nlc3MuZW52LlNMQUNLX1NJR05JTkdfU0VDUkVUID0gXCJ0ZXN0LXNpZ25pbmctc2VjcmV0XCI7XG5cbiAgICBjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIGNvbnN0IHN0YWNrID0gbmV3IFZlcmlmaWNhdGlvblN0YWNrKGFwcCwgXCJUZXN0VmVyaWZpY2F0aW9uU3RhY2tcIiwge1xuICAgICAgZW52OiB7IGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsIHJlZ2lvbjogXCJhcC1ub3J0aGVhc3QtMVwiIH0sXG4gICAgICBleGVjdXRpb25BZ2VudEFybnM6IHtcbiAgICAgICAgXCJmaWxlLWNyZWF0b3JcIjpcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jay1hZ2VudGNvcmU6YXAtbm9ydGhlYXN0LTE6MTIzNDU2Nzg5MDEyOnJ1bnRpbWUvVGVzdEV4ZWN1dGlvbkFnZW50XCIsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgfSk7XG5cbiAgYWZ0ZXJBbGwoKCkgPT4ge1xuICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5TTEFDS19CT1RfVE9LRU47XG4gICAgZGVsZXRlIHByb2Nlc3MuZW52LlNMQUNLX1NJR05JTkdfU0VDUkVUO1xuICB9KTtcblxuICBkZXNjcmliZShcIkEyQSBvbmx5IChubyBsZWdhY3kpXCIsICgpID0+IHtcbiAgICBpdChcIm11c3QgTk9UIGNvbnRhaW4gRXhlY3V0aW9uUmVzcG9uc2VRdWV1ZSBTUVMgcXVldWVcIiwgKCkgPT4ge1xuICAgICAgZXhwZWN0KGZpbmRRdWV1ZUJ5TmFtZSh0ZW1wbGF0ZSwgXCJleGVjdXRpb24tcmVzcG9uc2VcIikpLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KFwibXVzdCBOT1QgY29udGFpbiBTbGFja1Jlc3BvbnNlSGFuZGxlciBMYW1iZGFcIiwgKCkgPT4ge1xuICAgICAgZXhwZWN0KFxuICAgICAgICBmaW5kTGFtYmRhQnlMb2dpY2FsSWQodGVtcGxhdGUsIChpZCkgPT4gaWQuaW5jbHVkZXMoXCJTbGFja1Jlc3BvbnNlSGFuZGxlclwiKSlcbiAgICAgICkudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJtdXN0IE5PVCBoYXZlIG91dHB1dHMgRXhlY3V0aW9uUmVzcG9uc2VRdWV1ZVVybCwgRXhlY3V0aW9uUmVzcG9uc2VRdWV1ZUFyblwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBvdXRwdXRzID0gdGVtcGxhdGUudG9KU09OKCkuT3V0cHV0cyA/PyB7fTtcbiAgICAgIGV4cGVjdChvdXRwdXRzLkV4ZWN1dGlvblJlc3BvbnNlUXVldWVVcmwpLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIGV4cGVjdChvdXRwdXRzLkV4ZWN1dGlvblJlc3BvbnNlUXVldWVBcm4pLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCIwMTYgYXN5bmMgaW52b2NhdGlvbiAoU1FTICsgQWdlbnQgSW52b2tlcilcIiwgKCkgPT4ge1xuICAgIGl0KFwibXVzdCBjb250YWluIFNRUyBxdWV1ZSBmb3IgYWdlbnQtaW52b2NhdGlvbi1yZXF1ZXN0XCIsICgpID0+IHtcbiAgICAgIGV4cGVjdChmaW5kUXVldWVCeU5hbWUodGVtcGxhdGUsIFwiYWdlbnQtaW52b2NhdGlvbi1yZXF1ZXN0XCIpKS50b0JlRGVmaW5lZCgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJtdXN0IGNvbnRhaW4gTGFtYmRhIGZ1bmN0aW9uIGZvciBBZ2VudCBJbnZva2VyXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGFnZW50SW52b2tlciA9IGZpbmRMYW1iZGFCeUxvZ2ljYWxJZChcbiAgICAgICAgdGVtcGxhdGUsXG4gICAgICAgIChpZCkgPT4gaWQuaW5jbHVkZXMoXCJBZ2VudEludm9rZXJcIikgJiYgIWlkLmluY2x1ZGVzKFwiU2xhY2tFdmVudEhhbmRsZXJcIilcbiAgICAgICk7XG4gICAgICBleHBlY3QoYWdlbnRJbnZva2VyKS50b0JlRGVmaW5lZCgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJTbGFja0V2ZW50SGFuZGxlciBMYW1iZGEgcm9sZSBtdXN0IGhhdmUgc3FzOlNlbmRNZXNzYWdlIG9uIGFnZW50LWludm9jYXRpb24gcXVldWVcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpJQU06OlBvbGljeVwiLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEFjdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcInNxczpTZW5kTWVzc2FnZVwiXSksXG4gICAgICAgICAgICAgIEVmZmVjdDogXCJBbGxvd1wiLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwiQWdlbnQgSW52b2tlciBMYW1iZGEgcm9sZSBtdXN0IGhhdmUgYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHBvbGljaWVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6SUFNOjpQb2xpY3lcIik7XG4gICAgICBleHBlY3QoXG4gICAgICAgIHBvbGljeUhhc0FjdGlvbihwb2xpY2llcywgXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIilcbiAgICAgICkudG9CZSh0cnVlKTtcbiAgICB9KTtcblxuICAgIGl0KFwiYWdlbnQtaW52b2NhdGlvbi1yZXF1ZXN0IHF1ZXVlIG11c3QgaGF2ZSByZWRyaXZlUG9saWN5IHdpdGggZGVhZExldHRlclRhcmdldEFybiBhbmQgbWF4UmVjZWl2ZUNvdW50IDNcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTUVM6OlF1ZXVlXCIsIHtcbiAgICAgICAgUXVldWVOYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiYWdlbnQtaW52b2NhdGlvbi1yZXF1ZXN0XCIpLFxuICAgICAgICBSZWRyaXZlUG9saWN5OiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBkZWFkTGV0dGVyVGFyZ2V0QXJuOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJTbGFja0V2ZW50SGFuZGxlciBMYW1iZGFcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBTbGFja0V2ZW50SGFuZGxlciBMYW1iZGEgZnVuY3Rpb25cIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgUnVudGltZTogXCJweXRob24zLjExXCIsXG4gICAgICAgIFRpbWVvdXQ6IDEyMCxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgaGF2ZSBGdW5jdGlvbiBVUkwgZW5hYmxlZFwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6VXJsXCIsIHtcbiAgICAgICAgQXV0aFR5cGU6IFwiTk9ORVwiLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBoYXZlIGJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZSBwZXJtaXNzaW9uIChBMkEpXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6SUFNOjpQb2xpY3lcIiwge1xuICAgICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBBY3Rpb246IFwiYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCIsXG4gICAgICAgICAgICAgIEVmZmVjdDogXCJBbGxvd1wiLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJEeW5hbW9EQiBUYWJsZXNcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSA1IER5bmFtb0RCIHRhYmxlc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCB0YWJsZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIik7XG4gICAgICBleHBlY3QoT2JqZWN0LmtleXModGFibGVzKS5sZW5ndGgpLnRvQmUoNSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgdGFibGVzIHdpdGggUEFZX1BFUl9SRVFVRVNUIGJpbGxpbmdcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIiwge1xuICAgICAgICBCaWxsaW5nTW9kZTogXCJQQVlfUEVSX1JFUVVFU1RcIixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIHRhYmxlcyB3aXRoIFNTRSBlbmFibGVkXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RHluYW1vREI6OlRhYmxlXCIsIHtcbiAgICAgICAgU1NFU3BlY2lmaWNhdGlvbjoge1xuICAgICAgICAgIFNTRUVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBldmVudCBkZWR1cGUgdGFibGUgd2l0aCBUVExcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIiwge1xuICAgICAgICBUYWJsZU5hbWU6IFwiVGVzdFZlcmlmaWNhdGlvblN0YWNrLWV2ZW50LWRlZHVwZVwiLFxuICAgICAgICBUaW1lVG9MaXZlU3BlY2lmaWNhdGlvbjoge1xuICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6IFwidHRsXCIsXG4gICAgICAgICAgRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIlNlY3JldHMgTWFuYWdlclwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFNsYWNrIHNpZ25pbmcgc2VjcmV0XCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6U2VjcmV0c01hbmFnZXI6OlNlY3JldFwiLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiBcIlNsYWNrIGFwcCBzaWduaW5nIHNlY3JldCBmb3IgcmVxdWVzdCB2ZXJpZmljYXRpb25cIixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFNsYWNrIGJvdCB0b2tlbiBzZWNyZXRcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTZWNyZXRzTWFuYWdlcjo6U2VjcmV0XCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IFwiU2xhY2sgYm90IE9BdXRoIHRva2VuXCIsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJDbG91ZFdhdGNoIEFsYXJtc1wiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIHdoaXRlbGlzdCBhdXRob3JpemF0aW9uIGZhaWx1cmUgYWxhcm1cIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpDbG91ZFdhdGNoOjpBbGFybVwiLCB7XG4gICAgICAgIEFsYXJtRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXG4gICAgICAgICAgXCJ3aGl0ZWxpc3QgYXV0aG9yaXphdGlvbiBmYWlsdXJlc1wiXG4gICAgICAgICksXG4gICAgICAgIE5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBNZXRyaWNOYW1lOiBcIldoaXRlbGlzdEF1dGhvcml6YXRpb25GYWlsZWRcIixcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIGV4aXN0ZW5jZSBjaGVjayBmYWlsdXJlIGFsYXJtXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Q2xvdWRXYXRjaDo6QWxhcm1cIiwge1xuICAgICAgICBBbGFybURlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiRXhpc3RlbmNlIENoZWNrIGZhaWx1cmVzXCIpLFxuICAgICAgICBOYW1lc3BhY2U6IFwiU2xhY2tFdmVudEhhbmRsZXJcIixcbiAgICAgICAgTWV0cmljTmFtZTogXCJFeGlzdGVuY2VDaGVja0ZhaWxlZFwiLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgcmF0ZSBsaW1pdCBleGNlZWRlZCBhbGFybVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtXCIsIHtcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcInJhdGUgbGltaXQgZXhjZWVkZWRcIiksXG4gICAgICAgIE5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBNZXRyaWNOYW1lOiBcIlJhdGVMaW1pdEV4Y2VlZGVkXCIsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJTMyBGaWxlIEV4Y2hhbmdlIEJ1Y2tldCAoMDI0KVwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFMzIGJ1Y2tldCBmb3IgZmlsZSBleGNoYW5nZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBidWNrZXRzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6UzM6OkJ1Y2tldFwiKTtcbiAgICAgIGNvbnN0IGJ1Y2tldEtleXMgPSBPYmplY3Qua2V5cyhidWNrZXRzKTtcbiAgICAgIGV4cGVjdChidWNrZXRLZXlzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgxKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGhhdmUgYmxvY2sgcHVibGljIGFjY2VzcyBlbmFibGVkIG9uIGZpbGUgZXhjaGFuZ2UgYnVja2V0XCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIEJsb2NrUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcbiAgICAgICAgICBJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIFJlc3RyaWN0UHVibGljQnVja2V0czogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgaGF2ZSBsaWZlY3ljbGUgcnVsZSBmb3IgYXR0YWNobWVudHMvIHByZWZpeCB3aXRoIDEtZGF5IGV4cGlyeVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBMaWZlY3ljbGVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgUHJlZml4OiBcImF0dGFjaG1lbnRzL1wiLFxuICAgICAgICAgICAgICBFeHBpcmF0aW9uSW5EYXlzOiAxLFxuICAgICAgICAgICAgICBTdGF0dXM6IFwiRW5hYmxlZFwiLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGhhdmUgU1NFLVMzIGVuY3J5cHRpb24gKEJ1Y2tldEVuY3J5cHRpb24gd2l0aCBBRVMyNTYpXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIEJ1Y2tldEVuY3J5cHRpb246IHtcbiAgICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkNvbmZpZ3VyYXRpb246IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25CeURlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICBTU0VBbGdvcml0aG06IFwiQUVTMjU2XCIsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJ2ZXJpZmljYXRpb24gYWdlbnQgcm9sZSBtdXN0IGhhdmUgUzMgcGVybWlzc2lvbnMgZm9yIGZpbGUgZXhjaGFuZ2UgYnVja2V0XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHBvbGljaWVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6SUFNOjpQb2xpY3lcIik7XG4gICAgICBleHBlY3QocG9saWN5SGFzQWN0aW9uKHBvbGljaWVzLCBcInMzOkdldE9iamVjdCpcIikpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3QocG9saWN5SGFzQWN0aW9uKHBvbGljaWVzLCBcInMzOlB1dE9iamVjdFwiKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChwb2xpY3lIYXNBY3Rpb24ocG9saWNpZXMsIFwiczM6RGVsZXRlT2JqZWN0KlwiKSkudG9CZSh0cnVlKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJDb3N0IGFsbG9jYXRpb24gdGFncyAoMDMxKVwiLCAoKSA9PiB7XG4gICAgaXQoXCJBZ2VudENvcmUgUnVudGltZSBzaG91bGQgaGF2ZSBjb3N0IGFsbG9jYXRpb24gdGFnc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBydW50aW1lcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkJlZHJvY2tBZ2VudENvcmU6OlJ1bnRpbWVcIik7XG4gICAgICBleHBlY3QoT2JqZWN0LmtleXMocnVudGltZXMpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgxKTtcbiAgICAgIGZvciAoY29uc3QgWywgZGVmXSBvZiBPYmplY3QuZW50cmllcyhydW50aW1lcykpIHtcbiAgICAgICAgY29uc3QgdGFncyA9IChkZWYgYXMgeyBQcm9wZXJ0aWVzPzogeyBUYWdzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9IH0pLlByb3BlcnRpZXM/LlRhZ3M7XG4gICAgICAgIGV4cGVjdCh0YWdzKS50b0JlRGVmaW5lZCgpO1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBSRVFVSVJFRF9DT1NUX0FMTE9DQVRJT05fVEFHX0tFWVMpIHtcbiAgICAgICAgICBleHBlY3QodGFncyFba2V5XSkudG9CZURlZmluZWQoKTtcbiAgICAgICAgICBleHBlY3QodHlwZW9mIHRhZ3MhW2tleV0pLnRvQmUoXCJzdHJpbmdcIik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cblxuICBkZXNjcmliZShcIkFQSSBHYXRld2F5IGluZ3Jlc3Mgd2l0aCBXQUZcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBhIFJlZ2lvbmFsIEFQSSBHYXRld2F5IFJFU1QgQVBJXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6QXBpR2F0ZXdheTo6UmVzdEFwaVwiLCB7XG4gICAgICAgIE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJzbGFjay1pbmdyZXNzXCIpLFxuICAgICAgICBFbmRwb2ludENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBUeXBlczogW1wiUkVHSU9OQUxcIl0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNvbmZpZ3VyZSBBUEkgR2F0ZXdheSBzdGFnZSB0aHJvdHRsaW5nXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6QXBpR2F0ZXdheTo6U3RhZ2VcIiwge1xuICAgICAgICBNZXRob2RTZXR0aW5nczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEh0dHBNZXRob2Q6IFwiKlwiLFxuICAgICAgICAgICAgUmVzb3VyY2VQYXRoOiBcIi8qXCIsXG4gICAgICAgICAgICBUaHJvdHRsaW5nQnVyc3RMaW1pdDogNTAsXG4gICAgICAgICAgICBUaHJvdHRsaW5nUmF0ZUxpbWl0OiAyNSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBXQUYgV2ViIEFDTCBhbmQgYXNzb2NpYXRlIGl0IHdpdGggQVBJIEdhdGV3YXkgc3RhZ2VcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpXQUZ2Mjo6V2ViQUNMXCIsIHtcbiAgICAgICAgU2NvcGU6IFwiUkVHSU9OQUxcIixcbiAgICAgICAgUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiBcIkFXUy1BV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0XCIsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiBcIlNsYWNrSW5ncmVzc1JhdGVMaW1pdFwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBSZXNvdXJjZUFybiBpcyBhIENGbiBGbjo6Sm9pbiBpbnRyaW5zaWMgKG5vdCBhIHBsYWluIHN0cmluZyk7IHZlcmlmeSB0aGUgYXNzb2NpYXRpb24gZXhpc3RzXG4gICAgICBjb25zdCBhc3NvY2lhdGlvbnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpXQUZ2Mjo6V2ViQUNMQXNzb2NpYXRpb25cIik7XG4gICAgICBleHBlY3QoT2JqZWN0LmtleXMoYXNzb2NpYXRpb25zKS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJTdGFjayBPdXRwdXRzXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBvdXRwdXQgU2xhY2tFdmVudEhhbmRsZXJVcmxcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwiU2xhY2tFdmVudEhhbmRsZXJVcmxcIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcIlNsYWNrIEV2ZW50IEhhbmRsZXIgRnVuY3Rpb24gVVJMXCIpLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBvdXRwdXQgU2xhY2tFdmVudEhhbmRsZXJBcGlHYXRld2F5VXJsXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlNsYWNrRXZlbnRIYW5kbGVyQXBpR2F0ZXdheVVybFwiLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiQVBJIEdhdGV3YXkgVVJMXCIpLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBvdXRwdXQgVmVyaWZpY2F0aW9uTGFtYmRhUm9sZUFyblwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoXCJWZXJpZmljYXRpb25MYW1iZGFSb2xlQXJuXCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJWZXJpZmljYXRpb24gTGFtYmRhIFJvbGUgQVJOXCIpLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBvdXRwdXQgU2xhY2tFdmVudEhhbmRsZXJBcm5cIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwiU2xhY2tFdmVudEhhbmRsZXJBcm5cIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcIlNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSBBUk5cIiksXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJBdXRvLXJlcGx5IGNoYW5uZWwgY29uZmlndXJhdGlvblwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgTk9UIHNldCBBVVRPX1JFUExZX0NIQU5ORUxfSURTIHdoZW4gYXV0b1JlcGx5Q2hhbm5lbElkcyBpcyBub3QgcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgLy8gVGhlIGRlZmF1bHQgdGVtcGxhdGUgKGNyZWF0ZWQgaW4gYmVmb3JlQWxsKSBoYXMgbm8gYXV0b1JlcGx5Q2hhbm5lbElkc1xuICAgICAgY29uc3QgbGFtYmRhcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIik7XG4gICAgICBjb25zdCBoYW5kbGVyRW50cnkgPSBPYmplY3QuZW50cmllcyhsYW1iZGFzKS5maW5kKChbaWRdKSA9PlxuICAgICAgICBpZC5pbmNsdWRlcyhcIlNsYWNrRXZlbnRIYW5kbGVyXCIpICYmIGlkLmluY2x1ZGVzKFwiSGFuZGxlclwiKVxuICAgICAgKTtcbiAgICAgIGV4cGVjdChoYW5kbGVyRW50cnkpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBpZiAoaGFuZGxlckVudHJ5KSB7XG4gICAgICAgIGNvbnN0IGVudlZhcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID1cbiAgICAgICAgICAoaGFuZGxlckVudHJ5WzFdIGFzIHsgUHJvcGVydGllcz86IHsgRW52aXJvbm1lbnQ/OiB7IFZhcmlhYmxlcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0gfSB9KVxuICAgICAgICAgICAgPy5Qcm9wZXJ0aWVzPy5FbnZpcm9ubWVudD8uVmFyaWFibGVzID8/IHt9O1xuICAgICAgICBleHBlY3QoZW52VmFyc1tcIkFVVE9fUkVQTFlfQ0hBTk5FTF9JRFNcIl0pLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIHNldCBBVVRPX1JFUExZX0NIQU5ORUxfSURTIHdoZW4gYXV0b1JlcGx5Q2hhbm5lbElkcyBpcyBwcm92aWRlZFwiLCAoKSA9PiB7XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19CT1RfVE9LRU4gPSBcInhveGItdGVzdC10b2tlblwiO1xuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQgPSBcInRlc3Qtc2lnbmluZy1zZWNyZXRcIjtcbiAgICAgIGNvbnN0IGFwcDIgPSBuZXcgY2RrLkFwcCgpO1xuICAgICAgY29uc3Qgc3RhY2syID0gbmV3IFZlcmlmaWNhdGlvblN0YWNrKGFwcDIsIFwiVGVzdFZlcmlmaWNhdGlvblN0YWNrQXV0b1JlcGx5XCIsIHtcbiAgICAgICAgZW52OiB7IGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsIHJlZ2lvbjogXCJhcC1ub3J0aGVhc3QtMVwiIH0sXG4gICAgICAgIGF1dG9SZXBseUNoYW5uZWxJZHM6IFtcIkMwQUZTRzc5VDhEXCIsIFwiQzFCQkJCQkJCQkJcIl0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHQyID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrMik7XG4gICAgICB0Mi5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBFbnZpcm9ubWVudDoge1xuICAgICAgICAgIFZhcmlhYmxlczogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBBVVRPX1JFUExZX0NIQU5ORUxfSURTOiBcIkMwQUZTRzc5VDhELEMxQkJCQkJCQkJCXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJNZW50aW9uIGNoYW5uZWwgY29uZmlndXJhdGlvblwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgTk9UIHNldCBNRU5USU9OX0NIQU5ORUxfSURTIHdoZW4gbWVudGlvbkNoYW5uZWxJZHMgaXMgbm90IHByb3ZpZGVkXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGxhbWJkYXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIpO1xuICAgICAgY29uc3QgaGFuZGxlckVudHJ5ID0gT2JqZWN0LmVudHJpZXMobGFtYmRhcykuZmluZCgoW2lkXSkgPT5cbiAgICAgICAgaWQuaW5jbHVkZXMoXCJTbGFja0V2ZW50SGFuZGxlclwiKSAmJiBpZC5pbmNsdWRlcyhcIkhhbmRsZXJcIilcbiAgICAgICk7XG4gICAgICBleHBlY3QoaGFuZGxlckVudHJ5KS50b0JlRGVmaW5lZCgpO1xuICAgICAgaWYgKGhhbmRsZXJFbnRyeSkge1xuICAgICAgICBjb25zdCBlbnZWYXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9XG4gICAgICAgICAgKGhhbmRsZXJFbnRyeVsxXSBhcyB7IFByb3BlcnRpZXM/OiB7IEVudmlyb25tZW50PzogeyBWYXJpYWJsZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9IH0gfSlcbiAgICAgICAgICAgID8uUHJvcGVydGllcz8uRW52aXJvbm1lbnQ/LlZhcmlhYmxlcyA/PyB7fTtcbiAgICAgICAgZXhwZWN0KGVudlZhcnNbXCJNRU5USU9OX0NIQU5ORUxfSURTXCJdKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBzZXQgTUVOVElPTl9DSEFOTkVMX0lEUyB3aGVuIG1lbnRpb25DaGFubmVsSWRzIGlzIHByb3ZpZGVkXCIsICgpID0+IHtcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiA9IFwieG94Yi10ZXN0LXRva2VuXCI7XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCA9IFwidGVzdC1zaWduaW5nLXNlY3JldFwiO1xuICAgICAgY29uc3QgYXBwMiA9IG5ldyBjZGsuQXBwKCk7XG4gICAgICBjb25zdCBzdGFjazIgPSBuZXcgVmVyaWZpY2F0aW9uU3RhY2soYXBwMiwgXCJUZXN0VmVyaWZpY2F0aW9uU3RhY2tNZW50aW9uQ2hhbm5lbHNcIiwge1xuICAgICAgICBlbnY6IHsgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIiwgcmVnaW9uOiBcImFwLW5vcnRoZWFzdC0xXCIgfSxcbiAgICAgICAgbWVudGlvbkNoYW5uZWxJZHM6IFtcIkMwQUZTRzc5VDhEXCIsIFwiQzJDQ0NDQ0NDQ0NcIl0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHQyID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrMik7XG4gICAgICB0Mi5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBFbnZpcm9ubWVudDoge1xuICAgICAgICAgIFZhcmlhYmxlczogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBNRU5USU9OX0NIQU5ORUxfSURTOiBcIkMwQUZTRzc5VDhELEMyQ0NDQ0NDQ0NDXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==