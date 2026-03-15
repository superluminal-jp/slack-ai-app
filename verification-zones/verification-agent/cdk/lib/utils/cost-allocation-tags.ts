/**
 * Cost allocation tags for CDK-provisioned resources.
 *
 * Single source of truth for tag keys and application so that stacks and
 * verification (e.g. synth-based tests) stay consistent. Aligns with AWS
 * cost allocation tag best practices (consistent keys, no secrets in values).
 *
 * @see https://docs.aws.amazon.com/cdk/v2/guide/tagging.html
 * @see https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html
 * @module cdk/lib/utils/cost-allocation-tags
 */

import * as cdk from "aws-cdk-lib";
import type { IConstruct } from "constructs";

/** Tag keys that must be present on every taggable resource for cost allocation. */
export const REQUIRED_COST_ALLOCATION_TAG_KEYS: readonly string[] = [
  "Environment",
  "Project",
  "ManagedBy",
  "StackName",
] as const;

export type RequiredCostAllocationTagKey =
  (typeof REQUIRED_COST_ALLOCATION_TAG_KEYS)[number];

/** Options for applying cost allocation tags to a stack. */
export interface ApplyCostAllocationTagsOptions {
  /** Deployment environment (e.g. "dev", "prod"). Used for Environment tag. */
  deploymentEnv: string;
}

/** Options for building tag key-value pairs (e.g. for L1 CfnResource overrides). */
export interface CostAllocationTagValuesOptions {
  deploymentEnv: string;
  stackName: string;
}

/**
 * Returns the cost allocation tag key-value map for use with L1 resources that
 * do not receive stack-level tags from the CDK Tag aspect (e.g. CfnResource).
 * Use with addPropertyOverride("Tags", getCostAllocationTagValues(...)).
 */
export function getCostAllocationTagValues(
  options: CostAllocationTagValuesOptions
): Record<string, string> {
  return {
    Environment: options.deploymentEnv,
    Project: "SlackAI",
    ManagedBy: "CDK",
    StackName: options.stackName,
  };
}

/**
 * Applies the standard cost allocation tags to the given stack and all taggable
 * resources under it. Uses CDK Tags aspect; tags are visible in synthesized
 * CloudFormation template.
 *
 * @param scope - The stack to tag (typically `this` in a stack constructor)
 * @param options - deploymentEnv for Environment tag; StackName from scope.stackName
 */
export function applyCostAllocationTags(
  scope: cdk.Stack,
  options: ApplyCostAllocationTagsOptions
): void {
  const { deploymentEnv } = options;
  cdk.Tags.of(scope).add("Environment", deploymentEnv);
  cdk.Tags.of(scope).add("Project", "SlackAI");
  cdk.Tags.of(scope).add("ManagedBy", "CDK");
  cdk.Tags.of(scope).add("StackName", scope.stackName);
  cdk.Aspects.of(scope).add(new CostAllocationTagAspect());
}

/** Resource types that support Tags in CloudFormation (array or object). */
const TAGGABLE_CFN_TYPES = new Set([
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

/**
 * Aspect that backfills cost allocation tags on L1/L2 resources that do not
 * receive them from the stack-level Tag aspect (e.g. custom resource providers).
 * Derives stack name and deployment env from the stack containing each node.
 * Uses array format [{ Key, Value }] for CloudFormation; skips BedrockAgentCore::Runtime
 * which is already tagged with object format in the construct.
 */
export class CostAllocationTagAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    const cfn: cdk.CfnResource | null = cdk.CfnResource.isCfnResource(node)
      ? (node as cdk.CfnResource)
      : cdk.CfnResource.isCfnResource(node.node.defaultChild)
        ? (node.node.defaultChild as cdk.CfnResource)
        : null;
    if (!cfn || !TAGGABLE_CFN_TYPES.has(cfn.cfnResourceType)) return;
    if (cfn.cfnResourceType === "AWS::BedrockAgentCore::Runtime") return;

    const stack = cdk.Stack.of(node);
    const deploymentEnvRaw =
      stack.node.tryGetContext("deploymentEnv") ??
      process.env.DEPLOYMENT_ENV ??
      "dev";
    const deploymentEnv = String(deploymentEnvRaw).toLowerCase().trim();
    const tagValues = getCostAllocationTagValues({
      deploymentEnv,
      stackName: stack.stackName,
    });
    const tagsArray = Object.entries(tagValues).map(([Key, Value]) => ({
      Key,
      Value,
    }));
    cfn.addPropertyOverride("Tags", tagsArray);
  }
}
