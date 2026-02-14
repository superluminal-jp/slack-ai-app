# Feature Specification: CDK Cost Allocation Tags

**Feature Branch**: `031-cdk-cost-allocation-tags`  
**Created**: 2026-02-14  
**Status**: Draft  
**Input**: User description: "全てのCDKリソースにコスト配分タグをつけて料金の分離を図る。cdk synthの結果を元に付いているかどうかを判別。L1コンストラクトやBedrock InferenceProfileなど、自動的に一括でつけられないものに注意"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cost Separation by Tag (Priority: P1)

Operators and finance need to see cloud costs broken down by project, environment, or component. All resources provisioned by the CDK app should carry cost allocation tags so that billing and cost reports can separate and attribute spend correctly.

**Why this priority**: Cost visibility and separation are the primary goal; without tagged resources, cost allocation cannot be achieved.

**Independent Test**: Run the app’s synthesis; inspect the generated template (or equivalent output). Every resource that supports tags and is expected to incur cost has the agreed cost allocation tags. Can be tested by comparing synth output against a list of taggable resources.

**Acceptance Scenarios**:

1. **Given** the CDK application is synthesized, **When** the synthesized output is inspected, **Then** every taggable resource that can receive tags via the normal tagging mechanism includes the defined cost allocation tags.
2. **Given** cost allocation tags are defined for the app, **When** a new stack or construct is added, **Then** the same tagging approach applies so that new resources are tagged without extra one-off steps where the framework supports it.

---

### User Story 2 - Verification via Synth Output (Priority: P2)

Stakeholders need a reliable way to confirm that tags are present. Verification is based on the synthesized output (e.g. template produced by synth) so that presence of tags can be checked without deploying and without relying on runtime-only inspection.

**Why this priority**: Verification ensures the tagging requirement is met and prevents regressions when adding or changing resources.

**Independent Test**: Run synth, parse or query the synth output (e.g. template), and assert that each expected taggable resource has the required cost allocation tags. Can be automated as a test or script.

**Acceptance Scenarios**:

1. **Given** the CDK app is synthesized, **When** the synth output is analyzed (e.g. template or equivalent), **Then** it is possible to determine for each taggable resource whether the cost allocation tags are present.
2. **Given** a list of resource types or identifiers that support tags, **When** verification runs against synth output, **Then** the result clearly indicates which resources have the tags and which do not (so that manual or per-resource tagging can be applied where needed).

---

### User Story 3 - Handling Resources That Cannot Be Tagged in Bulk (Priority: P3)

Some resources (e.g. L1 constructs, Bedrock InferenceProfile, or other managed resources) do not inherit or receive tags from a single bulk or stack-level mechanism. These must be identified and handled explicitly so that cost separation is still achieved where the platform allows.

**Why this priority**: Ensures cost allocation is as complete as possible and avoids false confidence that “all resources” are tagged when some are not covered by the default mechanism.

**Independent Test**: From synth output, produce a list of resources that do not have the cost allocation tags. For each, determine whether the resource type supports tags at all; where it does, document or implement the explicit tagging (e.g. per-resource or L1 property). Where it does not, document that the resource is not taggable.

**Acceptance Scenarios**:

1. **Given** synthesized output, **When** resources are checked for cost allocation tags, **Then** resources that did not receive tags via the default mechanism are explicitly listed or reported.
2. **Given** a resource type that supports tags but does not get them from the bulk mechanism (e.g. certain L1 or managed resources), **When** the app is updated, **Then** that resource is tagged by an explicit, documented approach so that cost can still be attributed.
3. **Given** a resource type that does not support tags in the platform, **When** documented, **Then** it is clear that cost for that resource cannot be separated by tag and any workaround (e.g. naming, separate account) is described.

---

### Edge Cases

- What happens when a new stack or construct is added and the developer does not apply the tagging pattern? Verification against synth output should flag missing tags so it can be caught before or during review.
- How does the system handle resources that support tags only on create and not via a stack-level or aspect-based mechanism? They must be identified in synth output and explicitly tagged where the API allows.
- What if a resource type (e.g. Bedrock InferenceProfile or an L1-only resource) has no Tags property in the synthesized template? The feature treats it as “not taggable by synth” and requires explicit tagging or documentation.
- What if tag key or value length/format differs by service? Tagging approach must respect platform limits so that synth and deployment succeed; validation or docs should call out any service-specific constraints.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CDK app MUST apply the same set of cost allocation tags to every resource that can receive tags through the app’s chosen tagging mechanism (e.g. stack tags, aspect, or default).
- **FR-002**: Cost allocation tags MUST be visible in the synthesized output (e.g. in the generated template or equivalent) so that presence can be verified without deploying.
- **FR-003**: Verification MUST be possible by inspecting synth output: for each taggable resource in that output, it MUST be determinable whether the defined cost allocation tags are present.
- **FR-004**: Resources that do not receive cost allocation tags via the default/bulk mechanism MUST be identifiable from the synth output (or from a report derived from it).
- **FR-005**: For each such resource that supports tags but is not covered by the bulk mechanism, there MUST be an explicit, documented way to add cost allocation tags (e.g. per-resource or L1 property) so that cost separation is achieved where the platform allows.
- **FR-006**: Resource types that do not support tags in the underlying platform MUST be documented as non-taggable, with any alternative for cost attribution (e.g. naming, account separation) described.

### Key Entities

- **Cost allocation tag**: A key-value pair applied to a resource for the purpose of cost and usage attribution (e.g. project, environment, component). Defined once for the app and applied consistently.
- **Taggable resource**: A resource in the synthesized output that has a Tags (or equivalent) property and can receive the cost allocation tags.
- **Synthesized output**: The artifact produced by synth (e.g. CloudFormation template or equivalent) used as the source of truth for “which resources exist” and “which have tags.”
- **Non-bulk-taggable resource**: A resource that supports tags but does not receive them from the app’s default/bulk tagging mechanism (e.g. some L1 constructs or managed resources like Bedrock InferenceProfile); requires explicit tagging or documentation.

## Assumptions

- Cost allocation tag keys and values are defined at the app or organization level and are not specified in this feature (only that they are applied consistently and verifiable).
- “Synth output” is the primary verification artifact; the exact format (e.g. single template, multiple files) is determined by the CDK app and tooling.
- L1 constructs and certain managed resources (e.g. Bedrock InferenceProfile) may not support stack-level or aspect-based tagging; the feature requires identifying and handling them explicitly rather than assuming universal bulk tagging.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of resources that support tags and are covered by the app’s bulk/default tagging mechanism carry the defined cost allocation tags in the synthesized output.
- **SC-002**: Verification can be run against synth output and produces a clear pass/fail (or list of compliant/non-compliant resources) for cost allocation tag presence on taggable resources.
- **SC-003**: All resources that incur cost and support tags are either tagged via the default mechanism or explicitly tagged via a documented approach; the set of resources that cannot be tagged is documented with alternatives for cost attribution where applicable.
- **SC-004**: Operators can use billing and cost reports filtered by the cost allocation tags to separate costs for this app’s resources from other workloads.
