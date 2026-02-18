import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DocsExecutionStack } from "../lib/docs-execution/docs-execution-stack";

describe("DocsExecutionStack", () => {
  it("creates Docs Agent runtime and output", () => {
    const app = new cdk.App();
    const stack = new DocsExecutionStack(app, "TestDocsExecutionStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
      AgentRuntimeName: "SlackAI_DocsAgent_Dev",
    });
    template.hasOutput("DocsAgentRuntimeArn", {});
  });
});
