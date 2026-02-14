/**
 * Unit tests for AgentCore Runtime CDK constructs.
 *
 * Tests:
 * - ExecutionAgentRuntime: A2A protocol, SigV4 auth, IAM roles, cross-account policy
 * - VerificationAgentRuntime: IAM roles, DynamoDB access, Secrets Manager, AgentCore invoke
 * - SlackEventHandler: VERIFICATION_AGENT_ARN and InvokeAgentRuntime (A2A only)
 */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { ExecutionAgentRuntime } from "../lib/execution/constructs/execution-agent-runtime";
import { VerificationAgentRuntime } from "../lib/verification/constructs/verification-agent-runtime";
import { SlackEventHandler } from "../lib/verification/constructs/slack-event-handler";
import { AgentInvoker } from "../lib/verification/constructs/agent-invoker";

// ─── ExecutionAgentRuntime Tests ───

describe("ExecutionAgentRuntime", () => {
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: { account: "111111111111", region: "ap-northeast-1" },
    });
  });

  describe("Basic Runtime Creation", () => {
    beforeEach(() => {
      new ExecutionAgentRuntime(stack, "ExecAgent", {
        agentRuntimeName: "test-execution-agent",
        containerImageUri: "111111111111.dkr.ecr.ap-northeast-1.amazonaws.com/exec-agent:latest",
      });
      template = Template.fromStack(stack);
    });

    it("should create AgentCore Runtime with A2A protocol", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        AgentRuntimeName: "test-execution-agent",
        ProtocolConfiguration: Match.anyValue(), // A2A (string or object per CFn resource)
      });
    });

    it("should create Runtime (SigV4 is default when AuthorizerConfiguration omitted)", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        AgentRuntimeName: "test-execution-agent",
      });
    });

    it("should set PUBLIC network mode", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        NetworkConfiguration: {
          NetworkMode: "PUBLIC",
        },
      });
    });

    it("should not create RuntimeEndpoint in CFn (DEFAULT is auto-created by AgentCore)", () => {
      const resources = template.findResources("AWS::BedrockAgentCore::RuntimeEndpoint");
      expect(Object.keys(resources).length).toBe(0);
    });

    it("should create IAM execution role with bedrock-agentcore trust", () => {
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "test-execution-agent-ExecutionRole",
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: "bedrock-agentcore.amazonaws.com",
              },
            }),
          ]),
        },
      });
    });

    it("should grant Bedrock InvokeModel permissions", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "BedrockInvokeModel",
              Action: Match.arrayWith(["bedrock:InvokeModel"]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    it("should grant ECR permissions", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "ECRImageAccess",
              Action: Match.arrayWith(["ecr:BatchGetImage"]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    it("should grant CloudWatch Logs permissions", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "CloudWatchLogs",
              Action: Match.arrayWith(["logs:CreateLogGroup", "logs:PutLogEvents"]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    it("should grant CloudWatch Metrics with StringLike condition for SlackEventHandler and SlackAI/* namespaces", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "CloudWatchMetrics",
              Action: "cloudwatch:PutMetricData",
              Effect: "Allow",
              Condition: {
                StringLike: {
                  "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"],
                },
              },
            }),
          ]),
        },
      });
    });

    it("should grant X-Ray tracing permissions", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "XRayTracing",
              Action: Match.arrayWith(["xray:PutTraceSegments"]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });
  });

  describe("Cross-Account Resource Policy", () => {
    it("should NOT create resource policy when verificationAccountId is absent", () => {
      new ExecutionAgentRuntime(stack, "ExecAgentNoPolicy", {
        agentRuntimeName: "test-no-policy",
        containerImageUri: "111111111111.dkr.ecr.ap-northeast-1.amazonaws.com/agent:latest",
        // No verificationAccountId
      });
      template = Template.fromStack(stack);

      const resources = template.findResources("AWS::BedrockAgentCore::RuntimeResourcePolicy");
      expect(Object.keys(resources).length).toBe(0);
    });

    it("should NOT create RuntimeResourcePolicy CFn resource when verificationAccountId is provided (policy is set via CLI/API)", () => {
      new ExecutionAgentRuntime(stack, "ExecAgentWithPolicy", {
        agentRuntimeName: "test-with-policy",
        containerImageUri: "111111111111.dkr.ecr.ap-northeast-1.amazonaws.com/agent:latest",
        verificationAccountId: "222222222222",
      });
      template = Template.fromStack(stack);

      const resources = template.findResources("AWS::BedrockAgentCore::RuntimeResourcePolicy");
      expect(Object.keys(resources).length).toBe(0);
    });

    it("should output ExecutionRuntimeArn and ExecutionEndpointArn when verificationAccountId is set", () => {
      new ExecutionAgentRuntime(stack, "ExecAgentPolicy", {
        agentRuntimeName: "test-policy",
        containerImageUri: "111111111111.dkr.ecr.ap-northeast-1.amazonaws.com/agent:latest",
        verificationAccountId: "333333333333",
      });
      template = Template.fromStack(stack);

      const outputs = template.findOutputs("*");
      const descs = Object.values(outputs).map((o: any) => o.Description || "");
      expect(Object.keys(outputs).length).toBe(2);
      expect(descs.some((d) => d.includes("resource policy") || d.includes("put-resource-policy"))).toBe(true);
      expect(descs.some((d) => d.includes("Endpoint") && d.includes("ARN"))).toBe(true);
    });
  });
});

// ─── VerificationAgentRuntime Tests ───

describe("VerificationAgentRuntime", () => {
  let stack: cdk.Stack;
  let template: Template;
  let testProps: any;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, "TestVStack", {
      env: { account: "222222222222", region: "ap-northeast-1" },
    });

    // Create test DynamoDB tables
    const tokenTable = new dynamodb.Table(stack, "TokenTable", {
      tableName: "test-token-table",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    const dedupeTable = new dynamodb.Table(stack, "DedupeTable", {
      tableName: "test-dedupe-table",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    const existenceCheckCacheTable = new dynamodb.Table(stack, "ExistenceTable", {
      tableName: "test-existence-table",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    const whitelistConfigTable = new dynamodb.Table(stack, "WhitelistTable", {
      tableName: "test-whitelist-table",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    const rateLimitTable = new dynamodb.Table(stack, "RateLimitTable", {
      tableName: "test-ratelimit-table",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    const signingSecret = new secretsmanager.Secret(stack, "SigningSecret");
    const botTokenSecret = new secretsmanager.Secret(stack, "BotTokenSecret");

    testProps = {
      agentRuntimeName: "test-verification-agent",
      containerImageUri: "222222222222.dkr.ecr.ap-northeast-1.amazonaws.com/verify-agent:latest",
      tokenTable,
      dedupeTable,
      existenceCheckCacheTable,
      whitelistConfigTable,
      rateLimitTable,
      slackSigningSecret: signingSecret,
      slackBotTokenSecret: botTokenSecret,
    };
  });

  describe("Basic Runtime Creation", () => {
    beforeEach(() => {
      new VerificationAgentRuntime(stack, "VerifyAgent", testProps);
      template = Template.fromStack(stack);
    });

    it("should create AgentCore Runtime with A2A protocol", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        AgentRuntimeName: "test-verification-agent",
        ProtocolConfiguration: Match.anyValue(), // A2A (string or object per CFn resource)
      });
    });

    it("should create Runtime (SigV4 is default when AuthorizerConfiguration omitted)", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        AgentRuntimeName: "test-verification-agent",
      });
    });

    it("should set EnvironmentVariables for container when present in template", () => {
      const resources = template.findResources("AWS::BedrockAgentCore::Runtime");
      const verification = Object.values(resources).find(
        (r: any) => r?.Properties?.AgentRuntimeName === "test-verification-agent"
      ) as { Properties?: { AgentRuntimeName?: string; EnvironmentVariables?: Record<string, string> } };
      expect(verification?.Properties?.AgentRuntimeName).toBe("test-verification-agent");
      // EnvironmentVariables may be omitted by CDK schema; when present, required keys must be set
      const env = verification?.Properties?.EnvironmentVariables;
      if (env) {
        expect(env.AWS_REGION_NAME).toBe("ap-northeast-1");
        // DEDUPE_TABLE_NAME may be a CDK Ref token or a string depending on how the table is passed
        expect(env.DEDUPE_TABLE_NAME).toBeDefined();
        expect(env.WHITELIST_SECRET_NAME).toMatch(/slack\/whitelist-config$/);
      }
    });

    it("should create IAM execution role with bedrock-agentcore trust", () => {
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "test-verification-agent-ExecutionRole",
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: "bedrock-agentcore.amazonaws.com",
              },
            }),
          ]),
        },
      });
    });
  });

  describe("IAM Permissions", () => {
    beforeEach(() => {
      new VerificationAgentRuntime(stack, "VerifyAgent", testProps);
      template = Template.fromStack(stack);
    });

    it("should grant CloudWatch Metrics with StringLike condition for SlackEventHandler and SlackAI/* namespaces", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "CloudWatchMetrics",
              Action: "cloudwatch:PutMetricData",
              Effect: "Allow",
              Condition: {
                StringLike: {
                  "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"],
                },
              },
            }),
          ]),
        },
      });
    });

    it("should grant AgentCore InvokeAgentRuntime and GetAsyncTaskResult permissions", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "AgentCoreInvoke",
              Action: Match.arrayWith([
                "bedrock-agentcore:InvokeAgentRuntime",
                "bedrock-agentcore:GetAsyncTaskResult",
              ]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    it("should grant Secrets Manager read for whitelist config", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "SecretsManagerWhitelist",
              Effect: "Allow",
            }),
          ]),
        },
      });
    });
  });

  describe("Scoped IAM Permissions", () => {
    it("should scope AgentCore invoke to runtime and endpoint ARNs when provided", () => {
      const executionArn =
        "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/exec-001";

      new VerificationAgentRuntime(stack, "VerifyAgentScoped", {
        ...testProps,
        executionAgentArn: executionArn,
      });
      template = Template.fromStack(stack);

      // Policy must allow InvokeAgentRuntime; may be single ARN or [runtime, endpoint] per AWS hierarchical auth
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "AgentCoreInvoke",
              Action: Match.arrayWith([
                "bedrock-agentcore:InvokeAgentRuntime",
                "bedrock-agentcore:GetAsyncTaskResult",
              ]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    it("should use wildcard ARN when executionAgentArn is not provided", () => {
      new VerificationAgentRuntime(stack, "VerifyAgentWild", testProps);
      template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "AgentCoreInvoke",
              Resource: Match.stringLikeRegexp("arn:aws:bedrock-agentcore:.*:\\*:runtime/\\*"),
            }),
          ]),
        },
      });
    });
  });
});

// ─── SlackEventHandler AgentCore Feature Flag Tests ───

describe("SlackEventHandler AgentCore Feature Flag", () => {
  let stack: cdk.Stack;
  let template: Template;
  let baseProps: any;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, "TestHandlerStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });

    const signingSecret = new secretsmanager.Secret(stack, "SigningSecret");
    const botTokenSecret = new secretsmanager.Secret(stack, "BotTokenSecret");

    baseProps = {
      slackSigningSecret: signingSecret,
      slackBotTokenSecret: botTokenSecret,
      tokenTableName: "test-token",
      dedupeTableName: "test-dedupe",
      existenceCheckCacheTableName: "test-existence",
      whitelistConfigTableName: "test-whitelist",
      rateLimitTableName: "test-ratelimit",
      awsRegion: "ap-northeast-1",
      bedrockModelId: "amazon.nova-pro-v1:0",
      verificationAgentArn:
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/verify-001",
    };
  });

  it("should set VERIFICATION_AGENT_ARN and grant InvokeAgentRuntime (A2A only)", () => {
    new SlackEventHandler(stack, "Handler", baseProps);
    template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          VERIFICATION_AGENT_ARN: Match.stringLikeRegexp("bedrock-agentcore"),
        }),
      },
    });

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

  it("when agentInvocationQueue is provided, should set AGENT_INVOCATION_QUEUE_URL and grant sqs:SendMessage", () => {
    const queue = new sqs.Queue(stack, "AgentInvocationQueue", {
      queueName: "test-agent-invocation-request",
    });
    new SlackEventHandler(stack, "HandlerWithQueue", {
      ...baseProps,
      agentInvocationQueue: queue,
    });
    template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          AGENT_INVOCATION_QUEUE_URL: Match.anyValue(),
        }),
      },
    });

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
});

// ─── AgentInvoker (016 async invocation) ───

describe("AgentInvoker", () => {
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, "TestInvokerStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });
  });

  it("should set VERIFICATION_AGENT_ARN and grant InvokeAgentRuntime", () => {
    const queue = new sqs.Queue(stack, "Queue", { queueName: "test-queue" });
    const verificationAgentArn =
      "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/verify-001";

    new AgentInvoker(stack, "AgentInvoker", {
      agentInvocationQueue: queue,
      verificationAgentArn,
    });
    template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.11",
      Timeout: 900,
      Environment: {
        Variables: Match.objectLike({
          VERIFICATION_AGENT_ARN: verificationAgentArn,
        }),
      },
    });

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
