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
export declare const REQUIRED_COST_ALLOCATION_TAG_KEYS: readonly string[];
export type RequiredCostAllocationTagKey = (typeof REQUIRED_COST_ALLOCATION_TAG_KEYS)[number];
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
export declare function getCostAllocationTagValues(options: CostAllocationTagValuesOptions): Record<string, string>;
/**
 * Applies the standard cost allocation tags to the given stack and all taggable
 * resources under it. Uses CDK Tags aspect; tags are visible in synthesized
 * CloudFormation template.
 *
 * @param scope - The stack to tag (typically `this` in a stack constructor)
 * @param options - deploymentEnv for Environment tag; StackName from scope.stackName
 */
export declare function applyCostAllocationTags(scope: cdk.Stack, options: ApplyCostAllocationTagsOptions): void;
/**
 * Aspect that backfills cost allocation tags on L1/L2 resources that do not
 * receive them from the stack-level Tag aspect (e.g. custom resource providers).
 * Derives stack name and deployment env from the stack containing each node.
 * Uses array format [{ Key, Value }] for CloudFormation; skips BedrockAgentCore::Runtime
 * which is already tagged with object format in the construct.
 */
export declare class CostAllocationTagAspect implements cdk.IAspect {
    visit(node: IConstruct): void;
}
