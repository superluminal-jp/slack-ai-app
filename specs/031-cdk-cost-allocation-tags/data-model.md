# Data Model: CDK Cost Allocation Tags (Phase 1)

**Feature**: 031-cdk-cost-allocation-tags  
**Date**: 2026-02-14

This feature does not introduce a runtime database or API. The “data” is (1) the set of cost allocation tags defined for the app, (2) the synthesized template’s view of resources and their tags, and (3) the result of verification. The following describes these entities for design and verification tooling.

---

## 1. Cost allocation tag set

**Entity**: The set of tag key-value pairs that the CDK app applies for cost allocation.

| Concept        | Description |
|----------------|-------------|
| Tag key        | String (e.g. `Environment`, `Project`, `ManagedBy`, `StackName`). Must comply with AWS tag key rules (e.g. no `aws:` prefix for user tags). |
| Tag value      | String (e.g. `dev`, `SlackAI`, `CDK`, stack name). No secrets or PII. |
| Scope          | Defined once per stack (or Stage) and applied to all taggable resources under that scope. |

**Validation**: Keys and values must meet AWS and CloudFormation limits (e.g. key length, value length, max tags per resource). No validation of “cost center” semantics in code; that is organizational policy.

**State**: Defined at synthesis time in code (e.g. `Tags.of(this).add(key, value)`). No separate state store.

---

## 2. Resource in synthesized template

**Entity**: A single entry in the synthesized CloudFormation template’s `Resources` section.

| Concept           | Description |
|-------------------|-------------|
| Logical ID        | CloudFormation logical resource ID (e.g. `ExecutionAgentRuntimeRuntimeXXXX`). |
| Resource type     | CloudFormation type (e.g. `AWS::Lambda::Function`, `AWS::BedrockAgentCore::Runtime`). |
| Properties.Tags   | Present only if the resource type supports tags. Format may be `{ Key: Value }` map or array of `{ Key, Value }` depending on type. |

**Relationships**: Each resource belongs to one stack. Verification iterates over all resources in one or more synthesized templates and checks for required tag keys.

**State**: Ephemeral; produced by `cdk synth` and read by tests or a verification script.

---

## 3. Verification result

**Entity**: Outcome of checking synthesized template(s) for cost allocation tag presence.

| Concept              | Description |
|----------------------|-------------|
| Pass / fail          | Whether every taggable resource has all required cost allocation tag keys. |
| Taggable resources   | Resources whose CloudFormation type supports a Tags (or equivalent) property. |
| Missing tags         | Optional list: resource logical ID + type + which required keys are missing. |
| Non-taggable list    | Optional list: resource types (or logical IDs) that do not support Tags; for documentation only. |

**Validation**: Required tag keys are defined in code or config used by the verification logic (e.g. same list as used when applying tags).

**State**: Produced at verification time (test run or script); may be output as test assertion, JSON, or log.

---

## 4. Non-taggable or special-case resources

**Entity**: Resource types (or specific resources) that either do not support Tags in CloudFormation or do not receive tags from the default CDK Tag aspect.

| Concept     | Description |
|-------------|-------------|
| Resource type | e.g. a type that has no `Tags` property in CloudFormation. |
| Handling    | Document as non-taggable; or add explicit tagging (e.g. `addPropertyOverride`) if the type supports Tags but the aspect does not apply. |

**State**: Documented in developer docs or in a short list in the repo (e.g. in README or `specs/031-cdk-cost-allocation-tags/quickstart.md`). Updated when new stacks or resource types are added.
