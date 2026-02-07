# Tasks: A2A ファイルを Execution Zone で生成し Slack スレッドに返す

**Input**: Design documents from `/specs/014-a2a-file-to-slack/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: TDD に従い、各ユーザーストーリーで「テストを先に書き、失敗を確認してから実装」する順序でタスクを並べる。

**Organization**: ユーザーストーリーごとに Phase を分け、各 Phase 内は Tests → Implementation の順。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（別ファイル・未完了タスクへの依存なし）
- **[Story]**: ユーザーストーリー（US1, US2, US3）
- 各タスクに具体的なファイルパスを含める

---

## Phase 1: Setup（014 用の共通基盤）

**Purpose**: ファイルサイズ・MIME 制限の設定を追加し、全ストーリーで利用する。

- [ ] T001 [P] Add file limit config module in `cdk/lib/execution/agent/execution-agent/file_config.py`: MAX_FILE_SIZE_BYTES (default 5*1024*1024), ALLOWED_MIME_TYPES (default ["text/csv","application/json","text/plain"]), read from env with fallback to defaults per research R-003
- [ ] T002 [P] Add unit tests for file_config in `cdk/lib/execution/agent/execution-agent/tests/test_file_config.py`: default values, env override, validation helpers (is_allowed_mime, is_within_size_limit)

---

## Phase 2: Foundational（全ストーリーが依存する前提）

**Purpose**: ファイル artifact の組み立てと検証に必要な定数・ヘルパーを定義する。A2A 契約（generated_file artifact 名・part キー）をコードで一箇所定義する。

- [ ] T003 [P] Add A2A file artifact constants in `cdk/lib/execution/agent/execution-agent/response_formatter.py`: GENERATED_FILE_ARTIFACT_NAME, part keys (contentBase64, fileName, mimeType) per contracts/a2a-file-artifact.yaml
- [ ] T004 [P] Add helper in `cdk/lib/execution/agent/execution-agent/response_formatter.py`: validate_file_for_artifact(file_bytes, file_name, mime_type) using file_config (size + MIME), returns (ok: bool, error_message: str | None)
- [ ] T005 Add unit tests for validate_file_for_artifact in `cdk/lib/execution/agent/execution-agent/tests/test_response_formatter.py`: within limit + allowed MIME returns ok; over size or disallowed MIME returns error_message

---

## Phase 3: User Story 1 — ユーザーが AI 生成ファイルをスレッドで受け取る (Priority: P1) MVP

**Goal**: Execution がファイルを生成し A2A の generated_file artifact で返す。Verification が artifact をパースし、Slack スレッドにテキスト→ファイルの順で投稿する。

**Independent Test**: Slack で「CSV でエクスポートして」等と依頼し、スレッドにテキストとファイルの両方が表示され、ファイルがダウンロードできること。

### Tests for User Story 1 (TDD: 先に書き、失敗を確認してから実装)

- [ ] T006 [P] [US1] Add Execution Agent tests in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`: A2A response contains exactly two artifacts when file is returned (execution_response + generated_file); generated_file has name "generated_file" and one part with contentBase64, fileName, mimeType; response_text and file artifact coexist
- [ ] T007 [P] [US1] Add Verification Agent tests in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`: when A2A result has generated_file artifact, post_file_to_slack is called with correct channel, thread_ts, file_bytes, file_name, mime_type, bot_token; when both text and file, post_to_slack is called before post_file_to_slack (order)
- [ ] T008 [P] [US1] Add unit tests for post_file_to_slack in `cdk/lib/verification/agent/verification-agent/tests/test_slack_poster.py`: signature post_file_to_slack(channel, thread_ts, file_bytes, file_name, mime_type, bot_token); raises ValueError for empty channel/file_name/bot_token; documents that SlackApiError is raised on API failure (contract slack-file-poster.yaml)

### Implementation for User Story 1

- [ ] T009 [US1] Extend `cdk/lib/execution/agent/execution-agent/response_formatter.py`: add build_file_artifact(file_bytes, file_name, mime_type) returning artifact dict per data-model and contracts/a2a-file-artifact.yaml (Base64 encode, artifactId UUID, name "generated_file", single part with kind "file")
- [ ] T010 [US1] Extend `cdk/lib/execution/agent/execution-agent/response_formatter.py`: format_success_response accepts optional file_bytes, file_name, mime_type; when provided and validate_file_for_artifact passes, return (response_dict, file_artifact_dict) from build_file_artifact; otherwise return (response_dict, None); caller in main.py builds A2A result.artifacts from execution_response plus optional generated_file
- [ ] T011 [US1] Update `cdk/lib/execution/agent/execution-agent/main.py`: after Bedrock success, if file generation produces (file_bytes, file_name, mime_type), call format_success_response with file args; build A2A result.artifacts with execution_response artifact first, then generated_file artifact if present; ensure existing text-only path unchanged
- [ ] T012 [US1] Implement post_file_to_slack in `cdk/lib/verification/agent/verification-agent/slack_poster.py` per contracts/slack-file-poster.yaml: parameters channel, thread_ts, file_bytes, file_name, mime_type, bot_token; use Slack SDK upload_v2 or files.getUploadURLExternal → POST → files.completeUploadExternal; pass thread_ts if API supports; structured logging and raise SlackApiError on failure
- [ ] T013 [US1] Add helper in `cdk/lib/verification/agent/verification-agent/main.py`: parse_file_artifact(artifacts: list) -> (file_bytes, file_name, mime_type) | None; find artifact with name "generated_file", decode Base64 from part, return tuple or None
- [ ] T014 [US1] Update `cdk/lib/verification/agent/verification-agent/main.py`: after parsing execution_result (text artifact), call parse_file_artifact(result_data or A2A result); if file present, post text first (post_to_slack), then post_file_to_slack; on post_file_to_slack exception, post error message to thread (FR-007)
- [ ] T015 [US1] Add CloudWatch metric or structured log in `cdk/lib/verification/agent/verification-agent/main.py` when file artifact is posted or when file post fails (observability)

**Checkpoint**: US1 完了。テキスト＋ファイルのフローが E2E で動作し、T006–T008 のテストがパスする。

---

## Phase 4: User Story 2 — テキストのみ・ファイルのみの応答をサポート (Priority: P2)

**Goal**: テキストのみの場合は既存動作のまま。ファイルのみの場合はファイルだけスレッドに投稿する。

**Independent Test**: テキストのみリクエストで既存と同様にテキストのみ表示。ファイルのみを返すリクエストでファイルのみスレッドに表示されること。

### Tests for User Story 2 (TDD)

- [ ] T016 [P] [US2] Add Execution Agent tests in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`: when no file is generated, A2A response has exactly one artifact (execution_response); when only file (no response_text), execution_response has empty or minimal response_text and generated_file artifact is present
- [ ] T017 [P] [US2] Add Verification Agent tests in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`: when only execution_response (no generated_file), only post_to_slack is called, post_file_to_slack is not called; when only generated_file (no or empty response_text), post_file_to_slack is called and post_to_slack is not called for content (or called with empty string is acceptable per product)

### Implementation for User Story 2

- [ ] T018 [US2] Update `cdk/lib/execution/agent/execution-agent/main.py`: support response_text empty when only file is returned; ensure artifact list is still [execution_response, generated_file] or [execution_response] so Verification logic is consistent
- [ ] T019 [US2] Update `cdk/lib/verification/agent/verification-agent/main.py`: when response_text is absent or empty and file artifact exists, skip post_to_slack for text and only call post_file_to_slack; when only text (no file artifact), keep current behavior (post_to_slack only)

**Checkpoint**: US2 完了。テキストのみ・ファイルのみの両方が独立してテスト可能。

---

## Phase 5: User Story 3 — ファイルサイズ・タイプの制限とユーザー通知 (Priority: P2)

**Goal**: 最大サイズ超過・許可外 MIME の場合はファイルを送らず、ユーザーに分かりやすいテキストで理由を返す。Slack アップロード失敗時もスレッドにエラーメッセージを投稿する（FR-005, FR-006, FR-007）。

**Independent Test**: 制限超過のファイルを要求するとファイルは届かず「ファイルが大きすぎます」等のメッセージが表示される。許可外タイプも同様。Slack アップロード失敗時は「ファイルの投稿に失敗しました」等がスレッドに表示される。

### Tests for User Story 3 (TDD)

- [ ] T020 [P] [US3] Add Execution Agent tests in `cdk/lib/execution/agent/execution-agent/tests/test_main.py`: when file exceeds MAX_FILE_SIZE_BYTES, no generated_file artifact is added; response_text contains user-facing message (e.g. ファイルが大きすぎます); when mime_type not in ALLOWED_MIME_TYPES, no generated_file artifact; response_text contains appropriate message
- [ ] T021 [P] [US3] Add Verification Agent tests in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`: when post_file_to_slack raises SlackApiError, post_to_slack is called with error message text (FR-007); no unhandled exception
- [ ] T022 [P] [US3] Add unit tests in `cdk/lib/execution/agent/execution-agent/tests/test_response_formatter.py`: validate_file_for_artifact rejects file over MAX_FILE_SIZE_BYTES; rejects mime_type not in ALLOWED_MIME_TYPES; accepts boundary size and allowed MIME

### Implementation for User Story 3

- [ ] T023 [US3] In `cdk/lib/execution/agent/execution-agent/main.py`: before adding file artifact, call validate_file_for_artifact; on failure return format_success_response with response_text including user-facing size/MIME message and no file artifact (FR-005, FR-006)
- [ ] T024 [US3] In `cdk/lib/verification/agent/verification-agent/main.py`: wrap post_file_to_slack in try/except; on SlackApiError (or generic exception), call post_to_slack with ファイルの投稿に失敗しました。しばらくしてからお試しください。 (or configurable message) to same thread (FR-007)
- [ ] T025 [US3] Add structured logging in `cdk/lib/execution/agent/execution-agent/main.py` when file is rejected (size/MIME) and in `cdk/lib/verification/agent/verification-agent/main.py` when file upload fails; include correlation_id and reason

**Checkpoint**: US3 完了。制限とエラー時のユーザー通知が仕様どおり動作する。

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: ドキュメント、契約との整合、quickstart 検証。

- [ ] T026 [P] Update `cdk/lib/execution/agent/execution-agent/agent_card.py`: add skill or capability for file generation (e.g. "generated-file") per specs/014-a2a-file-to-slack/contracts/a2a-file-artifact.yaml if Agent Card に出力モードを明示する方針なら
- [ ] T027 [P] Update `docs/reference/architecture/zone-communication.md` or feature doc: add section for 014 file artifact flow (Execution → generated_file artifact → Verification → post_file_to_slack), max size and allowed MIME, link to contracts
- [ ] T028 Run quickstart validation per `specs/014-a2a-file-to-slack/quickstart.md`: run Execution/Verification tests, optionally manual E2E (deploy 013 + 014 changes, request file in Slack, confirm thread shows file)
- [ ] T029 [P] Add CDK or IAM note for Verification Agent: ensure Bot token scope includes files:write (document in README or verification-stack comment) per research R-002

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 依存なし。T001–T002 は並列可。
- **Phase 2 (Foundational)**: Phase 1 完了後に実施。T003–T005 は T001 の file_config に依存。
- **Phase 3 (US1)**: Phase 2 完了後に実施。T006–T008 を先に書き失敗確認 → T009–T015 で実装。
- **Phase 4 (US2)**: Phase 3 完了後に実施。T016–T017 を先に書き → T018–T019 で実装。
- **Phase 5 (US3)**: Phase 3 完了後から可能（US2 と並列可）。T020–T022 を先に書き → T023–T025 で実装。
- **Phase 6 (Polish)**: Phase 3 以上完了後。T026–T029 は互いにほぼ独立。

### User Story Dependencies

- **US1 (P1)**: Phase 2 完了後。他ストーリーに依存しない。MVP。
- **US2 (P2)**: US1 完了後が望ましい（post_file_to_slack と parse_file_artifact が存在する前提）。独立テスト可能。
- **US3 (P2)**: US1 完了後が望ましい。validate_file_for_artifact と post_file_to_slack のエラーハンドリングを拡張。独立テスト可能。

### TDD Within Each Story

- 各ストーリーで「テストタスク → 実装タスク」の順を守る。テストを先に追加し、失敗を確認してから実装でパスさせる。
- 並列可能なテストタスクは [P] で明示（別ファイルなので同時に着手可能）。

### Parallel Opportunities

- Phase 1: T001 と T002 は並列可能。
- Phase 2: T003 と T004 は並列可能。T005 は T004 に依存。
- Phase 3: T006, T007, T008 は並列可能。T009–T015 は依存に従い順次。
- Phase 4: T016 と T017 は並列可能。
- Phase 5: T020, T021, T022 は並列可能。
- Phase 6: T026, T027, T029 は並列可能。

---

## Parallel Example: User Story 1 (TDD)

```bash
# 1) テストを 3 本まとめて追加し、実行して失敗を確認
T006: test_main.py (Execution) — file artifact を含むレスポンスの検証
T007: test_main.py (Verification) — post_file_to_slack 呼び出し・順序の検証
T008: test_slack_poster.py — post_file_to_slack シグネチャ・バリデーション

# 2) 実装を順に実施（T009 → T010 → … → T015）
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup（T001–T002）
2. Phase 2: Foundational（T003–T005）
3. Phase 3: US1 — テスト T006–T008 を追加し失敗確認 → T009–T015 で実装
4. **STOP and VALIDATE**: US1 の Independent Test（Slack でファイル生成依頼 → スレッドに表示）で検証
5. 必要ならデプロイ・デモ

### Incremental Delivery

1. Setup + Foundational → 設定と artifact 検証の土台完了
2. US1 完了 → テキスト＋ファイルの E2E が動作（MVP）
3. US2 完了 → テキストのみ・ファイルのみの両方がサポート
4. US3 完了 → サイズ/MIME 制限とエラー通知が仕様どおり
5. Polish → ドキュメントと quickstart 検証

### Best Practices Applied

- **TDD**: 各ストーリーでテストを先に書き、レッド→グリーン→リファクタの順を守る。
- **契約駆動**: contracts/a2a-file-artifact.yaml と slack-file-poster.yaml に沿った実装タスクを明示。
- **単一責任**: Execution はファイル生成と artifact 組み立て、Verification はパースと Slack 投稿に分離。
- **観測可能性**: ファイル拒否・アップロード失敗時に構造化ログ・メトリクスを追加（T015, T025）。

---

## Notes

- [P] タスクは別ファイルまたは依存なしで並列実行可能。
- [USn] は spec.md の User Story n へのトレーサビリティ。
- 各ストーリーは独立して完了・テスト可能。MVP は US1 のみで価値提供。
- テストは必ず「先に追加 → 失敗確認 → 実装でパス」の順で実施する。
