import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { VerificationStack } from "../lib/verification-stack";

describe("VerificationStack", () => {
  let app: cdk.App;
  let stack: VerificationStack;
  let template: Template;

  beforeEach(() => {
    // Set required environment variables
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    process.env.SLACK_SIGNING_SECRET = "test-signing-secret";

    app = new cdk.App();
    stack = new VerificationStack(app, "TestVerificationStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
      executionApiUrl:
        "https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod/",
      executionApiArn:
        "arn:aws:execute-api:ap-northeast-1:123456789012:abc123/*",
    });
    template = Template.fromStack(stack);
  });

  afterEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_SIGNING_SECRET;
  });

  describe("SlackEventHandler Lambda", () => {
    it("should create SlackEventHandler Lambda function", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "python3.11",
        Timeout: 10,
      });
    });

    it("should have Function URL enabled", () => {
      template.hasResourceProperties("AWS::Lambda::Url", {
        AuthType: "NONE",
      });
    });

    it("should have execute-api:Invoke permission for Execution API", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "execute-api:Invoke",
              Effect: "Allow",
              Resource:
                "arn:aws:execute-api:ap-northeast-1:123456789012:abc123/*",
            }),
          ]),
        },
      });
    });
  });

  describe("DynamoDB Tables", () => {
    it("should create 5 DynamoDB tables", () => {
      const tables = template.findResources("AWS::DynamoDB::Table");
      expect(Object.keys(tables).length).toBe(5);
    });

    it("should create tables with PAY_PER_REQUEST billing", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        BillingMode: "PAY_PER_REQUEST",
      });
    });

    it("should create tables with SSE enabled", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });

    it("should create event dedupe table with TTL", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "slack-event-dedupe",
        TimeToLiveSpecification: {
          AttributeName: "ttl",
          Enabled: true,
        },
      });
    });
  });

  describe("Secrets Manager", () => {
    it("should create Slack signing secret", () => {
      template.hasResourceProperties("AWS::SecretsManager::Secret", {
        Description: "Slack app signing secret for request verification",
      });
    });

    it("should create Slack bot token secret", () => {
      template.hasResourceProperties("AWS::SecretsManager::Secret", {
        Description: "Slack bot OAuth token",
      });
    });
  });

  describe("CloudWatch Alarms", () => {
    it("should create whitelist authorization failure alarm", () => {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmDescription: Match.stringLikeRegexp(
          "whitelist authorization failures"
        ),
        Namespace: "SlackEventHandler",
        MetricName: "WhitelistAuthorizationFailed",
      });
    });

    it("should create existence check failure alarm", () => {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmDescription: Match.stringLikeRegexp("Existence Check failures"),
        Namespace: "SlackEventHandler",
        MetricName: "ExistenceCheckFailed",
      });
    });

    it("should create rate limit exceeded alarm", () => {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmDescription: Match.stringLikeRegexp("rate limit exceeded"),
        Namespace: "SlackEventHandler",
        MetricName: "RateLimitExceeded",
      });
    });
  });

  describe("Stack Outputs", () => {
    it("should output SlackEventHandlerUrl", () => {
      template.hasOutput("SlackEventHandlerUrl", {
        Description: Match.stringLikeRegexp("Slack Event Handler Function URL"),
      });
    });

    it("should output VerificationLambdaRoleArn", () => {
      template.hasOutput("VerificationLambdaRoleArn", {
        Description: Match.stringLikeRegexp("Verification Lambda Role ARN"),
      });
    });

    it("should output SlackEventHandlerArn", () => {
      template.hasOutput("SlackEventHandlerArn", {
        Description: Match.stringLikeRegexp("SlackEventHandler Lambda ARN"),
      });
    });
  });

  describe("Required props validation", () => {
    it("should throw error when executionApiUrl is missing", () => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
      process.env.SLACK_SIGNING_SECRET = "test-signing-secret";

      const testApp = new cdk.App();
      expect(() => {
        new VerificationStack(testApp, "MissingApiUrlStack", {
          env: { account: "123456789012", region: "ap-northeast-1" },
          executionApiUrl: "",
          executionApiArn:
            "arn:aws:execute-api:ap-northeast-1:123456789012:abc123/*",
        });
      }).toThrow("executionApiUrl is required");
    });

    it("should throw error when executionApiArn is missing", () => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
      process.env.SLACK_SIGNING_SECRET = "test-signing-secret";

      const testApp = new cdk.App();
      expect(() => {
        new VerificationStack(testApp, "MissingApiArnStack", {
          env: { account: "123456789012", region: "ap-northeast-1" },
          executionApiUrl:
            "https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod/",
          executionApiArn: "",
        });
      }).toThrow("executionApiArn is required");
    });
  });
});

