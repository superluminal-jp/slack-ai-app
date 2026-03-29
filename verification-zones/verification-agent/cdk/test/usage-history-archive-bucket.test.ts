import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { UsageHistoryArchiveBucket } from "../lib/constructs/usage-history-archive-bucket";

describe("UsageHistoryArchiveBucket", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");
    new UsageHistoryArchiveBucket(stack, "UsageHistoryArchiveBucket");
    template = Template.fromStack(stack);
  });

  it("should embed account ID in bucket name for global uniqueness", () => {
    const resources = template.findResources("AWS::S3::Bucket");
    const names = Object.values(resources).map(
      (r) => (r as { Properties?: { BucketName?: unknown } }).Properties?.BucketName
    );
    expect(names).toHaveLength(1);
    const serialized = JSON.stringify(names[0]);
    expect(serialized).toContain("AWS::AccountId");
    expect(serialized).toContain("teststack");
    expect(serialized).toContain("usage-history-archive");
  });

  it("should have versioning enabled", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      VersioningConfiguration: { Status: "Enabled" },
    });
  });

  it("should have SSE-S3 encryption (AES256)", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
          }),
        ]),
      },
    });
  });

  it("should have BlockPublicAccess BLOCK_ALL", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("should enforce SSL", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Deny",
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          }),
        ]),
      },
    });
  });

  it("should have lifecycle rule for content/ prefix with 90-day expiration", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Prefix: "content/",
            ExpirationInDays: 90,
            Status: "Enabled",
          }),
        ]),
      },
    });
  });

  it("should have lifecycle rule for attachments/ prefix with 90-day expiration", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Prefix: "attachments/",
            ExpirationInDays: 90,
            Status: "Enabled",
          }),
        ]),
      },
    });
  });

  it("should have lifecycle rule for dynamodb-exports/ prefix with 90-day expiration", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Prefix: "dynamodb-exports/",
            ExpirationInDays: 90,
            Status: "Enabled",
          }),
        ]),
      },
    });
  });

  it("should have noncurrent version expiration lifecycle rule (7 days)", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            NoncurrentVersionExpiration: { NoncurrentDays: 7 },
            Status: "Enabled",
          }),
        ]),
      },
    });
  });
});
