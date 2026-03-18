/**
 * DynamoDbExportJob CDK unit tests.
 *
 * Verifies: EventBridge Scheduler, Lambda, and IAM for daily DynamoDB-to-S3 export.
 */
import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import { DynamoDbExportJob } from "../lib/constructs/dynamodb-export-job";

/** IAM policy resource with Statement array */
type IAMPolicyResource = {
  Properties?: { PolicyDocument?: { Statement?: unknown[] } };
};

/** IAM statement with Action (string or string[]) */
type IAMStatement = { Action?: string | string[]; Effect?: string };

function policyHasAction(
  policies: Record<string, unknown>,
  action: string
): boolean {
  return Object.values(policies).some((res) => {
    const doc = (res as IAMPolicyResource).Properties?.PolicyDocument;
    const stmts = (doc?.Statement ?? []) as IAMStatement[];
    return stmts.some((s) => {
      const a = s.Action;
      return Array.isArray(a) ? a.includes(action) : a === action;
    });
  });
}

describe("DynamoDbExportJob", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });

    const table = new dynamodb.Table(stack, "Table", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      tableName: "TestStack-usage-history",
    });

    const bucket = new s3.Bucket(stack, "Bucket", {
      bucketName: "teststack-usage-history",
    });

    new DynamoDbExportJob(stack, "DynamoDbExportJob", { table, bucket });
    template = Template.fromStack(stack);
  });

  describe("EventBridge Scheduler", () => {
    it("should create a Schedule with cron(0 15 * * ? *) — JST 00:00 daily", () => {
      template.hasResourceProperties("AWS::Scheduler::Schedule", {
        ScheduleExpression: "cron(0 15 * * ? *)",
        State: "ENABLED",
      });
    });
  });

  describe("Lambda function", () => {
    it("should create a Lambda function with Python 3.11 runtime", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "python3.11",
      });
    });

    it("should have TABLE_ARN and EXPORT_BUCKET_NAME env vars", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: Match.objectLike({
            TABLE_ARN: Match.anyValue(),
            EXPORT_BUCKET_NAME: Match.anyValue(),
          }),
        },
      });
    });
  });

  describe("IAM permissions", () => {
    it("should have dynamodb:ExportTableToPointInTime in policy", () => {
      const policies = template.findResources("AWS::IAM::Policy");
      expect(
        policyHasAction(policies, "dynamodb:ExportTableToPointInTime")
      ).toBe(true);
    });

    it("should have s3:PutObject on dynamodb-exports/* in policy", () => {
      const policies = template.findResources("AWS::IAM::Policy");
      expect(policyHasAction(policies, "s3:PutObject")).toBe(true);
    });
  });
});
