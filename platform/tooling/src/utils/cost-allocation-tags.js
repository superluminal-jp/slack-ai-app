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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29zdC1hbGxvY2F0aW9uLXRhZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb3N0LWFsbG9jYXRpb24tdGFncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7R0FVRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBaUNILGdFQVNDO0FBVUQsMERBVUM7QUE1REQsaURBQW1DO0FBR25DLG9GQUFvRjtBQUN2RSxRQUFBLGlDQUFpQyxHQUFzQjtJQUNsRSxhQUFhO0lBQ2IsU0FBUztJQUNULFdBQVc7SUFDWCxXQUFXO0NBQ0gsQ0FBQztBQWlCWDs7OztHQUlHO0FBQ0gsU0FBZ0IsMEJBQTBCLENBQ3hDLE9BQXVDO0lBRXZDLE9BQU87UUFDTCxXQUFXLEVBQUUsT0FBTyxDQUFDLGFBQWE7UUFDbEMsT0FBTyxFQUFFLFNBQVM7UUFDbEIsU0FBUyxFQUFFLEtBQUs7UUFDaEIsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTO0tBQzdCLENBQUM7QUFDSixDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILFNBQWdCLHVCQUF1QixDQUNyQyxLQUFnQixFQUNoQixPQUF1QztJQUV2QyxNQUFNLEVBQUUsYUFBYSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQ2xDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDckQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM3QyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzNDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3JELEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztBQUMzRCxDQUFDO0FBRUQsNEVBQTRFO0FBQzVFLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDakMsdUJBQXVCO0lBQ3ZCLGlCQUFpQjtJQUNqQixzQkFBc0I7SUFDdEIsZ0NBQWdDO0lBQ2hDLGlCQUFpQjtJQUNqQiw2QkFBNkI7SUFDN0IsZ0JBQWdCO0lBQ2hCLHFCQUFxQjtJQUNyQixzQkFBc0I7Q0FDdkIsQ0FBQyxDQUFDO0FBRUg7Ozs7OztHQU1HO0FBQ0gsTUFBYSx1QkFBdUI7SUFDbEMsS0FBSyxDQUFDLElBQWdCO1FBQ3BCLE1BQU0sR0FBRyxHQUEyQixHQUFHLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUM7WUFDckUsQ0FBQyxDQUFFLElBQXdCO1lBQzNCLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQztnQkFDckQsQ0FBQyxDQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBZ0M7Z0JBQzdDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDWCxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFBRSxPQUFPO1FBQ2pFLElBQUksR0FBRyxDQUFDLGVBQWUsS0FBSyxnQ0FBZ0M7WUFBRSxPQUFPO1FBRXJFLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sZ0JBQWdCLEdBQ3BCLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQztZQUN6QyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWM7WUFDMUIsS0FBSyxDQUFDO1FBQ1IsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDcEUsTUFBTSxTQUFTLEdBQUcsMEJBQTBCLENBQUM7WUFDM0MsYUFBYTtZQUNiLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztTQUMzQixDQUFDLENBQUM7UUFDSCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2pFLEdBQUc7WUFDSCxLQUFLO1NBQ04sQ0FBQyxDQUFDLENBQUM7UUFDSixHQUFHLENBQUMsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzdDLENBQUM7Q0FDRjtBQTFCRCwwREEwQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENvc3QgYWxsb2NhdGlvbiB0YWdzIGZvciBDREstcHJvdmlzaW9uZWQgcmVzb3VyY2VzLlxuICpcbiAqIFNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIHRhZyBrZXlzIGFuZCBhcHBsaWNhdGlvbiBzbyB0aGF0IHN0YWNrcyBhbmRcbiAqIHZlcmlmaWNhdGlvbiAoZS5nLiBzeW50aC1iYXNlZCB0ZXN0cykgc3RheSBjb25zaXN0ZW50LiBBbGlnbnMgd2l0aCBBV1NcbiAqIGNvc3QgYWxsb2NhdGlvbiB0YWcgYmVzdCBwcmFjdGljZXMgKGNvbnNpc3RlbnQga2V5cywgbm8gc2VjcmV0cyBpbiB2YWx1ZXMpLlxuICpcbiAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay92Mi9ndWlkZS90YWdnaW5nLmh0bWxcbiAqIEBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2F3c2FjY291bnRiaWxsaW5nL2xhdGVzdC9hYm91dHYyL2Nvc3QtYWxsb2MtdGFncy5odG1sXG4gKiBAbW9kdWxlIGNkay9saWIvdXRpbHMvY29zdC1hbGxvY2F0aW9uLXRhZ3NcbiAqL1xuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgdHlwZSB7IElDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuXG4vKiogVGFnIGtleXMgdGhhdCBtdXN0IGJlIHByZXNlbnQgb24gZXZlcnkgdGFnZ2FibGUgcmVzb3VyY2UgZm9yIGNvc3QgYWxsb2NhdGlvbi4gKi9cbmV4cG9ydCBjb25zdCBSRVFVSVJFRF9DT1NUX0FMTE9DQVRJT05fVEFHX0tFWVM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW1xuICBcIkVudmlyb25tZW50XCIsXG4gIFwiUHJvamVjdFwiLFxuICBcIk1hbmFnZWRCeVwiLFxuICBcIlN0YWNrTmFtZVwiLFxuXSBhcyBjb25zdDtcblxuZXhwb3J0IHR5cGUgUmVxdWlyZWRDb3N0QWxsb2NhdGlvblRhZ0tleSA9XG4gICh0eXBlb2YgUkVRVUlSRURfQ09TVF9BTExPQ0FUSU9OX1RBR19LRVlTKVtudW1iZXJdO1xuXG4vKiogT3B0aW9ucyBmb3IgYXBwbHlpbmcgY29zdCBhbGxvY2F0aW9uIHRhZ3MgdG8gYSBzdGFjay4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXBwbHlDb3N0QWxsb2NhdGlvblRhZ3NPcHRpb25zIHtcbiAgLyoqIERlcGxveW1lbnQgZW52aXJvbm1lbnQgKGUuZy4gXCJkZXZcIiwgXCJwcm9kXCIpLiBVc2VkIGZvciBFbnZpcm9ubWVudCB0YWcuICovXG4gIGRlcGxveW1lbnRFbnY6IHN0cmluZztcbn1cblxuLyoqIE9wdGlvbnMgZm9yIGJ1aWxkaW5nIHRhZyBrZXktdmFsdWUgcGFpcnMgKGUuZy4gZm9yIEwxIENmblJlc291cmNlIG92ZXJyaWRlcykuICovXG5leHBvcnQgaW50ZXJmYWNlIENvc3RBbGxvY2F0aW9uVGFnVmFsdWVzT3B0aW9ucyB7XG4gIGRlcGxveW1lbnRFbnY6IHN0cmluZztcbiAgc3RhY2tOYW1lOiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgY29zdCBhbGxvY2F0aW9uIHRhZyBrZXktdmFsdWUgbWFwIGZvciB1c2Ugd2l0aCBMMSByZXNvdXJjZXMgdGhhdFxuICogZG8gbm90IHJlY2VpdmUgc3RhY2stbGV2ZWwgdGFncyBmcm9tIHRoZSBDREsgVGFnIGFzcGVjdCAoZS5nLiBDZm5SZXNvdXJjZSkuXG4gKiBVc2Ugd2l0aCBhZGRQcm9wZXJ0eU92ZXJyaWRlKFwiVGFnc1wiLCBnZXRDb3N0QWxsb2NhdGlvblRhZ1ZhbHVlcyguLi4pKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENvc3RBbGxvY2F0aW9uVGFnVmFsdWVzKFxuICBvcHRpb25zOiBDb3N0QWxsb2NhdGlvblRhZ1ZhbHVlc09wdGlvbnNcbik6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICByZXR1cm4ge1xuICAgIEVudmlyb25tZW50OiBvcHRpb25zLmRlcGxveW1lbnRFbnYsXG4gICAgUHJvamVjdDogXCJTbGFja0FJXCIsXG4gICAgTWFuYWdlZEJ5OiBcIkNES1wiLFxuICAgIFN0YWNrTmFtZTogb3B0aW9ucy5zdGFja05hbWUsXG4gIH07XG59XG5cbi8qKlxuICogQXBwbGllcyB0aGUgc3RhbmRhcmQgY29zdCBhbGxvY2F0aW9uIHRhZ3MgdG8gdGhlIGdpdmVuIHN0YWNrIGFuZCBhbGwgdGFnZ2FibGVcbiAqIHJlc291cmNlcyB1bmRlciBpdC4gVXNlcyBDREsgVGFncyBhc3BlY3Q7IHRhZ3MgYXJlIHZpc2libGUgaW4gc3ludGhlc2l6ZWRcbiAqIENsb3VkRm9ybWF0aW9uIHRlbXBsYXRlLlxuICpcbiAqIEBwYXJhbSBzY29wZSAtIFRoZSBzdGFjayB0byB0YWcgKHR5cGljYWxseSBgdGhpc2AgaW4gYSBzdGFjayBjb25zdHJ1Y3RvcilcbiAqIEBwYXJhbSBvcHRpb25zIC0gZGVwbG95bWVudEVudiBmb3IgRW52aXJvbm1lbnQgdGFnOyBTdGFja05hbWUgZnJvbSBzY29wZS5zdGFja05hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q29zdEFsbG9jYXRpb25UYWdzKFxuICBzY29wZTogY2RrLlN0YWNrLFxuICBvcHRpb25zOiBBcHBseUNvc3RBbGxvY2F0aW9uVGFnc09wdGlvbnNcbik6IHZvaWQge1xuICBjb25zdCB7IGRlcGxveW1lbnRFbnYgfSA9IG9wdGlvbnM7XG4gIGNkay5UYWdzLm9mKHNjb3BlKS5hZGQoXCJFbnZpcm9ubWVudFwiLCBkZXBsb3ltZW50RW52KTtcbiAgY2RrLlRhZ3Mub2Yoc2NvcGUpLmFkZChcIlByb2plY3RcIiwgXCJTbGFja0FJXCIpO1xuICBjZGsuVGFncy5vZihzY29wZSkuYWRkKFwiTWFuYWdlZEJ5XCIsIFwiQ0RLXCIpO1xuICBjZGsuVGFncy5vZihzY29wZSkuYWRkKFwiU3RhY2tOYW1lXCIsIHNjb3BlLnN0YWNrTmFtZSk7XG4gIGNkay5Bc3BlY3RzLm9mKHNjb3BlKS5hZGQobmV3IENvc3RBbGxvY2F0aW9uVGFnQXNwZWN0KCkpO1xufVxuXG4vKiogUmVzb3VyY2UgdHlwZXMgdGhhdCBzdXBwb3J0IFRhZ3MgaW4gQ2xvdWRGb3JtYXRpb24gKGFycmF5IG9yIG9iamVjdCkuICovXG5jb25zdCBUQUdHQUJMRV9DRk5fVFlQRVMgPSBuZXcgU2V0KFtcbiAgXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIixcbiAgXCJBV1M6OlMzOjpCdWNrZXRcIixcbiAgXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiLFxuICBcIkFXUzo6QmVkcm9ja0FnZW50Q29yZTo6UnVudGltZVwiLFxuICBcIkFXUzo6U1FTOjpRdWV1ZVwiLFxuICBcIkFXUzo6U2VjcmV0c01hbmFnZXI6OlNlY3JldFwiLFxuICBcIkFXUzo6SUFNOjpSb2xlXCIsXG4gIFwiQVdTOjpMb2dzOjpMb2dHcm91cFwiLFxuICBcIkFXUzo6RUNSOjpSZXBvc2l0b3J5XCIsXG5dKTtcblxuLyoqXG4gKiBBc3BlY3QgdGhhdCBiYWNrZmlsbHMgY29zdCBhbGxvY2F0aW9uIHRhZ3Mgb24gTDEvTDIgcmVzb3VyY2VzIHRoYXQgZG8gbm90XG4gKiByZWNlaXZlIHRoZW0gZnJvbSB0aGUgc3RhY2stbGV2ZWwgVGFnIGFzcGVjdCAoZS5nLiBjdXN0b20gcmVzb3VyY2UgcHJvdmlkZXJzKS5cbiAqIERlcml2ZXMgc3RhY2sgbmFtZSBhbmQgZGVwbG95bWVudCBlbnYgZnJvbSB0aGUgc3RhY2sgY29udGFpbmluZyBlYWNoIG5vZGUuXG4gKiBVc2VzIGFycmF5IGZvcm1hdCBbeyBLZXksIFZhbHVlIH1dIGZvciBDbG91ZEZvcm1hdGlvbjsgc2tpcHMgQmVkcm9ja0FnZW50Q29yZTo6UnVudGltZVxuICogd2hpY2ggaXMgYWxyZWFkeSB0YWdnZWQgd2l0aCBvYmplY3QgZm9ybWF0IGluIHRoZSBjb25zdHJ1Y3QuXG4gKi9cbmV4cG9ydCBjbGFzcyBDb3N0QWxsb2NhdGlvblRhZ0FzcGVjdCBpbXBsZW1lbnRzIGNkay5JQXNwZWN0IHtcbiAgdmlzaXQobm9kZTogSUNvbnN0cnVjdCk6IHZvaWQge1xuICAgIGNvbnN0IGNmbjogY2RrLkNmblJlc291cmNlIHwgbnVsbCA9IGNkay5DZm5SZXNvdXJjZS5pc0NmblJlc291cmNlKG5vZGUpXG4gICAgICA/IChub2RlIGFzIGNkay5DZm5SZXNvdXJjZSlcbiAgICAgIDogY2RrLkNmblJlc291cmNlLmlzQ2ZuUmVzb3VyY2Uobm9kZS5ub2RlLmRlZmF1bHRDaGlsZClcbiAgICAgICAgPyAobm9kZS5ub2RlLmRlZmF1bHRDaGlsZCBhcyBjZGsuQ2ZuUmVzb3VyY2UpXG4gICAgICAgIDogbnVsbDtcbiAgICBpZiAoIWNmbiB8fCAhVEFHR0FCTEVfQ0ZOX1RZUEVTLmhhcyhjZm4uY2ZuUmVzb3VyY2VUeXBlKSkgcmV0dXJuO1xuICAgIGlmIChjZm4uY2ZuUmVzb3VyY2VUeXBlID09PSBcIkFXUzo6QmVkcm9ja0FnZW50Q29yZTo6UnVudGltZVwiKSByZXR1cm47XG5cbiAgICBjb25zdCBzdGFjayA9IGNkay5TdGFjay5vZihub2RlKTtcbiAgICBjb25zdCBkZXBsb3ltZW50RW52UmF3ID1cbiAgICAgIHN0YWNrLm5vZGUudHJ5R2V0Q29udGV4dChcImRlcGxveW1lbnRFbnZcIikgPz9cbiAgICAgIHByb2Nlc3MuZW52LkRFUExPWU1FTlRfRU5WID8/XG4gICAgICBcImRldlwiO1xuICAgIGNvbnN0IGRlcGxveW1lbnRFbnYgPSBTdHJpbmcoZGVwbG95bWVudEVudlJhdykudG9Mb3dlckNhc2UoKS50cmltKCk7XG4gICAgY29uc3QgdGFnVmFsdWVzID0gZ2V0Q29zdEFsbG9jYXRpb25UYWdWYWx1ZXMoe1xuICAgICAgZGVwbG95bWVudEVudixcbiAgICAgIHN0YWNrTmFtZTogc3RhY2suc3RhY2tOYW1lLFxuICAgIH0pO1xuICAgIGNvbnN0IHRhZ3NBcnJheSA9IE9iamVjdC5lbnRyaWVzKHRhZ1ZhbHVlcykubWFwKChbS2V5LCBWYWx1ZV0pID0+ICh7XG4gICAgICBLZXksXG4gICAgICBWYWx1ZSxcbiAgICB9KSk7XG4gICAgY2ZuLmFkZFByb3BlcnR5T3ZlcnJpZGUoXCJUYWdzXCIsIHRhZ3NBcnJheSk7XG4gIH1cbn1cbiJdfQ==