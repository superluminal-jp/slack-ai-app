# Research: A2A ファイルを Execution Zone で生成し Slack に返す

**Branch**: `014-a2a-file-to-slack` | **Date**: 2026-02-08

---

## R-001: A2A レスポンスでファイルを渡す形式（file part / artifact）

**Decision**: Execution → Verification の A2A レスポンスで、既存の `execution_response` artifact に加え、**別 artifact** でファイルを返す。artifact の `parts` に `kind: "file"` を 1 つ含め、内容は **Base64 エンコード** で渡す。メタデータ（ファイル名、MIME タイプ）は artifact の `name` または part の拡張プロパティで付与する。

**Rationale**:
- AWS A2A プロトコル契約（runtime-a2a-protocol-contract）の Response 例では `parts` に `kind: "text"` のみ記載されているが、同一ドキュメントおよび 013 の research で「A2A は `text`/`file` parts をサポート」とされている。
- バイナリを JSON-RPC で送るため Base64 が一般的。AgentCore Runtime は 100MB ペイロードまでサポートするが、Slack 側とポリシーで最大ファイルサイズを決めるため、実質は数 MB 程度に制限する想定。
- 既存の `execution_response` artifact はテキストの ExecutionResponse JSON のまま維持し、**file 用に別 artifact**（例: `name: "generated_file"`）を 1 つ追加する形にすると、Verification 側のパースがシンプルで後方互換も保てる。

**Alternatives considered**:
- 同一 artifact 内に `text` part と `file` part を両方入れる: 仕様上可能だが、既存の「1 artifact = execution_response JSON」の契約を変えるため、別 artifact の方が影響範囲が小さい。
- ファイルを S3 に置き URL だけ A2A で渡す: スコープ外（本機能は「スレッドに返す」のみ）。将来拡張で検討可能。

---

## R-002: Slack にファイルをアップロードしてスレッドに表示する方法

**Decision**: **Slack 推奨の新フロー** を使う: `files.getUploadURLExternal` → 返却 URL にファイル本体を POST → `files.completeUploadExternal` で `channel_id` を指定して共有する。スレッドに紐づけるには `files.completeUploadExternal` の **`thread_ts`** パラメータの有無を API ドキュメントで確認し、サポートされていれば指定する。サポートされていない場合は、同一 `channel_id` に投稿し、`initial_comment` でスレッドの親メッセージを参照するなどの運用で代替を検討する。

**Rationale**:
- `files.upload` は 2025 年 11 月に廃止予定。新アプリでは `files.getUploadURLExternal` + `files.completeUploadExternal` が推奨。
- Slack ドキュメント「Working with files」では、アップロード手順として (1) getUploadURLExternal (2) バイナリを POST (3) completeUploadExternal（`channel_id`、`initial_comment`）が明示されている。Python SDK の `upload_v2` がこの 3 段階をラップするため、実装では SDK の `upload_v2` を優先し、必要なら生 API で `thread_ts` の有無を確認する。
- スコープ: `files:write`（および必要に応じて `files:read`）を Verification 用 Bot に付与する。

**Alternatives considered**:
- 非推奨の `files.upload`: 長期運用で使わない。
- `chat.postMessage` の `files` パラメータ: 既存のファイル ID を添付する用であり、新規アップロードした内容を直接渡す用途では getUploadURLExternal フローと組み合わせる必要がある。

---

## R-003: 生成ファイルの最大サイズと許可 MIME タイプ

**Decision**:
- **最大ファイルサイズ**: 初回は **5 MB** を上限とする。A2A ペイロード・Slack 制限・メモリを考慮した保守的な値。超過時はファイルを返さず、テキストで「ファイルが大きすぎます」等のメッセージを返す（FR-005）。
- **許可 MIME タイプ**: 初回は **text/csv**, **application/json**, **text/plain** に限定する。ユーザーが「CSV でエクスポート」「JSON で返して」等を依頼したケースをカバー。必要に応じて **application/pdf** を追加するかは product 判断とする。
- 上記は設定可能（環境変数または設定ストア）にし、デプロイ後に変更できるようにする。

**Rationale**:
- Slack のスニペットは 1 MB 制限があるが、通常のファイルアップロードはより大きい制限がある。5 MB は多くの CSV/JSON 出力で足りつつ、誤った巨大出力を防ぐ。
- MIME 制限により、実行可能ファイルや不正なタイプの混入を防ぐ（FR-006）。

---

## R-004: テキストとファイルの両方がある場合の投稿順序

**Decision**: **テキストを先に投稿し、続けてファイルを投稿する**（FR-008）。同一 `thread_ts` を使い、両方ともスレッド内に表示される。

**Rationale**: ユーザーはまず説明文を読み、その後にファイルを開く流れが自然。順序を逆にすると「ファイルだけ見えて説明が後」になりやすい。

---

## R-005: 複数ファイル・部分成功の扱い（初回スコープ）

**Decision**:
- **複数ファイル**: 初回は **1 レスポンスあたり 1 ファイル** に限定する。複数生成したい場合は「1 つにまとめる（ZIP 等）」か、ユーザーに複数回依頼してもらう。仕様の Edge Case に「複数ファイルは明確なポリシーで」とあるため、初回は「1 つのみ」と明示する。
- **部分成功（ファイルはあるがエラーも返したい）**: 初回は「成功時はテキスト + オプションで 1 ファイル」「エラー時はテキストのみ」に統一する。ファイルとエラーを同時に返すパターンはスコープ外とする。

**Rationale**: 実装とテストを単純にし、リリース後にフィードバックで複数ファイルや部分成功を検討する。

---

## R-006: Verification 側の post_file_to_slack API 設計

**Decision**: `slack_poster` に **`post_file_to_slack(channel, thread_ts, file_bytes, file_name, mime_type, bot_token)`** を追加する。失敗時は例外を上げ、呼び出し元（main）でキャッチしてスレッドにエラーメッセージを投稿する（FR-007）。Slack SDK の `upload_v2` が使える場合はそれを利用し、`thread_ts` を渡せるかは SDK ドキュメントで確認する。

**Rationale**: 既存の `post_to_slack`（テキスト）と対になる API にすることで、main の分岐が読みやすくなる。ファイル専用のリトライは、Slack の rate limit 等を考慮し、必要なら `post_file_to_slack` 内で実施する。
