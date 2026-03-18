/**
 * VerificationStack CDK unit tests.
 *
 * Synthesis runs Lambda asset bundling (local pip first, then Docker). For CI/sandbox:
 * - Prefer local pip so Docker/Colima is not required.
 * - If using Docker, ensure Colima (or Docker) is running and DOCKER_HOST is set.
 */
import * as cdk from "aws-cdk-lib";
import { Template, Match, Annotations } from "aws-cdk-lib/assertions";
import { REQUIRED_COST_ALLOCATION_TAG_KEYS } from "@slack-ai-app/cdk-tooling";
import { AwsSolutionsChecks } from "cdk-nag";
import { VerificationStack } from "../lib/verification-stack";

/** Resource with optional Properties.QueueName (SQS, etc.) */
type ResourceWithQueueName = { Properties?: { QueueName?: string } };

/** IAM policy resource with Statement array */
type IAMPolicyResource = {
  Properties?: { PolicyDocument?: { Statement?: unknown[] } };
};

/** IAM statement with Action (string or string[]) */
type IAMStatement = { Action?: string | string[]; Effect?: string };

function findQueueByName(
  template: Template,
  nameSubstring: string
): [string, unknown] | undefined {
  const queues = template.findResources("AWS::SQS::Queue");
  return Object.entries(queues).find(([, res]) =>
    (res as ResourceWithQueueName).Properties?.QueueName?.includes?.(nameSubstring)
  );
}

function findLambdaByLogicalId(
  template: Template,
  predicate: (logicalId: string) => boolean
): [string, unknown] | undefined {
  const lambdas = template.findResources("AWS::Lambda::Function");
  return Object.entries(lambdas).find(([logicalId]) => predicate(logicalId));
}

function policyHasAction(
  policies: Record<string, unknown>,
  action: string
): boolean {
  return Object.values(policies).some((res) => {
    const doc = (res as IAMPolicyResource).Properties?.PolicyDocument;
    const stmts = (doc?.Statement ?? []) as IAMStatement[];
    return stmts.some((s) => {
      const a = s.Action;
      return Array.isArray(a) ? a.includes(action) : a === action;
    });
  });
}

describe("VerificationStack", () => {
  let template: Template;

  beforeAll(() => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    process.env.SLACK_SIGNING_SECRET = "test-signing-secret";

    const app = new cdk.App();
    const stack = new VerificationStack(app, "TestVerificationStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
      executionAgentArns: {
        "file-creator":
          "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/TestExecutionAgent",
      },
    });
    template = Template.fromStack(stack);
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
      expect(
        findLambdaByLogicalId(template, (id) => id.includes("SlackResponseHandler"))
      ).toBeUndefined();
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
      const agentInvoker = findLambdaByLogicalId(
        template,
        (id) => id.includes("AgentInvoker") && !id.includes("SlackEventHandler")
      );
      expect(agentInvoker).toBeDefined();
    });

    it("SlackEventHandler Lambda role must have sqs:SendMessage on agent-invocation queue", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(["sqs:SendMessage"]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    it("Agent Invoker Lambda role must have bedrock-agentcore:InvokeAgentRuntime", () => {
      const policies = template.findResources("AWS::IAM::Policy");
      expect(
        policyHasAction(policies, "bedrock-agentcore:InvokeAgentRuntime")
      ).toBe(true);
    });

    it("agent-invocation-request queue must have redrivePolicy with deadLetterTargetArn and maxReceiveCount 3", () => {
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: Match.stringLikeRegexp("agent-invocation-request"),
        RedrivePolicy: Match.objectLike({
          deadLetterTargetArn: Match.anyValue(),
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
          Statement: Match.arrayWith([
            Match.objectLike({
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
        AlarmDescription: Match.stringLikeRegexp(
          "whitelist authorization failures"
        ),
        Namespace: "SlackEventHandler",
        MetricName: "WhitelistAuthorizationFailed",
      });
    });

    it("should create existence check failure alarm", () => {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmDescription: Match.stringLikeRegexp("Existence Check failures"),
        Namespace: "SlackEventHandler",
        MetricName: "ExistenceCheckFailed",
      });
    });

    it("should create rate limit exceeded alarm", () => {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmDescription: Match.stringLikeRegexp("rate limit exceeded"),
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
          Rules: Match.arrayWith([
            Match.objectLike({
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
          ServerSideEncryptionConfiguration: Match.arrayWith([
            Match.objectLike({
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
        const tags = (def as { Properties?: { Tags?: Record<string, string> } }).Properties?.Tags;
        expect(tags).toBeDefined();
        for (const key of REQUIRED_COST_ALLOCATION_TAG_KEYS) {
          expect(tags![key]).toBeDefined();
          expect(typeof tags![key]).toBe("string");
        }
      }
    });
  });


  describe("API Gateway ingress with WAF", () => {
    it("should create a Regional API Gateway REST API", () => {
      template.hasResourceProperties("AWS::ApiGateway::RestApi", {
        Name: Match.stringLikeRegexp("slack-ingress"),
        EndpointConfiguration: {
          Types: ["REGIONAL"],
        },
      });
    });

    it("should configure API Gateway stage throttling", () => {
      template.hasResourceProperties("AWS::ApiGateway::Stage", {
        MethodSettings: Match.arrayWith([
          Match.objectLike({
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
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "AWS-AWSManagedRulesCommonRuleSet",
          }),
          Match.objectLike({
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
        Description: Match.stringLikeRegexp("API Gateway URL"),
      });
    });

    it("should output VerificationLambdaRoleArn", () => {
      template.hasOutput("VerificationLambdaRoleArn", {
        Description: Match.stringLikeRegexp("Verification Lambda Role ARN"),
      });
    });

    it("should output SlackEventHandlerArn", () => {
      template.hasOutput("SlackEventHandlerArn", {
        Description: Match.stringLikeRegexp("SlackEventHandler Lambda ARN"),
      });
    });
  });

  describe("Auto-reply channel configuration", () => {
    it("should NOT set AUTO_REPLY_CHANNEL_IDS when autoReplyChannelIds is not provided", () => {
      // The default template (created in beforeAll) has no autoReplyChannelIds
      const lambdas = template.findResources("AWS::Lambda::Function");
      const handlerEntry = Object.entries(lambdas).find(([id]) =>
        id.includes("SlackEventHandler") && id.includes("Handler")
      );
      expect(handlerEntry).toBeDefined();
      if (handlerEntry) {
        const envVars: Record<string, unknown> =
          (handlerEntry[1] as { Properties?: { Environment?: { Variables?: Record<string, unknown> } } })
            ?.Properties?.Environment?.Variables ?? {};
        expect(envVars["AUTO_REPLY_CHANNEL_IDS"]).toBeUndefined();
      }
    });

    it("should set AUTO_REPLY_CHANNEL_IDS when autoReplyChannelIds is provided", () => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
      process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
      const app2 = new cdk.App();
      const stack2 = new VerificationStack(app2, "TestVerificationStackAutoReply", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        autoReplyChannelIds: ["C0AFSG79T8D", "C1BBBBBBBBB"],
      });
      const t2 = Template.fromStack(stack2);
      t2.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: Match.objectLike({
            AUTO_REPLY_CHANNEL_IDS: "C0AFSG79T8D,C1BBBBBBBBB",
          }),
        },
      });
    });
  });

  describe("Mention channel configuration", () => {
    it("should NOT set MENTION_CHANNEL_IDS when mentionChannelIds is not provided", () => {
      const lambdas = template.findResources("AWS::Lambda::Function");
      const handlerEntry = Object.entries(lambdas).find(([id]) =>
        id.includes("SlackEventHandler") && id.includes("Handler")
      );
      expect(handlerEntry).toBeDefined();
      if (handlerEntry) {
        const envVars: Record<string, unknown> =
          (handlerEntry[1] as { Properties?: { Environment?: { Variables?: Record<string, unknown> } } })
            ?.Properties?.Environment?.Variables ?? {};
        expect(envVars["MENTION_CHANNEL_IDS"]).toBeUndefined();
      }
    });

    it("should set MENTION_CHANNEL_IDS when mentionChannelIds is provided", () => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
      process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
      const app2 = new cdk.App();
      const stack2 = new VerificationStack(app2, "TestVerificationStackMentionChannels", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        mentionChannelIds: ["C0AFSG79T8D", "C2CCCCCCCCC"],
      });
      const t2 = Template.fromStack(stack2);
      t2.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: Match.objectLike({
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
    const nagStack = new VerificationStack(nagApp, "NagTestStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
      executionAgentArns: {
        "file-creator":
          "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/TestExecutionAgent",
      },
    });
    cdk.Aspects.of(nagApp).add(new AwsSolutionsChecks({ verbose: true }));
    const errors = Annotations.fromStack(nagStack).findError(
      "*",
      Match.stringLikeRegexp(".*")
    );
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_SIGNING_SECRET;
    expect(errors).toHaveLength(0);
  });
});
