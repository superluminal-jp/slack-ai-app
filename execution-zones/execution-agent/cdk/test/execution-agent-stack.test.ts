import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { REQUIRED_COST_ALLOCATION_TAG_KEYS } from "@slack-ai-app/cdk-tooling";
import { ExecutionAgentStack } from "../lib/execution-agent-stack";

describe("ExecutionAgentStack", () => {
  let app: cdk.App;
  let stack: ExecutionAgentStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new ExecutionAgentStack(app, "TestExecutionAgentStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });
    template = Template.fromStack(stack);
  });

  describe("A2A only (no legacy)", () => {
    it("must NOT contain API Gateway REST API", () => {
      const restApis = template.findResources("AWS::ApiGateway::RestApi");
      expect(Object.keys(restApis).length).toBe(0);
    });

    it("must have output ExecutionAgentRuntimeArn", () => {
      template.hasOutput("ExecutionAgentRuntimeArn", {
        Description: Match.stringLikeRegexp("Execution Agent.*Runtime ARN"),
      });
    });
  });

  describe("Execution Agent AgentCore Runtime", () => {
    it("should create AgentCore Runtime with A2A protocol", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        AgentRuntimeName: Match.stringLikeRegexp("SlackAI_ExecutionAgent"),
        ProtocolConfiguration: Match.anyValue(),
      });
    });

    it("should have cost allocation tags on AgentCore Runtime", () => {
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

  describe("Cross-account support", () => {
    it("should create stack with verificationAccountId", () => {
      const crossAccountApp = new cdk.App();
      const crossAccountStack = new ExecutionAgentStack(
        crossAccountApp,
        "CrossAccountExecutionAgentStack",
        {
          env: { account: "123456789012", region: "ap-northeast-1" },
          verificationAccountId: "987654321098",
        }
      );
      const crossAccountTemplate = Template.fromStack(crossAccountStack);
      crossAccountTemplate.hasOutput("ExecutionAgentRuntimeArn", {});
    });
  });
});
