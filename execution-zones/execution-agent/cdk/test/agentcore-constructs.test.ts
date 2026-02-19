import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ExecutionAgentRuntime } from "../lib/constructs/execution-agent-runtime";

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
        ProtocolConfiguration: Match.anyValue(),
      });
    });

    it("should set PUBLIC network mode", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        NetworkConfiguration: { NetworkMode: "PUBLIC" },
      });
    });

    it("should not create RuntimeEndpoint in CFn (DEFAULT is auto-created by AgentCore)", () => {
      const resources = template.findResources("AWS::BedrockAgentCore::RuntimeEndpoint");
      expect(Object.keys(resources).length).toBe(0);
    });

    it("should create IAM execution role with bedrock-agentcore trust", () => {
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: { Service: "bedrock-agentcore.amazonaws.com" },
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
  });

  describe("Cross-Account Resource Policy", () => {
    it("should output ExecutionRuntimeArn and ExecutionEndpointArn when verificationAccountId is set", () => {
      new ExecutionAgentRuntime(stack, "ExecAgentPolicy", {
        agentRuntimeName: "test-policy",
        containerImageUri: "111111111111.dkr.ecr.ap-northeast-1.amazonaws.com/agent:latest",
        verificationAccountId: "333333333333",
      });
      template = Template.fromStack(stack);

      const outputs = template.findOutputs("*");
      expect(Object.keys(outputs).length).toBe(2);
    });
  });
});
