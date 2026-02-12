# Data Model: A2A ファイルを Execution Zone で生成し Slack に返す

**Branch**: `014-a2a-file-to-slack` | **Date**: 2026-02-08

---

## 1. 追加・変更エンティティ

### 1.1 Generated File（生成ファイル）

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| content_base64 | string | ✅ | ファイル内容の Base64 エンコード |
| file_name | string | ✅ | ダウンロード時のファイル名（例: `export.csv`） |
| mime_type | string | ✅ | MIME タイプ（例: `text/csv`, `application/json`） |
| size_bytes | integer | - | デコード後のサイズ（検証・ログ用） |

**制約**:
- デコード後サイズ ≤ 最大ファイルサイズ（例: 5 MB）
- mime_type ∈ 許可リスト（例: text/csv, application/json, text/plain）

---

### 1.2 A2A Response Artifact: generated_file（拡張）

Execution Agent が返す A2A `result.artifacts` に、既存の `execution_response` に加えて次の artifact を追加可能とする。

| フィールド | 型 | 説明 |
|-----------|------|------|
| artifactId | string | 一意 ID（UUID v4） |
| name | string | `"generated_file"`（固定または契約で定義） |
| parts | array | Part オブジェクト 1 つ |
| parts[0].kind | string | `"file"` |
| parts[0].contentBase64 | string | ファイル内容の Base64（またはプロトコルで定まるキー名） |
| parts[0].fileName | string | ファイル名 |
| parts[0].mimeType | string | MIME タイプ |

*注: A2A の file part の正式なスキーマは AgentCore / strands-agents の仕様に合わせる。上記は論理モデル。*

---

### 1.3 ExecutionResponse の拡張（テキスト artifact 側）

既存の ExecutionResponse（`execution_response` artifact の text 部分）はそのまま維持。ファイル有無は **別 artifact の有無** で判断する。ExecutionResponse に `has_file_artifact: true` のようなフラグを追加する案は、契約を変えずに「artifact が 2 つ来たら 2 つ目がファイル」と決めるので不要とする。

---

### 1.4 Verification 側: ファイル投稿入力

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| channel | string | ✅ | 投稿先チャンネル ID |
| thread_ts | string | - | スレッド返信用 ts |
| file_bytes | bytes | ✅ | ファイル内容（デコード済み） |
| file_name | string | ✅ | ファイル名 |
| mime_type | string | ✅ | MIME タイプ |
| bot_token | string | ✅ | Slack Bot Token |

---

## 2. エンティティ関係（014 の追加分）

```
Execution Agent                    Verification Agent
      │                                    │
      │ result.artifacts:                  │
      │  [0] execution_response (text)     │
      │  [1] generated_file (file)         │
      │         │                           │
      │         └──────────────────────────▶│ parse file artifact
      │                                     │ → post_file_to_slack(...)
      │                                     │ → Slack API (getUploadURLExternal
      │                                     │   + POST body + completeUploadExternal)
      │                                     ▼
      │                              Slack Thread
      │                              (text + file)
```

---

## 3. 状態・バリデーション

- **ファイルサイズ超過**: Execution で生成後、サイズチェックで弾く。Verification でも artifact 受信時にチェック可能。どちらでも「ユーザーにテキストで説明」を返す。
- **許可外 MIME**: Execution で生成前に許可リストチェック。許可外ならファイルを付けずテキストのみ返す。
- **Slack アップロード失敗**: Verification で例外をキャッチし、スレッドに「ファイルの投稿に失敗しました」等のテキストを投稿（FR-007）。

---

## 4. 既存エンティティ（変更なし）

- 013 で定義した A2A Task Payload、ExecutionResponse（テキスト部分）、Agent Card、Session 等は変更しない。ExecutionResponse の `response_text` は従来どおり。ファイルは **別 artifact** で運ぶ。
