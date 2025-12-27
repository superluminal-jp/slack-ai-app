import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ExecutionStack } from "../lib/execution-stack";

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

  describe("BedrockProcessor Lambda", () => {
    it("should create BedrockProcessor Lambda function", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "python3.11",
        Timeout: 60,
      });
    });

    it("should have Bedrock invoke permissions", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(["bedrock:InvokeModel"]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });
  });

  describe("API Gateway", () => {
    it("should create REST API with regional endpoint", () => {
      template.hasResourceProperties("AWS::ApiGateway::RestApi", {
        Name: "Execution Layer API",
        EndpointConfiguration: {
          Types: ["REGIONAL"],
        },
      });
    });

    it("should create /execute POST method with IAM auth", () => {
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "POST",
        AuthorizationType: "AWS_IAM",
      });
    });

    it("should have Lambda integration", () => {
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        Integration: {
          Type: "AWS_PROXY",
        },
      });
    });
  });

  describe("CloudWatch Alarms", () => {
    it("should create Bedrock API error alarm", () => {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmDescription: Match.stringLikeRegexp("Bedrock API errors"),
        Namespace: "BedrockProcessor",
        MetricName: "BedrockApiError",
      });
    });

    it("should create Lambda error alarm", () => {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmDescription: Match.stringLikeRegexp("BedrockProcessor Lambda errors"),
      });
    });
  });

  describe("Stack Outputs", () => {
    it("should output ExecutionApiUrl", () => {
      template.hasOutput("ExecutionApiUrl", {
        Description: Match.stringLikeRegexp("Execution API Gateway URL"),
      });
    });

    it("should output ExecutionApiArn", () => {
      template.hasOutput("ExecutionApiArn", {
        Description: Match.stringLikeRegexp("Execution API Gateway ARN"),
      });
    });

    it("should output BedrockProcessorArn", () => {
      template.hasOutput("BedrockProcessorArn", {
        Description: Match.stringLikeRegexp("BedrockProcessor Lambda ARN"),
      });
    });
  });

  describe("Cross-account support", () => {
    it("should add resource policy when verificationLambdaRoleArn is provided", () => {
      const crossAccountApp = new cdk.App();
      const crossAccountStack = new ExecutionStack(
        crossAccountApp,
        "CrossAccountExecutionStack",
        {
          env: { account: "123456789012", region: "ap-northeast-1" },
          verificationLambdaRoleArn:
            "arn:aws:iam::987654321098:role/VerificationLambdaRole",
          verificationAccountId: "987654321098",
        }
      );
      const crossAccountTemplate = Template.fromStack(crossAccountStack);

      // Should have resource policy allowing the verification role
      crossAccountTemplate.hasResourceProperties("AWS::ApiGateway::RestApi", {
        Policy: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: "execute-api:Invoke",
            }),
          ]),
        }),
      });
    });
  });
});

