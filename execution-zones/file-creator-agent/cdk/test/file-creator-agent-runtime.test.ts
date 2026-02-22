import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { FileCreatorAgentRuntime } from "../lib/constructs/file-creator-agent-runtime";

describe("FileCreatorAgentRuntime", () => {
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
      new FileCreatorAgentRuntime(stack, "FileCreatorAgent", {
        agentRuntimeName: "test-file-creator-agent",
        containerImageUri: "111111111111.dkr.ecr.ap-northeast-1.amazonaws.com/file-creator-agent:latest",
      });
      template = Template.fromStack(stack);
    });

    it("should create AgentCore Runtime with A2A protocol", () => {
      template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
        AgentRuntimeName: "test-file-creator-agent",
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
    it("should output FileCreatorRuntimeArn and FileCreatorEndpointArn when verificationAccountId is set", () => {
      new FileCreatorAgentRuntime(stack, "FileCreatorAgentPolicy", {
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
