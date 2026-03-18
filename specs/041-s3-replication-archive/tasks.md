# Tasks: Usage History S3 Archive Replication (041)

**Input**: Design documents from `specs/041-s3-replication-archive/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, quickstart.md ✓

**TDD**: Constitution II requires test tasks to precede every implementation task. Tests MUST fail before implementation begins.

**Organization**: Pure CDK/infrastructure change — no `src/` Python agent code changes. All tests are TypeScript Jest CDK unit tests (`cd cdk && npm test`). Tasks grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2
- All paths relative to `verification-zones/verification-agent/`

---

## Phase 1: Foundational — Versioning 有効化 (source bucket)

**Purpose**: Enable versioning on the `{stack}-usage-history` source bucket. Required by S3 Replication (`ExportTableToPointInTime` already requires PITR; Replication requires versioning). MUST complete before Phase 2 (US1).

> **TDD**: Write T001 first (RED), confirm failure, then implement T002 (GREEN)

- [X] T001 Write CDK test asserting `VersioningConfiguration: { Status: "Enabled" }` on the `{stack}-usage-history` bucket — in `cdk/test/usage-history-bucket.test.ts`
- [X] T002 In `cdk/lib/constructs/usage-history-bucket.ts`: change `versioned: false` to `versioned: true`; add lifecycle rule `{ id: "expire-noncurrent-versions", noncurrentVersionExpiration: cdk.Duration.days(7), abortIncompleteMultipartUploadAfter: cdk.Duration.days(1), enabled: true }` (no prefix — covers all objects)

**Checkpoint**: `cd cdk && npm test` — T001 GREEN before Phase 2

---

## Phase 2: User Story 1 — 利用履歴データの自動アーカイブ (Priority: P1) 🎯 MVP

**Goal**: 新規オブジェクトがプライマリバケット（`content/`・`attachments/`・`dynamodb-exports/`）に書き込まれるたびに、独立したアーカイブバケットへ自動複製される（同一アカウント SRR）

**Independent Test**: quickstart.md Scenario 2 — アーカイブバケットが存在すること; Scenario 3 — オブジェクトがアーカイブバケットに複製されること; Scenario 5 — ソース削除後もアーカイブにオブジェクトが残ること

> **TDD**: Write T003 first (RED), confirm failure, then implement T004. Write T005 (RED), implement T006. Then T007.

- [X] T003 [US1] Write CDK tests for `UsageHistoryArchiveBucket` construct asserting: (a) `VersioningConfiguration: { Status: "Enabled" }`, (b) SSE-S3 (`AES256`), (c) `BlockPublicAccess: BLOCK_ALL`, (d) SSL enforcement (`aws:SecureTransport: "false"` deny), (e) lifecycle rules for `content/` (90d), `attachments/` (90d), `dynamodb-exports/` (90d), (f) `NoncurrentVersionExpiration: { NoncurrentDays: 7 }` rule — in `cdk/test/usage-history-archive-bucket.test.ts`
- [X] T004 [US1] Create CDK construct `cdk/lib/constructs/usage-history-archive-bucket.ts`: `bucketName: \`\${stackName.toLowerCase()}-usage-history-archive\``; `versioned: true`; `encryption: S3_MANAGED`; `blockPublicAccess: BLOCK_ALL`; `enforceSSL: true`; `removalPolicy: DESTROY`; `autoDeleteObjects: true`; `lifecycleRules`: expire-archive-content (prefix `content/`, 90d), expire-archive-attachments (prefix `attachments/`, 90d), expire-archive-dynamodb-exports (prefix `dynamodb-exports/`, 90d), expire-noncurrent-versions (no prefix, `noncurrentVersionExpiration: 7d`); export `this.bucket`
- [X] T005 [US1] Write CDK tests for `UsageHistoryReplication` construct (same-account mode, no `archiveAccountId`) asserting: (a) `AWS::IAM::Role` with `Principal.Service: "s3.amazonaws.com"`, (b) IAM policy with `s3:GetReplicationConfiguration` and `s3:ListBucket` on source bucket ARN, (c) IAM policy with `s3:GetObjectVersionForReplication`, `s3:GetObjectVersionAcl`, `s3:GetObjectVersionTagging` on source `/*`, (d) IAM policy with `s3:ReplicateObject`, `s3:ReplicateDelete`, `s3:ReplicateTags` on archive `/*`, (e) `AWS::S3::BucketPolicy` on archive bucket allowing `s3:ReplicateObject` and `s3:ReplicateDelete`, (f) `ReplicationConfiguration.Rules` on source bucket with `Filter.Prefix: ""` and `Status: "Enabled"`, (g) `DeleteMarkerReplication.Status: "Disabled"` — in `cdk/test/usage-history-replication.test.ts`
- [X] T006 [US1] Create CDK construct `cdk/lib/constructs/usage-history-replication.ts`: `UsageHistoryReplicationProps { sourceBucket: dynamodb.ITable; archiveBucket: s3.IBucket; archiveAccountId?: string }`; IAM role (`ServicePrincipal: s3.amazonaws.com`) with least-privilege inline policies (source: GetReplicationConfiguration, ListBucket; source/\*: GetObjectVersionForReplication, GetObjectVersionAcl, GetObjectVersionTagging; archive/\*: ReplicateObject, ReplicateDelete, ReplicateTags); bucket policy on archive granting same write actions to replication role; L1 override: `(sourceBucket.node.defaultChild as s3.CfnBucket).replicationConfiguration = { role, rules: [{ id: "replicate-all-objects", status: "Enabled", filter: { prefix: "" }, destination: { bucket: archiveBucket.bucketArn }, deleteMarkerReplication: { status: "Disabled" } }] }`
- [X] T007 [US1] Instantiate `UsageHistoryArchiveBucket` and `UsageHistoryReplication` in `cdk/lib/verification-stack.ts`: add `archiveAccountId?: string` to `VerificationStackProps`; instantiate after `usageHistoryBucket`; pass `usageHistoryBucket.bucket` as `sourceBucket`, `usageHistoryArchiveBucket.bucket` as `archiveBucket`, `props.archiveAccountId` as `archiveAccountId`

**Checkpoint**: `cd cdk && npm test` — T003, T005 GREEN; then run quickstart.md Scenarios 2–3 and 5 in dev after deploy

---

## Phase 3: User Story 2 — クロスアカウント移行対応 (Priority: P2)

**Goal**: `archiveAccountId` を `cdk.config.json` に追加するだけでクロスアカウント複製に切り替わる（コード変更ゼロ）

**Independent Test**: quickstart.md Scenario 7 — `archiveAccountId` を設定した場合のみ CloudFormation template に `Account` と `AccessControlTranslation` フィールドが含まれること

> **TDD**: Write T008 first (RED), confirm failure, then implement T009–T012

- [X] T008 [US2] Add test to `cdk/test/usage-history-replication.test.ts` for cross-account mode (separate `describe` block with `archiveAccountId` provided): assert (a) `ReplicationConfiguration.Rules[0].Destination.Account` equals the provided `archiveAccountId`, (b) `ReplicationConfiguration.Rules[0].Destination.AccessControlTranslation.Owner: "Destination"`, (c) IAM policy includes `s3:ObjectOwnerOverrideToBucketOwner` on archive `/*`, (d) bucket policy includes `s3:ObjectOwnerOverrideToBucketOwner`; also assert that in same-account mode (no `archiveAccountId`), `Account` and `AccessControlTranslation` are ABSENT from the destination
- [X] T009 [US2] Extend `cdk/lib/constructs/usage-history-replication.ts` to handle `archiveAccountId`: when present, add `s3:ObjectOwnerOverrideToBucketOwner` to role policy and bucket policy; set `destination.account = archiveAccountId` and `destination.accessControlTranslation = { owner: "Destination" }` in the replication rule
- [X] T010 [P] [US2] Add `archiveAccountId?: string` to `CdkConfig` interface, Zod schema (`.regex(/^\d{12}$/, ...).optional()`), and `applyEnvOverrides` (`ARCHIVE_ACCOUNT_ID` env var) in `cdk/lib/types/cdk-config.ts`
- [X] T011 [P] [US2] Add `archiveAccountId` example entry (commented or with placeholder value) to `cdk.config.json.example` in `cdk/cdk.config.json.example`
- [X] T012 [US2] Wire `config.archiveAccountId` through to stack props: in `cdk/bin/cdk.ts` (or wherever `VerificationStack` is instantiated), pass `archiveAccountId: config.archiveAccountId` to `VerificationStackProps`

**Checkpoint**: `cd cdk && npm test` — T008 GREEN; run quickstart.md Scenario 7 after synth

---

## Phase 4: Polish & Documentation (Principle VI)

**Purpose**: Documentation & deploy-script parity (Constitution Principle VI — mandatory)

- [X] T013 [P] Update `verification-zones/verification-agent/README.md`: add subsection under "Usage History (039)" describing the archive replication — archive bucket name pattern, all prefixes covered, cross-account readiness, `archiveAccountId` config field, `ARCHIVE_ACCOUNT_ID` env var
- [X] T014 [P] Add `[Unreleased]` entry to `CHANGELOG.md` under `### Added`: "S3 Same-Region Replication from `{stack}-usage-history` to `{stack}-usage-history-archive`; covers `content/`, `attachments/`, `dynamodb-exports/` prefixes; `deleteMarkerReplication: Disabled`; cross-account ready via `archiveAccountId` config (041)"
- [X] T015 [P] Update `CLAUDE.md` "Recent Changes" with feature 041 summary: "041-s3-replication-archive: S3 SRR from usage-history to archive bucket; all prefixes; cross-account ready via archiveAccountId config; new constructs UsageHistoryArchiveBucket + UsageHistoryReplication"
- [X] T016 Verify `cdk/bin/cdk.ts` and `scripts/deploy.sh` — no new CDK `CfnOutput` keys added by this feature; confirm existing verification zone output key references are unchanged (read-only check)
- [ ] T017 Run quickstart.md Scenarios 1–8 manually in dev environment to validate end-to-end behaviour

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Foundational: versioning)
  └─► Phase 2 (US1: archive + replication)  [BLOCKS US1 — replication requires versioned source]
        └─► Phase 4 (Polish)
Phase 3 (US2: cross-account config)  ← independent of Phase 2 direction; can start in parallel with Phase 2
  └─► Phase 4 (Polish)
```

### Within Each Phase

- T001 (test) before T002 (impl) — TDD red→green
- T003 (test) before T004 (impl) — TDD red→green
- T005 (test) before T006 (impl) — TDD red→green
- T007 depends on T004 + T006 (both constructs must exist)
- T008 (test) before T009 (impl) — TDD red→green
- T010 and T011 are **parallel** (different files)
- T012 depends on T010 (CdkConfig must have `archiveAccountId` before stack wiring)
- T013, T014, T015 are **parallel** (different files)

---

## Parallel Execution Examples

### Phase 2 (US1):
```
T003 (write archive bucket test) → confirm RED
T004 (implement UsageHistoryArchiveBucket)
Then:
T005 (write replication test) → confirm RED
T006 (implement UsageHistoryReplication)
T007 (wire into VerificationStack)
```

### Phase 3 (US2) — partial parallelism:
```
T008 (write cross-account test) → confirm RED
T009 (extend UsageHistoryReplication for cross-account)
Parallel:
  Agent A: T010 — cdk-config.ts
  Agent B: T011 — cdk.config.json.example
Then:
  T012 — bin/cdk.ts wiring (needs T010)
```

### Phase 4 (Polish) — all parallel:
```
Agent A: T013 — README.md
Agent B: T014 — CHANGELOG.md
Agent C: T015 — CLAUDE.md
(T016, T017 sequential after the above)
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1: Enable versioning on source bucket (T001–T002)
2. Phase 2: Create archive bucket + replication (T003–T007)
3. **STOP and VALIDATE**: deploy to dev, run quickstart.md Scenarios 2–3 and 5
4. Phase 3: Cross-account config injection (T008–T012)
5. Phase 4: Docs (T013–T017)

---

## Notes

- All paths relative to `verification-zones/verification-agent/`
- CDK tests: `cd cdk && npm test` (Jest)
- No Python `pytest` tasks — no `src/` changes
- `[P]` = different files, no dependencies, can run in parallel
- CDK L2 `Bucket` has no replication support — must use L1 `CfnBucket` override (`sourceBucket.node.defaultChild as s3.CfnBucket`)
- `versioned: true` required on BOTH source AND archive buckets (AWS hard requirement)
- `deleteMarkerReplication: Disabled` — archive is independent; source deletions do not propagate
- Cross-account readiness: `archiveAccountId` absent = same-account; present = cross-account (adds `Account` + `AccessControlTranslation` to destination)
