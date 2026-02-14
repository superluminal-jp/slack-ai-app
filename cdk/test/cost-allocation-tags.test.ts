/**
 * Cost allocation tag verification (031 – User Story 2).
 *
 * Synthesizes Execution and Verification stacks and asserts every taggable
 * resource has all required cost allocation tag keys (Environment, Project,
 * ManagedBy, StackName). Supports both Tags as array [{ Key, Value }] and
 * as object { key: value } (e.g. BedrockAgentCore::Runtime).
 *
 * @see specs/031-cdk-cost-allocation-tags/spec.md
 * @see specs/031-cdk-cost-allocation-tags/contracts/tag-verification-report.schema.json
 */

import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import {
  REQUIRED_COST_ALLOCATION_TAG_KEYS,
  type RequiredCostAllocationTagKey,
} from "../lib/utils/cost-allocation-tags";
import { ExecutionStack } from "../lib/execution/execution-stack";
import { VerificationStack } from "../lib/verification/verification-stack";

/**
 * Logical ID prefixes for resources created at app level (e.g. S3 auto-delete custom
 * resource provider). They receive cost allocation tags when the full app is synthesized
 * (bin/cdk.ts adds CostAllocationTagAspect to the app). Single-stack tests exclude them.
 */
const APP_LEVEL_PROVIDER_LOGICAL_ID_PREFIXES = [
  "CustomS3AutoDeleteObjectsCustomResourceProvider",
];

/** CloudFormation resource types that support Tags and are used in our stacks. */
const TAGGABLE_RESOURCE_TYPES = new Set<string>([
  "AWS::Lambda::Function",
  "AWS::S3::Bucket",
  "AWS::DynamoDB::Table",
  "AWS::BedrockAgentCore::Runtime",
  "AWS::SQS::Queue",
  "AWS::SecretsManager::Secret",
  "AWS::IAM::Role",
  "AWS::Logs::LogGroup",
  "AWS::ECR::Repository",
]);

type CfnResource = { Type: string; Properties?: { Tags?: unknown } };

/**
 * Normalize Tags from CloudFormation (array of { Key, Value } or object) to Record<string, string>.
 */
function tagsToRecord(tags: unknown): Record<string, string> | null {
  if (tags == null) return null;
  if (typeof tags === "object" && !Array.isArray(tags)) {
    const asObj = tags as Record<string, unknown>;
    if (asObj.Key !== undefined && asObj.Value !== undefined) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(asObj)) {
      if (typeof v === "string") out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }
  if (Array.isArray(tags)) {
    const out: Record<string, string> = {};
    for (const t of tags as Array<{ Key?: string; Value?: string }>) {
      if (t && typeof t.Key === "string" && typeof t.Value === "string") {
        out[t.Key] = t.Value;
      }
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

function collectMissingTagResources(
  template: Template,
  stackName: string
): Array<{ logicalId: string; resourceType: string; missingKeys: string[] }> {
  const raw = template.toJSON();
  const resources = (raw.Resources ?? {}) as Record<string, CfnResource>;
  const missing: Array<{
    logicalId: string;
    resourceType: string;
    missingKeys: string[];
  }> = [];

  for (const [logicalId, resource] of Object.entries(resources)) {
    const type = resource?.Type;
    if (!type || !TAGGABLE_RESOURCE_TYPES.has(type)) continue;
    if (
      APP_LEVEL_PROVIDER_LOGICAL_ID_PREFIXES.some((p) => logicalId.startsWith(p))
    ) {
      continue;
    }

    const tags = resource.Properties?.Tags;
    const record = tagsToRecord(tags);
    if (!record) {
      missing.push({
        logicalId,
        resourceType: type,
        missingKeys: [...REQUIRED_COST_ALLOCATION_TAG_KEYS],
      });
      continue;
    }
    const missingKeys: string[] = [];
    for (const key of REQUIRED_COST_ALLOCATION_TAG_KEYS as readonly RequiredCostAllocationTagKey[]) {
      const value = record[key];
      if (value === undefined || typeof value !== "string" || value.length === 0) {
        missingKeys.push(key);
      }
    }
    if (missingKeys.length > 0) {
      missing.push({ logicalId, resourceType: type, missingKeys });
    }
  }
  return missing;
}

describe("Cost allocation tags (031 US2)", () => {
  describe("Execution stack", () => {
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

    it("every taggable resource has all required cost allocation tags", () => {
      const missing = collectMissingTagResources(template, stack.stackName);
      expect(missing).toEqual([]);
    });
  });

  describe("Verification stack", () => {
    let app: cdk.App;
    let stack: VerificationStack;
    let template: Template;

    beforeEach(() => {
      process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
      process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
      app = new cdk.App();
      stack = new VerificationStack(app, "TestVerificationStack", {
        env: { account: "123456789012", region: "ap-northeast-1" },
        executionAgentArn:
          "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/TestExecutionAgent",
      });
      template = Template.fromStack(stack);
    });

    afterEach(() => {
      delete process.env.SLACK_BOT_TOKEN;
      delete process.env.SLACK_SIGNING_SECRET;
    });

    it("every taggable resource has all required cost allocation tags", () => {
      const missing = collectMissingTagResources(template, stack.stackName);
      expect(missing).toEqual([]);
    });
  });
});
