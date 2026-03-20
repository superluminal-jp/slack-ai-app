# Tasks: Whitelist Team and User Labels

**Input**: Design documents from `specs/048-whitelist-entity-labels/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Tests**: TDD は Constitution Principle II により必須。テストタスクは対応する実装タスクより先に実行し、実装前に失敗することを確認すること。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Exact file paths are included in every description

---

## Phase 1: Setup

**Purpose**: 既存テストスイートが全て通過することを確認してから変更を開始する。

- [X] T001 既存テストスイートが全て通過することを確認する: `cd verification-zones/verification-agent && python -m pytest tests/ -v`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `AuthorizationResult` dataclass に `team_label` / `user_label` フィールドを追加し、`load_whitelist_config()` の戻り値に `team_labels` / `user_labels` dict を追加し、`authorize_request()` でのラベル解決・ログ注入を実装する。全ユーザーストーリーが依存する共有データ構造の拡張。

**⚠️ CRITICAL**: Phase 2 が完了するまで Phase 3 以降の実装を開始してはならない。

### Tests (write first — must fail before implementation)

- [X] T002 `verification-zones/verification-agent/tests/test_authorization.py` に失敗するテストを追加する: `AuthorizationResult` が `team_label: Optional[str]` / `user_label: Optional[str]` フィールドを持ちデフォルト `None` であること; `load_whitelist_config()` の戻り値に `"team_labels"` / `"user_labels"` キー（型 `dict`）が含まれること; `authorize_request()` の成功・失敗ログに `team_label` / `user_label` が設定された場合はそれらが含まれ、未設定の場合はキーが省略されること
- [X] T003 `verification-zones/verification-agent/tests/test_main.py` と `test_slack_url_resolver.py` を更新する: `AuthorizationResult` モックインスタンスに `team_label=None` / `user_label=None` を追加し、既存テストが新フィールド追加後も通過するようにする

### Implementation

- [X] T004 `verification-zones/verification-agent/src/authorization.py` の `AuthorizationResult` dataclass に `team_label: Optional[str] = None` と `user_label: Optional[str] = None` フィールドを追加する（`channel_label` フィールドの前に配置）
- [X] T005 [P] `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/authorization.py` の `AuthorizationResult` dataclass に同じフィールドを追加する（T004 と並列実行可能）
- [X] T006 `verification-zones/verification-agent/src/authorization.py` の `load_whitelist_config()` を更新する: キャッシュ辞書と戻り値に `"team_labels": {}` / `"user_labels": {}` を追加する（現時点では空 dict — ローダー実装は Phase 3–5）
- [X] T007 [P] `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/whitelist_loader.py` の `load_whitelist_config()` を同様に更新する（T006 と並列実行可能）
- [X] T008 `verification-zones/verification-agent/src/authorization.py` の `authorize_request()` を更新する: channel_id と同様に `team_label = whitelist.get("team_labels", {}).get(team_id) if team_id else None` および `user_label = whitelist.get("user_labels", {}).get(user_id) if user_id else None` を解決し; 成功・失敗ログに `team_label` / `user_label` を truthy の場合のみ注入し; `AuthorizationResult` の `team_label` / `user_label` フィールドに設定する
- [X] T009 [P] `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/authorization.py` の `authorize_request()` を同様に更新する（T008 と並列実行可能）
- [X] T010 `cd verification-zones/verification-agent && python -m pytest tests/ -v` — 全テストが通過すること

**Checkpoint**: 共有データ構造の拡張完了。Phase 3–5 は並列実行可能。

---

## Phase 3: User Story 1 — DynamoDB Label Loading (Priority: P1) 🎯 MVP

**Goal**: `_get_whitelist_from_dynamodb()` が `team_id` / `user_id` アイテムの `label` 属性を読み込み、`team_labels` / `user_labels` dict を構築する。

**Independent Test**: DynamoDB のホワイトリストテーブルに `label` 属性付きの `team_id` / `user_id` エントリを登録し、認証ログに `team_label` / `user_label` が出力されることを確認すれば独立して価値を示せる。

### Tests (write first — must fail before implementation)

- [X] T011 [US1] `verification-zones/verification-agent/tests/test_authorization.py` に失敗するテストを追加する: DynamoDB レスポンスの `team_id` アイテムに `label` 属性がある場合 → `load_whitelist_config()["team_labels"]` がそのチームIDをキーにラベルをマッピングすること; `label` 属性がない `team_id` アイテム → `team_labels` にキーが存在しないこと; 空文字列 `label` → `team_labels` に格納されないこと; `user_id` アイテムについても同様の3ケース

### Implementation

- [X] T012 [US1] `verification-zones/verification-agent/src/authorization.py` の `_get_whitelist_from_dynamodb()` を更新する: whitelist dict に `team_labels: {}` / `user_labels: {}` を追加し; `entity_type == "team_id"` の item から `item.get("label", {}).get("S", "")` を読み込んで非空の場合 `whitelist["team_labels"][entity_id] = label` とし; `entity_type == "user_id"` も同様に `whitelist["user_labels"]` に格納する
- [X] T013 [P] [US1] `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/whitelist_loader.py` の `get_whitelist_from_dynamodb()` を同様に更新する（T012 と並列実行可能）
- [X] T014 [US1] `cd verification-zones/verification-agent && python -m pytest tests/ -v` — 全テストが通過すること

**Checkpoint**: US1 完了。DynamoDB 経由で team_id / user_id のラベルが認証ログに出力される。

---

## Phase 4: User Story 2 — Secrets Manager Object Format (Priority: P2)

**Goal**: `_get_whitelist_from_secrets_manager()` が `team_ids` / `user_ids` の各要素を `str` または `{"id": "...", "label": "..."}` オブジェクトとして解析し、`team_labels` / `user_labels` を構築する。

**Independent Test**: Secrets Manager のシークレットに `team_ids: [{"id": "T001", "label": "My Workspace"}]` 形式を設定し、認証ログに `team_label` が出力されることで独立して確認できる。

### Tests (write first — must fail before implementation)

- [X] T015 [US2] `verification-zones/verification-agent/tests/test_authorization.py` に失敗するテストを追加する: Secrets Manager のレスポンスで `team_ids: [{"id": "T001", "label": "My Workspace"}, "T002"]` → `team_labels == {"T001": "My Workspace"}` かつ `team_ids == {"T001", "T002"}`; `user_ids: [{"id": "U001", "label": "@alice"}, "U002"]` → `user_labels == {"U001": "@alice"}`; 全文字列形式 → `team_labels == {}` かつ `user_labels == {}`; `"label"` キーなし dict → ID は `team_ids` に含まれるがラベルなし; 空文字列 `"label"` → ラベルなしと同様

### Implementation

- [X] T016 [US2] `verification-zones/verification-agent/src/authorization.py` の `_get_whitelist_from_secrets_manager()` を更新する: `team_ids` / `user_ids` の各要素を channel_ids と同様に解析する — `str` の場合は直接集合に追加; `dict` で `"id"` キーがある場合はIDを集合に追加し `"label"` が truthy なら `team_labels` / `user_labels` に格納; whitelist dict に `team_labels` / `user_labels` を含める
- [X] T017 [P] [US2] `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/whitelist_loader.py` の `get_whitelist_from_secrets_manager()` を同様に更新する（T016 と並列実行可能）
- [X] T018 [US2] `cd verification-zones/verification-agent && python -m pytest tests/ -v` — 全テストが通過すること

**Checkpoint**: US2 完了。Secrets Manager オブジェクト形式で team_id / user_id のラベルが使用可能。

---

## Phase 5: User Story 3 — Environment Variable `ID:label` Format (Priority: P3)

**Goal**: `_get_whitelist_from_env()` が `WHITELIST_TEAM_IDS` / `WHITELIST_USER_IDS` トークンを `ID:label` 形式で解析し、`team_labels` / `user_labels` を構築する。

**Independent Test**: `WHITELIST_TEAM_IDS=T001:My Workspace,T002` を設定し、`T001` の認証ログに `team_label=My Workspace` が含まれ、`T002` のログにはラベルがないことを確認すれば独立して価値を示せる。

### Tests (write first — must fail before implementation)

- [X] T019 [US3] `verification-zones/verification-agent/tests/test_authorization.py` に失敗するテストを追加する: `WHITELIST_TEAM_IDS="T001:My Workspace,T002:Other Workspace"` → `team_ids == {"T001", "T002"}` かつ `team_labels == {"T001": "My Workspace", "T002": "Other Workspace"}`; `WHITELIST_USER_IDS="U001:@alice,U002"` → `user_ids == {"U001", "U002"}` かつ `user_labels == {"U001": "@alice"}`; 従来形式 `"T001,T002"` → `team_labels == {}`; 空ラベル `"T001:"` → `T001` は `team_ids` に含まれるが `team_labels` にキーなし

### Implementation

- [X] T020 [US3] `verification-zones/verification-agent/src/authorization.py` の `_get_whitelist_from_env()` を更新する: `team_ids_str` を channel_ids と同様に `token.split(":", 1)` でパースし `team_labels` dict を構築する; `user_ids_str` も同様に `user_labels` dict を構築する; whitelist dict に `team_labels` / `user_labels` を含める
- [X] T021 [P] [US3] `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/whitelist_loader.py` の `get_whitelist_from_env()` を同様に更新する（T020 と並列実行可能）
- [X] T022 [US3] `cd verification-zones/verification-agent && python -m pytest tests/ -v` — 全テストが通過すること

**Checkpoint**: 全3ユーザーストーリー完了。全設定経路でラベルが機能する。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 品質確認・ドキュメント同期・デプロイ検証。

- [X] T023 `cd verification-zones/verification-agent && python -m pytest tests/ -v` — フルスイートで全テストがグリーンであること
- [X] T024 [P] `cd verification-zones/verification-agent/src && ruff check .` — ゼロエラーであること
- [X] T025 [P] `CHANGELOG.md` の `[Unreleased]` セクションを更新する: team_id / user_id へのラベルサポート拡張を Added エントリとして追加（DynamoDB・Secrets Manager・環境変数の全3経路に対応）
- [X] T026 [P] `verification-zones/verification-agent/README.md` と `verification-zones/verification-agent/README.ja.md` を更新する: `team_id` / `user_id` エントリへのラベル追加と3つの設定形式を文書化する
- [X] T027 `CLAUDE.md` の "Recent Changes" セクションを更新する: `team_label` / `user_label` フィールドの追加と3設定経路対応を記録する

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし — 即時開始可能
- **Foundational (Phase 2)**: Phase 1 完了後 — **全ユーザーストーリーフェーズをブロック**
- **US1 (Phase 3)**: Phase 2 完了後 — US2/US3 への依存なし
- **US2 (Phase 4)**: Phase 2 完了後 — US1/US3 への依存なし
- **US3 (Phase 5)**: Phase 2 完了後 — US1/US2 への依存なし
- **Polish (Phase 6)**: 全ユーザーストーリー完了後

### User Story Dependencies

- **US1 (P1)**: 独立 — DynamoDB ローダーのみ変更
- **US2 (P2)**: 独立 — Secrets Manager ローダーのみ変更
- **US3 (P3)**: 独立 — 環境変数ローダーのみ変更

### Parallel Opportunities Within Each Phase

| Phase | Parallel Tasks |
|-------|---------------|
| Phase 2 | T005 ∥ T007 ∥ T009 (異なるファイル) |
| Phase 3 | T012 ∥ T013 (agent src vs Lambda コピー) |
| Phase 4 | T016 ∥ T017 (agent src vs Lambda コピー) |
| Phase 5 | T020 ∥ T021 (agent src vs Lambda コピー) |
| Phase 6 | T024 ∥ T025 ∥ T026 (独立した操作) |

### Cross-phase Parallel Opportunities

Phase 2 完了後、US1/US2/US3 はすべて並列で進められる（ファイルの重複なし）。

---

## Parallel Example: Phase 2 (Foundational)

```bash
# T002–T003 のテスト作成後:
# 以下を並列実行:
Task T004: AuthorizationResult フィールド追加 (src/authorization.py)
Task T005: AuthorizationResult フィールド追加 (Lambda authorization.py) ← T004 と並列

Task T006: load_whitelist_config() 更新 (src/authorization.py)
Task T007: load_whitelist_config() 更新 (Lambda whitelist_loader.py) ← T006 と並列

Task T008: authorize_request() ラベル解決・ログ注入 (src/authorization.py)
Task T009: authorize_request() ラベル解決・ログ注入 (Lambda authorization.py) ← T008 と並列
```

## Parallel Example: Phase 2 完了後

```bash
# 全ユーザーストーリーを並列実行可能:
US1: Phase 3 (DynamoDB ローダー)     — src/authorization.py + Lambda whitelist_loader.py
US2: Phase 4 (Secrets Manager ローダー) — src/authorization.py + Lambda whitelist_loader.py
US3: Phase 5 (環境変数ローダー)       — src/authorization.py + Lambda whitelist_loader.py
```

> **Note**: US1/US2/US3 はいずれも `src/authorization.py` と `Lambda whitelist_loader.py` を変更するため、同一ファイルへの競合を避けるため実際には順番に実行すること（または Git ブランチを分けてマージ）。

---

## Implementation Strategy

### MVP (User Story 1 のみ)

1. Phase 1: Setup 完了
2. Phase 2: Foundational 完了 ← **CRITICAL**
3. Phase 3: US1 (DynamoDB) 完了
4. **STOP and VALIDATE**: DynamoDB にラベル付き team_id / user_id エントリを追加し、認証ログに `team_label` / `user_label` が出力されることを確認
5. MVP シップ — US2/US3 は追加価値として段階的に提供

### Incremental Delivery

1. Phase 1 + 2 → 基盤準備完了
2. Phase 3 (US1) → DynamoDB 管理ホワイトリストでラベル機能 → デプロイ/デモ
3. Phase 4 (US2) → Secrets Manager 管理ホワイトリストでラベル機能 → デプロイ/デモ
4. Phase 5 (US3) → 環境変数フォールバックでラベル機能 → デプロイ/デモ

---

## Task Summary

| Phase | Tasks | Story |
|-------|-------|-------|
| Phase 1: Setup | T001 | — |
| Phase 2: Foundational | T002–T010 | — |
| Phase 3: DynamoDB | T011–T014 | US1 |
| Phase 4: Secrets Manager | T015–T018 | US2 |
| Phase 5: Env Var | T019–T022 | US3 |
| Phase 6: Polish | T023–T027 | — |
| **Total** | **27 tasks** | |

- Tests: T002, T003, T011, T015, T019 (5 test-writing tasks)
- Implementation: T004–T009, T012–T013, T016–T017, T020–T021 (12 tasks)
- Validation runs: T001, T010, T014, T018, T022, T023 (6 tasks)
- Documentation: T024, T025, T026, T027 (4 tasks)
- Parallel opportunities: T005, T007, T009, T013, T017, T021, T024, T025, T026 (9 tasks marked [P])
