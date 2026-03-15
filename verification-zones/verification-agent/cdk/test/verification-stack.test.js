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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2ZXJpZmljYXRpb24tc3RhY2sudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOzs7Ozs7R0FNRztBQUNILGlEQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsMkRBQThFO0FBQzlFLGtFQUE4RDtBQWE5RCxTQUFTLGVBQWUsQ0FDdEIsUUFBa0IsRUFDbEIsYUFBcUI7SUFFckIsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3pELE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUM1QyxHQUE2QixDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDLENBQ2hGLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FDNUIsUUFBa0IsRUFDbEIsU0FBeUM7SUFFekMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ2hFLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUM3RSxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQ3RCLFFBQWlDLEVBQ2pDLE1BQWM7SUFFZCxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUU7UUFDMUMsTUFBTSxHQUFHLEdBQUksR0FBeUIsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDO1FB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QXFCLENBQUM7WUFDekQsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDM0IsTUFBTSxNQUFNLEdBQUcsSUFBSSxzQ0FBaUIsQ0FBQyxJQUFJLEVBQUUsc0NBQXNDLEVBQUU7Z0JBQ2pGLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFFO2dCQUMxRCxpQkFBaUIsRUFBRSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUM7YUFDbEQsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxFQUFFLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEMsRUFBRSxDQUFDLHFCQUFxQixDQUFDLHVCQUF1QixFQUFFO2dCQUNoRCxXQUFXLEVBQUU7b0JBQ1gsU0FBUyxFQUFFLGtCQUFLLENBQUMsVUFBVSxDQUFDO3dCQUMxQixtQkFBbUIsRUFBRSx5QkFBeUI7cUJBQy9DLENBQUM7aUJBQ0g7YUFDRixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFZlcmlmaWNhdGlvblN0YWNrIENESyB1bml0IHRlc3RzLlxuICpcbiAqIFN5bnRoZXNpcyBydW5zIExhbWJkYSBhc3NldCBidW5kbGluZyAobG9jYWwgcGlwIGZpcnN0LCB0aGVuIERvY2tlcikuIEZvciBDSS9zYW5kYm94OlxuICogLSBQcmVmZXIgbG9jYWwgcGlwIHNvIERvY2tlci9Db2xpbWEgaXMgbm90IHJlcXVpcmVkLlxuICogLSBJZiB1c2luZyBEb2NrZXIsIGVuc3VyZSBDb2xpbWEgKG9yIERvY2tlcikgaXMgcnVubmluZyBhbmQgRE9DS0VSX0hPU1QgaXMgc2V0LlxuICovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiO1xuaW1wb3J0IHsgUkVRVUlSRURfQ09TVF9BTExPQ0FUSU9OX1RBR19LRVlTIH0gZnJvbSBcIkBzbGFjay1haS1hcHAvY2RrLXRvb2xpbmdcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvblN0YWNrIH0gZnJvbSBcIi4uL2xpYi92ZXJpZmljYXRpb24tc3RhY2tcIjtcblxuLyoqIFJlc291cmNlIHdpdGggb3B0aW9uYWwgUHJvcGVydGllcy5RdWV1ZU5hbWUgKFNRUywgZXRjLikgKi9cbnR5cGUgUmVzb3VyY2VXaXRoUXVldWVOYW1lID0geyBQcm9wZXJ0aWVzPzogeyBRdWV1ZU5hbWU/OiBzdHJpbmcgfSB9O1xuXG4vKiogSUFNIHBvbGljeSByZXNvdXJjZSB3aXRoIFN0YXRlbWVudCBhcnJheSAqL1xudHlwZSBJQU1Qb2xpY3lSZXNvdXJjZSA9IHtcbiAgUHJvcGVydGllcz86IHsgUG9saWN5RG9jdW1lbnQ/OiB7IFN0YXRlbWVudD86IHVua25vd25bXSB9IH07XG59O1xuXG4vKiogSUFNIHN0YXRlbWVudCB3aXRoIEFjdGlvbiAoc3RyaW5nIG9yIHN0cmluZ1tdKSAqL1xudHlwZSBJQU1TdGF0ZW1lbnQgPSB7IEFjdGlvbj86IHN0cmluZyB8IHN0cmluZ1tdOyBFZmZlY3Q/OiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZmluZFF1ZXVlQnlOYW1lKFxuICB0ZW1wbGF0ZTogVGVtcGxhdGUsXG4gIG5hbWVTdWJzdHJpbmc6IHN0cmluZ1xuKTogW3N0cmluZywgdW5rbm93bl0gfCB1bmRlZmluZWQge1xuICBjb25zdCBxdWV1ZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpTUVM6OlF1ZXVlXCIpO1xuICByZXR1cm4gT2JqZWN0LmVudHJpZXMocXVldWVzKS5maW5kKChbLCByZXNdKSA9PlxuICAgIChyZXMgYXMgUmVzb3VyY2VXaXRoUXVldWVOYW1lKS5Qcm9wZXJ0aWVzPy5RdWV1ZU5hbWU/LmluY2x1ZGVzPy4obmFtZVN1YnN0cmluZylcbiAgKTtcbn1cblxuZnVuY3Rpb24gZmluZExhbWJkYUJ5TG9naWNhbElkKFxuICB0ZW1wbGF0ZTogVGVtcGxhdGUsXG4gIHByZWRpY2F0ZTogKGxvZ2ljYWxJZDogc3RyaW5nKSA9PiBib29sZWFuXG4pOiBbc3RyaW5nLCB1bmtub3duXSB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGxhbWJkYXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIpO1xuICByZXR1cm4gT2JqZWN0LmVudHJpZXMobGFtYmRhcykuZmluZCgoW2xvZ2ljYWxJZF0pID0+IHByZWRpY2F0ZShsb2dpY2FsSWQpKTtcbn1cblxuZnVuY3Rpb24gcG9saWN5SGFzQWN0aW9uKFxuICBwb2xpY2llczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gIGFjdGlvbjogc3RyaW5nXG4pOiBib29sZWFuIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMocG9saWNpZXMpLnNvbWUoKHJlcykgPT4ge1xuICAgIGNvbnN0IGRvYyA9IChyZXMgYXMgSUFNUG9saWN5UmVzb3VyY2UpLlByb3BlcnRpZXM/LlBvbGljeURvY3VtZW50O1xuICAgIGNvbnN0IHN0bXRzID0gKGRvYz8uU3RhdGVtZW50ID8/IFtdKSBhcyBJQU1TdGF0ZW1lbnRbXTtcbiAgICByZXR1cm4gc3RtdHMuc29tZSgocykgPT4ge1xuICAgICAgY29uc3QgYSA9IHMuQWN0aW9uO1xuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYSkgPyBhLmluY2x1ZGVzKGFjdGlvbikgOiBhID09PSBhY3Rpb247XG4gICAgfSk7XG4gIH0pO1xufVxuXG5kZXNjcmliZShcIlZlcmlmaWNhdGlvblN0YWNrXCIsICgpID0+IHtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiA9IFwieG94Yi10ZXN0LXRva2VuXCI7XG4gICAgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQgPSBcInRlc3Qtc2lnbmluZy1zZWNyZXRcIjtcblxuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3Qgc3RhY2sgPSBuZXcgVmVyaWZpY2F0aW9uU3RhY2soYXBwLCBcIlRlc3RWZXJpZmljYXRpb25TdGFja1wiLCB7XG4gICAgICBlbnY6IHsgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIiwgcmVnaW9uOiBcImFwLW5vcnRoZWFzdC0xXCIgfSxcbiAgICAgIGV4ZWN1dGlvbkFnZW50QXJuczoge1xuICAgICAgICBcImZpbGUtY3JlYXRvclwiOlxuICAgICAgICAgIFwiYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZTphcC1ub3J0aGVhc3QtMToxMjM0NTY3ODkwMTI6cnVudGltZS9UZXN0RXhlY3V0aW9uQWdlbnRcIixcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICB9KTtcblxuICBhZnRlckFsbCgoKSA9PiB7XG4gICAgZGVsZXRlIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTjtcbiAgICBkZWxldGUgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQ7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiQTJBIG9ubHkgKG5vIGxlZ2FjeSlcIiwgKCkgPT4ge1xuICAgIGl0KFwibXVzdCBOT1QgY29udGFpbiBFeGVjdXRpb25SZXNwb25zZVF1ZXVlIFNRUyBxdWV1ZVwiLCAoKSA9PiB7XG4gICAgICBleHBlY3QoZmluZFF1ZXVlQnlOYW1lKHRlbXBsYXRlLCBcImV4ZWN1dGlvbi1yZXNwb25zZVwiKSkudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJtdXN0IE5PVCBjb250YWluIFNsYWNrUmVzcG9uc2VIYW5kbGVyIExhbWJkYVwiLCAoKSA9PiB7XG4gICAgICBleHBlY3QoXG4gICAgICAgIGZpbmRMYW1iZGFCeUxvZ2ljYWxJZCh0ZW1wbGF0ZSwgKGlkKSA9PiBpZC5pbmNsdWRlcyhcIlNsYWNrUmVzcG9uc2VIYW5kbGVyXCIpKVxuICAgICAgKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdChcIm11c3QgTk9UIGhhdmUgb3V0cHV0cyBFeGVjdXRpb25SZXNwb25zZVF1ZXVlVXJsLCBFeGVjdXRpb25SZXNwb25zZVF1ZXVlQXJuXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS50b0pTT04oKS5PdXRwdXRzID8/IHt9O1xuICAgICAgZXhwZWN0KG91dHB1dHMuRXhlY3V0aW9uUmVzcG9uc2VRdWV1ZVVybCkudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KG91dHB1dHMuRXhlY3V0aW9uUmVzcG9uc2VRdWV1ZUFybikudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIjAxNiBhc3luYyBpbnZvY2F0aW9uIChTUVMgKyBBZ2VudCBJbnZva2VyKVwiLCAoKSA9PiB7XG4gICAgaXQoXCJtdXN0IGNvbnRhaW4gU1FTIHF1ZXVlIGZvciBhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3RcIiwgKCkgPT4ge1xuICAgICAgZXhwZWN0KGZpbmRRdWV1ZUJ5TmFtZSh0ZW1wbGF0ZSwgXCJhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3RcIikpLnRvQmVEZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdChcIm11c3QgY29udGFpbiBMYW1iZGEgZnVuY3Rpb24gZm9yIEFnZW50IEludm9rZXJcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgYWdlbnRJbnZva2VyID0gZmluZExhbWJkYUJ5TG9naWNhbElkKFxuICAgICAgICB0ZW1wbGF0ZSxcbiAgICAgICAgKGlkKSA9PiBpZC5pbmNsdWRlcyhcIkFnZW50SW52b2tlclwiKSAmJiAhaWQuaW5jbHVkZXMoXCJTbGFja0V2ZW50SGFuZGxlclwiKVxuICAgICAgKTtcbiAgICAgIGV4cGVjdChhZ2VudEludm9rZXIpLnRvQmVEZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdChcIlNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSByb2xlIG11c3QgaGF2ZSBzcXM6U2VuZE1lc3NhZ2Ugb24gYWdlbnQtaW52b2NhdGlvbiBxdWV1ZVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OklBTTo6UG9saWN5XCIsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1wic3FzOlNlbmRNZXNzYWdlXCJdKSxcbiAgICAgICAgICAgICAgRWZmZWN0OiBcIkFsbG93XCIsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJBZ2VudCBJbnZva2VyIExhbWJkYSByb2xlIG11c3QgaGF2ZSBiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgcG9saWNpZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpJQU06OlBvbGljeVwiKTtcbiAgICAgIGV4cGVjdChcbiAgICAgICAgcG9saWN5SGFzQWN0aW9uKHBvbGljaWVzLCBcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiKVxuICAgICAgKS50b0JlKHRydWUpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3QgcXVldWUgbXVzdCBoYXZlIHJlZHJpdmVQb2xpY3kgd2l0aCBkZWFkTGV0dGVyVGFyZ2V0QXJuIGFuZCBtYXhSZWNlaXZlQ291bnQgM1wiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNRUzo6UXVldWVcIiwge1xuICAgICAgICBRdWV1ZU5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJhZ2VudC1pbnZvY2F0aW9uLXJlcXVlc3RcIiksXG4gICAgICAgIFJlZHJpdmVQb2xpY3k6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgIGRlYWRMZXR0ZXJUYXJnZXRBcm46IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIlNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYVwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFNsYWNrRXZlbnRIYW5kbGVyIExhbWJkYSBmdW5jdGlvblwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBSdW50aW1lOiBcInB5dGhvbjMuMTFcIixcbiAgICAgICAgVGltZW91dDogMTIwLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBoYXZlIEZ1bmN0aW9uIFVSTCBlbmFibGVkXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpVcmxcIiwge1xuICAgICAgICBBdXRoVHlwZTogXCJOT05FXCIsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGhhdmUgYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lIHBlcm1pc3Npb24gKEEyQSlcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpJQU06OlBvbGljeVwiLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEFjdGlvbjogXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIixcbiAgICAgICAgICAgICAgRWZmZWN0OiBcIkFsbG93XCIsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIkR5bmFtb0RCIFRhYmxlc1wiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIDUgRHluYW1vREIgdGFibGVzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHRhYmxlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyh0YWJsZXMpLmxlbmd0aCkudG9CZSg1KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSB0YWJsZXMgd2l0aCBQQVlfUEVSX1JFUVVFU1QgYmlsbGluZ1wiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiLCB7XG4gICAgICAgIEJpbGxpbmdNb2RlOiBcIlBBWV9QRVJfUkVRVUVTVFwiLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgdGFibGVzIHdpdGggU1NFIGVuYWJsZWRcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIiwge1xuICAgICAgICBTU0VTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgICAgU1NFRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIGV2ZW50IGRlZHVwZSB0YWJsZSB3aXRoIFRUTFwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiLCB7XG4gICAgICAgIFRhYmxlTmFtZTogXCJUZXN0VmVyaWZpY2F0aW9uU3RhY2stZXZlbnQtZGVkdXBlXCIsXG4gICAgICAgIFRpbWVUb0xpdmVTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgICAgQXR0cmlidXRlTmFtZTogXCJ0dGxcIixcbiAgICAgICAgICBFbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiU2VjcmV0cyBNYW5hZ2VyXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBjcmVhdGUgU2xhY2sgc2lnbmluZyBzZWNyZXRcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTZWNyZXRzTWFuYWdlcjo6U2VjcmV0XCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IFwiU2xhY2sgYXBwIHNpZ25pbmcgc2VjcmV0IGZvciByZXF1ZXN0IHZlcmlmaWNhdGlvblwiLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgU2xhY2sgYm90IHRva2VuIHNlY3JldFwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXRcIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogXCJTbGFjayBib3QgT0F1dGggdG9rZW5cIixcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIkNsb3VkV2F0Y2ggQWxhcm1zXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBjcmVhdGUgd2hpdGVsaXN0IGF1dGhvcml6YXRpb24gZmFpbHVyZSBhbGFybVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtXCIsIHtcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcbiAgICAgICAgICBcIndoaXRlbGlzdCBhdXRob3JpemF0aW9uIGZhaWx1cmVzXCJcbiAgICAgICAgKSxcbiAgICAgICAgTmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIE1ldHJpY05hbWU6IFwiV2hpdGVsaXN0QXV0aG9yaXphdGlvbkZhaWxlZFwiLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBjcmVhdGUgZXhpc3RlbmNlIGNoZWNrIGZhaWx1cmUgYWxhcm1cIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpDbG91ZFdhdGNoOjpBbGFybVwiLCB7XG4gICAgICAgIEFsYXJtRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJFeGlzdGVuY2UgQ2hlY2sgZmFpbHVyZXNcIiksXG4gICAgICAgIE5hbWVzcGFjZTogXCJTbGFja0V2ZW50SGFuZGxlclwiLFxuICAgICAgICBNZXRyaWNOYW1lOiBcIkV4aXN0ZW5jZUNoZWNrRmFpbGVkXCIsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSByYXRlIGxpbWl0IGV4Y2VlZGVkIGFsYXJtXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Q2xvdWRXYXRjaDo6QWxhcm1cIiwge1xuICAgICAgICBBbGFybURlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwicmF0ZSBsaW1pdCBleGNlZWRlZFwiKSxcbiAgICAgICAgTmFtZXNwYWNlOiBcIlNsYWNrRXZlbnRIYW5kbGVyXCIsXG4gICAgICAgIE1ldHJpY05hbWU6IFwiUmF0ZUxpbWl0RXhjZWVkZWRcIixcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIlMzIEZpbGUgRXhjaGFuZ2UgQnVja2V0ICgwMjQpXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBjcmVhdGUgUzMgYnVja2V0IGZvciBmaWxlIGV4Y2hhbmdlXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGJ1Y2tldHMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpTMzo6QnVja2V0XCIpO1xuICAgICAgY29uc3QgYnVja2V0S2V5cyA9IE9iamVjdC5rZXlzKGJ1Y2tldHMpO1xuICAgICAgZXhwZWN0KGJ1Y2tldEtleXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDEpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgaGF2ZSBibG9jayBwdWJsaWMgYWNjZXNzIGVuYWJsZWQgb24gZmlsZSBleGNoYW5nZSBidWNrZXRcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBoYXZlIGxpZmVjeWNsZSBydWxlIGZvciBhdHRhY2htZW50cy8gcHJlZml4IHdpdGggMS1kYXkgZXhwaXJ5XCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBQcmVmaXg6IFwiYXR0YWNobWVudHMvXCIsXG4gICAgICAgICAgICAgIEV4cGlyYXRpb25JbkRheXM6IDEsXG4gICAgICAgICAgICAgIFN0YXR1czogXCJFbmFibGVkXCIsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgaGF2ZSBTU0UtUzMgZW5jcnlwdGlvbiAoQnVja2V0RW5jcnlwdGlvbiB3aXRoIEFFUzI1NilcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgQnVja2V0RW5jcnlwdGlvbjoge1xuICAgICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkJ5RGVmYXVsdDoge1xuICAgICAgICAgICAgICAgIFNTRUFsZ29yaXRobTogXCJBRVMyNTZcIixcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdChcInZlcmlmaWNhdGlvbiBhZ2VudCByb2xlIG11c3QgaGF2ZSBTMyBwZXJtaXNzaW9ucyBmb3IgZmlsZSBleGNoYW5nZSBidWNrZXRcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgcG9saWNpZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpJQU06OlBvbGljeVwiKTtcbiAgICAgIGV4cGVjdChwb2xpY3lIYXNBY3Rpb24ocG9saWNpZXMsIFwiczM6R2V0T2JqZWN0KlwiKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChwb2xpY3lIYXNBY3Rpb24ocG9saWNpZXMsIFwiczM6UHV0T2JqZWN0XCIpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KHBvbGljeUhhc0FjdGlvbihwb2xpY2llcywgXCJzMzpEZWxldGVPYmplY3QqXCIpKS50b0JlKHRydWUpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIkNvc3QgYWxsb2NhdGlvbiB0YWdzICgwMzEpXCIsICgpID0+IHtcbiAgICBpdChcIkFnZW50Q29yZSBSdW50aW1lIHNob3VsZCBoYXZlIGNvc3QgYWxsb2NhdGlvbiB0YWdzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJ1bnRpbWVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6QmVkcm9ja0FnZW50Q29yZTo6UnVudGltZVwiKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhydW50aW1lcykubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDEpO1xuICAgICAgZm9yIChjb25zdCBbLCBkZWZdIG9mIE9iamVjdC5lbnRyaWVzKHJ1bnRpbWVzKSkge1xuICAgICAgICBjb25zdCB0YWdzID0gKGRlZiBhcyB7IFByb3BlcnRpZXM/OiB7IFRhZ3M/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0gfSkuUHJvcGVydGllcz8uVGFncztcbiAgICAgICAgZXhwZWN0KHRhZ3MpLnRvQmVEZWZpbmVkKCk7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIFJFUVVJUkVEX0NPU1RfQUxMT0NBVElPTl9UQUdfS0VZUykge1xuICAgICAgICAgIGV4cGVjdCh0YWdzIVtrZXldKS50b0JlRGVmaW5lZCgpO1xuICAgICAgICAgIGV4cGVjdCh0eXBlb2YgdGFncyFba2V5XSkudG9CZShcInN0cmluZ1wiKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuXG4gIGRlc2NyaWJlKFwiQVBJIEdhdGV3YXkgaW5ncmVzcyB3aXRoIFdBRlwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIGEgUmVnaW9uYWwgQVBJIEdhdGV3YXkgUkVTVCBBUElcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpBcGlHYXRld2F5OjpSZXN0QXBpXCIsIHtcbiAgICAgICAgTmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcInNsYWNrLWluZ3Jlc3NcIiksXG4gICAgICAgIEVuZHBvaW50Q29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIFR5cGVzOiBbXCJSRUdJT05BTFwiXSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY29uZmlndXJlIEFQSSBHYXRld2F5IHN0YWdlIHRocm90dGxpbmdcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpBcGlHYXRld2F5OjpTdGFnZVwiLCB7XG4gICAgICAgIE1ldGhvZFNldHRpbmdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgSHR0cE1ldGhvZDogXCIqXCIsXG4gICAgICAgICAgICBSZXNvdXJjZVBhdGg6IFwiLypcIixcbiAgICAgICAgICAgIFRocm90dGxpbmdCdXJzdExpbWl0OiA1MCxcbiAgICAgICAgICAgIFRocm90dGxpbmdSYXRlTGltaXQ6IDI1LFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgY3JlYXRlIFdBRiBXZWIgQUNMIGFuZCBhc3NvY2lhdGUgaXQgd2l0aCBBUEkgR2F0ZXdheSBzdGFnZVwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OldBRnYyOjpXZWJBQ0xcIiwge1xuICAgICAgICBTY29wZTogXCJSRUdJT05BTFwiLFxuICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6IFwiQVdTLUFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXRcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6IFwiU2xhY2tJbmdyZXNzUmF0ZUxpbWl0XCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFJlc291cmNlQXJuIGlzIGEgQ0ZuIEZuOjpKb2luIGludHJpbnNpYyAobm90IGEgcGxhaW4gc3RyaW5nKTsgdmVyaWZ5IHRoZSBhc3NvY2lhdGlvbiBleGlzdHNcbiAgICAgIGNvbnN0IGFzc29jaWF0aW9ucyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OldBRnYyOjpXZWJBQ0xBc3NvY2lhdGlvblwiKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhhc3NvY2lhdGlvbnMpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIlN0YWNrIE91dHB1dHNcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIG91dHB1dCBTbGFja0V2ZW50SGFuZGxlckFwaUdhdGV3YXlVcmxcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwiU2xhY2tFdmVudEhhbmRsZXJBcGlHYXRld2F5VXJsXCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJBUEkgR2F0ZXdheSBVUkxcIiksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIG91dHB1dCBWZXJpZmljYXRpb25MYW1iZGFSb2xlQXJuXCIsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlZlcmlmaWNhdGlvbkxhbWJkYVJvbGVBcm5cIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcIlZlcmlmaWNhdGlvbiBMYW1iZGEgUm9sZSBBUk5cIiksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIG91dHB1dCBTbGFja0V2ZW50SGFuZGxlckFyblwiLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoXCJTbGFja0V2ZW50SGFuZGxlckFyblwiLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiU2xhY2tFdmVudEhhbmRsZXIgTGFtYmRhIEFSTlwiKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIkF1dG8tcmVwbHkgY2hhbm5lbCBjb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBOT1Qgc2V0IEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFMgd2hlbiBhdXRvUmVwbHlDaGFubmVsSWRzIGlzIG5vdCBwcm92aWRlZFwiLCAoKSA9PiB7XG4gICAgICAvLyBUaGUgZGVmYXVsdCB0ZW1wbGF0ZSAoY3JlYXRlZCBpbiBiZWZvcmVBbGwpIGhhcyBubyBhdXRvUmVwbHlDaGFubmVsSWRzXG4gICAgICBjb25zdCBsYW1iZGFzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiKTtcbiAgICAgIGNvbnN0IGhhbmRsZXJFbnRyeSA9IE9iamVjdC5lbnRyaWVzKGxhbWJkYXMpLmZpbmQoKFtpZF0pID0+XG4gICAgICAgIGlkLmluY2x1ZGVzKFwiU2xhY2tFdmVudEhhbmRsZXJcIikgJiYgaWQuaW5jbHVkZXMoXCJIYW5kbGVyXCIpXG4gICAgICApO1xuICAgICAgZXhwZWN0KGhhbmRsZXJFbnRyeSkudG9CZURlZmluZWQoKTtcbiAgICAgIGlmIChoYW5kbGVyRW50cnkpIHtcbiAgICAgICAgY29uc3QgZW52VmFyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPVxuICAgICAgICAgIChoYW5kbGVyRW50cnlbMV0gYXMgeyBQcm9wZXJ0aWVzPzogeyBFbnZpcm9ubWVudD86IHsgVmFyaWFibGVzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSB9IH0pXG4gICAgICAgICAgICA/LlByb3BlcnRpZXM/LkVudmlyb25tZW50Py5WYXJpYWJsZXMgPz8ge307XG4gICAgICAgIGV4cGVjdChlbnZWYXJzW1wiQVVUT19SRVBMWV9DSEFOTkVMX0lEU1wiXSkudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgc2V0IEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFMgd2hlbiBhdXRvUmVwbHlDaGFubmVsSWRzIGlzIHByb3ZpZGVkXCIsICgpID0+IHtcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTiA9IFwieG94Yi10ZXN0LXRva2VuXCI7XG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCA9IFwidGVzdC1zaWduaW5nLXNlY3JldFwiO1xuICAgICAgY29uc3QgYXBwMiA9IG5ldyBjZGsuQXBwKCk7XG4gICAgICBjb25zdCBzdGFjazIgPSBuZXcgVmVyaWZpY2F0aW9uU3RhY2soYXBwMiwgXCJUZXN0VmVyaWZpY2F0aW9uU3RhY2tBdXRvUmVwbHlcIiwge1xuICAgICAgICBlbnY6IHsgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIiwgcmVnaW9uOiBcImFwLW5vcnRoZWFzdC0xXCIgfSxcbiAgICAgICAgYXV0b1JlcGx5Q2hhbm5lbElkczogW1wiQzBBRlNHNzlUOERcIiwgXCJDMUJCQkJCQkJCQlwiXSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdDIgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2syKTtcbiAgICAgIHQyLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgVmFyaWFibGVzOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEFVVE9fUkVQTFlfQ0hBTk5FTF9JRFM6IFwiQzBBRlNHNzlUOEQsQzFCQkJCQkJCQkJcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZShcIk1lbnRpb24gY2hhbm5lbCBjb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBOT1Qgc2V0IE1FTlRJT05fQ0hBTk5FTF9JRFMgd2hlbiBtZW50aW9uQ2hhbm5lbElkcyBpcyBub3QgcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgbGFtYmRhcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIik7XG4gICAgICBjb25zdCBoYW5kbGVyRW50cnkgPSBPYmplY3QuZW50cmllcyhsYW1iZGFzKS5maW5kKChbaWRdKSA9PlxuICAgICAgICBpZC5pbmNsdWRlcyhcIlNsYWNrRXZlbnRIYW5kbGVyXCIpICYmIGlkLmluY2x1ZGVzKFwiSGFuZGxlclwiKVxuICAgICAgKTtcbiAgICAgIGV4cGVjdChoYW5kbGVyRW50cnkpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBpZiAoaGFuZGxlckVudHJ5KSB7XG4gICAgICAgIGNvbnN0IGVudlZhcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID1cbiAgICAgICAgICAoaGFuZGxlckVudHJ5WzFdIGFzIHsgUHJvcGVydGllcz86IHsgRW52aXJvbm1lbnQ/OiB7IFZhcmlhYmxlcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0gfSB9KVxuICAgICAgICAgICAgPy5Qcm9wZXJ0aWVzPy5FbnZpcm9ubWVudD8uVmFyaWFibGVzID8/IHt9O1xuICAgICAgICBleHBlY3QoZW52VmFyc1tcIk1FTlRJT05fQ0hBTk5FTF9JRFNcIl0pLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIHNldCBNRU5USU9OX0NIQU5ORUxfSURTIHdoZW4gbWVudGlvbkNoYW5uZWxJZHMgaXMgcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOID0gXCJ4b3hiLXRlc3QtdG9rZW5cIjtcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX1NJR05JTkdfU0VDUkVUID0gXCJ0ZXN0LXNpZ25pbmctc2VjcmV0XCI7XG4gICAgICBjb25zdCBhcHAyID0gbmV3IGNkay5BcHAoKTtcbiAgICAgIGNvbnN0IHN0YWNrMiA9IG5ldyBWZXJpZmljYXRpb25TdGFjayhhcHAyLCBcIlRlc3RWZXJpZmljYXRpb25TdGFja01lbnRpb25DaGFubmVsc1wiLCB7XG4gICAgICAgIGVudjogeyBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLCByZWdpb246IFwiYXAtbm9ydGhlYXN0LTFcIiB9LFxuICAgICAgICBtZW50aW9uQ2hhbm5lbElkczogW1wiQzBBRlNHNzlUOERcIiwgXCJDMkNDQ0NDQ0NDQ1wiXSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgdDIgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2syKTtcbiAgICAgIHQyLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgVmFyaWFibGVzOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE1FTlRJT05fQ0hBTk5FTF9JRFM6IFwiQzBBRlNHNzlUOEQsQzJDQ0NDQ0NDQ0NcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19