# Tasks: CDK Cost Allocation Tags

**Input**: Design documents from `specs/031-cdk-cost-allocation-tags/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Verification tests are included (FR-003, SC-002). **TDD**: 「cdk synth でタグが付いたか確認するテスト」はテスト先行で実施する。Phase 3 では Runtime のタグ検証テストを先に書き失敗を確認（Red）、実装で成功（Green）。Phase 4 では全 taggable リソースの検証テストを先に書き失敗を確認（Red）、不足タグを修正して成功（Green）。

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- CDK app: `cdk/` at repository root (`cdk/lib/`, `cdk/test/`, `cdk/scripts/`)
- Spec docs: `specs/031-cdk-cost-allocation-tags/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Single source of truth for cost allocation tag keys and application so stacks and verification stay consistent.

- [x] T001 Create shared cost allocation tag module exporting `REQUIRED_COST_ALLOCATION_TAG_KEYS` and `applyCostAllocationTags(scope, options)` in `cdk/lib/utils/cost-allocation-tags.ts` (keys: Environment, Project, ManagedBy, StackName; helper applies Tags.of(scope).add for each with values from options and stack.stackName).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Both stacks use the same cost allocation tag set from the shared module. No user story work should start until this is done.

- [x] T002 Update `cdk/lib/execution/execution-stack.ts` to call `applyCostAllocationTags(this, { deploymentEnv })` instead of inline `Tags.of(this).add(...)` and remove the four existing tag lines.
- [x] T003 [P] Update `cdk/lib/verification/verification-stack.ts` to call `applyCostAllocationTags(this, { deploymentEnv })` instead of inline `Tags.of(this).add(...)` and remove the four existing tag lines.

**Checkpoint**: Both stacks apply the same tag set from one module; foundation ready for story implementation.

---

## Phase 3: User Story 1 – Cost Separation by Tag (Priority: P1) – MVP

**Goal**: Every taggable resource in the synthesized template has the defined cost allocation tags (Environment, Project, ManagedBy, StackName).

**Independent Test**: Run `cdk synth` (or Jest that synthesizes both stacks); inspect template(s); every resource that supports Tags has those four keys in Properties.Tags.

**TDD flow**: テストを先に書き失敗を確認（Red）→ 実装で成功（Green）。

- [x] T004a [US1] **(TDD Red)** Add test that asserts `AWS::BedrockAgentCore::Runtime` has cost allocation tags in synthesized template: in `cdk/test/execution-stack.test.ts` add it("should have cost allocation tags on AgentCore Runtime") asserting Properties.Tags includes all `REQUIRED_COST_ALLOCATION_TAG_KEYS`; in `cdk/test/verification-stack.test.ts` add it("AgentCore Runtime should have cost allocation tags") with same assertion. Run `npm test -- --testPathPattern="execution-stack|verification-stack"` and **confirm the new tests FAIL** (Runtime has no Tags from aspect yet).
- [x] T004b [US1] **(TDD Green)** Implement explicit Tags so tests pass: add `getCostAllocationTagValues` in `cdk/lib/utils/cost-allocation-tags.ts`; in `cdk/lib/execution/constructs/execution-agent-runtime.ts` and `cdk/lib/verification/constructs/verification-agent-runtime.ts` call `this.runtime.addPropertyOverride('Tags', getCostAllocationTagValues({ deploymentEnv, stackName: stack.stackName }))` (deploymentEnv from context/env). Run tests and **confirm they PASS**.

**Checkpoint**: All taggable resources, including L1 CfnResource for BedrockAgentCore::Runtime, carry cost allocation tags in synth output.

---

## Phase 4: User Story 2 – Verification via Synth Output (Priority: P2)

**Goal**: Verification can be run against synth output and produces a clear pass/fail (or list of compliant/non-compliant resources) for cost allocation tag presence.

**Independent Test**: Run Jest test(s) that synthesize stacks and assert each taggable resource has required tag keys; test fails if any taggable resource is missing a key.

**TDD flow**: 全 taggable リソースを検証するテストを先に書き失敗を確認（Red）→ 不足タグを修正して成功（Green）。

- [x] T005a [P] [US2] **(TDD Red)** Write cost allocation tag verification test in `cdk/test/cost-allocation-tags.test.ts`: synthesize Execution and Verification stacks, iterate taggable resource types (e.g. AWS::Lambda::Function, AWS::S3::Bucket, AWS::DynamoDB::Table, AWS::BedrockAgentCore::Runtime, AWS::SQS::Queue, AWS::SecretsManager::Secret, AWS::IAM::Role, AWS::Logs::LogGroup, etc.), for each resource assert Properties.Tags (or equivalent) includes all `REQUIRED_COST_ALLOCATION_TAG_KEYS` from `cdk/lib/utils/cost-allocation-tags.ts`. Run `npm test -- --testPathPattern="cost-allocation-tags"` and **confirm the test FAILs** (at least one resource type or instance missing tags).
- [x] T005b [US2] **(TDD Green)** Fix any resources missing tags (ensure scope or explicit `addPropertyOverride`) until `cdk/test/cost-allocation-tags.test.ts` passes. Re-run test and **confirm it PASSes**.
- [ ] T006 [P] [US2] (Optional) Add script `cdk/scripts/verify-cost-allocation-tags.ts` (or .js) that runs synth, parses template(s) from `cdk.out/`, checks each taggable resource for required keys, and outputs JSON matching `specs/031-cdk-cost-allocation-tags/contracts/tag-verification-report.schema.json` (ok, requiredTagKeys, missingTags, nonTaggable).

**Checkpoint**: Verification is automated via Jest; optional script available for CI or local use.

---

## Phase 5: User Story 3 – Handling Resources That Cannot Be Tagged in Bulk (Priority: P3)

**Goal**: Resources that do not receive tags via the default mechanism are identified; taggable ones are explicitly tagged or fixed; non-taggable types are documented with alternatives.

**Independent Test**: From verification output (or test failure), list resources missing tags; each taggable type is fixed or documented; each non-taggable type is documented.

- [x] T007 [US3] Using verification test (or script) output, list any resources missing required tags; for each resource type that supports Tags in CloudFormation, ensure scope or explicit tagging is applied so the next synth passes verification; document any remaining exceptions in `specs/031-cdk-cost-allocation-tags/quickstart.md`.
- [x] T008 [US3] Document non-taggable resource types (if any) and cost attribution alternatives (e.g. account tags, naming) in `cdk/README.md` or `specs/031-cdk-cost-allocation-tags/quickstart.md` per FR-006.

**Checkpoint**: All taggable resources are tagged; non-taggable resources are documented with alternatives.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final validation.

- [x] T009 [P] Add “Cost allocation tags” section to `cdk/README.md`: describe tag keys (Environment, Project, ManagedBy, StackName), that they are applied at stack level, how to verify (run Jest test or optional script), and link to `specs/031-cdk-cost-allocation-tags/quickstart.md`.
- [x] T010 Run quickstart validation: execute `cdk synth` and the cost allocation tag verification test in `cdk/test/cost-allocation-tags.test.ts`; confirm all steps in `specs/031-cdk-cost-allocation-tags/quickstart.md` are accurate.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies – start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 – blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2 – apply/fix tags so all taggable resources are covered.
- **Phase 4 (US2)**: Depends on Phase 3 – verification tests and script rely on tag set and stacks.
- **Phase 5 (US3)**: Depends on Phase 4 – identification and documentation use verification output.
- **Phase 6 (Polish)**: Depends on Phase 5 – docs and validation after behavior is stable.

### User Story Dependencies

- **US1 (P1)**: After Phase 2 only – no dependency on US2/US3.
- **US2 (P2)**: After US1 – verification asserts tags applied in US1.
- **US3 (P3)**: After US2 – list and document based on verification.

### Within Each User Story

- US1: Shared module (Phase 1) → stacks use it (Phase 2) → **TDD** write Runtime tag test (T004a, Red) → implement Tags on Runtime (T004b, Green).
- US2: **TDD** write full verification test (T005a, Red) → fix missing tags (T005b, Green); optional script (T006) can run in parallel with T005b.
- US3: List/fix (T007) then document (T008).

### Parallel Opportunities

- T003 is [P] with T002 (different files: execution-stack.ts vs verification-stack.ts).
- T005a/T005b (verification test) and T006 (optional script) are independent (test file vs script).
- T009 is [P] with other Polish tasks (docs only).

---

## Parallel Example: Phase 2

```bash
# After T001, both stack updates can be done in parallel:
T002: Update cdk/lib/execution/execution-stack.ts
T003: Update cdk/lib/verification/verification-stack.ts
```

## Parallel Example: User Story 2

```bash
# After US1 complete (TDD order):
T005a: Write cdk/test/cost-allocation-tags.test.ts → run test, confirm FAIL (Red)
T005b: Fix missing tags until test passes (Green)
T006: (Optional) Add cdk/scripts/verify-cost-allocation-tags.ts (can run in parallel with T005b)
```

---

## Implementation Strategy

### TDD for tag verification (cdk synth でタグが付いたか確認するテスト)

- **Phase 3**: T004a で Runtime のタグ検証テストを追加 → 実行して **FAIL を確認（Red）** → T004b で L1 Runtime に明示的 Tags を実装 → **PASS を確認（Green）**。
- **Phase 4**: T005a で全 taggable リソースを検証するテストを追加 → 実行して **FAIL を確認（Red）** → T005b で不足タグを修正 → **PASS を確認（Green）**。

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001).
2. Complete Phase 2 (T002, T003).
3. Complete Phase 3: T004a (test first, confirm Red) → T004b (implement, confirm Green).
4. **STOP and VALIDATE**: Run `cdk synth` and the new tests; all taggable resources (at least Runtime) have the four cost allocation tags.
5. Proceed to US2 for full verification test (TDD), or deploy/demo as-is.

### Incremental Delivery

1. Phase 1 + 2 → Same tag set applied on both stacks.
2. Phase 3 (US1, TDD) → Red (T004a) → Green (T004b); all taggable resources including L1 tagged; MVP for cost separation.
3. Phase 4 (US2, TDD) → Red (T005a) → Green (T005b); automated verification; regressions caught in CI.
4. Phase 5 (US3) → Gaps and non-taggable resources documented.
5. Phase 6 → README and quickstart; feature complete.

### Parallel Team Strategy

- One developer: T001 → T002 + T003 → T004a (Red) → T004b (Green) → T005a (Red) → T005b (Green) → (T006) → T007 → T008 → T009, T010.
- Two developers after Phase 2: Dev A (T004a→T004b, T005a→T005b, T007), Dev B (T006, T008, T009); coordinate on T007/T008 so doc is consistent.

---

## Notes

- **TDD**: Phase 3 と Phase 4 の「cdk synth でタグが付いたか確認するテスト」は、必ずテストを先に書き実行して失敗（Red）を確認してから、実装で成功（Green）にする。
- [P] tasks use different files and have no ordering dependency between them.
- [USn] labels map tasks to spec user stories for traceability.
- Each user story is independently testable per spec “Independent Test” criteria.
- Commit after each task or logical group (e.g. after Red, after Green).
- AWS tagging limits: no `aws:` prefix for user tags; respect key/value length and max tags per resource (see AWS and quickstart references).
