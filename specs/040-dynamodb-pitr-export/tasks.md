# Tasks: DynamoDB Usage History Daily S3 Export via PITR (040)

**Input**: Design documents from `specs/040-dynamodb-pitr-export/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓

**TDD**: Constitution II requires test tasks to precede every implementation task. Tests MUST fail before implementation begins.

**Organization**: Pure CDK/infrastructure change — no `src/` Python agent code changes. All tests are TypeScript Jest CDK unit tests (`cd cdk && npm test`). Tasks grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2
- All paths relative to `verification-zones/verification-agent/`

---

## Phase 1: Foundational — PITR 有効化

**Purpose**: Enable PITR on the usage-history DynamoDB table. Required by `ExportTableToPointInTime` API. MUST complete before Phase 2 (US1).

> **TDD**: Write T001 first (RED), confirm failure, then implement T002 (GREEN)

- [X] T001 Write CDK test asserting `PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true }` on the `{stack}-usage-history` table — in `cdk/test/usage-history-table.test.ts`
- [X] T002 Add `pointInTimeRecovery: true` to `this.table` definition in `cdk/lib/constructs/usage-history-table.ts`

**Checkpoint**: `cd cdk && npm test` — T001 GREEN before Phase 2

---

## Phase 2: User Story 1 — 日次バックアップで利用履歴を完全保護する (Priority: P1) 🎯 MVP

**Goal**: EventBridge Scheduler が毎日 JST 00:00 (UTC 15:00) に Lambda を起動し、DynamoDB テーブル全体を S3 の `dynamodb-exports/{YYYY/MM/DD}/` プレフィックスへエクスポートする

**Independent Test**: quickstart.md Scenario 2 — export Lambda を手動実行し S3 にエクスポートファイルが生成されること; Scenario 5 — EventBridge Scheduler の cron 式が `cron(0 15 * * ? *)` であること

> **TDD**: Write T003 first (RED), confirm failure, then implement T004–T007

- [X] T003 [US1] Write CDK test for `DynamoDbExportJob` construct asserting: (a) `AWS::Scheduler::Schedule` with `ScheduleExpression: "cron(0 15 * * ? *)"` and `State: ENABLED`, (b) `AWS::Lambda::Function` with `Runtime: python3.11` and env vars `TABLE_ARN` and `EXPORT_BUCKET_NAME`, (c) IAM policy with `dynamodb:ExportTableToPointInTime` on table ARN, (d) IAM policy with `s3:PutObject` on `dynamodb-exports/*` — in `cdk/test/dynamodb-export-job.test.ts`
- [X] T004 [P] [US1] Create Lambda handler `cdk/lib/lambda/dynamodb-export-job/handler.py`: calls `dynamodb.export_table_to_point_in_time(TableArn, S3Bucket, S3Prefix=f"dynamodb-exports/{date_path}", ExportFormat="DYNAMODB_JSON")`, logs `export_arn`, returns `{"status": "export_initiated", "export_arn": ...}`; uses `AWS_REGION_NAME` env var for boto3 client; fail-open wrapper logs WARNING on exception
- [X] T005 [P] [US1] Create `cdk/lib/lambda/dynamodb-export-job/requirements.txt` (empty — only boto3 from Lambda runtime needed)
- [X] T006 [US1] Create CDK construct `cdk/lib/constructs/dynamodb-export-job.ts`: `DynamoDbExportJobProps { table: dynamodb.ITable; bucket: s3.IBucket }`; Lambda (Python 3.11, same bundling pattern as `agent-invoker.ts`), env vars `TABLE_ARN=props.table.tableArn`, `EXPORT_BUCKET_NAME=props.bucket.bucketName`, `AWS_REGION_NAME=stack.region`; IAM `dynamodb:ExportTableToPointInTime` on table ARN; `props.bucket.grantPut(fn, "dynamodb-exports/*")`; IAM `s3:AbortMultipartUpload` on `${bucket.bucketArn}/dynamodb-exports/*`; `Schedule` from `aws-cdk-lib/aws-scheduler` with cron `{ hour: "15", minute: "0" }` targeting `LambdaInvoke` from `aws-cdk-lib/aws-scheduler-targets`; export `this.function`
- [X] T007 [US1] Instantiate `DynamoDbExportJob` in `cdk/lib/verification-stack.ts` (pass `usageHistoryTable.table` and `usageHistoryBucket.bucket`); add `cloudwatch.Alarm` on export Lambda `Errors` metric (threshold: 1, period: 5 minutes, treatMissingData: NOT_BREACHING)

**Checkpoint**: `cd cdk && npm test` — T003 GREEN; then run quickstart.md Scenarios 2 and 5 in dev after deploy

---

## Phase 3: User Story 2 — エクスポートデータの長期保管とコスト管理 (Priority: P2)

**Goal**: S3 `dynamodb-exports/` プレフィックスのオブジェクトが90日後に自動削除される

**Independent Test**: quickstart.md Scenario 4 — S3 ライフサイクルルールに `dynamodb-exports/` prefix と `ExpirationInDays: 90` が設定されていること

> **TDD**: Write T008 first (RED), confirm failure, then implement T009

- [X] T008 [US2] Write CDK test asserting `LifecycleConfiguration.Rules` includes a rule with `Prefix: "dynamodb-exports/"`, `ExpirationInDays: 90`, `Status: "Enabled"` — in `cdk/test/usage-history-bucket.test.ts`
- [X] T009 [US2] Add third lifecycle rule `{ id: "expire-dynamodb-exports", prefix: "dynamodb-exports/", expiration: cdk.Duration.days(90), abortIncompleteMultipartUploadAfter: cdk.Duration.days(1), enabled: true }` to `lifecycleRules` array in `cdk/lib/constructs/usage-history-bucket.ts`

**Checkpoint**: `cd cdk && npm test` — T008 GREEN; run quickstart.md Scenario 4 after deploy

---

## Phase 4: Polish & Documentation (Principle VI)

**Purpose**: Documentation & deploy-script parity (Constitution Principle VI — mandatory)

- [X] T010 [P] Update `verification-zones/verification-agent/README.md`: add subsection under "Usage History (039)" describing PITR enablement, daily S3 export schedule (JST 00:00), `dynamodb-exports/` prefix and 90-day retention, CloudWatch alarm for export failures
- [X] T011 [P] Add `[Unreleased]` entry to `CHANGELOG.md` under `### Added`: "DynamoDB usage-history table PITR enabled; daily export to S3 `dynamodb-exports/{YYYY/MM/DD}/` at JST 00:00 via EventBridge Scheduler; 90-day lifecycle rule on `dynamodb-exports/` prefix (040)"
- [X] T012 [P] Update `CLAUDE.md` "Recent Changes" with feature 040 summary: "040-dynamodb-pitr-export: PITR enabled on usage-history DynamoDB table; daily export to S3 dynamodb-exports/ prefix at JST 00:00 (EventBridge Scheduler + Lambda); 90-day lifecycle; CloudWatch alarm"
- [X] T013 Verify `scripts/deploy.sh` — no new CDK CfnOutput keys added by this feature; confirm existing verification zone output key references are unchanged (read-only check)
- [ ] T014 Run quickstart.md Scenarios 1–5 manually in dev environment to validate end-to-end behaviour

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Foundational: PITR)
  └─► Phase 2 (US1: daily backup)  [BLOCKS US1 — export API requires PITR]
        └─► Phase 4 (Polish)
Phase 3 (US2: lifecycle rule)  ← independent of Phase 2; can run in parallel with Phase 2
  └─► Phase 4 (Polish)
```

### Within Each Phase

- T001 (test) before T002 (impl) — TDD red→green
- T003 (test) before T006 (impl) — TDD red→green
- T004 and T005 are **parallel** (different files)
- T006 depends on T004 + T005 (Lambda handler must exist before CDK Asset bundling)
- T007 depends on T006 (construct must exist to instantiate)
- T008 (test) before T009 (impl) — TDD red→green
- T010, T011, T012 are **parallel** (different files)

---

## Parallel Execution Examples

### Phase 2 (US1) — partial parallelism:
```
T003 (write test first) → confirm RED
Then parallel:
  Agent A: T004 — handler.py
  Agent B: T005 — requirements.txt
Then sequential:
  T006 — CDK construct (needs T004+T005)
  T007 — stack wiring (needs T006)
```

### Phase 4 (Polish) — all parallel:
```
Agent A: T010 — README.md
Agent B: T011 — CHANGELOG.md
Agent C: T012 — CLAUDE.md
(T013, T014 sequential after the above)
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1: Enable PITR (T001–T002)
2. Phase 2: Create export job (T003–T007)
3. **STOP and VALIDATE**: deploy to dev, run quickstart.md Scenarios 1–2 and 5
4. Phase 3: Lifecycle rule (T008–T009)
5. Phase 4: Docs (T010–T014)

---

## Notes

- All paths relative to `verification-zones/verification-agent/`
- CDK tests: `cd cdk && npm test` (Jest)
- No Python `pytest` tasks — no `src/` changes
- `[P]` = different files, no dependencies, can run in parallel
- EventBridge Scheduler constructs: `aws-cdk-lib/aws-scheduler` + `aws-cdk-lib/aws-scheduler-targets` (stable, no alpha)
- Lambda bundling pattern: follow `cdk/lib/constructs/agent-invoker.ts` (local pip first, Docker fallback)
