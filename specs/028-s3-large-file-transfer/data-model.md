# Data Model: S3-backed Large File Artifact (028)

**Branch**: `028-s3-large-file-transfer` | **Date**: 2026-02-11

---

## 1. 追加・変更エンティティ

### 1.1 File Artifact（拡張）

既存の `file_artifact` は **二形式** をサポートする。

| 形式 | フィールド | 説明 |
|------|-----------|------|
| インライン | `contentBase64`, `fileName`, `mimeType` | サイズ ≤ 200 KB。既存形式 |
| S3 経由 | `s3PresignedUrl`, `fileName`, `mimeType` | サイズ > 200 KB。署名付き GET URL のみ |

**制約**:
- `contentBase64` と `s3PresignedUrl` は排他（一方のみ存在）
- `fileName`, `mimeType` は両形式で必須
- インライン形式: デコード後サイズ ≤ 200 KB
- S3 形式: URL 有効期限 15 分、S3 オブジェクトは 1 日でライフサイクル削除

---

### 1.2 S3 Object Key

| フィールド | 値 | 説明 |
|-----------|-----|------|
| プレフィックス | `generated_files/` | Execution → Slack 向け（`attachments/` は Verification → Execution 向け） |
| キー形式 | `generated_files/{correlation_id}/{sanitized_file_name}` | 一意性とトレースのため correlation_id を含む |

---

### 1.3 サイズ閾値

| 定数 | 値 | 単位 | 説明 |
|------|-----|------|------|
| SQS_FILE_ARTIFACT_SIZE_THRESHOLD | 200 | KB | この値を超えると S3 経由に切り替え |

---

## 2. エンティティ関係

```
Execution Agent
      │
      │ result.artifacts: generated_file (file part)
      │
      ▼
Verification Agent (pipeline)
      │
      │ parse_file_artifact → (file_bytes, file_name, mime_type)
      │
      ├─ size ≤ 200 KB ──→ build_file_artifact(contentBase64) ──→ SQS
      │
      └─ size > 200 KB ──→ upload_generated_file_to_s3()
                          │
                          └─→ generate_presigned_url_for_generated_file()
                              │
                              └─→ build_file_artifact(s3PresignedUrl) ──→ SQS
                                                                              │
                                                                              ▼
                                                                    Slack Poster Lambda
                                                                              │
                                                                              ├─ contentBase64? → base64 decode → files.upload_v2
                                                                              │
                                                                              └─ s3PresignedUrl? → HTTP GET → files.upload_v2
```

---

## 3. 状態・バリデーション

| 状態 | 条件 | アクション |
|------|------|-----------|
| 小ファイル | サイズ ≤ 200 KB | インライン形式で SQS 送信 |
| 大ファイル | サイズ > 200 KB | S3 アップロード → 署名付き URL で SQS 送信 |
| 境界 | サイズ = 200 KB | インライン形式（≤ で判定） |
| S3 アップロード失敗 | PutObject 例外 | 例外伝播。ユーザーにエラーメッセージ |
| 署名付き URL 取得失敗 | generate_presigned_url 例外 | 同上 |

---

## 4. 既存エンティティ（変更なし）

- A2A `file_artifact` (parts[0].contentBase64 等): Execution Agent からの返却形式は変更なし
- `attachments/` プレフィックス: Verification → Execution 向けの添付用。本機能では使用しない
- `file_artifact` の既存インライン形式: そのまま動作
