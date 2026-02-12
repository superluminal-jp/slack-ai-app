# Slack Post Request: file_artifact 拡張 (028)

**前提**: [specs/019-slack-poster-separation/contracts/slack-post-request.md](../../019-slack-poster-separation/contracts/slack-post-request.md) を拡張する。

## file_artifact の二形式

028 より、`file_artifact` は **インライン** と **S3 経由** のいずれか一方を含む。

### インライン形式（既存）

サイズ ≤ 200 KB のファイル。SQS メッセージに Base64 をそのまま含める。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `contentBase64` | string | ✅ | ファイル内容の Base64 |
| `fileName` | string | ✅ | ファイル名 |
| `mimeType` | string | ✅ | MIME タイプ |

### S3 経由形式（追加）

サイズ > 200 KB のファイル。S3 にアップロードし、署名付き URL のみを SQS に含める。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `s3PresignedUrl` | string | ✅ | 署名付き GET URL。有効期限 15 分 |
| `fileName` | string | ✅ | ファイル名 |
| `mimeType` | string | ✅ | MIME タイプ |

### 排他制約

- `contentBase64` と `s3PresignedUrl` は **同時に存在しない**
- どちらか一方が存在し、`fileName` と `mimeType` は常に必須

## Slack Poster の処理

1. `file_artifact` が存在する場合:
   - `s3PresignedUrl` がある場合: `urllib.request.urlopen(url).read()` で取得 → `files.upload_v2`
   - `contentBase64` がある場合: `base64.b64decode` → `files.upload_v2`
2. 両方ない場合は無効な `file_artifact`。エラーハンドリング。

## 後方互換性

- 既存メッセージ（`contentBase64` のみ）はそのまま動作
- 新形式（`s3PresignedUrl` のみ）を追加。Poster は両方に対応
