# Tasks: docs/ フォルダ更新と docs-agent プロンプト改善

**Input**: Design documents from `/specs/045-update-docs-and-prompts/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅

**Tests**: TDD が必要なのは system_prompt.py（Python コード変更）のみ。ドキュメント変更にテストはなし。

**Organization**: US1（architecture.md）→ US2（system_prompt.py）→ US3（quickstart.md）の順。US2 のみ TDD 適用。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（異なるファイル、未完了タスクへの依存なし）
- **[Story]**: 対象ユーザーストーリー（US1/US2/US3）
- ファイルパスは各タスクに明記

---

## Phase 1: Foundational（全ユーザーストーリーへのブロッキング前提）

**Purpose**: 構造的な前提ドキュメントを先に整理し、US1–US3 の作業を unblock する

**⚠️ CRITICAL**: このフェーズが完了するまで US1–US3 の作業を開始しない

- [X] T001 Rewrite `docs/developer/execution-agent-system-prompt.md` — 旧単一 execution-agent 前提を除去し、4 エージェント（docs-agent/file-creator-agent/time-agent/fetch-url-agent）それぞれの system_prompt.py を参照する表と運用方針に全書き換えする
- [X] T002 [P] Update `docs/README.md` — 開発者向け表に execution-agent-system-prompt.md を追記、最終更新日を 2026-03-18 に更新する

**Checkpoint**: Foundational 完了 — US1/US2/US3 を並列開始可能

---

## Phase 2: User Story 1 — architecture.md 現行実装との整合 (Priority: P1) 🎯 MVP

**Goal**: `docs/developer/architecture.md` が現行コードベースと 100% 一致する状態にする

**Independent Test**: architecture.md を読んで①slack-search-agent が Verification Zone に記載されている ②DynamoDB テーブル数が 6 になっている ③usage-history/PITR/S3 SRR/cdk-nag のセクションが存在する ④旧 execution-agent パスへの参照がない — の 4 点が満たされているかを目視確認

### Implementation for User Story 1

> **注意**: T003–T008 はすべて同一ファイル（architecture.md）のため逐次実行。各 Edit 後に前後の文脈を確認してから次へ進む。

- [X] T003 [US1] Fix `docs/developer/architecture.md` §1.1 Execution Zone ボックス（行 52–75）— 単一 "Execution Agent (AgentCore Runtime)" を file-creator-agent・time-agent・docs-agent・fetch-url-agent の 4 エージェント名リストに置き換える
- [X] T004 [US1] Fix `docs/developer/architecture.md` §1.1 Verification Zone ボックス（行 12–42）— slack-search-agent を Verification Agent の隣接コンポーネントとして追記する
- [X] T005 [US1] Fix `docs/developer/architecture.md` §1.2 コンポーネント表（行 113–122）— Execution Agents 行に 4 エージェント名追記、DynamoDB 行に usage-history 追記、S3 usage-history 行を追加、slack-search-agent 行を追加する
- [X] T006 [US1] Fix `docs/developer/architecture.md` §2.2 分離スタック図（行 213–223）— Verification Stack に slack-search-agent を追記、"DynamoDB tables (5)" を "(6)" に修正する
- [X] T007 [US1] Rewrite `docs/developer/architecture.md` §4.3 Execution Agent（行 445–491）— 存在しない `execution-zones/execution-agent/src/main.py` への参照と旧コードスニペットを除去し、4 エージェント各々の役割・ファイルパス（`execution-zones/<agent>/src/`）を記述する表に書き換える
- [X] T008 [US1] Add `docs/developer/architecture.md` §4.6（セクション 5 の直前）— usage-history DynamoDB テーブル、usage-history S3 バケット、S3 Same-Region Replication（usage-history → usage-history-archive）、DynamoDB PITR エクスポート、cdk-nag AwsSolutions スキャンを説明する新セクションを追加する
- [X] T009 [US1] Fix `docs/developer/architecture.md` 関連ドキュメントリンクと最終更新日（行 663–673）— `../how-to/troubleshooting.md` を `./troubleshooting.md` に修正、最終更新日を `2026-03-18` に更新する

**Checkpoint**: architecture.md が現行コードベースと一致している。目視 4 点チェックを実施する。

---

## Phase 3: User Story 2 — docs-agent プロンプト改善 (Priority: P2)

**Goal**: `execution-zones/docs-agent/src/system_prompt.py` の `FULL_SYSTEM_PROMPT` が検索ガイダンス・ソース引用・スコープ外対応を含む実用的なプロンプトになる

**Independent Test**: `cd execution-zones/docs-agent/src && python -m pytest ../tests/test_system_prompt.py -v` を実行して全テストがグリーンになることを確認する

### Tests for User Story 2 ⚠️ TDD Red → Green → Refactor

> **CRITICAL**: T010 でテストを書き、FAIL を確認してから T011 の実装へ進む

- [X] T010 [US2] Create `execution-zones/docs-agent/tests/test_system_prompt.py` — 以下 4 つの失敗テストを記述し、`python -m pytest ../tests/test_system_prompt.py -v` で全テストが FAIL することを確認する（TDD 赤フェーズ）:
  - `test_contains_search_docs_instruction` — "search_docs" が FULL_SYSTEM_PROMPT に含まれる
  - `test_contains_keyword_guidance` — "architecture", "deploy", "quickstart" のいずれかが含まれる
  - `test_contains_source_citation_instruction` — ソース引用指示語（"source", "参照", "ファイル", "file", "reference" のいずれか）が含まれる
  - `test_contains_out_of_scope_instruction` — スコープ外対応語（"scope", "specialize", "特化", "スコープ" のいずれか）が含まれる

### Implementation for User Story 2

- [X] T011 [US2] Rewrite `execution-zones/docs-agent/src/system_prompt.py` — `FULL_SYSTEM_PROMPT` を以下を含む改善版に書き換える（英語で記述）: ①検索すべきトピックカテゴリ（アーキテクチャ・デプロイ・エージェント構成・セキュリティ・DynamoDB/S3・トラブルシューティング等）、②推奨キーワード例（"architecture", "quickstart", "deploy", "whitelist", "execution agent", "verification agent", "A2A", "AgentCore" 等）、③回答フォーマット指針（簡潔な文章 + 末尾にソースファイル名を引用）、④スコープ外質問（Slack 操作、AWS 料金計算等）への対応方針。その後 `python -m pytest ../tests/test_system_prompt.py -v` で全テストが PASS することを確認する（TDD 緑フェーズ）

**Checkpoint**: test_system_prompt.py が全グリーン。docs-agent に「このシステムのエージェント一覧は？」と質問したとき search_docs が呼ばれ適切な回答が返ることを手動確認する（任意）。

---

## Phase 4: User Story 3 — quickstart.md 新規開発者対応 (Priority: P3)

**Goal**: `docs/developer/quickstart.md` の手順だけで全エージェント（slack-search-agent 含む）のデプロイが完了できる

**Independent Test**: quickstart.md を一読し①`execution-agent` への誤参照がゼロ ②slack-search-agent のデプロイ手順と CDK 出力例が存在する — の 2 点を目視確認する

### Implementation for User Story 3

> **注意**: T012–T015 はすべて同一ファイル（quickstart.md）のため逐次実行。

- [X] T012 [US3] Fix `docs/developer/quickstart.md` — ステップ 2 CDK 個別インストール例の `execution-zones/execution-agent/cdk` を `execution-zones/file-creator-agent/cdk` に修正する。方法 1 の強制再ビルド例 `./execution-zones/execution-agent/scripts/deploy.sh` を `./execution-zones/file-creator-agent/scripts/deploy.sh` に修正する
- [X] T013 [US3] Fix `docs/developer/quickstart.md` — 方法 2 手動デプロイ ステップ 1 の `cd execution-zones/execution-agent/cdk` を `cd execution-zones/file-creator-agent/cdk` に修正する。デプロイ順序注記「execution-agent → time-agent → ...」を「file-creator-agent → time-agent → docs-agent → fetch-url-agent」に修正する
- [X] T014 [US3] Update `docs/developer/quickstart.md` — Execution Stacks リソース一覧に `Slack Search Agent（SlackAI-SlackSearch-{Env}）` を追記する。CDK 出力例に `SlackAI-SlackSearch-Dev.SlackSearchAgentRuntimeArn = arn:aws:bedrock-agentcore:...` を追記する。デプロイ順序注記に slack-search-agent（verification-zones にデプロイ）を追記する
- [X] T015 [US3] Fix `docs/developer/quickstart.md` — 最終更新日を `2026-03-18` に更新する

**Checkpoint**: quickstart.md を目視 2 点チェック。`execution-agent` への誤参照がゼロ、slack-search-agent の手順が存在する。

---

## Phase 5: Polish & Cross-Cutting

**Purpose**: CHANGELOG 更新、docs-agent テストスイート全体確認、最終コミット

- [X] T016 Update `CHANGELOG.md` — `[Unreleased]` セクションに以下の形式でエントリを追加する:
  ```
  ### Changed
  - docs/developer/architecture.md: slack-search-agent, usage-history (DynamoDB/S3/PITR/SRR), cdk-nag を追記; Execution Zone を 4 エージェント個別表示に更新; セクション 4.3 を現行パスに修正; セクション 4.6 追加
  - docs/developer/quickstart.md: execution-agent → file-creator-agent 参照を修正; slack-search-agent のデプロイ手順を追加
  - docs/developer/execution-agent-system-prompt.md: 旧単一エージェント前提を除去し 4 エージェント管理方針に書き換え
  - docs/README.md: execution-agent-system-prompt.md を開発者向け表に追加
  - execution-zones/docs-agent/src/system_prompt.py: 検索ガイダンス・ソース引用・スコープ外対応を含む改善プロンプトに更新
  ```
- [X] T017 [P] Run full docs-agent test suite — `cd execution-zones/docs-agent/src && python -m pytest ../tests/ -v` を実行し、全テストがグリーンであることを確認する
- [X] T018 Commit all changes — ステージングして `docs: sync developer docs and improve docs-agent prompt` でコミットし、`git push -u origin 045-update-docs-and-prompts:claude/update-docs-and-prompts-6zgfk` でプッシュする

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: 即時開始可能 — T001 と T002 は別ファイルなので並列実行可
- **US1 (Phase 2)**: Phase 1 完了後に開始。T003–T009 は同一ファイルのため逐次実行
- **US2 (Phase 3)**: Phase 1 完了後に開始（Phase 2 と並列可）。T010 → T011 の順を守る（TDD）
- **US3 (Phase 4)**: Phase 1 完了後に開始（Phase 2/3 と並列可）。T012–T015 は同一ファイルのため逐次実行
- **Polish (Phase 5)**: Phase 2/3/4 がすべて完了してから実施

### User Story Dependencies

- **US1** と **US2** と **US3** は互いに独立 — Phase 1 完了後に並列開始可能
- **US2** のみ TDD サイクル（T010 → T011）の順守が必須

### Parallel Opportunities

- **Phase 1**: T001 と T002 は別ファイルなので並列実行可
- **Phase 2–4**: Phase 1 完了後、US1/US2/US3 を 3 つ並列で進められる
- **Phase 5**: T017 は T016 と並列実行可（別ファイル）

---

## Parallel Example: Phase 1

```bash
# T001 と T002 を並列実行:
Task A: "Rewrite execution-agent-system-prompt.md"
Task B: "Update docs/README.md"
```

## Parallel Example: Phase 2–4（Phase 1 完了後）

```bash
# US1 / US2 / US3 を並列実行:
Developer A: T003 → T004 → T005 → T006 → T007 → T008 → T009  (architecture.md)
Developer B: T010 (test) → T011 (impl)                         (system_prompt.py)
Developer C: T012 → T013 → T014 → T015                        (quickstart.md)
```

---

## Implementation Strategy

### MVP First (User Story 1 のみ)

1. Phase 1 完了（T001, T002）
2. Phase 2: US1 完了（T003–T009）
3. **STOP & VALIDATE**: architecture.md 目視 4 点チェックを実施
4. 必要があれば Phase 3–4 へ進む

### Incremental Delivery

1. Phase 1 → US1（架構正確性の確保）→ MVP
2. → US2（docs-agent 回答品質向上）→ Demo 可能
3. → US3（新規開発者向け quickstart 修正）→ 完全版
4. → Phase 5（CHANGELOG, テスト全確認, コミット）

---

## Notes

- [P] タスク = 別ファイルであり依存なし
- 同一ファイル内のタスクは必ず逐次実行（Edit の重複コンフリクト防止）
- TDD サイクル（T010 FAIL → T011 PASS）は constitution 上必須
- 各フェーズ末尾の Checkpoint で独立テスト可能であることを確認してから次へ進む
- 最終コミット前に `python -m pytest ../tests/ -v` でテストスイート全体をグリーン確認
