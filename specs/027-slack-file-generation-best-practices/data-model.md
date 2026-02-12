# Data Model: Slack ファイル生成（ベストプラクティス適用）

**Feature Branch**: `027-slack-file-generation-best-practices`
**Date**: 2026-02-11

## 継承元

- [025-slack-file-generation/data-model.md](../025-slack-file-generation/data-model.md) の全エンティティを継承

## 027 追加・拡張エンティティ

### BestPracticeVerification（新規）

| Field | Type | Description |
|-------|------|--------------|
| 項目 | string | 検証対象のベストプラクティス項目名 |
| 対象レイヤー | string | Bedrock / Strands / AgentCore / CDK / ファイル生成 |
| 検証方法 | string | 確認手順（コードレビュー、単体テスト、構成確認等） |
| 合格基準 | string | 検証をパスする条件 |
| 充足状況 | enum | pass / fail / n_a |

**用途**: デプロイ前または PR レビュー時に参照。research.md および checklists/ に記録。

### FileConfig 拡張（ファイルサイズ制限）

025 の file_config に以下を追加：

| 設定 | 値 | 説明 |
|------|-----|------|
| MAX_FILE_SIZE_BYTES | 10_485_760 | 10 MB。Slack 制限準拠 |
| MAX_TEXT_FILE_BYTES | 1_048_576 | 1 MB（テキストベース） |
| MAX_OFFICE_FILE_BYTES | 10_485_760 | 10 MB（オフィス） |
| MAX_IMAGE_FILE_BYTES | 5_242_880 | 5 MB（画像） |

### ファイル名サニタイズルール

| 入力 | 出力 |
|------|------|
| 制御文字 (0x00–0x1F) | 除去 |
| `\ / : * ? " < > \|` | アンダースコア `_` に置換 |
| 先頭・末尾の空白、ドット | 除去 |
| 空ファイル名 | `generated_file_{timestamp}.{ext}` |

## 既存エンティティ（025 継承）

### GeneratedFile

変更なし。025 の定義をそのまま使用。

### ExecutionResponse / FileArtifact

変更なし。025 の定義をそのまま使用。

### ツール入力スキーマ

025 の tool-definitions.yaml を継承。各ツールに docstring とパラメータ説明を日本語で明確化（026 Strands BP）。

## State Transitions

025 と同じ。変更なし。

```
[User Request]
    ↓
[strands Agent — no file generated yet]
    ↓ (model decides to call tool)
[Tool Execution — GeneratedFile created in invocation_state]
    ↓ (tool returns text description to model)
[strands Agent — model writes response_text]
    ↓ (agent loop ends)
[Handler — extracts GeneratedFile, validates size, builds file_artifact]
    ↓
[ExecutionResponse with file_artifact]
    ↓ (Verification Agent → SQS → Slack Poster)
[File uploaded to Slack]
```

**027 追加**: Handler 段階でファイルサイズチェック。超過時は file_artifact を送らず、エラーメッセージを response_text に含める。
