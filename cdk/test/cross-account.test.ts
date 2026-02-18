import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ExecutionStack } from "../lib/execution/execution-stack";
import { VerificationStack } from "../lib/verification/verification-stack";

describe("Cross-Account IAM Authentication (A2A)", () => {
  beforeAll(() => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
  });

  afterAll(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_SIGNING_SECRET;
  });

  describe("Same Account Deployment", () => {
    it("should allow Verification Stack to reference Execution Agent ARN in same account", () => {
      const app = new cdk.App();

      const executionStack = new ExecutionStack(app, "SameAccountExecution", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      const verificationStack = new VerificationStack(
        app,
        "SameAccountVerification",
        {
          env: { account: "123456789012", region: "ap-northeast-1" },
          executionAgentArns: { "file-creator": executionStack.executionAgentArn },
        }
      );

      const verificationTemplate = Template.fromStack(verificationStack);

      // Verification Lambda should have bedrock-agentcore InvokeAgentRuntime (A2A)
      verificationTemplate.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
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
  });

  describe("Cross-Account Deployment", () => {
    it("should create Execution Stack with verificationAccountId for cross-account", () => {
      const app = new cdk.App();

      const executionStack = new ExecutionStack(app, "CrossAccountExecution", {
        env: { account: "222222222222", region: "ap-northeast-1" },
        verificationAccountId: "111111111111",
      });

      const executionTemplate = Template.fromStack(executionStack);

      // Execution stack should output ExecutionAgentRuntimeArn for cross-account config
      executionTemplate.hasOutput("ExecutionAgentRuntimeArn", {});
    });

    it("should allow Verification Stack to use executionAgentArn for cross-account", () => {
      const app = new cdk.App();

      const verificationStack = new VerificationStack(
        app,
        "CrossAccountVerification",
        {
          env: { account: "111111111111", region: "ap-northeast-1" },
          executionAgentArns: {
            "file-creator":
              "arn:aws:bedrock-agentcore:ap-northeast-1:222222222222:runtime/exec-agent",
          },
          executionAccountId: "222222222222",
        }
      );

      const verificationTemplate = Template.fromStack(verificationStack);

      verificationTemplate.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
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
  });

  describe("Stack Independence", () => {
    it("should create ExecutionStack without Verification configuration", () => {
      const app = new cdk.App();

      expect(() => {
        new ExecutionStack(app, "IndependentExecution", {
          env: { account: "123456789012", region: "ap-northeast-1" },
        });
      }).not.toThrow();
    });

    it("should create VerificationStack with executionAgentArn", () => {
      const app = new cdk.App();

      expect(() => {
        new VerificationStack(app, "IndependentVerification", {
          env: { account: "123456789012", region: "ap-northeast-1" },
          executionAgentArns: {
            "file-creator":
              "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/exec",
          },
        });
      }).not.toThrow();
    });
  });

  describe("Outputs for Cross-Stack Configuration", () => {
    it("ExecutionStack should output ExecutionAgentRuntimeArn", () => {
      const app = new cdk.App();
      const executionStack = new ExecutionStack(app, "OutputExecution", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });
      const template = Template.fromStack(executionStack);

      template.hasOutput("ExecutionAgentRuntimeArn", {});
    });

    it("VerificationStack should output SlackEventHandlerUrl and LambdaRoleArn", () => {
      const app = new cdk.App();
      const verificationStack = new VerificationStack(app, "OutputVerification", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionAgentArns: {
          "file-creator":
            "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/exec",
        },
      });
      const template = Template.fromStack(verificationStack);

      template.hasOutput("VerificationLambdaRoleArn", {});
      template.hasOutput("SlackEventHandlerUrl", {});
    });
  });
});
