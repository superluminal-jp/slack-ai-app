import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { VerificationStack } from "../lib/verification/verification-stack";

describe("VerificationStack", () => {
  let app: cdk.App;
  let stack: VerificationStack;
  let template: Template;

  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    process.env.SLACK_SIGNING_SECRET = "test-signing-secret";

    app = new cdk.App();
    stack = new VerificationStack(app, "TestVerificationStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
      executionAgentArn:
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/TestExecutionAgent",
    });
    template = Template.fromStack(stack);
  });

  afterEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_SIGNING_SECRET;
  });

  describe("A2A only (no legacy)", () => {
    it("must NOT contain ExecutionResponseQueue SQS queue", () => {
      const queues = template.findResources("AWS::SQS::Queue");
      const executionResponseQueue = Object.entries(queues).find(
        ([_, res]) =>
          (res as { Properties?: { QueueName?: string } }).Properties?.QueueName?.includes?.(
            "execution-response"
          )
      );
      expect(executionResponseQueue).toBeUndefined();
    });

    it("must NOT contain SlackResponseHandler Lambda", () => {
      const lambdas = template.findResources("AWS::Lambda::Function");
      const slackResponseHandler = Object.entries(lambdas).find(
        ([logicalId]) => logicalId.includes("SlackResponseHandler")
      );
      expect(slackResponseHandler).toBeUndefined();
    });

    it("must NOT have outputs ExecutionResponseQueueUrl, ExecutionResponseQueueArn", () => {
      expect(template.toJSON().Outputs?.ExecutionResponseQueueUrl).toBeUndefined();
      expect(template.toJSON().Outputs?.ExecutionResponseQueueArn).toBeUndefined();
    });
  });

  describe("016 async invocation (SQS + Agent Invoker)", () => {
    it("must contain SQS queue for agent-invocation-request", () => {
      const queues = template.findResources("AWS::SQS::Queue");
      const mainQueue = Object.entries(queues).find(
        ([_, res]) =>
          (res as { Properties?: { QueueName?: string } }).Properties?.QueueName?.includes?.(
            "agent-invocation-request"
          )
      );
      expect(mainQueue).toBeDefined();
    });

    it("must contain Lambda function for Agent Invoker", () => {
      const lambdas = template.findResources("AWS::Lambda::Function");
      const agentInvoker = Object.entries(lambdas).find(
        ([logicalId]) =>
          logicalId.includes("AgentInvoker") && !logicalId.includes("SlackEventHandler")
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
      const hasInvokerWithAgentCore = Object.values(policies).some(
        (res) => {
          const doc = (res as { Properties?: { PolicyDocument?: { Statement?: unknown[] } } })
            .Properties?.PolicyDocument;
          const stmts = doc?.Statement ?? [];
          return stmts.some(
            (s: unknown) =>
              typeof s === "object" &&
              s !== null &&
              "Action" in s &&
              (Array.isArray((s as { Action: unknown }).Action)
                ? (s as { Action: string[] }).Action.includes("bedrock-agentcore:InvokeAgentRuntime")
                : (s as { Action: string }).Action === "bedrock-agentcore:InvokeAgentRuntime")
          );
        }
      );
      expect(hasInvokerWithAgentCore).toBe(true);
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

    it("should not have VALIDATION_ZONE_ECHO_MODE when not provided", () => {
      const lambdas = template.findResources("AWS::Lambda::Function");
      const slackHandler = Object.entries(lambdas).find(([logicalId]) =>
        logicalId.includes("SlackEventHandler")
      );
      expect(slackHandler).toBeDefined();
      const env = (slackHandler![1] as { Properties?: { Environment?: { Variables?: Record<string, string> } } })
        .Properties?.Environment?.Variables ?? {};
      expect(env.VALIDATION_ZONE_ECHO_MODE).toBeUndefined();
    });

    it("should have Function URL enabled", () => {
      template.hasResourceProperties("AWS::Lambda::Url", {
        AuthType: "NONE",
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

  describe("017 Validation Zone Echo mode", () => {
    it("should set VALIDATION_ZONE_ECHO_MODE when validationZoneEchoMode is true", () => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
      process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
      const appWithEcho = new cdk.App();
      const stackWithEcho = new VerificationStack(appWithEcho, "VerificationStackWithEcho", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionAgentArn:
          "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/TestExecutionAgent",
        validationZoneEchoMode: true,
      });
      const templateEcho = Template.fromStack(stackWithEcho);
      templateEcho.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: expect.objectContaining({
            VALIDATION_ZONE_ECHO_MODE: "true",
          }),
        },
      });
      delete process.env.SLACK_BOT_TOKEN;
      delete process.env.SLACK_SIGNING_SECRET;
    });
  });

  describe("Stack Outputs", () => {
    it("should output SlackEventHandlerUrl", () => {
      template.hasOutput("SlackEventHandlerUrl", {
        Description: Match.stringLikeRegexp("Slack Event Handler Function URL"),
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
});
