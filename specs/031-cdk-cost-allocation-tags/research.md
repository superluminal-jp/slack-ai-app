# Research: CDK Cost Allocation Tags (Phase 0)

**Feature**: 031-cdk-cost-allocation-tags  
**Date**: 2026-02-14

## 1. How to apply cost allocation tags in CDK

**Decision**: Use `Tags.of(scope).add(key, value)` at stack level (and optionally at Stage level if using Stages). Keep a single, consistent set of cost allocation tag keys (e.g. Environment, Project, ManagedBy, StackName) and add any organization-defined keys (e.g. CostCenter, Application) in one place so all taggable resources under that scope receive them.

**Rationale**: AWS CDK applies tags via an Aspect; a tag applied to a construct is applied to that construct and all taggable children. Stack-level application ensures every resource in the stack that supports CloudFormation Tags receives the same cost allocation tags. [CDK Tagging](https://docs.aws.amazon.com/cdk/v2/guide/tagging.html) and [AWS Cost Allocation Tags](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html) recommend consistent tagging for cost allocation.

**Alternatives considered**:
- Applying tags per-construct: Rejected because it is error-prone and does not scale; new resources could be missed.
- Custom Aspect only: Rejected because `Tags.of().add()` is the standard, supported way and already used in this repo; a custom Aspect is only needed for resources that do not get tags from the default mechanism.

---

## 2. Which resources receive tags from `Tags.of(stack).add()`?

**Decision**: All resources in the construct tree under the given scope that are “taggable” receive the tag. CDK considers a resource taggable if the underlying CloudFormation resource type has a `Tags` property (or equivalent). L1 constructs (`CfnResource`) are tagged by the same Tag aspect when the CloudFormation type supports `Tags`.

**Rationale**: CDK documentation states that the Tag class “only tags taggable resources,” and tagging is implemented via Aspects that visit the construct tree. For `AWS::BedrockAgentCore::Runtime`, CloudFormation supports a `Tags` property, so the Runtime L1 CfnResource in this app should receive stack-level tags without extra code. We verify this in Phase 1 by inspecting the synthesized template.

**Alternatives considered**:
- Assuming L1 never gets tags: Rejected; CloudFormation reference shows many L1 types (including BedrockAgentCore::Runtime) support `Tags`.
- Adding tags manually to each CfnResource: Rejected unless verification shows they are missing; prefer single stack-level application.

---

## 3. How to verify tags from synth output

**Decision**: Use the synthesized CloudFormation template as the source of truth. Run `cdk synth` (or equivalent in tests) and inspect the template(s) in `cdk.out/` (or the in-memory template in Jest). For each resource in `Resources`, check that required cost allocation tag keys are present in the resource’s `Properties.Tags` (or equivalent, depending on resource type). Verification can be implemented as (a) Jest tests using `Template.fromStack(stack)` and assertions on resource properties, and/or (b) a small script that parses template JSON and outputs a pass/fail or list of resources missing tags.

**Rationale**: Spec requires verification “by inspecting synth output” without deploying. CDK tests already use `Template.fromStack()` and `template.hasResourceProperties()` / `findResources()`; extending them to assert on Tags is the minimal, standard approach. A script can reuse the same logic for non-Jest environments (e.g. CI or local check).

**Alternatives considered**:
- Post-deploy verification only: Rejected because spec explicitly requires synth-based verification.
- Separate “tag verification” tool outside repo: Rejected for scope; keep verification in-repo (tests + optional script).

---

## 4. Resources that may not get tags from the default mechanism

**Decision**: (1) Identify from synth output any resource that does not have the required cost allocation tags. (2) For each such resource, check CloudFormation documentation: if the type supports `Tags`, add explicit tagging (e.g. `addPropertyOverride('Tags', ...)` on the L1 construct or ensure the construct is under the tagged scope). (3) For resource types that do not support Tags in CloudFormation, document them as non-taggable and note alternatives (e.g. account-level tags, naming convention) per AWS [tagging best practices](https://docs.aws.amazon.com/whitepapers/latest/tagging-best-practices/cost-allocation-tags.html).

**Rationale**: Spec calls out L1 constructs and resources like “Bedrock InferenceProfile.” In this repo, the only L1 used for billable resources is `CfnResource` for `AWS::BedrockAgentCore::Runtime`, which does support `Tags`. If future resources (e.g. Bedrock Inference Profile or other L1) do not support Tags or are not visited by the Tag aspect, we will list them in a short “non-taggable or special-case” section in the developer docs and apply explicit or documented workarounds.

**Alternatives considered**:
- Ignoring non-taggable resources: Rejected; spec requires documenting and handling them.
- Implementing a custom Aspect that adds Tags to every CfnResource: Overkill unless we find resources that are not receiving tags; prefer verifying first then adding targeted fixes.

---

## 5. AWS cost allocation tag best practices

**Decision**: (1) Use a small, consistent set of tag keys (e.g. Environment, Project, ManagedBy, StackName; plus any org keys like CostCenter). (2) Do not include secrets or PII in tag values. (3) Activate user-defined tags in the Billing and Cost Management console for cost allocation reports. (4) Follow [AWS Tagging Best Practices](https://docs.aws.amazon.com/whitepapers/latest/tagging-best-practices/) (consistent keys, no `aws:` prefix for user tags, respect service limits).

**Rationale**: AWS docs state that cost allocation tags enable showback/chargeback, accountability, and cost visibility; activating them in Billing is required for reports. Tag key/value limits and conventions are documented in AWS and in the CloudFormation resource reference.

**Alternatives considered**: None; we adopt the standard AWS and CDK approach.

---

## 6. Folder and file organization for this feature

**Decision**: No new top-level folders. Tagging logic stays in existing stack files; verification in existing `cdk/test/` plus optional script under `cdk/scripts/` or similar if needed. Feature docs live under `specs/031-cdk-cost-allocation-tags/` (plan, research, data-model, quickstart, contracts). CDK README (or developer docs) gets a short section on cost allocation tags and how to verify them.

**Rationale**: User requested “ベストプラクティスに従ったフォルダ構成”; the repo already has a clear CDK layout and a specs-per-feature layout. Keeping changes local to stacks and tests, and documentation under the spec directory, follows that structure without introducing new top-level directories.
