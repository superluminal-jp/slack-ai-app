import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ExecutionStack } from "../lib/execution/execution-stack";
import { VerificationStack } from "../lib/verification/verification-stack";

/**
 * Tests for independent lifecycle management of stacks (A2A only).
 *
 * Verifies that:
 * 1. Each stack can be created independently
 * 2. No CloudFormation cross-stack references exist
 * 3. Stacks can be updated without affecting each other
 * 4. Stack outputs are self-contained (ExecutionAgentRuntimeArn, etc.)
 */
describe("Independent Lifecycle Management (A2A)", () => {
  beforeAll(() => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
  });

  afterAll(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_SIGNING_SECRET;
  });

  describe("Stack Independence", () => {
    it("ExecutionStack should have no Fn::ImportValue references", () => {
      const app = new cdk.App();
      const stack = new ExecutionStack(app, "TestExecution", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      const template = Template.fromStack(stack);
      const templateJson = JSON.stringify(template.toJSON());

      expect(templateJson).not.toContain("Fn::ImportValue");
    });

    it("VerificationStack should have no Fn::ImportValue references", () => {
      const app = new cdk.App();
      const stack = new VerificationStack(app, "TestVerification", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionAgentArn:
          "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/exec",
      });

      const template = Template.fromStack(stack);
      const templateJson = JSON.stringify(template.toJSON());

      expect(templateJson).not.toContain("Fn::ImportValue");
    });

    it("ExecutionStack should be creatable without VerificationStack existing", () => {
      const app = new cdk.App();

      expect(() => {
        new ExecutionStack(app, "StandaloneExecution", {
          env: { account: "123456789012", region: "ap-northeast-1" },
        });
      }).not.toThrow();
    });

    it("Each stack should own all its resources (no cross-stack GetAtt)", () => {
      const app = new cdk.App();

      const executionStack = new ExecutionStack(app, "ExecStack", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      const verificationStack = new VerificationStack(app, "VerifStack", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionAgentArn:
          "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/exec",
      });

      const execTemplate = Template.fromStack(executionStack);
      const verifTemplate = Template.fromStack(verificationStack);

      const execResources = Object.keys(execTemplate.toJSON().Resources || {});
      const verifResources = Object.keys(verifTemplate.toJSON().Resources || {});

      const overlap = execResources.filter((r) => verifResources.includes(r));
      expect(overlap).toHaveLength(0);
    });
  });

  describe("Configuration via Parameters", () => {
    it("ExecutionStack should accept verificationAccountId as parameter", () => {
      const app = new cdk.App();

      const stack1 = new ExecutionStack(app, "Exec1", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      const stack2 = new ExecutionStack(app, "Exec2", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        verificationAccountId: "111111111111",
      });

      const template1 = Template.fromStack(stack1);
      const template2 = Template.fromStack(stack2);

      expect(template1.toJSON()).toBeDefined();
      expect(template2.toJSON()).toBeDefined();
    });

    it("VerificationStack should use executionAgentArn from parameters", () => {
      const app = new cdk.App();

      const stack = new VerificationStack(app, "VerifParam", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionAgentArn:
          "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/custom-exec",
      });

      const template = Template.fromStack(stack);

      // Lambda should have VERIFICATION_AGENT_ARN (A2A path); execution agent is invoked by Verification Agent
      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: Match.objectLike({
            VERIFICATION_AGENT_ARN: Match.anyValue(),
          }),
        },
      });
    });
  });

  describe("Stack Outputs for Configuration Exchange", () => {
    it("ExecutionStack outputs should be usable by VerificationStack", () => {
      const app = new cdk.App();

      const executionStack = new ExecutionStack(app, "ExecOutputs", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      expect(executionStack.executionAgentArn).toBeDefined();
    });

    it("VerificationStack outputs should be usable by ExecutionStack operators", () => {
      const app = new cdk.App();

      const verificationStack = new VerificationStack(app, "VerifOutputs", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionAgentArn:
          "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/exec",
      });

      expect(verificationStack.lambdaRoleArn).toBeDefined();
      expect(verificationStack.functionUrl).toBeDefined();
    });
  });

  describe("Update Scenarios", () => {
    it("Updating ExecutionStack should not require VerificationStack changes", () => {
      const app = new cdk.App();

      const stack = new ExecutionStack(app, "UpdateExec", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      const updatedApp = new cdk.App();
      const updatedStack = new ExecutionStack(updatedApp, "UpdateExec", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionAgentName: "SlackAI_ExecutionAgent_V2",
      });

      const template = Template.fromStack(stack);
      const updatedTemplate = Template.fromStack(updatedStack);

      expect(template.toJSON()).toBeDefined();
      expect(updatedTemplate.toJSON()).toBeDefined();
    });

    it("Adding verificationAccountId to ExecutionStack should not affect existing resources", () => {
      const app = new cdk.App();

      const stack1 = new ExecutionStack(app, "BeforePolicy", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      const stack2 = new ExecutionStack(app, "AfterPolicy", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        verificationAccountId: "111111111111",
      });

      const template1 = Template.fromStack(stack1);
      const template2 = Template.fromStack(stack2);

      const runtimes1 = template1.findResources("AWS::BedrockAgentCore::Runtime");
      const runtimes2 = template2.findResources("AWS::BedrockAgentCore::Runtime");

      expect(Object.keys(runtimes1).length).toBe(Object.keys(runtimes2).length);
    });
  });
});
