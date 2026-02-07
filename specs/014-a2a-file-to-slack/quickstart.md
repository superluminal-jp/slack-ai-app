# Quickstart: A2A ファイルを Execution Zone で生成し Slack に返す

**Branch**: `014-a2a-file-to-slack` | **Date**: 2026-02-08

---

## 前提条件

- 013（AgentCore A2A ゾーン間通信）がデプロイ済みであること
- Execution Agent / Verification Agent が A2A で通信し、テキスト応答が Slack スレッドに投稿できる状態
- Slack App に `files:write` スコープが付与されていること

---

## 014 で追加する開発・検証の流れ

### 1. 仕様の確認

- [spec.md](./spec.md): ユーザーストーリー、FR、成功基準
- [research.md](./research.md): A2A file artifact 形式、Slack 新アップロード API、サイズ・MIME 制限
- [contracts/](./contracts/): `a2a-file-artifact.yaml`、`slack-file-poster.yaml`

### 2. Execution Agent 側

1. **ファイル生成ロジック**
   - Bedrock の出力を CSV/JSON 等に変換する処理を追加（または既存フローの延長）。
   - 生成したバイナリを Base64 エンコードし、`generated_file` artifact を組み立てる（[contracts/a2a-file-artifact.yaml](./contracts/a2a-file-artifact.yaml) に従う）。
2. **サイズ・MIME チェック**
   - 最大 5 MB（設定可能）、許可 MIME は `text/csv`, `application/json`, `text/plain`。超過・許可外の場合はファイル artifact を付けず、テキストで理由を返す。
3. **response_formatter の拡張**
   - 成功時、テキスト用の `execution_response` artifact に加え、ファイルがある場合のみ `generated_file` artifact を `result.artifacts` に追加する。

### 3. Verification Agent 側

1. **A2A レスポンスのパース**
   - `result.artifacts` を走査し、`name === "generated_file"` の artifact を取得。`parts` から Base64 をデコードして `file_bytes`、`file_name`、`mime_type` を取り出す。
2. **post_file_to_slack の実装**
   - [contracts/slack-file-poster.yaml](./contracts/slack-file-poster.yaml) に従い、`files.getUploadURLExternal` → 返却 URL に POST → `files.completeUploadExternal`（`channel_id`、可能なら `thread_ts`）を実行。Slack Python SDK の `upload_v2` が使える場合はそれを利用。
3. **main の分岐**
   - テキストは従来どおり `post_to_slack`。ファイル artifact が存在する場合はデコード後に `post_file_to_slack` を呼び、失敗時はスレッドにエラーメッセージを投稿（FR-007）。
4. **投稿順序**
   - テキスト → ファイルの順で投稿（R-004）。

### 4. 単体・結合テスト

- Execution: ファイル artifact を返すケース／返さないケース／サイズ超過・許可外 MIME のケースを pytest でカバー。
- Verification: A2A レスポンスに `generated_file` が含まれるモックで `post_file_to_slack` が呼ばれること、失敗時にテキストが投稿されることを検証。
- 可能であれば、013 の E2E 環境で「CSV を生成して」等のメッセージを送り、スレッドにファイルが出現することを手動確認。

### 5. 設定

- 最大ファイルサイズ・許可 MIME タイプは環境変数または設定ストアで変更可能にし、[research.md](./research.md) の推奨値（5 MB、text/csv, application/json, text/plain）をデフォルトとする。

---

## トラブルシューティング

| 現象 | 確認ポイント |
|------|--------------|
| ファイルがスレッドに表示されない | Verification のログで `post_file_to_slack` が呼ばれているか、Slack API エラーが出ていないか。Bot に `files:write` があるか。 |
| 「ファイルが大きすぎます」とだけ返る | Execution のサイズチェック。設定の MAX_FILE_SIZE_BYTES を確認。 |
| 許可外 MIME で拒否される | ALLOWED_MIME_TYPES と生成時の mime_type を照合。 |
| thread_ts を渡しているのにスレッドに出ない | Slack の `files.completeUploadExternal` で `thread_ts` がサポートされているか API ドキュメントで確認。未対応なら channel のみで投稿し、initial_comment でスレッドを参照する等を検討。 |
