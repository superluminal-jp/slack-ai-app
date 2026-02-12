# Research: S3-backed Large File Artifact (028)

**Feature Branch**: `028-s3-large-file-transfer`  
**Date**: 2026-02-11  
**Source**: AWS MCP (aws-knowledge-mcp-server), AWS Documentation, 024/027 既存設計

---

## 1. SQS メッセージサイズ制限

### Decision

| 項目 | 値 | 根拠 |
|------|-----|------|
| 従来制限 | 256 KB | [SQS Quotas](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html) |
| 新制限 (2025年8月～) | 1 MiB | [AWS What's New](https://aws.amazon.com/about-aws/whats-new/2025/08/amazon-sqs-max-payload-size-1mib/) |
| 本機能の閾値 | 200 KB | 安全マージンとベース64オーバーヘッドを考慮 |

### Rationale

- Base64 エンコードで約 33% 増加: 192 KB のバイナリ → 約 256 KB のペイロード
- 200 KB 閾値で SQS 送信失敗を確実に回避
- 1 MiB 対応を待たずに実装可能（後方互換性を維持）

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| SQS Extended Client Library | Java 専用。本プロジェクトは Python。S3 + 署名付き URL で同等の効果を実現 |
| 閾値 256 KB | 境界付近で失敗リスク。200 KB で余裕を持たせる |
| 1 MiB に全面移行 | リージョン・デプロイ状態による。既存 256 KB 環境でも動作する設計を優先 |

---

## 2. S3 署名付き URL

### Decision

| 項目 | 値 | 根拠 |
|------|-----|------|
| 有効期限 | 15 分 (900 秒) | 024 の既存決定と同一 |
| HTTP メソッド | GET | ダウンロード専用 |
| 認証 | IAM 経由で生成。URL に署名を含む | [AWS S3 Presigned URL](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html) |

### Rationale

- SQS 可視性タイムアウト 60 秒、処理完了まで数秒～数十秒。15 分で十分な余裕
- Slack Poster Lambda が `urllib.request.urlopen(url).read()` で取得
- 024 の `attachments/` と同じパターン。既存 `generate_presigned_url` を流用可能

### AWS Best Practices (MCP 調査結果)

- 署名付き URL は有効期限内のみ有効。期限切れ後は 403
- 生成時の IAM 権限が失効すると URL も無効化
- システムクロックずれで SignatureDoesNotMatch の可能性 → NTP 同期を前提

---

## 3. S3 ライフサイクルルール

### Decision

| 項目 | 値 | 根拠 |
|------|-----|------|
| プレフィックス | `generated_files/` | `attachments/` と分離。Execution → Slack 向け |
| 有効期限 | 1 日 | [S3 Lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html) |
| 即時削除 | 不要 | 処理完了後の削除タイミングが不確定。ライフサイクルに委ねる |

### Rationale

- 024 の `attachments/` と同様の 1 日ルールを `generated_files/` に追加
- `attachments/` は Verification → Execution 向け。`generated_files/` は Execution → Slack 向けで用途が異なる
- 同一バケットにプレフィックス追加で CDK 変更を最小化

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| 別バケット | 管理負荷増。同一バケットでプレフィックス分離で十分 |
| 即時削除（Verification 完了後に delete） | 非同期処理のため完了判定が複雑。1 日ライフサイクルで十分 |

---

## 4. 契約拡張: file_artifact の二形式

### Decision

| 形式 | フィールド | 用途 |
|------|-----------|------|
| インライン | `contentBase64`, `fileName`, `mimeType` | サイズ ≤ 200 KB |
| S3 経由 | `s3PresignedUrl`, `fileName`, `mimeType` | サイズ > 200 KB |

### Rationale

- いずれか一方のみ存在。`contentBase64` と `s3PresignedUrl` は排他
- 後方互換: 既存メッセージ（contentBase64 のみ）はそのまま動作
- Slack Poster は両形式を判定して処理を分岐

---

## 5. ファイル名サニタイズ

### Decision

027 のベストプラクティスを継承: 制御文字・Windows 禁止文字 (`\ / : * ? " < > |`) を除去し、空の場合は `generated_file_{timestamp}.{ext}` をフォールバック。

### Rationale

- 027 で既に定義済み。S3 オブジェクトキーに安全なファイル名を使用

---

## 6. エラーハンドリング

### Decision

| シナリオ | 対応 |
|----------|------|
| S3 アップロード失敗 | ユーザーにエラーメッセージ。text  portion は投稿継続 |
| 署名付き URL 取得失敗 | 同上 |
| Slack Poster が URL 取得失敗 | 既存の `FILE_POST_ERROR_MESSAGE` を投稿 |
| 署名付き URL 期限切れ | 403。Poster がエラーハンドリングしてユーザーに通知 |

### Rationale

- 既存の 027 エラーハンドリングパターンに準拠
