# Tasks: CDK Security, Governance Standards, and Cost Tagging

**Input**: Design documents from `/specs/044-cdk-nag-governance/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅

**TDD Note**: US2 follows TDD — nag assertion tests are written FIRST (with AwsSolutionsChecks applied in test setup so violations are visible), confirmed FAILING due to real violations, then fixed by US3 IAM narrowing + US2 suppressions until GREEN.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup (platform/tooling cdk-nag Foundation)

**Purpose**: Install `cdk-nag` in the shared tooling package and create the centralized `applyNagPacks` utility. This blocks US2 and US3.

- [X] T001 Add `"cdk-nag": "^2.28.0"` to `platform/tooling/package.json` dependencies and run `npm install` in `platform/tooling/`
- [X] T002 Create `platform/tooling/src/nag/nag-packs.ts` exporting `applyNagPacks(app: cdk.App): void` that calls `cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))`
- [X] T003 Add `export * from "./src/nag/nag-packs";` to `platform/tooling/index.ts`

**Checkpoint**: `npm run build` in `platform/tooling/` passes; `applyNagPacks` is importable from `@slack-ai-app/cdk-tooling`

---

## Phase 2: User Story 1 — Coding Standards in Governance Documents (Priority: P1) 🎯 MVP

**Goal**: CLAUDE.md and constitution contain explicit, actionable standards for logging, error handling, comments, and prohibit spec identifiers in code.

**Independent Test**: Read CLAUDE.md and `.specify/memory/constitution.md`. Confirm (1) structured logging example with required fields, (2) fail-open/fail-closed error handling examples, (3) comment/docstring rules, (4) prohibition on spec numbers/branch names/task IDs with rationale.

- [X] T004 [P] [US1] Add "Python Coding Standards" section to `CLAUDE.md` with: (a) logging rule using `log(logger, level, event_type, data_dict)`, required fields per level (INFO/WARNING/ERROR), before/after example prohibiting raw `print()`; (b) error handling rule with fail-closed (security) and fail-open (infrastructure) `except` block examples; (c) comment/docstring rule: describe what/why not how, no spec numbers/branch names/task IDs in any code
- [X] T005 [P] [US1] Add Principle VII "Clean Code Identifiers" to `.specify/memory/constitution.md`; bump version 1.1.0 → 1.2.0; rule text: spec numbers (e.g. `(027)`), branch names (e.g. `041-s3-replication-archive`), task IDs (e.g. `T014`), and user story labels MUST NOT appear in source code, docstrings, comments, or test names — with rationale (identifiers become meaningless after lifecycle ends, create cleanup debt)
- [X] T006 [P] [US1] Remove spec identifier comment `// 026 US1 (T007):` from `verification-zones/verification-agent/cdk/lib/constructs/slack-event-handler.ts`; rewrite the comment to describe the intent without the tracking reference
- [X] T007 [P] [US1] Remove branch name from deprecated docstring `.. deprecated:: 036-iterative-reasoning` in `verification-zones/verification-agent/src/router.py`; replace with plain deprecation notice describing what changed

**Checkpoint**: US1 is fully testable — governance docs contain all required standards; no spec-number annotations remain in the two known violation files

---

## Phase 3: User Story 2 — Automated CDK Security Scanning (Priority: P2)

**Goal**: All 6 CDK stacks run `AwsSolutionsChecks` during test and synthesis; zero unresolved violations; every suppression has a written justification.

**Independent Test**: Add a wildcard IAM resource to any stack and run Jest — expect the test to fail with a cdk-nag error identifying the violation.

**Depends on**: Phase 1 complete (applyNagPacks available)

### Step A — Add cdk-nag to zone package.json files

- [X] T008 [P] [US2] Add `"cdk-nag": "^2.28.0"` to `execution-zones/file-creator-agent/cdk/package.json` dependencies and run `npm install`
- [X] T009 [P] [US2] Add `"cdk-nag": "^2.28.0"` to `execution-zones/fetch-url-agent/cdk/package.json` dependencies and run `npm install`
- [X] T010 [P] [US2] Add `"cdk-nag": "^2.28.0"` to `execution-zones/docs-agent/cdk/package.json` dependencies and run `npm install`
- [X] T011 [P] [US2] Add `"cdk-nag": "^2.28.0"` to `execution-zones/time-agent/cdk/package.json` dependencies and run `npm install`
- [X] T012 [P] [US2] Add `"cdk-nag": "^2.28.0"` to `verification-zones/verification-agent/cdk/package.json` dependencies and run `npm install`
- [X] T013 [P] [US2] Add `"cdk-nag": "^2.28.0"` to `verification-zones/slack-search-agent/cdk/package.json` dependencies and run `npm install`

### Step B — Write nag assertion tests (TDD: write FIRST, confirm FAILING)

> **Write these tests before adding suppressions. Apply `AwsSolutionsChecks` in test setup so violations appear. Assert `errors.length === 0`. Tests MUST fail before proceeding to Step D.**

- [X] T014 [P] [US2] Add nag assertion test `"stack has no cdk-nag errors"` to `execution-zones/file-creator-agent/cdk/test/file-creator-agent-stack.test.ts`: apply `AwsSolutionsChecks` in test `app`; assert `Annotations.fromStack(stack).findError("*", Match.stringLikeRegexp(".*"))` has length 0; confirm test FAILS
- [X] T015 [P] [US2] Add nag assertion test to `execution-zones/fetch-url-agent/cdk/test/web-fetch-agent-stack.test.ts`; confirm test FAILS
- [X] T016 [P] [US2] Add nag assertion test to `execution-zones/docs-agent/cdk/test/docs-agent-stack.test.ts`; confirm test FAILS
- [X] T017 [P] [US2] Add nag assertion test to `execution-zones/time-agent/cdk/test/time-agent-stack.test.ts`; confirm test FAILS
- [X] T018 [P] [US2] Add nag assertion test to `verification-zones/verification-agent/cdk/test/verification-stack.test.ts`; confirm test FAILS
- [X] T019 [P] [US2] Add nag assertion test to `verification-zones/slack-search-agent/cdk/test/slack-search-agent-stack.test.ts`; confirm test FAILS

### Step C — Apply applyNagPacks in bin/cdk.ts (synthesis-time checking)

- [X] T020 [P] [US2] Import `applyNagPacks` from `@slack-ai-app/cdk-tooling` and call `applyNagPacks(app)` after stack creation in `execution-zones/file-creator-agent/cdk/bin/cdk.ts`
- [X] T021 [P] [US2] Apply `applyNagPacks(app)` in `execution-zones/fetch-url-agent/cdk/bin/cdk.ts`
- [X] T022 [P] [US2] Apply `applyNagPacks(app)` in `execution-zones/docs-agent/cdk/bin/cdk.ts`
- [X] T023 [P] [US2] Apply `applyNagPacks(app)` in `execution-zones/time-agent/cdk/bin/cdk.ts`
- [X] T024 [P] [US2] Apply `applyNagPacks(app)` in `verification-zones/verification-agent/cdk/bin/cdk.ts`
- [X] T025 [P] [US2] Apply `applyNagPacks(app)` in `verification-zones/slack-search-agent/cdk/bin/cdk.ts`

### Step D — Add NagSuppressions for required wildcards

> **Add suppressions for AWS-constrained wildcards only. Bedrock wildcard is resolved in US3 (Phase 4), not here.**

- [X] T026 [P] [US2] Add `NagSuppressions.addResourceSuppressions` to `execution-zones/file-creator-agent/cdk/lib/constructs/file-creator-agent-runtime.ts` for: `AwsSolutions-IAM5` on ECR `*` (sid `ECRImageAccess` — `ecr:GetAuthorizationToken` requires `*`; AWS does not accept per-repo ARNs); `AwsSolutions-IAM5` on XRay `*` (sid `XRayTracing` — X-Ray sampling APIs require `*`; AWS service design constraint); `AwsSolutions-IAM5` on CloudWatch `*` (sid `CloudWatchMetrics` — `cloudwatch:PutMetricData` requires `*`; namespace condition narrows effective scope)
- [X] T027 [P] [US2] Add equivalent NagSuppressions (ECR/XRay/CloudWatch wildcards with justifications) to `execution-zones/fetch-url-agent/cdk/lib/constructs/web-fetch-agent-runtime.ts`
- [X] T028 [P] [US2] Add equivalent NagSuppressions to `execution-zones/docs-agent/cdk/lib/constructs/docs-agent-runtime.ts`
- [X] T029 [P] [US2] Add equivalent NagSuppressions to `execution-zones/time-agent/cdk/lib/constructs/time-agent-runtime.ts`
- [X] T030 [P] [US2] Add NagSuppressions to `verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts` for: ECR/XRay/CloudWatch wildcards (same justifications); any `AwsSolutions-IAM5` on DynamoDB wildcard paths if flagged
- [X] T031 [P] [US2] Add `AwsSolutions-SMG4` suppression to `verification-zones/verification-agent/cdk/lib/constructs/slack-event-handler.ts` (or wherever Slack token Secrets Manager resource is defined): justification — Slack API tokens do not support programmatic rotation; rotated manually via Slack app settings
- [X] T032 [P] [US2] Add `AwsSolutions-S1` suppression to `verification-zones/verification-agent/cdk/lib/constructs/usage-history-bucket.ts`: justification — usage history bucket; object-level audit via CloudTrail S3 events sufficient; server access logging not required
- [X] T033 [P] [US2] Add `AwsSolutions-S1` suppression to `verification-zones/verification-agent/cdk/lib/constructs/usage-history-archive-bucket.ts`: same justification as usage-history bucket
- [X] T034 [P] [US2] Add NagSuppressions to `verification-zones/slack-search-agent/cdk/lib/constructs/slack-search-agent-runtime.ts` for ECR/XRay/CloudWatch wildcards with justifications

**Checkpoint (US2 partial)**: All nag assertion tests still FAIL because Bedrock `resources: ["*"]` violations remain — fixed in Phase 4 (US3). Tests go GREEN after Phase 4.

---

## Phase 4: User Story 3 — IAM Least-Privilege Compliance (Priority: P3)

**Goal**: `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` are scoped to `arn:aws:bedrock:REGION::foundation-model/*` and `arn:aws:bedrock:REGION:ACCOUNT:inference-profile/*` in all 6 runtimes; no remaining `AwsSolutions-IAM5` violations; all 6 nag assertion tests GREEN.

**Independent Test**: Synthesize any stack and inspect `AWS::IAM::Policy` resources — no `"Resource": "*"` under Bedrock actions without a suppression.

**Depends on**: Phase 3 Steps A–D complete (suppressions in place; tests written and failing on Bedrock wildcard)

- [X] T035 [P] [US3] In `execution-zones/file-creator-agent/cdk/lib/constructs/file-creator-agent-runtime.ts`: replace `resources: ["*"]` under `bedrock:InvokeModel` / `bedrock:InvokeModelWithResponseStream` with `resources: [\`arn:aws:bedrock:${stack.region}::foundation-model/*\`, \`arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/*\`]`
- [X] T036 [P] [US3] Apply same Bedrock ARN narrowing in `execution-zones/fetch-url-agent/cdk/lib/constructs/web-fetch-agent-runtime.ts`
- [X] T037 [P] [US3] Apply same Bedrock ARN narrowing in `execution-zones/docs-agent/cdk/lib/constructs/docs-agent-runtime.ts`
- [X] T038 [P] [US3] Apply same Bedrock ARN narrowing in `execution-zones/time-agent/cdk/lib/constructs/time-agent-runtime.ts`
- [X] T039 [P] [US3] Apply same Bedrock ARN narrowing in `verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts`
- [X] T040 [P] [US3] Apply same Bedrock ARN narrowing in `verification-zones/slack-search-agent/cdk/lib/constructs/slack-search-agent-runtime.ts`
- [X] T041 [US3] Run `npm test` in each of the 6 CDK zones; confirm all nag assertion tests now pass (GREEN) with zero unresolved violations

**Checkpoint**: All 6 nag assertion tests GREEN. `cdk synth` exits zero in all zones. No `resources: ["*"]` for data-plane Bedrock actions without suppressions.

---

## Phase 5: User Story 4 — Cost Allocation Tags on All Billing Resources (Priority: P4)

**Goal**: Every billing resource in every synthesized stack carries `Project`, `Environment`, and `ManagedBy` tags; `TAGGABLE_CFN_TYPES` covers all billing resource types present in the stacks.

**Independent Test**: Run `cdk synth` on the verification-agent stack and grep the CloudFormation template for `AWS::Scheduler::Schedule`, `AWS::WAFv2::WebACL`, `AWS::ApiGateway::RestApi` — each should have a `Tags` property with the required keys.

- [X] T042 [US4] Run `cdk synth` for `verification-zones/verification-agent/cdk/`; grep the output for `AWS::Scheduler::Schedule`, `AWS::WAFv2::WebACL`, `AWS::ApiGateway::RestApi` resource blocks; check if `Tags` property is present on each
- [X] T043 [US4] If any billing resource type from T042 is missing tags, add the CFN type string (e.g. `"AWS::Scheduler::Schedule"`) to the `TAGGABLE_CFN_TYPES` set in `platform/tooling/src/utils/cost-allocation-tags.ts`; rebuild platform/tooling
- [X] T044 [P] [US4] Add Jest assertion to `verification-zones/verification-agent/cdk/test/verification-stack.test.ts` verifying that the synthesized template contains `Project`, `Environment`, and `ManagedBy` tags on at least one billing resource (use `Template.fromStack(stack).hasResource(...)` or `hasResourceProperties`)
- [X] T045 [P] [US4] Add Jest assertion to `execution-zones/file-creator-agent/cdk/test/file-creator-agent-stack.test.ts` verifying cost allocation tags presence on billing resources

**Checkpoint**: All 6 stacks synthesize with cost allocation tags on billing resources; tag assertions pass in Jest.

---

## Phase 6: Polish & Cross-Cutting Concerns

### Mandatory: Documentation & Deploy-Script Sync (Principle VI)

 - [X] T046 [P] Add `[Unreleased]` entry to `CHANGELOG.md`: `### Added` — `cdk-nag` AwsSolutions security scanning applied across all 6 CDK stacks; Bedrock IAM narrowed from wildcard to foundation-model/* ARN; Python coding standards (logging, error handling, comments) added to CLAUDE.md; Constitution Principle VII (no spec identifiers in code) added; cost allocation tag coverage verified. `### Changed` — NagSuppressions with written justifications for ECR/XRay/CloudWatch/S3/SM wildcards; removed spec-identifier annotations from `slack-event-handler.ts` and `router.py`
 - [X] T047 [P] Update `CLAUDE.md` "Active Technologies" section to add `cdk-nag ^2.28.0` (platform/tooling); update "Recent Changes" with `044-cdk-nag-governance` entry
 - [X] T048 [P] Update `verification-zones/verification-agent/cdk/README.md` to note cdk-nag scanning is active and Bedrock IAM is narrowed
 - [X] T049 [P] Update `verification-zones/verification-agent/README.md` to reflect the Principle VII constitution update
- [X] T050 Run full test suite across all zones: `cd execution-zones/file-creator-agent/cdk && npm test`; `cd execution-zones/fetch-url-agent/cdk && npm test`; `cd execution-zones/docs-agent/cdk && npm test`; `cd execution-zones/time-agent/cdk && npm test`; `cd verification-zones/verification-agent/cdk && npm test`; `cd verification-zones/slack-search-agent/cdk && npm test`; all must pass
- [ ] T051 Run `grep -rn "0[0-9][0-9][[:space:]]\\|0[0-9][0-9]:\\|([0-9][0-9][0-9])\\|US[0-9]\\|T[0-9][0-9][0-9]\\b\\|[0-9][0-9][0-9]-[a-z]" execution-zones/ verification-zones/ --include="*.py" --include="*.ts" | grep -v ".d.ts" | grep -v "node_modules" | grep -v "cdk.out" | grep -v "429\\|200\\|201\\|400\\|401\\|403\\|404\\|500"` to confirm zero spec-identifier violations remain

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1)**: Independent of Phase 1 — can run in parallel with Phase 1
- **Phase 3 (US2)**: Requires Phase 1 complete (applyNagPacks available)
- **Phase 4 (US3)**: Requires Phase 3 Steps A–D complete (suppressions in place, tests written)
- **Phase 5 (US4)**: Independent — can start after Phase 1 completes
- **Phase 6 (Polish)**: Requires all user story phases complete

### User Story Dependencies

- **US1 (P1)**: Independent — governance documents only, no code deps
- **US2 (P2)**: Depends on Phase 1 (applyNagPacks utility)
- **US3 (P3)**: Depends on US2 suppressions being in place (tests are written, nag is applied)
- **US4 (P4)**: Independent — depends only on Phase 1 for platform/tooling rebuild

### Within Each Phase

- All tasks marked [P] within a phase can run in parallel (different files)
- Step B (tests) must be confirmed FAILING before Step D (suppressions) starts
- T041 (confirm GREEN) must run after all suppressions and Bedrock narrowing are complete

---

## Parallel Example: US2 Phase 3

```bash
# Run all 6 zone package.json additions in parallel (T008-T013)
# Then run all 6 test writes in parallel (T014-T019)
# Then run all 6 bin/cdk.ts updates in parallel (T020-T025)
# Then run all suppression additions in parallel (T026-T034)
```

## Parallel Example: US3 Phase 4

```bash
# All 6 Bedrock ARN narrowing tasks run in parallel (T035-T040)
# Then T041 runs sequentially to confirm all tests GREEN
```

---

## Implementation Strategy

### MVP (US1 only — governance docs)

1. Phase 2: US1 tasks (T004–T007)
2. **STOP and VALIDATE**: Read CLAUDE.md and constitution; confirm standards present and spec identifiers removed
3. US1 is complete and independently deliverable

### Full Delivery (Recommended order)

1. Phase 1 + Phase 2 in parallel (T001–T007)
2. Phase 3 Steps A–B: add cdk-nag to zones, write failing tests (T008–T019)
3. Phase 3 Steps C–D: apply nag packs, add suppressions (T020–T034)
4. Phase 4: narrow Bedrock ARNs, confirm tests GREEN (T035–T041)
5. Phase 5: cost allocation tag verification (T042–T045)
6. Phase 6: docs, CHANGELOG, final validation (T046–T051)

---

## Notes

- [P] tasks operate on different files with no shared state — safe to parallelize
- Each zone's CDK test file is a self-contained Jest test suite
- `NagSuppressions.addResourceSuppressions(construct, [...])` is preferred over stack-level suppressions to avoid hiding future violations
- Every suppression MUST include `reason` text (the written justification) in the suppressions array
- The `applyNagPacks(app)` call in `bin/cdk.ts` ensures `cdk synth` fails on violations; the same nag pack applied in Jest tests ensures CI catches regressions
- Bedrock `foundation-model/*` ARN uses `::` (no account ID) — double-colon is correct for foundation models
