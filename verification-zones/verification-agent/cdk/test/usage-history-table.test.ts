import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { UsageHistoryTable } from "../lib/constructs/usage-history-table";

describe("UsageHistoryTable", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");
    new UsageHistoryTable(stack, "UsageHistoryTable");
    template = Template.fromStack(stack);
  });

  it("should create a DynamoDB table with PK=channel_id and SK=request_id", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: Match.arrayWith([
        Match.objectLike({ AttributeName: "channel_id", KeyType: "HASH" }),
        Match.objectLike({ AttributeName: "request_id", KeyType: "RANGE" }),
      ]),
    });
  });

  it("should have PAY_PER_REQUEST billing mode", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("should have AWS_MANAGED encryption (SSE enabled)", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      SSESpecification: { SSEEnabled: true },
    });
  });

  it("should have TTL attribute named ttl with TTL enabled", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TimeToLiveSpecification: {
        AttributeName: "ttl",
        Enabled: true,
      },
    });
  });

  it("should have GSI named correlation_id-index with PK=correlation_id and projection ALL", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "correlation_id-index",
          KeySchema: Match.arrayWith([
            Match.objectLike({
              AttributeName: "correlation_id",
              KeyType: "HASH",
            }),
          ]),
          Projection: { ProjectionType: "ALL" },
        }),
      ]),
    });
  });

  it("should have table name matching {stackName}-usage-history", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "TestStack-usage-history",
    });
  });

  it("should have DeletionPolicy DESTROY", () => {
    const tables = template.findResources("AWS::DynamoDB::Table");
    const table = Object.values(tables)[0] as { DeletionPolicy?: string };
    expect(table.DeletionPolicy).toBe("Delete");
  });

  it("should have PITR (Point-in-Time Recovery) enabled", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });
  });
});
