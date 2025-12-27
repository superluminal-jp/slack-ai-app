import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ExecutionStack } from "../lib/execution-stack";
import { VerificationStack } from "../lib/verification-stack";

describe("Cross-Account IAM Authentication", () => {
  // Set required environment variables for all tests
  beforeAll(() => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
  });

  afterAll(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_SIGNING_SECRET;
  });

  describe("Same Account Deployment", () => {
    it("should allow Verification Lambda to invoke Execution API in same account", () => {
      const app = new cdk.App();

      // Create Execution Stack
      const executionStack = new ExecutionStack(app, "SameAccountExecution", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });

      // Create Verification Stack with Execution API URL
      const verificationStack = new VerificationStack(
        app,
        "SameAccountVerification",
        {
          env: { account: "123456789012", region: "ap-northeast-1" },
          executionApiUrl:
            "https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod/",
          executionApiArn:
            "arn:aws:execute-api:ap-northeast-1:123456789012:abc123/*",
        }
      );

      const verificationTemplate = Template.fromStack(verificationStack);

      // Verification Lambda should have execute-api:Invoke permission (wildcard resource)
      verificationTemplate.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "execute-api:Invoke",
              Effect: "Allow",
              Resource: "*", // Wildcard resource (access controlled by API Gateway resource policy)
            }),
          ]),
        },
      });
    });
  });

  describe("Cross-Account Deployment", () => {
    it("should configure resource policy for cross-account access", () => {
      const app = new cdk.App();

      // Execution Stack in Account B with Verification role from Account A
      const executionStack = new ExecutionStack(
        app,
        "CrossAccountExecution",
        {
          env: { account: "222222222222", region: "ap-northeast-1" },
          verificationLambdaRoleArn:
            "arn:aws:iam::111111111111:role/VerificationLambdaRole",
          verificationAccountId: "111111111111",
        }
      );

      const executionTemplate = Template.fromStack(executionStack);

      // API Gateway should have resource policy allowing cross-account access
      executionTemplate.hasResourceProperties("AWS::ApiGateway::RestApi", {
        Policy: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Principal: {
                AWS: "arn:aws:iam::111111111111:role/VerificationLambdaRole",
              },
              Action: "execute-api:Invoke",
            }),
          ]),
        }),
      });
    });

    it("should allow Verification Lambda to call cross-account API", () => {
      const app = new cdk.App();

      // Verification Stack in Account A calling API in Account B
      const verificationStack = new VerificationStack(
        app,
        "CrossAccountVerification",
        {
          env: { account: "111111111111", region: "ap-northeast-1" },
          executionApiUrl:
            "https://xyz789.execute-api.ap-northeast-1.amazonaws.com/prod/",
          executionApiArn:
            "arn:aws:execute-api:ap-northeast-1:222222222222:xyz789/*",
          executionAccountId: "222222222222",
        }
      );

      const verificationTemplate = Template.fromStack(verificationStack);

      // Verification Lambda should have cross-account execute-api:Invoke permission (wildcard resource)
      verificationTemplate.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "execute-api:Invoke",
              Effect: "Allow",
              Resource: "*", // Wildcard resource (access controlled by API Gateway resource policy)
            }),
          ]),
        },
      });
    });
  });

  describe("Resource Policy Enforcement", () => {
    it("should restrict API access to specific role ARN", () => {
      const app = new cdk.App();

      const executionStack = new ExecutionStack(app, "RestrictedExecution", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        verificationLambdaRoleArn:
          "arn:aws:iam::123456789012:role/SpecificRole",
      });

      const executionTemplate = Template.fromStack(executionStack);

      // Should have resource policy with specific principal
      executionTemplate.hasResourceProperties("AWS::ApiGateway::RestApi", {
        Policy: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                AWS: "arn:aws:iam::123456789012:role/SpecificRole",
              },
            }),
          ]),
        }),
      });
    });
  });

  describe("Stack Independence", () => {
    it("should create ExecutionStack without Verification configuration", () => {
      const app = new cdk.App();

      // Should not throw when created without verification config
      expect(() => {
        new ExecutionStack(app, "IndependentExecution", {
          env: { account: "123456789012", region: "ap-northeast-1" },
        });
      }).not.toThrow();
    });

    it("should create VerificationStack with required Execution config", () => {
      const app = new cdk.App();

      // Should create successfully with required props
      expect(() => {
        new VerificationStack(app, "IndependentVerification", {
          env: { account: "123456789012", region: "ap-northeast-1" },
          executionApiUrl:
            "https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod/",
          executionApiArn:
            "arn:aws:execute-api:ap-northeast-1:123456789012:abc123/*",
        });
      }).not.toThrow();
    });
  });

  describe("Outputs for Cross-Stack Configuration", () => {
    it("ExecutionStack should output values needed by VerificationStack", () => {
      const app = new cdk.App();
      const executionStack = new ExecutionStack(app, "OutputExecution", {
        env: { account: "123456789012", region: "ap-northeast-1" },
      });
      const template = Template.fromStack(executionStack);

      // Should have API URL output
      template.hasOutput("ExecutionApiUrl", {});

      // Should have API ARN output
      template.hasOutput("ExecutionApiArn", {});
    });

    it("VerificationStack should output values needed by ExecutionStack", () => {
      const app = new cdk.App();
      const verificationStack = new VerificationStack(
        app,
        "OutputVerification",
        {
          env: { account: "123456789012", region: "ap-northeast-1" },
          executionApiUrl:
            "https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod/",
          executionApiArn:
            "arn:aws:execute-api:ap-northeast-1:123456789012:abc123/*",
        }
      );
      const template = Template.fromStack(verificationStack);

      // Should have Lambda Role ARN output
      template.hasOutput("VerificationLambdaRoleArn", {});

      // Should have Function URL output
      template.hasOutput("SlackEventHandlerUrl", {});
    });
  });
});

