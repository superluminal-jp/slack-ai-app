/**
 * Unit tests for AgentCore Runtime CDK constructs.
 *
 * Tests:
 * - ExecutionAgentRuntime: A2A protocol, SigV4 auth, IAM roles, cross-account policy
 * - VerificationAgentRuntime: IAM roles, DynamoDB access, Secrets Manager, AgentCore invoke
 * - SlackEventHandler: USE_AGENTCORE feature flag environment variable and IAM permissions
 */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { ExecutionAgentRuntime } from "../lib/execution/constructs/execution-agent-runtime";
import { VerificationAgentRuntime } from "../lib/verification/constructs/verification-agent-runtime";
import { SlackEventHandler } from "../lib/verification/constructs/slack-event-handler";

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
        ProtocolConfiguration: {
          ServerProtocol: "A2A",
        },
      });
    });

    it("should configure SigV4 authentication", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        AuthorizerConfiguration: {
          AuthorizerType: "SIGV4",
        },
      });
    });

    it("should set PUBLIC network mode", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        NetworkConfiguration: {
          NetworkMode: "PUBLIC",
        },
      });
    });

    it("should create Runtime Endpoint", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::RuntimeEndpoint", {
        Name: "DEFAULT",
      });
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

    it("should create resource policy when verificationAccountId is provided", () => {
      new ExecutionAgentRuntime(stack, "ExecAgentWithPolicy", {
        agentRuntimeName: "test-with-policy",
        containerImageUri: "111111111111.dkr.ecr.ap-northeast-1.amazonaws.com/agent:latest",
        verificationAccountId: "222222222222",
      });
      template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::BedrockAgentCore::RuntimeResourcePolicy", {
        Policy: Match.stringLikeRegexp("222222222222"),
      });
    });

    it("should allow InvokeAgentRuntime in resource policy", () => {
      new ExecutionAgentRuntime(stack, "ExecAgentPolicy", {
        agentRuntimeName: "test-policy",
        containerImageUri: "111111111111.dkr.ecr.ap-northeast-1.amazonaws.com/agent:latest",
        verificationAccountId: "333333333333",
      });
      template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::BedrockAgentCore::RuntimeResourcePolicy", {
        Policy: Match.stringLikeRegexp("bedrock-agentcore:InvokeAgentRuntime"),
      });
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
        ProtocolConfiguration: {
          ServerProtocol: "A2A",
        },
      });
    });

    it("should configure SigV4 authentication", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        AuthorizerConfiguration: {
          AuthorizerType: "SIGV4",
        },
      });
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
    it("should scope AgentCore invoke to specific ARN when provided", () => {
      const executionArn =
        "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/exec-001";

      new VerificationAgentRuntime(stack, "VerifyAgentScoped", {
        ...testProps,
        executionAgentArn: executionArn,
      });
      template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "AgentCoreInvoke",
              Resource: executionArn,
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
      executionApiUrl: "https://abc.execute-api.ap-northeast-1.amazonaws.com/prod/",
    };
  });

  it("should set USE_AGENTCORE=false when useAgentCore is not provided", () => {
    new SlackEventHandler(stack, "Handler", baseProps);
    template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          USE_AGENTCORE: "false",
        }),
      },
    });
  });

  it("should set USE_AGENTCORE=true when useAgentCore is true", () => {
    new SlackEventHandler(stack, "Handler", {
      ...baseProps,
      useAgentCore: true,
      verificationAgentArn:
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/verify-001",
    });
    template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          USE_AGENTCORE: "true",
          VERIFICATION_AGENT_ARN: Match.stringLikeRegexp("bedrock-agentcore"),
        }),
      },
    });
  });

  it("should grant InvokeAgentRuntime when useAgentCore is true", () => {
    new SlackEventHandler(stack, "Handler", {
      ...baseProps,
      useAgentCore: true,
      verificationAgentArn:
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/verify-001",
    });
    template = Template.fromStack(stack);

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

  it("should NOT grant InvokeAgentRuntime when useAgentCore is false", () => {
    new SlackEventHandler(stack, "Handler", {
      ...baseProps,
      useAgentCore: false,
    });
    template = Template.fromStack(stack);

    // Should not have bedrock-agentcore policy
    const policies = template.findResources("AWS::IAM::Policy");
    const policyDocs = Object.values(policies).map(
      (p: any) => JSON.stringify(p.Properties?.PolicyDocument || {})
    );
    const hasAgentCorePolicy = policyDocs.some((doc) =>
      doc.includes("bedrock-agentcore:InvokeAgentRuntime")
    );
    expect(hasAgentCorePolicy).toBe(false);
  });

  it("should NOT set VERIFICATION_AGENT_ARN when not provided", () => {
    new SlackEventHandler(stack, "Handler", baseProps);
    template = Template.fromStack(stack);

    // Lambda env should NOT include VERIFICATION_AGENT_ARN
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          USE_AGENTCORE: "false",
        }),
      },
    });

    // Verify VERIFICATION_AGENT_ARN is absent by checking all Lambda functions
    const functions = template.findResources("AWS::Lambda::Function");
    for (const fn of Object.values(functions)) {
      const env = (fn as any).Properties?.Environment?.Variables || {};
      expect(env.VERIFICATION_AGENT_ARN).toBeUndefined();
    }
  });
});
