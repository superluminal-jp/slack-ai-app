---

description: "Task list for AgentCore idle billing investigation"
---

# Tasks: AgentCore Idle Agent Billing Investigation

**Input**: Design documents from `/specs/051-investigate-agentcore-idle-costs/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: 純粋な調査タスク。コード変更なし。データ収集 → 根本原因分析 → 推奨アクション → 文書化の順に実施する。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（異なるデータソース、互いに依存しない）
- **[Story]**: 対応するユーザーストーリー（US1, US2）
- 各タスクに具体的なデータ取得先・出力先を明記

---

## Phase 1: Setup（事前準備）

**Purpose**: AWS 認証確認と対象エージェントの ARN 特定

- [x] T001 AWS SSO セッションを確認する（`aws sts get-caller-identity` — アカウントID・リージョンが正しいことを検証）
- [x] T002 `aws bedrock-agentcore-control list-agent-runtimes --region ap-northeast-1` で Dev エージェント4体の ARN を取得し、`specs/051-investigate-agentcore-idle-costs/research.md` の「Findings」セクションに記録する

**Checkpoint**: 4エージェント全ての ARN が `research.md` に記録されていること

---

## Phase 2: Foundational（データ収集）

**Purpose**: 根本原因分析に必要な全データを AWS から取得する

**⚠️ CRITICAL**: Phase 1 完了（ARN 確定）後でないと実施不可。ただし T003〜T007 は ARN さえあれば並列実行可能。

- [x] T003 [P] 各エージェントの設定詳細を取得する — `aws bedrock-agentcore-control get-agent-runtime --agent-runtime-id <ID>` を4体分実行し、`idleRuntimeSessionTimeoutSeconds`・`maxLifetimeSeconds`・`status`・`createdAt` を `research.md` に記録する
- [x] T004 [P] 各エージェントのランタイムセッション一覧を取得する — `list-agent-runtime-sessions` API は存在しないことを確認。コンソール集約表示の仕様を特定し `research.md` の「RT-003」セクションに記録する
- [x] T005 [P] CloudWatch ロググループを確認する — `aws logs describe-log-groups --log-group-name-prefix /aws/bedrock-agentcore --region ap-northeast-1` で AgentCore 関連ロググループを特定し、`research.md` に記録する
- [x] T006 [P] AgentCore 課金モデルを確認する — Cost Explorer の USAGE_TYPE (`Consumption-based:Memory`, `Consumption-based:vCPU`) から従量制（provisioned capacity なし）であることを確認し `research.md` の「RT-001」セクションに記録する
- [x] T007 CloudWatch ログから各エージェントの活動状況を確認する — 新 Dev エージェント (storedBytes=0) と旧 Dev エージェント (5-6MB) の差異を確認し、`research.md` の「RT-004」セクションに記録する
- [x] T008 AWS Cost Explorer で実際のコスト内訳を取得する — `aws ce get-cost-and-usage` でデプロイ日〜現在の期間の AgentCore コスト（GB-hrs, vCPU-hrs）を取得し、`research.md` の「RT-005」セクションに記録する（Cost Explorer API は `--region us-east-1` が必要）

**Checkpoint**: `research.md` の RT-001〜RT-005 全セクションが実測データで埋まっていること

---

## Phase 3: User Story 1 — Root Cause Identification（Priority: P1）🎯 MVP

**Goal**: 収集データを分析し「なぜ未呼び出しエージェントにコストが発生するか」の根本原因を特定する

**Independent Test**: `research.md` の「Root Cause」セクションに、「AgentCore 仕様（回避不能）」または「設定で削減可能」のいずれかの結論と根拠データが記載されていること

### Implementation for User Story 1

- [x] T009 [US1] 収集データから仮説 A〜E を検証する — CloudWatch ログ (新: 0 bytes / 旧: 5-6MB)、Cost Explorer トレンド、コンソール表示仕様から仮説 E（コンソール集約表示による誤解）が正と確認
- [x] T010 [US1] AgentCore の `LifecycleConfiguration` と課金の関係を確認する — Consumption-based 課金モデルにより、コンテナ未起動時はコスト $0 であることを確認。新 Dev エージェントはコスト $0
- [x] T011 [US1] 根本原因を `research.md` の「Root Cause」セクションに文書化する — 仮説 E（コンソール集約表示）が根本原因、Prod デプロイ (2026-03-15) がコスト急増の原因として記録完了

**Checkpoint**: `research.md` に「Root Cause」が明記され、根拠データ付きで "AgentCore 仕様" / "設定で削減可能" が判定されていること

---

## Phase 4: User Story 2 — Cost Reduction Recommendation（Priority: P2）

**Goal**: 根本原因に基づき、具体的な対処方針（削除・停止・設定変更・現状維持）を提示する

**Independent Test**: `research.md` の「Recommendation」セクションに、「対象エージェント」「推奨アクション」「期待されるコスト削減効果」が記載されていること

### Implementation for User Story 2

- [x] T012 [US2] 根本原因の分類に応じた推奨アクションを決定する — 仮説 E（コンソール表示仕様）: 新 Dev エージェントは放置で問題なし。本番コストの確認と不要 Dev エージェントの削除を推奨
- [x] T013 [US2] 推奨アクションを `research.md` の「Recommendation」セクションに記載する — 「新 Dev エージェント: 放置」「本番コスト: 月~$300（正常）」「不要 Dev 削除でコスト削減可能」を記録完了
- [x] T014 [US2] `specs/051-investigate-agentcore-idle-costs/research.md` の全セクションを最終化する — RT-001〜RT-005・Root Cause・Recommendation が全て記入され、Status を「Complete」に更新完了

**Checkpoint**: `research.md` が完成し、意思決定に必要な全情報が揃っていること

---

## Phase 5: Polish & Documentation

**Purpose**: 調査結果を CHANGELOG に記録し、チームに共有できる状態にする

- [x] T015 `CHANGELOG.md` の `[Unreleased]` セクションに調査結果の要約を追加する — 「調査内容」「根本原因」「推奨アクション」を簡潔に記載する（Constitution Principle VI 準拠）
- [x] T016 [P] `specs/051-investigate-agentcore-idle-costs/checklists/requirements.md` の調査後チェックリストを確認 — 全 14 項目 PASS 済み

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし — 即開始可能
- **Foundational (Phase 2)**: Phase 1 完了（ARN 確定）後に開始 — Phase 3/4 をブロック
- **US1 (Phase 3)**: Phase 2 完了後（全データ収集済み）に開始
- **US2 (Phase 4)**: Phase 3 完了後（根本原因特定済み）に開始
- **Polish (Phase 5)**: Phase 4 完了後（Recommendation 確定後）に開始

### User Story Dependencies

- **User Story 1 (P1)**: Phase 2 完了後すぐ開始可能
- **User Story 2 (P2)**: User Story 1 完了後（根本原因特定が前提）

### Parallel Opportunities

- T003〜T006 は全て並列実行可能（異なる AWS API・異なるデータソース）
- T007 は T005 完了後
- T008 は T001 完了後（独立して実行可能）
- T015〜T016 は並列実行可能

---

## Parallel Example: Phase 2（データ収集）

```bash
# 以下を並列実行（T003〜T006 は互いに独立）:
Task T003: "get-agent-runtime で4エージェントの設定取得"
Task T004: "list-agent-runtime-sessions で4エージェントのセッション一覧取得"
Task T005: "CloudWatch ロググループ確認"
Task T006: "AWS ドキュメントで AgentCore 課金モデル調査"

# T005 完了後:
Task T007: "CloudWatch ログでセッション起動トリガー確認"

# T001 完了後（並列可能）:
Task T008: "Cost Explorer でコスト内訳取得"
```

---

## Implementation Strategy

### MVP First（User Story 1 のみ）

1. Phase 1: AWS 認証確認 → ARN 取得
2. Phase 2: 全データ収集（T003〜T008）
3. Phase 3: 根本原因特定（T009〜T011）
4. **STOP and VALIDATE**: `research.md` の「Root Cause」が完成していることを確認
5. 原因が分かれば意思決定可能

### Full Investigation（全ストーリー）

1. Phase 1 + 2 → データ揃う
2. Phase 3 → 根本原因確定
3. Phase 4 → 推奨アクション決定
4. Phase 5 → CHANGELOG 更新 → PR 作成

---

## Notes

- [P] タスクは異なる AWS API/データソースに対して並列実行可能
- [US1] は「なぜコストが発生するか」、[US2] は「何をすべきか」
- AWS CLI のレスポンスは `research.md` に直接貼り付けて記録する
- Cost Explorer API は `--region us-east-1` を明示的に指定すること
- セッションのタイムスタンプとデプロイ日時の照合が根本原因特定の鍵
