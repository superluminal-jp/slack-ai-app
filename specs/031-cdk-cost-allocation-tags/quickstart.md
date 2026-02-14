# Quickstart: CDK Cost Allocation Tags (Phase 1)

**Feature**: 031-cdk-cost-allocation-tags  
**Date**: 2026-02-14

## Purpose

Ensure every CDK-provisioned resource that supports tags receives the same cost allocation tags, so billing can be separated by project, environment, or component. Verify tag presence from the synthesized template without deploying.

---

## 1. Apply cost allocation tags in code

Tags are applied at **stack** level so all taggable resources under the stack get them.

**In this app**: Both stacks call `applyCostAllocationTags(this, { deploymentEnv })` from `cdk/lib/utils/cost-allocation-tags.ts`, which applies the same four tags via `Tags.of(scope).add(...)`:

```ts
cdk.Tags.of(this).add("Environment", deploymentEnv);
cdk.Tags.of(this).add("Project", "SlackAI");
cdk.Tags.of(this).add("ManagedBy", "CDK");
cdk.Tags.of(this).add("StackName", this.stackName);
```

**What to do**:
- Keep this set as the minimum cost allocation tags.
- If your organization requires additional keys (e.g. `CostCenter`, `Application`), add them in the same place for both stacks so they stay consistent.
- Do not put secrets or PII in tag values.

**Scope**: Apply `Tags.of(this).add(...)` once per stack, near the top of the stack constructor (after reading context like `deploymentEnv`). Tags apply recursively to all taggable children; L1 constructs (e.g. `CfnResource` for `AWS::BedrockAgentCore::Runtime`) receive tags if the CloudFormation resource type supports a `Tags` property.

---

## 2. Verify tags from synth output

**Option A – Jest (recommended)**  
Run the existing verification test:

```bash
cd cdk && npm test -- --testPathPattern="cost-allocation-tags"
```

The test in `cdk/test/cost-allocation-tags.test.ts` synthesizes Execution and Verification stacks and asserts every taggable resource has the required tag keys in `Properties.Tags`. To add or extend tests: synthesize the stack (e.g. `Template.fromStack(stack)`), then for each resource type that supports tags assert the resource has Environment, Project, ManagedBy, StackName.

**Option B – Script**  
Optional: a small script (e.g. under `cdk/scripts/`) that:
1. Runs synth (or reads `cdk.out/`).
2. Walks each template’s `Resources`, and for each resource type that supports Tags, checks that required keys exist.
3. Outputs pass/fail and, on failure, a list of resources missing tags (see `contracts/tag-verification-report.schema.json`).

---

## 3. Handle resources that don’t get tags

- **From synth**: If a resource type supports Tags in CloudFormation but the synthesized template is missing tags for that resource, ensure the resource is under the stack (or a child of the scope passed to `Tags.of(scope)`). If it is and tags still don’t appear, add them explicitly (e.g. `cfnResource.addPropertyOverride('Tags', { ... })`).
- **Non-taggable types**: If a resource type has no `Tags` property in CloudFormation, document it (e.g. in this quickstart or in CDK README) as non-taggable and note alternatives (account tags, naming) for cost attribution.

### 3.1 Resources that required special handling (T007)

The following were identified from verification (Phase 4) as not receiving tags from stack-level `Tags.of(stack).add()` alone:

| Resource / scope | Cause | Fix applied |
|------------------|--------|-------------|
| **S3 auto-delete custom resource provider** (Lambda + IAM Role) | Provider is created at **app** level (singleton), so stack-level tags do not apply. | `CostAllocationTagAspect` is added to the **app** in `cdk/bin/cdk.ts`. When you run `cdk synth` (full app), these resources receive the same four cost allocation tags. |
| **BedrockAgentCore::Runtime** (L1 CfnResource) | L1 construct does not receive CDK Tag aspect in this app. | Explicit `addPropertyOverride('Tags', getCostAllocationTagValues(...))` in `execution-agent-runtime.ts` and `verification-agent-runtime.ts`. |

**Verification test note**: The Jest test in `cdk/test/cost-allocation-tags.test.ts` synthesizes a **single** stack. App-level constructs (e.g. the S3 auto-delete provider) are excluded from the assertion in that test, because they are only present when the full app is synthesized. Run `cdk synth` and inspect the template, or run the test, to confirm tag coverage.

### 3.2 Non-taggable resource types and cost attribution (T008 / FR-006)

The following CloudFormation resource types used in this app **do not support a `Tags` property**. Cost attribution alternatives are listed.

| Resource type | Role in this app | Cost attribution alternative |
|---------------|------------------|-------------------------------|
| **AWS::IAM::Policy** | Inline policies attached to roles. | The **IAM Role** that owns the policy is tagged; costs for policy operations are attributed via the role’s tags. Use stack name and resource naming in billing filters if needed. |
| **AWS::S3::BucketPolicy** | Bucket policy (e.g. block public access). | The **S3 Bucket** is tagged; the policy is tied to that bucket. |
| **AWS::Lambda::Permission** | Resource-based policy for Function URL / event source. | The **Lambda function** is tagged. |
| **AWS::Lambda::EventSourceMapping** | SQS–Lambda event source mapping. | Both the **Lambda** and the **SQS Queue** are tagged. |
| **AWS::Lambda::Url** | Lambda Function URL configuration. | The **Lambda function** is tagged; the URL is a property of that function. |
| **Custom::S3AutoDeleteObjects** | Custom resource (no Tags on the custom resource itself). | The custom resource **provider** (Lambda + IAM Role) is tagged via the app-level Aspect (see 3.1). |
| **AWS::CDK::Metadata** | CDK toolkit metadata. | Not a billable resource; no cost attribution needed. |

**General alternatives** when a resource type does not support tags:

- **Naming convention**: Use a consistent prefix (e.g. stack name, project name) in resource names so costs can be grouped by name in Cost Explorer or billing reports.
- **Account or OU separation**: Deploy environments (e.g. dev vs prod) in separate accounts or OUs and use account-level cost allocation.

---

## 4. Activate tags in AWS Billing (operator step)

After deployment, activate the user-defined tags in **Billing and Cost Management** → **Cost allocation tags** so they appear in cost allocation reports and Cost Explorer. This is an account/console step, not part of the CDK app.

---

## 5. References

- [Tags and the AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/tagging.html)
- [Organizing and tracking costs using AWS cost allocation tags](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html)
- [Best Practices for Tagging AWS Resources](https://docs.aws.amazon.com/whitepapers/latest/tagging-best-practices/)
- Spec: [spec.md](./spec.md) | Plan: [plan.md](./plan.md) | Research: [research.md](./research.md)
