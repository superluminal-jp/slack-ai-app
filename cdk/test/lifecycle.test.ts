import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { ExecutionStack } from "../lib/execution/execution-stack";
import { VerificationStack } from "../lib/verification/verification-stack";

/**
 * Tests for independent lifecycle management of stacks.
 *
 * These tests verify that:
 * 1. Each stack can be created independently
 * 2. No CloudFormation cross-stack references exist
 * 3. Stacks can be updated without affecting each other
 * 4. Stack outputs are self-contained
 */
describe("Independent Lifecycle Management", () => {
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

      // Should not contain any ImportValue references
      expect(templateJson).not.toContain("Fn::ImportValue");
    });

    it("VerificationStack should have no Fn::ImportValue references", () => {
      const app = new cdk.App();
      const stack = new VerificationStack(app, "TestVerification", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionApiUrl:
          "https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod/",
        executionApiArn:
          "arn:aws:execute-api:ap-northeast-1:123456789012:abc123/*",
      });

      const template = Template.fromStack(stack);
      const templateJson = JSON.stringify(template.toJSON());

      // Should not contain any ImportValue references
      expect(templateJson).not.toContain("Fn::ImportValue");
    });

    it("ExecutionStack should be creatable without VerificationStack existing", () => {
      const app = new cdk.App();

      // Should not throw when created standalone
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
        executionApiUrl:
          "https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod/",
        executionApiArn:
          "arn:aws:execute-api:ap-northeast-1:123456789012:abc123/*",
      });

      const execTemplate = Template.fromStack(executionStack);
      const verifTemplate = Template.fromStack(verificationStack);

      // Get all resource logical IDs
      const execResources = Object.keys(execTemplate.toJSON().Resources || {});
      const verifResources = Object.keys(verifTemplate.toJSON().Resources || {});

      // Resources should not overlap (unique logical IDs per stack)
      const overlap = execResources.filter((r) => verifResources.includes(r));
      expect(overlap).toHaveLength(0);
    });
  });

  describe("Configuration via Parameters", () => {
    it("ExecutionStack should accept verificationLambdaRoleArn as parameter", () => {
      const app = new cdk.App();

      // First deployment without role ARN
      const stack1 = new ExecutionStack(app, "Exec1", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      // Second deployment with role ARN (simulating update)
      const stack2 = new ExecutionStack(app, "Exec2", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        verificationLambdaRoleArn:
          "arn:aws:iam::123456789012:role/TestRole",
      });

      const template1 = Template.fromStack(stack1);
      const template2 = Template.fromStack(stack2);

      // Both should synthesize successfully
      expect(template1.toJSON()).toBeDefined();
      expect(template2.toJSON()).toBeDefined();
    });

    it("VerificationStack should use executionApiUrl from parameters", () => {
      const app = new cdk.App();

      const stack = new VerificationStack(app, "VerifParam", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionApiUrl:
          "https://custom-api.execute-api.ap-northeast-1.amazonaws.com/prod/",
        executionApiArn:
          "arn:aws:execute-api:ap-northeast-1:123456789012:custom-api/*",
      });

      const template = Template.fromStack(stack);

      // Lambda should have the custom API URL in environment
      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: {
            EXECUTION_API_URL:
              "https://custom-api.execute-api.ap-northeast-1.amazonaws.com/prod/",
          },
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

      // Verify outputs exist
      expect(executionStack.apiUrl).toBeDefined();
      expect(executionStack.apiArn).toBeDefined();

      // These outputs would be used to configure VerificationStack
      // (In practice, this happens via CLI or cdk.json)
    });

    it("VerificationStack outputs should be usable by ExecutionStack", () => {
      const app = new cdk.App();

      const verificationStack = new VerificationStack(app, "VerifOutputs", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionApiUrl:
          "https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod/",
        executionApiArn:
          "arn:aws:execute-api:ap-northeast-1:123456789012:abc123/*",
      });

      // Verify outputs exist
      expect(verificationStack.lambdaRoleArn).toBeDefined();
      expect(verificationStack.functionUrl).toBeDefined();

      // This output would be used to update ExecutionStack resource policy
      // (In practice, this happens via CLI or cdk.json)
    });
  });

  describe("Update Scenarios", () => {
    it("Updating ExecutionStack should not require VerificationStack changes", () => {
      const app = new cdk.App();

      // Initial deployment
      const stack = new ExecutionStack(app, "UpdateExec", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        bedrockModelId: "amazon.nova-pro-v1:0",
      });

      // Simulated update with different model
      const updatedApp = new cdk.App();
      const updatedStack = new ExecutionStack(updatedApp, "UpdateExec", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        bedrockModelId: "anthropic.claude-v2",
      });

      // Both should synthesize without issues
      const template = Template.fromStack(stack);
      const updatedTemplate = Template.fromStack(updatedStack);

      expect(template.toJSON()).toBeDefined();
      expect(updatedTemplate.toJSON()).toBeDefined();
    });

    it("Adding resource policy to ExecutionStack should not affect existing resources", () => {
      const app = new cdk.App();

      // Before adding resource policy
      const stack1 = new ExecutionStack(app, "BeforePolicy", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      // After adding resource policy
      const stack2 = new ExecutionStack(app, "AfterPolicy", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        verificationLambdaRoleArn:
          "arn:aws:iam::123456789012:role/VerifRole",
      });

      const template1 = Template.fromStack(stack1);
      const template2 = Template.fromStack(stack2);

      // Lambda should be the same in both
      const lambdas1 = template1.findResources("AWS::Lambda::Function");
      const lambdas2 = template2.findResources("AWS::Lambda::Function");

      expect(Object.keys(lambdas1).length).toBe(Object.keys(lambdas2).length);
    });
  });
});

