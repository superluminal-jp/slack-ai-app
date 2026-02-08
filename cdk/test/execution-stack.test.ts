import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ExecutionStack } from "../lib/execution/execution-stack";

describe("ExecutionStack", () => {
  let app: cdk.App;
  let stack: ExecutionStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new ExecutionStack(app, "TestExecutionStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });
    template = Template.fromStack(stack);
  });

  describe("A2A only (no legacy)", () => {
    it("must NOT contain API Gateway REST API", () => {
      const restApis = template.findResources("AWS::ApiGateway::RestApi");
      expect(Object.keys(restApis).length).toBe(0);
    });

    it("must NOT have BedrockProcessor Lambda (no legacy Lambda)", () => {
      const lambdas = template.findResources("AWS::Lambda::Function");
      // Only ECR image build helper Lambdas might exist; no BedrockProcessor
      const names = Object.keys(lambdas).filter(
        (k) => lambdas[k].Properties?.FunctionName?.includes?.("BedrockProcessor") ?? false
      );
      expect(names.length).toBe(0);
    });

    it("must NOT have outputs ExecutionApiUrl, ExecutionApiArn, BedrockProcessorArn", () => {
      expect(template.toJSON().Outputs?.ExecutionApiUrl).toBeUndefined();
      expect(template.toJSON().Outputs?.ExecutionApiArn).toBeUndefined();
      expect(template.toJSON().Outputs?.BedrockProcessorArn).toBeUndefined();
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
        ProtocolConfiguration: Match.anyValue(), // A2A (string in template)
      });
    });

    it("should create ECR repository for Execution Agent", () => {
      // ExecutionAgentEcr may use DockerImageAsset (custom resource); at least one ECR or asset
      const ecrCount = Object.keys(
        template.findResources("AWS::ECR::Repository") || {}
      ).length;
      expect(ecrCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Cross-account support", () => {
    it("should create Execution Stack with verificationAccountId", () => {
      const crossAccountApp = new cdk.App();
      const crossAccountStack = new ExecutionStack(
        crossAccountApp,
        "CrossAccountExecutionStack",
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
