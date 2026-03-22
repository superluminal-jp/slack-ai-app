"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostAllocationTagAspect = exports.REQUIRED_COST_ALLOCATION_TAG_KEYS = void 0;
exports.getCostAllocationTagValues = getCostAllocationTagValues;
exports.applyCostAllocationTags = applyCostAllocationTags;
const cdk = __importStar(require("aws-cdk-lib"));
/** Tag keys that must be present on every taggable resource for cost allocation. */
exports.REQUIRED_COST_ALLOCATION_TAG_KEYS = [
    "Environment",
    "Project",
    "ManagedBy",
    "StackName",
];
/**
 * Returns the cost allocation tag key-value map for use with L1 resources that
 * do not receive stack-level tags from the CDK Tag aspect (e.g. CfnResource).
 * Use with addPropertyOverride("Tags", getCostAllocationTagValues(...)).
 */
function getCostAllocationTagValues(options) {
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
function applyCostAllocationTags(scope, options) {
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
    // AWS::Scheduler::Schedule does not support Tags in CloudFormation resource schema
]);
/**
 * Aspect that backfills cost allocation tags on L1/L2 resources that do not
 * receive them from the stack-level Tag aspect (e.g. custom resource providers).
 * Derives stack name and deployment env from the stack containing each node.
 * Uses array format [{ Key, Value }] for CloudFormation; skips BedrockAgentCore::Runtime
 * which is already tagged with object format in the construct.
 */
class CostAllocationTagAspect {
    visit(node) {
        const cfn = cdk.CfnResource.isCfnResource(node)
            ? node
            : cdk.CfnResource.isCfnResource(node.node.defaultChild)
                ? node.node.defaultChild
                : null;
        if (!cfn || !TAGGABLE_CFN_TYPES.has(cfn.cfnResourceType))
            return;
        if (cfn.cfnResourceType === "AWS::BedrockAgentCore::Runtime")
            return;
        const stack = cdk.Stack.of(node);
        const deploymentEnvRaw = stack.node.tryGetContext("deploymentEnv") ??
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
exports.CostAllocationTagAspect = CostAllocationTagAspect;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29zdC1hbGxvY2F0aW9uLXRhZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb3N0LWFsbG9jYXRpb24tdGFncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7R0FVRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBaUNILGdFQVNDO0FBVUQsMERBVUM7QUE1REQsaURBQW1DO0FBR25DLG9GQUFvRjtBQUN2RSxRQUFBLGlDQUFpQyxHQUFzQjtJQUNsRSxhQUFhO0lBQ2IsU0FBUztJQUNULFdBQVc7SUFDWCxXQUFXO0NBQ0gsQ0FBQztBQWlCWDs7OztHQUlHO0FBQ0gsU0FBZ0IsMEJBQTBCLENBQ3hDLE9BQXVDO0lBRXZDLE9BQU87UUFDTCxXQUFXLEVBQUUsT0FBTyxDQUFDLGFBQWE7UUFDbEMsT0FBTyxFQUFFLFNBQVM7UUFDbEIsU0FBUyxFQUFFLEtBQUs7UUFDaEIsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTO0tBQzdCLENBQUM7QUFDSixDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILFNBQWdCLHVCQUF1QixDQUNyQyxLQUFnQixFQUNoQixPQUF1QztJQUV2QyxNQUFNLEVBQUUsYUFBYSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQ2xDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDckQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM3QyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzNDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3JELEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztBQUMzRCxDQUFDO0FBRUQsNEVBQTRFO0FBQzVFLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDakMsdUJBQXVCO0lBQ3ZCLGlCQUFpQjtJQUNqQixzQkFBc0I7SUFDdEIsZ0NBQWdDO0lBQ2hDLGlCQUFpQjtJQUNqQiw2QkFBNkI7SUFDN0IsZ0JBQWdCO0lBQ2hCLHFCQUFxQjtJQUNyQixzQkFBc0I7SUFDdEIsbUZBQW1GO0NBQ3BGLENBQUMsQ0FBQztBQUVIOzs7Ozs7R0FNRztBQUNILE1BQWEsdUJBQXVCO0lBQ2xDLEtBQUssQ0FBQyxJQUFnQjtRQUNwQixNQUFNLEdBQUcsR0FBMkIsR0FBRyxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDO1lBQ3JFLENBQUMsQ0FBRSxJQUF3QjtZQUMzQixDQUFDLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUM7Z0JBQ3JELENBQUMsQ0FBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQWdDO2dCQUM3QyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQ1gsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQUUsT0FBTztRQUNqRSxJQUFJLEdBQUcsQ0FBQyxlQUFlLEtBQUssZ0NBQWdDO1lBQUUsT0FBTztRQUVyRSxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxNQUFNLGdCQUFnQixHQUNwQixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUM7WUFDekMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjO1lBQzFCLEtBQUssQ0FBQztRQUNSLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3BFLE1BQU0sU0FBUyxHQUFHLDBCQUEwQixDQUFDO1lBQzNDLGFBQWE7WUFDYixTQUFTLEVBQUUsS0FBSyxDQUFDLFNBQVM7U0FDM0IsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNqRSxHQUFHO1lBQ0gsS0FBSztTQUNOLENBQUMsQ0FBQyxDQUFDO1FBQ0osR0FBRyxDQUFDLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM3QyxDQUFDO0NBQ0Y7QUExQkQsMERBMEJDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDb3N0IGFsbG9jYXRpb24gdGFncyBmb3IgQ0RLLXByb3Zpc2lvbmVkIHJlc291cmNlcy5cbiAqXG4gKiBTaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciB0YWcga2V5cyBhbmQgYXBwbGljYXRpb24gc28gdGhhdCBzdGFja3MgYW5kXG4gKiB2ZXJpZmljYXRpb24gKGUuZy4gc3ludGgtYmFzZWQgdGVzdHMpIHN0YXkgY29uc2lzdGVudC4gQWxpZ25zIHdpdGggQVdTXG4gKiBjb3N0IGFsbG9jYXRpb24gdGFnIGJlc3QgcHJhY3RpY2VzIChjb25zaXN0ZW50IGtleXMsIG5vIHNlY3JldHMgaW4gdmFsdWVzKS5cbiAqXG4gKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvdjIvZ3VpZGUvdGFnZ2luZy5odG1sXG4gKiBAc2VlIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9hd3NhY2NvdW50YmlsbGluZy9sYXRlc3QvYWJvdXR2Mi9jb3N0LWFsbG9jLXRhZ3MuaHRtbFxuICogQG1vZHVsZSBjZGsvbGliL3V0aWxzL2Nvc3QtYWxsb2NhdGlvbi10YWdzXG4gKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHR5cGUgeyBJQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcblxuLyoqIFRhZyBrZXlzIHRoYXQgbXVzdCBiZSBwcmVzZW50IG9uIGV2ZXJ5IHRhZ2dhYmxlIHJlc291cmNlIGZvciBjb3N0IGFsbG9jYXRpb24uICovXG5leHBvcnQgY29uc3QgUkVRVUlSRURfQ09TVF9BTExPQ0FUSU9OX1RBR19LRVlTOiByZWFkb25seSBzdHJpbmdbXSA9IFtcbiAgXCJFbnZpcm9ubWVudFwiLFxuICBcIlByb2plY3RcIixcbiAgXCJNYW5hZ2VkQnlcIixcbiAgXCJTdGFja05hbWVcIixcbl0gYXMgY29uc3Q7XG5cbmV4cG9ydCB0eXBlIFJlcXVpcmVkQ29zdEFsbG9jYXRpb25UYWdLZXkgPVxuICAodHlwZW9mIFJFUVVJUkVEX0NPU1RfQUxMT0NBVElPTl9UQUdfS0VZUylbbnVtYmVyXTtcblxuLyoqIE9wdGlvbnMgZm9yIGFwcGx5aW5nIGNvc3QgYWxsb2NhdGlvbiB0YWdzIHRvIGEgc3RhY2suICovXG5leHBvcnQgaW50ZXJmYWNlIEFwcGx5Q29zdEFsbG9jYXRpb25UYWdzT3B0aW9ucyB7XG4gIC8qKiBEZXBsb3ltZW50IGVudmlyb25tZW50IChlLmcuIFwiZGV2XCIsIFwicHJvZFwiKS4gVXNlZCBmb3IgRW52aXJvbm1lbnQgdGFnLiAqL1xuICBkZXBsb3ltZW50RW52OiBzdHJpbmc7XG59XG5cbi8qKiBPcHRpb25zIGZvciBidWlsZGluZyB0YWcga2V5LXZhbHVlIHBhaXJzIChlLmcuIGZvciBMMSBDZm5SZXNvdXJjZSBvdmVycmlkZXMpLiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb3N0QWxsb2NhdGlvblRhZ1ZhbHVlc09wdGlvbnMge1xuICBkZXBsb3ltZW50RW52OiBzdHJpbmc7XG4gIHN0YWNrTmFtZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNvc3QgYWxsb2NhdGlvbiB0YWcga2V5LXZhbHVlIG1hcCBmb3IgdXNlIHdpdGggTDEgcmVzb3VyY2VzIHRoYXRcbiAqIGRvIG5vdCByZWNlaXZlIHN0YWNrLWxldmVsIHRhZ3MgZnJvbSB0aGUgQ0RLIFRhZyBhc3BlY3QgKGUuZy4gQ2ZuUmVzb3VyY2UpLlxuICogVXNlIHdpdGggYWRkUHJvcGVydHlPdmVycmlkZShcIlRhZ3NcIiwgZ2V0Q29zdEFsbG9jYXRpb25UYWdWYWx1ZXMoLi4uKSkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb3N0QWxsb2NhdGlvblRhZ1ZhbHVlcyhcbiAgb3B0aW9uczogQ29zdEFsbG9jYXRpb25UYWdWYWx1ZXNPcHRpb25zXG4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcbiAgcmV0dXJuIHtcbiAgICBFbnZpcm9ubWVudDogb3B0aW9ucy5kZXBsb3ltZW50RW52LFxuICAgIFByb2plY3Q6IFwiU2xhY2tBSVwiLFxuICAgIE1hbmFnZWRCeTogXCJDREtcIixcbiAgICBTdGFja05hbWU6IG9wdGlvbnMuc3RhY2tOYW1lLFxuICB9O1xufVxuXG4vKipcbiAqIEFwcGxpZXMgdGhlIHN0YW5kYXJkIGNvc3QgYWxsb2NhdGlvbiB0YWdzIHRvIHRoZSBnaXZlbiBzdGFjayBhbmQgYWxsIHRhZ2dhYmxlXG4gKiByZXNvdXJjZXMgdW5kZXIgaXQuIFVzZXMgQ0RLIFRhZ3MgYXNwZWN0OyB0YWdzIGFyZSB2aXNpYmxlIGluIHN5bnRoZXNpemVkXG4gKiBDbG91ZEZvcm1hdGlvbiB0ZW1wbGF0ZS5cbiAqXG4gKiBAcGFyYW0gc2NvcGUgLSBUaGUgc3RhY2sgdG8gdGFnICh0eXBpY2FsbHkgYHRoaXNgIGluIGEgc3RhY2sgY29uc3RydWN0b3IpXG4gKiBAcGFyYW0gb3B0aW9ucyAtIGRlcGxveW1lbnRFbnYgZm9yIEVudmlyb25tZW50IHRhZzsgU3RhY2tOYW1lIGZyb20gc2NvcGUuc3RhY2tOYW1lXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNvc3RBbGxvY2F0aW9uVGFncyhcbiAgc2NvcGU6IGNkay5TdGFjayxcbiAgb3B0aW9uczogQXBwbHlDb3N0QWxsb2NhdGlvblRhZ3NPcHRpb25zXG4pOiB2b2lkIHtcbiAgY29uc3QgeyBkZXBsb3ltZW50RW52IH0gPSBvcHRpb25zO1xuICBjZGsuVGFncy5vZihzY29wZSkuYWRkKFwiRW52aXJvbm1lbnRcIiwgZGVwbG95bWVudEVudik7XG4gIGNkay5UYWdzLm9mKHNjb3BlKS5hZGQoXCJQcm9qZWN0XCIsIFwiU2xhY2tBSVwiKTtcbiAgY2RrLlRhZ3Mub2Yoc2NvcGUpLmFkZChcIk1hbmFnZWRCeVwiLCBcIkNES1wiKTtcbiAgY2RrLlRhZ3Mub2Yoc2NvcGUpLmFkZChcIlN0YWNrTmFtZVwiLCBzY29wZS5zdGFja05hbWUpO1xuICBjZGsuQXNwZWN0cy5vZihzY29wZSkuYWRkKG5ldyBDb3N0QWxsb2NhdGlvblRhZ0FzcGVjdCgpKTtcbn1cblxuLyoqIFJlc291cmNlIHR5cGVzIHRoYXQgc3VwcG9ydCBUYWdzIGluIENsb3VkRm9ybWF0aW9uIChhcnJheSBvciBvYmplY3QpLiAqL1xuY29uc3QgVEFHR0FCTEVfQ0ZOX1RZUEVTID0gbmV3IFNldChbXG4gIFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsXG4gIFwiQVdTOjpTMzo6QnVja2V0XCIsXG4gIFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIixcbiAgXCJBV1M6OkJlZHJvY2tBZ2VudENvcmU6OlJ1bnRpbWVcIixcbiAgXCJBV1M6OlNRUzo6UXVldWVcIixcbiAgXCJBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXRcIixcbiAgXCJBV1M6OklBTTo6Um9sZVwiLFxuICBcIkFXUzo6TG9nczo6TG9nR3JvdXBcIixcbiAgXCJBV1M6OkVDUjo6UmVwb3NpdG9yeVwiLFxuICAvLyBBV1M6OlNjaGVkdWxlcjo6U2NoZWR1bGUgZG9lcyBub3Qgc3VwcG9ydCBUYWdzIGluIENsb3VkRm9ybWF0aW9uIHJlc291cmNlIHNjaGVtYVxuXSk7XG5cbi8qKlxuICogQXNwZWN0IHRoYXQgYmFja2ZpbGxzIGNvc3QgYWxsb2NhdGlvbiB0YWdzIG9uIEwxL0wyIHJlc291cmNlcyB0aGF0IGRvIG5vdFxuICogcmVjZWl2ZSB0aGVtIGZyb20gdGhlIHN0YWNrLWxldmVsIFRhZyBhc3BlY3QgKGUuZy4gY3VzdG9tIHJlc291cmNlIHByb3ZpZGVycykuXG4gKiBEZXJpdmVzIHN0YWNrIG5hbWUgYW5kIGRlcGxveW1lbnQgZW52IGZyb20gdGhlIHN0YWNrIGNvbnRhaW5pbmcgZWFjaCBub2RlLlxuICogVXNlcyBhcnJheSBmb3JtYXQgW3sgS2V5LCBWYWx1ZSB9XSBmb3IgQ2xvdWRGb3JtYXRpb247IHNraXBzIEJlZHJvY2tBZ2VudENvcmU6OlJ1bnRpbWVcbiAqIHdoaWNoIGlzIGFscmVhZHkgdGFnZ2VkIHdpdGggb2JqZWN0IGZvcm1hdCBpbiB0aGUgY29uc3RydWN0LlxuICovXG5leHBvcnQgY2xhc3MgQ29zdEFsbG9jYXRpb25UYWdBc3BlY3QgaW1wbGVtZW50cyBjZGsuSUFzcGVjdCB7XG4gIHZpc2l0KG5vZGU6IElDb25zdHJ1Y3QpOiB2b2lkIHtcbiAgICBjb25zdCBjZm46IGNkay5DZm5SZXNvdXJjZSB8IG51bGwgPSBjZGsuQ2ZuUmVzb3VyY2UuaXNDZm5SZXNvdXJjZShub2RlKVxuICAgICAgPyAobm9kZSBhcyBjZGsuQ2ZuUmVzb3VyY2UpXG4gICAgICA6IGNkay5DZm5SZXNvdXJjZS5pc0NmblJlc291cmNlKG5vZGUubm9kZS5kZWZhdWx0Q2hpbGQpXG4gICAgICAgID8gKG5vZGUubm9kZS5kZWZhdWx0Q2hpbGQgYXMgY2RrLkNmblJlc291cmNlKVxuICAgICAgICA6IG51bGw7XG4gICAgaWYgKCFjZm4gfHwgIVRBR0dBQkxFX0NGTl9UWVBFUy5oYXMoY2ZuLmNmblJlc291cmNlVHlwZSkpIHJldHVybjtcbiAgICBpZiAoY2ZuLmNmblJlc291cmNlVHlwZSA9PT0gXCJBV1M6OkJlZHJvY2tBZ2VudENvcmU6OlJ1bnRpbWVcIikgcmV0dXJuO1xuXG4gICAgY29uc3Qgc3RhY2sgPSBjZGsuU3RhY2sub2Yobm9kZSk7XG4gICAgY29uc3QgZGVwbG95bWVudEVudlJhdyA9XG4gICAgICBzdGFjay5ub2RlLnRyeUdldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIpID8/XG4gICAgICBwcm9jZXNzLmVudi5ERVBMT1lNRU5UX0VOViA/P1xuICAgICAgXCJkZXZcIjtcbiAgICBjb25zdCBkZXBsb3ltZW50RW52ID0gU3RyaW5nKGRlcGxveW1lbnRFbnZSYXcpLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuICAgIGNvbnN0IHRhZ1ZhbHVlcyA9IGdldENvc3RBbGxvY2F0aW9uVGFnVmFsdWVzKHtcbiAgICAgIGRlcGxveW1lbnRFbnYsXG4gICAgICBzdGFja05hbWU6IHN0YWNrLnN0YWNrTmFtZSxcbiAgICB9KTtcbiAgICBjb25zdCB0YWdzQXJyYXkgPSBPYmplY3QuZW50cmllcyh0YWdWYWx1ZXMpLm1hcCgoW0tleSwgVmFsdWVdKSA9PiAoe1xuICAgICAgS2V5LFxuICAgICAgVmFsdWUsXG4gICAgfSkpO1xuICAgIGNmbi5hZGRQcm9wZXJ0eU92ZXJyaWRlKFwiVGFnc1wiLCB0YWdzQXJyYXkpO1xuICB9XG59XG4iXX0=