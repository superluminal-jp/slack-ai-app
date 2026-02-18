import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { TimeExecutionStack } from "../lib/time-execution/time-execution-stack";

describe("TimeExecutionStack", () => {
  it("creates Time Agent runtime and output", () => {
    const app = new cdk.App();
    const stack = new TimeExecutionStack(app, "TestTimeExecutionStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
      AgentRuntimeName: "SlackAI_TimeAgent_Dev",
    });
    template.hasOutput("TimeAgentRuntimeArn", {});
  });
});
