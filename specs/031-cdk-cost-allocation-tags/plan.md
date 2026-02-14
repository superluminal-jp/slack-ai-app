# Implementation Plan: CDK Cost Allocation Tags

**Branch**: `031-cdk-cost-allocation-tags` | **Date**: 2026-02-14 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/031-cdk-cost-allocation-tags/spec.md`

## Summary

Apply cost allocation tags to all CDK-provisioned resources so that billing can be separated by project, environment, or component. Use the synthesized CloudFormation template (e.g. from `cdk synth`) as the source of truth for verification. Identify and handle resources that do not receive tags from the default mechanism (e.g. L1 CfnResource, or resource types without a Tags property in CloudFormation). Align with AWS tagging best practices and CDK’s `Tags.of(scope).add()` and Aspects.

## Technical Context

**Language/Version**: TypeScript 5.x (CDK app in `cdk/`)  
**Primary Dependencies**: aws-cdk-lib, constructs; Jest for CDK assertions (Template.fromStack)  
**Storage**: N/A (tags are template metadata; Cost Explorer uses tags from deployed resources)  
**Testing**: Jest in `cdk/test/`; synth-based verification (template inspection)  
**Target Platform**: AWS (CloudFormation); CDK app runs at synth/deploy time  
**Project Type**: CDK app (bin + lib + test); no new backend/frontend  
**Performance Goals**: Synth and verification run in normal CI time (< few minutes)  
**Constraints**: Tag keys/values must comply with AWS limits (e.g. key length, no `aws:` prefix for user tags); some resources may not support Tags in CloudFormation  
**Scale/Scope**: All stacks in this repo (Execution, Verification); all resources in their synthesized templates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is a template; no project-specific gates are defined. The following are applied from project guidelines (CLAUDE.md, user rules):

- **Documentation**: Update CDK README and any developer docs to describe cost allocation tags and how to verify them (pass).
- **Testing**: Add or extend tests that assert tag presence in synthesized templates (pass).
- **No hardcoded secrets**: Tag values may reference context (e.g. deploymentEnv); no secrets in tags (pass).
- **Consistency**: Use existing stack-level `Tags.of(this).add()` pattern and extend to a single, consistent set of cost allocation tags (pass).

*Re-check after Phase 1*: Same criteria; verification approach (test or script) must be documented and repeatable.

## Project Structure

### Documentation (this feature)

```text
specs/031-cdk-cost-allocation-tags/
├── plan.md              # This file
├── research.md          # Phase 0: tagging approach, L1/synth verification
├── data-model.md        # Phase 1: tag set, resource-in-template, verification result
├── quickstart.md        # Phase 1: how to add tags and run verification
├── contracts/           # Phase 1: verification report schema (optional)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 (/speckit.tasks – not created by plan)
```

### Source Code (repository root)

Existing layout; no new top-level directories. Changes are confined to:

```text
cdk/
├── bin/
│   └── cdk.ts                    # App entry; stacks already instantiated
├── lib/
│   ├── execution/
│   │   └── execution-stack.ts    # Already Tags.of(this).add(...); align/add cost tags
│   └── verification/
│       └── verification-stack.ts # Already Tags.of(this).add(...); align/add cost tags
├── test/
│   ├── execution-stack.test.ts   # Add tag assertions
│   ├── verification-stack.test.ts
│   └── (optional) cost-allocation-tags.test.ts  # Synth-wide verification
├── cdk.json                       # Already @aws-cdk/core:explicitStackTags
└── package.json
```

**Structure Decision**: No new apps or packages. Cost allocation is implemented by standardizing tags at stack level (and optionally via an Aspect for any scope), and verification by inspecting the synthesized template(s) in tests or a small script. L1 constructs (e.g. `CfnResource` for `AWS::BedrockAgentCore::Runtime`) are covered by CDK’s Tag aspect if the CloudFormation resource type supports `Tags`; otherwise they are documented and explicitly tagged where the API allows.

## Complexity Tracking

None. No constitution violations; no additional projects or heavy patterns.
