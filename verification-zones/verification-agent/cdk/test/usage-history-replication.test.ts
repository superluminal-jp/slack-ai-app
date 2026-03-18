import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Template, Match } from "aws-cdk-lib/assertions";
import { UsageHistoryReplication } from "../lib/constructs/usage-history-replication";

function buildTemplate(archiveAccountId?: string): Template {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack");
  const sourceBucket = new s3.Bucket(stack, "Source", { versioned: true });
  const archiveBucket = new s3.Bucket(stack, "Archive", { versioned: true });
  new UsageHistoryReplication(stack, "Replication", {
    sourceBucket,
    archiveBucket,
    archiveAccountId,
  });
  return Template.fromStack(stack);
}

describe("UsageHistoryReplication — same-account mode", () => {
  let template: Template;

  beforeAll(() => {
    template = buildTemplate(); // no archiveAccountId
  });

  it("should create IAM role with s3.amazonaws.com trust", () => {
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: "s3.amazonaws.com" },
            Action: "sts:AssumeRole",
          }),
        ]),
      },
    });
  });

  it("should grant s3:GetReplicationConfiguration and s3:ListBucket on source bucket", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: Match.arrayWith([
              "s3:GetReplicationConfiguration",
              "s3:ListBucket",
            ]),
          }),
        ]),
      },
    });
  });

  it("should grant GetObjectVersion* actions on source bucket objects", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: Match.arrayWith([
              "s3:GetObjectVersionForReplication",
              "s3:GetObjectVersionAcl",
              "s3:GetObjectVersionTagging",
            ]),
          }),
        ]),
      },
    });
  });

  it("should grant ReplicateObject, ReplicateDelete, ReplicateTags on archive bucket objects", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: Match.arrayWith([
              "s3:ReplicateObject",
              "s3:ReplicateDelete",
              "s3:ReplicateTags",
            ]),
          }),
        ]),
      },
    });
  });

  it("should add bucket policy on archive bucket allowing replication writes", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: Match.arrayWith([
              "s3:ReplicateObject",
              "s3:ReplicateDelete",
            ]),
          }),
        ]),
      },
    });
  });

  it("should set ReplicationConfiguration on source bucket with filter prefix '' and Status Enabled", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      ReplicationConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Filter: { Prefix: "" },
            Status: "Enabled",
          }),
        ]),
      },
    });
  });

  it("should set DeleteMarkerReplication to Disabled", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      ReplicationConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            DeleteMarkerReplication: { Status: "Disabled" },
          }),
        ]),
      },
    });
  });

  it("should NOT include Account or AccessControlTranslation in same-account mode", () => {
    const resources = template.findResources("AWS::S3::Bucket", {
      Properties: {
        ReplicationConfiguration: Match.objectLike({}),
      },
    });
    const bucketWithReplication = Object.values(resources)[0] as {
      Properties: { ReplicationConfiguration: { Rules: { Destination: Record<string, unknown> }[] } };
    };
    const destination =
      bucketWithReplication.Properties.ReplicationConfiguration.Rules[0]
        .Destination;
    expect(destination).not.toHaveProperty("Account");
    expect(destination).not.toHaveProperty("AccessControlTranslation");
  });
});

describe("UsageHistoryReplication — cross-account mode", () => {
  let template: Template;
  const crossAccountId = "123456789012";

  beforeAll(() => {
    template = buildTemplate(crossAccountId);
  });

  it("should set Account in replication destination", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      ReplicationConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Destination: Match.objectLike({
              Account: crossAccountId,
            }),
          }),
        ]),
      },
    });
  });

  it("should set AccessControlTranslation Owner to Destination", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      ReplicationConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Destination: Match.objectLike({
              AccessControlTranslation: { Owner: "Destination" },
            }),
          }),
        ]),
      },
    });
  });

  it("should include s3:ObjectOwnerOverrideToBucketOwner in IAM policy", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: Match.arrayWith([
              "s3:ObjectOwnerOverrideToBucketOwner",
            ]),
          }),
        ]),
      },
    });
  });

  it("should include s3:ObjectOwnerOverrideToBucketOwner in archive bucket policy", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: Match.arrayWith([
              "s3:ObjectOwnerOverrideToBucketOwner",
            ]),
          }),
        ]),
      },
    });
  });
});
